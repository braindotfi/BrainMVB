/**
 * DELETE /api/developers/keys/:id — brain-core single-key revocation guard
 *
 * Pins the upstream call sequence that revokes one key from the Settings →
 * Developers page.  The guarded sequence is:
 *   1. requireBrainMemberSession — obtain member token + baseUrl from brain-core
 *   2. revokeTenantKey           — call brain-core to revoke the named key
 *   3. respond 204               — confirm success to the caller
 *
 * Verified cases:
 *   • revokeTenantKey is called with the exact key id from the URL param
 *   • the member token (session.token) — not the agent token — is used
 *   • an upstream 5xx surfaces as a 502 to the caller (unlike account deletion,
 *     a single-key revoke must surface the failure rather than swallow it)
 *   • an unauthenticated request is rejected before brain-core is reached
 */

import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "./routes";

// ── Brain-core layer mocks ────────────────────────────────────────────────────
// vi.hoisted ensures the mock objects exist before vi.mock factories run.

const brainMocks = vi.hoisted(() => ({
  getBrainSession: vi.fn(),
  revokeTenantKey: vi.fn(),
  withBrainBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
  brainAuthConfigured: vi.fn(() => true),
}));

vi.mock("./brain/auth", () => ({
  getBrainSession: brainMocks.getBrainSession,
  getBrainSessionProvisionedAt: vi.fn(() => undefined),
  getBrainSessionExpiresAt: vi.fn(() => undefined),
  clearBrainTokenCache: vi.fn(),
}));

// Keep the rest of brain/client intact so unrelated routes stay importable;
// only override the function called by the DELETE /api/developers/keys/:id handler.
vi.mock("./brain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/client")>();
  return {
    ...actual,
    revokeTenantKey: brainMocks.revokeTenantKey,
  };
});

// Keep the rest of brain/baseUrl; only override withBrainBaseUrl so the handler
// does not need a real AsyncLocalStorage context.
vi.mock("./brain/baseUrl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/baseUrl")>();
  return {
    ...actual,
    withBrainBaseUrl: brainMocks.withBrainBaseUrl,
  };
});

// Keep the rest of brain/config; only override brainAuthConfigured so that
// requireBrainMemberSession proceeds to getBrainSession without real env vars.
vi.mock("./brain/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/config")>();
  return {
    ...actual,
    brainAuthConfigured: brainMocks.brainAuthConfigured,
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
    // 204 has no body; avoid JSON.parse of an empty response.
    const json = res.status === 204 ? null : ((await res.json()) as T);
    return { status: res.status, json: json as T };
  }
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
}

async function registerAndLogin(suffix: string, serverUrl: string): Promise<SessionClient> {
  const client = new SessionClient(serverUrl);
  const res = await client.request<{ user: { id: string } }>("POST", "/api/auth/register", {
    email: `revokekey-${suffix}@example.com`,
    password: "correct-horse-battery",
    name: `Revoke Key ${suffix}`,
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
  brainMocks.revokeTenantKey.mockReset().mockResolvedValue(undefined);
  brainMocks.withBrainBaseUrl.mockReset().mockImplementation((_url: string, fn: () => unknown) => fn());
  brainMocks.brainAuthConfigured.mockReset().mockReturnValue(true);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DELETE /api/developers/keys/:id — brain-core single-key revocation", () => {
  it("calls revokeTenantKey with the exact key id from the URL param", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request("DELETE", "/api/developers/keys/key_target_123");

    expect(res.status).toBe(204);

    expect(brainMocks.revokeTenantKey).toHaveBeenCalledOnce();
    const [, calledKeyId] = brainMocks.revokeTenantKey.mock.calls[0] as [string, string];
    expect(calledKeyId).toBe("key_target_123");
  });

  it("uses the member token (session.token), not the agent token", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    await client.request("DELETE", "/api/developers/keys/key_token_check");

    expect(brainMocks.revokeTenantKey).toHaveBeenCalledOnce();
    const [calledToken] = brainMocks.revokeTenantKey.mock.calls[0] as [string, string];

    // The member token must be used — not the agent token.
    expect(calledToken).toBe(DEFAULT_SESSION.token);
    expect(calledToken).not.toBe(DEFAULT_SESSION.agentToken);
  });

  it("surfaces an upstream 5xx as 502 to the caller", async () => {
    // Import BrainApiError from the real module (unmocked) so instanceof checks work.
    const { BrainApiError } = await import("./brain/client");

    brainMocks.revokeTenantKey.mockRejectedValue(
      new BrainApiError(500, "/keys/key_failing", { error: "internal_server_error" }),
    );

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>("DELETE", "/api/developers/keys/key_failing");

    // Unlike account deletion (which swallows revoke failures), a single-key
    // revoke must surface the upstream failure so the caller knows it failed.
    expect(res.status).toBe(502);
  });

  it("unauthenticated requests are rejected before any brain-core call is made", async () => {
    // No session cookie — requireAuth must short-circuit to 401.
    const client = new SessionClient(baseUrl);
    const res = await client.request("DELETE", "/api/developers/keys/key_unauthed");

    expect(res.status).toBe(401);
    expect(brainMocks.getBrainSession).not.toHaveBeenCalled();
    expect(brainMocks.revokeTenantKey).not.toHaveBeenCalled();
  });
});
