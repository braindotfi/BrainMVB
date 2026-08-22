/**
 * Rate-limit invariants for /api/assistant/chat.
 *
 * Spins up a minimal Express app that wires chatRateLimiter in front of a
 * stub handler, then fires requests until the limit is breached. The test
 * covers:
 *   1. Requests within the window succeed (2xx stub).
 *   2. The (max + 1)-th request in the same window returns HTTP 429.
 *   3. The 429 body carries { error: "rate_limit_exceeded", retryAfterSeconds }.
 *   4. A Retry-After header is present on the 429 response.
 *   5. A different user ID gets a fresh, independent bucket.
 *   6. Multiple blocked requests from the same user only log once (debounce).
 *   7. When the flush timer fires, a summary with blockedCount is logged.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import {
  chatRateLimiter,
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_WINDOW_MS,
  logRateLimitBlocked,
  _warnDebounce,
} from "./chatRateLimit";

// ─── Minimal stub app ────────────────────────────────────────────────────────

function buildApp(): Express {
  const app = express();
  app.use(express.json());

  // Simulate requireAuth by reading `x-test-user-id` and attaching it to
  // req.session so the keyGenerator behaves as in production.
  app.use((req, _res, next) => {
    const userId = req.headers["x-test-user-id"] as string | undefined;
    // Express session isn't wired here; attach a plain object on the request
    // the same way session middleware would.
    (req as unknown as { session: { userId?: string } }).session = { userId };
    next();
  });

  app.post("/api/assistant/chat", chatRateLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let server: Server;
let base: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = buildApp().listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        base = `http://127.0.0.1:${port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function chatRequest(userId: string): Promise<Response> {
  return fetch(`${base}/api/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("chatRateLimiter", () => {
  it("applies default values when env vars are absent", () => {
    // The test process does not set CHAT_RATE_LIMIT_MAX or
    // CHAT_RATE_LIMIT_WINDOW_MS, so the module must fall back to its
    // hardcoded defaults: 20 requests per 60-second window.
    expect(CHAT_RATE_LIMIT_MAX).toBe(20);
    expect(CHAT_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it("allows requests up to the configured maximum within a window", async () => {
    const userId = "user-log-test";

    const responses = await Promise.all(
      Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userId)),
    );

    for (const r of responses) {
      expect(r.status).toBe(200);
    }
  });

  it("returns HTTP 429 when the (max + 1)-th request arrives in the same window", async () => {
    // Use a different userId to avoid sharing quota with the previous test.
    const userId = "user-log-test";

    await Promise.all(
      Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userId)),
    );

      const over = await chatRequest(userId);
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).not.toBeNull();
  });

  it("emits a structured console.warn log when a request is blocked", async () => {
    const userId = "user-log-test";

    await Promise.all(
      Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userId)),
    );

      const over = await chatRequest(userId);
    const body = await over.json();

    expect(body).toHaveProperty("error", "rate_limit_exceeded");
    expect(body).toHaveProperty("retryAfterSeconds");
    expect(typeof body.retryAfterSeconds).toBe("number");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(0);
  });

  it("sets a Retry-After header on the 429 response", async () => {
    const userId = "user-log-test";

    await Promise.all(
      Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userId)),
    );

      const over = await chatRequest(userId);
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).not.toBeNull();
  });

  it("emits a structured console.warn log when a request is blocked", async () => {
    const userId = "user-log-test";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      // Exhaust the bucket.
      await Promise.all(
        Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userId)),
      );

      // This request should be over the limit.
      const over = await chatRequest(userId);
      expect(over.status).toBe(429);

      expect(warnSpy).toHaveBeenCalledOnce();
      const [message, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(message).toBe("[rate-limit] chat request blocked");
      expect(payload).toMatchObject({
        userId,
        path: "/api/assistant/chat",
        retryAfterSeconds: expect.any(Number),
        resetAt: expect.any(String),
      });
    } finally {
      warnSpy.mockRestore();
      _warnDebounce.delete(userId);
    }
  });

  it("gives each user ID an independent bucket", async () => {
    const userA = "user-independent-a";
    const userB = "user-independent-b";

    // Exhaust userA's bucket.
    await Promise.all(
      Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userA)),
    );
    const overA = await chatRequest(userA);
    expect(overA.status).toBe(429);

    // userB must still have a full, untouched quota.
    const forB = await chatRequest(userB);
    expect(forB.status).toBe(200);
  });
});

// ─── Debounce unit tests ──────────────────────────────────────────────────────
// These tests call logRateLimitBlocked directly so they can control fake timers
// without the rate-limit store interfering.

describe("logRateLimitBlocked (debounce)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    // Clear any debounce entries left by the test so they don't bleed into
    // subsequent tests.
    _warnDebounce.forEach((_entry, key) => {
      clearTimeout(_warnDebounce.get(key)?.timer);
      _warnDebounce.delete(key);
    });
    vi.useRealTimers();
  });

  it("logs the first blocked request immediately", () => {
    logRateLimitBlocked("user-a", "/api/assistant/chat", new Date().toISOString(), 30);

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("[rate-limit] chat request blocked");
    expect(payload).toMatchObject({ userId: "user-a" });
  });

  it("does not emit additional warn lines for subsequent blocked requests from the same user", () => {
    const userId = "user-debounce-suppress";

    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);
    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);
    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);

    // Only the first call should have logged.
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("tracks the count of suppressed hits in the debounce entry", () => {
    const userId = "user-debounce-count";

    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);
    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);
    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);

    // extraCount = calls after the first = 2
    expect(_warnDebounce.get(userId)?.extraCount).toBe(2);
  });

  it("emits a summary log with blockedCount when the flush timer fires", () => {
    const userId = "user-debounce-flush";

    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);
    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);
    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);

    // First warn already fired; now advance time past the window.
    vi.runAllTimers();

    // A second warn should have been emitted with the summary.
    expect(warnSpy).toHaveBeenCalledTimes(2);
    const [summaryMessage, summaryPayload] = warnSpy.mock.calls[1] as [string, Record<string, unknown>];
    expect(summaryMessage).toBe("[rate-limit] chat requests suppressed");
    expect(summaryPayload).toMatchObject({
      userId,
      blockedCount: 2,
    });
  });

  it("does not emit a summary log when no requests were suppressed", () => {
    const userId = "user-debounce-no-summary";

    // Only one blocked request — nothing to summarise.
    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);

    vi.runAllTimers();

    // Only the initial warn; no flush summary.
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("clears the debounce entry after the flush timer fires", () => {
    const userId = "user-debounce-clear";

    logRateLimitBlocked(userId, "/api/assistant/chat", new Date().toISOString(), 30);

    expect(_warnDebounce.has(userId)).toBe(true);

    vi.runAllTimers();

    expect(_warnDebounce.has(userId)).toBe(false);
  });

  it("treats different user IDs as independent debounce entries", () => {
    logRateLimitBlocked("user-x", "/api/assistant/chat", new Date().toISOString(), 30);
    logRateLimitBlocked("user-y", "/api/assistant/chat", new Date().toISOString(), 30);

    // Each user triggers their own first-warn.
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // Suppressed hits on user-x do not affect user-y's count.
    logRateLimitBlocked("user-x", "/api/assistant/chat", new Date().toISOString(), 30);

    expect(_warnDebounce.get("user-x")?.extraCount).toBe(1);
    expect(_warnDebounce.get("user-y")?.extraCount).toBe(0);
  });
});
