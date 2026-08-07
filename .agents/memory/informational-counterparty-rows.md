---
name: Informational (non-actionable) counterparty rows
description: How rows that exist as bookkeeping artefacts rather than parties are gated out of trust controls and out of the work queue, without vanishing.
---

Some counterparty rows are placeholders brain-core keeps to group entries from a
source document, not parties anyone transacts with (first case: payroll runs,
which are ingested against one placeholder rather than per employee). No trust
transition means anything on them.

## Rule 1 — special-casing a broad enum bucket needs both halves, and must fail open

The marker for these rows is a *pair*: a generic `type` value plus a metadata
discriminator. The generic value on its own is a catch-all that ordinary
counterparties land in.

Match on both, and treat an absent/unreadable discriminator as "not reported",
leaving the row fully actionable.

**Why:** the two failure directions are not symmetric. A placeholder that keeps
its controls is a cosmetic miss. A real counterparty that loses its controls is
stranded — there is no screen left that can review it. Fail toward actionable.

**How to apply:** any predicate that strips affordances off a subset of a shared
enum. Read the discriminator through a typed helper (the field is proxied
verbatim from upstream, so its shape is not ours to assume) and pin every
half-match in tests, not just the positive case.

## Rule 2 — a row nobody can action must not sit in a work queue

Needs Review's badge is the screen's single attention signal. A permanently
unactionable row in it means the count can never reach zero, which is what makes
the badge worth looking at at all.

Do not solve this by filtering the row out of the list: that trades an inflated
count for an invisible row. Give it its own tier, hidden while empty (the same
pattern the Suggested chip uses), so the queue counts only real work and the row
is still findable.

**Why:** the standing invariant on this screen is that a count and its rendered
list are the same partition of the same array. Both the "leave it counted" and
the "filter it out" options break it in opposite directions.

**How to apply:** whenever a row becomes non-actionable for a structural reason
rather than a user decision. Tier order is a statement about what the user can
DO — so the informational check runs *ahead of* the risk check, because a risk
signal on a row with no controls still cannot be reviewed. The flag itself stays
rendered on the row so the signal is not lost.

## Rule 3 — omit the controls, and override the tier chip too

Derived status ("new", "known") comes from payment history and does not know the
row is an artefact. Leaving it renders "New Vendor" on a row that can never be
reviewed — an invitation to an action that does not exist. Override the heading
and the status chip alongside removing the buttons.

Guard the write path as well as the UI: the trust-write mount point is the only
place these calls originate, so it is the only place that can promise no
decision is ever recorded against a placeholder (deep links and stale popups
reach the handlers without passing a button).
