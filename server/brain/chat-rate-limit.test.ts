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
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import {
  chatRateLimiter,
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_WINDOW_MS,
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
    const userId = "user-allow-test";

    const responses = await Promise.all(
      Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userId)),
    );

    for (const r of responses) {
      expect(r.status).toBe(200);
    }
  });

  it("returns HTTP 429 when the (max + 1)-th request arrives in the same window", async () => {
    // Use a different userId to avoid sharing quota with the previous test.
    const userId = "user-exceed-test";

    // Exhaust the bucket.
    await Promise.all(
      Array.from({ length: CHAT_RATE_LIMIT_MAX }, () => chatRequest(userId)),
    );

    // This request should be over the limit.
    const over = await chatRequest(userId);
    expect(over.status).toBe(429);
  });

  it("includes { error, retryAfterSeconds } in the 429 body", async () => {
    const userId = "user-body-test";

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
    const userId = "user-header-test";

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
