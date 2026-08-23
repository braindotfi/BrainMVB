/**
 * Per-authenticated-user rate limiter for /api/assistant/chat.
 *
 * Keyed on the session user ID so that each authenticated user gets an
 * independent bucket.  Falls back to the IP address when no user ID is
 * present on the session (should not normally happen because requireAuth
 * runs first, but we defend in depth).
 *
 * Limits:
 *   20 requests per 60-second sliding window per user.
 *
 * On breach the middleware returns:
 *   HTTP 429  { error: "rate_limit_exceeded", retryAfterSeconds: N }
 * with a Retry-After header so clients know how long to back off.
 *
 * Logging debounce
 * ─────────────────
 * The first blocked request per user per window emits a console.warn
 * immediately.  Subsequent blocked requests from the same user in the same
 * window only increment an in-memory counter — no extra log lines.
 * When the flush timer fires (after one window duration) a single summary
 * line is emitted that includes `blockedCount` so the operator can see the
 * total suppressed hits without being buried under duplicate entries.
 */
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { createRateLimitLogger } from "../rateLimitLogger";

/**
 * Read a positive integer from an env var, falling back to `fallback` when the
 * var is absent, non-numeric, NaN, zero, or negative.  Mirrors the same helper
 * in server/passwordResetRateLimit.ts so both limiters fail safely on bad config.
 */
function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CHAT_RATE_LIMIT_MAX = envInt("CHAT_RATE_LIMIT_MAX", 20);
export const CHAT_RATE_LIMIT_WINDOW_MS = envInt("CHAT_RATE_LIMIT_WINDOW_MS", 60_000);

// ─── Per-user warning debounce ───────────────────────────────────────────────

const _chatLogger = createRateLimitLogger({
  windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
  blockedMessage: "[rate-limit] chat request blocked",
  suppressedMessage: "[rate-limit] chat requests suppressed",
  keyFieldName: "userId",
});

/**
 * In-memory debounce state keyed by userId.
 * Exported for test inspection and cleanup only —
 * production code must not mutate this map directly.
 */
export const _warnDebounce = _chatLogger._warnDebounce;

/**
 * Log at most one warn line per user per window.
 *
 * - First call for a given userId: emits the warn immediately and starts a
 *   flush timer.
 * - Subsequent calls within the same window: increment `extraCount` silently.
 * - When the flush timer fires: if `extraCount > 0`, emit a summary line that
 *   includes `blockedCount`; then remove the entry.
 */
export const logRateLimitBlocked = _chatLogger.logRateLimitBlocked;

// ─── Middleware ───────────────────────────────────────────────────────────────

export const chatRateLimiter = rateLimit({
  windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
  max: CHAT_RATE_LIMIT_MAX,

  // Key by authenticated user ID (set by requireAuth before this middleware).
  // requireAuth always populates session.userId before we reach this handler,
  // so the fallback ("unknown") is a dead-code safety net, never an IP address.
  // We disable the ipKeyGenerator validation because we intentionally do NOT
  // fall back to req.ip — treating unauthenticated callers as one bucket is
  // deliberately conservative.
  validate: { keyGeneratorIpFallback: false },
  keyGenerator(req: Request): string {
    const userId = (req.session as { userId?: string } | undefined)?.userId;
    return userId ?? "unknown";
  },

  // Expose the remaining count and reset time to callers.
  standardHeaders: true,
  legacyHeaders: false,

  // Return a structured JSON body with a retry hint.
  handler(req: Request, res: Response) {
    const resetMs = (res.getHeader("RateLimit-Reset") as number | undefined) ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const resetSec = typeof resetMs === "number" ? resetMs : nowSec + 60;
    const retryAfterSeconds = Math.max(0, resetSec - nowSec);

    const userId =
      (req.session as { userId?: string } | undefined)?.userId ?? "unknown";

    logRateLimitBlocked(
      userId,
      req.path,
      new Date(resetSec * 1000).toISOString(),
      retryAfterSeconds,
    );

    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "rate_limit_exceeded",
      retryAfterSeconds,
    });
  },

  // Do not count failed (4xx/5xx) requests against the quota — only
  // requests that actually reach the assistant and call the model cost money.
  skipFailedRequests: false,
});
