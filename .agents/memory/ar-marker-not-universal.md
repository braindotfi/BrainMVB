---
name: AR scenario marker is not universal
description: Real brain-core tenants can return invoices with empty metadata, which blanks Receivables and inflates Payables by the whole AR book.
---

# The `metadata.scenario === "ar"` marker is NOT guaranteed

Receivables uses a positive test (`scenario === "ar"`); Payables uses its
complement (`scenario !== "ar"`). That pair is only safe if brain-core really
marks every receivable. **It does not.**

A live, pre-seeded brain-core tenant returned five unmistakable AR invoices
(invoice numbers literally prefixed `AR-`, all owed *to* the tenant) with
`metadata: {}` — no `scenario` key at all. Result, from the real functions run
over the real payload:

- Receivables: 0 rows, total `0` — the entire AR book is invisible.
- Payables: those same five invoices are absorbed as money owed, adding a
  fabricated sum to the liabilities figure on top of the genuine obligations.

The failure is silent and doubly wrong: the same rows vanish from one screen and
inflate the other, and both screens look healthy.

**Why:** the source comment on the complement helper asserts AR "IS positively
and reliably marked `"ar"` on every tenant (real or demo) by brain-core's
production write path". That claim is false for at least one real tenant, so it
must not be trusted as an invariant. The complement was itself a fix for an
earlier bug (testing for a literal `"ap"` returned nothing on real tenants), so
neither direction of a single-marker test is safe on its own.

**How to apply:** never let an *absent* marker decide a money direction. When
`metadata.scenario` is missing, the row's direction is **unknown** — it belongs
in neither total. Derive direction from something that actually exists on the
row (counterparty `type`, an explicit direction field like the obligations feed
carries) or disclose the unclassified rows rather than defaulting them into
payables. Any change to either helper must be checked against a tenant whose
invoices have empty metadata, not just the demo seed that sets the marker.
