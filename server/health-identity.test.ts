import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PLATFORM_SECRET = "health-identity-test-secret";
process.env.BRAIN_PLATFORM_SERVICE_SECRET = PLATFORM_SECRET;
delete process.env.DATABASE_URL;

const [{ registerRoutes }, storageModule] = await Promise.all([
  import("./routes"),
  import("./storage"),
]);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app: Express = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  server = httpServer;
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

describe("deployment and identity verification endpoints", () => {
  it("returns the public health contract without authentication", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      version: "dev",
      service: "brain-mvb",
      commit: "dev",
    });
  });

  it("rejects the tenant lookup without platform service authentication", async () => {
    const response = await fetch(`${baseUrl}/internal/brain-identities/tnt_test`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_platform_service_auth" });
  });

  it("reports whether a tenant has a BrainMVB identity mapping", async () => {
    const storage = storageModule.storage;
    await storage.createBrainIdentity({
      userId: "identity-health-user",
      externalRef: "identity-health-user",
      tenantId: "tnt_identity_health",
      memberId: null,
    });

    const headers = { "X-Platform-Service-Auth": PLATFORM_SECRET };
    const linked = await fetch(`${baseUrl}/internal/brain-identities/tnt_identity_health`, { headers });
    expect(linked.status).toBe(200);
    expect(await linked.json()).toEqual({
      tenant_id: "tnt_identity_health",
      linked: true,
    });

    const absent = await fetch(`${baseUrl}/internal/brain-identities/tnt_not_linked`, { headers });
    expect(absent.status).toBe(200);
    expect(await absent.json()).toEqual({
      tenant_id: "tnt_not_linked",
      linked: false,
    });
  });
});