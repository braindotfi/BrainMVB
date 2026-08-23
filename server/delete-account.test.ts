/**
 * DELETE /api/account — brain-core key revocation guard
 *
 * Pins the call sequence that prevents a deleted user's brain-core API keys from
 * remaining active after account deletion. The guarded sequence is:
 *   1. listTenantKeys  — fetch the tenant's live keys from brain-core
 *   2. revokeTenantKey — revoke every key (parallel, one call per key)
 *   3. deleteUserAccount — wipe the local account row from our DB
 *
 * Verified cases:
 *   • listTenantKeys is called and its result drives revocation before DB deletion
 *   • revokeTenantKey is called once per key returned
 *   • a revocation failure (upstream 5xx) never blocks account deletion
 *   • a missing brain session (demo / unlinked account) completes deletion without error
 *   • an unauthenticated request never reaches the brain-core layer
 */

import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

// ── Brain-core layer mocks ────────────────────────────────────────────────────
// vi.hoisted ensures the mock objects exist before vi.mock factories run.

const brainMocks = vi.hoisted(() => ({
  getBrainSession: vi.fn(),
  listTenantKeys: vi.fn(),
  revokeTenantKey: vi.fn(),
  // Pass-through by default; individual tests may override.
  withBrainBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
}));

vi.mock("./brain/auth", () => ({
  getBrainSession: brainMocks.getBrainSession,
  getBrainSessionProvisionedAt: vi.fn(() => undefined),
  getBrainSessionExpiresAt: vi.fn(() => undefined),
  clearBrainTokenCache: vi.fn(),
}));

// Keep the rest of brain/client intact so unrelated routes stay importable;
// only override the two functions called by the DELETE /api/account handler.
vi.mock("./brain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/client")>();
  return {
    ...actual,
    listTenantKeys: brainMocks.listTenantKeys,
    revokeTenantKey: brainMocks.revokeTenantKey,
  };
});

// Likewise keep the rest of brain/baseUrl; only override withBrainBaseUrl so
// the handler does not need a real AsyncLocalStorage context.
vi.mock("./brain/baseUrl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/baseUrl")>();
  return {
    ...actual,
    withBrainBaseUrl: brainMocks.withBrainBaseUrl,
  };
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

type JsonResponse<T = unknown> = { status: number; json: T };

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
    return { status: res.status, json: (await res.json()) as T };
  }
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
}

