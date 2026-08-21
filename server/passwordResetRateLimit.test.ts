import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPasswordResetRequestLimiter,
  PASSWORD_RESET_GENERIC_RESPONSE,
} from "./passwordResetRateLimit";

let server: Server;
let baseUrl: string;
let deliveryAttempts = 0;

beforeAll(async () => {
  const app: Express = express();
  app.use(express.json());
  app.use("/api/auth/password-reset/request", createPasswordResetRequestLimiter({
    windowMs: 60_000,
    limit: 1,
  }));
  app.post("/api/auth/password-reset/request", (_req, res) => {
    deliveryAttempts++;
    res.json(PASSWORD_RESET_GENERIC_RESPONSE);
  });
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => {
    server = httpServer.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

describe("password-reset request rate limiting", () => {
  it("keeps the response generic and blocks repeat delivery work after the per-IP allowance", async () => {
    deliveryAttempts = 0;
    const request = () => fetch(`${baseUrl}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "person@example.com" }),
    });

    const first = await request();
    const second = await request();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(PASSWORD_RESET_GENERIC_RESPONSE);
    expect(await second.json()).toEqual(PASSWORD_RESET_GENERIC_RESPONSE);
    expect(deliveryAttempts).toBe(1);
  });
});