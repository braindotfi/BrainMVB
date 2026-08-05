---
name: Ledger figures arrive in waves
description: A brain-core ledger read can be complete, self-consistent and wrong because rows land in later waves — how the UI is supposed to handle that.
---

A brain-core Ledger list read has THREE possible shortfalls, and only one of them is
visible in the response:

1. **Truncated** — the list pages behind a cursor. `complete` from the cursor walk.
2. **Not all projected yet** — brain-core turns each ingested document into ledger rows
   asynchronously, so a tenant's records appear in waves over ~a minute. Every
   intermediate read is HTTP 200, internally consistent, plausible, and short. Nothing
   in the payload distinguishes it from the final one.
3. **Seed not started** — a demo tenant is provisioned lazily on the session's first
   brain call. For the first seconds there is no document AND no run in flight, which
   from the browser is identical to an account that genuinely has nothing.

**Why it matters:** payables read $211,200 → $278,328.76 → $287,223.39 on one fresh
tenant, and the first figure sat there as a settled-looking total until the page was
reloaded by hand. Money figures must never be quoted from a read that cannot be shown
to be finished.

**How to apply:** any surface totalling a ledger feed needs all three answered.
- Truncation: gate the sum on the cursor walk's `complete`, and make the read-state
  parameter REQUIRED so a new call site cannot default into false confidence.
- Waves: take the ingest signal from outside the feed — document extract/projection
  progress, ORed with the server's own "seed still expected" answer. Keep showing the
  number (it is a true floor) but caption it; never invent how much is missing.
- Zero rows is four different states — failed, unfinished read, unfinished import,
  genuinely empty — and only the last may say "nothing outstanding". Decide the branch
  order in a pure view function, not in JSX ternaries, and pin it with a test that the
  tab has a branch for every kind: an unhandled kind silently falls through to the row
  list, it does not error.

**Also:** this app's query defaults are `staleTime: Infinity` with no interval and no
refetch on focus, so the FIRST answer is the last answer. Anything watching data that
fills in over time must poll explicitly; an edge-triggered watcher whose source list
starts empty (a fresh tenant's documents) never arms at all.
