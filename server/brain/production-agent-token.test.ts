import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

/**
 * Production agent-token invariants (production-agents contract, core PR #250).
 * Pins the BFF behavior when BRAIN_TENANCY_MODE=production:
 *
 *   A. Tenant creation PERSISTS the agent token core returns and /propose then uses
 *      that real agent token - never the member session token.
 *   B. When core does NOT serve the agent contract (no `agent` at creation, mint route
 *      401s - the live state as of 2026-07-14), sessions still work: /propose degrades
 *      to the member token (core 403s honestly) instead of failing the session.
 *   C. No brain-core token or the platform-service secret ever appears in a response
 *      the BFF returns to the browser.
 */

const SERVICE_SECRET = "test-platform-service-secret-DO-NOT-LEAK";
const MEMBER_TOKEN = "PROD_MEMBER_TOKEN_do_not_leak";
const AGENT_TOKEN = "PROD_AGENT_TOKEN_do_not_leak";
let TENANT_ID = "tnt_test_prod_01";

// Config reads env at module-eval, so set it BEFORE the dynamic imports below.
process.env.BRAIN_TENANCY_MODE = "production";
process.env.BRAIN_PLATFORM_SERVICE_SECRET = SERVICE_SECRET;
process.env.BRAIN_API_BASE_URL = "https://api.brain.fi/v1";
process.env.BRAIN_DEMO_PROVISION_SECRET = "unused-in-production-mode";
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

/** Whether the mocked core serves the agent contract (test A) or predates it (test B). */
let coreHasAgentContract = true;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routeBrainCore(fullUrl: string, method: string): Response {
  const url = fullUrl.split("?")[0];
  if (url.endsWith("/tenants") && method === "POST") {
    return json({
      tenant_id: TENANT_ID,
      member: { id: "m1", tenantId: TENANT_ID, email: "f@co.com", displayName: "Founder", role: "admin" },
      session: { token: MEMBER_TOKEN, refresh_token: "rt_1", expires_in: 900 },
      ...(coreHasAgentContract
        ? { agent: { id: "agt_1", token: AGENT_TOKEN, expires_in: 900 } }
        : {}),
    }, 201);
  }
  if (url.endsWith(`/tenants/${TENANT_ID}/agent-token`) && method === "POST") {
    return coreHasAgentContract
      ? json({ id: "agt_1", token: AGENT_TOKEN, expires_in: 900 })
      : json({ error: { code: "auth_token_missing", message: "missing bearer token" } }, 401);
  }
  if (url.endsWith("/sessions") && method === "POST") {
    return json({ token: MEMBER_TOKEN, refresh_token: "rt_2", expires_in: 900 });
  }
  if (url.endsWith("/ledger/invoices")) {
    return json({
      invoices: [{ id: "inv_1", invoice_number: "INV-1", counterparty_id: "cp_1", amount_due: "100.00", currency: "USD", status: "open" }],
    });
  }
  if (url.includes("/policy/") && url.endsWith("/evaluate")) {
    return json({ outcome: "confirm", matched_rule_id: "r1", required_approvers: [], trace: [] });
  }
  if (url.endsWith("/payment-intents") && method === "POST") {
    return json({
      id: "pi_1", action_type: "outbound_payment", source_account_id: "acct_1",
      destination_counterparty_id: "cp_1", amount: "100.00", currency: "USD",
      invoice_id: "inv_1", status: "pending_approval", policy_decision_id: "pd_1",
    });
  }
  throw new Error(`unexpected brain-core call in test: ${method} ${url}`);
}

function installFetchMock(): void {
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (!url.startsWith("https://api.brain.fi")) {
      return realFetch(input as never, init as never);
    }
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method,
      auth: headers["Authorization"] ?? headers["authorization"],
      svcAuth: headers["X-Platform-Service-Auth"],
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return routeBrainCore(url, method);
  }) as typeof fetch;
}

let createBrainProxyRouter: typeof import("./proxy").createBrainProxyRouter;
let clearBrainTokenCache: typeof import("./auth").clearBrainTokenCache;
let storage: typeof import("../storage").storage;

let server: Server;
let baseUrl: string;
let userCounter = 0;
let currentUserId = "prod-user-0";

