---
name: Counterparty trust is not a state machine brain-core has
description: Why the Ledger's Trusted tier is underivable, which counterparty fields are real vs rejected, and the one-predicate rule for the review queue.
---

# There is no vendor/counterparty trust state machine upstream

brain-core's ledger counterparty surface is: list, create, get by id, patch, get
resolved. There is no grant-trust, revoke, pause or restore — not in the
api-surface artifact, not in the deployed `openapi.yaml`, not in the service
routes. Do not go looking for one because a PR title mentions counterparties;
the "manual counterparty" PRs add create/patch, not trust.

Worse, brain-core **actively rejects** writes to `provenance`, `confidence`,
`verified_status` and `risk_level` on both create and patch (there is an
explicit reject-trust-fields guard, and the manual-counterparty contract doc
states these are server-derived). So probing "can I set verified_status?"
fails by design — it is not a permissions problem to work around.

**Why:** this means a "Trusted" tier is *underivable*. Nothing the user or the
app can do could ever produce it, so rendering it as an ordinary empty list
("no trusted vendors yet") implies a path that does not exist. The tab must say
granting trust is unavailable. Likewise "mark as reviewed" cannot be persisted —
it would be a trust-field write — so any `reviewed = false` clause in a spec is
permanently false and should be documented as such rather than faked in local
state.

**How to apply:** before designing any counterparty trust/approval affordance,
assume the write does not exist and check the api-surface artifact first. If a
control cannot be backed by a real endpoint, ship it visibly disabled with
honest copy rather than wiring it to local state.

## What IS real on a counterparty list read

`payment_count` and `payment_total` are real and deployed. `payment_total`
arrives as a decimal **string**, and reads are proxied without normalization, so
coerce both defensively — an unparseable value must read as "no payments", never
`NaN` or a fabricated `$0.00`.

These two fields are the only honest basis for a tier above "new": no risk plus
real payments = a "known"/suggested counterparty. Risk must outrank history — a
flagged payee stays under review no matter how often it has been paid, and must
never be suggested for trust.

`type` splits the list into Vendors vs Customers. Only `customer` is a customer;
everything else (including `other` and future unknown types) belongs in the
vendor segment, so no row can fall through the split and become invisible.

## One predicate behind a count and the list it opens

This screen shipped a red banner and a filter chip driven by *different*
predicates, so the page warned about N rows and then showed a different set when
you clicked through.

**Why:** a count that describes rows the active filter refuses to show teaches
the user the number is noise. It is worse than no warning.

**How to apply:** any "N items need attention" signal and the list it opens must
come from one exported predicate over one already-scoped collection. Pin it with
a test that asserts *badge value === rendered row count*, and re-assert it after
scoping (segment/tab) changes — the unit test proves the function agrees with
itself, so a DOM-level check is what actually proves the component renders what
it counted.
