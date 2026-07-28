---
name: Refreshing brain data after document upload
description: Why uploads don't refresh Home/Finances/Inbox on their own, and what a correct fix has to survive.
---

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
