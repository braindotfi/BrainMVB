import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

/**
 * BFF safety invariants — the platform-side twins of brain-core's own invariants.
 * Any change to server/brain/* MUST keep this suite green.
 *
 * brain-core is mocked at the HTTP (fetch) boundary; the live API is never hit.
 * We drive the REAL proxy router over a real (localhost) express server so the
 * assertions cover the actual token routing / payload construction, not a stub.
 *
 * Covered:
 *   1. TOKEN ROUTING  — /propose uses the AGENT token and only it; reads,
 *      member writes, and approve/reject use the MEMBER token, never the agent.
 *   2. NO ACTOR FIELD — no BFF-constructed request to core carries an `actor`
 *      (ACTOR = SESSION; core derives it from the token subject).
 *   3. PROVISION FAIL-HARD — a provision-run lacking the member token throws a
 *      clear error and does NOT silently fall back to agent-only.
 *   5. SECRETS BOUNDARY — the provision secret and the brain-core tokens are
 *      never present in any response the BFF returns to the browser.
 *  (Invariant 4, rejection mapping, lives in
 *   client/src/lib/approvalRejections.test.ts.)
 */

// Distinctive, greppable values so the secrets-boundary assertion is unambiguous.
const PROVISION_SECRET = "test-provision-secret-c3-DO-NOT-LEAK";
const MEMBER_TOKEN = "MEMBER_TOKEN_do_not_leak_a1";
const AGENT_TOKEN = "AGENT_TOKEN_do_not_leak_b2";
const SECOND_APPROVER_TOKEN = "SECOND_APPROVER_TOKEN_do_not_leak_c3";
const TENANT_ID = "tenant_test_01";

// Config reads env at module-eval, so set it BEFORE the dynamic imports below.
process.env.BRAIN_DEMO_PROVISION_SECRET = PROVISION_SECRET;
process.env.BRAIN_API_BASE_URL = "https://api.brain.fi/v1";
// Ensure the local-key path can't be selected.
delete process.env.BRAIN_AUTH_SIGN_KEY;
delete process.env.BRAIN_AUTH_JWT_SECRET;

interface RecordedCall {
  url: string;
  method: string;
  auth?: string;
  provAuth?: string;
  body?: unknown;
}

let calls: RecordedCall[] = [];
const realFetch = globalThis.fetch;

// Per-test override of the provision-run response (fail-hard test omits member_token).
let provisionResponse: Record<string, unknown> = {
  tenant_id: TENANT_ID,
  member_token: MEMBER_TOKEN,
  agent_token: AGENT_TOKEN,
  expires_in: 1800,
};

// Per-test control of the /approve endpoint's returned status sequence (indexed by call count),
// so a test can exercise the two-signer chain (awaiting_second_approval then approved). Default is
// a single "pending_approval" so a one-shot approve never triggers the second signature.
let approveStatuses: string[] = ["pending_approval"];
let approveCallCount = 0;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routeBrainCore(fullUrl: string, method: string): Response {
  const url = fullUrl.split("?")[0]; // match on path, ignore query string
  if (url.endsWith("/demo/provision-run")) return json(provisionResponse);
  if (url.endsWith("/ledger/invoices")) {
    return json({
      invoices: [
        {
          id: "inv_1",
          invoice_number: "INV-1",
          counterparty_id: "cp_1",
          amount_due: "100.00",
          currency: "USD",
          status: "open",
        },
      ],
    });
  }
  if (url.includes("/policy/") && url.endsWith("/evaluate")) {
    return json({ outcome: "confirm", matched_rule_id: "r1", required_approvers: [], trace: [] });
  }
  if (url.includes("/payment-intents/") && url.endsWith("/approve")) {
    // Real brain-core returns the PaymentIntent with `status` at the top level (unwrapped),
    // which is what the two-signer auto-chain in proxy.ts reads. Return one status per call so a
    // test can drive awaiting_second_approval -> approved across the two signatures.
    const s = approveStatuses[Math.min(approveCallCount, approveStatuses.length - 1)];
    approveCallCount += 1;
    return json(baseIntent(s));
  }
  if (url.includes("/payment-intents/") && url.endsWith("/reject")) {
    return json({ intent: baseIntent("rejected") });
  }
  if (url.endsWith("/payment-intents") && method === "POST") {
    return json(baseIntent("pending_approval"));
  }
  if (url.endsWith("/members") && method === "GET") {
    return json({ members: [{ id: "m1", email: "a@b.co", displayName: "A", role: "admin", active: true }] });
  }
  if (url.endsWith("/members") && method === "POST") {
    return json({ member: { id: "m2", email: "c@d.co", displayName: "C", role: "approver", active: true } });
  }
  throw new Error(`unexpected brain-core call in test: ${method} ${url}`);
}

function baseIntent(status: string): Record<string, unknown> {
  return {
    id: "pi_123",
    action_type: "outbound_payment",
    source_account_id: "acct_1",
    destination_counterparty_id: "cp_1",
    amount: "100.00",
    currency: "USD",
    invoice_id: "inv_1",
    status,
    policy_decision_id: "pd_1",
  };
}

