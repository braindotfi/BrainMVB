/**
 * BFF per-request correlation ID for brain-core calls.
 *
 * Uses AsyncLocalStorage so every brainRequest() / ingestRawDocument() call made
 * during a single Express request automatically carries the SAME X-Request-Id
 * without per-route plumbing.  brain-core re-binds its request logger from this
 * header (core PR #601), making BFF IDs searchable end-to-end.
 *
 * Usage:
 *   - Mount `bffRequestIdMiddleware` once in each router / route that calls
 *     brain-core.  All downstream calls within the same request context pick up
 *     the ID automatically via `currentBffRequestId()`.
 *   - On error, call `currentBffRequestId()` alongside the upstream
 *     `error.request_id` to log both halves of the correlation pair.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const store = new AsyncLocalStorage<string>();

/** Mint a fresh BFF request ID. */
export function mintBffRequestId(): string {
  return `req_${randomUUID()}`;
}

/**
 * Return the BFF request ID for the current async execution context.
 * Falls back to a fresh mint when called outside a bound context (background
 * jobs, unit tests that don't install the middleware).
 */
export function currentBffRequestId(): string {
  return store.getStore() ?? mintBffRequestId();
}

/**
 * Run `fn` inside a context where `currentBffRequestId()` returns `id`.
 * The store propagates through every async continuation started inside `fn`,
 * including fetch callbacks and promise chains.
 */
export function withBffRequestId<T>(id: string, fn: () => T): T {
  return store.run(id, fn);
}

/**
 * Express middleware — binds a fresh BFF request ID to every incoming request.
 * Mount once per router or route; all brain-core calls within that request
 * share the same X-Request-Id automatically.
 *
 * The ID is not sent to the client (it is a server-side correlation handle).
 * It IS forwarded to brain-core as X-Request-Id on every outbound call so that
 * brain-core's own request logs become searchable by BFF ID end-to-end.
 */
export const bffRequestIdMiddleware: RequestHandler = (_req, _res, next) => {
  store.run(mintBffRequestId(), () => next());
};
