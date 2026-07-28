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

## The trap: tying the settle window to a modal's lifetime

**A refresh window driven by a `useEffect` inside the upload UI dies the moment
that screen unmounts.** Two realistic flows defeat it entirely:

- The user closes the upload screen *before* extraction finishes, so the
  completion edge never fires while mounted and no invalidation ever happens.
- The user reopens the upload screen mid-window; the "was in progress"
  ref re-initialises to the current value, no transition edge is observed,
  and the window does not resume.

**How to apply:** if the settle-window approach needs to be reliable rather
than best-effort, it has to be anchored to a lifecycle that outlives the
modal. Note the related hazard first: module-level state in this SPA is not
reset by account switches, so a module-scoped coordinator must register with
the user-scoped reset funnel or it will leak across accounts.
