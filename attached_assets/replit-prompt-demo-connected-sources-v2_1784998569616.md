# Replit Follow-Up Prompt — Broaden Simulated Sources for the Demo Account (Unblocked)

Copy/paste the block below into Replit (BrainMVB repo).

---

## Status

brain-core merged `cec457e` ("Drain manual document extraction into ledger") to `main`. Root
cause: `POST /raw/{id}/extract` previously only enqueued an async job — parsing and ledger
projection depended on a separate worker process that wasn't draining it, so extraction
reported success with `parsed_id: null` and the Ledger stayed empty forever. That's now fixed
for the composed API process: the route synchronously drains extraction → normalize →
projection → ledger account/transaction projection before returning, and it now fails loudly
(502/500) instead of silently reporting success with no output.

**This means Step 1 from the prior prompt (diagnose before building) is done and the blocker
is cleared** — but confirm it against a fresh tenant before building anything further, since
BrainMVB has never actually seen this pipeline work end-to-end.

## Task

### Step 1 — Confirm the fix from BrainMVB's side (do this first, don't skip it)
- Create a **fresh** `demo-fresh-*` account and let the existing 3-file seed
  (`server/brain/seed.ts`) run.
- Verify: `source_documents.extractStatus` reaches `"extracted"` with non-null `parsed_id`/
  `confidence` for all 3 files, and `GET /api/brain/ledger/accounts` /
  `/api/brain/ledger/transactions` (via the BFF) now return real, non-empty data.
- If this still comes back empty, stop and report exactly what's different from brain-core's
  own passing integration test (tenant setup, token scope, timing) — do not proceed to Step 2
  on an unconfirmed foundation.
- Note from brain-core's changelog: the extract call may now take noticeably longer per file
  (it's doing real synchronous work — parse, normalize, project, ledger-project — inside the
  request). If seeding several files sequentially becomes slow enough to matter for login
  latency, that's fine to flag but not necessarily something to fix here.

### Step 2 — Broaden the simulated source types
Once Step 1 is confirmed, extend `SEED_FILES` in `server/brain/seed.ts` to cover more of the
categories the "Add Source" modal already supports (`source_documents.category`: confirm the
full list brain-core classifies before assuming `bank | accounting | payroll | tax | payments
| general` is exhaustive — ask brain-core if unclear rather than guessing). Target:
- **Bank account** — already have a bank statement; keep it.
- **Crypto wallet** — confirm with brain-core whether wallet exports have a dedicated
  category/source type or map to an existing one (e.g. `payments`); do not invent a category
  brain-core doesn't recognize.
- **Accounting platform** — already have AR aging; consider a P&L or GL export if it
  meaningfully changes what shows on the Finances tabs.
- **Payroll** — already have a payroll register; keep it.
- **Tax return** — add a representative tax document (`category: "tax"`).

For each new file: generate a small, internally-consistent synthetic document that reconciles
with the existing "bundled June-2026 starter scenario" figures (per the comment in
`seed.ts`) — new numbers must not contradict the existing bank/AR/payroll figures. Add it to
`server/assets/demo-seed/`, register it in `SEED_FILES`, and let it go through the same real
`seedTenantDocuments` call — no special-casing per source type beyond
`sourceType`/`category`/`mimeType`.

### Step 3 — Surface "Sources: Connected" honestly
If there's a UI element meant to show connected-source badges (bank, crypto, accounting,
payroll, tax) on the dashboard, confirm what it currently reads from — most likely the
`source_documents` list for the tenant, filtered/grouped by `category` and `extractStatus`.
Wire it to that real data. If no such element exists yet, don't invent new UI in this task —
flag it as a separate follow-up instead.

### Explicitly out of scope / do not change
- Do not hardcode account balances, transaction lists, or "Connected" badges client-side —
  everything must derive from brain-core's Ledger/Wiki via the existing BFF endpoints.
- Do not modify brain-core contracts/endpoints from this repo.
- Do not touch the real-account (non-demo) path; it's already correct.

### Process requirements
- `git fetch` and `git pull` before starting, work on a new feature branch.
- Post Step 1's confirmation result before starting Step 2.
- Keep a done/pending checklist as you go.
- Update `CLAUDE.md`'s "Demo vs real accounts" section with the expanded source list and
  where each new seed file lives.
- Test against a **fresh** `demo-fresh-*` account, not the shared `demo@brain.fi` tenant.
- Definition of done: a fresh demo login shows real, ledger-derived balances and multiple
  source categories represented, all sourced from documents that went through the real
  ingest→extract pipeline; PR merged to main with CI green.

---