async function registerAndLogin(suffix: string, baseUrl: string): Promise<SessionClient> {
  const client = new SessionClient(baseUrl);
  const res = await client.request<{ user: { id: string } }>("POST", "/api/auth/register", {
    email: `acctdel-${suffix}@example.com`,
    password: "correct-horse-battery",
    name: `Account Del ${suffix}`,
  });
  expect(res.status, "register should succeed").toBe(201);
  return client;
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

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
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

// Default brain-core mock state restored before every test.
const DEFAULT_SESSION = {
  token: "member-token-test",
  agentToken: "agent-token-test",
  tenantId: "tenant-test-1",
  baseUrl: "https://api.brain.fi/v1",
};

beforeEach(() => {
  brainMocks.getBrainSession.mockReset().mockResolvedValue(DEFAULT_SESSION);
  brainMocks.listTenantKeys.mockReset().mockResolvedValue({ keys: [] });
  brainMocks.revokeTenantKey.mockReset().mockResolvedValue(undefined);
  brainMocks.withBrainBaseUrl.mockReset().mockImplementation((_url: string, fn: () => unknown) => fn());
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DELETE /api/account — brain-core key revocation", () => {
  it("listTenantKeys, all revocations, then deleteUserAccount — in that order", async () => {
    const callOrder: string[] = [];

    brainMocks.listTenantKeys.mockImplementation(async () => {
      callOrder.push("listTenantKeys");
      return { keys: [{ id: "key_a", name: "API key" }] };
    });

    // A small artificial delay in the revoke mock ensures that a fire-and-forget
    // implementation (where deleteUserAccount starts before the revoke resolves)
    // produces the wrong order and the assertion below catches it.
    brainMocks.revokeTenantKey.mockImplementation(async (_token: string, keyId: string) => {
      await new Promise<void>((r) => setTimeout(r, 20));
      callOrder.push(`revoke:${keyId}`);
    });

    // Wrap deleteUserAccount to record when it runs relative to brain-core calls.
    const realDelete = storage.deleteUserAccount.bind(storage);
    const deleteSpy = vi
      .spyOn(storage, "deleteUserAccount")
      .mockImplementation(async (...args: Parameters<typeof storage.deleteUserAccount>) => {
        callOrder.push("deleteUserAccount");
        return realDelete(...args);
      });

    try {
      const client = await registerAndLogin(uid(), baseUrl);
      const res = await client.request<{
        success: boolean;
        brainKeysRevoked: number;
        brainKeyRevocationsFailed: number;
      }>("DELETE", "/api/account");
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      // All three phases must appear in strict order: list → revoke(s) → delete.
      // If revocations are fire-and-forget, "deleteUserAccount" arrives before
      // "revoke:key_a" (because the 20 ms mock delay hasn't resolved yet), and
      // this assertion fails — which is exactly the regression we're guarding.
      expect(callOrder).toEqual(["listTenantKeys", "revoke:key_a", "deleteUserAccount"]);
      // All keys revoked successfully — no failures.
      expect(res.json.brainKeysRevoked).toBe(1);
      expect(res.json.brainKeyRevocationsFailed).toBe(0);
    } finally {
      deleteSpy.mockRestore();
    }
  });

  it("calls revokeTenantKey once for each key the tenant has", async () => {
    brainMocks.listTenantKeys.mockResolvedValue({
      keys: [
        { id: "key_sandbox", name: "Sandbox key" },
        { id: "key_live", name: "Live key" },
      ],
    });

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{
      success: boolean;
      brainKeysRevoked: number;
      brainKeyRevocationsFailed: number;
    }>("DELETE", "/api/account");
    expect(res.status).toBe(200);

    expect(brainMocks.revokeTenantKey).toHaveBeenCalledTimes(2);
    // The second argument to revokeTenantKey is the key id (token is first).
    const revokedIds = (brainMocks.revokeTenantKey.mock.calls as [string, string][]).map(
      ([, keyId]) => keyId,
    );
    expect(revokedIds).toContain("key_sandbox");
    expect(revokedIds).toContain("key_live");
    // Both keys revoked successfully — counts must reflect the full set.
    expect(res.json.brainKeysRevoked).toBe(2);
    expect(res.json.brainKeyRevocationsFailed).toBe(0);
  });

  it("a revocation failure does not block account deletion", async () => {
    brainMocks.listTenantKeys.mockResolvedValue({
      keys: [
        { id: "key_ok", name: "Good key" },
        { id: "key_fail", name: "Failing key" },
      ],
    });

    // One key revokes fine; the other simulates an upstream 5xx.
    brainMocks.revokeTenantKey.mockImplementation(async (_token: string, keyId: string) => {
      if (keyId === "key_fail") throw new Error("upstream 500: internal server error");
      // key_ok succeeds silently.
    });

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{
      success: boolean;
      brainKeysRevoked: number;
      brainKeyRevocationsFailed: number;
    }>("DELETE", "/api/account");

    // Deletion must succeed regardless of the upstream failure.
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);

    // Both keys must have been attempted (not short-circuited by the first failure).
    expect(brainMocks.revokeTenantKey).toHaveBeenCalledTimes(2);

    // Partial revocation counts must be surfaced so operators can detect orphaned keys.
    expect(res.json.brainKeysRevoked).toBe(1);
    expect(res.json.brainKeyRevocationsFailed).toBe(1);
  });

  it("a missing brain session (demo / unlinked account) still completes deletion", async () => {
    // Simulate the getBrainSession path throwing — the outer catch in the handler
    // must absorb this and continue to deleteUserAccount.
    brainMocks.getBrainSession.mockRejectedValue(new Error("no tenant linked to this user"));

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ success: boolean }>("DELETE", "/api/account");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);

    // The brain-core key layer was never reached — no list or revoke calls.
    expect(brainMocks.listTenantKeys).not.toHaveBeenCalled();
    expect(brainMocks.revokeTenantKey).not.toHaveBeenCalled();
  });

  it("unauthenticated requests are rejected before any brain-core call is made", async () => {
    // No session cookie — requireAuth must short-circuit to 401.
    const client = new SessionClient(baseUrl);
    const res = await client.request("DELETE", "/api/account");
    expect(res.status).toBe(401);
    expect(brainMocks.getBrainSession).not.toHaveBeenCalled();
    expect(brainMocks.listTenantKeys).not.toHaveBeenCalled();
    expect(brainMocks.revokeTenantKey).not.toHaveBeenCalled();
  });
});
