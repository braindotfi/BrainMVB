---
name: Brain URL split (demo vs production)
description: Per-user brain-core base URL routing — demo accounts hit staging, real users hit production.
---

## The rule
Demo accounts (`isDemoEmail()` → `demo-fresh-*@brain.fi`, `demo@brain.fi`) target `brainConfig.demoBaseUrl` (default: `https://staging-api.brain.fi/v1`).
Real sign-up/sign-in users target `brainConfig.baseUrl` (default: `https://api.brain.fi/v1`).

## How it's wired
1. `createSession()` in `auth.ts` calls `storage.getUser()` once, checks `isDemoEmail`, sets `sessionBaseUrl.set(appUserId, baseUrl)`, and wraps all provision calls in `withBrainBaseUrl(baseUrl, ...)`.
2. `CachedSession` carries `baseUrl` (set from `currentBrainBaseUrl()` inside each provision function).
3. `getBrainSession()` returns `baseUrl` from `sessionBaseUrl` map (no extra DB hit).
4. Every proxy handler and routes.ts call site destructures `baseUrl` and wraps brain API calls in `withBrainBaseUrl(baseUrl, () => ...)`.
5. `brainRequest()` and `serviceCall()` call `currentBrainBaseUrl(fallback)` — zero signature changes to the ~30 wrapper functions.

## Env vars
- `DEMO_BRAIN_API_BASE_URL` — override demo target (default: `https://staging-api.brain.fi/v1`)
- `PROD_BRAIN_API_BASE_URL` or legacy `BRAIN_API_BASE_URL` — override prod target (default: `https://api.brain.fi/v1`)
- `BRAIN_PROVISION_SECRET` — accepted as alias for `BRAIN_DEMO_PROVISION_SECRET` (config.ts alias)

## Startup log confirms both URLs and secret readiness on every restart
Pattern: `[brain-config] demo target: <url> (token: <strategy>) | prod target: <url> (tenancy: <mode>) | platform-service: ✓/✗ | demo-provision-secret: ✓/✗`

**Why:** A single global base URL meant all users (demo and real) shared one brain-core target; now each user's session transparently reaches the correct upstream without changing any of the ~30 wrapper function signatures.

**How to apply:** Any new proxy route or routes.ts brain call must: (1) destructure `baseUrl` from `getBrainSession()`, (2) wrap brain API calls in `withBrainBaseUrl(baseUrl, () => ...)`. A missing wrapper now logs `[brain-url] WARNING: brain API call has no withBrainBaseUrl context` — that warning is the signal to fix it.

## Missing-wrapper guard
`currentBrainBaseUrl(fallback)` uses two ALS stores:
- `urlStore` — set by `withBrainBaseUrl(baseUrl, fn)` — carries the resolved URL
- `keyAuthedStore` — set by `withKeyAuthedBrainCall(fn)` — marks the call as intentionally context-free
If neither store is set, it emits `[brain-url] WARNING` (returns fallback so nothing breaks). Key-authed dev API routes (`/api/v1/*`) are wrapped with `withKeyAuthedBrainCall` in `registerKeyAuthedRead`, so they stay silent.

## Demo token strategy (priority order in createDemoSession)
1. `platformServiceSecret` present → `POST /tenants { demo_seed: true }` + X-Platform-Service-Auth. Codex-confirmed correct path. Staging's `/demo/token` requires `BRAIN_DEMO_MODE=true` (intentionally off). This is `provisionDemoTenant()` in auth.ts — creates an ephemeral tenant per login, fires `seedTenantDocuments` fire-and-forget.
2. `demoProvisionSecret` present → `POST /demo/provision-run` (fenced legacy route).
3. Staging URL fallback → `POST /demo/token` (only works when target box has `BRAIN_DEMO_MODE=true`).
4. Local key → in-process JWT mint.

## What `demo_seed:true` does vs `seedTenantDocuments`
- Brain-core's `demo_seed:true` on `POST /tenants`: populates ledger / sources / policy / agents / proposals directly. Returns a `demo_seed` summary object with IDs.
- BFF's `seedTenantDocuments` (seed.ts): uploads raw uploadable fixture files (PDFs/XLSXs) via `/raw/ingest` + polls `/raw/{id}/extract`. Runs sequentially, fire-and-forget. These are COMPLEMENTARY, not redundant.
- The ingest token must have `raw:write` scope — use the agent token (member token 403s on /raw/ingest, verified live 2026-07-24).

## Staging extract queue behavior
- Staging extract jobs sometimes queue for >120s (the BFF poll budget). When the budget expires, the BFF records status `extracting` honestly and moves on to the next document. This is correct behavior — the jobs may eventually complete on staging's side.
- Observed: ar_aging and payroll extracted within the budget; crypto_wallet CSV and form_1120 PDF entered the staging queue and showed `extracting` after the poll budget exhausted.

## Known issues
- `ingestRawDocument` in `client.ts` was originally hardcoded to `brainConfig.baseUrl` (multipart, bypasses `brainRequest`). Fixed to `currentBrainBaseUrl(brainConfig.baseUrl)`.
- `@brain.fi` emails were registerable via `POST /api/auth/register`, allowing `isDemoEmail()` spoofing. Fixed with a domain block.
