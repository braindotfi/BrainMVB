/**
 * GET /api/developers/tenants — canCreate / liveKeysAvailable status flags
 *
 * Pins the three availability states that the Developers page uses to decide
 * whether to show the "Issue live key" button.  The same platformServiceConfigured()
 * + getBrainIdentity() pair also guards POST /api/developers/keys, so a silent
 * inversion here would expose the button while the POST would still 403.
 *
 * Verified cases:
 *   • canCreate=true, liveKeysAvailable=false when platform is configured but
 *     no brain identity is stored for the user
 *   • liveKeysAvailable=true when platform is configured AND identity exists
 *   • canCreate=false, liveKeysAvailable=false when platformServiceConfigured()
 *     returns false (regardless of identity)
 */

import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

// ── Brain-core layer mocks ────────────────────────────────────────────────────
// vi.hoisted ensures mock objects exist before vi.mock factories run.

const brainMocks = vi.hoisted(() => ({
  getBrainSession: vi.fn(),
  brainAuthConfigured: vi.fn(() => false),
  platformServiceConfigured: vi.fn(() => false),
  brainTenancyMode: vi.fn(() => "production" as const),
  brainDurableTenancy: vi.fn(() => false),
  getMember: vi.fn(),
}));

vi.mock("./brain/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/auth")>();
  return {
    ...actual,
    getBrainSession: brainMocks.getBrainSession,
    getBrainSessionProvisionedAt: vi.fn(() => undefined),
    getBrainSessionExpiresAt: vi.fn(() => undefined),
    clearBrainTokenCache: vi.fn(),
  };
});

// Override only the config functions the status handler reads; keep everything
// else (URL helpers, types) from the real module.
vi.mock("./brain/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/config")>();
  return {
    ...actual,
    brainAuthConfigured: brainMocks.brainAuthConfigured,
    platformServiceConfigured: brainMocks.platformServiceConfigured,
    brainTenancyMode: brainMocks.brainTenancyMode,
    brainDurableTenancy: brainMocks.brainDurableTenancy,
  };
});

vi.mock("./brain/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain/client")>();
  return { ...actual, getMember: brainMocks.getMember };
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

type JsonResponse<T = unknown> = { status: number; json: T };

class SessionClient {
  private cookie = "";
  constructor(private readonly baseUrl: string) {}

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<JsonResponse<T>> {
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

async function registerAndLogin(
  suffix: string,
  serverUrl: string,
): Promise<SessionClient> {
  const client = new SessionClient(serverUrl);
  const res = await client.request<{ user: { id: string } }>(
    "POST",
    "/api/auth/register",
    {
      email: `devstatus-${suffix}@example.com`,
      password: "correct-horse-battery",
      name: `Dev Status ${suffix}`,
    },
  );
  expect(res.status, "register should succeed").toBe(201);
  return client;
}

// ── A minimal BrainIdentity row ───────────────────────────────────────────────

const SAMPLE_IDENTITY = {
  userId: "user-placeholder",
  externalRef: "user-placeholder",
  tenantId: "tenant-abc123",
  memberId: "member-abc123",
  companyName: "Acme Corp",
  provisioningState: "ready_demo",
  dataProfile: "synthetic_brightline_v1",
  accessStage: "demo",
  linkedAt: new Date("2026-01-15T10:00:00.000Z"),
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

// ── Spy on storage.getBrainIdentity ──────────────────────────────────────────

let identitySpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Default: production tenancy mode, platform configured, no stored identity.
  brainMocks.platformServiceConfigured.mockReset().mockReturnValue(true);
  brainMocks.brainTenancyMode.mockReset().mockReturnValue("production");
  brainMocks.brainDurableTenancy.mockReset().mockReturnValue(false);
  brainMocks.brainAuthConfigured.mockReset().mockReturnValue(true);
  brainMocks.getBrainSession.mockReset().mockResolvedValue({
    token: "member-token-test",
    agentToken: "agent-token-test",
    tenantId: SAMPLE_IDENTITY.tenantId,
    baseUrl: "https://api.brain.fi/v1",
  });
  brainMocks.getMember.mockReset().mockResolvedValue({
    id: SAMPLE_IDENTITY.memberId,
    tenantId: SAMPLE_IDENTITY.tenantId,
    email: "admin@example.com",
    displayName: "Admin",
    role: "admin",
    active: true,
    approval: { domains: [], perItemLimit: 0, requiresSecondApproverAbove: null },
  });

  identitySpy = vi
    .spyOn(storage, "getBrainIdentity")
    .mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/developers/tenants — canCreate / liveKeysAvailable flags", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const client = new SessionClient(baseUrl);
    const res = await client.request("GET", "/api/developers/tenants");
    expect(res.status).toBe(401);
  });

