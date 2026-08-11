---
name: Decided-proposal suppression is a hide switch
description: Rules for the set of "already decided" proposal ids the Inbox and Overview subtract from the live feed — why it must model effective state, and why a wrong entry is invisible.
---

brain-core never removes a decided proposal from `GET /v1/proposals`; it only
writes a `proposal.decided` audit event. Every surface counting pending work
therefore subtracts a set of "already decided" ids derived from the audit feed.

**That set is a hide switch, and a wrong entry produces no visible error** — it
produces a record the tenant is never shown and cannot know to look for. It
needs three properties, and each one has already been violated once:

1. **Decisions only.** An agent filing a proposal emits `agent.action.proposed`
   quoting the same id in the same `inputs.proposal_id` field a decision uses.
   Only the `action` distinguishes them. Widening the rule to "any event
   mentioning a proposal id" hides every record while its own creation event is
   inside the audit page — and because that page is capped, *which* records
   vanish drifts as the tenant ages.
2. **Effective state, not a tally.** `undo` is one of the four decisions
   (`approve`/`reject`/`acknowledge`/`undo`) and it REOPENS the record. Replay
   decisions oldest-first and let the last one win: core returns newest-first,
   so the sort is what makes "last decision wins" mean the latest one. Treating
   any `proposal.decided` as terminal hides a proposal an undo just put back.
3. **Fail open.** The audit read is capped, so the set is a floor. A decision
   outside the window leaves a settled row on the list — the harmless
   direction. It must never be able to remove a record nobody decided.

**Why:** the suppression was silently dead for a long time — `AuditRecord`
declared an optional `proposalId` that the mapper never assigned, so the guard
read `undefined` on every record and suppressed nothing. An optional field plus
a truthiness check compiles, passes types, and looks implemented. It went
unnoticed because brain-core's own `status` filter already drops decided rows
in the normal case; the guard only matters in the window where core still
reports `pending` while the decision event is written.

**How to apply:** derive the set from `decidedProposalIdsFromEvents` /
`useDecidedProposalIds` (shared query key — mounting it costs no extra request),
never by scanning mapped audit records for a proposal reference. If you add a
fifth decision verb, decide explicitly whether it is terminal or reopening.

**Related trap — diagnosing this surface:** a section that only renders when it
has rows is indistinguishable from a broken one on a tenant that has none, and
a DOM probe against a guessed testid reports ABSENT for a section that renders
perfectly. Confirm the testid in the source before concluding a section is
missing, and gate the check on a witness (inject one and say that you did).
