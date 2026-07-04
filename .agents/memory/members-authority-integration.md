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

### Two-token model — confirmed intended design (2026-07-03)
The bootstrap-admin change shipped: `POST /demo/provision-run` now returns an
`actor: user_...` (the admin member is created) plus an AGENT token (`principal_type:
"agent"`, `sub: agent_...`, no member claim/scope). The agent token getting **403 on
`/v1/members` is CORRECT and PERMANENT** — agent principals are never member-resolvable
(agents PROPOSE, humans APPROVE). The in-progress core fix will ALSO issue a
**user-principal session bound to the bootstrap admin, alongside** the agent token.
- Platform integration: member/approval/`/members` calls MUST use the USER-principal
  token; the agent token stays for propose-only calls. (`server/brain/auth.ts` currently
  caches ONE token per app user — will need to carry both once core returns both.)
- Using the user-principal token from the provision response is the INTENDED design, not a
  workaround. The forbidden workarounds are: BFF-minting a member token, fabricating an
  actor, or special-casing the 403.
- Acceptance test: re-run the probe with the USER session — 200 from GET /members with the
  bootstrap admin member = green.

## Re-probe 2026-07-04 — STILL RED (member token not issued)
A task claimed prod shipped both tokens; the live `https://api.brain.fi/v1` re-probe says
otherwise. `POST /demo/provision-run` → 201 with keys `tenant_id, agent_id, actor, token,
expires_in, scenario`. The bootstrap admin IS created (`actor: user_…`), but the ONLY JWT in
the whole response is `$.token` with `principal_type:"agent"` — NO `tokens.member.token`, no
`member_token` alias, no user-principal session anywhere. So the gate's step 2 (GET /members
with a member token → 200) can't even run. Negative control still correct: agent token → GET
/members → 403 `actor_unresolved`. **Conclusion: the user-principal/member-token half of the
core fix is not live on api.brain.fi yet.** Hold the build; do not fabricate an actor, mint a
member token in the BFF, or special-case the 403 — those are the forbidden workarounds.

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
