import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { registerRoutes } from "./routes";
import { storage, type BankConnection, type ToolConnection } from "./storage";

const plaidMocks = vi.hoisted(() => ({
  itemRemove: vi.fn(async (_arg: { access_token: string }) => ({})),
}));

vi.mock("./plaid", () => ({
  getPlaidClient: () => ({ itemRemove: plaidMocks.itemRemove }),
  PLAID_PRODUCTS: [],
  PLAID_COUNTRIES: [],
}));

type JsonResponse<T = unknown> = {
  status: number;
  json: T;
};

class SessionClient {
  private cookie = "";

  constructor(private readonly baseUrl: string) {}

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<JsonResponse<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];

    return { status: res.status, json: await res.json() as T };
  }
}

async function register(client: SessionClient, suffix: string): Promise<string> {
  const res = await client.request<{ user: { id: string } }>("POST", "/api/auth/register", {
    email: `security-${suffix}@example.com`,
    password: "correct-horse-battery",
    name: `Security ${suffix}`,
  });
  expect(res.status).toBe(201);
  return res.json.user.id;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app: Express = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => {
    server = httpServer.listen(0, resolve);
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  plaidMocks.itemRemove.mockClear();
});

describe("auth boundary hardening", () => {
  it("creates a session after successful SIWE verify", async () => {
    const client = new SessionClient(baseUrl);
    const nonceRes = await client.request<{ nonce: string }>("GET", "/api/auth/nonce");
    expect(nonceRes.status).toBe(200);

    const account = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    const message = [
      `${account.address} wants to sign in with Ethereum.`,
      "",
      `Nonce: ${nonceRes.json.nonce}`,
    ].join("\n");
    const signature = await account.signMessage({ message });

    const verify = await client.request<{ success: boolean; user: { id: string; walletAddress: string } }>(
      "POST",
      "/api/auth/verify",
      { address: account.address, message, signature },
    );
    expect(verify.status).toBe(200);
    expect(verify.json.success).toBe(true);
    expect(verify.json.user.walletAddress).toBe(account.address);

    const current = await client.request<{ user: { id: string } }>("GET", "/api/auth/user");
    expect(current.status).toBe(200);
    expect(current.json.user.id).toBe(verify.json.user.id);
  });

  it("rejects unauthenticated goal recommendation requests", async () => {
    const client = new SessionClient(baseUrl);
    const res = await client.request("GET", "/api/goals/recommendation?category=Build%20Reserve");
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ error: "Not authenticated" });
  });

  /* The shared demo login (POST /api/auth/demo) was deleted: unauthenticated, it logged
     every caller into ONE app user backed by ONE persistent tenant, so each visitor could
     read and mutate what the previous visitor left behind. Isolated demo access is
     /api/auth/demo-fresh. This pins the removal — reintroducing the route, or adding any
     other unauthenticated path that hands out a session, fails here.

     The 404 comes from the /api/* fallback at the end of registerRoutes, so this harness
     exercises the same handler the real server uses. That matters: the running app mounts a
     SPA catch-all after the API routes, and before that fallback existed an unknown /api path
     answered 200 with the HTML shell — this test would have passed while the deployed server
     still returned 200 for the deleted route. */
  it("no longer exposes the shared demo login, and mints no session for it", async () => {
    const client = new SessionClient(baseUrl);
    const res = await client.request<{ error: string }>("POST", "/api/auth/demo");
    expect(res.status).toBe(404);
    expect(res.json.error).toBe("Not found");

    // The decisive assertion: a 404 that still issued a cookie would mean some other
    // handler had claimed the path and logged the caller in anyway.
    const after = await client.request("GET", "/api/auth/user");
    expect(after.status).toBe(401);
  });

  /* Demo sessions are handed out unauthenticated, so `requireAuth` alone does not gate
     anything: /api/auth/demo-fresh turns any caller into an authenticated user. Routes that
     reach a real third party or persist a real credential need requireNonDemo on top.
     PLAID_ENV being unset (so Plaid resolves to sandbox) is a real mitigation but lives
     outside the code and is one environment variable away from being wrong. */
  it("refuses Plaid link-token and exchange for a demo session", async () => {
    const demo = new SessionClient(baseUrl);
    const login = await demo.request<{ user: { isDemo: boolean } }>("POST", "/api/auth/demo-fresh");
    expect(login.status).toBe(200);
    expect(login.json.user.isDemo).toBe(true);

    const link = await demo.request<{ error: string }>("POST", "/api/integrations/plaid/link-token");
    expect(link.status).toBe(403);
    expect(link.json.error).toBe("demo_account_not_permitted");

    // Empty body on purpose: a 403 here (not a 400) proves the gate short-circuits before
    // the handler validates input or reaches Plaid, rather than refusing somewhere later.
    const exchange = await demo.request<{ error: string }>("POST", "/api/integrations/plaid/exchange", {});
    expect(exchange.status).toBe(403);
    expect(exchange.json.error).toBe("demo_account_not_permitted");
  });

  it("does not apply the demo gate to a real account", async () => {
    // Guards against the gate degrading into a blanket denial. The Plaid client is mocked
    // without linkTokenCreate, so this fails downstream - what matters is that it is not
    // refused as a demo account.
    const client = new SessionClient(baseUrl);
    await register(client, `plaid-${Date.now().toString(36)}`);

    const link = await client.request<{ error: string }>("POST", "/api/integrations/plaid/link-token");
    expect(link.status).not.toBe(403);
    expect(link.json.error).not.toBe("demo_account_not_permitted");
  });

  it("answers unknown /api paths with JSON, not the SPA shell", async () => {
    const res = await fetch(`${baseUrl}/api/definitely-not-a-route`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toMatchObject({ error: "Not found" });
  });
});

