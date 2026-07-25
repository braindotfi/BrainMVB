# Replit Follow-Up Prompt — Simulate Connected Sources for the Demo Account

Copy/paste the block below into Replit (BrainMVB repo). This follows the earlier
"remove mock data / demo vs real accounts" fix (commit `db08a026`).

---

## Background — read this before touching code

The earlier fix (`server/demoUsers.ts`, `server/brain/auth.ts`, `client/src/lib/demoMode.ts`)
correctly stopped mock data from leaking into real accounts. Verified:
- A real new signup now shows a genuinely empty Audit Log (`tenant.created`,
  `auth.production_agent_token.minted`, `Team member updated` — bootstrap events only,
  nothing else). Correct.
- The demo account (`demo@brain.fi`, displays as "ACME Inc.") currently ALSO shows no
  connected sources: "Money in all accounts" is `—`, Finances → Accounts is `0`, despite
  an Audit Log with 87 historical entries. This is the gap this task fixes.

**Important finding from code review — read before designing a fix:**
- "Money in all accounts" (`client/src/pages/HomePage.tsx`) and the Finances → Accounts tab
  (`client/src/pages/FinancesPage.tsx`) do **NOT** read from the local `bank_connections`
  table. `bank_connections` is Plaid-specific (real `access_token`, real `accountsGet` calls)
  and is unrelated to what these screens render.
- Both screens read live from brain-core's Ledger via `/api/brain/ledger/accounts` and
  `/api/brain/ledger/transactions` (BFF proxy). So the fix is NOT "insert a fake
  `bank_connections` row" — that table isn't in this data path at all and inserting a row
  with a fake Plaid access token would do nothing (and would be actively wrong/unsafe).
- The existing starter seed (`server/brain/seed.ts` → `seedTenantDocuments`, gated to demo
  accounts only by the prior fix) already pushes 3 files through the REAL pipeline
  (`/raw/ingest` → `/raw/{id}/extract`): a bank statement PDF, an AR-aging spreadsheet, and
  a payroll spreadsheet. That's the correct mechanism — simulated sources must go through
  this same real ingest→extract pipeline, never hardcoded client-side.
- Despite that seed existing, the demo account in the screenshots shows nothing derived
  from it. Two live possibilities, both need checking (see Step 1 below): (a) this is the
  long-lived shared `demo@brain.fi` tenant, and the seed by design only fires on
  tenant-CREATE, so this particular tenant may predate the seed / may never have been
  re-seeded, or (b) the seed ran but extraction failed or never produced ledger-visible
  accounts.

## Task

Expand and fix the demo tenant's simulated data so a demo user lands on a dashboard that
looks genuinely pre-populated — multiple connected source types, real ledger-derived
balances and activity — while everything downstream of ingestion stays 100% live brain-core
data (no hardcoded frontend numbers, per the existing rule in CLAUDE.md).

### Step 1 — Diagnose before building anything new
- Create a **fresh** `demo-fresh-*` account (not the shared `demo@brain.fi` one — that
  tenant may be stale/pre-fix) and confirm whether `seedTenantDocuments` actually fires and
  succeeds end-to-end: check `source_documents` extract_status for all 3 existing seed
  files, check server logs for `[brain-seed]` success/failure lines, and check whether
  `/api/brain/ledger/accounts` returns any accounts afterward.
- If extraction is failing or the ledger never derives accounts from the seeded bank
  statement even when everything reports success, that's a brain-core-side gap (brain-core
  interpreting a raw bank-statement PDF into a Ledger "account" entity). Per the standing
  rule, do **not** work around this with frontend mocks — stop and report exactly what you
  find (status codes, response bodies, which step breaks) so it can be routed to brain-core
  if needed.
- Only proceed to Step 2 once you've confirmed real documents ingested through the real
  pipeline do actually populate `/api/brain/ledger/accounts` and `/transactions` for a fresh
  demo tenant. If they don't, Step 2 will look identical to today's broken state no matter
  how many files you add.

### Step 2 — Broaden the simulated source types
Once ingestion→ledger is confirmed working, extend `SEED_FILES` in `server/brain/seed.ts`
(or equivalent) to cover more of the source categories the "Add Source" modal already
supports (`source_documents.category`: `bank | accounting | payroll | tax | payments |
general` — confirm the full list brain-core actually classifies before assuming this is
exhaustive). Target a realistic small-business spread, e.g.:
- **Bank account** — already have a bank statement; keep it.
- **Crypto wallet** — a wallet transaction export/statement (confirm with brain-core's raw
  ingest classification whether this needs a new category value or maps to an existing one
  such as `payments`; do not invent a category brain-core doesn't recognize).
- **Accounting platform** — already have AR aging; consider adding a P&L or GL export if it
  meaningfully changes what shows on Finances tabs.
- **Payroll** — already have a payroll register; keep it.
- **Tax return** — a representative tax document (`category: "tax"`).

For each new file: generate a small, internally-consistent synthetic document (matching the
existing "bundled June-2026 starter scenario" the current 3 files use, per the comment in
`seed.ts` — new figures must reconcile with the existing ones, not contradict them), add it
to `server/assets/demo-seed/`, and register it via the same `SEED_FILES` array so it goes
through the identical ingest→extract call `seedTenantDocuments` already makes. No special
casing per source type beyond `sourceType`/`category`/`mimeType`.

### Step 3 — Surface "Sources: Connected" honestly
If there's a UI element meant to show connected-source badges (bank, crypto, accounting,
payroll, tax) on the dashboard, confirm what it currently reads from — likely the
`source_documents` list for the tenant, filtered/grouped by `category` and `extractStatus`.
Wire it to that real data rather than a hardcoded badge list. If no such element exists yet,
do not invent new UI in this task — flag it as a separate follow-up.

### Explicitly out of scope / do not change
- Do not insert synthetic rows into `bank_connections` — confirmed above that this table is
  not in the render path for the screens in question, and it holds real Plaid access tokens.
- Do not hardcode account balances, transaction lists, or "Connected" badges client-side.
  Everything must still derive from brain-core's Ledger/Wiki via the existing BFF endpoints.
- Do not modify brain-core contracts/endpoints from this repo. If Step 1's diagnosis shows
  brain-core doesn't derive ledger accounts from an ingested bank statement, stop and report
  — do not paper over it with a frontend fallback.
- Do not touch the real-account (non-demo) path at all; it's already correct.

### Process requirements
- `git fetch` and `git pull` before starting, and work on a new feature branch.
- Post the Step 1 diagnostic findings before writing any new seed files — this determines
  whether Step 2 is even worth doing yet.
- Keep a running done/pending checklist as you execute, and update it as tasks complete.
- Update `CLAUDE.md`'s "Demo vs real accounts" section with the expanded source list and
  where each new seed file lives.
- Test against a **fresh** `demo-fresh-*` account, not the shared `demo@brain.fi` tenant
  (which may carry stale pre-fix state and isn't a reliable test signal either way).
- Definition of done: a fresh demo login shows real, ledger-derived balances and multiple
  source categories represented, sourced entirely from documents that went through the real
  ingest→extract pipeline; PR merged to main with CI green.

---
