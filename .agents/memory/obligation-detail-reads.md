---
name: Reading one obligation in detail
description: Which brain-core reads back a single obligation, what the /resolved view does and does not carry, and why a filename needs a second local source.
---

## There is no by-id read

`GET /ledger/obligations/{id}` is a **404**. Only the list read and
`/ledger/obligations/{id}/resolved` exist, so **the list read is the lookup**: hold the id
and resolve it against the list map on every render.

Corollary for any surface that opens one obligation from elsewhere (an assistant citation,
a deep link): store the **id**, never the record object. Capturing the object freezes one
refetch's snapshot, so a corrected amount keeps showing the old figure and an account
switch leaves the previous tenant's record on screen.

## What `/resolved` adds

Reached through the generic BFF GET passthrough — no dedicated server route needed. It
carries `observations[]`, a `resolved{}` block (including `gl_accounts`), `conflicts[]`,
`matches[]` and `pending_review[]`.

`conflicts[]` covers **`amount_due` and `due_date` only**, each as a list of
`{value, obligation_id, provenance}`. The values carry **no currency of their own** — the
only currency available is the subject obligation's.

A resolved read has four outcomes, not two: in flight, failed, 200-but-no-resolved-view,
and landed. **Only the last licenses a silent "no conflicts" section** — a hidden coherence
panel reads as "the sources agree", which neither an outage nor a missing cross-check
supports. Fold 404 in with the error: the user-visible claim is identical, nobody checked.

A conflict the upstream reported but whose values cannot be rendered is still a conflict.
Dropping it turns "these disagree and we can't show you how" into an apparently clean
record.

## Filenames come from somewhere else

`/raw/{id}` carries **no filename**. Names come from the local documents list
(`GET /api/integrations/documents`) matched on `rawId`, and not every raw id has a local
upload — an unmatched one renders its bare id.

That makes an unreadable documents list indistinguishable from "no file was ever uploaded
for this source", so the failed read has to say its own name rather than leaving every row
looking like an orphan id.
