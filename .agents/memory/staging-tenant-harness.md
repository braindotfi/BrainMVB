---
name: Reaching a pre-seeded staging tenant from the dev server
description: How to attach the local BFF to an existing brain-core tenant that lives on staging, and why the obvious route silently targets production.
---

# Attaching the dev server to a staging brain-core tenant

The app splits brain-core targets: demo users → staging, real users → production.
A pre-seeded *staging* tenant is therefore unreachable by the normal signed-up-user
path, and the failure is not obvious.

**The trap.** `POST /api/brain/invites/consume` is the only way to attach an account
to a pre-existing tenant. Its `serviceCall()` resolves the host through
`currentBrainBaseUrl(brainConfig.baseUrl)`, but the handler — unlike the session-based
proxy handlers — is **not** wrapped in `withBrainBaseUrl(...)`. With no async-context
URL set it falls back to the production base URL. A staging-issued invite token sent
there comes back `invite_invalid`, which reads like a bad or expired token rather than
a wrong host. `registerBrainSession()` then pins the session to `brainConfig.baseUrl`
too, so every later read would follow the same wrong target.

**What works.** Repoint the *production* base URL for the dev process only:
set `PROD_BRAIN_API_BASE_URL` to the staging `/v1` URL in the **development**
environment (Replit writes this to `.replit` under `[userenv.development]`, so the
deployed app is unaffected), restart, and confirm the startup `[brain-config]` line
shows the staging host as the **prod target** — not just the demo target. Then
register a fresh account and consume the invite *immediately*: durable tenancy
auto-creates a tenant on first brain use, and consume returns `409 already_linked`
once an identity exists.

**Why:** the base-URL split is per-request async context, so a missing wrapper is
invisible until a call actually needs a non-default host.

**How to apply:** before blaming an invite token, verify the host it was sent to.
To test whether the platform service credential is accepted by a given host without
spending a single-use token, `POST /v1/sessions` with a nonexistent `external_ref`:
`403 session_identity_unlinked` means authenticated (credential good), `401` means
the credential is rejected. The same platform service secret is accepted by both
staging and production.

Revert by deleting `PROD_BRAIN_API_BASE_URL` from the development environment.
