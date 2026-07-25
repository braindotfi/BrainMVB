# Codex Prompt — Raw Ingest → Extract Never Projects into the Ledger

Copy/paste the block below into Codex (brain-core repo).

---

## Priority framing — read this first

This was found while seeding demo tenant data in BrainMVB, but **it is not a demo-only
issue.** If the evidence below holds, `/raw/ingest` → `/raw/{id}/extract` never actually
parses a document or projects anything into the Ledger for ANY tenant — demo or real. A
real customer connecting a real bank statement today would hit the same empty Ledger. Please
triage this as a core ingestion defect, not a "make the demo look nicer" task.

## Evidence (from a live diagnostic run, 2026-07-25)

Fresh durable tenant `tnt_01KYD0XBZVX6R09CA6PT6NK3GS`, three files pushed through the real
pipeline (bank statement PDF, AR-aging spreadsheet, payroll spreadsheet):

- `POST /raw/ingest` succeeded for all 3 files — real `raw_id`s and `sha256`s returned;
  `GET /raw/{id}` confirms the bytes are actually stored (valid signed MinIO URL, correct
  mime type and size).
- `POST /raw/{id}/extract` returned 2xx for all 3 files, but **`parsed_id: null` and
  `confidence: null` on every single one.** Extraction reports success without producing a
  parsed artifact.
- Checked immediately after extraction and again 60+ seconds later (ruling out async
  projection lag):
  - `GET /v1/ledger/accounts` → `{"accounts":[],"next_cursor":null}`
  - `GET /v1/ledger/transactions` → `{"transactions":[],"next_cursor":null}`
  - `GET /v1/ledger/obligations` → `{"obligations":[],"next_cursor":null}`
  - `GET /v1/ledger/cash_flows` → `{"currencies":[]}`

All four Ledger read surfaces stay empty regardless of what's been ingested and "extracted."

This is consistent with what was verified live on 2026-07-24 (referenced in BrainMVB's
`server/brain/seed.ts`): extraction currently appears to be advisory-only.

## Task

1. **Confirm the defect.** Trace `POST /raw/{id}/extract` end to end for a real document
   (a bank statement is the simplest case) and identify exactly where the chain breaks:
   does it never attempt to parse the document at all, does parsing fail silently and swallow
   the error, or does it parse successfully but never write/project the result into the
   Ledger layer? Report which of these it is with the specific file/function.
2. **Fix the projection.** The expected contract (per `deliverables/BRAIN-CORE-ORCHESTRATION-GAP.md`
   and the six-layer architecture: Raw → Ledger → Wiki → Policy → Agent → Audit) is that a
   successfully ingested and extracted document produces real Ledger entities — at minimum
   `account` and `transaction` records derived from a bank statement, reachable via
   `GET /v1/ledger/accounts` and `/transactions`. Fix whatever is broken in that path so
   `parsed_id`/`confidence` are populated on success and the Ledger actually reflects
   ingested documents.
3. **If the real fix is large/out of scope for this task**, at minimum: (a) make failures
   loud instead of silent — `extract` should not return 2xx with a null `parsed_id` if
   nothing was actually parsed — and (b) document the current actual scope of what
   extraction does today (if it's genuinely not implemented yet for some/all document
   types) so downstream teams stop assuming it works.
4. **Separately, evaluate whether a demo-tenant ledger-seeding endpoint is warranted** as a
   short-term unblock for BrainMVB's demo experience, independent of the real fix above. If
   you build one:
   - It must be a distinct, explicitly-named endpoint (not reachable via the normal
     ingest→extract path), gated the same way tenant/session endpoints already are
     (`X-Platform-Service-Auth`, BFF-only, never client-callable from the browser).
   - It must require an explicit, unambiguous "this is a demo tenant" signal from the
     caller — do not infer demo-ness from anything guessable or spoofable.
   - It should be treated as scaffolding to unblock BrainMVB, not as a substitute for fixing
     #2. Flag clearly in the PR if you go this route so it doesn't get mistaken for the real
     fix landing.

### Out of scope
- Do not touch BrainMVB (client repo) as part of this — this is entirely brain-core-side.
- Do not build item 4 (demo-seeding endpoint) instead of investigating/fixing items 1–3 —
  only add it as a supplement once the real defect is understood, even if the full fix is
  deferred.

### Process requirements
- `git fetch` and `git pull` before starting, work on a new feature branch.
- Post the root-cause finding (which exact step breaks) before starting the fix.
- Keep a done/pending checklist as you go.
- Definition of done: a fresh tenant's ingested bank statement produces real,
  `GET`-able Ledger accounts/transactions; extraction is honest about success/failure;
  PR merged to main with CI green.

---
