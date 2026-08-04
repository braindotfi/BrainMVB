/**
 * Per-request brain-core base URL carrier (AsyncLocalStorage).
 *
 * Lets the BFF route any given request to the right brain-core target
 * (staging for demo users, production for real accounts) without
 * threading a baseUrl parameter through every helper function in
 * client.ts and tenancy.ts.
 *
 * Usage in a route handler:
 *   const { token, baseUrl } = await getBrainSession(userId);
 *   return withBrainBaseUrl(baseUrl, async () => {
 *     const invoices = await listLedgerInvoices(token, { limit: 20 });
 *     return res.json(invoices);
 *   });
 *
 * Inside brainRequest() / serviceCall() the context is picked up automatically.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<string>();

/**
 * Run `fn` with every brainRequest / serviceCall in its call tree hitting
 * `baseUrl`. Concurrent requests hold independent contexts — no cross-request
 * contamination even on a busy server.
 */
export function withBrainBaseUrl<T>(baseUrl: string, fn: () => Promise<T>): Promise<T> {
  return store.run(baseUrl, fn);
}

/**
 * Return the brain-core base URL set by the innermost `withBrainBaseUrl` in
 * the current async context, or `fallback` when called outside any context
 * (e.g. module startup, fire-and-forget seeds that set their own context).
 */
export function currentBrainBaseUrl(fallback: string): string {
  return store.getStore() ?? fallback;
}
