---
name: Refreshing brain data after document upload
description: Why uploads don't refresh Home/Finances/Inbox on their own, what a correct fix has to survive, and why invalidation alone never fixes a second tab.
---

# Invalidation only reaches the tab that acted

`invalidateQueries` after a write repaints every consumer **in that browser tab** —
they share a query key and a cache, so one grant updates the panel, the pickers and
search together. It does nothing for a second tab on the same account, or a teammate
on the same tenant: that tab holds its own cache and, under this app's defaults, is
never told anything changed.

So "the write invalidates" is not the same claim as "the UI is fresh", and a bug
report saying *changes don't show up without a manual refresh* is usually about the
second tab, not a missing invalidation. `refetchOnWindowFocus: true` is the fix that
actually addresses it — returning to a backgrounded tab is precisely when its stale
rows are about to be read and acted on. A slow interval is the backstop for a tab
left open and focused.

**How to apply:** any read that a user can act on from more than one place wants the
shared ledger interval plus focus refetch, not just invalidation at its write sites.
Take the interval from the shared helper rather than a local constant, so the feeds
sitting next to each other on screen cannot drift onto different schedules.

**Watch out:** hooks that fan out (a list query whose ids spawn a per-id detail query
each) multiply every *interval tick* by the number of rows, so they usually want focus
refetch without an interval — one bounded burst per focus, not a standing multiplier.

## On a fan-out hook, refresh whichever query holds the filter

Refreshing the list is the intuitive fix and can be worth nothing. What matters is
where the predicate that removes a settled row lives:

- If the list's id-selection has **no status predicate** (it selects on "has a linked
  record" or similar), a settled row keeps its id on the refreshed list. The detail
  record is what carries `status`, so leaving the details on infinite stale time means
  the refreshed list re-renders exactly the same stale rows. The list refetch is pure
  cost.
- The fan-out therefore needs the focus refetch **too** — and it is the half that
  actually fixes the bug.

**Why:** the list/detail split hides which query is authoritative for the thing the
user is looking at. "The queue refreshed" is not the same claim as "the queue is
correct" when the filter reads a different query's cache.

**How to apply:** before adding refetch options to a fan-out hook, find the predicate
that drops a decided/settled row and follow it to the query that supplies its input.
Give that query the refetch, then decide whether the list needs one as well. A guard
that asserts only the list refetches will pass while the surface stays broken.

# Refreshing /api/brain/* after an upload

Every React Query default in this app is set to never refetch on its own
(infinite stale time, no focus refetch, no interval). Any code path that
introduces new server-side data is therefore responsible for its own
`invalidateQueries` call. If you add a new write/ingest path and the UI
"doesn't update until logout/login", this is why — it is not a caching bug,
it is a missing invalidation.

**Why:** the defaults were chosen to keep this read-heavy UI quiet, so the
refresh contract is explicit-invalidation-only. Logout/login appeared to
"fix" stale data only because it remounted the whole tree past the cache.

## Extraction completing is not the same as data being ready

brain-core's extract job reporting success says nothing about the downstream
ledger projection chain (APAR rebuild, account/transaction rebuild, wiki
regen, agent trigger). Those run asynchronously afterwards, and **there is no
per-document "projected" signal exposed to the client**. So invalidating once
when extraction reports done can still paint an incomplete picture.

Until brain-core exposes a per-document projected status, any client-side fix
is a timing heuristic, not a correctness guarantee. Treat a settle window
(re-invalidating for a while after extraction) as a stopgap and say so.

## The projection_status signal, and its backfill trap

brain-core added a real per-document signal — `projection_status` on the raw
artifact, with `pending -> projecting -> projected`, plus terminal
`projection_timed_out` / `projection_failed`. It is documented as a *lifecycle*
signal (the side-effect chain ran end to end), explicitly **not** a row-count
validator; use audit events like `ledger.apar_projection.rebuilt` for
produced-row diagnostics.

**Two traps sit on either side of its rollout, and they fail in opposite
directions:**

- *Before it is deployed*, the field is simply absent. Gating "is it done" on a
  field that never arrives means the completion edge never fires. Absent must
  therefore mean "do not gate", falling back to the old behaviour.
- *After it is deployed*, its migration backfills **every pre-existing upload
  artifact to `pending`**, not `projected` — and nothing ever advances those,
  because their projection ran long before the column existed. So a plain
  "`pending` means in flight" rule leaves every historical document
  permanently unfinished, and the refresh never fires at all.

**How to apply:** treat `pending` as in-flight only for a document *this* system
just ingested and is actively tracking, never for one discovered in an existing
list. Bound the wait with a deadline regardless, so a stalled or never-updated
status cannot wedge the refresh permanently.

## The shape that satisfies both traps at once

Three rules, worth keeping if this is ever refactored:

1. **Absent is not a state.** Normalise any unrecognised or missing upstream
   value to null at the boundary, and make null mean "no information" everywhere
   downstream. This is what lets the code ship before the field deploys and light
   up on its own afterwards, with no flag to flip and no follow-up release.
2. **Only record a status for a document being actively chased.** Scope it by
   age from upload, so historical rows keep a null mirror locally and the
   upstream backfill can never leak in. This makes the backfill trap structurally
   impossible rather than something a later reader has to remember.
3. **Both ends bound the wait against the same `uploadedAt` clock.** The server
   stops refreshing the mirror and the client stops honouring it at the same age,
   so they cannot disagree about whether a document is still waiting.

**Why:** the two traps push in opposite directions — before deploy, gating on the
field freezes the refresh; after deploy, trusting `pending` freezes it again for a
different reason. Rules 1 and 2 each neutralise one, and rule 3 stops the fix
itself from becoming a third failure mode.

**Watch out:** a deadline that expires is not the same event as a projection
reporting done, and the UI should not treat them alike — one means "it finished",
the other means "we gave up", which is exactly when the old timing heuristic is
still the best guess available.

**React Query gotcha:** a poll that returns deep-equal data hands back the same
object via structural sharing and causes no re-render, so a purely time-based
transition like a deadline expiring is never noticed. Drive it with an explicit
tick rather than computing it during render.

## The trap: tying the settle window to a modal's lifetime

**A refresh window driven by a `useEffect` inside the upload UI dies the moment
that screen unmounts.** Two realistic flows defeat it entirely:

- The user closes the upload screen *before* extraction finishes, so the
  completion edge never fires while mounted and no invalidation ever happens.
- The user reopens the upload screen mid-window; the "was in progress"
  ref re-initialises to the current value, no transition edge is observed,
  and the window does not resume.

**How to apply:** anchor the whole mechanism to the authenticated shell, which
outlives every upload surface (both the Add Source modal and the onboarding
flow render beneath it).

The non-obvious part: **you have to move the document polling up too, not just
the settle window.** Completion is only observable by polling the document
list, so if polling stays with the modal, closing it early means the
completion edge is never seen and the relocated settle window never fires.
Moving both also collapses the duplicate-instance problem to a single mount.

Prefer a component-scoped hook over a module-scoped coordinator here: refs and
timers inside the shell reset naturally when it unmounts on logout, whereas
module-level state in this SPA survives account switches and would have to
register with the user-scoped reset funnel to avoid leaking.

Keep the in-progress predicate a pure exported function so the status
semantics stay unit-testable — a missing status must read as *pending*, or a
just-uploaded document is mistaken for a finished one and fires the edge
immediately; terminal failures must read as *settled*, or a batch containing
an unreadable document never completes.
