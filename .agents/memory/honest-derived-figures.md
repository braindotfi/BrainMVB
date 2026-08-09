---
name: Derived figures that silently drop part of their input
description: Two recurring ways a computed financial figure excludes something it should have counted — an extremum that skips the starting state, and completeness inferred from a row count.
---

# Derived figures that silently drop part of their input

Two failure shapes, both found in review, both of which produce a *confident,
plausible, wrong* number rather than an error.

## 1. An extremum must include the starting state

A "lowest point" / "peak" / "worst case" computed by folding over EVENTS, with
the accumulator seeded to `null`, can only ever return an event. The starting
state is silently ineligible.

For a cash floor that means: when every scheduled event is an inflow, or the
account is **already overdrawn today**, the callout quotes a later, higher
figure as the low — understating exactly the risk the card exists to show.

**Why:** the seed value encodes an assumption ("the answer is one of the
events") that nobody states out loud.

**How to apply:** seed the extremum with the day-zero value and compare
strictly, so an event has to genuinely beat the present to take the label.

## 2. Completeness is what the FEED says, never what the row count implies

`rows.length >= LIMIT` is not a completeness test. A short page with a live
`next_cursor` is an unfinished read, and brain-core is free to return fewer rows
than asked for and still hand back a cursor.

Inferring completeness from the count turns an unfinished read into a
reassuring empty state — the Inbox printing "nothing needs your attention" over
stalled agent runs it never fetched.

**Why:** the count answers "did I fill a page", not "is there more".

**How to apply:** derive truncation from the cursor. Keep the row-count check
only as a backstop for a response that omits the cursor field **entirely** — an
absent field is no information, which is not the same as an explicit `null`.