function installFetchMock(): void {
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    // Anything that isn't brain-core should never be intercepted here.
    if (!url.startsWith("https://api.brain.fi")) {
      return realFetch(input as never, init as never);
    }
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    const auth = headers["Authorization"] ?? headers["authorization"];
    const provAuth = headers["X-Demo-Provision-Auth"];
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, auth, provAuth, body });
    return routeBrainCore(url, method);
  }) as typeof fetch;
}

// Modules under test (dynamically imported after env is set).
let createBrainProxyRouter: typeof import("./proxy").createBrainProxyRouter;
let getBrainSession: typeof import("./auth").getBrainSession;
let clearBrainTokenCache: typeof import("./auth").clearBrainTokenCache;

let server: Server;
let baseUrl: string;

async function post(path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const res = await realFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}

async function get(path: string): Promise<{ status: number; json: unknown }> {
  const res = await realFetch(`${baseUrl}${path}`);
  return { status: res.status, json: await res.json() };
}

/** All recorded brain-core calls whose URL path (query stripped) ends with the given suffix. */
function callsEndingWith(suffix: string): RecordedCall[] {
  return calls.filter((c) => c.url.split("?")[0].endsWith(suffix));
}

beforeAll(async () => {
  installFetchMock();
  ({ createBrainProxyRouter } = await import("./proxy"));
  ({ getBrainSession, clearBrainTokenCache } = await import("./auth"));

  const app: Express = express();
  app.use(express.json());
  // Inject an authenticated session so requireAuth passes.
  app.use((req, _res, next) => {
    (req as unknown as { session: { userId: string } }).session = { userId: "user-test-1" };
    next();
  });
  app.use("/api/brain", createBrainProxyRouter());
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  server?.close();
});

beforeEach(() => {
  calls = [];
  clearBrainTokenCache();
  provisionResponse = {
    tenant_id: TENANT_ID,
    member_token: MEMBER_TOKEN,
    agent_token: AGENT_TOKEN,
    expires_in: 1800,
  };
  approveStatuses = ["pending_approval"];
  approveCallCount = 0;
});

