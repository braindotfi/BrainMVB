---
name: Members & approval authority — core integration readiness
description: Precondition + design boundary for wiring the platform Members/approval-authority surface to brain-core.
---

# Members & approval authority (Settings → Team) — core-backed integration

The platform Members/approval-authority surface must be wired to the REAL brain-core
API (`/v1/members`, approve path, webhooks) per `docs/contracts/members-attribution.md`.
Enforcement is **core-only**: the platform renders core's decisions and rejection reasons,
never re-derives or simulates them (no BFF-minted members, no client-side approval gate).

## Hard precondition — verify before building
Re-run the exact probe: mint a fresh brain-core session (demo-provision) and call
`GET /members` (proxy path `/api/brain/members`; base URL already includes `/v1`).
- **Ready** = HTTP 200 with at least one bootstrap admin member.
- **Not ready** = HTTP 403 `payment_intent_approval_invalid` / reason `actor_unresolved`.
If not ready, STOP and report. Do NOT fall back to mocks or special-case the 403.

## Why it was blocked (as of 2026-07-03)
Members deployment landed (route live, gate enforcing, exact contract reason strings),
but tenant provisioning did NOT seed an initial admin member, so demo-provisioned tenants
have no actor to resolve → every members call 403s `actor_unresolved`.

### Second core gap found after the bootstrap-admin fix (2026-07-03)
The bootstrap-admin change shipped: `POST /demo/provision-run` now returns an
`actor: user_...` (the admin member is created). BUT the session token it returns still
has `principal_type: "agent"`, `sub: agent_...`, NO member/actor claim, NO members scope.
So `GET /members` still 403s `actor_unresolved` — nothing links the demo session's
PRINCIPAL (agent) to the created MEMBER (user actor). Remaining core-side fix: either
provision an identity-link between the agent principal and the admin member, OR return a
user-principal (member) token from provisioning. Acceptance test unchanged: a fresh
session must get 200 from GET /members. Do NOT swap in a user-principal token or special-
case the agent token from the platform — that's the forbidden workaround.

## Design boundary (once unblocked)
- ACTOR = SESSION; never send an `actor` field on session-authed calls (core strips it).
  No member switcher — two approvers = two signed-in sessions.
- UI affordances (hide/disable approve controls) derive from the CURRENT member's envelope
  fetched from core; server response is always final (a UI bypass still hits core's 403).
- All 7 rejection reasons render inline (#D20344). `self_approval_blocked` has TWO cases,
  split by `detail.payee_unresolved` (true → "verify recipient / manual review"; false →
  "can't approve a payment to yourself").
- `openMemberDetail` resolves members by id against the API-backed members cache
  (resolve-or-warn, plain-text fallback "(member inactive)" for deactivated — they must
  still resolve for historical audit records: deactivate-not-delete).
