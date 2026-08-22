/**
 * Shared rate-limit warn-debounce factory.
 *
 * Each call to `createRateLimitLogger` returns an independent
 * `{ logRateLimitBlocked, _warnDebounce }` pair so that different rate
 * limiters (chat, password-reset-request, …) do not share state.
 *
 * Behaviour per logger instance
 * ───────────────────────────────
 * - First blocked request per `key` per window → emits the configured
 *   `blockedMessage` via `console.warn` immediately.
 * - Subsequent blocked requests for the same `key` in the same window →
 *   increment `extraCount` silently (no additional log lines).
 * - When the flush timer fires (after `windowMs`) → if `extraCount > 0`,
 *   emit the configured `suppressedMessage` with `{ blockedCount }`;
 *   then remove the entry.
 */

export interface DebounceEntry {
  /** Hits after the first (which was already logged). */
  extraCount: number;
  path: string;
  resetAt: string;
  retryAfterSeconds: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface RateLimitLoggerOptions {
  /** Duration of the rate-limit window in milliseconds. Used as the flush-timer delay. */
  windowMs: number;
  /**
   * `console.warn` message emitted on the first blocked request.
   * E.g. "[rate-limit] chat request blocked"
   */
  blockedMessage: string;
  /**
   * `console.warn` message emitted by the flush summary when there were
   * suppressed hits.
   * E.g. "[rate-limit] chat requests suppressed"
   */
  suppressedMessage: string;
  /**
   * Field name used for the rate-limit key in the log payload.
   * Defaults to "key".  Set to "userId", "ip", etc. to match the
   * limiter's key type so that operators can correlate log lines.
   */
  keyFieldName?: string;
}

export interface RateLimitLogger {
  /**
   * Log at most one warn line per key per window.
   *
   * @param key               Rate-limit bucket identifier (user ID, IP, …).
   * @param path              Request path.
   * @param resetAt           ISO timestamp of the window reset.
   * @param retryAfterSeconds Seconds until the window resets.
   */
  logRateLimitBlocked(
    key: string,
    path: string,
    resetAt: string,
    retryAfterSeconds: number,
  ): void;
  /**
   * In-memory debounce state.  Exported for test inspection and cleanup only —
   * production code must not mutate this map directly.
   */
  _warnDebounce: Map<string, DebounceEntry>;
}

export function createRateLimitLogger(options: RateLimitLoggerOptions): RateLimitLogger {
  const {
    windowMs,
    blockedMessage,
    suppressedMessage,
    keyFieldName = "key",
  } = options;

  const _warnDebounce = new Map<string, DebounceEntry>();

  function logRateLimitBlocked(
    key: string,
    path: string,
    resetAt: string,
    retryAfterSeconds: number,
  ): void {
    const existing = _warnDebounce.get(key);

    if (existing) {
      // Already logged once this window — just count the suppressed hit.
      existing.extraCount += 1;
      return;
    }

    // First blocked request for this key in this window — log it now.
    console.warn(blockedMessage, {
      [keyFieldName]: key,
      path,
      resetAt,
      retryAfterSeconds,
    });

    const timer = setTimeout(() => {
      const entry = _warnDebounce.get(key);
      if (entry && entry.extraCount > 0) {
        console.warn(suppressedMessage, {
          [keyFieldName]: key,
          path: entry.path,
          resetAt: entry.resetAt,
          blockedCount: entry.extraCount,
        });
      }
      _warnDebounce.delete(key);
    }, windowMs);

    // Allow the Node.js process (and test runners) to exit without waiting
    // for the flush timer — it is purely informational.
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref(): void }).unref();
    }

    _warnDebounce.set(key, {
      extraCount: 0,
      path,
      resetAt,
      retryAfterSeconds,
      timer,
    });
  }

  return { logRateLimitBlocked, _warnDebounce };
}
