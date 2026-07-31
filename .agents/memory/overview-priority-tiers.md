---
name: Overview priority tiers (Urgent / Waiting on you / Insights)
description: How a record's tier is decided, why it is never keyed by proposal type, and the severity cut plus its open question.
---

# Tier is a function of `available_decisions`, never of `proposal_type`

One module owns the mapping. Nothing else may decide a tier, and no surface may key
a tier, colour, or button set off the proposal's type.

- Offers `approve`/`reject` → actionable, then split by severity.
- Offers only `acknowledge` (or only `undo`) → informational.
- Offers nothing this app can submit → no tier at all; the row is dropped rather
  than shown under a tier promising an action the surface cannot deliver.

**Why:** `fraud_anomaly` reads as the most urgent, actionable thing on the board and
is currently the opposite — notify-only, `[acknowledge]`, nothing to approve.
Compliance behaves the same; treasury / `cash_forecast` / `subscription` are the ones
offering `[approve, reject]`. Any table keyed by type puts an Approve button on a
record whose only legal decision is `acknowledge`, and core rejects the write.

**The payoff, and the reason to keep it this way:** promoting fraud to
approve/reject is a pending brain-core policy decision. Because tier is read from
the API response on every fetch, that promotion moves those rows into the actionable
tiers by itself — no code change, no release. A type table would need one.

## Materiality: the thresholds are not where everyone thinks they are

`elevated` reaches Urgent only when the amount clears the tenant's own configured
limit for that proposal type. The limits come exclusively from rules the tenant
actually configured; there is deliberately no built-in default.

**The trap:** the familiar "$25k collections / $50k treasury" figures are copy in the
v6 prototype HTML and one mock fixture. They are not configured anywhere real —
`GET /api/rules` returns `[]`, so today no type has a limit and no `elevated` record
promotes. Do not "restore" those numbers in code; hardcoding them escalates rows
against a limit the user never set and silently disagrees with the one they later do.

Join rules to proposals by scope, and mind the drift: rules are scoped by `Agent`,
proposals carry a `ProposalType`, and the unions already disagree on
`revenue_intel` ⟷ `revenue_intelligence`. An unaliased mismatch fails silently — the
threshold just never applies. Types with no `Agent` counterpart (bill_management,
tax_prep, the personal-finance set) can have no rule and never promote; that is
correct. Only ACTIVE rules count, and where several cover one type the lowest limit
wins because it is the first one breached.

## Reconciliation is stricter, not looser

Unlike everywhere else, a `high` band alone does not escalate a reconciliation
record: it also needs an unresolved match and a material amount, or a pile of small
unmatched cents owns the red tier. The `match_type`/`status` values this reads are
**unverified** — the reference tenant has zero reconciliation proposals and zero
reconciliation-match rows — so the predicate fails closed by design.

## The severity cut, and why absence must not escalate

`risk_band` (`low | standard | elevated | high`) is the only severity signal a
proposal carries. `confidence` is a 0-1 float — too noisy to tier on; `mode` and
`status` are not severity.

Confirmed cut (2026-07-31): `high` + `elevated` → Urgent, `standard` + `low` →
Waiting on you. A null/absent band is **never** Urgent.

**Why:** whether core populates `risk_band` consistently across every
approve/reject-capable type is still unconfirmed upstream — the same coverage
problem `matched_rule_id` had for fraud. Escalating on missing data fills the red
tier with rows whose severity nobody asserted, and people learn to scroll past red.
Under-reporting is recoverable; crying wolf is not.

**How to apply:** if the cut changes, it is one exported constant plus its test. Do
not re-derive severity at a call site.

## Records with no submittable decision are dropped from Overview

They are also filtered out of the Inbox by the decidability rule, so a pending record
offering nothing writable is currently invisible on both primary review surfaces.
This is deliberate (better than a dead button) but it is a product tradeoff, not an
invariant — if such records start appearing in real tenants they need an explicit
read-only bucket rather than silent suppression.