describe("Invariant 1 — token routing (agent vs member)", () => {
  it("/propose sends the AGENT token to create the PaymentIntent, and the MEMBER token for the invoice read + policy evaluate", async () => {
    const { status } = await post("/api/brain/propose", { invoice_id: "inv_1" });
    expect(status).toBe(200);

    const intentCreate = callsEndingWith("/payment-intents");
    expect(intentCreate).toHaveLength(1);
    expect(intentCreate[0].method).toBe("POST");
    expect(intentCreate[0].auth).toBe(`Bearer ${AGENT_TOKEN}`);

    // The supporting reads ran on the MEMBER token, never the agent token.
    const invoiceRead = callsEndingWith("/ledger/invoices");
    expect(invoiceRead).toHaveLength(1);
    expect(invoiceRead[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);

    // The agent token is used for propose ONLY — nowhere else.
    const agentCalls = calls.filter((c) => c.auth === `Bearer ${AGENT_TOKEN}`);
    expect(agentCalls).toHaveLength(1);
    expect(agentCalls[0].url.endsWith("/payment-intents")).toBe(true);
  });

  it("approve sends the MEMBER token and never the agent token", async () => {
    const { status } = await post("/api/brain/payment-intents/pi_123/approve");
    expect(status).toBe(200);
    const approve = callsEndingWith("/payment-intents/pi_123/approve");
    expect(approve).toHaveLength(1);
    expect(approve[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(calls.some((c) => c.auth === `Bearer ${AGENT_TOKEN}`)).toBe(false);
  });

  it("two-signer: auto-chains to the DISTINCT second-approver token when core needs a second signature", async () => {
    // Core provisioned a second distinct approver (present since the two-signer fix), and the
    // first signature leaves the intent awaiting a second, distinct approval.
    provisionResponse = {
      tenant_id: TENANT_ID,
      member_token: MEMBER_TOKEN,
      agent_token: AGENT_TOKEN,
      second_approver_token: SECOND_APPROVER_TOKEN,
      expires_in: 1800,
    };
    approveStatuses = ["awaiting_second_approval", "approved"];

    const { status, json: body } = await post("/api/brain/payment-intents/pi_123/approve");
    expect(status).toBe(200);

    const approve = callsEndingWith("/payment-intents/pi_123/approve");
    expect(approve).toHaveLength(2);
    // First signature on the member token, second on the DISTINCT second-approver token — two
    // real member ids, so core's distinct-approver + actor-payee gates are genuinely satisfied.
    expect(approve[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(approve[1].auth).toBe(`Bearer ${SECOND_APPROVER_TOKEN}`);
    // The agent token is never used on the approve path (agents propose, humans approve).
    expect(calls.some((c) => c.auth === `Bearer ${AGENT_TOKEN}`)).toBe(false);
    // The two distinct signatures drove the intent all the way to approved.
    expect((body as { intent: { status: string } }).intent.status).toBe("approved");
  });

  it("two-signer: degrades gracefully to awaiting_second_approval when no second-approver token exists (pre-deploy)", async () => {
    // Default provision has NO second_approver_token (a not-yet-deployed core). The BFF must NOT
    // fire a second /approve call and must surface awaiting_second_approval verbatim.
    approveStatuses = ["awaiting_second_approval"];

    const { status, json: body } = await post("/api/brain/payment-intents/pi_123/approve");
    expect(status).toBe(200);

    const approve = callsEndingWith("/payment-intents/pi_123/approve");
    expect(approve).toHaveLength(1);
    expect(approve[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect((body as { intent: { status: string } }).intent.status).toBe("awaiting_second_approval");
  });

  it("reject sends the MEMBER token and never the agent token", async () => {
    const { status } = await post("/api/brain/reject", { payment_intent_id: "pi_123" });
    expect(status).toBe(200);
    const reject = callsEndingWith("/payment-intents/pi_123/reject");
    expect(reject).toHaveLength(1);
    expect(reject[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(calls.some((c) => c.auth === `Bearer ${AGENT_TOKEN}`)).toBe(false);
  });

  it("members read + create use the MEMBER token, never the agent token", async () => {
    await get("/api/brain/members");
    await post("/api/brain/members", { displayName: "C", email: "c@d.co", role: "approver" });
    const memberCalls = callsEndingWith("/members");
    expect(memberCalls.length).toBe(2);
    for (const c of memberCalls) expect(c.auth).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(calls.some((c) => c.auth === `Bearer ${AGENT_TOKEN}`)).toBe(false);
  });
});

describe("Invariant 2 — no actor field in any BFF-constructed payload", () => {
  it("drops a client-supplied actor on propose and never adds one on approve/reject", async () => {
    // Client tries to smuggle an actor through every write path.
    await post("/api/brain/propose", { invoice_id: "inv_1", actor: "attacker@evil.co" });
    await post("/api/brain/payment-intents/pi_123/approve", { actor: "attacker@evil.co" });
    await post("/api/brain/reject", { payment_intent_id: "pi_123", actor: "attacker@evil.co" });

    // Every recorded write body must be free of an `actor` key.
    const writes = calls.filter((c) => c.method !== "GET" && c.body && typeof c.body === "object");
    expect(writes.length).toBeGreaterThan(0);
    for (const c of writes) {
      expect(Object.keys(c.body as Record<string, unknown>), `actor leaked into ${c.method} ${c.url}`).not.toContain("actor");
    }
  });
});

describe("Invariant 3 — provision fail-hard on missing member token", () => {
  it("throws a clear error (no silent agent-only fallback) when the provision-run omits the member token", async () => {
    provisionResponse = { tenant_id: TENANT_ID, agent_token: AGENT_TOKEN, expires_in: 1800 };
    clearBrainTokenCache();
    await expect(getBrainSession("user-fail-hard")).rejects.toThrow(/member token/i);
  });

  it("also rejects the legacy single-token shape (token = agent) that carries no member token", async () => {
    provisionResponse = { tenant_id: TENANT_ID, token: AGENT_TOKEN, expires_in: 1800 };
    clearBrainTokenCache();
    await expect(getBrainSession("user-legacy")).rejects.toThrow(/member token/i);
  });

  it("succeeds and routes the member token as the session token when both are present", async () => {
    clearBrainTokenCache();
    const session = await getBrainSession("user-ok");
    expect(session.token).toBe(MEMBER_TOKEN);
    expect(session.agentToken).toBe(AGENT_TOKEN);
    expect(session.tenantId).toBe(TENANT_ID);
  });
});

describe("Invariant 5 — secrets never returned to the browser", () => {
  it("no response the BFF returns contains the provision secret or any brain-core token", async () => {
    const responses: unknown[] = [];
    responses.push((await post("/api/brain/propose", { invoice_id: "inv_1" })).json);
    responses.push((await post("/api/brain/payment-intents/pi_123/approve")).json);
    responses.push((await post("/api/brain/reject", { payment_intent_id: "pi_123" })).json);
    responses.push((await get("/api/brain/members")).json);
    responses.push((await get("/api/brain/ledger/invoices")).json);

    const blob = JSON.stringify(responses);
    expect(blob).not.toContain(PROVISION_SECRET);
    expect(blob).not.toContain(MEMBER_TOKEN);
    expect(blob).not.toContain(AGENT_TOKEN);

    // Sanity: the secret WAS sent to core (as the provision header) — proving the
    // assertion above isn't vacuous because provisioning never ran.
    const prov = callsEndingWith("/demo/provision-run");
    expect(prov.length).toBeGreaterThan(0);
    expect(prov[0].provAuth).toBe(PROVISION_SECRET);
  });
});