describe("account deletion hygiene", () => {
  it("removes the user's owned rows from storage", async () => {
    const unique = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
    const client = new SessionClient(baseUrl);
    const userId = await register(client, unique);

    const tool: ToolConnection = {
      userId,
      toolId: `stripe-${unique}`,
      status: "connected",
      accountLabel: "Test Stripe",
      connectedAt: new Date().toISOString(),
    };
    const bank: BankConnection = {
      userId,
      itemId: `item-${unique}`,
      accessToken: "access-token-to-encrypt",
      institutionId: "ins_test",
      institutionName: "Test Bank",
      accounts: [],
      connectedAt: new Date().toISOString(),
    };

    await storage.createNotification({
      userId,
      type: "test",
      title: "Test",
      body: "Test",
      data: {},
      read: false,
    });
    await storage.createSiweNonce({
      nonce: `nonce-${unique}`,
      walletAddress: `0x${"1".repeat(40)}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await storage.upsertToolConnection(tool);
    await storage.createBankConnection(bank);
    await storage.createSourceDocument({ userId, name: "invoice.pdf", size: 42, mimeType: "application/pdf" });
    await storage.createUserRule({ userId, id: `rule-${unique}`, name: "Test rule", policyId: "policy-test" });
    await storage.createBrainIdentity({
      userId,
      externalRef: userId,
      tenantId: `tenant-${unique}`,
      memberId: `member-${unique}`,
      companyName: "Test Co",
    });
    await storage.upsertBrainAgentToken(`tenant-${unique}`, "agent-token", new Date(Date.now() + 60_000));

    const deleted = await storage.deleteUserAccount({ userId });
    expect(deleted.user?.id).toBe(userId);
    expect(deleted.notificationsDeleted).toBe(1);
    expect(deleted.bankConnectionsDeleted).toBe(1);
    expect(deleted.sourceDocumentsDeleted).toBe(1);
    expect(deleted.userRulesDeleted).toBe(1);
    expect(deleted.brainIdentitiesDeleted).toBe(1);
    expect(deleted.brainAgentTokensDeleted).toBe(1);

    expect(await storage.getUser(userId)).toBeUndefined();
    expect(await storage.getNotifications(userId)).toHaveLength(0);
    expect(await storage.listToolConnections(userId)).toHaveLength(0);
    expect(await storage.listBankConnections(userId)).toHaveLength(0);
    expect(await storage.listSourceDocuments(userId)).toHaveLength(0);
    expect(await storage.listUserRules(userId)).toHaveLength(0);
    expect(await storage.getBrainIdentity(userId)).toBeUndefined();
    expect(await storage.getBrainAgentToken(`tenant-${unique}`)).toBeUndefined();
  });

  /* ── Plaid revocation on account deletion ────────────────────────────────
     These run against WHICHEVER storage backend is active, which is the whole
     point: `storage` is picked at module load from DATABASE_URL, so a test that
     only works in memory verifies nothing about the configuration that actually
     ships. The earlier version of the legacy-token test seeded through
     MemStorage's private `bankConns` Map and therefore threw before asserting
     anything whenever a database was configured — which meant nothing anywhere
     in this suite proved that deleting an account revokes bank access at all. */

  /** A bank row whose STORED access token is plaintext — the shape rows had
   *  before encryption-at-rest existed. Both backends encrypt on the public
   *  write path, so a legacy row can only be produced by overwriting the stored
   *  value afterwards. */
  async function seedLegacyPlaintextConnection(bank: BankConnection): Promise<void> {
    await storage.createBankConnection(bank);
    if (process.env.DATABASE_URL) {
      const [{ db }, { bankConnections }, { and, eq }] = await Promise.all([
        import("./db"),
        import("@shared/schema"),
        import("drizzle-orm"),
      ]);
      await db
        .update(bankConnections)
        .set({ accessToken: bank.accessToken })
        .where(and(eq(bankConnections.userId, bank.userId), eq(bankConnections.itemId, bank.itemId)));
    } else {
      const internals = storage as unknown as { bankConns: Map<string, BankConnection> };
      internals.bankConns.set(`${bank.userId}::${bank.itemId}`, { ...bank });
    }
  }

  const bankFixture = (userId: string, unique: string, accessToken: string): BankConnection => ({
    userId,
    itemId: `item-${unique}`,
    accessToken,
    institutionId: "ins_legacy",
    institutionName: "Legacy Bank",
    accounts: [],
    connectedAt: new Date().toISOString(),
  });

  const makeUser = async (prefix: string) => {
    const unique = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
    const user = await storage.createUser({
      username: `${prefix}-${unique}`,
      email: `${prefix}-${unique}@example.com`,
      password: "hashed",
      name: "Token Owner",
    });
    return { user, unique };
  };

  it("reads and revokes legacy plaintext Plaid tokens", async () => {
    const { user, unique } = await makeUser("legacy");
    const legacyToken = `legacy-token-${unique}`;
    await seedLegacyPlaintextConnection(bankFixture(user.id, unique, legacyToken));

    const listed = await storage.listBankConnections(user.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].accessToken).toBe(legacyToken);

    const deleted = await storage.deleteUserAccount({ userId: user.id });
    expect(deleted.bankConnectionsDeleted).toBe(1);
    expect(plaidMocks.itemRemove).toHaveBeenCalledWith({ access_token: legacyToken });
    expect(deleted.bankTokensRevoked).toBe(1);
    expect(deleted.bankTokenRevocationsFailed).toBe(0);
  });

  it("revokes normally-encrypted tokens with the DECRYPTED value", async () => {
    /* The regression this exists to catch: sending the stored column straight to
       Plaid. Ciphertext is a well-formed string, so itemRemove would be called
       and nothing would look wrong — but the token would stay live. */
    const { user, unique } = await makeUser("encrypted");
    const realToken = `access-sandbox-${unique}`;
    await storage.createBankConnection(bankFixture(user.id, unique, realToken));

    const deleted = await storage.deleteUserAccount({ userId: user.id });
    expect(deleted.bankConnectionsDeleted).toBe(1);
    expect(plaidMocks.itemRemove).toHaveBeenCalledWith({ access_token: realToken });
    expect(deleted.bankTokensRevoked).toBe(1);
    expect(deleted.bankTokenRevocationsFailed).toBe(0);
  });

  it("reports a failed revocation instead of swallowing it", async () => {
    /* Deletion must still complete — a person's right to delete their account
       cannot depend on Plaid being up — but the orphaned credential has to be
       reported, not logged into the void. */
    const { user, unique } = await makeUser("revokefail");
    const token = `access-sandbox-${unique}`;
    await storage.createBankConnection(bankFixture(user.id, unique, token));
    plaidMocks.itemRemove.mockRejectedValueOnce(new Error("plaid unavailable"));

    const deleted = await storage.deleteUserAccount({ userId: user.id });
    expect(plaidMocks.itemRemove).toHaveBeenCalledWith({ access_token: token });
    expect(deleted.bankTokenRevocationsFailed).toBe(1);
    expect(deleted.bankTokensRevoked).toBe(0);
    // The user is still deleted, and the row is still gone.
    expect(deleted.user?.id).toBe(user.id);
    expect(deleted.bankConnectionsDeleted).toBe(1);
    expect(await storage.getUser(user.id)).toBeUndefined();
  });
});
