import type { Request, Response, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { createRateLimitLogger, type RateLimitLogger } from "./rateLimitLogger";

export const PASSWORD_RESET_GENERIC_RESPONSE = {
  message: "If an account matches that email, a password reset link will arrive shortly.",
};

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type LimiterSettings = {
  limit?: number;
  windowMs?: number;
};

/**
 * A rate-limit middleware augmented with the `_logger` used to debounce its
 * warn output.  Exported for test inspection and cleanup only — production code
 * must not mutate `_logger._warnDebounce` directly.
 */
export type PasswordResetLimiter = RequestHandler & {
  _logger: RateLimitLogger;
};

/**
 * Derive how many seconds remain until the rate-limit window resets.
 *
 * express-rate-limit sets `RateLimit-Reset` as an epoch-second timestamp.
 * `res.getHeader()` may return it as a number or as a numeric string depending
 * on the express-rate-limit version and Node.js internals, so we handle both.
 */
function resolveResetSeconds(res: Response, nowSec: number): number {
  const raw = res.getHeader("RateLimit-Reset");
  let resetSec: number;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    resetSec = raw;
  } else if (typeof raw === "string") {
    const parsed = parseInt(raw, 10);
    resetSec = Number.isFinite(parsed) ? parsed : nowSec + 60;
  } else {
    resetSec = nowSec + 60;
  }
  return Math.max(0, resetSec - nowSec);
}

// ─── Limiters ─────────────────────────────────────────────────────────────────

/**
 * Rate limiter for POST /api/auth/password-reset/request.
 *
 * Keyed by IP address (the default express-rate-limit strategy).  The handler
 * always returns the same generic 200 response so that callers cannot infer
 * whether a given email address exists in the system.
 *
 * Logging debounce
 * ─────────────────
 * The first blocked request per IP per window emits a console.warn
 * immediately.  Subsequent blocked requests in the same window only increment
 * an in-memory counter — no extra log lines.  When the flush timer fires (after
 * the window) a single summary line is emitted with `blockedCount`.
 */
export function createPasswordResetRequestLimiter(settings: LimiterSettings = {}): PasswordResetLimiter {
  const windowMs = settings.windowMs ?? envInt("PASSWORD_RESET_REQUEST_WINDOW_MS", 15 * 60 * 1000);
  const logger = createRateLimitLogger({
    windowMs,
    blockedMessage: "[rate-limit] password-reset-request blocked",
    suppressedMessage: "[rate-limit] password-reset-request suppressed",
    keyFieldName: "ip",
  });

  const middleware = rateLimit({
    windowMs,
    limit: settings.limit ?? envInt("PASSWORD_RESET_REQUEST_MAX", 5),
    standardHeaders: true,
    legacyHeaders: false,
    // Retain account-enumeration safety even when an IP has exhausted its
    // mailbox-delivery allowance.
    handler: (req: Request, res: Response) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const retryAfterSeconds = resolveResetSeconds(res, nowSec);
      logger.logRateLimitBlocked(
        req.ip ?? "unknown",
        req.originalUrl ?? req.path,
        new Date((nowSec + retryAfterSeconds) * 1000).toISOString(),
        retryAfterSeconds,
      );
      res.set("Cache-Control", "no-store, private");
      res.status(200).json(PASSWORD_RESET_GENERIC_RESPONSE);
    },
  });

  // Use Object.assign so the augmented type is safe — no double-assertion
  // needed and TS can see the _logger property on the returned value.
  return Object.assign(middleware, { _logger: logger });
}

export function createPasswordResetVerifyLimiter(settings: LimiterSettings = {}): PasswordResetLimiter {
  const windowMs = settings.windowMs ?? envInt("PASSWORD_RESET_VERIFY_WINDOW_MS", 15 * 60 * 1000);
  const logger = createRateLimitLogger({
    windowMs,
    blockedMessage: "[rate-limit] password-reset-verify blocked",
    suppressedMessage: "[rate-limit] password-reset-verify suppressed",
    keyFieldName: "ip",
  });

  const middleware = rateLimit({
    windowMs,
    limit: settings.limit ?? envInt("PASSWORD_RESET_VERIFY_MAX", 30),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const retryAfterSeconds = resolveResetSeconds(res, nowSec);
      logger.logRateLimitBlocked(
        req.ip ?? "unknown",
        req.originalUrl ?? req.path,
        new Date((nowSec + retryAfterSeconds) * 1000).toISOString(),
        retryAfterSeconds,
      );
      res.set("Cache-Control", "no-store, private");
      res.status(200).json({ valid: false });
    },
  });

  return Object.assign(middleware, { _logger: logger });
}

export function createPasswordResetConfirmLimiter(settings: LimiterSettings = {}): PasswordResetLimiter {
  const windowMs = settings.windowMs ?? envInt("PASSWORD_RESET_CONFIRM_WINDOW_MS", 15 * 60 * 1000);
  const logger = createRateLimitLogger({
    windowMs,
    blockedMessage: "[rate-limit] password-reset-confirm blocked",
    suppressedMessage: "[rate-limit] password-reset-confirm suppressed",
    keyFieldName: "ip",
  });

  const middleware = rateLimit({
    windowMs,
    limit: settings.limit ?? envInt("PASSWORD_RESET_CONFIRM_MAX", 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const retryAfterSeconds = resolveResetSeconds(res, nowSec);
      logger.logRateLimitBlocked(
        req.ip ?? "unknown",
        req.originalUrl ?? req.path,
        new Date((nowSec + retryAfterSeconds) * 1000).toISOString(),
        retryAfterSeconds,
      );
      res.status(400).json({ error: "This password reset link is invalid or has expired." });
    },
  });

  return Object.assign(middleware, { _logger: logger });
}
