---
name: Unified record pager across mixed detail surfaces
description: Why Overview/Inbox Previous-Next must walk the rendered row list rather than each source queue, and the failure mode that keeps coming back.
---

# The pager walks the RENDERED list, not a source array

Overview and the Inbox each render ONE list assembled from several sources
(session payment intents, the live review queue, read-only ledger insights,
brain-core agent proposals), and each source opens a *different* modal.

The natural-looking implementation gives each source its own pager over its own
array. That is wrong, and it is wrong invisibly: Previous/Next silently stop at
the edge of whichever queue the open record belonged to, so opening the only
insight in the list makes Next dead while a dozen visible rows sit below it.

**Rule:** the pager's entries are the on-screen rows in display order, keyed by
**row id** — the only handle comparable across four unrelated record types.
Stepping closes whatever surface is open and then opens the neighbour's.

**How to apply:**

- Track which ROW is open, not which record. Every path that closes a surface
  must clear it, including the one that also performs return-to navigation.
- Close-before-open is load-bearing: the neighbour is often a different dialog,
  and skipping the close stacks two.
- Wrap the rows once, centrally, so a row added later cannot join the list while
  silently opting out of the pager. Per-row opt-in rots.
- Page linearly, never wrapping. With a "Record 4 of 17" readout a wrap makes the
  count lie about what Next does, and the ends are exactly where a user checks
  whether they have seen everything.
- An open record the list no longer contains (just decided, or filtered away)
  reports no position and no arrows. Stepping from a stale index lands on a row
  the user cannot see.
- **"Display order" means the order the SECTIONS draw, not the order the page
  built.** A tiered surface groups rows into Urgent / Waiting / Insights at
  render time, so a list assembled by source is silently a different sequence.
  Overview built [payments, insights, proposals] and drew [urgent, waiting,
  insight]: the insight rows were last on screen but third in the array, so Next
  from the top row (an urgent proposal, last in the array) could never reach
  them, while Previous could — the arrows worked, they just walked a list nobody
  could see. Order once, in a shared helper the sections and the pager both use;
  two call sites agreeing today is not the same as being unable to disagree.
- A row in a tier no section renders must be dropped from the pager too, not
  parked at the end. An entry for an invisible row is the same bug reversed.

# The regression a type-check cannot catch

Props are spread into these modals, so a modal that still accepts only the old
single `pagerDisabled` flag compiles fine and then renders `hasPrev={!disabled}`
— claiming a previous record exists whenever the pager exists at all. One of the
five surfaces shipped exactly that way.

**Why:** extra props in a spread are not an error, and the arrows look right
until you reach a boundary. There is now a source-level test pinning that every
paged surface accepts per-direction state and never derives an arrow from
`pagerDisabled` alone; keep new paged surfaces on that list.
