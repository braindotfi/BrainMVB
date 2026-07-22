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

  it("reads and revokes legacy plaintext Plaid tokens", async () => {
    const unique = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
    const user = await storage.createUser({
      username: `legacy-${unique}`,
      email: `legacy-${unique}@example.com`,
      password: "hashed",
      name: "Legacy Token",
    });
    const legacyToken = `legacy-token-${unique}`;
    const bank: BankConnection = {
      userId: user.id,
      itemId: `legacy-item-${unique}`,
      accessToken: legacyToken,
      institutionId: "ins_legacy",
      institutionName: "Legacy Bank",
      accounts: [],
      connectedAt: new Date().toISOString(),
    };
    const storageInternals = storage as unknown as {
      bankConns: Map<string, BankConnection>;
    };
    storageInternals.bankConns.set(`${bank.userId}::${bank.itemId}`, bank);

    const listed = await storage.listBankConnections(user.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].accessToken).toBe(legacyToken);

    const deleted = await storage.deleteUserAccount({ userId: user.id });
    expect(deleted.bankConnectionsDeleted).toBe(1);
    expect(plaidMocks.itemRemove).toHaveBeenCalledWith({ access_token: legacyToken });
  });
});
