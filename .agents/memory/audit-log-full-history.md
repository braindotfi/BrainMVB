---
name: Audit Log full-history surface
description: Where the complete audit trail lives, and the two honesty traps that come from merging a capped remote read with local rows.
---

## Where the trail lives

There are two audit surfaces and they are not interchangeable:

- **Inbox / Decisions timeline** — settled *decisions* only. No type filter, no
  category badges. It is a decision queue and must stay one.
- **Settings → Audit Log** (`/settings?section=audit`) — the *complete* trail:
  decisions + assistant Q&A + system/pipeline events, with no filter applied at
  load.

The old standalone Audit Log page is still deleted; `/audit-log` is still only a
query-preserving redirect to `/inbox` (it carries `?record=` deep links to the
timeline popup). Adding the Settings surface did not resurrect that route.

Categorisation is not re-derived: `partitionSystemActivity` (auditVisibility) and
`isAssistantActivity` (auditTypes) are the classifiers. Three categories, three
filter options — assistant Q&A is badged separately so "Decisions only" genuinely
means decisions.

## Trap 1: a cap measured on the wrong list

The audit read asks brain-core for a fixed number of events and does not follow
the cursor, so a full page back means "at least N", never "N". But the list on
screen is that page **merged with locally-recorded assistant questions**, which
are not subject to the read's limit.

**Rule:** compare the raw response length against the limit, never the merged
list length.

**Why:** measuring the merged list lets a couple of local rows push a short page
over the line, and the UI then claims older history exists when it does not —
inventing a trail is worse than under-reporting one.

**How to apply:** any surface that discloses a cap or renders an "N+" count needs
the pre-merge count plumbed through from the hook alongside the records.

## Trap 2: a failed read that does not empty the list

Local rows survive an audit-feed failure, so `isError` can be true while
`records.length > 0`. The empty state never renders, and the usual
"unreachable ≠ empty" empty-state copy never fires.

**Rule:** when the primary feed fails, show an explicit incomplete-list notice
*above the rows*, drop any completeness claim from the scope copy, and suppress
the count badge.

**Why:** a handful of browser-recorded questions sitting under a heading that
promises "every recorded event on this tenant" is a completeness claim the page
has no standing to make — and it is the reading an operator will take.

**How to apply:** wherever a list merges a remote read with a local fallback,
`isError` needs a rendering path independent of `length === 0`. Checking only the
empty branch is the bug.
