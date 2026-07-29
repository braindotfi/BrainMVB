import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

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
 *   G. The demo flow sends demo_seed: true on POST /tenants (core seeds the tenant while
 *      keeping kind='production'); a real signup omits the key entirely.
 *   H. The EXPLICIT company-signup route never sends demo_seed - not even for an account
 *      whose email happens to be a demo address. Only "Continue with Demo" seeds.
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
      demo_seed: { sources: 6, invoices: 12 },
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
let SEED_MANIFEST: typeof import("./seed").SEED_MANIFEST;
let whenSeedsSettle: typeof import("./seed").whenSeedsSettle;

/** Express harness for the EXPLICIT company-signup route (invariant H). The session user
 *  is mutable so a test can sign in as a freshly created storage user. */
let signupServer: Server;
let signupBaseUrl: string;
let sessionUserId = "durable-signup-user";

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
  ({ SEED_MANIFEST, whenSeedsSettle } = await import("./seed"));

  const { createBrainProxyRouter } = await import("./proxy");
  const app: Express = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: { userId: string } }).session = { userId: sessionUserId };
    next();
  });
  app.use("/api/brain", createBrainProxyRouter());
  await new Promise<void>((resolve) => {
    signupServer = app.listen(0, resolve);
  });
  signupBaseUrl = `http://127.0.0.1:${(signupServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  signupServer?.close();
});

beforeEach(async () => {
  // The seed is fire-and-forget, so a previous test's run can still be issuing
  // /raw/ingest calls. Drain it BEFORE clearing `calls`, or its ingests leak into the
  // next test and invariant F ("real users are never seeded") fails on borrowed calls.
  expect(await whenSeedsSettle(10_000), "a seed run never settled - later assertions would see its ingests").toBe(true);
  calls = [];
  failTenantCreation = false;
  clearBrainTokenCache();
});

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
    // G: the demo flow opts into core's own seedBrainSaasDemo. Without this, the tenant is
    // created but carries none of the fake-connected sources the demo is supposed to show.
    expect((tenantCalls[0].body as { demo_seed?: unknown }).demo_seed).toBe(true);

    const identity = await storage.getBrainIdentity(userId);
    expect(identity?.tenantId).toBe(TENANT_ID);
    expect(identity?.externalRef).toBe(userId);

    // The one-time seed streams every bundled document with the AGENT token -
    // the durable member token lacks the raw:write scope (verified live 2026-07-24).
    await whenSeedsSettle();
    const ingests = calls.filter((c) => c.url.endsWith("/raw/ingest"));
    expect(ingests.length).toBe(SEED_MANIFEST.length);
    for (const call of ingests) {
      expect(call.auth).toBe(`Bearer ${AGENT_TOKEN}`);
      // source_schema must be sent explicitly - without it artifacts land with
      // source_schema NULL upstream and the interpret worker never matches them.
      expect((call.body as Record<string, unknown>).source_schema).toBe("brain.upload.document.v1");
    }
    const docs = await storage.listSourceDocuments(userId);
    expect(docs.length).toBe(SEED_MANIFEST.length);
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
    await whenSeedsSettle();
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
    const realTenantCalls = calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST");
    expect(realTenantCalls.length).toBe(1);
    // ...with NO demo_seed key at all - not `false`. A real signup's request body must stay
    // byte-identical to the pre-flag one, so a core that predates #364 cannot misread it.
    expect((realTenantCalls[0].body as Record<string, unknown>)).not.toHaveProperty("demo_seed");
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

  it("H: the EXPLICIT company-signup route never sends demo_seed - even for a demo-address account", async () => {
    // Deliberately the hostile case: a demo EMAIL going through the real signup surface.
    // Only the "Continue with Demo" path may seed, so the email alone must not be enough.
    const u = await storage.createUser({
      username: `demo-fresh-${crypto.randomUUID().slice(0, 8)}@brain.fi`,
      email: `demo-fresh-${crypto.randomUUID().slice(0, 8)}@brain.fi`,
      password: null,
      name: "Demo Business",
    });
    sessionUserId = u.id;
    calls = [];

    const res = await realFetch(`${signupBaseUrl}/api/brain/tenants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company_name: "Realco Inc." }),
    });
    expect(res.status).toBe(201);

    const tenantCalls = calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST");
    expect(tenantCalls).toHaveLength(1);
    expect(tenantCalls[0].body as Record<string, unknown>).not.toHaveProperty("demo_seed");
    // And it stays a genuinely empty tenant: the signup route never triggers the local seed.
    await new Promise((r) => setTimeout(r, 150));
    expect(calls.filter((c) => c.url.endsWith("/raw/ingest")).length).toBe(0);
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
