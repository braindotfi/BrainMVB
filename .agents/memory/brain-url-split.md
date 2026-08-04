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

## Known issues
- `ingestRawDocument` in `client.ts` was originally hardcoded to `brainConfig.baseUrl` (multipart, bypasses `brainRequest`). Fixed to `currentBrainBaseUrl(brainConfig.baseUrl)`.
- `@brain.fi` emails were registerable via `POST /api/auth/register`, allowing `isDemoEmail()` spoofing. Fixed with a domain block.
- Staging `/demo/token` currently returns 401 `auth_token_missing` — pre-existing staging-side issue, not a routing regression.
