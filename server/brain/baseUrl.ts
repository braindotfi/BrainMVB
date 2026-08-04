/**
 * Per-request brain-core base URL carrier (AsyncLocalStorage).
 *
 * Lets the BFF route any given request to the right brain-core target
 * (staging for demo users, production for real accounts) without
 * threading a baseUrl parameter through every helper function in
 * client.ts and tenancy.ts.
 *
 * Usage in a session-based route handler:
 *   const { token, baseUrl } = await getBrainSession(userId);
 *   return withBrainBaseUrl(baseUrl, async () => {
 *     const invoices = await listLedgerInvoices(token, { limit: 20 });
 *     return res.json(invoices);
 *   });
 *
 * Key-authed routes (developer API, /api/v1/*) intentionally omit a URL
 * context — they always target production. Wrap their fetcher calls with
 * withKeyAuthedBrainCall() so currentBrainBaseUrl() knows the absence of
 * a URL context is deliberate and does not emit a warning.
 *
 * Inside brainRequest() / serviceCall() the context is picked up automatically.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** Carries the resolved brain-core base URL for the current async context. */
const urlStore = new AsyncLocalStorage<string>();

/**
 * Marker store: set to `true` when a call is intentionally key-authed
 * (no session, always production). currentBrainBaseUrl() uses this to
 * distinguish "wrapper missing" from "wrapper intentionally absent".
 */
const keyAuthedStore = new AsyncLocalStorage<true>();

/**
 * Run `fn` with every brainRequest / serviceCall in its call tree hitting
 * `baseUrl`. Concurrent requests hold independent contexts — no cross-request
 * contamination even on a busy server.
 */
export function withBrainBaseUrl<T>(baseUrl: string, fn: () => Promise<T>): Promise<T> {
  return urlStore.run(baseUrl, fn);
}

/**
 * Mark a call tree as intentionally key-authed (no URL context needed).
 * Use this in the developer API route wrappers that receive an explicit API
 * key instead of a session. Without this marker, currentBrainBaseUrl() will
 * emit a warning for every unwrapped call that reaches it, since those would
 * otherwise be indistinguishable from a session-based handler with a missing
 * withBrainBaseUrl() wrapper.
 */
export function withKeyAuthedBrainCall<T>(fn: () => Promise<T>): Promise<T> {
  return keyAuthedStore.run(true, fn);
}

/**
 * Return the brain-core base URL set by the innermost `withBrainBaseUrl` in
 * the current async context.
 *
 * When no URL context is set:
 *   • If inside withKeyAuthedBrainCall() → returns `fallback` silently.
 *     Those routes always target production intentionally.
 *   • Otherwise → logs a WARNING. A session-based handler is missing its
 *     withBrainBaseUrl(session.baseUrl, ...) wrapper. The fallback (production)
 *     is returned so the call still works, but demo users would silently reach
 *     production instead of staging — this log line is the signal to fix it.
 */
export function currentBrainBaseUrl(fallback: string): string {
  const stored = urlStore.getStore();
  if (stored !== undefined) return stored;
  if (keyAuthedStore.getStore() !== undefined) return fallback; // intentional — no warning
  // Session-based call reached here without a withBrainBaseUrl context.
  console.warn(
    `[brain-url] WARNING: brain API call has no withBrainBaseUrl context — ` +
      `falling back to ${fallback}. ` +
      `A session-based handler is likely missing withBrainBaseUrl(session.baseUrl, ...). ` +
      `Demo users would silently reach production instead of staging.`,
  );
  return fallback;
}
