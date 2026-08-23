/**
 * POST /api/developers/keys — brain-core key-issuance guard
 *
 * Pins the upstream call sequence that issues a new API key from the Settings →
 * Developers page.  The guarded sequence is:
 *   1. requireBrainMemberSession — obtain member token + baseUrl from brain-core
 *   2. issueTenantKey            — call brain-core with tenant id, environment,
 *                                  name, and scopes
 *   3. respond 201               — relay the new key + one-time plaintext
 *
 * Verified cases:
 *   • issueTenantKey is called with the correct tenant id, environment, name,
 *     and scopes from the request body (sandbox)
 *   • the member token (session.token) — not the agent token — is used
 *   • an upstream 5xx surfaces as a 502 to the caller
 *   • an unauthenticated request is rejected before brain-core is reached
 *   • a live-key request with platformServiceConfigured=false is rejected 403
 *   • a live-key request with no brain identity is rejected 403
 *   • a live-key request with platformServiceConfigured=true + a valid identity
 *     reaches issueTenantKey and returns 201
 *
 * Also verified (rotate / revoke — no live-key guard):
 *   • rotate succeeds (200) even when platformServiceConfigured=false + no brain identity
 *   • rotate forwards the key id and member token to rotateTenantKey
 *   • revoke succeeds (204) even when platformServiceConfigured=false + no brain identity
 *   • revoke forwards the key id and member token to revokeTenantKey
 */

import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

// ── Brain-core layer mocks ────────────────────────────────────────────────────
// vi.hoisted ensures the mock objects exist before vi.mock factories run.

const brainMocks = vi.hoisted(() => ({
  getBrainSession: vi.fn(),
  issueTenantKey: vi.fn(),
  rotateTenantKey: vi.fn(),
  revokeTenantKey: vi.fn(),
  withBrainBaseUrl: vi.fn((_url: string, fn: () => unknown) => fn()),
  brainAuthConfigured: vi.fn(() => true),
  platformServiceConfigured: vi.fn(() => false),
}));

vi.mock("./brain/auth", () => ({
  getBrainSession: brainMocks.getBrainSession,
  getBrainSessionProvisionedAt: vi.fn(() => undefined),
  getBrainSessionExpiresAt: vi.fn(() => undefined),
  clearBrainTokenCache: vi.fn(),
}));

// Keep the rest of brain/client intact so unrelated routes stay importable;
// override only the key-management functions called by the handlers.
vi.mock("./brain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/client")>();
  return {
    ...actual,
    issueTenantKey: brainMocks.issueTenantKey,
    rotateTenantKey: brainMocks.rotateTenantKey,
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
// requireBrainMemberSession proceeds to getBrainSession without real env vars,
// and platformServiceConfigured so the live-key guard can be controlled per test.
vi.mock("./brain/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/config")>();
  return {
    ...actual,
    brainAuthConfigured: brainMocks.brainAuthConfigured,
    platformServiceConfigured: brainMocks.platformServiceConfigured,
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
    const text = await res.text();
    const json = (text ? JSON.parse(text) : null) as T;
    return { status: res.status, json };
  }
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
}

async function registerAndLogin(suffix: string, serverUrl: string): Promise<SessionClient> {
  const client = new SessionClient(serverUrl);
  const res = await client.request<{ user: { id: string } }>("POST", "/api/auth/register", {
    email: `issuekey-${suffix}@example.com`,
    password: "correct-horse-battery",
    name: `Issue Key ${suffix}`,
  });
  expect(res.status, "register should succeed").toBe(201);
  return client;
}

// ── A minimal valid issue response (plaintext must start with "brain_sk_") ──

const ISSUE_SUCCESS = {
  key: {
    id: "key_new_abc123",
    name: "My Sandbox Key",
    environment: "sandbox" as const,
    scopes: ["ledger:read"],
    key_prefix: "brain_sk_sand",
    key_last4: "ef90",
    status: "active",
    created_at: null,
    last_used_at: null,
    revoked_at: null,
    rotated_from_id: null,
  },
  secret: "brain_sk_sandabcdef1234",
};

const LIVE_ISSUE_SUCCESS = {
  key: {
    id: "key_live_xyz789",
    name: "My Live Key",
    environment: "live" as const,
    scopes: ["ledger:read"],
    key_prefix: "brain_sk_live",
    key_last4: "ab12",
    status: "active",
    created_at: null,
    last_used_at: null,
    revoked_at: null,
    rotated_from_id: null,
  },
  secret: "brain_sk_liveabcdef5678",
};

// A minimal valid rotate response — same shape as issue, key id changes.
const ROTATE_SUCCESS = {
  key: {
    id: "key_live_rotated99",
    name: "My Live Key",
    environment: "live" as const,
    scopes: ["ledger:read"],
    key_prefix: "brain_sk_live",
    key_last4: "cc44",
    status: "active",
    created_at: null,
    last_used_at: null,
    revoked_at: null,
    rotated_from_id: "key_live_xyz789",
  },
  secret: "brain_sk_liverotated9999",
};

