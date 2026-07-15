import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { registerRoutes } from "./routes";
import { storage, type BankConnection, type ToolConnection } from "./storage";

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
    email: `integrations-${suffix}@example.com`,
    password: "correct-horse-battery",
    name: `Integrations ${suffix}`,
  });
  expect(res.status).toBe(201);
  return res.json.user.id;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = "integration-auth-test-secret";
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

describe("integration route auth", () => {
  it("rejects unauthenticated integration requests", async () => {
    const client = new SessionClient(baseUrl);
    const routes: Array<[string, string, unknown?]> = [
      ["GET", "/api/integrations/connections"],
      ["POST", "/api/integrations/stripe/connect", {}],
      ["GET", "/api/integrations/plaid/status"],
      ["GET", "/api/integrations/plaid/connections"],
      ["POST", "/api/integrations/plaid/link-token", {}],
      ["POST", "/api/integrations/plaid/exchange", { public_token: "public-sandbox-token" }],
      ["POST", "/api/integrations/plaid/disconnect", { itemId: "item-a" }],
      ["POST", "/api/integrations/stripe/disconnect", {}],
    ];

    for (const [method, path, body] of routes) {
      const res = await client.request(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.json).toEqual({ error: "Not authenticated" });
    }
  });

  it("scopes tool and bank connections to the authenticated user", async () => {
    const unique = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
    const alice = new SessionClient(baseUrl);
    const bob = new SessionClient(baseUrl);
    const aliceId = await register(alice, `alice_${unique}`);
    const bobId = await register(bob, `bob_${unique}`);

    const aliceTool: ToolConnection = {
      userId: aliceId,
      toolId: `quickbooks-${unique}`,
      status: "connected",
      accountLabel: "Alice Books",
      connectedAt: new Date().toISOString(),
    };
    const bobTool: ToolConnection = {
      userId: bobId,
      toolId: `stripe-${unique}`,
      status: "connected",
      accountLabel: "Bob Stripe",
      connectedAt: new Date().toISOString(),
    };
    await storage.upsertToolConnection(aliceTool);
    await storage.upsertToolConnection(bobTool);

    const aliceBank: BankConnection = {
      userId: aliceId,
      itemId: `alice-item-${unique}`,
      accessToken: "alice-access-token",
      institutionId: "ins_alice",
      institutionName: "Alice Bank",
      accounts: [],
      connectedAt: new Date().toISOString(),
    };
    const bobBank: BankConnection = {
      userId: bobId,
      itemId: `bob-item-${unique}`,
      accessToken: "bob-access-token",
      institutionId: "ins_bob",
      institutionName: "Bob Bank",
      accounts: [],
      connectedAt: new Date().toISOString(),
    };
    await storage.createBankConnection(aliceBank);
    await storage.createBankConnection(bobBank);

    const toolList = await alice.request<ToolConnection[]>("GET", "/api/integrations/connections");
    expect(toolList.status).toBe(200);
    expect(toolList.json.map((c) => c.toolId)).toContain(aliceTool.toolId);
    expect(toolList.json.map((c) => c.toolId)).not.toContain(bobTool.toolId);

    const bankList = await alice.request<Array<Omit<BankConnection, "accessToken">>>("GET", "/api/integrations/plaid/connections");
    expect(bankList.status).toBe(200);
    expect(bankList.json.map((c) => c.itemId)).toContain(aliceBank.itemId);
    expect(bankList.json.map((c) => c.itemId)).not.toContain(bobBank.itemId);
    expect(bankList.json.some((c) => "accessToken" in c)).toBe(false);

    const toolDisconnect = await alice.request<{ success: boolean }>("POST", `/api/integrations/${bobTool.toolId}/disconnect`, {});
    expect(toolDisconnect.status).toBe(200);
    expect(toolDisconnect.json.success).toBe(false);
    expect((await storage.listToolConnections(bobId)).map((c) => c.toolId)).toContain(bobTool.toolId);

    const bankDisconnect = await alice.request<{ success: boolean }>("POST", "/api/integrations/plaid/disconnect", { itemId: bobBank.itemId });
    expect(bankDisconnect.status).toBe(200);
    expect(bankDisconnect.json.success).toBe(false);
    expect((await storage.listBankConnections(bobId)).map((c) => c.itemId)).toContain(bobBank.itemId);
  });
});
