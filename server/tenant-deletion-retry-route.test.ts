import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PLATFORM_SECRET = "tenant-deletion-retry-test-secret";
process.env.BRAIN_PLATFORM_SERVICE_SECRET = PLATFORM_SECRET;
process.env.BRAIN_TENANT_DELETE_JWT = "test-only-delete-jwt";

const retryMock = vi.fn();
vi.mock("./brain/demoTenantDeletion", () => ({
  retryDemoTenantDeletion: retryMock,
  processExpiredDemoTenantDeletions: vi.fn(),
  startDemoTenantDeletionPolling: vi.fn(),
}));

const { registerRoutes } = await import("./routes");

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

beforeEach(() => {
  retryMock.mockReset();
});

afterAll(() => {
  server?.close();
});

describe("POST /internal/brain-tenant-deletions/:tenantId/retry", () => {
  it("requires platform service authentication", async () => {
    const response = await fetch(
      `${baseUrl}/internal/brain-tenant-deletions/tnt_retry/retry`,
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    expect(retryMock).not.toHaveBeenCalled();
  });

  it("retries an attention record and reports the new deletion job", async () => {
    retryMock.mockResolvedValue({
      tenantId: "tnt_retry",
      deletionStatus: "queued",
      deletionOutcome: null,
      deletionJobId: "job_retry",
    });

    const response = await fetch(
      `${baseUrl}/internal/brain-tenant-deletions/tnt_retry/retry`,
      {
        method: "POST",
        headers: { "X-Platform-Service-Auth": PLATFORM_SECRET },
      },
    );

    expect(response.status).toBe(202);
    expect(retryMock).toHaveBeenCalledWith(expect.anything(), "tnt_retry");
    expect(await response.json()).toEqual({
      tenant_id: "tnt_retry",
      status: "queued",
      outcome: null,
      deletion_job_id: "job_retry",
    });
  });

  it("refuses a tenant which is not currently retryable", async () => {
    retryMock.mockResolvedValue(undefined);

    const response = await fetch(
      `${baseUrl}/internal/brain-tenant-deletions/tnt_not_attention/retry`,
      {
        method: "POST",
        headers: { "X-Platform-Service-Auth": PLATFORM_SECRET },
      },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("tenant_deletion_retry_unavailable");
  });
});