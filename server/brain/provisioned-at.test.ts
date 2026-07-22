import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";

/**
 * Tenant "Created just now" honesty — provisionedAt is the REAL time the demo
 * session was provisioned, cached in memory only:
 *
 *   - null with no cached session (fresh boot / after a restart) — never fabricated
 *   - a real epoch-ms timestamp after getBrainSession
 *   - PRESERVED across token refreshes of the same tenant
 *   - RESET when a re-provision lands on a new tenant
 *   - route level: /api/developers/tenants returns a non-null ISO createdAt in
 *     demo mode (the route provisions a session, so the timestamp exists)
 *
 * brain-core is mocked at the fetch boundary; the live API is never hit.
 */

// Config reads env at module-eval, so set it BEFORE the dynamic imports below.
process.env.BRAIN_DEMO_PROVISION_SECRET = "test-provision-secret-provisioned-at";
process.env.BRAIN_API_BASE_URL = "https://api.brain.fi/v1";
process.env.SESSION_SECRET = "test-session-secret-provisioned-at";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-dummy-key";
// Force MemStorage + in-memory session store and the demo tenancy path.
delete process.env.DATABASE_URL;
delete process.env.BRAIN_TENANCY_MODE;
// Ensure the local-key path can't be selected.
delete process.env.BRAIN_AUTH_SIGN_KEY;
delete process.env.BRAIN_AUTH_JWT_SECRET;

const realFetch = globalThis.fetch;

// Per-provision knobs so a test can drive refreshes and tenant changes.
let provisionTenantId = "tenant_pa_1";
let provisionExpiresIn = 1800;

function installFetchMock(): void {
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (!url.startsWith("https://api.brain.fi")) {
      return realFetch(input as never, init as never);
    }
    const path = url.split("?")[0];
    if (path.endsWith("/demo/provision-run")) {
      return new Response(
        JSON.stringify({
          tenant_id: provisionTenantId,
          member_token: `MEMBER_${provisionTenantId}`,
          agent_token: `AGENT_${provisionTenantId}`,
          expires_in: provisionExpiresIn,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected brain-core call in test: ${url}`);
  }) as typeof fetch;
}

let getBrainSession: typeof import("./auth").getBrainSession;
let getBrainSessionProvisionedAt: typeof import("./auth").getBrainSessionProvisionedAt;
let clearBrainTokenCache: typeof import("./auth").clearBrainTokenCache;
let registerRoutes: typeof import("../routes").registerRoutes;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  installFetchMock();
  ({ getBrainSession, getBrainSessionProvisionedAt, clearBrainTokenCache } =
    await import("./auth"));
  ({ registerRoutes } = await import("../routes"));

  const app: Express = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => {
    server = httpServer.listen(0, resolve);
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  server?.close();
});

beforeEach(() => {
  clearBrainTokenCache();
  provisionTenantId = "tenant_pa_1";
  provisionExpiresIn = 1800;
});

describe("getBrainSessionProvisionedAt honesty", () => {
  it("returns null when there is no cached session (never fabricated)", () => {
    expect(getBrainSessionProvisionedAt("user-pa-none")).toBeNull();
  });

  it("returns a real epoch-ms timestamp after getBrainSession", async () => {
    const before = Date.now();
    await getBrainSession("user-pa-1");
    const at = getBrainSessionProvisionedAt("user-pa-1");
    const after = Date.now();
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(before);
    expect(at!).toBeLessThanOrEqual(after);
  });

  it("preserves the original provision time across same-tenant token refreshes", async () => {
    // expires_in below the refresh skew (60s) => every getBrainSession refreshes.
    provisionExpiresIn = 30;
    await getBrainSession("user-pa-2");
    const first = getBrainSessionProvisionedAt("user-pa-2");
    expect(first).not.toBeNull();

    await new Promise((r) => setTimeout(r, 10));
    await getBrainSession("user-pa-2"); // refresh, same tenant id
    expect(getBrainSessionProvisionedAt("user-pa-2")).toBe(first);
  });

  it("resets the provision time when a re-provision lands on a NEW tenant", async () => {
    provisionExpiresIn = 30;
    await getBrainSession("user-pa-3");
    const first = getBrainSessionProvisionedAt("user-pa-3");
    expect(first).not.toBeNull();

    await new Promise((r) => setTimeout(r, 10));
    provisionTenantId = "tenant_pa_2";
    await getBrainSession("user-pa-3");
    const second = getBrainSessionProvisionedAt("user-pa-3");
    expect(second).not.toBeNull();
    expect(second!).toBeGreaterThan(first!);
  });

  it("returns null again after the cache is cleared (restart simulation)", async () => {
    await getBrainSession("user-pa-4");
    expect(getBrainSessionProvisionedAt("user-pa-4")).not.toBeNull();
    clearBrainTokenCache(); // what a server restart does to the in-memory cache
    expect(getBrainSessionProvisionedAt("user-pa-4")).toBeNull();
  });
});

describe("GET /api/developers/tenants (demo mode)", () => {
  it("returns a non-null ISO createdAt for the provisioned demo tenant", async () => {
    // Authenticate: register a fresh user and reuse the session cookie.
    const reg = await realFetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "provisioned-at-test@example.com",
        password: "str0ng-Passw0rd!",
        name: "Provision Test",
      }),
    });
    expect(reg.status).toBeLessThan(300);
    const cookie = reg.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const res = await realFetch(`${baseUrl}/api/developers/tenants`, {
      headers: { cookie: cookie! },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      tenants: Array<{ id: string; environment: string; createdAt: string | null; ephemeral: boolean }>;
    };
    expect(body.mode).not.toBe("production");
    expect(body.tenants).toHaveLength(1);
    const tenant = body.tenants[0];
    expect(tenant.environment).toBe("sandbox");
    expect(tenant.ephemeral).toBe(true);
    // The heart of the task: createdAt is REAL (from the live session cache),
    // never null right after provisioning, and parses as a valid ISO date.
    expect(tenant.createdAt).not.toBeNull();
    expect(new Date(tenant.createdAt!).getTime()).not.toBeNaN();
    expect(new Date(tenant.createdAt!).toISOString()).toBe(tenant.createdAt);
  });
});
