---
name: Members & approval authority — core integration
description: Design boundary + token rule for the core-backed Members/approval-authority surface (Settings → Team).
---

# Members & approval authority (Settings → Team) — core-backed

The Members/approval-authority surface is wired to the REAL brain-core API
(`/v1/members`, approve path) per `docs/contracts/members-attribution.md`.
Enforcement is **core-only**: the platform renders core's decisions and rejection
reasons, never re-derives or simulates them (no BFF-minted members, no client-side
approval gate, no special-casing the 403s).

## Token rule (the thing that breaks silently)
`POST /demo/provision-run` returns TWO principals: a MEMBER token (user-principal,
bootstrap admin) AND an AGENT token (propose-only).
- **MEMBER token backs ALL non-propose calls** — reads, `/members` CRUD, approve,
  `/approval-policy`, admin. **AGENT token is propose-ONLY.**
- **Why:** agents PROPOSE, humans APPROVE. An agent principal is never
  member-resolvable, so the AGENT token correctly + permanently 403s
  `actor_unresolved` on member/approval endpoints. Using the user-principal token
  from the provision response is the INTENDED design — the forbidden workarounds are
  BFF-minting a member token, fabricating an actor, or special-casing the 403.
- **How to apply:** `server/brain/auth.ts` reads the member token as `member_token`
  OR `tokens.member.token`; agent as `agent_token`/`tokens.agent.token`/legacy `token`.
  It THROWS a clear "requires the user-principal token" error if no member token —
  do NOT re-add an agent-token fallback for member calls. Re-probe: mint a demo
  session, `GET /api/brain/members` → 200 with the bootstrap admin = green.

## Invariants (keep these)
- **Cache is session-scoped.** `membersStore` cache is merge-only within a session
  (so a deactivated member that leaves the list stays resolvable for historical audit
  records — deactivate-not-delete), so it MUST be cleared on the auth boundary
  (`clearMembers()` on logout + account deletion). **Why:** without the reset a next
  session/tenant could see a previous tenant's cached members (stale-PII risk).
- **Core is authoritative in the detail popup.** Cache is a transient first-paint
  only; if the authoritative `GET /members/:id` ERRORS, show "unavailable" — never
  render stale cached member data.
- **ACTOR = SESSION.** Never send an `actor` field on session-authed calls (core
  strips it). No member switcher — two approvers = two signed-in sessions.
- **Bootstrap admin `perItemLimit` is int64-max (~9.2e18) = unlimited.** `isUnlimited`
  uses `UNLIMITED_FLOOR = 1e15` so it renders "No per-item limit", never a giant number.
- **All rejection reasons render inline (#D20344).** `self_approval_blocked` has TWO
  cases split by `detail.payee_unresolved` (true → "verify recipient / manual review";
  false → "can't approve a payment to yourself").
- **`openMemberDetail` resolves by id** against the API-backed cache (resolve-or-warn,
  plain-text fallback for inactive members).
