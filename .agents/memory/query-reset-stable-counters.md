---
name: Counters across query resets
description: How to keep aggregate badges honest while an authoritative paginated query is cleared and refetched.
---

When a paginated authoritative query is reset, do not let a counter collapse to whatever optimistic rows remain. Preserve the last **committed successful** total, add only optimistic records created after that snapshot, and replace it only after another successful authoritative read. If no successful snapshot exists, omit the optional counter during loading or error rather than presenting an optimistic-only value as the total.

**Why:** A confirmed decision receipt can remain while reset query pages are empty, briefly turning a real total into `1`. Proposal-level deduplication is also unsafe because an audit timeline may legitimately contain several decision events for one proposal after undo and re-decision. A failed refetch is not authoritative merely because loading ended.

**How to apply:** Model authoritative state explicitly (`ready`, `loading`, `error`). Capture snapshots in a commit-phase effect, retain exact history-row counts, and identity only the optimistic records needed to detect additions since the snapshot. Test initial load, reset success, reset failure, re-decision, replacement of an older receipt, and authoritative decreases.