---
name: BFF request-ID forwarding
description: How the BFF propagates a per-request X-Request-Id to every brain-core call, and how errors log both sides of the correlation pair.
---

## Rule

Every brain-core HTTP call (generic GET proxy, WRITE_ROUTES trust/members/propose paths, multipart ingest, and wiki/chat) carries the **same** BFF request ID as `X-Request-Id`.  The ID is generated once per Express request by `bffRequestIdMiddleware` via AsyncLocalStorage — **not** at each call site — so no per-route plumbing is needed.

When a `BrainApiError` occurs, `relayError` (proxy.ts) and the ingest error handler (routes.ts) log **both**:
- `bff_request_id=req_<uuid>` — the BFF-side handle, queryable in BFF logs
- `brain_request_id=req_<uuid>` — brain-core's own ID from `error.request_id`, queryable in core logs

**Why:** A single ID on one side alone is untraceable. Before this, a 5xx from brain-core was only localizable if someone captured the client-facing response at the exact moment. Now either ID can be grepped to find the counterpart log line on the other side.

## How to apply

- **New brain-core call in `brainRequest`/`ingestRawDocument`:** no change needed; `currentBffRequestId()` (from `./requestId`) is already called inside both.
- **New proxy route in `proxy.ts`:** no change; the router-level `bffRequestIdMiddleware` covers it.
- **New direct-call route in `routes.ts`** (outside the proxy router): add `bffRequestIdMiddleware` to the route middleware chain so the AsyncLocalStorage context is bound before any brain-core call.
- **Error handler for a new direct-call route:** call `currentBffRequestId()` and `extractCoreRequestId(err.body)` (both exported from `./brain/requestId` and `./brain/client`) and log them together.
- **The provision call in `brain/auth.ts`** goes through `fetch` directly (not `brainRequest`) and is intentionally NOT threaded — it is session-management machinery, not a per-user-request call. Tests must not assert that the provision call shares the BFF request ID.

## Key files

- `server/brain/requestId.ts` — AsyncLocalStorage store, `mintBffRequestId`, `currentBffRequestId`, `withBffRequestId`, `bffRequestIdMiddleware`
- `server/brain/client.ts` — `currentBffRequestId()` used in `brainRequest` and `ingestRawDocument`; `extractCoreRequestId(body)` exported
- `server/brain/proxy.ts` — `router.use(bffRequestIdMiddleware)` before `requireAuth`; `relayError` logs both IDs
- `server/routes.ts` — `bffRequestIdMiddleware` added to `/api/integrations/documents/ingest` and `/api/assistant/chat`
- `server/brain/trust-routes.test.ts` — asserts `requestId` matches `req_<uuid>` on trust calls; asserts error relay logs both IDs
