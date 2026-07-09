---
name: Brain staging demo-token endpoint
description: Status/gotcha for the staging brain-core demo-token auth flow (POST /demo/token)
---

Brain's staging integration guide documents a key-free `POST /v1/demo/token` (empty JSON body,
no auth header) against `https://staging-api.brain.fi/v1`, returning a single 24h token with
`raw:read/write`, `ledger:read`, `wiki:*` scopes (no member/agent split, unlike the live/prod
`/demo/provision-run` flow).

As of 2026-07-09, the live staging box rejects this exact route with
`401 { code: "auth_token_missing", message: "missing bearer token" }` — even the guide's own
curl example 401s when run directly against `https://staging-api.brain.fi/v1/demo/token`.
`https://staging-api.brain.fi/health` itself is up and reachable, so the box is alive; only the
documented demo-token route is broken/misconfigured.

**Why this matters:** if you're asked to wire up or debug the staging integration and it doesn't
work, this is very likely the same known issue, not a bug in the BFF code. The client-side
implementation (`server/brain/auth.ts` `provisionStagingDemoToken`, selected via
`brainTokenMode()` in `server/brain/config.ts` when `BRAIN_API_BASE_URL` points at
`staging-api.brain.fi`) matches the guide's documented contract exactly.

**How to apply:** before spending time re-implementing or "fixing" the staging demo-token client
code, re-curl the guide's own example against the live staging box first to confirm whether the
401 has been resolved server-side. If it still 401s, this is a staging-side issue to raise with
whoever owns that deployment — not something fixable from this repo. `BRAIN_API_BASE_URL` is left
unset in this project (defaults back to the working live-box `demo-provision` flow via
`BRAIN_DEMO_PROVISION_SECRET`) until staging is confirmed fixed.
