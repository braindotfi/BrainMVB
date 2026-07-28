---
name: brain-core /raw/{id}/extract is asynchronous
description: Why extraction results must be polled rather than read from the first extract response, and how the poll works.
---

brain-core's `POST /raw/{raw_id}/extract` is a job trigger, not a synchronous drain, despite
upstream reports that it was made synchronous. The first call answers **202** with
`{status: "queued", parsed_id: null, confidence: null}`. The parsed record materializes
roughly 15-90 seconds later.

The call is **idempotent per raw_id**: re-POSTing returns the SAME job's current state
(200 + `status: "succeeded"` + real `parsed_id`/`confidence` once settled). So the trigger
endpoint doubles as the poll — there is no separate job-status endpoint to find.

Ingest is content-addressed: re-uploading identical bytes dedupes to the existing `raw_id`
and its already-finished job, which makes a naive "does extract return parsed_id?" probe
look like it works. Append unique bytes when probing the first-response shape.

**Why:** treating the first response as final recorded documents as "extracted" with
`parsed_id`/`confidence` permanently null, while the ledger data itself landed fine — a
silent mismatch between the documents list and the actual ledger.

**How to apply:** anywhere a parsed_id or confidence is persisted, poll until the job status
is terminal (`succeeded`/`failed`/`cancelled`). Non-terminal must be recorded as still-in-
progress, never as success. Background paths (nobody waiting) can poll inline; request paths
serving a user must record in-progress and let a later read settle it.