// ── Standard request bodies ───────────────────────────────────────────────────

const ISSUE_BODY = {
  name: "My Sandbox Key",
  environment: "sandbox",
  scopes: ["ledger:read"],
};

const LIVE_BODY = {
  name: "My Live Key",
  environment: "live",
  scopes: ["ledger:read"],
};

// ── A minimal brain identity fixture ─────────────────────────────────────────

const BRAIN_IDENTITY = {
  userId: "user-test-1",
  externalRef: "ext-ref-abc",
  tenantId: "tenant-prod-1",
  memberId: "member-abc",
  companyName: "Acme Corp",
  linkedAt: new Date("2024-01-01T00:00:00Z"),
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
  tenantId: "tenant-test-1",
  baseUrl: "https://api.brain.fi/v1",
};

let identitySpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  brainMocks.getBrainSession.mockReset().mockResolvedValue(DEFAULT_SESSION);
  brainMocks.issueTenantKey.mockReset().mockResolvedValue(ISSUE_SUCCESS);
  brainMocks.rotateTenantKey.mockReset().mockResolvedValue(ROTATE_SUCCESS);
  brainMocks.revokeTenantKey.mockReset().mockResolvedValue(undefined);
  brainMocks.withBrainBaseUrl.mockReset().mockImplementation((_url: string, fn: () => unknown) => fn());
  brainMocks.brainAuthConfigured.mockReset().mockReturnValue(true);
  brainMocks.platformServiceConfigured.mockReset().mockReturnValue(false);
  identitySpy = vi.spyOn(storage, "getBrainIdentity").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/developers/keys — brain-core key issuance", () => {
  it("calls issueTenantKey with the correct tenant id, environment, name, and scopes", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ key: unknown; plaintext: string }>(
      "POST",
      "/api/developers/keys",
      ISSUE_BODY,
    );

    expect(res.status).toBe(201);

    expect(brainMocks.issueTenantKey).toHaveBeenCalledOnce();
    const [, calledTenantId, calledBody] = brainMocks.issueTenantKey.mock.calls[0] as [
      string,
      string,
      { name: string; environment: string; scopes: string[] },
    ];

    expect(calledTenantId).toBe(DEFAULT_SESSION.tenantId);
    expect(calledBody.name).toBe(ISSUE_BODY.name);
    expect(calledBody.environment).toBe(ISSUE_BODY.environment);
    expect(calledBody.scopes).toEqual(ISSUE_BODY.scopes);
  });

  it("uses the member token (session.token), not the agent token", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    await client.request("POST", "/api/developers/keys", ISSUE_BODY);

    expect(brainMocks.issueTenantKey).toHaveBeenCalledOnce();
    const [calledToken] = brainMocks.issueTenantKey.mock.calls[0] as [string, string, unknown];

    // The member token must be used — not the agent token.
    expect(calledToken).toBe(DEFAULT_SESSION.token);
    expect(calledToken).not.toBe(DEFAULT_SESSION.agentToken);
  });

  it("surfaces an upstream 5xx as 502 to the caller", async () => {
    // Import BrainApiError from the real module (unmocked) so instanceof checks work.
    const { BrainApiError } = await import("./brain/client");

    brainMocks.issueTenantKey.mockRejectedValue(
      new BrainApiError(500, "/tenants/tenant-test-1/keys", { error: "internal_server_error" }),
    );

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>("POST", "/api/developers/keys", ISSUE_BODY);

    expect(res.status).toBe(502);
  });

  it("unauthenticated requests are rejected before any brain-core call is made", async () => {
    // No session cookie — requireAuth must short-circuit to 401.
    const client = new SessionClient(baseUrl);
    const res = await client.request("POST", "/api/developers/keys", ISSUE_BODY);

    expect(res.status).toBe(401);
    expect(brainMocks.getBrainSession).not.toHaveBeenCalled();
    expect(brainMocks.issueTenantKey).not.toHaveBeenCalled();
  });
});

