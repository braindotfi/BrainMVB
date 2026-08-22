/**
 * Tests for passwordResetRateLimit.ts
 *
 * Covers:
 *  1. Basic rate-limiting: keeps the response generic and blocks repeat
 *     delivery work after the per-IP allowance.
 *  2. Logging debounce (integration): the first blocked request per IP per
 *     window emits a warn; subsequent blocked requests in the same window are
 *     silent.
 *  3. Logging debounce (unit): flush summary with blockedCount, independent IP
 *     buckets, entry cleared after flush.
 */
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createPasswordResetRequestLimiter,
  PASSWORD_RESET_GENERIC_RESPONSE,
} from "./passwordResetRateLimit";
import { createRateLimitLogger } from "./rateLimitLogger";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildApp(limitPerWindow: number, windowMs = 60_000) {
  const limiter = createPasswordResetRequestLimiter({ windowMs, limit: limitPerWindow });
  const app: Express = express();
  app.use(express.json());
  // Mount the limiter; the caller registers a downstream route handler.
  app.use("/api/auth/password-reset/request", limiter);
  return { app, limiter };
}

async function startServer(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  return { server: httpServer, baseUrl };
}

// ─── Integration: basic rate-limiting ────────────────────────────────────────

describe("password-reset request rate limiting (basic)", () => {
  let server: Server;
  let baseUrl: string;
  let deliveryAttempts = 0;

  beforeAll(async () => {
    const { app } = buildApp(1);
    app.post("/api/auth/password-reset/request", (_req, res) => {
      // This handler is registered after the limiter wrapper in buildApp, so
      // it only fires when the limiter allows the request through.
      deliveryAttempts++;
      res.json(PASSWORD_RESET_GENERIC_RESPONSE);
    });
    ({ server, baseUrl } = await startServer(app));
  });

  afterAll(() => server?.close());

  it("keeps the response generic and blocks repeat delivery work after the per-IP allowance", async () => {
    deliveryAttempts = 0;
    const request = () =>
      fetch(`${baseUrl}/api/auth/password-reset/request`, {
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

// ─── Integration: debounce logging ───────────────────────────────────────────
//
// Each test in this block gets its own isolated server so that the rate-limit
// store and debounce map are always fresh.

describe("password-reset request rate limiting (logging debounce, integration)", () => {
  it("emits exactly one warn when multiple requests are blocked in the same window", async () => {
    const { app, limiter } = buildApp(1);
    const { server, baseUrl } = await startServer(app);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const request = () =>
        fetch(`${baseUrl}/api/auth/password-reset/request`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "flood@example.com" }),
        });

      // First request is allowed (consumes the one quota slot).
      await request();
      // Second and third requests are blocked — both should be silent after the
      // first blocked warn.
      await request();
      await request();

      expect(warnSpy).toHaveBeenCalledOnce();
      const [message, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(message).toBe("[rate-limit] password-reset-request blocked");
      expect(payload).toMatchObject({
        path: "/api/auth/password-reset/request",
        retryAfterSeconds: expect.any(Number),
        resetAt: expect.any(String),
      });
    } finally {
      warnSpy.mockRestore();
      // Clean up the debounce timer so Node.js can exit cleanly.
      limiter._logger._warnDebounce.forEach((entry) => clearTimeout(entry.timer));
      limiter._logger._warnDebounce.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("tracks the count of suppressed hits on the limiter's logger", async () => {
    const { app, limiter } = buildApp(1);
    const { server, baseUrl } = await startServer(app);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const request = () =>
        fetch(`${baseUrl}/api/auth/password-reset/request`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "counter@example.com" }),
        });

      await request(); // allowed
      await request(); // blocked, warn emitted
      await request(); // blocked, suppressed (extraCount = 1)

      // Find the debounce entry for the loopback IP.
      const entry = limiter._logger._warnDebounce.get("127.0.0.1") ??
        limiter._logger._warnDebounce.get("::1") ??
        limiter._logger._warnDebounce.get("::ffff:127.0.0.1");
      expect(entry).toBeDefined();
      expect(entry?.extraCount).toBe(1);
    } finally {
      warnSpy.mockRestore();
      limiter._logger._warnDebounce.forEach((entry) => clearTimeout(entry.timer));
      limiter._logger._warnDebounce.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

// ─── Unit: debounce logic (via createRateLimitLogger directly) ───────────────
//
// We exercise the shared debounce factory with the same configuration used by
// the password-reset-request limiter so that any future change to that factory
// will be caught by these tests without requiring a live HTTP server.

describe("password-reset logRateLimitBlocked debounce (unit)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  function makeLogger(windowMs = 15 * 60 * 1000) {
    return createRateLimitLogger({
      windowMs,
      blockedMessage: "[rate-limit] password-reset-request blocked",
      suppressedMessage: "[rate-limit] password-reset-request suppressed",
      keyFieldName: "ip",
    });
  }

  it("logs the first blocked request immediately", () => {
    const logger = makeLogger();
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 900);

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("[rate-limit] password-reset-request blocked");
    expect(payload).toMatchObject({ ip: "1.2.3.4" });
  });

  it("does not emit additional warn lines for subsequent blocked requests from the same IP", () => {
    const logger = makeLogger();

    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 900);
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 900);
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 900);

    // Only the first call should have logged.
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("tracks the count of suppressed hits in the debounce entry", () => {
    const logger = makeLogger();

    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 900);
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 900);
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 900);

    // extraCount = calls after the first = 2
    expect(logger._warnDebounce.get("1.2.3.4")?.extraCount).toBe(2);
  });

  it("emits a summary log with blockedCount when the flush timer fires", () => {
    const logger = makeLogger(60_000);

    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 60);
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 60);
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 60);

    // First warn already fired; now advance time past the window.
    vi.runAllTimers();

    // A second warn should have been emitted with the summary.
    expect(warnSpy).toHaveBeenCalledTimes(2);
    const [summaryMessage, summaryPayload] = warnSpy.mock.calls[1] as [string, Record<string, unknown>];
    expect(summaryMessage).toBe("[rate-limit] password-reset-request suppressed");
    expect(summaryPayload).toMatchObject({
      ip: "1.2.3.4",
      blockedCount: 2,
    });
  });

  it("does not emit a summary log when no requests were suppressed", () => {
    const logger = makeLogger(60_000);

    // Only one blocked request — nothing to summarise.
    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 60);

    vi.runAllTimers();

    // Only the initial warn; no flush summary.
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("clears the debounce entry after the flush timer fires", () => {
    const logger = makeLogger(60_000);

    logger.logRateLimitBlocked("1.2.3.4", "/api/auth/password-reset/request", new Date().toISOString(), 60);
    expect(logger._warnDebounce.has("1.2.3.4")).toBe(true);

    vi.runAllTimers();

    expect(logger._warnDebounce.has("1.2.3.4")).toBe(false);
  });

  it("treats different IPs as independent debounce entries", () => {
    const logger = makeLogger();

    logger.logRateLimitBlocked("1.1.1.1", "/api/auth/password-reset/request", new Date().toISOString(), 900);
    logger.logRateLimitBlocked("2.2.2.2", "/api/auth/password-reset/request", new Date().toISOString(), 900);

    // Each IP triggers its own first-warn.
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // Suppressed hits on 1.1.1.1 do not affect 2.2.2.2's count.
    logger.logRateLimitBlocked("1.1.1.1", "/api/auth/password-reset/request", new Date().toISOString(), 900);

    expect(logger._warnDebounce.get("1.1.1.1")?.extraCount).toBe(1);
    expect(logger._warnDebounce.get("2.2.2.2")?.extraCount).toBe(0);
  });
});