  it("canCreate=true, liveKeysAvailable=false when platform configured but no identity stored", async () => {
    // platformServiceConfigured() = true (default), no stored identity (default)
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{
      canCreate: boolean;
      liveKeysAvailable: boolean;
      mode: string;
    }>("GET", "/api/developers/tenants");

    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("production");
    expect(res.json.canCreate).toBe(true);
    expect(res.json.liveKeysAvailable).toBe(false);
    expect(identitySpy).toHaveBeenCalledOnce();
  });

  it("liveKeysAvailable=true when platform configured AND identity exists", async () => {
    identitySpy.mockResolvedValue(SAMPLE_IDENTITY as any);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{
      canCreate: boolean;
      liveKeysAvailable: boolean;
      mode: string;
      tenants: unknown[];
      canManageKeys: boolean;
    }>("GET", "/api/developers/tenants");

    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("production");
    expect(res.json.canCreate).toBe(false);
    expect(res.json.liveKeysAvailable).toBe(true);
    expect(res.json.canManageKeys).toBe(true);
    // The tenant row should also be populated.
    expect(res.json.tenants).toHaveLength(1);
  });

  it("fails key-management visibility closed for a non-admin member", async () => {
    identitySpy.mockResolvedValue(SAMPLE_IDENTITY as any);
    brainMocks.getMember.mockResolvedValue({
      id: SAMPLE_IDENTITY.memberId,
      tenantId: SAMPLE_IDENTITY.tenantId,
      role: "viewer",
      active: true,
    });

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ canManageKeys: boolean }>(
      "GET",
      "/api/developers/tenants",
    );

    expect(res.status).toBe(200);
    expect(res.json.canManageKeys).toBe(false);
  });

  it("returns the exact Raw scope eligibility state for a seeded demo tenant", async () => {
    identitySpy.mockResolvedValue(SAMPLE_IDENTITY as any);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{
      tenants: Array<{
        provisioningState: string;
        dataProfile: string;
        accessStage: string;
        rawScopesEligible: boolean;
      }>;
    }>("GET", "/api/developers/tenants");

    expect(res.status).toBe(200);
    expect(res.json.tenants[0]).toMatchObject({
      provisioningState: "ready_demo",
      dataProfile: "synthetic_brightline_v1",
      accessStage: "demo",
      rawScopesEligible: true,
    });
  });

  it("canCreate=false, liveKeysAvailable=false when platformServiceConfigured() is false", async () => {
    brainMocks.platformServiceConfigured.mockReturnValue(false);
    // Identity present but platform not configured — both flags must be false.
    identitySpy.mockResolvedValue(SAMPLE_IDENTITY as any);

    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{
      canCreate: boolean;
      liveKeysAvailable: boolean;
    }>("GET", "/api/developers/tenants");

    expect(res.status).toBe(200);
    expect(res.json.canCreate).toBe(false);
    expect(res.json.liveKeysAvailable).toBe(false);
  });

  it("returns an empty tenants array when platform configured but no identity", async () => {
    // identitySpy returns undefined by default
    const client = await registerAndLogin(uid(), baseUrl);
    const res = await client.request<{ tenants: unknown[] }>(
      "GET",
      "/api/developers/tenants",
    );

    expect(res.status).toBe(200);
    expect(res.json.tenants).toEqual([]);
  });
});
