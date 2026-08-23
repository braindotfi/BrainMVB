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
 *     and scopes from the request body
 *   • the member token (session.token) — not the agent token — is used
 *   • an upstream 5xx surfaces as a 502 to the caller
 *   • an unauthenticated request is rejected before brain-core is reached
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
// only override the function called by the POST /api/developers/keys handler.
vi.mock("./brain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/config")>();
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

// ── Standard issue request body ───────────────────────────────────────────────

const ISSUE_BODY = {
  name: "My Sandbox Key",
  environment: "sandbox",
  scopes: ["ledger:read"],
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

beforeEach(() => {
  brainMocks.getBrainSession.mockReset().mockResolvedValue(DEFAULT_SESSION);
  brainMocks.issueTenantKey.mockReset().mockResolvedValue(ISSUE_SUCCESS);
  brainMocks.withBrainBaseUrl.mockReset().mockImplementation((_url: string, fn: () => unknown) => fn());
  brainMocks.brainAuthConfigured.mockReset().mockReturnValue(true);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/developers/keys — body validation (400 before brain-core)", () => {
  it("rejects a missing scopes field with 400 and never calls issueTenantKey", async () => {
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
  });

  it("does not call issueTenantKey when the 403 fires (no brain identity)", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(undefined);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
  });

  it("does not call issueTenantKey when the 403 fires (no brain identity)", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(undefined);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
  });

  it("does not call issueTenantKey when the 403 fires (no brain identity)", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(undefined);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
  });

  it("does not call issueTenantKey when the 403 fires (no brain identity)", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(undefined);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
  });

  it("does not call issueTenantKey when the 403 fires (no brain identity)", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(undefined);

    const client = await registerAndLogin(uid(), baseUrl);
    const body = { name: "My Sandbox Key", environment: "sandbox", scopes: ["ledger:read"] };
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(201);

    expect(brainMocks.issueTenantKey).toHaveBeenCalledOnce();
    const [, calledTenantId, calledBody] = brainMocks.issueTenantKey.mock.calls[0] as [
      string,
      string,
      { name: string; environment: string; scopes: string[] },
    ];

    expect(calledTenantId).toBe(DEFAULT_SESSION.tenantId);
    expect(calledBody.name).toBe(body.name);
    expect(calledBody.environment).toBe(body.environment);
    expect(calledBody.scopes).toEqual(body.scopes);
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
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(403);
    expect((res.json as { error: string }).error).toBe("live_not_available");
  });

  it("does not call issueTenantKey when the 403 fires (no brain identity)", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(true);
    identitySpy.mockResolvedValue(undefined);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ error: string }>(
      "POST",
      "/api/developers/keys",
      LIVE_BODY,
    );

  const LIVE_BODY = { name: "My Live Key", environment: "live", scopes: ["ledger:read"] };

    expect(res.status).toBe(403);
    expect(res.json.error).toBe("live_not_available");
    expect(brainMocks.issueTenantKey).not.toHaveBeenCalled();
  });
});

  let identitySpy: ReturnType<typeof vi.spyOn>;
