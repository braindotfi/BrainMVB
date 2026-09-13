---
name: Audit feed pagination and decision receipts
description: Why the audit history is read page-at-a-time, why a decision must not refetch it, and what a local decision receipt is allowed to claim.
---

## An infinite query refetches every page it has loaded

Invalidating a paginated (infinite) audit query re-issues **all** loaded pages,
not the first one. A single decision that invalidates the audit key therefore
costs one request per loaded page, and a user who has paged back through history
turns each decision into a burst.

**Why:** this is what the "approval disappears" incident actually looked like
from the server — dozens of `/audit/events` reads in a couple of minutes, which
reads as a hung backend and is not.

**How to apply:** a write that only needs the feed to be stale should invalidate
with `refetchType: "none"` and let the next read pick it up. Only refetch
immediately when the surface has no other way to show the outcome.

## Do not block a surface on a complete cursor walk

Rendering nothing until every page is read makes load time a function of history
length, and a failure on page 40 discards the 39 pages already in hand. Any page
ceiling on such a walk converts a large tenant into a permanent hard error.

**How to apply:** render page one, offer to load older, and keep three failures
distinct — first-page, later-page, and **refresh**. React Query answers the
third with `isRefetchError`; "pages exist, so it must be a later page" is wrong
for a failed refresh and reports the opposite of what happened. A failed refresh
keeps its rows but forfeits any claim that they are current.

## Completeness claims must follow what was actually loaded

Once a feed is paginated, every count, empty state, and derived "nothing to do"
built on it is a statement about the loaded slice. Under-reporting is the
dangerous direction: it looks like an all-clear.

**How to apply:** carry a partiality flag out of the hook (not just `isError`)
and let each consumer hedge — "N so far", "none in your recent history", or the
existing incomplete-read wording on a summary line.

## Decision receipts bridge confirmed-vs-published

When a "resolved" list is projected only from audit events, a decision the
backend has confirmed but not yet published exists nowhere: the source feed
drops it from pending and the audit feed has not caught up. The row vanishes.

A local receipt fills exactly that window. What keeps it honest:

- written **only** from a response validated to be about the submitted proposal
  and not contradicting the submitted decision — a 2xx status is not evidence;
- scoped to the user id and re-pointed (not cleared) through the session reset
  funnel, because an SPA account switch does not remount modules;
- deleted on undo, and deleted again once the authoritative audit record for it
  is loaded — a receipt that merely stops rendering is a second unreconciled
  record that returns when that page is no longer loaded;
- reconciled audit-first: exact audit id, then the proposal id but only on a
  record that is itself a **decision** (a proposal's creation event cites the
  same id and would retire the receipt the moment it was written);
- never a suppressor of anything the audit trail says.

## Effective state comes from a state read, never a replayed feed

Deriving "is this record settled" by replaying the audit feed makes the answer a
function of how much history happens to be loaded. Paginate that feed and the
derivation silently becomes wrong: the hide switch reads the loaded slice, so a
settled record whose decision event sits on an unread page stays in the queue
forever.

**Why:** this was the actual shape of the "approval never reaches Resolved" bug,
and it survived two fixes aimed at the feed because the feed was never the
problem. Brain-core publishes the current state directly
(`proposals/decision-states/query`, `execution:read`, batched, explicitly
documented as not derived from audit history); that read is the answer.

**How to apply:** for any "already handled / already decided / already seen" set,
ask the source of truth for the current state of the specific ids on screen.
If that read fails, fail **open** — show the row. Hiding is the direction that
loses work silently, because a record removed from a queue leaves no trace the
operator could notice.

## A batched read's query key needs the ids inside it

Batching a state read into chunks and keying each chunk by a joined string looks
equivalent to keying it by the id array, and is not: a mutation can then only
invalidate by key prefix, which refetches **every** batch. A large queue turns
one decision into one request per batch.

**How to apply:** put the id list in the key structurally and invalidate with a
predicate that tests membership. Make that predicate a named exported function
with its own test — the prefix-matching version produces correct data and is
invisible in the UI, so nothing else catches it.

## Fail-open hiding still owes the user a disclosure

A hide switch that fails open is correct and, on its own, dishonest: the
unconfirmable record renders as a live row with working buttons, and pressing
one is how the operator discovers it was already decided.

**How to apply:** carry the ids that got no authoritative answer out of the hook
alongside the set, and say the coverage is incomplete. Count "no usable answer"
properly — an unfound row, a null state, and a self-contradicting row are all
gaps, not quiet negatives — but a request still **in flight** is neither; calling
it a gap flashes a false warning on every load.
