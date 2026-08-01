---
name: Source freshness captions
description: Which source feeds actually know when they were last read, and why a connection time must never be captioned as a sync time.
---

# Only some sources know when they were last read

Three different feeds back the "what Brain reads from" surface, and they carry
different knowledge about recency:

- **brain-core sources** (`/api/brain/sources`) publish `last_synced_at` and a
  `freshness` verdict. Demo/seeded rows also carry `sync_disabled: true` in
  metadata — they are *designed* never to sync again.
- **Plaid bank connections** and **tool connections** publish only a
  connected-at timestamp. Nothing in the payload says when the feed was last
  read.

**The rule:** print a sync time only where the source publishes one; elsewhere
say "connected \<date\>". Never caption a connection time with "last synced",
and never flag a source as stale/overdue when upstream says it never syncs.

**Why:** captioning a connection time as a sync time tells someone their bank
feed is current when it may not have been read since the day they linked it —
on a page whose whole purpose is answering "is Brain seeing my money?". And
flagging a `sync_disabled` fixture as overdue is crying wolf about something
that is working as designed.

**How to apply:** the caption helpers live next to the row types, not in the
component, so they stay unit-testable. Any new source feed added to the surface
has to declare which of the two shapes it is before it gets a time phrase.

# Watch the parser, not just the UI

Both `last_synced_at` and `freshness` existed upstream for months while the
client parser silently discarded them, so the UI had no way to be honest even
though the data was there. When a caption looks impossible to render truthfully,
probe the live endpoint before designing around the absence — the field may
already exist and be getting dropped one layer below.

# Retiring a wizard shell, not its screens

When a multi-step modal is replaced by a permanent surface, the connect screens
are usually still real integrations and are usually *also* mounted by
onboarding. Retire the shell (step machine, step dots, the list embedded in the
modal) and give the screens a variant flag so they can render inline. Suppress
only chrome that the host surface now provides: headings, "Done" buttons, and —
importantly — any list of already-connected things, which the host renders
directly below and would otherwise appear twice.