describe("POST /api/developers/keys — live-key guard", () => {
  it("returns 403 live_not_available when platformServiceConfigured is false", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(false);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
    expect(brainMocks.issueTenantKey).not.toHaveBeenCalled();
  });

  it("returns 403 live_not_available when platformServiceConfigured is true but no brain identity exists", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(undefined);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
    expect(brainMocks.issueTenantKey).not.toHaveBeenCalled();
  });

  it("issues a live key and returns 201 when platformServiceConfigured is true and a brain identity exists", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(BRAIN_IDENTITY);
    brainMocks.issueTenantKey.mockResolvedValue(LIVE_ISSUE_SUCCESS);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ key: unknown; plaintext: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

    expect(res.status).toBe(201);

    // issueTenantKey must have been called with the correct arguments.
    expect(brainMocks.issueTenantKey).toHaveBeenCalledOnce();
    const [calledToken, calledTenantId, calledBody] = brainMocks.issueTenantKey.mock.calls[0] as [
      string,
      string,
      { name: string; environment: string; scopes: string[] },
    ];

    expect(calledToken).toBe(DEFAULT_SESSION.token);
    expect(calledTenantId).toBe(DEFAULT_SESSION.tenantId);
    expect(calledBody.name).toBe(LIVE_BODY.name);
    expect(calledBody.environment).toBe("live");
    expect(calledBody.scopes).toEqual(LIVE_BODY.scopes);
  });

  it("calls getBrainIdentity with the authenticated user's ID, not a constant or session tenantId", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(BRAIN_IDENTITY);
    brainMocks.issueTenantKey.mockResolvedValue(LIVE_ISSUE_SUCCESS);

    // Register directly so we can capture the returned user ID — the real ID
    // that the session will carry into the handler.
    const client = new SessionClient(baseUrl);
    const registerRes = await client.request<{ user: { id: string } }>("POST", "/api/auth/register", {
      email: `issuekey-idcheck-${uid()}@example.com`,
      password: "correct-horse-battery",
      name: "Identity Check User",
    });
    expect(registerRes.status, "register should succeed").toBe(201);
    const authenticatedUserId = (registerRes.json as { user: { id: string } }).user.id;

    await client.request("POST", "/api/developers/keys", LIVE_BODY);

    // getBrainIdentity must be called with the session user's actual ID —
    // not a hardcoded constant and not session.tenantId (the most likely
    // wrong-ID substitution after a refactor).
    expect(identitySpy).toHaveBeenCalledWith(authenticatedUserId);
    expect(identitySpy).not.toHaveBeenCalledWith(DEFAULT_SESSION.tenantId);
  });
});

describe("POST /api/developers/keys — authentication", () => {
  it("rejects an unauthenticated request before brain-core is reached", async () => {
    // No session cookie — requireAuth must short-circuit to 401.
    const client = new SessionClient(baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      ISSUE_BODY,
    );

    expect(res.status).toBe(401);
    expect(brainMocks.getBrainSession).not.toHaveBeenCalled();
    expect(brainMocks.issueTenantKey).not.toHaveBeenCalled();
  });
});

// ── Rotate — no live-key guard ────────────────────────────────────────────────
//
// rotate and revoke must never be blocked by platformServiceConfigured or the
// brain-identity check.  A user who already holds a live key must be able to
// rotate or revoke it even if their tenant link is later removed.

describe("POST /api/developers/keys/:id/rotate — no live-key guard", () => {
  const KEY_ID = "key_live_xyz789";

  it("succeeds (200 + key + plaintext) even when platformServiceConfigured is false and no brain identity exists", async () => {
    // Defaults from beforeEach: platformServiceConfigured=false, identitySpy=undefined.
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ key: unknown; plaintext: string }>(
      "POST",
      `/api/developers/keys/${KEY_ID}/rotate`,
    );

    expect(res.status).toBe(200);
    expect(res.json).toHaveProperty("key");
    expect(typeof (res.json as { plaintext: string }).plaintext).toBe("string");
    // The upstream rotate was called — not gated.
    expect(brainMocks.rotateTenantKey).toHaveBeenCalledOnce();
  });

  it("forwards the key id and member token to rotateTenantKey", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    await client.request("POST", `/api/developers/keys/${KEY_ID}/rotate`);

    expect(brainMocks.rotateTenantKey).toHaveBeenCalledOnce();
    const [calledToken, calledKeyId] = brainMocks.rotateTenantKey.mock.calls[0] as [string, string];
    expect(calledToken).toBe(DEFAULT_SESSION.token);
    expect(calledKeyId).toBe(KEY_ID);
  });
});

// ── Revoke — no live-key guard ────────────────────────────────────────────────

describe("DELETE /api/developers/keys/:id — no live-key guard", () => {
  const KEY_ID = "key_live_xyz789";

  it("succeeds (204) even when platformServiceConfigured is false and no brain identity exists", async () => {
    // Defaults from beforeEach: platformServiceConfigured=false, identitySpy=undefined.
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request("DELETE", `/api/developers/keys/${KEY_ID}`);

    expect(res.status).toBe(204);
    // The upstream revoke was called — not gated.
    expect(brainMocks.revokeTenantKey).toHaveBeenCalledOnce();
  });

  it("forwards the key id and member token to revokeTenantKey", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    await client.request("DELETE", `/api/developers/keys/${KEY_ID}`);

    expect(brainMocks.revokeTenantKey).toHaveBeenCalledOnce();
    const [calledToken, calledKeyId] = brainMocks.revokeTenantKey.mock.calls[0] as [string, string];
    expect(calledToken).toBe(DEFAULT_SESSION.token);
    expect(calledKeyId).toBe(KEY_ID);
  });
});
