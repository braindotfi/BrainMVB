import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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
/** When true, POST /tenants answers with core's already-linked conflict (invariant J). */
let tenantAlreadyLinked = false;
/** Tenant id POST /sessions attributes its token to; null omits `member` entirely. */
let sessionTenantId: string | null = TENANT_ID;

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
    /* Verbatim shape captured from staging on 2026-08-05. The tenant id lives in
       details.tenant_id — the whole point of the recovery path. */
    if (tenantAlreadyLinked) {
      return json({
        error: {
          code: "tenant_identity_already_linked",
          message: "platform identity is already linked to a tenant",
          request_id: "req_test_already_linked",
          docs_url: "https://docs.brain.fi/resources/errors#tenant_identity_already_linked",
          details: { tenant_id: TENANT_ID },
        },
      }, 409);
    }
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
      ...(sessionTenantId === null
        ? {}
        : { member: { id: "m1", tenantId: sessionTenantId, email: "u@co.com", displayName: "User", role: "admin" } }),
    });
  }
  if (url.endsWith("/sessions/refresh") && method === "POST") {
    return json({ token: MEMBER_TOKEN, refresh_token: "rt_3", expires_in: 900 });
  }
  if (url.endsWith("/invites/consume") && method === "POST") {
    return json({
      tenant_id: TENANT_ID,
      member: { id: "m_invited", tenantId: TENANT_ID, email: "invitee@realco.com", displayName: "Invitee", role: "admin" },
      session: { token: MEMBER_TOKEN, refresh_token: "rt_invited", expires_in: 900 },
    });
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
    if (
      !url.startsWith("https://api.brain.fi") &&
      !url.startsWith("https://staging-api.brain.fi")
    ) {
      return realFetch(input as never, init);
    }
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
  app.use((req, res, next) => {
    (req as unknown as { session: { userId: string; sessionVersion: number } }).session = {
      userId: sessionUserId,
      sessionVersion: 1,
    };
    res.locals.authenticatedUser = { id: sessionUserId, sessionVersion: 1 };
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
  tenantAlreadyLinked = false;
  sessionTenantId = TENANT_ID;
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

  it("A+E: first DEMO use creates ONE seeded production tenant with a durable mapping", async () => {
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
    // Durable mode deliberately treats demo users as production tenants so the
    // returned member JWT is accepted by the production ledger API on every call.
    expect(identity).toMatchObject({ userId, externalRef: userId, tenantId: TENANT_ID });

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

  it("B+C+E: later REAL sessions re-attach via /sessions - never /tenants, never re-seed", async () => {
    const real = await storage.createUser({
      username: "durable-reconnect@realco.com",
      email: "durable-reconnect@realco.com",
      password: "x.x",
      name: "Durable Reconnect",
    });
    const userId = real.id;
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

  it("uses a brain base URL context when consuming an invite", async () => {
    const user = await storage.createUser({
      username: "invited-user@realco.com",
      email: "invitee@realco.com",
      password: "x.x",
      name: "Invitee",
    });
    sessionUserId = user.id;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const res = await realFetch(`${signupBaseUrl}/api/brain/invites/consume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invite_token: "invite_test_token" }),
      });
      expect(res.status).toBe(200);
      expect(calls.filter((c) => c.url.endsWith("/invites/consume"))).toHaveLength(1);
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("no withBrainBaseUrl context"));
    } finally {
      warn.mockRestore();
    }
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

  it('I: /tenancy reports the real persistent tenant as "durable", never "demo"', async () => {
    const userId = "durable-user-tenancy";
    sessionUserId = userId;

    // Pre-first-use: the durable tenant is created lazily, so nothing is linked yet.
    const before = await realFetch(`${signupBaseUrl}/api/brain/tenancy`);
    expect(before.status).toBe(200);
    expect(await before.json()).toMatchObject({ mode: "durable", linked: false });

    await getBrainSession(userId);

    const after = await realFetch(`${signupBaseUrl}/api/brain/tenancy`);
    const body = (await after.json()) as { mode: string; linked: boolean; tenantId?: string };
    // A durable tenant is a genuine brain-core PRODUCTION tenant (kind=production,
    // sandbox=false) that persists indefinitely. Reporting "demo" told the client
    // its data was throwaway per-session scratch — the opposite of the truth.
    expect(body.mode).toBe("durable");
    expect(body.linked).toBe(true);
    expect(body.tenantId).toBe(TENANT_ID);
  });

  /* ── J: durable demo sessions survive losing the session cache ─────────────── */
  it("J: a demo user whose cache was cleared re-attaches instead of re-creating", async () => {
    const userId = await createDemoAppUser();
    await getBrainSession(userId);
    expect(await whenSeedsSettle(10_000)).toBe(true);

    // Second session creation: exactly what a server restart produces.
    clearBrainTokenCache();
    calls = [];

    const session = await getBrainSession(userId);
    expect(session.tenantId).toBe(TENANT_ID);
    expect(session.token).toBe(MEMBER_TOKEN);
    // A real agent principal is re-minted, so raw:write still works after adoption.
    expect(session.agentToken).toBe(AGENT_TOKEN);

    // Recovery goes through /sessions on the founder's external_ref.
    const sessionCalls = calls.filter((c) => c.url.endsWith("/sessions") && c.method === "POST");
    expect(sessionCalls.length).toBe(1);
    expect((sessionCalls[0].body as { external_ref?: string }).external_ref).toBe(userId);
    expect(sessionCalls[0].svcAuth).toBe(SERVICE_SECRET);

    // The durable identity makes tenant creation unnecessary after a cache loss.
    expect(calls.filter((c) => c.url.endsWith("/tenants") && c.method === "POST").length).toBe(0);
  });

  it("J: adopting an existing tenant never re-seeds its documents", async () => {
    // /raw/ingest is not idempotent, so re-seeding on every cache miss would
    // duplicate every fixture document in the tenant.
    const userId = await createDemoAppUser();
    await getBrainSession(userId);
    expect(await whenSeedsSettle(10_000)).toBe(true);

    clearBrainTokenCache();
    calls = [];
    tenantAlreadyLinked = true;

    await getBrainSession(userId);
    expect(await whenSeedsSettle(10_000)).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/raw/ingest")).length).toBe(0);
  });

  it("J: refuses a durable session when core names a different tenant", async () => {
    /* The conflict payload and the issued session are two independent statements
       about which tenant this external_ref owns. If they disagree, caching either
       one attributes a live member token — and a freshly minted agent token — to a
       tenant that may not own it. That is a cross-tenant leak, not a degraded
       session, so adoption fails closed and mints nothing. */
    const userId = await createDemoAppUser();
    await getBrainSession(userId);
    expect(await whenSeedsSettle(10_000)).toBe(true);

    clearBrainTokenCache();
    calls = [];
    sessionTenantId = "tnt_someone_else"; // session says otherwise

    await expect(getBrainSession(userId)).rejects.toThrow(/cross-tenant session/i);
    expect(calls.filter((c) => c.url.endsWith("/agent-token")).length).toBe(0);
  });

  it("J: adopts on the conflict's tenant id when the session omits member", async () => {
    // Both answers describe the same external_ref in the same exchange, so the
    // conflict id is authoritative when core doesn't repeat it on the session.
    const userId = await createDemoAppUser();
    await getBrainSession(userId);
    expect(await whenSeedsSettle(10_000)).toBe(true);

    clearBrainTokenCache();
    calls = [];
    tenantAlreadyLinked = true;
    sessionTenantId = null; // no `member` in the session response

    const session = await getBrainSession(userId);
    expect(session.tenantId).toBe(TENANT_ID);
    expect(session.agentToken).toBe(AGENT_TOKEN);
  });

  it("J: a tenant-creation failure that is NOT the already-linked conflict still fails", async () => {
    // The recovery path is keyed on one specific code. A 500, or any other 409,
    // must not be quietly swallowed into an adoption attempt.
    const userId = await createDemoAppUser();
    failTenantCreation = true;
    await expect(getBrainSession(userId)).rejects.toThrow();
    expect(calls.filter((c) => c.url.endsWith("/sessions") && c.method === "POST").length).toBe(0);
  });

  it("I: durable mode never triggers the production company-setup gate", async () => {
    // The gate keys on mode === "production" alone (App.tsx TenancyGate), so
    // renaming demo→durable must not start gating durable users behind
    // "Create a company". Guard the exact predicate the client uses.
    sessionUserId = "durable-user-gate";
    const res = await realFetch(`${signupBaseUrl}/api/brain/tenancy`);
    const body = (await res.json()) as { mode: string; linked: boolean };
    expect(body.mode).not.toBe("production");
  });
});
