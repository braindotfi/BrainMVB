import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * Durable tenancy invariants (BRAIN_TENANCY_MODE=durable).
 *
 *   A. FIRST use with no brain_identities row → exactly ONE POST /tenants (auto-create),
 *      the mapping is persisted, and the returned session is used.
 *   B. LATER sessions (cache cleared, identity present) re-attach via POST /sessions
 *      with the SAME external_ref - /tenants is NEVER called again for that user.
 *   C. The demo fence is never touched: no call to /demo/provision-run in durable mode.
 *   D. Tenant creation failure is NOT retried within the same call and no identity row
 *      is written, so nothing pretends a tenant exists.
 *   E. The one-time starter seed ingests the bundled documents into the new tenant
 *      (POST /raw/ingest with the raw:write-capable AGENT token) and never runs for
 *      an existing tenant.
 *   F. The seed runs ONLY for demo accounts (demo@brain.fi / demo-fresh-*): a real
 *      signup's tenant is created with ZERO raw-layer ingestion - genuinely empty.
 */

const SERVICE_SECRET = "test-platform-service-secret-DO-NOT-LEAK";
const MEMBER_TOKEN = "DUR_MEMBER_TOKEN_do_not_leak";
const AGENT_TOKEN = "DUR_AGENT_TOKEN_do_not_leak";
const TENANT_ID = "tnt_test_durable_01";

// Config reads env at module-eval, so set it BEFORE the dynamic imports below.
process.env.BRAIN_TENANCY_MODE = "durable";
process.env.BRAIN_PLATFORM_SERVICE_SECRET = SERVICE_SECRET;
process.env.BRAIN_API_BASE_URL = "https://api.brain.fi/v1";
process.env.BRAIN_DEMO_PROVISION_SECRET = "present-but-must-not-be-used";
delete process.env.BRAIN_AUTH_SIGN_KEY;
delete process.env.BRAIN_AUTH_JWT_SECRET;
// Force MemStorage - this suite must never touch a real database.
delete process.env.DATABASE_URL;

interface RecordedCall {
  url: string;
  method: string;
  auth?: string;
  svcAuth?: string;
  body?: unknown;
}

let calls: RecordedCall[] = [];
const realFetch = globalThis.fetch;
let failTenantCreation = false;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function routeBrainCore(fullUrl: string, method: string): Response {
  const url = fullUrl.split("?")[0];
  if (url.endsWith("/demo/provision-run")) {
    throw new Error("INVARIANT VIOLATION: durable mode must never call /demo/provision-run");
  }
  if (url.endsWith("/tenants") && method === "POST") {
    if (failTenantCreation) return json({ error: { code: "internal_server_error" } }, 500);
    return json({
      tenant_id: TENANT_ID,
      member: { id: "m1", tenantId: TENANT_ID, email: "u@co.com", displayName: "User", role: "admin" },
      session: { token: MEMBER_TOKEN, refresh_token: "rt_1", expires_in: 900 },
      agent: { id: "agt_1", token: AGENT_TOKEN, expires_in: 900 },
    }, 201);
  }
  if (url.endsWith(`/tenants/${TENANT_ID}/agent-token`) && method === "POST") {
    return json({ id: "agt_1", token: AGENT_TOKEN, expires_in: 900 });
  }
  if (url.endsWith("/sessions") && method === "POST") {
    return json({
      token: MEMBER_TOKEN,
      refresh_token: "rt_2",
      expires_in: 900,
      member: { id: "m1", tenantId: TENANT_ID, email: "u@co.com", displayName: "User", role: "admin" },
    });
  }
  if (url.endsWith("/sessions/refresh") && method === "POST") {
    return json({ token: MEMBER_TOKEN, refresh_token: "rt_3", expires_in: 900 });
  }
  if (url.endsWith("/raw/ingest") && method === "POST") {
    return json({ raw_id: `raw_${calls.filter((c) => c.url.endsWith("/raw/ingest")).length}`, sha256: "deadbeef", deduplicated: false });
  }
  if (/\/raw\/[^/]+\/extract$/.test(url) && method === "POST") {
    // brain-core's real shape is a JOB envelope; only status:"succeeded" carries a
    // final parsed_id. The seed polls until terminal, so answer terminal immediately.
    return json({ job_id: "rexj_1", status: "succeeded", parsed_id: "parsed_1", confidence: 0.4, error: null });
  }
  return json({ error: { code: "not_found" } }, 404);
}

let getBrainSession: typeof import("./auth").getBrainSession;
let clearBrainTokenCache: typeof import("./auth").clearBrainTokenCache;
let storage: typeof import("../storage").storage;

beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.brain.fi")) return realFetch(input as never, init);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    let body: unknown;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    } else if (init?.body instanceof FormData) {
      // Record multipart fields (file blobs recorded by name only) so tests can
      // assert on form fields like source_schema.
      const fields: Record<string, unknown> = {};
      for (const [k, v] of init.body.entries()) fields[k] = typeof v === "string" ? v : `<file:${(v as File).name}>`;
      body = fields;
    }
    calls.push({
      url,
      method,
      auth: headers.get("authorization") ?? undefined,
      svcAuth: headers.get("x-platform-service-auth") ?? undefined,
      body,
    });
    return routeBrainCore(url, method);
  }) as typeof fetch;

  ({ getBrainSession, clearBrainTokenCache } = await import("./auth"));
  ({ storage } = await import("../storage"));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  calls = [];
  failTenantCreation = false;
  clearBrainTokenCache();
});