async function post(path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const res = await realFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}

function callsEndingWith(suffix: string): RecordedCall[] {
  return calls.filter((c) => c.url.split("?")[0].endsWith(suffix));
}

beforeAll(async () => {
  installFetchMock();
  ({ createBrainProxyRouter } = await import("./proxy"));
  ({ clearBrainTokenCache } = await import("./auth"));
  ({ storage } = await import("../storage"));

  const app: Express = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: { userId: string } }).session = { userId: currentUserId };
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

beforeEach(async () => {
  calls = [];
  clearBrainTokenCache();
  coreHasAgentContract = true;
  // Fresh tenant per test - MemStorage persists across tests in this file.
  TENANT_ID = `tnt_test_prod_${userCounter + 1}`;
  // Fresh app user per test (tenant creation is 409 already_linked for a linked user).
  userCounter += 1;
  currentUserId = `prod-user-${userCounter}`;
  await storage.createUser({ username: currentUserId, email: `${currentUserId}@co.com`, password: "x", name: "Prod User" } as never);
  const user = await storage.getUserByEmail(`${currentUserId}@co.com`);
  currentUserId = user!.id;
});

describe("Production agent token - contract live", () => {
  it("tenant creation persists the agent token and /propose uses it (never the member token)", async () => {
    const create = await post("/api/brain/tenants", { company_name: "Acme" });
    expect(create.status).toBe(201);

    const stored = await storage.getBrainAgentToken(TENANT_ID);
    expect(stored?.token).toBe(AGENT_TOKEN);

    const propose = await post("/api/brain/propose", { invoice_id: "inv_1" });
    expect(propose.status).toBe(200);
    const proposeCall = callsEndingWith("/payment-intents").find((c) => c.method === "POST");
    expect(proposeCall?.auth).toBe(`Bearer ${AGENT_TOKEN}`);
    expect(proposeCall?.auth).not.toBe(`Bearer ${MEMBER_TOKEN}`);
  });
});

describe("Production agent token - core predates the contract (graceful degradation)", () => {
  it("no agent at creation + 401 mint does NOT break the session; /propose falls back to the member token", async () => {
    coreHasAgentContract = false;
    const create = await post("/api/brain/tenants", { company_name: "Acme Legacy" });
    expect(create.status).toBe(201);
    expect(await storage.getBrainAgentToken(TENANT_ID)).toBeUndefined();

    // Session still works; propose degrades to the member token (core will 403 honestly).
    const propose = await post("/api/brain/propose", { invoice_id: "inv_1" });
    expect(propose.status).toBe(200);
    const proposeCall = callsEndingWith("/payment-intents").find((c) => c.method === "POST");
    expect(proposeCall?.auth).toBe(`Bearer ${MEMBER_TOKEN}`);
  });

  it("backfills via idempotent mint on next session use once core ships the route", async () => {
    coreHasAgentContract = false;
    await post("/api/brain/tenants", { company_name: "Acme Backfill" });
    expect(await storage.getBrainAgentToken(TENANT_ID)).toBeUndefined();

    // Core deploys the contract; the next session (cache cleared) mints + persists.
    coreHasAgentContract = true;
    clearBrainTokenCache();
    const propose = await post("/api/brain/propose", { invoice_id: "inv_1" });
    expect(propose.status).toBe(200);
    expect((await storage.getBrainAgentToken(TENANT_ID))?.token).toBe(AGENT_TOKEN);
    const proposeCall = callsEndingWith("/payment-intents").find((c) => c.method === "POST");
    expect(proposeCall?.auth).toBe(`Bearer ${AGENT_TOKEN}`);
  });
});

describe("Secrets boundary", () => {
  it("no BFF response contains the agent token, member token, or the platform-service secret", async () => {
    const create = await post("/api/brain/tenants", { company_name: "Acme Leakcheck" });
    const propose = await post("/api/brain/propose", { invoice_id: "inv_1" });
    for (const res of [create, propose]) {
      const text = JSON.stringify(res.json);
      expect(text).not.toContain(AGENT_TOKEN);
      expect(text).not.toContain(MEMBER_TOKEN);
      expect(text).not.toContain(SERVICE_SECRET);
    }
  });
});
