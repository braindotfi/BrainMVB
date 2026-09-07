import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MemStorage } from "../storage";
import { brainConfig } from "./config";
import { processExpiredDemoTenantDeletions, retryDemoTenantDeletion } from "./demoTenantDeletion";
import type { User } from "@shared/schema";

const oldEnv = { ...process.env };
const oldBaseUrl = brainConfig.baseUrl;
const oldDemoBaseUrl = brainConfig.demoBaseUrl;
async function candidate(mem: MemStorage, suffix = "deadbeef", brainBaseUrl?: string) {
  const email = `demo-fresh-${suffix}@brain.fi`;
  const user = await mem.createUser({ username: email, email, password: null });
  ((mem as unknown as { users: Map<string, User> }).users).set(user.id, { ...user, createdAt: new Date(Date.now() - 26 * 60 * 60_000) });
  await mem.upsertDemoTenantLifecycle(user.id, "tnt_test", brainBaseUrl);
  return user;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("demo tenant deletion lifecycle", () => {
  beforeEach(() => {
    process.env.BRAIN_TENANT_DELETE_ENABLED = "true";
    process.env.BRAIN_TENANT_DELETE_JWT = "test-only-admin-token";
    delete process.env.BRAIN_TENANT_DELETE_DRY_RUN;
    brainConfig.baseUrl = "https://production.example/v1";
    brainConfig.demoBaseUrl = "https://staging.example/v1";
  });
  afterEach(() => {
    process.env = { ...oldEnv };
    brainConfig.baseUrl = oldBaseUrl;
    brainConfig.demoBaseUrl = oldDemoBaseUrl;
    vi.unstubAllGlobals();
  });

  it("sends legacy durable tenant deletion to baseUrl and never demoBaseUrl", async () => {
    const mem = new MemStorage(); await candidate(mem);
    const fetch = vi.fn().mockResolvedValue(json({ job_id: "job_prod" }));
    vi.stubGlobal("fetch", fetch);

    await processExpiredDemoTenantDeletions(mem, new Date());

    expect(fetch).toHaveBeenCalledWith(
      "https://production.example/v1/admin/tenants/tnt_test/delete",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch.mock.calls[0][0]).not.toContain("staging.example");
  });

  it("uses stored staging authority only for a tenant created there", async () => {
    const mem = new MemStorage();
    await candidate(mem, "deadbeef", "https://staging.example/v1");
    const fetch = vi.fn().mockResolvedValue(json({ job_id: "job_staging" }));
    vi.stubGlobal("fetch", fetch);

    await processExpiredDemoTenantDeletions(mem, new Date());

    expect(fetch.mock.calls[0][0]).toBe(
      "https://staging.example/v1/admin/tenants/tnt_test/delete",
    );
  });

  it("cleans local data only after a completed remote job", async () => {
    const mem = new MemStorage(); const user = await candidate(mem);
    const fetch = vi.fn().mockResolvedValueOnce(json({ job_id: "job_1" })).mockResolvedValueOnce(json({ status: "completed" }));
    vi.stubGlobal("fetch", fetch);
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect(await mem.getUser(user.id)).toBeDefined();
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect(await mem.getUser(user.id)).toBeUndefined();
  });

  it("records failures, skips forbidden tenants, and does not repost within a day", async () => {
    const mem = new MemStorage(); const user = await candidate(mem);
    const fetch = vi.fn().mockResolvedValueOnce(json({ job_id: "job_1" })).mockResolvedValueOnce(json({ status: "failed", error: "nope" }));
    vi.stubGlobal("fetch", fetch);
    await processExpiredDemoTenantDeletions(mem, new Date());
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect((await mem.listBrainTenantDeletionNeedsAttention()).length).toBe(1);
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect(fetch).toHaveBeenCalledTimes(2);

    const forbidden = new MemStorage(); const forbiddenUser = await candidate(forbidden);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "forbidden" }, 403)));
    await processExpiredDemoTenantDeletions(forbidden, new Date());
    expect(await forbidden.listBrainTenantDeletionNeedsAttention()).toHaveLength(0);
    expect((await forbidden.getDemoTenantLifecycle(forbiddenUser.id))?.deletionStatus).toBe("protected_skipped");
  });

  it("treats only a machine-readable tenant_not_found 404 as remote_already_absent", async () => {
    const mem = new MemStorage(); const user = await candidate(mem);
    const fetch = vi.fn().mockResolvedValue(
      json({ error: { code: "tenant_not_found", message: "tenant not found" } }, 404),
    );
    vi.stubGlobal("fetch", fetch);

    await processExpiredDemoTenantDeletions(mem, new Date());

    expect(await mem.getUser(user.id)).toBeUndefined();
    const lifecycle = await mem.getDemoTenantLifecycle(user.id);
    expect(lifecycle).toMatchObject({
      deletionStatus: "deleted",
      deletionOutcome: "remote_already_absent",
      deletionJobId: null,
      deletionError: null,
    });
  });

  it("keeps a prose-only tenant-not-found 404 in needs_attention", async () => {
    const mem = new MemStorage(); const user = await candidate(mem);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      json({ message: "tenant not found" }, 404),
    ));

    await processExpiredDemoTenantDeletions(mem, new Date());

    expect(await mem.getUser(user.id)).toBeDefined();
    expect(await mem.getDemoTenantLifecycle(user.id)).toMatchObject({
      deletionStatus: "needs_attention",
      deletionOutcome: null,
      deletionJobId: null,
      deletionError: "tenant not found",
    });
  });

  it("retries needs_attention immediately without waiting for the daily window", async () => {
    const mem = new MemStorage(); const user = await candidate(mem);
    await mem.updateDemoTenantLifecycle(user.id, {
      deletionStatus: "needs_attention",
      deletionError: "old failure",
      deletionAttemptedAt: new Date(),
    });
    const fetch = vi.fn().mockResolvedValue(json({ job_id: "job_retry" }));
    vi.stubGlobal("fetch", fetch);

    const lifecycle = await retryDemoTenantDeletion(mem, "tnt_test");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lifecycle).toMatchObject({
      deletionStatus: "queued",
      deletionJobId: "job_retry",
      deletionError: null,
    });
  });

  it("marks a job older than fifteen minutes as needing attention without polling", async () => {
    const mem = new MemStorage(); const user = await candidate(mem);
    await mem.updateDemoTenantLifecycle(user.id, { deletionStatus: "deleting", deletionJobId: "job_old", deletionStartedAt: new Date(Date.now() - 16 * 60_000) });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect(fetch).not.toHaveBeenCalled();
    expect((await mem.listBrainTenantDeletionNeedsAttention()).length).toBe(1);
  });

  it("does not call Brain when disabled or in dry-run mode", async () => {
    const mem = new MemStorage(); await candidate(mem);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    process.env.BRAIN_TENANT_DELETE_ENABLED = "false";
    await processExpiredDemoTenantDeletions(mem, new Date());
    process.env.BRAIN_TENANT_DELETE_ENABLED = "true";
    process.env.BRAIN_TENANT_DELETE_DRY_RUN = "true";
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not duplicate a POST when repeated processing receives the same job", async () => {
    const mem = new MemStorage(); await candidate(mem);
    const fetch = vi.fn().mockResolvedValueOnce(json({ job_id: "job_idempotent" })).mockResolvedValueOnce(json({ status: "fencing" }));
    vi.stubGlobal("fetch", fetch);
    await processExpiredDemoTenantDeletions(mem, new Date());
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain("/tenants/tnt_test/delete");
    expect(fetch.mock.calls[1][0]).toContain("/tenant-deletions/job_idempotent");
    expect((await mem.getDemoTenantLifecycle((await mem.getUserByEmail("demo-fresh-deadbeef@brain.fi"))!.id))?.deletionStatus).toBe("fencing");
  });

  it("accepts an idempotent repeated POST job id after the daily retry window", async () => {
    const mem = new MemStorage(); const user = await candidate(mem);
    const fetch = vi.fn().mockResolvedValue(json({ job_id: "job_same" }));
    vi.stubGlobal("fetch", fetch);
    await processExpiredDemoTenantDeletions(mem, new Date());
    await mem.updateDemoTenantLifecycle(user.id, {
      deletionStatus: "needs_attention", deletionJobId: null,
      deletionAttemptedAt: new Date(Date.now() - 25 * 60 * 60_000),
    });
    await processExpiredDemoTenantDeletions(mem, new Date());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("atomically allows only one worker to claim a tenant start", async () => {
    const mem = new MemStorage();
    const user = await candidate(mem);
    const now = new Date();
    const claims = await Promise.all([
      mem.claimDemoTenantDeletionAttempt(user.id, now),
      mem.claimDemoTenantDeletionAttempt(user.id, now),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("caps shared deletion starts at ten per minute", async () => {
    const mem = new MemStorage();
    const users = await Promise.all(
      Array.from({ length: 11 }, (_, index) => candidate(mem, index.toString(16).padStart(8, "0"))),
    );
    const now = new Date();
    const claims = [];
    for (const user of users) claims.push(await mem.claimDemoTenantDeletionAttempt(user.id, now));
    expect(claims.filter(Boolean)).toHaveLength(10);
  });
});