// ─── #231: Token-verify and confirm-reset debounce ───────────────────────────
//
// The task-#230 work added debounce logging to the password-reset REQUEST
// limiter. The TOKEN-VERIFY and CONFIRM-RESET limiters use the same
// createRateLimitLogger factory, so they must also suppress duplicate blocked
// entries. These tests confirm that contract is in place for all three limiters.

describe("password-reset VERIFY rate limiting (logging debounce, #231)", () => {
  it("emits exactly one warn when multiple token-verify requests are blocked in the same window", async () => {
    const { createPasswordResetVerifyLimiter } = await import("./passwordResetRateLimit");
    const limiter = createPasswordResetVerifyLimiter({ windowMs: 60_000, limit: 1 });
    const app: import("express").Express = (await import("express")).default();
    app.use("/api/auth/password-reset/verify", limiter);
    app.post("/api/auth/password-reset/verify", (_req, res) => res.json({ ok: true }));

    const { createServer } = await import("node:http");
    const server = createServer(app);
    const baseUrl = await new Promise<string>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as import("net").AddressInfo;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = () =>
      fetch(`${baseUrl}/api/auth/password-reset/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "tok_test" }),
      });

    try {
      await request(); // allowed (consumes quota)
      await request(); // blocked — first blocked → warn
      await request(); // blocked — suppressed

      expect(warnSpy).toHaveBeenCalledOnce();
      const [msg] = warnSpy.mock.calls[0] as [string];
      expect(msg).toBe("[rate-limit] password-reset-verify blocked");
    } finally {
      warnSpy.mockRestore();
      limiter._logger._warnDebounce.forEach((e) => clearTimeout(e.timer));
      limiter._logger._warnDebounce.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("password-reset CONFIRM rate limiting (logging debounce, #231)", () => {
  it("emits exactly one warn when multiple confirm-reset requests are blocked in the same window", async () => {
    const { createPasswordResetConfirmLimiter } = await import("./passwordResetRateLimit");
    const limiter = createPasswordResetConfirmLimiter({ windowMs: 60_000, limit: 1 });
    const app: import("express").Express = (await import("express")).default();
    app.use("/api/auth/password-reset/confirm", limiter);
    app.post("/api/auth/password-reset/confirm", (_req, res) => res.json({ ok: true }));

    const { createServer } = await import("node:http");
    const server = createServer(app);
    const baseUrl = await new Promise<string>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as import("net").AddressInfo;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = () =>
      fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "tok_test", password: "newpass" }),
      });

    try {
      await request(); // allowed
      await request(); // blocked → warn
      await request(); // blocked → suppressed

      expect(warnSpy).toHaveBeenCalledOnce();
      const [msg] = warnSpy.mock.calls[0] as [string];
      expect(msg).toBe("[rate-limit] password-reset-confirm blocked");
    } finally {
      warnSpy.mockRestore();
      limiter._logger._warnDebounce.forEach((e) => clearTimeout(e.timer));
      limiter._logger._warnDebounce.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
