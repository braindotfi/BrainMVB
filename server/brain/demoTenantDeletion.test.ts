import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MemStorage } from "../storage";
import { processExpiredDemoTenantDeletions } from "./demoTenantDeletion";
import type { User } from "@shared/schema";

const oldEnv = { ...process.env };
async function candidate(mem: MemStorage, suffix = "deadbeef") {
  const email = `demo-fresh-${suffix}@brain.fi`;
  const user = await mem.createUser({ username: email, email, password: null });
  ((mem as unknown as { users: Map<string, User> }).users).set(user.id, { ...user, createdAt: new Date(Date.now() - 26 * 60 * 60_000) });
  await mem.upsertDemoTenantLifecycle(user.id, "tnt_test");
  return user;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("demo tenant deletion lifecycle", () => {
  beforeEach(() => {
    process.env.BRAIN_TENANT_DELETE_ENABLED = "true";
    process.env.BRAIN_TENANT_DELETE_JWT = "test-only-admin-token";
    delete process.env.BRAIN_TENANT_DELETE_DRY_RUN;
  });
  afterEach(() => { process.env = { ...oldEnv }; vi.unstubAllGlobals(); });

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