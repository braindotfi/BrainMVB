/**
 * POST /api/developers/keys/:id/rotate — brain-core single-key rotate guard
 *
 * Pins the upstream call sequence that rotates one key from the Settings →
 * Developers page.  The guarded sequence is:
 *   1. requireBrainMemberSession — obtain member token + baseUrl from brain-core
 *   2. rotateTenantKey           — call brain-core to atomically revoke + reissue
 *   3. respond 200 with { key, plaintext }
 *
 * Verified cases:
 *   • rotateTenantKey is called with the exact key id from the URL param
 *   • the member token (session.token) — not the agent token — is used
 *   • an upstream 5xx surfaces as a 502 to the caller
 *   • a 404 api_key_not_found (double-click double-rotate) surfaces as a clean
 *     404 rather than a 502 or 500, so the Settings page does not crash
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
  rotateTenantKey: vi.fn(),
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
// only override the function called by the POST /api/developers/keys/:id/rotate handler.
vi.mock("./brain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/client")>();
  return {
    ...actual,
    rotateTenantKey: brainMocks.rotateTenantKey,
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
    const json = (await res.json()) as T;
    return { status: res.status, json };
  }
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
}

async function registerAndLogin(suffix: string, serverUrl: string): Promise<SessionClient> {
  const client = new SessionClient(serverUrl);
  const res = await client.request<{ user: { id: string } }>("POST", "/api/auth/register", {
    email: `rotatekey-${suffix}@example.com`,
    password: "correct-horse-battery",
    name: `Rotate Key ${suffix}`,
  });
  expect(res.status, "register should succeed").toBe(201);
  return client;
}

// ── A minimal valid rotate response (plaintext must start with "brain_sk_") ──

const ROTATE_SUCCESS = {
  key: {
    id: "key_target_123",
    name: "Test Key",
    environment: "sandbox" as const,
    scopes: ["read"],
    key_prefix: "brain_sk_test",
    key_last4: "ab12",
    status: "active",
    created_at: null,
    last_used_at: null,
    revoked_at: null,
    rotated_from_id: null,
  },
  secret: "brain_sk_testabcd1234",
};

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
  tenantId: "tenant-test-rotate",
  baseUrl: "https://api.brain.fi/v1",
};

beforeEach(() => {
  brainMocks.getBrainSession.mockReset().mockResolvedValue(DEFAULT_SESSION);
  brainMocks.rotateTenantKey.mockReset().mockResolvedValue(ROTATE_SUCCESS);
  brainMocks.withBrainBaseUrl.mockReset().mockImplementation((_url: string, fn: () => unknown) => fn());
  brainMocks.brainAuthConfigured.mockReset().mockReturnValue(true);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/developers/keys/:id/rotate — brain-core single-key rotation", () => {
  it("calls rotateTenantKey with the exact key id from the URL param", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request("POST", "/api/developers/keys/key_target_rotate/rotate");

    expect(res.status).toBe(200);

    expect(brainMocks.rotateTenantKey).toHaveBeenCalledOnce();
    const [, calledKeyId] = brainMocks.rotateTenantKey.mock.calls[0] as [string, string];
    expect(calledKeyId).toBe("key_target_rotate");
  });

  it("uses the member token (session.token), not the agent token", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    await client.request("POST", "/api/developers/keys/key_token_check/rotate");

    expect(brainMocks.rotateTenantKey).toHaveBeenCalledOnce();
    const [calledToken] = brainMocks.rotateTenantKey.mock.calls[0] as [string, string];

    // The member token must be used — not the agent token.
    expect(calledToken).toBe(DEFAULT_SESSION.token);
    expect(calledToken).not.toBe(DEFAULT_SESSION.agentToken);
  });

  it("surfaces an upstream 5xx as 502 to the caller", async () => {
    // Import BrainApiError from the real module (unmocked) so instanceof checks work.
    const { BrainApiError } = await import("./brain/client");

    brainMocks.rotateTenantKey.mockRejectedValue(
      new BrainApiError(500, "/keys/key_failing/rotate", { error: "internal_server_error" }),
    );

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>("POST", "/api/developers/keys/key_failing/rotate");

    expect(res.status).toBe(502);
  });

  it("returns 404 api_key_not_found when the key is gone (double-click resilience)", async () => {
    // Import BrainApiError from the real module (unmocked) so instanceof checks work.
    const { BrainApiError } = await import("./brain/client");

    // Simulate brain-core responding with 404 api_key_not_found — the case where
    // the user double-clicked Rotate and the key was already rotated/gone on the
    // second hit.  This is explicitly noted in the route comment as idempotent-unsafe.
    brainMocks.rotateTenantKey.mockRejectedValue(
      new BrainApiError(404, "/keys/key_already_rotated/rotate", { error: "api_key_not_found" }),
    );

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys/key_already_rotated/rotate",
    );

    // sendKeyApiError must map this to a clean 404 — not a 502 or 500 — so the
    // Settings page does not crash and the client's error handler can show a
    // "Key no longer exists" message rather than an unexpected error.
    expect(res.status).toBe(404);
    expect((res.json as { error: string }).error).toBe("api_key_not_found");
  });

  it("unauthenticated requests are rejected before any brain-core call is made", async () => {
    // No session cookie — requireAuth must short-circuit to 401.
    const client = new SessionClient(baseUrl);
    const res = await client.request("POST", "/api/developers/keys/key_unauthed/rotate");

    expect(res.status).toBe(401);
    expect(brainMocks.getBrainSession).not.toHaveBeenCalled();
    expect(brainMocks.rotateTenantKey).not.toHaveBeenCalled();
  });
});