/** Wait for the fire-and-forget seed to finish (bounded). */
async function waitForSeed(expectedIngests: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (calls.filter((c) => c.url.endsWith("/raw/ingest")).length >= expectedIngests) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("durable tenancy invariants", () => {
  /** The starter seed is gated on the app user's email being a demo address. */
  async function createDemoAppUser(): Promise<string> {
    const u = await storage.createUser({
      username: `demo-fresh-${crypto.randomUUID().slice(0, 8)}@brain.fi`,
      email: `demo-fresh-${crypto.randomUUID().slice(0, 8)}@brain.fi`,
      password: null,
      name: "Demo Business",
    });
    return u.id;
  }

  it("A+E: first DEMO use auto-creates ONE tenant, persists the mapping, and seeds documents once", async () => {
    const userId = await createDemoAppUser();
    const session = await getBrainSession(userId);
    expect(session.tenantId).toBe(TENANT_ID);
    expect(session.token).toBe(MEMBER_TOKEN);
    expect(session.agentToken).toBe(AGENT_TOKEN);

    const tenantCalls = calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST");
    expect(tenantCalls.length).toBe(1);
    expect(tenantCalls[0].svcAuth).toBe(SERVICE_SECRET);
    expect((tenantCalls[0].body as { founder_external_ref?: string }).founder_external_ref).toBe(userId);

    const identity = await storage.getBrainIdentity(userId);
    expect(identity?.tenantId).toBe(TENANT_ID);
    expect(identity?.externalRef).toBe(userId);

    // The one-time seed streams the three bundled documents with the AGENT token -
    // the durable member token lacks the raw:write scope (verified live 2026-07-24).
    await waitForSeed(3);
    const ingests = calls.filter((c) => c.url.endsWith("/raw/ingest"));
    expect(ingests.length).toBe(3);
    for (const call of ingests) {
      expect(call.auth).toBe(`Bearer ${AGENT_TOKEN}`);
      // source_schema must be sent explicitly - without it artifacts land with
      // source_schema NULL upstream and the interpret worker never matches them.
      expect((call.body as Record<string, unknown>).source_schema).toBe("brain.upload.document.v1");
    }
    const docs = await storage.listSourceDocuments(userId);
    expect(docs.length).toBe(3);
    // The seed must wait for the extraction JOB to settle before claiming "extracted" -
    // recording the first 202/"queued" response left parsedId null forever.
    for (const d of docs) {
      expect(d.extractStatus).toBe("extracted");
      expect(d.parsedId).toBe("parsed_1");
      expect(d.confidence).toBe("0.4");
    }
  });

  it("B+C+E: later sessions re-attach via /sessions - never /tenants, never the demo fence, never re-seed", async () => {
    const userId = await createDemoAppUser();
    await getBrainSession(userId);
    await waitForSeed(3);
    clearBrainTokenCache(); // simulate restart/redeploy: cache gone, identity row remains
    calls = [];

    const session = await getBrainSession(userId);
    expect(session.tenantId).toBe(TENANT_ID);

    expect(calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST").length).toBe(0);
    expect(calls.filter((c) => c.url.endsWith("/demo/provision-run")).length).toBe(0);
    const sessionCalls = calls.filter((c) => c.url.endsWith("/sessions") && c.method === "POST");
    expect(sessionCalls.length).toBe(1);
    expect((sessionCalls[0].body as { external_ref?: string }).external_ref).toBe(userId);

    // No re-seed for an existing tenant.
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.filter((c) => c.url.endsWith("/raw/ingest")).length).toBe(0);
  });

  it("F: a REAL (non-demo) user's tenant is created with ZERO seed ingestion", async () => {
    const real = await storage.createUser({
      username: "founder@realco.com",
      email: "founder@realco.com",
      password: "x.x",
      name: "Real Founder",
    });
    const session = await getBrainSession(real.id);
    expect(session.tenantId).toBe(TENANT_ID);

    // Tenant IS created for the real user...
    expect(calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST").length).toBe(1);
    // ...but the raw layer stays untouched: no seed, no documents, genuinely empty.
    await new Promise((r) => setTimeout(r, 150));
    expect(calls.filter((c) => c.url.endsWith("/raw/ingest")).length).toBe(0);
    expect((await storage.listSourceDocuments(real.id)).length).toBe(0);
  });

  it("D: a failed tenant creation rolls the tombstone back and is not auto-retried in-call", async () => {
    const userId = "durable-user-d";
    failTenantCreation = true;
    await expect(getBrainSession(userId)).rejects.toThrow();
    expect(calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST").length).toBe(1);
    // Create provably failed upstream → tombstone rolled back, so a LATER login may retry.
    expect(await storage.getBrainIdentity(userId)).toBeUndefined();
  });

  it("F: a leftover pending tombstone (crash between create and finalize) BLOCKS re-creation", async () => {
    const userId = "durable-user-f";
    await storage.createBrainIdentity({
      userId,
      externalRef: userId,
      tenantId: "pending:create",
      memberId: null,
      companyName: "Crashed Co",
    });
    await expect(getBrainSession(userId)).rejects.toThrow(/never\s+finalized|pending tombstone/i);
    // The non-idempotent create must NOT run again.
    expect(calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST").length).toBe(0);
  });
});
