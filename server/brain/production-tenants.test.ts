import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";

/**
 * Production-mode tenant listing honesty — GET /api/developers/tenants with
 * BRAIN_TENANCY_MODE=production reads the durable brain_identities mapping:
 *
 *   - createdAt equals identity.linkedAt (exact ISO string) when present
 *   - createdAt is null (NEVER fabricated) when linkedAt is missing
 *   - no identity → empty tenants, canCreate true, liveKeysAvailable false
 *   - identity present → canCreate false, liveKeysAvailable true
 *     (platformServiceConfigured() is true throughout this suite)
 *
 * brain-core is never called by this route in production mode; storage-only.
 */

// Config reads env at module-eval, so set it BEFORE the dynamic imports below.
process.env.BRAIN_TENANCY_MODE = "production";
process.env.BRAIN_PLATFORM_SERVICE_SECRET = "test-platform-service-secret-tenants";
process.env.BRAIN_API_BASE_URL = "https://api.brain.fi/v1";
process.env.SESSION_SECRET = "test-session-secret-production-tenants";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-dummy-key";
// Force MemStorage — this suite must never touch a real database.
delete process.env.DATABASE_URL;
delete process.env.BRAIN_AUTH_SIGN_KEY;
delete process.env.BRAIN_AUTH_JWT_SECRET;

const realFetch = globalThis.fetch;

// Guard: this route must never reach brain-core in production mode.
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
    throw new Error(`unexpected brain-core call in test: ${url}`);
  }) as typeof fetch;
}

let storage: typeof import("../storage").storage;

let server: Server;
let baseUrl: string;

interface TenantsBody {
  mode: string;
  canCreate: boolean;
  liveKeysAvailable: boolean;
  tenants: Array<{
    id: string;
    companyName: string | null;
    environment: string;
    createdAt: string | null;
    ephemeral: boolean;
  }>;
}

let userCounter = 0;

async function registerUser(): Promise<{ cookie: string; userId: string }> {
  userCounter += 1;
  const reg = await realFetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `prod-tenants-${userCounter}@example.com`,
      password: "str0ng-Passw0rd!",
      name: `Prod Tenants ${userCounter}`,
    }),
  });
  expect(reg.status).toBeLessThan(300);
  const cookie = reg.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  const body = (await reg.json()) as { id?: string; user?: { id: string } };
  const userId = body.id ?? body.user?.id;
  expect(userId).toBeTruthy();
  return { cookie: cookie!, userId: userId! };
}

async function getTenants(cookie: string): Promise<TenantsBody> {
  const res = await realFetch(`${baseUrl}/api/developers/tenants`, {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as TenantsBody;
}

beforeAll(async () => {
  installFetchMock();
  ({ storage } = await import("../storage"));
  const { registerRoutes } = await import("../routes");

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

describe("GET /api/developers/tenants (production mode)", () => {
  it("no identity: empty tenants, canCreate true, liveKeysAvailable false", async () => {
    const { cookie } = await registerUser();
    const body = await getTenants(cookie);
    expect(body.mode).toBe("production");
    expect(body.tenants).toEqual([]);
    // platformServiceConfigured() && !identity
    expect(body.canCreate).toBe(true);
    // platformServiceConfigured() && !!identity
    expect(body.liveKeysAvailable).toBe(false);
  });

  it("identity present: createdAt is EXACTLY linkedAt as ISO, live env, not ephemeral", async () => {
    const { cookie, userId } = await registerUser();
    const identity = await storage.createBrainIdentity({
      userId,
      externalRef: userId,
      tenantId: "tnt_prod_created_at",
      memberId: "mem_1",
      companyName: "Acme Robotics",
    });
    expect(identity.linkedAt).toBeInstanceOf(Date);

    const body = await getTenants(cookie);
    expect(body.mode).toBe("production");
    expect(body.canCreate).toBe(false);
    expect(body.liveKeysAvailable).toBe(true);
    expect(body.tenants).toHaveLength(1);
    const tenant = body.tenants[0];
    expect(tenant.id).toBe("tnt_prod_created_at");
    expect(tenant.companyName).toBe("Acme Robotics");
    expect(tenant.environment).toBe("live");
    expect(tenant.ephemeral).toBe(false);
    // The heart of the task: createdAt comes from the durable mapping's
    // linkedAt, byte-for-byte as ISO — no clock reads, no fabrication.
    expect(tenant.createdAt).toBe(identity.linkedAt!.toISOString());
  });

  it("identity with MISSING linkedAt: createdAt is null, never fabricated", async () => {
    const { cookie, userId } = await registerUser();
    await storage.createBrainIdentity({
      userId,
      externalRef: userId,
      tenantId: "tnt_prod_no_linked_at",
      memberId: null,
      companyName: null,
    });
    // Simulate a legacy/backfilled row without a linkedAt (MemStorage returns
    // the live row object, so nulling it mirrors a NULL column in Postgres).
    const stored = await storage.getBrainIdentity(userId);
    expect(stored).toBeDefined();
    (stored as { linkedAt: Date | null }).linkedAt = null;

    const before = Date.now();
    const body = await getTenants(cookie);
    expect(body.tenants).toHaveLength(1);
    const tenant = body.tenants[0];
    expect(tenant.id).toBe("tnt_prod_no_linked_at");
    // Honesty: unknown creation time renders as null — the route must not
    // substitute "now" or any other fabricated timestamp.
    expect(tenant.createdAt).toBeNull();
    // And the readiness flags still reflect identity presence.
    expect(body.canCreate).toBe(false);
    expect(body.liveKeysAvailable).toBe(true);
    // Paranoia: nothing in the payload smells like a just-now timestamp.
    expect(JSON.stringify(body)).not.toContain(new Date(before).toISOString().slice(0, 16));
  });
});
