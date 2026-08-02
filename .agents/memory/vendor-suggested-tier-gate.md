---
name: Vendor Suggested tier gate
description: Why vendorTier() never returns "suggested" today and what must happen before it can.
---

## Rule

`vendorTier()` must **not** return `"suggested"` until brain-core ships a
provenance value that explicitly means "Brain-suggested, not yet confirmed" and
the predicate here is wired to it by name.

## Why

brain-core's provenance enum today is:
`extracted | inferred | ambiguous | human_confirmed | agent_contributed | customer_asserted`

None of these mean "Brain-suggested, not yet confirmed":
- `agent_contributed` = low-trust document contribution, **not** a suggestion.
- `customer_asserted` has no writer yet.
- Confidence thresholds are not a substitute.
- `trustStatus === "known"` is not a substitute — it means the counterparty is
  identified upstream, nothing more.

Using any of those as a proxy would silently display a chip whose label makes a
claim brain-core never made.

## How to apply

When brain-core ships a matching provenance value, add the predicate to
`vendorTier()` at the top (before the `isNeedsReview` check), document the
exact value name here, and run `qa:counterparties` against a fresh demo tenant.

**Do NOT wire the mount point or enable popup trust actions** until explicit
confirmation arrives that:
(a) the promote of brain-core PR #397 landed, and
(b) the diff review passed.

When both are confirmed:
- Wire list rows + popup from the single mount point.
- Use per-segment labels (Vendors → "Trust", Customers → "Confirm").
- Bulk confirm = N individual grant calls, not a batch endpoint.
- Run `npm run qa:counterparties` DOM checks against a fresh demo tenant
  (those checks are part of done, not optional polish).

## Wiring gate status (as of 2026-08-02)

brain-core PR #397 is **merged but not deployed** — promote blocked on an
infra secret. Trust routes must not be wired client-side until deployment
is confirmed here by the user.
