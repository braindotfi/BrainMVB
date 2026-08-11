# CLAUDE.md — Brain Finance

Working notes for agents. The full project overview lives in `replit.md`; this file
captures contracts that are easy to break silently. Keep it short and current.

## IA restructure — Phase 1 status (verified against code and open PRs 2026-07-31)

Brief: `attached_assets/Pasted-We-re-restructuring-BrainMVB-s-IA-to-3-primary-sections_1785505306555.txt`.
Prototype `brain-ux-vision-v6.html` is a **structure/copy** reference only — never a
styling reference, and its `$25k`/`$50k` figures are invented copy, not configuration.
The file is deliberately **not** in the repo; ask the design owner for a copy.

**None of this is on `main` yet.** All ten items are committed, pushed and open as
PRs #36–#47, each stacked on the one before it. Read `main` and you are reading the
pre-restructure app; read the tip of `feat/ia-item9-audit-system-activity` and you are
reading all ten. "Shipped" below means *shipped as an open PR*, not merged — verify
with `git log origin/main` before treating any of it as the state of the product.

| # | Item | PR | Branch (base) |
|---|------|----|---------------|
| 1 | Nav collapsed to Overview / Decisions / Ledger / Settings | — | already on `main` |
| 2 | Overview rebuilt as one tiered decision queue | #36 | `feat/ia-item2-overview` (`main`) |
| 3 | Decisions: tab bar replaced by one filtered timeline | #37 | `feat/ia-item3-decisions` (#36) |
| 3a | Detail modal | — | pre-existing on `main` |
| 3B | Bulk approve, gated on the policy's real second-approver line | #38 | `feat/ia-item3b-bulk-approve` (#37) |
| 4 | Ledger: five money tabs collapsed into one Cash Flow view | #39 | `feat/ia-item4-ledger-tabs` (#38) |
| — | Fail-open feed read becomes a build failure, not a review finding | #40 | `chore/feed-guard` (#39) |
| 5 | One search bar over decisions, vendors and accounts | #41 | `feat/ia-item5-global-search` (#40) |
| 7A | Settings: mock tab set, honest Notifications/Escalation surfaces | #42 | `feat/ia-item7a-settings-tabs` (#41) |
| 7B | Developers nested inside Settings | #43 | `feat/ia-item7b-developers-nested` (#42) |
| 6 | Sources becomes a place in Settings, not a wizard | #44 | `feat/ia-item6-sources-settings` (#43) |
| — | QA scripts deny writes by default | #45 | `chore/qa-write-guard` (#44) |
| 8 | Onboarding explains rules, not source connection | #46 | `feat/ia-item8-rule-walkthrough` (#45) |
| 9 | Audit Log: decisions by default, system activity behind a toggle | #47 | `feat/ia-item9-audit-system-activity` (#46) |

3c (inline expand for informational rows) was never in scope for Phase 1 and is **not started**.

### What `main` still looks like until the stack lands

`/decisions` routes to `InboxPage` with **six tabs and no search**; `AuditLogPage` shows
every pipeline event; Ledger still has Bills/Income/Expenses/Liabilities; Developers is
top-level at `/developers`; Settings has no Sources section; Team still lacks per-member
limit and backup-approver fields; onboarding is the 4-step source-connection flow. An
agent debugging a bug report against production is looking at that app, not this table.

### Constraints these items depend on, which outlive them

- **Onboarding first-visit plumbing:** `lib/onboarding.ts` owns the storage key and
  "Continue with Demo" pre-marks it complete. Never add a second detector.
- **No client-side role signal exists.** `AuthUser` carries no role and nothing links a
  session to a member row, so nothing may gate visibility or defaults on role yet —
  item 9's toggle is off for everyone for exactly this reason.
- **Deferred for want of a real signal:** Team's backup-approver field, and item 9's
  admin-specific default.

### Deliberately not built

Payment-intent tiering, and any `$` materiality default. Both need a real signal that
does not exist yet — see the tier module's own comments before adding either.

## Proposal card read-model contract

The shared proposal card is the single presentation path for every public
`proposal_type`, including advisory domains. The canonical upstream references
are `https://docs.brain.fi/api-reference/proposals-api.md`,
`https://docs.brain.fi/api-reference/wiki-api.md`, and
`https://docs.brain.fi/api-reference/policy-api.md`; the local field contract is
`docs/contracts/proposals-read-model.md`.

- The read item carries additive `stored_action_type`, open-record `details`,
  `policy`, `presentation`, and `available_decisions` fields. `presentation`
  contains `headline`, `recommendation`, `key_facts`, `confidence_band`,
  `policy`, `consequences`, `actions`, and `technical_detail`.
- `available_decisions` is authoritative when present, including `[]`; only an
  absent field may fall back to `presentation.actions`. Labels come from the
  record. The only writable verbs currently submitted are `approve`, `reject`,
  `acknowledge`, and `undo`; unsupported advertised decisions render disabled.
- Policy attribution follows `policy_id → matched_rule_id → policy content`.
  Opaque IDs are never shown on the primary view. Evidence uses resolved
  Ledger/Wiki labels; unresolved IDs stay in collapsed Technical Detail.
- Pending advisory proposals route to Inbox by decidability, not by
  `mode === "propose"`. The Inbox and detail card both derive controls from the
  proposal's available decisions and use the Invoice/Cash Agent action palette.

## Brain Assistant suggestion chips are tenant-sourced

The chips above the assistant input are **not** a hardcoded list. They come from
brain-core per tenant via `useSuggestedQuestions()` in
`client/src/lib/brainSuggestedQuestions.ts`.

Four things about that endpoint are easy to get wrong:

- **The path is `GET /wiki/suggested-questions`.** It is live and returns real
  rows. Do **not** use `GET /assistant/questions` — that is an unrelated legacy
  route over the old `assistant_questions` table which answers
  `200 {"questions": []}` for every tenant and always will. The two differ in
  path, response field *and* row shape, so getting it wrong fails **silently**:
  the parse yields nothing, the fallback renders, and the row looks healthy.
  This module shipped wired to the legacy route for exactly that reason.
- **An unauthenticated 401 does not prove a route exists.** brain-core runs auth
  *before* routing, so every path — including `/wiki/__nonexistent__` — answers
  `401 auth_token_missing`. Only an authenticated call separates a live route
  (`200`) from a dead one (`404 route_not_found`). Probe through the BFF with a
  real session cookie, never anonymously.
- **Eligibility is the server's job.** The spec: "Returns only currently
  eligible questions backed by the deterministic Wiki-question registry." There
  is no `status` field. A client-side eligibility rule would re-suppress rows
  core already cleared — the parse does *structural* validation only (drop rows
  without usable `display_text`, since passthrough reads are unnormalized).
- **Order is the ranking; never `.sort()`.** Rows carry `usage_rank_score`, but
  per the spec that is "the tenant's all-time invocation count for that intent",
  which core *uses to rank* — it is core's input to a ranking already applied,
  not the rank itself. On a new tenant every count is `0`, so a client sort
  would reshuffle a deliberate order into an arbitrary one.

Row shape is `{intent_id, display_text, usage_rank_score}` — note `display_text`,
not `question`, and `suggestions`, not `questions`. `intent_id` is an enum
(`transaction_count|transaction_sum|transaction_average|transaction_listing|cash_flow_listing|invoice_listing`)
and serves as the React key.

Like every passthrough read this needs **no BFF proxy route**: `proxy.ts` ends in
a catch-all GET passthrough that already forwards it. Only writes are allowlisted;
a dedicated read route would be dead code shadowed by the passthrough.

When nothing is eligible or the read fails, the UI falls back to
`FALLBACK_QUESTIONS` in `BrainAssistant.tsx`. That constant holds only the four
strings the component already shipped. **Do not add new suggestion copy to it.**
A hand-authored chip can promise a capability the backend lacks, which is exactly
the defect this wiring removes; anything tenant-specific must come from the
endpoint.

Collapsing loading + failure + empty onto one fallback is intentional here and is
*not* the false-all-clear defect: these chips make no claim about the tenant's
money or setup, every fallback string still works through the same assistant
pipe, and an empty row would read as broken. The hook still exposes `isError`
separately for callers that must distinguish them.

**Two similarly-named routes exist — do not conflate them.**

| Route | Backed by | Feeds |
| --- | --- | --- |
| `/api/assistant/questions` | local Postgres (`storage.listAssistantQuestions`) | Anthropic-fallback Q&A rows merged into the **audit log** (`brainAudit.ts`) |
| `/api/brain/assistant/questions` | brain-core, via passthrough | **nothing — legacy, always `{"questions": []}`.** Not the chips; do not wire anything to it |
| `/api/brain/wiki/suggested-questions` | brain-core, via passthrough | tenant **suggestion chips** (`brainSuggestedQuestions.ts`) |

Same tail path, different origin, different purpose. Reaching for the one-word-shorter
path will silently feed audit rows into the chip row.

## Brain Assistant answer status

The Brain Assistant's fallback prompt is intentionally **"Show recent cash flow"**:
`GET /ledger/cash_flows` provides trailing actuals, not a forward projection.

`POST /wiki/question` may attach evidence even when it cannot answer the question.
The BFF must not infer success from a non-empty `answer`: use brain-core's explicit
`answered` boolean when present. Until every upstream response carries it, the
legacy stopgap is `isKnownWikiRefusal()` in `server/brain/client.ts`; known refusal
prose is `answered: false`, while a legacy non-refusal response remains compatible.
The chat UI must render no-answer status separately from an answered message with
supporting records. Evidence count alone never proves that an answer was produced.

**`answerDeterministically()` runs before the Wiki path on `POST /api/assistant/chat`.**
A class of questions ("how much do we owe X", payroll total, overdue AR invoices) has
exactly one correct answer that is a number, so it is computed straight from a
proven-complete ledger read with no model in the loop —
`server/brain/deterministicAnswers.ts`. It returns `null` to fall through to the
existing Wiki/LLM path; any other return, including a refusal, is sent to the client
as-is and must not be re-processed. `deterministic-answers.test.ts` pins the ordering
structurally (deterministic call before `askWikiQuestion` before the Anthropic call in
`routes.ts`) so moving this block silently hands these questions back to a model
without failing any behavioural test.

## Route contracts easy to break silently

- **`requireNonDemo` gates the real Plaid write routes.** `POST
  /api/integrations/plaid/link-token` and `/exchange` require both `requireAuth` and
  `requireNonDemo` — demo sessions are handed out unauthenticated, so `requireAuth`
  alone does not exclude them, and a demo session must never reach live Plaid or
  persist a real access token. Reads (`/status`, `/connections`) and `/disconnect` stay
  open to demo accounts.
- **`GET /api/integrations/ingest-status`** (`requireAuth`) is the only signal that a
  fresh demo tenant's starter seed is still being projected into the ledger — the
  document list alone cannot distinguish "seeding in progress" from "genuinely nothing
  yet", which is how a fresh account once showed a settled-looking, understated total.
  Bounded to a young demo account, so a user who later deletes a starter document is
  not told forever that their ledger is still importing.
- **Unmatched `/api/*` → JSON 404**, registered LAST in `routes.ts`, after every real
  API route and before the SPA catch-all `server/vite.ts`(dev)/`server/static.ts`(prod)
  install. Without it, an unknown or deleted API path falls through to that catch-all
  and answers 200 + the `index.html` shell — a removed endpoint (like the old shared
  `/api/auth/demo`) would look alive from outside the process.

## Liabilities read obligations, not invoices — and AP is AR's complement

`client/src/lib/liabilities.ts` sums `/ledger/obligations`, not `/ledger/invoices`: the
invoice feed carries no payroll records at all, so the old invoice-derived total
understated what the tenant owed. Three surfaces share this one figure by construction
(the Overview metric card, the Cash Flow metric, the Payables tab total) — see the
module's own doc comment and `liabilities.test.ts`'s cross-surface guard.

**The `"ap"` scenario marker is demo-seed-only — never test an invoice for it
directly.** `metadata.scenario === "ap"` is written ONLY by brain-core's demo seeder;
no real tenant's invoice is ever marked `"ap"`. `metadata.scenario === "ar"`, by
contrast, is written by brain-core's production projection path for every tenant, real
or demo, and is reliable. So AP must be derived as the COMPLEMENT of AR
(`scenario !== "ar"`), never as a positive `"ap"` test — `unpaidApInvoices()` in
`lib/liabilities.ts` is the one place this filter lives, and every consumer (Cash
Flow's bill rows, the Payables bill popup, `debtIdentity.ts`'s obligation↔invoice
matching, the overdue-receivables banner) goes through it rather than re-implementing
the filter inline.

## Demo vs real accounts — synthetic data fence

Real signups must start **genuinely empty**: zero connected sources, zero raw-layer
ingestion, zero ledger, no disguised mock data. Only the demo accounts may ever see
seeded/synthetic data.

- **Who is demo:** decided ONLY by `server/demoUsers.ts` (`isDemoEmail`) —
  `demo-fresh-*@brain.fi` (`POST /api/auth/demo-fresh`) and `demo@brain.fi`, whose
  shared `POST /api/auth/demo` route was DELETED. That route logged every visitor
  into one account and one tenant, so each inherited the last one's data; the
  address stays classified as demo only so any surviving row is never mistaken for
  a real signup. Do not reintroduce the route — `server/auth-security.test.ts` pins
  it as 404. `publicUser` (server/auth.ts) exposes demo-ness to the client as
  `user.isDemo`; never re-derive it anywhere else.
- **Server fence:** the one-time starter seed (`server/brain/seed.ts`, durable-mode
  create-tenant branch in `server/brain/auth.ts`) runs ONLY when the app user's email
  is a demo address. A real user's tenant is created with NO `/raw/ingest` calls.
  Pinned by `server/brain/durable-tenancy.test.ts` invariant F.
- **Client fence:** `client/src/lib/demoMode.ts` holds a module-level flag set
  exclusively by `AuthProvider` from `user.isDemo`. Gated surfaces: the synthetic
  proposal corpus (`openProposalDetail.allProposals()` → `[]` for real accounts, so
  proposal refs fall back to plain text) and the HomePage starter goals
  (`DEMO_GOALS`). Everything else (rules, suggestions, documents, vendors, audit,
  finances, review queue) is live-backed and starts empty.
- **Demo stays real downstream of ingestion:** the demo seed goes through the real
  ingest→extract pipeline; ledger/wiki/policy/agent/audit responses are never faked
  in the frontend. Where mock data used to leak: the starter seed ran for EVERY new
  durable user, `MOCK_PROPOSALS` resolved for everyone, and `SEED_GOALS` rendered
  for everyone — all now demo-gated.

### The auth-transition reset funnel (`applyUserScopedResets`)

This is a single-page app: an auth transition does **not** remount JS modules, so
any module-level state keyed to nothing survives into the next account. That is a
data-integrity bug, not just a staleness one — a freshly created account rendering
another account's activity as its own.

`applyUserScopedResets(u)` in `client/src/lib/authContext.tsx` is the single funnel.
`setUser` calls it and nothing else re-implements it, so it covers every path —
`loginWithPassword`, `register`, `loginDemoFresh`, session bootstrap,
and `logout` (via `setUser(null)`).

Currently resets:

| State | Module | Why it's user-scoped |
| --- | --- | --- |
| `demoDataEnabled` | `demoMode.ts` | gates every synthetic-data surface (above) |
| acknowledged insights | `acknowledgedStore.ts` | `Acknowledged: …` rows merged into the Audit Log by `AuditLogPage`/`InboxPage` |

**Add new module-level, user-scoped stores to `applyUserScopedResets`, not to an
individual caller.** Wiring a reset into `logout()` alone is the bug this funnel
exists to prevent — it misses account→account switches, which never call `logout`.
`acknowledgedStore` was originally missed exactly this way (fixed 2026-07;
`membersStore.clearMembers()` is still logout-only and is a known remaining gap).

Keep these stores in-memory. Persisting them (localStorage/sessionStorage) just
moves the leak to a channel the funnel can't reach, e.g. across browser tabs.
Pinned by `client/src/lib/acknowledgedStore.test.ts`.

### The bundled starter scenario

`SEED_MANIFEST` (`server/brain/demo-seed/documents.ts`, re-exported from
`server/brain/seed.ts`) is the manifest. The bytes are **generated in memory at seed
time** — there are no committed seed files. Five documents spanning five source
categories:

| File | Category | Source type | What it holds |
| --- | --- | --- | --- |
| `bank_statement_<periodEnd>.pdf` | `bank` | `pdf_upload` | operating account, 15 transactions, closes at 165,087.55 |
| `ar_aging_<periodEnd>.xlsx` | `accounting` | `csv_upload` | 7 customers outstanding as of the period end |
| `payroll_register_<periodEnd>.xlsx` | `payroll` | `csv_upload` | 7 employees, two semi-monthly runs |
| `crypto_wallet_<periodEnd>.csv` | `crypto` | `csv_upload` | on-chain treasury wallet, USDC + ETH |
| `form_1120_<fiscalYear>.pdf` | `tax` | `pdf_upload` | prior-year corporate income tax return |

#### Dates are relative to the seeding date — do not re-pin them

The seed was once a static June-2026 bundle. Because surfaces like `ledger/cash_flows`
query a **trailing** window (`[now - 30d, now]`), that fixed period slid out of view as
wall-clock time passed: by 2026-07-28 a 30-day window caught 3 of 15 transactions, and
days later it would have caught none. Home showed an empty, alarming-looking dataset.

So `buildScenario(now)` (`server/brain/demo-seed/scenario.ts`) derives everything from a
single seeding instant:

- **The period is a rolling 30 days ending on the seeding date**, not a calendar month.
  This matters: a *completed calendar month* ends before `now`, so it decays out of a
  trailing-30-day window exactly the same way — full on the 1st, half by the 15th, gone
  by the 31st. Anchoring to "last month" reintroduces the bug on a monthly sawtooth.
- Every date is a **day offset** from the period start (or, for AR, from the period end),
  so the whole dataset shifts as one piece and stays internally consistent.
- **AR aging buckets are derived** from each invoice's own due date, never hardcoded, so
  an invoice cannot sit in a column its dates contradict.
- The tax return uses the most recent fiscal year that is both over *and* past its filing
  deadline, so the demo never shows a return filed in the future.
- Seeding on `2026-06-30` reproduces the original hand-authored June-2026 figures exactly
  — pinned by `server/brain/seed-manifest.test.ts`, which is how you can tell this was a
  date shift and not a new dataset.

`npx tsx scripts/generate-demo-seed.ts [YYYY-MM-DD]` writes the documents to
`server/assets/demo-seed/` so you can open them; that directory is **gitignored** and
nothing reads it at runtime. Pass a date to see what a tenant seeded that day would get.
Do not re-commit a snapshot of it — that is precisely the staleness this replaced.

Bytes are memoised per period end, so a burst of same-day signups renders once.

Two further rules govern this set:

- **`category` must be a `CategoryId`** (`client/src/lib/sourceCategories.ts`), because
  the Add Source badges group real documents by exactly that field — a category typo
  makes a seeded document invisible. It is a BFF-local label: brain-core only ever
  receives `source_type` + `mime_type` + `source_schema`, so there is no upstream
  vocabulary to match. `sourceType` IS brain-core's, and only `pdf_upload` /
  `csv_upload` exist (`csv_upload` is correct for XLSX too). Both pinned by
  `server/brain/seed-manifest.test.ts`.
- **Every figure must reconcile with every other figure.** The reconciliation rules are
  documented at the top of `server/brain/demo-seed/scenario.ts` — read them before adding
  a document. In short: the payroll register nets to the statement's two payroll debits;
  the crypto wallet is on-chain only (the bank statement has no crypto transfer line) and
  its customers settled on-chain, so they are correctly absent from the AR aging; an
  invoice settled on the statement is never also an open receivable (per invoice, not per
  customer — a customer may pay one and still owe another); and the tax return is a prior,
  already-filed year, so it cannot contradict current-period activity while still deriving
  its recurring expense lines from the statement's monthly amounts. Each of these is
  pinned across seven seeding dates by `server/brain/seed-manifest.test.ts`.

Seeding is fire-and-forget after tenant create and now takes ~3-4 minutes (each file
waits for brain-core's async extract job to settle). `whenSeedsSettle()` is the handle
for anything that must wait for it rather than race it with a sleep.

**Testing a change here:** always use a fresh `demo-fresh-*` account, never the shared
`demo@brain.fi` tenant. The durable tenant — and therefore the seed — is created lazily
on the first call that needs a brain *session*; `/api/integrations/documents` and
`/api/brain/tenancy` are both local reads and will NOT trigger it.

## Connected-source badges

The "N connected" counts on the Add Source category picker come from
`categoryCounts()` in `client/src/lib/sourceCategories.ts`, over three live surfaces:
Plaid bank items, tool connections, and `source_documents`. Never hardcode a badge.

- Documents group by their own `category`; an unrecognised or missing one falls through
  to **Documents** rather than being dropped, and is never double-counted there.
- A document counts as connected once brain-core actually holds it (`rawId` present and
  status not `failed`/`pending`). `extracting` counts — the bytes are connected, Brain
  is just still reading them.
- The grouping lives in `lib/` rather than in `AddSourceModal.tsx` so it stays testable
  without React; `client/src/lib/sourceCategories.test.ts` pins the rules.

## Rule references (RuleDetail links)

Every "rule reference" surface in the app — auto-handled receipt, Audit Log record
popup, settled record card, Rules page rows — must open the SAME `/rules/:id`
RuleDetail when tapped. They all go through one helper and one canonical store.

### The contract
- **Canonical rules live in `rulesStore.ts`** (seeded from `mockRules.ts`). The
  only valid rule ids are the store ids: `utility, saas, lease, payroll, sweep,
  ask-over-500, second-approval, flag-unusual, bank-detail-change, duplicate-catch`.
- **`client/src/lib/openRuleDetail.ts` is the single source of truth** for opening a
  rule. `resolveRule(id)` → `getRule` decides tappable-vs-plain; `openRuleDetail(id,
  navigate)` resolves and pushes `/rules/:id`. On an **unresolved id it
  `console.warn`s** `openRuleDetail: no rule found for id '<id>'` and returns false —
  it never fails silently and never produces a dead tap.
- **Two ways a rule is referenced:**
  - Receipts embed the whole rule object (`proposal.rule`); consumers read
    `proposal.rule.id`.
  - Audit records reference by id: `linked[]` entries with `kind:"rule"` carry the
    id in `refId`.
  - There is **no** `ruleId`/`rule_id` field for RuleDetail refs; don't introduce
    naming drift. (`BrainBillsInbox`'s `rule_id` is the separate brain-core bills
    payload — unrelated.)
- **Unresolvable id = graceful fallback:** the reference renders as plain,
  non-tappable text with a muted `(rule unavailable)` note. This path is a runtime
  safety net (e.g. a rule deleted via `deleteRule`, then an old receipt is opened) —
  **shipped mock data must have zero dangling refs.**

## Vendor + document references (same contract, different stores)

Vendors and documents follow the **identical** pattern as rules — referenced by id,
resolved via their own `openXDetail` helper against a canonical store, with a
resolve-or-plain-text fallback:
- **Vendors** — canonical store `MOCK_VENDORS` (`mockVendors.ts`). Helper
  `openVendorDetail.ts`: `resolveVendor(id)` decides tappable-vs-plain;
  `openVendorDetail(id, navigate)` pushes `/vendors?vendor=<id>` (VendorsPage reads
  `?vendor=` via `useSearch` and auto-opens the detail). Referenced by `linked[]`
  `kind:"vendor"` (`refId`) **and** by `document.vendorId`.
- **Documents** — canonical store `MOCK_DOCUMENTS` (`mockDocuments.ts`, served by
  `documentsStore.ts` `getDocument`/`allDocuments`). Helper `openDocumentDetail.ts`:
  `resolveDocument(id)` decides tappable-vs-plain; `openDocumentDetail(id, setOpen)`
  opens `DocumentViewerPopup` (setter, not navigate — by design, so it stacks over the
  audit popup). Referenced by `linked[]` `kind:"invoice"` (`refId`) **and** by
  `proposal.invoiceId`. This is the **generalized read-only EVIDENCE viewer**: ONE
  `DocumentRecord` type + ONE component render EVERY `DocKind` (`invoice` |
  `prior_payment` | `bank_transaction` | `contract` | `purchase_order`) from
  `documentTypes.ts` — there is NO per-kind type or per-kind component. It replaced the
  invoice-only `mockInvoices`/`invoiceTypes`/`openInvoiceDetail`/`InvoiceViewerPopup`
  (all deleted). The audit-log linked kind stays `"invoice"` (the `LinkedEntityKind`
  that overlaps `DocKind`) and routes through `openDocumentDetail`. Every kind shows
  provenance + a "viewer, not the system of record" caption; `bank_transaction` carries
  a `reconciliation` block; a `compareToId` twin drives an in-place COMPARE toggle
  (duplicate invoice / bank-detail change). KNOWN vendors carry `vendorId` (+
  `vendorName`) and deep-link; NON-vendor counterparties (landlords, ledgers) carry
  only `counterparty` text and no `vendorId`.
- **A vendor's `history` must reconcile with its referenced documents/payments** — a
  vendor with a linked paid document must have `paymentCount ≥ 1` and
  `totalPaid/avgAmount/lastPaidLabel` consistent with the referenced amounts/dates;
  `trustStatus` must match how its records actually behaved (a payment human-approved
  above the auto-pay limit is NOT "trusted"; a single recent payment reads as the
  "new" tier). No stubs, no contradictory tenure.

### NON-vendor counterparties are NOT vendor links
Payroll employees, DeFi protocols, and internal accounts are **not** in the
trust/allowlist model — forcing them into `MOCK_VENDORS` would resolve-but-lie. They
use accurate `linked[]` kinds instead (`kind:"employee"`, `"protocol"`, `"ledger"` in
`LinkedEntityKind`) and render as plain, non-tappable text with **no** `(… unavailable)`
suffix (they were never meant to resolve). Never label them `kind:"vendor"`.

### Dev guards — unified, resolution AND coherence for all entity types
`client/src/lib/ruleConsistencyCheck.ts` runs on dev boot (imported in `main.tsx`,
guarded by `import.meta.env.DEV`). It never throws; it only `console.error`s. It now
covers **rules, vendors, documents, proposals, anchor-UI state, and agent↔event
domain** — resolution guards run first, coherence guards second. Extend this one
module; **don't fork** a parallel checker.

**Resolution guards** (does every referenced id point at a real store entity?):

1. **`checkRuleReferences()`** — every rule ref from `MOCK_AUDIT_RECORDS` +
   `AUTO_HANDLED_PROPOSALS` resolves via `getRule`. Logs `[rule-consistency] OK ...`.

2. **`checkVendorReferences()`** — every `kind:"vendor"` linked ref + every
   `document.vendorId` (only docs that name a KNOWN vendor) resolves via
   `resolveVendor`, and every `vendor.ruleIds` resolves via `getRule` (the reverse
   edge). This is the guard whose ABSENCE let the vendor-id drift
   (`aws`/`adobe`/`comcast`/`bright-futures`) ship silently. Logs
   `[vendor-consistency] OK ...`.

3. **`checkDocumentReferences()`** — every `kind:"invoice"` linked ref + every
   `proposal.invoiceId` (across `MOCK_PROPOSALS` + `AUTO_HANDLED_PROPOSALS`) resolves
   via `resolveDocument` against `MOCK_DOCUMENTS`. Logs `[document-consistency] OK ...`.

   **`checkProposalReferences()`** — every audit record's `kind:"proposal"` linked
   ref **and** its top-level `proposalId` resolve via `resolveProposal` (which spans
   the queue, receipts, AND standalone settled/held twins). Logs
   `[proposal-consistency] OK ...`.

**Coherence guards** (does a *resolved* ref also tell the truth? — this is the gap
that let rules break before):

4. **`checkReferenceCoherence()`** — for each audit record: a linked document's
   `amount` == the record's `amount`; a linked document's `vendorId` (when it names a
   KNOWN vendor) == the record's linked vendor; every `kind:"vendor"` ref points at an
   ACTUAL vendor (catches the `j-smith`/`aave` misfiling class); and a vendor with a
   linked PAID document is not contradicted by zero payment history. **Plus lifecycle
   coherence** across the proposal→document→audit→anchor chain (the
   "resolves-but-lies-about-STATE" class):
   - a SETTLED audit record (`approved`/`auto_approved`) must not link a proposal
     that is still `pending`/`verifying`/`postponed` — a settled/anchored event
     can't point at an un-acted proposal (this is why `AUD-3308FE` links the
     executed twin `settled-aws`, not the still-pending `prop-aws`);
   - a linked document's status matches the event type (`approved`/`auto_approved`
     ⇒ `paid`; `flagged` ⇒ `held`) — **only for kinds that HAVE a status**
     (invoice/prior_payment/purchase_order); `bank_transaction` + `contract` carry
     none and are skipped;
   - a proposal's `invoiceId` matches its OWN lifecycle — a pending-like proposal
     must not own a `paid` document, and an `executed`/`auto_handled` proposal must
     own one — **and** its document `amount` == the proposal `amount`;
   - a document's `vendorName` == its resolved `vendor.name` (catches rename drift);
   - **document integrity**: every `bank_transaction` carries a `reconciliation`
     block, a document naming a KNOWN vendor also carries a `vendorName`, and a
     `compareToId` twin resolves + names the SAME vendor (when both known) + sits
     within a 5% amount band (the pair exists to surface a duplicate / bank-detail
     change, so a wildly different vendor or amount would be an incoherent compare).
   NOTE: a `flagged` record CAN link a pending proposal and CAN be anchored (a hold
   is itself an auditable event — see `AUD-3K8Q`), so neither is treated as a lie;
   display labels (linked-ref label, counterparty) MAY differ from a vendor's
   canonical name ("Notion Team" vs "Notion Labs") and are NOT equality-checked.
   Logs `[coherence] OK ...`. NB: standalone settled/held twins (`AWS_SETTLED` etc.)
   live outside the queue arrays, so they must be registered in
   `openProposalDetail.ts` `allProposals()` or their refs dangle.

5. **`checkSemanticAuditRecords()`** — narrative guard. Asserts that the mock audit
   records tell a consistent story:
   - An **untrusted vendor** (listed in `UNTRUSTED_VENDORS`) must never have an
     `auto_approved` audit record — they're either flagged for human review or held
     by always_on guards.
   - An `auto_approved` record whose linked rule is resolvable must have a category
     that semantically matches the counterparty (e.g. a contractor/studio under
     a "rent & lease" rule is flagged).
   This is the guard that would have caught the original AUD-7N2S claiming Bright
   Futures was auto_approved. Logs: `[semantic-consistency] OK ...` or listed
   mismatches.

6. **Anchor-UI honesty invariant** (formerly enforced by a `checkAnchorUiCoherence()`
   guard — that function NO LONGER EXISTS in the codebase; this section now documents
   the invariant itself, not a check that runs). On-chain verification is only real
   once a record is anchored, so any record whose `anchor.status` is
   `pending_next_batch` OR `not_recorded` must NOT carry `merkleRoot` / `baseTx` /
   `verifyHref` (there is nothing to link to yet, and for `not_recorded` never will
   be). This is meant to keep the ONE shared `AnchorStatus` component honest across
   every surface. There are five states, not two:
   - `anchored` — Verify affordance enabled, live link.
   - `recorded_pending_anchor` / `pending_next_batch` — Verify affordance disabled,
     caption "Verification opens once anchored." — a real future anchor window
     can still cover this record.
   - `not_recorded` — record exists only in this app and was never written to
     brain-core's audit log, so no anchor window will ever cover it. Verify
     affordance stays disabled but gets NO future-tense caption/tooltip (the
     "opens once anchored" wording would be false) and its own badge/label
     ("Not recorded", not "Pending") wherever anchor status renders as a pill.
   - `db_only_hash_chain` — demo-tenant records are retained in Brain's
     database hash chain but are explicitly not published to Base. Verify stays
     disabled and the UI must not promise a future on-chain anchor.
   A local-only record (e.g. an `assistant_questions` row) is only `not_recorded`
   when its `engine` confirms the direct-Anthropic fallback was taken; an
   unresolved/unknown `engine` (including legacy rows written before the column
   existed) falls back to `pending_next_batch` rather than asserting the stronger,
   possibly-false `not_recorded` claim.

7. **`checkAgentDomainCoherence()`** — agent↔event domain guard. The proposing
   agent named in a lifecycle label must stay inside its canonical catalog domain
   (see `AGENT_META` in `ProposalDetail.tsx`): **Invoice** = AP / vendor payments
   (incl. payroll runs & subscriptions), **Collections** = AR, **Cash** =
   treasury/sweep, **Close** = reconciliation. The proposing agent lives ONLY in the
   lifecycle label (`"<X> Agent proposed|detected …"`), so the guard parses it, then
   matches the ACTION PHRASE against per-domain keyword regexes (`AGENT_DOMAIN_KEYWORDS`).
   It flags ONLY when the matched domain(s) are non-empty AND the proposing agent is
   not among them; an ambiguous phrase (no keyword match) is SKIPPED so the guard
   never fires false positives on future copy. This is the guard that catches the
   class where e.g. the Close Agent (reconciliation) "proposes a payroll run" or a
   vendor payment — which belong to the Invoice Agent. Logs
   `[agent-domain-consistency] OK ...`.

8. **`checkActorPayeeSegregation()`** — segregation-of-duties guard. On a payment
   record the human ACTOR who approved it (lifecycle step `actor`) must never be the
   same party as the PAYEE it moves money to. The guard reuses the SHARED
   `linkedRelationship(record, link)` predicate to decide what counts as a payee —
   so it only fires on the exact rows the UI chips label `PAYEE` (payment event type
   + numeric amount + receiving kind vendor/employee), and can never drift from the
   UI. It compares actor identity tokens (raw + resolved email/id via `actors.ts`)
   against the payee's label / refId / resolved vendor name. Passes clean today
   (`sarah@meridian` is never a payee). Logs `[actor-payee-segregation] OK ...`.

9. **`checkMemberActorCoherence()`** — member↔actor seam guard. Members are
   CORE-BACKED (fetched at runtime, ephemeral ids) so this guard can't assert against
   live member data at boot; what it protects is the client seam that links an audit
   ACTOR to a core member. `resolveMemberByTokens` matches by normalized email/id, so
   the `actors.ts` registry those tokens come from must be unambiguous — this guard
   flags any duplicate or empty actor email/id (which would make an ACTOR resolve to
   the wrong member, or silently fail to link). Logs `[member-actor-coherence] OK ...`.

### Actor vs payee convention (audit records)

Audit records surface two distinct parties and they must stay visually + semantically
separate:
- **ACTOR** = WHO decided. Human-approval lifecycle steps carry an `actor` field
  (an email/id, e.g. `sarah@meridian`). The UI resolves a muted role suffix from the
  canonical `client/src/lib/actors.ts` registry (`resolveActorRole`) and renders it
  inline: `"sarah@meridian approved · finance admin"`. Roles are NEVER hardcoded per
  step. `LifecycleStep.authority` is reserved for the future members/limits spec
  (a second suffix like `· within her $10K payroll limit`) — the type + render slot
  exist.
  - **Actor → member link**: the ACTOR label becomes TAPPABLE (opens the member popup
    via `openMemberDetail`) ONLY when `resolveMemberByTokens(actorIdentityTokens(step.actor))`
    finds a real core member (matched by normalized email/id against the API-backed
    members cache). No core match → plain text. This is a link into core's record, never
    a client-side authority claim. `AuditRecordPopup` subscribes to `useMembersCache()`
    so labels light up once the cache primes. Guard 9 (`checkMemberActorCoherence`) keeps
    the `actors.ts` registry unambiguous (no dup/empty email/id) so a link never resolves
    to the wrong member.
- **PAYEE** = WHO was paid. Linked-evidence rows on payment records show a
  RELATIONSHIP chip (`PAYEE`), not the bare entity kind. This is DERIVED centrally by
  `linkedRelationship(record, link)` in `auditTypes.ts` from record type (payment
  event + numeric amount) and link kind (vendor/employee receive; protocol/ledger are
  treasury destinations, not payees; rule/invoice/proposal are evidence). An explicit
  `link.relationship` overrides the derived value. ONE convention, driven from data —
  never per-surface. `checkActorPayeeSegregation` (guard 8) asserts these two parties
  are never the same identity.

### History (2026-07): the "rule links don't work" bug

**Phase 1 — resolution fix**
- Diagnosis: wiring was correct and complete; only MOCK DATA was wrong. Three audit
  records pointed at rules that never existed — `cleaning` (`AUD-9H4X`, `AUD-0C4U`)
  and `contractor` (`AUD-7N2S`) — so those taps fell through to plain text.
- Fix (no new rules invented; repointed to correct existing rules):
  - `AUD-9H4X` (Apex trust-revoked): removed the dangling rule link — `trust_revoked`
    is a vendor event, and no existing pausable rule governs untrusted Apex.
  - `AUD-0C4U` ("new rule created"): repointed to `sweep` ("Move extra cash to
    savings"), matching the weekly-sweep suggestion narrative.
  - `AUD-7N2S` (Bright Futures): initially repointed to `lease` — but see Phase 2.
- Also added `console.warn` in `openRuleDetail` and the dev resolution guard so
  this id drift can never ship silently again.

**Phase 2 — semantic audit (follow-up)**
The resolution fix made the id resolve, but the NARRATIVE was still broken.
Bright Futures is the canonical **bank-detail-change fraud example** across the
entire demo — it must NEVER be auto_approved. Cross-surface check confirmed:

| Surface | Bright Futures story |
|---|---|
| `prop-bankchange` (NEEDS_REVIEW) | "Bank details changed on a contractor invoice" — held for review, `severity: danger`, `policy: ap.fraud.v2` |
| `AUD-7K2M` (audit) | `eventType: "flagged"`, summary: "Payment held — bank details changed", lifecycle: escalated to human, payment held pending verification |
| `ReviewItems.tsx` | "Should I pay Bright Futures Studio $3,200?" — verify-first action |
| `UNTRUSTED_VENDORS` | `Apex Cleaning Co`, `Meridian Consulting LLC`, `Northwind Logistics` — Bright Futures is NOT listed, but the bank-detail-change guard (`bank-detail-change`) is always_on and holds ALL vendor bank changes |

**AUD-7N2S fix (semantic):**
- Changed `eventType` from `"auto_approved"` → `"flagged"`.
- Summary changed to "Payment held — bank details changed" (matching AUD-7K2M).
- Lifecycle rebuilt to match: propose → escalate (policy/ap.fraud.v2) → held pending
  verification. No ACH settled step — it's still held.
- Removed the `lease` rule link entirely; replaced with a proposal link to
  `prop-bankchange` (Invoice #BFS-0426).
- Anchor status: `pending_next_batch` (unchanged — the payment is still held, not
  anchored as executed).

**AUD-7K2M fix (dangling proposal ref):**
- The `linked` proposal ref was `prop-bright-futures` (a non-existent id). Fixed
  to `prop-bankchange` (the real proposal id for Bright Futures), with label
  "Invoice #BFS-0426" to match the proposal's invoice title.

**Result:** Both `AUD-7K2M` and `AUD-7N2S` now tell the same story as the review
proposal and the `ReviewItems` surface: Bright Futures is HELD for bank-detail
verification, never auto-cleared.

**Phase 3 — anchor-UI honesty + agent↔event domain coherence**
Two more "resolves-but-lies" classes, each fixed in data AND locked by a new
unified dev guard (see guards 6 & 7 above):
- **Anchor-UI:** on-chain verification is only real once anchored, so `AnchorStatus`
  now renders the Verify affordance DISABLED and NO live link whenever `anchor.status`
  is not `anchored`, driven purely from `anchor.status` — in BOTH proof and status
  modes. The disabled-but-informative caption "Verification opens once anchored." is
  correct ONLY for `recorded_pending_anchor` / `pending_next_batch` — a real future
  anchor window can still cover those records. It is WRONG for `not_recorded` (the
  record never reached brain-core's audit log at all, so no anchor window will ever
  cover it): that state suppresses the future-tense caption/tooltip entirely and gets
  its own honest label ("Not recorded") wherever anchor status renders as a pill.
  Guarded by `checkAnchorUiCoherence` (a pending OR not-recorded record must not
  carry `merkleRoot`/`baseTx`/`verifyHref`).
- **Agent↔event domain:** two records had the WRONG proposing agent for the action —
  `AUD-8A1R` ("Close Agent proposed payment" for an office-lease AP payment) and
  `AUD-5J7Y` ("Close Agent proposed payroll run") both belong to the **Invoice**
  Agent (AP). Fixed the lifecycle labels; `AUD-5J7Y`'s linked `PAYROLL_SETTLED`
  proposal (`mockProposals.ts`) also had `agent: "close"` → changed to `"invoice"`
  with its timeline label updated to match. Guarded by `checkAgentDomainCoherence`.

## Route ordering (wouter)
`/rules/:id` is registered before `/rules` in `App.tsx` — keep specific routes ahead
of generic ones. `RuleDetail` reads `params.id` and must not be modified to accept a
different key.

## Branch reconciliation (state of record)
This workspace line is the unified state intended to land on `main` (the platform merge
flow lands it once the task is approved; after that merge `main` is the source of truth).
It carries the full platform (Review, Rules, Vendors, Audit Log, Finances, the members
integration, the BFF) plus two honesty commits that previously lived only on a side branch:
1. real SIWE signature verification with a single-use nonce in `server/routes.ts`
   (the dead `/api/account/allocate` stub was dropped in the same pass), and
2. honest empty states in place of fabricated money surfaces (the static account
   list on Finances, the auto-handled receipts on Review, and the Account Totals card
   are gone, so an empty or unreachable ledger reads as empty rather than inventing
   numbers).
The superseded branches `feat/ui-rework`, `feat/brain-core-honesty`, and
`feat/brain-core-integration` are folded into this line (reconciliation commit `7e89a5b`
folded in the honesty and integration lines) and are slated for deletion once it lands on
`main`. If a conflict ever forces a choice between a fabricated surface and an empty state,
the empty state wins.

## SIWE nonce (CSPRNG)
The `/api/auth/nonce` login nonce is generated by a cryptographically secure RNG
(`generateNonce()` in `server/nonce.ts`, backed by `crypto.randomBytes(32).toString("hex")`)
— never `Math.random()`, which is not a CSPRNG. The consume-before-validate flow, the
expiry, and the address binding in the verify handler are unchanged. `server/nonce.test.ts`
pins the two properties (64-char hex, distinct successive values) as a merge gate.

## Settled record card (STATUS vs PROOF)
`client/src/components/SettledRecordCard.tsx` is the post-approval operational view of a
proposal: past-tense headline ("You approved / executed"), meta line, NO decision buttons,
and the anchor line via `AnchorStatus mode="status"` (status, not the full cryptographic
proof). Its "View full record in Audit Log" link is the ONLY path to the canonical PROOF —
the rule stands: STATUS on operational surfaces, PROOF in the canonical Audit Log record.
It renders from `ReviewPage` "Settled today": the demo proposal (`MOCK_PROPOSALS[0]`, live
queue empty) moves Needs Review → executing → settled purely by user action via
`reviewStatusStore` (no setTimeout), and an `executed` row opens the card. Live brain-core
rows have no client-side settled state, so they never populate this list; their settled
state is read straight from the Audit Log instead.

## BFF safety tests (invariant guard)
`server/brain/bff-invariants.test.ts` plus `client/src/lib/approvalRejections.test.ts`
are the platform-side twins of brain-core's own invariants. They pin five safety rules:
token routing (propose uses the AGENT token only; reads, member writes, and approve or
reject use the MEMBER token), no `actor` field in any BFF-constructed payload (ACTOR is
the SESSION and core derives it), provision fail-hard when the member token is missing
(never a silent agent-only fallback), the full approval-rejection mapping including both
`self_approval_blocked` cases split by `details.payee_unresolved`, and the secrets
boundary (the provision secret and brain-core tokens never reach the browser). brain-core
is mocked at the fetch boundary, so the suite never touches the live API. Run it with
`npm test`. Any change to `server/brain/*` must keep these green; if the behavior is
meant to change, update the test in the same commit so the invariant stays explicit.

## brain-core API surface wiring (artifact: attached_assets/api-surface.brainmvb_*.json)
The api-surface artifact is the SOLE source of truth for what's callable on brain-core —
it wins over Brain_API_Specification.yaml wherever the artifact's `drift` section says they
disagree. Scope checks are PER-ROUTE (`requireScope` inside handlers); there is no gateway
matrix. State of wiring for the in-scope groups (ledger_and_canonical, wiki_memory_policy,
agents_execution_payments_members, audit_proof_tenant):
- **Reads (all in-scope GETs)**: reachable through the generic member-token GET passthrough
  in `server/brain/proxy.ts`. Actively consumed today: ledger accounts/transactions/
  counterparties/invoices/obligations/cash_flows/reconciliation-matches, members,
  policy (via `/api/brain/approval-policy`), proposals, payment-intents/:id, wiki/schema,
  audit/events, audit/anchor/latest. The rest (balances, per-id ledger reads, `/resolved`
  views, canonical/*, memory/pages|search, wiki/entity|search, policy/versions, agents/*
  reads, execution reads, audit event/entity, proof/*, tenant export status) are callable
  but have no UI consumer yet.
- **Writes**: explicit per-endpoint allowlist only (generic non-GET is 405). Bespoke routes:
  propose (AGENT token), reject/approve, members CRUD + invites, counterparties create,
  proposals/:id/decide, wiki/question. The `WRITE_ROUTES` table in proxy.ts wires the
  remaining in-scope writes with the artifact's exact scope per row: ledger counterparty
  PATCH/normalize/reconcile, memory/regenerate, wiki/annotate, policy compose/sign/evaluate/
  simulate/lint/diff/simulate-historical (tenantId ALWAYS from the session, never the
  client), agents route/run/events (run+events on the AGENT token — payment_intent:propose)/
  mcp (per-tool scopes checked by core)/halt/restore/contribution-hold-release/halt-category,
  generic payment-intents create (AGENT token), evidence/resolve, members identity-links
  POST/DELETE, payment-intents pause/resume/execute, execution propose/approve/escalate/
  agents-register, audit export/verify/webhook endpoints/replay, tenant export (session
  tenant only). No demo/synthetic fallback anywhere on `route_scope_check_enforced` routes —
  upstream errors relay verbatim. Invariant 6 in `bff-invariants.test.ts` pins the allowlist
  (excluded routes 405, agents/run on the agent token, policy tenant from the session).
- **Excluded (do NOT wire)**: `POST /execution/execute` (always 422 gate_no_policy_decision;
  the live execute path is `POST /payment-intents/:id/execute`), `POST /execution/mcp`
  (deprecated ping-only), all X-Platform-Service-Auth routes (BFF-only via
  `server/brain/tenancy.ts` — verified nothing else calls them), everything under
  `feature_gated_or_not_stable` (signup/login/verify-email, wallets, API keys/usage —
  the Developers pages stay as-is, service-token, demo/* provisioning).
- **Deliberately pending**: `DELETE /tenants/:id` (destructive — needs its own confirm
  flow), `POST /audit/anchor/publish` (audit:admin + conditional dependency),
  tenant export `download` (binary relay, brainRequest is JSON-only).
- **Resolved drift — `GET /actions` never existed.** This was previously flagged as
  "not in the artifact but works in production". It does not: brain-core answers
  `404 route_not_found` for `/v1/actions`, and the artifact has zero entries for it.
  The only actions route on the whole surface is the per-agent
  `GET /agents/{agent_id}/actions`, a different resource (and one that returns
  `{actions: []}` for any string, validated or not — do not use it as an existence check).
  The Inbox review queue (`useBrainReviewQueue`/`useBrainAutoApproved`) and the assistant's
  pending-approval grounding now list via **`GET /proposals`**, which brain-core's
  read-model implements as a UNION ALL of the proposals table and `ledger_payment_intents`:
  rows with a non-null `payment_intent_id` ARE the money path, and are deliberately excluded
  from `useBrainProposals` (`selectNonFinancialProposals`) for exactly that reason. Both
  paths take ids from there and fan out to `GET /payment-intents/{id}`, then filter on the
  **detail** status — the merged row's own status has no published mapping onto PaymentIntent
  statuses and must never be trusted to decide queue membership.
- **Agent actor lookups are re-pointed.** Audit events emit
  `actor_ref.lookup = /v1/agents/{runtime ULID}`, but `GET /agents/{agent_id}` is the agent
  *catalog*, keyed by agent_key (`collections`, `treasury`, …) and 404s `agent_not_found` for
  every ULID. `bffPathForActorLookup` (client.ts → brainAudit.ts) rewrites bare agent lookups
  to `/v1/execution/agents/{id}`, the runtime registry, which resolves them and returns
  `display_name`. The emitted lookup path is upstream-wrong; flag it to brain-core owners.

## Proposal cards: resolve names on the BFF, not in the client
brain-core proposals cite entities as bare ids (`inv_01KY…`), so an unenriched card is a wall
of ULIDs. `GET /api/brain/proposals` is an **exact-path route in `proxy.ts`** (registered
before the write allowlist and well before the generic GET passthrough) that runs
`enrichProposals` over the page. `/proposals/:id` still falls through untouched.

`server/brain/proposalEnrichment.ts` builds one id → entity index from counterparties,
invoices, obligations, accounts, members and **transactions**, then adds to each evidence
item — all fields OPTIONAL on the client type:
- `label` — human caption for `kind` ("Invoice", "Counterparty").
- `display` — resolved name, or `null` when nothing matched.
- `code` — the bare business identifier (`"AR-MIDMARKET-001"`) when the record has one distinct
  from its name, so the card headline can quote the document number without re-parsing `display`.
- `amount` — `{ value, currency }`, **structured, never a formatted string** (see below).
- `facts[]` — `{label, value}` rows derived from REAL ledger fields (due date, days overdue,
  status, PO, direction). Never invent a fact the backend does not have.
- `context` — `true` for background citations; see the wiki rule below.

Plus a proposal-level `subject: {label, display} | null` — the entity a human would name the
card by, preferring a resolved party over the first resolved entity.

Rules learned the hard way, all pinned by `proposalEnrichment.test.ts`:
- **Resolve by direct id lookup, never by ULID prefix.** Ids are `^[a-z]+_[0-9A-HJKMNP-TV-Z]{26}$`
  with no published prefix→entity registry, so a prefix table silently stops resolving the
  day core adds a type. `kind` only captions the row.
- **Refs come in two spellings.** The same entity is cited both bare (`cp_01KY…`) and as a
  wiki URI (`wiki:/counterparties/cp_01KY…`). Look up the ref, then its trailing path
  segment. Bare-id-only lookup left more than half of live evidence unresolved.
- **`wiki:` refs are `context`, not the subject.** A collections proposal cites the whole
  counterparty book as background while naming one customer, so letting them win renamed a
  StartupX card after an unrelated customer. Context items never caption the card and never
  produce detail rows — they stay in "Technical reference" with their resolved name.
- **Index transactions.** Reconciliation proposals cite `tx_` refs and nothing else; without
  that leg every reconciliation card was a subject-less wall of ids.
- **Every leg is `Promise.allSettled`.** A reference-data outage must serve the raw page, not
  502 the review queue. Enrichment is best-effort and the UI must render without it.
- **The bulk list pass is a prefetch, not the guarantee.** brain-core caps these collections
  server-side — `/ledger/counterparties` returns 20 rows however large `limit` is, and the
  cap is silent. On a tenant with more records than one page the cited entity is simply
  absent, which is why cards rendered with no subject and no detail rows.
  `hydrateMissingRefs` closes that gap by reading the specific refs that missed via
  `GET /ledger/<collection>/{id}` (routed for counterparties, invoices and transactions —
  **`/ledger/obligations/{id}` is a 404**, so obligations resolve only via the bulk pass).
  It picks the endpoint from the **wiki URI's own collection segment** or brain-core's
  declared `kind` — never from the id prefix — caps itself at `MAX_TARGETED_LOOKUPS`, and
  swallows every failure so a ref just stays raw.

### Card layout
Pure, unit-tested logic lives in `client/src/lib/proposalCards.ts` — kept out of the `.tsx`
because the suite runs in a node environment. The card body renders in this fixed order, and
the same component serves **every** agent type (Collections, Invoice, Cash, Close, …); there is
no per-agent card:

1. **Header + hero** — a centred agent name in the sticky header, then a hero block holding
   the risk pill, `presentation.headline` (or `subject.display`) and a subline from
   `buildProposalHeadline` (`"AR-MIDMARKET-001 · $42,000.00"`). Both subline halves are
   independent and omitted when the cited records lack them; with neither, it falls back to the
   agent line. **No avatar** — the agent is named once, in the header.
2. **Detail rows** — `buildProposalDetailRows`, de-duplicated, sorted by decision relevance
   (Amount → Overdue by → Due → Status → …), each with a `label`, right-aligned value, and an
   `icon` **key** (a string, so this module stays free of component imports — the modal maps
   it via `DETAIL_ROW_ICONS`). The first `MAX_VISIBLE_DETAIL_ROWS` (4) show; the rest move into
   the collapsed "Technical reference". Unknown labels sort last rather than being dropped, so
   a new brain-core fact still renders. The row repeating the headline document is suppressed.
3. **Narrative**, rendered in full (the frame shows the whole paragraph; no clamp).
4. **"Message Draft"** — Collections only (`SENDS_OUTBOUND_MESSAGE`; `action_type` is null
   upstream so there is no generic way to detect "this approval sends an email", and offering
   the section on a reconciliation card would imply a message that never exists). See below for
   what the draft may and may not claim.
5. **Collapsed "Technical Detail"** — overflow rows, every raw ref, payment intent id. The
   section heading itself is the disclosure control.

**Do not render a field brain-core does not carry — not even a plausible one.** This is an
approval surface: whatever the card shows is what the approver believes they are authorising.
Verified absent as of this writing:
- Counterparties have **no email**, so there is no "Recipient" row.
- Nothing tracks **reminder history** (`/collections/reminders`, `/reminders`, `/messages`,
  `/notifications`, `/agents/messages` are all 404).
- Neither `GET /proposals` nor `GET /proposals/{id}` carries **message/draft content** — their
  key sets are identical and `action_type` is null. brain-core composes the outbound text at
  *execution* time.

**"Message Draft" is composed client-side, and every word of it is either boilerplate or a
fact off this proposal.** `buildCollectionsDraft` fills one fixed template from the resolved
key facts (customer, amount, invoice code, days overdue / due date) and **drops** any clause
whose fact is missing; with neither an amount nor an invoice reference there is nothing
concrete to chase, so the whole section is withheld rather than padded. A caption under the
draft says plainly that brain-core generates the final wording at execution. Do not extend the
template with anything the record does not carry — this is text sitting above an Approve
button on a real customer email. When core exposes a propose-time draft field, bind to it and
delete the template.

## Full-parity proposal cards: one card for every proposal_type

> **STATUS — PENDING MERGE on `feature/proposal-cards-full-parity` (2026-08-02). NOT merged, NOT
> landed on `main`.** `main` is at `c81936f`; the branch is 97 commits / 141 files ahead, with 4
> commits still unpushed and no PR open. Everything in this section describes the **branch**, not
> shipped `main` behaviour. A human reviewer owns the merge: the diff also carries tiering, the
> bulk-approve gate and threshold reads, which the standing repo rule keeps off admin/self merge.
>
> **OPEN ITEM — live-verification split.** The shared card component covers all proposal types via
> `details` / `policy` / `presentation` / `available_decisions` binding. **Live-verified against
> real API data:** `collections`, `vendor_risk`, `payment`. **Structurally verified only — never
> rendered from a real pending proposal:** `fraud_anomaly`, `cash_forecast`, `treasury`,
> `subscription`, `compliance`. Close this out the next time any of those five has a real pending
> proposal in any tenant.

The rich card is no longer Invoice/Cash-only. `LiveProposalModal` renders the **same markup and
CSS** for all 19 types, driven entirely by what the record carries. Pure builders live in
`client/src/lib/proposalCards.ts` (node-environment suite, no component imports).

**The 19 `proposal_type` values** (verbatim from the read-model contract's domain table — do not
paraphrase them from memory). Core ledger/agent types: `payment`, `collections`, `reconciliation`,
`treasury`, `cash_forecast`, `subscription`, `compliance`, `fraud_anomaly`, `dispute`,
`revenue_intel`, `vendor_risk`. Advisory types promoted into the Inbox: `personal_budget`,
`tax_prep`, `travel_finance`, `bill_management`, `debt_optimization`, `financial_health`,
`purchase_advisor`, `savings`. `ProposalType`, `AgentKey`, `AGENT_ICONS` and
`AGENT_DISPLAY_NAME` all cover the full set — the two `Record<AgentKey, …>` maps are
compiler-enforced, so adding a type upstream breaks the build instead of falling back.

**Field contract (every field OPTIONAL — the card omits, never fabricates):**
| Section | Source | Behaviour when absent |
| --- | --- | --- |
| Headline / subline | `presentation.headline`, resolved subject | falls back to subject line, then agent line |
| Confidence | `presentation.confidence_band` + `confidence` | band alone, or pct alone, or omitted |
| Recommended Action | `presentation.recommendation` | section omitted |
| Key facts table | `key_facts` (BFF-resolved) → `presentation.key_facts` | falls back to evidence-derived rows |
| Why This Needs Your Call | `narrative` / `details` | section omitted |
| Linked Evidence | resolved `evidence[]` | section omitted |
| What Happens Next / If This Is Wrong | `presentation.consequences`, else per-decision copy | **omitted, never invented** |
| Flagged by | `policy.policy_id` → `matched_rule_id` → trace rule + approvers | line omitted |
| Actions | `available_decisions[]` | falls back to the record's `mode` |
| Message Draft | `buildCollectionsDraft` over resolved key facts (Collections only) | section omitted |
| Technical Detail | `stored_action_type`, technical facts, `presentation.technical_detail` | six layers, whichever exist |

**Rules the live tenant forced, all pinned by `proposalCards.test.ts`:**
- **Buttons come from `available_decisions`, not a hardcoded Approve/Reject pair.** Live data:
  compliance *and* `fraud_anomaly` offer only `[acknowledge]`; treasury, `cash_forecast` and
  `subscription` offer `[approve, reject]`. The read-model doc's per-domain action-label table is
  **aspirational** — bind to the array. A decision id outside the documented write set
  (`approve`/`reject`/`acknowledge`/`undo`) renders **disabled** rather than firing a call the
  API rejects.
- **`policy.policy_id` is null on every live row**, so the "Flagged by" fallback chain matters:
  `matched_rule_id` is set only for compliance (`cmp_policy_violation`); the other four fall
  through to the policy trace rule and `required_approvers` ("Flagged by a policy confirm
  decision · requires Signer approval"). Nothing to say → the line is omitted.
- **Never recompute the confidence band from the percentage.** Core's band and pct legitimately
  disagree (a live row bands `standard` at 47%). Render `"High · 94%"` from what arrived.
- **No raw id may appear in the primary view** — not in key facts, and not in prose. Core writes
  ids straight into both (`"tx_01KY… fraud anomaly risk is elevated"`, `"Compliance review for
  inv_01KY… found policy_violation"`). The BFF emits `resolved_refs` (id → name, for ids the
  index knows) alongside `key_facts`; `resolveHeadlineText`/`resolveProseText` substitute names,
  **drop** ids that resolved to nothing, and space out `lower_snake_case` enums. Ids remain
  visible in Technical Detail, which is where they belong.
- **Unresolved ids and `…Id`-labelled facts are demoted, not dropped** — they move to the
  collapsed technical section so nothing is silently lost.
- **De-duplicate after resolution.** A fraud row carries both `Transaction Id` and
  `Counterparty Name`; once the id becomes a name they are the same string.

**Inbox routing is by decidability, not by `mode`.** `isDecidableProposal` replaced the old
`mode !== "notify_only"` gate: notify-only compliance and fraud rows carry a real `acknowledge`
decision and were being stranded in the Audit Log. Advisory types route through the same shared
card — there is no fallback view.

### The Inbox is grouped by what it asks of you, not by derived tier

The Unresolved tab renders three named sections via the shared `RowSection` (the chrome
`TierSection` also uses — do not hand-roll a second copy):

| Section | Source | Rows |
|---|---|---|
| **Needs your decision** | `items` where `kind === "proposal"` | decidable records; bulk-approve checkboxes live here and **only** here |
| **Needs your input** | `agent.run.missing_evidence` audit events, via `useMissingEvidenceItems` | agent runs that stopped; no checkbox, exactly one action |
| **For your awareness** | `items` where `kind === "detection"` | ledger-derived observations; nothing proposed |

`kind` is the split, because it is the field the row's own buttons already derive from — a
row cannot land under "Needs your decision" while its controls disagree. Tier is not lost:
rows stay in `orderRowsForDisplay` order inside each section and keep their accent bar.

**Resolved is deliberately NOT sectioned.** It is history; nothing is being asked, so a
"needs you" grouping there would be a lie. Applying the new grouping to it is the obvious
wrong follow-up.

Three consequences worth knowing before editing this page:

- **`inputRows` are not in `items`.** They have no type, amount or decision status, so
  `applyDecisionFilters` cannot reach them. The section stays visible while a filter is
  active and says the filter doesn't apply, rather than vanishing (which would silently
  under-report stalled agents).
- **Counts include them.** The Unresolved tab badge and the "Awaiting you" count row both
  add `inputRows.length`. The count row's label switches to "Decisions" only on Resolved —
  a stalled run is not a decision, and the old fixed label sat above rows it didn't describe.
- **The audit feed is capped** (`AUDIT_EVENTS_LIMIT`). At the cap the section captions that
  it is showing recent events only; an absent row is not proof no agent is stuck.

Shipped with two known gaps, both deliberate and tracked: entity refs render as raw
brain-core ids (`cp_01K…`) behind a kind label, and every row offers the same generic
"View in Audit Log" rather than routing per missing-field type.

## Currency formatting — one formatter, and never pre-format on the server
Amounts were rendering as `42000.00`. Root cause was **two diverged private copies** of the
same helper: BrainAssistant's matched a `USD 18600` prefix but never applied the FX rate,
HomePage's was the exact reverse. Both are deleted.

`client/src/lib/formatAmounts.ts` is now the single formatter, exposed as `formatText` on
`useCurrency()`. It handles symbol-prefix, code-prefix, code-suffix and ETH (native units, no
FX), and normalises amounts already in the active currency without re-applying the rate.
Every surface that renders backend or LLM prose goes through it: proposal cards, inbox,
assistant chat + citation excerpts, insights, audit records, ProposalDetail rationale and
bullets. When adding a surface that prints server text, wire `formatText` — do not re-derive.

- **Never pre-format money server-side.** Amounts travel as `{ value, currency }` so the
  client can apply the active display currency and FX rate. Emitting `"$18,600.00"` from the
  BFF hard-codes USD and breaks the currency switcher.
- **Bare numbers are deliberately NOT auto-formatted.** `42000.00` with no marker is
  indistinguishable from a date, count, confidence score or id fragment. Producers must emit
  a currency marker; `server/routes.ts` has a `money()` helper and `ASSISTANT_SYSTEM` carries
  an explicit instruction. Format numbers BEFORE interpolation rather than asking the LLM to.
  Two **narrowly guarded** exceptions exist on proposal cards, where the record itself states
  its currency and core sends unmarked values anyway — both live in `proposalCards.ts` and are
  pinned by tests. Do not widen either, and do not copy the pattern to prose whose currency is
  unknown:
  1. A fact row is treated as money only when its label is a strict money noun
     (`STRICT_MONEY_LABEL_RE` — deliberately excludes `payment` and `value`, which head
     "Payment Terms: 30"), or when the value already carries two decimals under the looser
     label set. Everything else only gets thousands separators.
  2. `applyCurrencyToBareAmounts` tags an amount in **core's own narrative** with the currency
     the record's evidence cites, and only for 4+ integer digits with exactly two decimals —
     so `"… for 50000.00 scored 0.70"` formats the amount and leaves the score alone.
- **Fact values that are timestamps render as dates.** Core returns raw columns
  (`"2026-07-20 00:00:00+00"`); `formatFactDate` renders `Jul 20, 2026`, keeping the time only
  when it is non-midnight AND unambiguously UTC.
- **A minus binds tightly to the marker.** `-$2,400` is negative; `Invoice #A1 - USD 18,600`
  is a separator. Do not let the sign group swallow surrounding whitespace, or
  `Paid €500` renders as `Paid€500.00`.

## CI gate
`.github/workflows/test.yml` runs `npm test` (the vitest suite) on every pull request and
on push to `main` (Node 20, npm cache). The workflow is green only when the suite passes,
so the BFF invariants and the CSPRNG nonce test are a MERGE GATE, not just documentation.
Any change to `server/brain/*` must keep the invariant suite green or the PR cannot land.

## Repo discipline
`main` is the source of truth; push to GitHub and merge to main after each milestone so the
public repo never drifts. The CI gate above must be green before a PR merges to `main`.
No work is complete until it is on main; branch-complete is not complete.

### Rebasing a stacked branch (PRs land by SQUASH)
Rebase a stacked branch ONLY with `git rebase --onto origin/main <the parent branch's
PRE-rebase tip>`. Never plain `git rebase origin/main`: a squash merge puts the parent's
combined *content* in `main` but not its commits, so a plain rebase walks back to the
stack's root and replays every already-merged ancestor, conflicts on the first one, and
leaves a half-applied rebase.

The conflict is not the dangerous part. `npm test` run against that half-applied tree can
still report a healthy pass count, because the conflicted files need not be the ones under
test — a green suite is NOT evidence the rebase worked. After every rebase confirm
`git status --porcelain` is empty and `git log --oneline` shows only that branch's own
commits sitting directly on `main`, and only then run the suite.

Related traps:
- `git log origin/main..<branch>` lists those already-merged ancestor commits, so it is not
  a reliable "what is still unmerged" signal for this stack.
- `set -e` does not stop a failing `git rebase … | tail` — a pipeline's status is the last
  command's. Use `set -eo pipefail` or check the rebase result explicitly.
- GitHub retargets only the *immediate* child's base to `main` when a parent merges.
  Retarget the rest through the API, and re-check `base.ref` and `head.sha` in the same
  call that merges.

### Memory PRs: rebase immediately before merge, ALWAYS
Every `.agents/memory/` change edits the same few lines of the same file (`MEMORY.md`), so a
memory PR cut from an older `main` reverts whichever index lines landed in between. The
squash restores the stale file wholesale and GitHub reports no conflict, because the branch
is a clean descendant of the commit it was cut from.

Rebase a memory PR onto `origin/main` **immediately before merging it**, never relying on the
state it was opened from. Then verify the index in BOTH directions:

- every topic file is reachable from an index line, and
- every index line points at a file that exists.

**Why:** six entries were lost exactly this way and went unnoticed. The topic files stay on
disk, so nothing looks broken and no test fails — the content is simply never found again,
because the only way to reach it is to already know the filename. A dropped pointer is worse
than a dropped file for that reason.

This applies to any PR that edits a shared append-only index, but `MEMORY.md` is the one that
gets hit, because it is touched by nearly every session.

### Verification standard for merges: try to break it
Confirming that a feature works is not verification. For every gated PR in this stack — #38
(done), #42 and #46 still to come — the pass must also hunt for a live case where the
feature is WRONG: a record that should be gated differently than it renders, a role or
limit edge case that slips through, a state the surface has no honest answer for. Derive
the expected answers from live API data and recompute them independently instead of
importing the module under test, or the check inherits the bug it is looking for.

Report the attempt explicitly either way. "Tried X and Y against live data, found nothing"
is a result; silence reads as "not checked". Say so too when a case cannot be reached with
current live data — an untestable path is not a passing one, it is an unknown.

## Production tenancy (Phase 2, gated by BRAIN_TENANCY_MODE=production)
Demo mode (default) is byte-identical to before — `/api/brain/tenancy` returns
`{mode:"demo", linked:true}` and nothing else changes. In production mode:
- **Identity mapping** `brain_identities` (app userId → tenantId/userPrincipalId) is the ONLY
  link between platform accounts and brain-core tenants. `external_ref` sent to core is ALWAYS
  the app userId, never an email.
- **Platform-service calls** (`server/brain/tenancy.ts`) use `X-Platform-Service-Auth:
  BRAIN_PLATFORM_SERVICE_SECRET`: `createTenant`, `exchangeSession`, `refreshSession`,
  `consumeInvite`, `mintAgentToken`. Everything else stays on the member/agent tokens as before.
- **Session strategy** (`auth.ts` `createProductionSession`): identity lookup → no identity =
  `NoTenantError` (relayed as 403 `no_tenant`, NEVER auto-provision); session exchange on login;
  refresh-token first, full re-exchange on rejection.
- **Production agent token** (docs/contracts/production-agents.md, core PR #250): core mints a
  real per-TENANT agent principal at tenant creation (`POST /v1/tenants` returns
  `agent:{id,token,expires_in}`) and re-issues it idempotently via
  `POST /v1/tenants/{tenantId}/agent-token` (platform-service credential). The BFF:
  - persists the creation-time token in `brain_agent_tokens` (tenantId PK, token, expiresAt) —
    `proxy.ts` tenant-create stores it before seeding the session cache; never sent to browser.
  - `auth.ts getProductionAgentToken(tenantId)`: stored row if >120s from expiry; else mint +
    upsert. Backfill for pre-contract tenants is the same path (mint on next session use — the
    route is idempotent, no data migration).
  - `registerBrainSession` is async; tenant-create passes the fresh agent token, invite-consume
    resolves/mints the tenant's stored one.
  - **Deployment evidence as of 2026-07-17:** core PR #250 merged as `0821e60`, and brain-core has
    prod deploy tag `deploy/prod/20260714T123355Z-0821e60`; later prod deploy tags include that
    merge. Unauthenticated public probes to `POST https://api.brain.fi/v1/tenants` and
    `/v1/tenants/tnt_probe/agent-token` returned 401, not 404, so the production tenancy and
    agent-token routes are deployed and auth-gated. This workspace does **not** contain a
    credentialed post-deploy probe transcript and I did not have `BRAIN_PLATFORM_SERVICE_SECRET`,
    so successful production tenant creation and agent-token minting still need maintainer
    confirmation before this should be described as fully probe-confirmed.
  - **Graceful degradation** (kept for outages/rollbacks): a mint failure must NOT break
    sessions — `getProductionAgentToken` logs a loud warning and returns the stored token or
    null; `toProductionCached` then mirrors the member token so reads work and propose 403s
    honestly (never faked).
- **Tenant creation is NOT idempotent** — never auto-retry `POST /api/brain/tenants`; surface
  the failure and let the human resubmit. 409 `already_linked` is honest, not a no-op.
- **Invites**: issue/revoke via member token (`POST/DELETE /api/brain/members/:id/invites`);
  consume via platform-service (`POST /api/brain/invites/consume`), only after the explicit
  "Join company" confirm on `CompanySetupPage` (`/invite/:token` keeps the token in the URL
  through login). Invite refusals (`invite_invalid|expired|consumed|revoked`, `already_linked`)
  map to plain language, never silently swallowed.
- **Client gate**: `App.tsx` `TenancyGate` queries `/api/brain/tenancy`; production + unlinked →
  `CompanySetupPage` (create company / join with invite). Signup collects Company name when
  `/api/config.tenancyProduction` is true and creates the tenant right after registering; a
  failure hands the error to `CompanySetupPage` via sessionStorage so it is never dropped.
- **Team UI**: production shows "Invited — awaiting signup" pill + Resend/Revoke; add-member
  sends `invite:true`.

## Settings — August 2026 cleanup
- **Profile / Currency**: sublabel updated to "Fallback for accounts that don't specify their own
  display currency". `useCurrency()` continues to drive the dropdown; scoping to individual ledger
  accounts is deferred until those accounts expose a currency preference upstream.
- **Profile / Auto-Approve Limit removed**: The "Approvals" card (read-only "Conditional" display,
  no edit path) was cut from the Profile section. `useBrainPolicy`, `autoApproveLimitFromPolicy`,
  and `groupPolicyAmount` are no longer imported by `SettingsPage.tsx`. Revisit once policy editing
  has a real home.
  - **QA impact**: `scripts/qa-policy-read-states.mjs` was the dedicated script verifying the four
    policy-read states (200 / 404-no-policy / 401-403 refused / 5xx broken) via the now-removed
    card. It has been **deleted**. `scripts/qa-settings-degraded-states.mjs` had six assertions on
    `setting-row-auto-approve-limit` and `text-auto-approve-limit`; those are also **removed**.
    If a new surface re-exposes policy-read states, add new QA coverage — do not assume it exists.
- **Notifications hidden from nav**: The "Notifications" entry was removed from `NAV_ITEMS`.
  The section itself (`NotificationsFigma`) and its entry in `VALID_SECTIONS` remain intact so
  a direct `?section=notifications` deep-link still resolves rather than 404ing.
- **Team / Escalation removed**: The Escalation sub-section (timer rows + MutedCallout banner)
  was removed from `TeamSection.tsx`. `MutedCallout` import dropped accordingly.
- **Billing buttons confirmed live**: "Choose A Plan" opens `ChangePlanModal`; "Add Card" opens
  `UpdateCardModal`. Both were already wired; no UI change needed.

## Disabled controls, muted text, and destructive hover

Three rules that a design-consistency audit found broken across most surfaces. They are cheap to
re-break, because each one is expressed as a literal utility string on ~50 hand-rolled buttons
rather than in a shared primitive.

### One disabled treatment, everywhere
Every disabled-capable control uses exactly:

```
disabled:opacity-60 disabled:cursor-not-allowed
```

Nothing else. The app previously mixed `opacity-40`, `opacity-50`, `cursor-wait`, `cursor-default`
and "no disabled styling at all".

#### The measurement model
`opacity` fades the *whole* control — label **and** fill — toward whatever is painted behind it, so
**both sides of the ratio move together**. Comparing a faded label against an unfaded fill is the
intuitive model, and it is wrong in the optimistic direction. Every figure below is computed
against the `#0a0c10` card surface, not estimated:

| Pairing | Where | enabled | `.40` (old) | `.60` (now) |
| --- | --- | --- | --- | --- |
| `#7631ee` on `#240757` | secondary purple — "Review rule", Developers pill | 2.77:1 | 1.36:1 | **1.72:1** ← worst |
| `#d20344` on `#350011` | destructive / reject | 3.31:1 | 1.38:1 | **1.83:1** |
| `#6c779d` on `#222737` | neutral pager / postpone — most common, 8 sites | 3.37:1 | 1.51:1 | **2.00:1** |
| `#42bf23` on `#123509` | approve | 5.66:1 | 1.95:1 | **2.94:1** |
| `#ff9400` on `#4a2300` | amber secondary | 6.19:1 | 2.05:1 | **3.15:1** |
| `#a8b9f4` on `#1d2132` | pause rule | 8.29:1 | 2.34:1 | **3.81:1** |
| `#ffffff` on `#7631ee` | primary CTA | 6.10:1 | 2.69:1 | **3.98:1** |
| `#a8b9f4` on `#131828` | light on panel | 9.18:1 | 2.41:1 | **4.01:1** ← best |

Every pairing improved; none regressed.

**There is a hard ceiling.** Fading both sides can only move *down* from the enabled ratio, so no
opacity value reaches AA's 4.5:1 — the worst enabled pairing is already 2.77:1, and even the
common neutral one is only 3.37:1. Raising the disabled state to AA means changing the *token*,
which changes every enabled control too. That is a design decision, not a disabled-state fix.

#### Why this is compliant, not merely tolerated
**Do not "fix" these ratios back up without reading this first — it was decided deliberately.**

WCAG 2.2 **SC 1.4.3 Contrast (Minimum)**, "Incidental" exception, verbatim:

> Text or images of text that are part of an inactive user interface component, that are pure
> decoration, that are not visible to anyone, or that are part of a picture that contains
> significant other visual content, have no contrast requirement.

**SC 1.4.11 Non-text Contrast** carries the same carve-out in its normative text — it applies
"except for inactive components" — and its Understanding page states:

> User Interface Components that are not available for user interaction (e.g., a disabled control
> in HTML) are not required to meet contrast requirements. An inactive user interface component is
> visible but not currently operable.

Every control here uses the native `disabled` attribute, so it is not operable and meets that
definition exactly. The dimness *is* the affordance: rendered at full enabled contrast, a disabled
control stops reading as disabled. W3C notes the exemption was a deliberate decision, not an
oversight — no one-size-fits-all disabled presentation has been established.

**Known soft spot — transient disabling.** 31 of the ~57 disabled controls are disabled only while
an operation runs (`disabled={busy}`, `{isDeleting}`, `{submitting}`, `{isPending}`, `{signing}`),
and many swap their label to a status message — "Working…", "Deleting…", "Rotating…", "Submitting…".
They are genuinely inoperable, so the exemption holds *literally*, but it fits awkwardly: this dims
text the user is actually meant to read. The exemption is about controls you cannot use, not about
progress text. If this is revisited, the right fix is to exempt the **idle** disabled state and give
the **busy** state full contrast — not to raise every disabled control uniformly.

- Never use `disabled:cursor-wait`. A pending control is still a disabled control; "wait" implied a
  distinction the app does not actually make, and it read as a hang.
- Never pair `disabled:pointer-events-none` with `disabled:cursor-not-allowed` — `pointer-events:
  none` suppresses the cursor, so the two together silently cancel out. `ui/button.tsx` had exactly
  this bug. Native `disabled` buttons don't fire click, so dropping `pointer-events-none` is safe.
- **Known exception:** the vendored shadcn primitives under `client/src/components/ui/` (input,
  select, checkbox, switch, textarea, …) still carry upstream's `disabled:opacity-50`. Reach was
  verified as zero: nothing outside `ui/` imports `ui/button`, and the five `ui/` files that do
  (`carousel`, `pagination`, `sidebar`, `calendar`, `alert-dialog`) are themselves imported by no
  app code, so the primitive is unreachable at runtime. They were deliberately left on the upstream
  default rather than forked. If one is ever adopted by a real surface, bring it onto the rule
  above at that point.

### Colour roles — `#414965` is not a text colour
| Colour | Role |
| --- | --- |
| `#414965` | Borders, strokes, focus rings, badge fills. **Never text.** |
| `#6c779d` | Secondary / muted copy: labels, metadata, IDs, timestamps, placeholders. |
| `#a8b9f4` | Copy that has to be read: modal body text, headline sentences, values. |

`#414965` as text is **2.08:1 on the page shell `#11141b` and 2.20:1 on cards `#0a0c10`** — below
the 3:1 floor even for large text. It had leaked into policy IDs and 22px modal descriptions, where
it read as greyed-out/disabled copy. `#6c779d` gives 4.18:1 and 4.44:1 on those surfaces.

Note what that does and does not buy: `#6c779d` clears AA **large** (3:1) but is just short of AA
**normal** (4.5:1), and most of what it paints — 16px section labels, 13–14px captions — is normal
text. `brain-v1baby-blue-80` (`#8b95b8`) would give 6.22:1 / 6.61:1. Whether muted copy should move
there is open (task #143); until it is decided, `#6c779d` stays, for consistency with #128.

**This is now enforced by a scan** — `client/src/design-tokens.test.ts`, under `npm test`.

#128 fixed `RuleDetail` and `RulesPanel`. #134 converted the Settings cluster: the section labels
(`SecuritySection`, `LegalSection`, `NotificationsSection`, `TeamSection`, `AccountSection`,
`AuditLogSection`, `SourcesSection`, `DevelopersSection`, `SettingsPage`), `CashFlowTab` captions,
`AddGoalModal` and `CompanySetupPage` — 32 sites, almost all to `#6c779d`, with the Developers page
subtitle and the key-hashing explainer to `#a8b9f4` as real body copy.

An earlier version of this note implied Settings was the whole remainder. It was not — it was
about 28% of it. **72 text uses survive outside Settings**, the largest being
`DocumentViewerPopup` (14), `AddAccountModal` (9), `SignupPage` (9) and `ProposalDetail` (7).
They are frozen as per-file counts in the scan's `NAMED_TEXT_BASELINE`: a new one fails the build,
and removing one fails until you lower the baseline. The count can only go down. Don't add new
ones, and don't raise a baseline to make a failure go away.

Two spellings, both covered, but by deliberately different rules. The #131 checks above catch
neither — `text-brain-v1baby-blue-30` is a legitimate token reference, and #131 does not read
inline `style={{}}` at all.

- **Named class** — counted per file against `NAMED_TEXT_BASELINE`. Exact match, no judgement.
- **Raw `#414965`** — *every* occurrence is counted against `RAW_INVENTORY`, including the strokes,
  ring colours and dot fills that are perfectly correct. The scan does not try to work out which
  ones paint text. Inferring that from source means guessing which nearby `color:` / `stroke` /
  `border` marker owns a given hex, and a guess that misreads one shape fails **open** — the site
  vanishes from the count and the check goes green while the bug ships. So a new stroke has to be
  added to `RAW_INVENTORY` by hand. That is the point: at 15 occurrences it is rare, and it makes
  each new one a decision. Only ever add a **non-text** use.

### Destructive buttons share one hover
Destructive = `brain-v1pink-red` text on a `brain-v1dark-pink-red` background. The hover is
**always** `brain-v1dark-pink-red-hover`. Not `hover:opacity-80`, not "no hover at all" (which is
what Delete Rule shipped with). Always with `transition-colors`.

The trap: several destructive buttons set their background through an **inline `style`**, and an
inline `background` always outranks a `hover:bg-*` utility — so adding the hover class appears to
do nothing. Either move the background into a class, or, where the colour comes from a tone
palette, pass it as a CSS custom property and let the class consume it:

```tsx
style={{ ["--action-bg" as string]: palette.background, color: palette.color }}
className="bg-[var(--action-bg)] hover:bg-brain-v1dark-pink-red-hover transition-colors"
```

`ProposalCardParts.ActionButton` and `DevelopersSection.PillButton` both use this pattern.

## Buttons — reach for the primitive, not a `<button>`

`client/src/components/ui/button.tsx` is the button. A hand-rolled `<button>` is now the
exception and needs a reason from the list at the bottom of this section.

### Two families, and only one of them is solid

Every intent is **tonal** — a dark tinted fill carrying bright tinted text — except `cta`,
which is the single solid treatment.

| variant | fill → text | use |
|---|---|---|
| `cta` | `purple` → `white` | the ONE highest-emphasis action on a screen. Two `cta`s means one is wrong. |
| `primary` | `dark-purple` → `purple` | the main action where a solid CTA would shout |
| `secondary` | `baby-blue-15` → `baby-blue-60` | the workhorse |
| `subtle` | `baby-blue-5` → `baby-blue-60` | the receding half of a pair — Dismiss beside Accept |
| `destructive` | `dark-pink-red` → `pink-red` | delete, revoke, sign out everywhere |
| `success` | `dark-green` → `green` | confirm, grant, resume |
| `warning` | `dark-orange` → `light-orange` | the app's default "go ahead" accent |
| `ghost` | none → `baby-blue-60` | actions that must not read as a control until hovered |

`outline` and the `default` alias exist only for the vendored shadcn files in `ui/`.

`stroke-2` (`#1d2132`) is **not** a button fill. It sits 5 units from `baby-blue-15`
(`#222737`), which no eye resolves — text buttons that used it are now `secondary`.

### Size is padding plus the line box

| size | height | how | type |
|---|---|---|---|
| `compact` | 32px | `py-6 px-12` | 14/20 |
| `default` | 40px | `py-10 px-20` | 14/20 |
| `large` | 48px | `h-48 px-24` | 16/24 |
| `icon` / `iconCompact` | 40 / 32px square | — | — |

**36px is retired.** It and 40px were the same action pill rendered two ways; keeping both
would re-encode the drift under nicer names. 40px also matches the 40px record-row stack.

**Never put `text-[Npx]` or `leading-[Npx]` on a `<Button>`.** The size owns typography, and
this is what keeps buttons on the type scale: 16px is reserved for controls ≥44px tall, so
`large` is the only 16px button. **There is no 18px button tier** — the seven that existed
were all 48px controls and are now `large`.

Because the line box is 20px at both 14px and 16px, correcting a button's type does **not**
move its box. Type and height are independent decisions here.

### Layout is not a variant

A modal footer pair that fills its row is the same 40px button with `className="flex-1"`.
Widths, margins and positioning all go through `className`. The three separate modal
confirm/cancel geometries (45px fixed, 40px `flex-1`, 36px `flex-1`) are one size now.

### What the primitive already gives you

`rounded-pill`, `font-semibold`, Gilroy, `transition-colors`, an 8px icon gap with 16px
icons, `focus-visible:ring-2 ring-brain-v1purple` (the app's convention — not shadcn's
`ring-1 ring-ring`), and the one disabled treatment. Delete all of those from call sites.

It also defaults to `type="button"`. A `<button>` inside a `<form>` defaults to *submit*, so
when migrating one that relied on that, pass `type="submit"` explicitly.

### Still legitimately hand-rolled

Clickable list/table **rows** and selection cards, tabs, filter chips, toggles and segmented
controls, dropdown/listbox items, text links with no fill, brand-coloured buttons (Google,
X, Telegram, WhatsApp, the wallet gradient), and icon-only squares that are not exactly 32
or 40px or whose glyph is not 16px — `[&_svg]:size-4` would resize the artwork.

Forcing a row onto a button primitive makes the row worse. That is the test.

## Design tokens are the standard — raw hex in a class string is a bug

`client/src/index.css` defines the colour and radius variables; `tailwind.config.ts` maps each one
to a utility class. **Write the class, not the value.**

```
text-[#6c779d]     →  text-brain-v1baby-blue-60
bg-[#222737]       →  bg-brain-v1baby-blue-15
border-[#1d2132]   →  border-brain-v1stroke-2
rounded-[16px]     →  rounded-panel
```

The variant prefix does not change the rule: `hover:bg-[#2c3247]` → `hover:bg-brain-v1baby-blue-15-hover`,
`focus-visible:ring-[#7631ee]` → `focus-visible:ring-brain-v1purple`.

**Why:** before this pass the 25-token layer was decorative — nearly every token appeared only at its
own definition while ~2,400 hex literals were typed by hand. A grep for a token told you nothing about
where the colour was used, so a palette change meant a find-and-replace across 73 files and any missed
site drifted silently. Now the token name *is* the usage index.

| Hex | Token | | Hex | Token |
| --- | --- | --- | --- | --- |
| `#6c779d` | `brain-v1baby-blue-60` | | `#42bf23` | `brain-v1green` |
| `#1d2132` | `brain-v1stroke-2` | | `#11141b` | `brain-v1baby-blue-5` |
| `#a8b9f4` | `brain-v1baby-blue-100` | | `#ff9500` | `brain-v1light-orange` |
| `#7631ee` | `brain-v1purple` | | `#4a2300` | `brain-v1dark-orange` |
| `#0a0c10` | `brain-v1highlight-dropdown-bg` | | `#240757` | `brain-v1dark-purple` |
| `#222737` | `brain-v1baby-blue-15` | | `#350011` | `brain-v1dark-pink-red` |
| `#414965` | `brain-v1baby-blue-30` | | `#123509` | `brain-v1dark-green` |
| `#d20344` | `brain-v1pink-red` | | `#06070a` | `brain-v1headerfooterbg` |
| `#8b95b8` | `brain-v1baby-blue-80` | | `#12032d` | `brain-v1dark-dark-purple` |
| `#f4607a` | `brain-v1error-text` | | `#1a1c24` | `brain-v1baby-blue-15-muted` |

`brain-v1baby-blue-80` is a ramp step between `-60` and `-100`, minted for assistant body text:
`-60` on `baby-blue-15` is only **3.37:1**, and `-80` clears AA. `brain-v1error-text` exists
because `brain-v1pink-red` on a dark surface does not reach AA for body-size text.

`brain-v1baby-blue-15-muted` is the de-emphasised neutral chip, used for `system_activity`.
It and plain `baby-blue-15` (`postponed`) are the only two neutral chips, and the weight gap
between them is **deliberate, not drift**: `postponed` is unfinished business the user still owes a
decision on, `system_activity` is non-actionable pipeline noise. They meet in Settings > Audit Log,
which shows the full trail by default. Do not collapse them into one value -- the pair is the
point.

### Radius by concept

`rounded-row` (12px) · `rounded-panel` (16px) · `rounded-modal` (24px) · `rounded-pill` (100px).

Pick by what the element *is*, not by the number you measured. `rounded-pill` keeps the literal 100px
rather than `9999px`: at pill sizes the browser clamps both to half the height, but on a tall surface
they diverge, and 100px is what the app already shipped.

### Hover tokens are not in Figma yet

Ten hover tokens were canonicalised in-app; the Figma source file has no hover states for these
surfaces. They are named here so the "no raw hex" rule holds without an exception list — if Figma
later publishes its own hover values, these are the names to reconcile.

| Token | Hex | Partners |
| --- | --- | --- |
| `brain-v1baby-blue-15-hover` | `#2c3247` | `baby-blue-15` fills |
| `brain-v1purple-hover` | `#8442f5` | `purple` CTAs |
| `brain-v1dark-purple-hover` | `#2e0a6e` | `dark-purple` secondary fills |
| `brain-v1dark-orange-hover` | `#5a2d00` | `dark-orange` amber fills |
| `brain-v1dark-pink-red-hover` | `#4a0018` | `dark-pink-red` destructive fills |
| `brain-v1dark-green-hover` | `#174710` | `dark-green` approve fills |
| `brain-v1headerfooterbg-hover` | `#101218` | `headerfooterbg` chrome |
| `brain-v1stroke-2-hover` | `#252a3d` | `stroke-2` **borders** |
| `brain-v1row-hover` | `#0d1018` | rows in a divided stack |
| `brain-v1item-hover` | `#151926` | borderless items gaining an outline |

The last two both sit on `brain-v1highlight-dropdown-bg` and are **not** interchangeable:
`item-hover` is a ~4× stronger lift than `row-hover`. Use `row-hover` for a row inside a divided
list, `item-hover` for a standalone item that also gains a border on hover. `stroke-2-hover` is a
border colour — reaching for it as a fill is the mistake this split exists to prevent.

### Where raw hex is still legitimate

1. **Inline `style={{}}` and JS object literals.** A Tailwind class cannot reach them; they need
   `var(--token)` instead. 531 occurrences across 46 files, deliberately deferred to their own pass.
   The scan below does **not** see these, so a green suite does not mean the app is hex-free.
2. **SVG `fill` / `stroke` attributes** that are not driven by `currentColor`.
3. **Comments quoting a Figma spec** — the hex is the citation, keep it. A bare `#1d2132` in prose
   is not a class and the scan does not match it, so comments are left alone rather than stripped.
4. **Opacity modifiers.** `hover:border-[#7631ee]/40` must stay raw. Our tokens resolve to a full
   `rgba()` behind `var()`, and Tailwind 3 cannot inject an alpha channel into that — converting it
   silently drops the 40%. Supporting `/40` would mean restating every token as bare channels with
   an `<alpha-value>` placeholder. 8 sites rely on this; leave them.

### The rule is enforced, not just documented

`client/src/design-tokens.test.ts` runs under `npm test` and fails the build on:

- any raw hex in a class string — bare, or hidden in an arbitrary property;
- any **opaque** `rgb()`/`rgba()` standing in for a hex, which is the obvious way around the rule;
- any raw `12/16/24/100px` radius (the four named ones — every *other* px value is a later pass and
  is deliberately not ratcheted here);
- any `brain-v1*` / `brand-*` / `doc-paper-*` class naming a token that does not exist — Tailwind
  drops unknown classes silently, so a typo renders nothing and still passes review;
- `index.css` and `tailwind.config.ts` drifting apart **in either direction** — a declared token
  that is unusable as a class, or a registered class pointing at a variable that does not exist.

Partial alpha stays legitimate, because Tailwind 3 cannot apply an alpha channel to a `var()`
colour — but only over a base colour that is **already a token**, and the suite separately pins the
set of values using the `/NN` form to `{#7631ee}`. A brand-new colour cannot arrive behind a `/40`.

**It scans `.ts` as well as `.tsx`.** Class strings are not only in components: `auditTypes.ts`
returns them from a `switch`, and a `.tsx`-only scan reported a clean sweep while a raw hex sat
there. If you add a rule like this, check what the glob does *not* open.

### Two namespaces sit outside `brain-v1*` on purpose

- **`brand-*`** (`brand-whatsapp`, `brand-telegram`) — third-party brand colours, fixed by the
  vendor. Never reconcile them to a near neighbour in the product palette; they are not ours.
- **`doc-paper-*`** (12 values) — the printed-document facsimile in `DocumentViewerPopup`: cream
  surfaces, sepia ink, faint rules. Nearest-token distance against a dark UI palette is meaningless
  here, so these are never collapsed into `brain-v1*`. Every one of the 12 is used only in that
  component. Six ink values for one document is more than it needs, but reducing them is a design
  judgement about a facsimile, not a drift cleanup.

## One value per role

Near-duplicate hexes are the app's most common drift: a colour gets re-picked from a Figma frame
instead of copied from its neighbour, and the two differ by a channel or two. The pairs below are
now single values. **Before introducing a new hex, grep for a sibling within a few RGB points.**

| Role | Canonical | Was also |
| --- | --- | --- |
| Amber / warning | `#ff9500` | `#ff9400` |
| Neutral hover grey | `#2c3247` | `#2a3040`, `#2a3046`, `#2b3145`, `#2a3050`, `#2a3045`, `#2a3145` |
| Border hover | `#252a3d` | `#262b3d`, `#2a3050` *(as a border only)* |
| Row hover | `#0d1018` | `#0d0f16` |
| Approve fill hover | `#174710` | `#173e0b`, `#194d0d` |
| Approve fill | `#123509` | `#0d3320`, `#0a2a0a`, `#0f2f1c` |
| Approve accent | `#42bf23` | `#22c55e`, `#4ade80` |
| Card stroke | `#1d2132` | `#1a2235`, `#161b28`, `#1a1e2e`, `#1b1e2a` |
| Page background | `#11141b` | `#131828`, `#0d1523` |
| White | `#ffffff` | `#e8eaf0`, `#d9d9d9`, `#fff` |
| Light-on-dark text | `#a8b9f4` | `#c5d2ff`, `#c8d4f0` |
| Error text | `#f4607a` | `#fca5a5` |
| Amber fill | `#4a2300` | `#3a2600`, `#3a2500` |
| Amber fill hover | `#5a2d00` | `#5a2b00`, `#5a2c00` |
| Purple secondary fill | `#240757` (hover `#2e0a6e`) | hover `#2e0a6b` |
| Purple primary fill | `#7631ee` (hover `#8442f5`) | hover `#8a4bf5` |

Two purple hovers were equally common, so the tie was broken on contrast: white on `#8442f5` is
**5.15:1** versus **4.77:1** on `#8a4bf5`, and `#8442f5` is what the primary CTA already used.
Collapsing the amber badge fill keeps `#ff9500` at **6.24:1** (was 6.55:1), still clear of AA.

**`#11141b` and `#0a0c10` are NOT duplicates.** They are the page background and the card surface;
the whole card system reads off that difference. Never merge them.

**`doc-paper-ink-800` (`#2a2010`) is not an amber control colour.** It is body text inside the light
"paper" document facsimile in `DocumentViewerPopup`, which has its own cream palette
(`doc-paper-rule-light` rules, `doc-paper-ink-300` labels). It only looks like a dark amber. This is
exactly why that palette is namespaced away from `brain-v1*`.

**`#2a3050` split rather than collapsed.** Seven fill hovers became `brain-v1baby-blue-15-hover`,
but `ProposalCardParts` used the same value as a *border* hover, and that one became
`brain-v1stroke-2-hover`. One value serving two roles is drift even when the value agrees — the
fill sites shifted by ΔE 7.57 while holding lightness (ΔL\* +0.33), so this reads as a chroma
correction, not a visible change.

### Font-family syntax
Always `[font-family:'Gilroy',sans-serif]`. The `font-['Gilroy',sans-serif]` form compiles to the
same declaration but splits every grep for typography in two; 76 occurrences across 11 files were
converted so the search term is now reliable.

The Tailwind `font-sans` default is Gilroy, the app's primary UI font. Use JetBrains Mono only for
amounts and identifiers, and Gridular only for the "brain" wordmark.

### The type scale

Five sizes carry the app's **UI text** — labels, body, metadata, row titles, controls. A new size in
that range is drift; grep for a sibling before introducing one.

Above them sits a small **display tier** for page titles and hero figures (20, 22, 32px, and the
28/40px KPI numerals). Those are deliberate and are not covered by the five-size rule, but they still
obey the pairing requirement below — every arbitrary size declares a line-height.

| Size | Role |
| --- | --- |
| **16px** | Row titles, standalone titles, inputs and ≥44px controls |
| **14px** | Labels, body copy, interactive text, key/value rows, pill-shaped action buttons |
| **13px** | **Reserved.** Dense description prose that wraps — nothing else |
| **12px** | Compact metadata, uppercase eyebrows |
| **11px** | **Reserved.** Badge pills (`CountPill`, status chips) |

Two reservations are easy to misread, so they are spelled out:

- **13px is a prose size, not a "slightly smaller label" size.** It exists for explanatory
  paragraphs that wrap in a narrow column. A label, a value, a validation message or a button at
  13px is drift — those are 14px. 51 sites were moved back.
- **11px is for badges, not for anything pill-*shaped*.** Read literally, "pills are 11px" shrinks
  real Approve/Decline buttons to 11px. Only the badge tier is 11px; a pill-shaped *action button*
  is on the body scale at 14px. Note the shipped badge components — `RecordPill`, `StatusPill`,
  `TypeTag`, and the role/method badges in Team and Developers — render at **12px**, not 11px, and
  were deliberately left there: resizing them changes every pill width in the app. Their leading is
  pinned by geometry, not by the table — see the badge-pill exemption below.

**Mono keeps 13px as a second legitimate reservation.** JetBrains Mono reads wider and taller than
Gilroy at the same px, so a 13px mono value sits optically level with the 14px Gilroy label beside
it. Promoting mono to 14px makes the value out-shout its own label. 14 sites.

**`DocumentViewerPopup`'s document facsimile is outside this scale entirely.** It paints a simulated
invoice on paper with its own `doc-paper-ink-*` ramp, and it should look like a document, not like
app chrome. Leave its sizes alone — the same reason that palette is namespaced away from `brain-v1*`.

### Weight

**Semibold (600)** for titles and labels. **Medium (500)** for explanatory body. `font-normal` is
not part of the UI scale — it survives only in the shadcn primitives under `components/ui/` and in
one transparent spacer.

The collision this resolved: descriptive captions were `font-normal` in a handful of places and
`font-medium` everywhere else, and the large mono figures disagreed with each other (28px KPI
figures at medium, 32px popup balances at normal). Same role, one weight: medium.

**A record row's title is `font-medium`, not semibold** — see the exemption below. Semibold there
makes the title shout over its own subtext, which is why `rowFormatting.test.ts` pins it.

### Size ↔ line-height pairing

Every custom `text-[Npx]` must declare a `leading-`. Tailwind sets no line-height on an arbitrary
size, so an undeclared one inherits whatever the parent happens to have — the rhythm then depends on
where the element is mounted rather than on what it is.

| Size | Leading |
| --- | --- |
| 11px | `leading-[14px]` |
| 12px | `leading-[16px]` |
| 13px | `leading-[18px]` |
| 14px | `leading-[20px]` |
| 16px | `leading-[20px]`, or `leading-[24px]` for a standalone title |
| 18px | `leading-[24px]` |

**13px pairs with 18, uniformly.** 16px leading on 13px text is a 1.23 ratio — tighter than both of
its neighbours (12→16 is 1.33, 14→20 is 1.43) — and 13px is reserved precisely for the role that
wraps, so the cramping lands where it does the most damage. Rendered side by side at the real 420px
column width, `leading-18` is the one that reads. Single-line sites are identical either way.

#### The one exemption: record rows

**14px inside a fixed-geometry record row's title/subtext stack uses `leading-16`. 14px as flow
body or label text uses `leading-20`.**

Do not flatten these into one rule. Every list in the app presents a record the same way — a 16/20
medium title, a 4px gap, a 14/16 medium subtext — and `20 + 4 + 16 = 40px` is what makes every row
in every list the same height. Applying the 14→20 pairing literally re-leads 72 of those subtexts
and grows every list row in the app by 4px.

**What actually guards this, precisely** — because "it's covered by tests" is the claim most likely
to rot here. `rowFormatting.test.ts` source-inspects *two* rows (the Audit Log row and the RuleDetail
report card) plus one Sources gap. `scripts/qa-measure-row-heights.mjs` measures the baseline row on
Overview, Inbox and Ledger at runtime. **Between them they sample the convention; they do not cover
all 72 sites.** A red guard is real evidence — if you change a row's leading and one trips, the guard
is right — but a green suite is *not* proof the exemption still holds everywhere. Check the row you
touched.

The counterpart mistake is just as easy and was made on the first pass: **flow prose that happens to
sit at 14/16 is not exempt.** Seven wrapping paragraphs across `ProposalCardParts`,
`AccountDetailPopup`, `AddGoalModal`, `BillingModals` and `NavigationMenuSection` were swept into the
exemption because a mechanical revert keyed on the *value* (14px + leading-16) rather than the
*role*. If the text wraps and is not the second line of a row stack, it takes `leading-20`.

The distinction is the same one that governs pills: **fixed geometry follows the geometry, flow text
follows the pairing table.**

#### The second exemption: badge pills

**A 12px badge pill keeps `leading-14`.** A badge's height is its own vertical padding plus that
14px line plus 1px borders, and **the padding differs by component** — do not assume one number:

| Component | Padding | Height |
| --- | --- | --- |
| `RecordPill`, `TypeTag` | `py-[2px]` | 20px |
| Team role/state, Developers status/method/layer | `py-[3px]` | 22px |
| `StatusPill` | `py-[4px]` | 24px |

Re-leading any of them to 12/16 adds 2px to whatever that height is.

**The 20px case is the one with teeth.** 20px is exactly the height of the 16/20 row title line that
`RecordPill` sits on, so growing it to 22px pushes the title line to 22 and takes every pill-bearing
record row from 40px to **42px** — Overview, Inbox and the Ledger cash flow tab at once. The other
badges are not in a row stack; they are simply pinned to their frames, and grow in place. All of
them were 12/14 before the typography pass and all 22 are back.

**What caught it matters more than the bug.** `tsc`, all 1126 unit tests and the design-token scan
stayed green the entire time, because none of them can see a rendered box. Only
`scripts/qa-measure-row-heights.mjs`, measuring a real logged-in page, saw the rows at 42px — and
even that named the *row*, not the pill, which is one indirection away from the cause. A badge-pill
height check now sits in that same script so the next occurrence names itself.

Note the asymmetry with the record-row exemption above: there the *text* keeps the tighter leading,
here the *badge* does. Both fall out of the same 20px title line.

A related trap, found in review: `Callout` supplies its leading from a per-tone table
(`${leading}`), so a pass that appends a literal `leading-[Npx]` to that element puts two competing
classes on one node. Class order in the string does not decide the winner — CSS source order does —
so the tone table silently stops being authoritative. **Before adding a leading to a className, check
whether an interpolated variable already carries one.**

#### Named Tailwind sizes are fine

`text-sm` and `text-xs` are not drift. The project does not override `fontSize`, so they resolve to
14px/20px and 12px/16px — exactly the pairing table. They need no `leading-` because they already
carry one. Only *arbitrary* sizes do.

### Fractional pixel values
Figma exports at a non-1× zoom leak values like `18.75px`, `20.625px`, `16.88px`, `0.938px` — all of
`DeleteConfirmDialog` was exported at 1.25×. Round on the way in. Sub-pixel borders in particular
render inconsistently across browsers and zoom levels.

### Shared primitives, not re-implementations
`CountPill`, `LedgerRecordRow`, and `Callout` exist so a shape is a fact rather than a convention.
When a surface needs one, import it — a hand-copy is how the geometry drifts.

- `FilterChipRow` had `CountPill`'s exact geometry inline; it now imports it (the chip's `ml-[6px]`
  became `gap-[6px]` on the button, and `CountPill` gained `transition-colors` so the badge fades
  with its chip).
- `FinancesPage`'s Accounts tab had its own copy of the ledger row; it now uses `LedgerRecordRow`,
  which also gives those rows the focus ring and truncation the copy lacked.
- `Callout` gained a **`policy`** tone (`PolicyCallout`) — the purple `#240757` info banner that had
  been hand-rolled in eight places across five files. Geometry lives in the tone table rather than
  the frame, because `policy` carries prose: it keeps `p-[12px]` / `leading-[18px]`, while the
  short `alert` and `muted` notices keep `p-[8px]` / `leading-[16px]`. Squeezing multi-sentence
  copy to 16px leading on 14px text is a readability regression, not a dedup.

Still hand-rolled and *deliberately* not converted: the icon-less 8px-radius purple notes in
`ProposalDetail` and `AddGoalModal`. Folding those into `PolicyCallout` would add an icon and change
the radius — a design decision, not a dedup.

### Page headers
Overview, Inbox and Ledger share one header stack: a 20px eyebrow, a 32px title, and a 16px
description, as three sibling `<p>`s in a `gap-[4px]` column. Overview previously wrapped each line
in its own flex row and used a `leading-[0] text-[0px]` parent to kill whitespace between the
greeting's spans.

## Empty-state copy and frame geometry standard

### Frame geometry

Two frame shapes exist. Use the right one — never mix.

**In-panel row** (empty state sits *inside* a section/card that already provides the border):
```
px-[16px] py-[12px] rounded-[8px]
```
No additional border or background — the parent card provides the visual boundary.
Text: `text-brain-v1baby-blue-60 text-[16px] leading-[20px] font-medium` for content panels;
`text-brain-v1baby-blue-60 text-[13px] leading-[18px]` for sidebar / small-panel contexts.

**Standalone card** (empty state *is* the card, replacing a list that has no outer panel):
```
flex items-center px-[16px] py-[20px] w-full rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg
```
Used in InboxPage and TierRowList — already consistent; do not change.

**Error / unavailable**: always use `UnavailableDataBox` (from `Callout.tsx`).
It has its own geometry (`rounded-[8px] border`) and forces orange text.

Never use `style={{ color: "#6c779d" }}` — use the `text-brain-v1baby-blue-60` token.

### Copy standard

**Category A — truly empty (data exists but list is genuinely empty)**

Two voice rules, mutually exclusive:
- **"No X yet"** for named/countable collections (accounts, vendors, members, rules, keys, decisions).
- **"Nothing X yet"** for activity/event feeds (history, suggestions, recorded activity, conversations).

One structure rule: if a concrete next action exists, append it as a second sentence.
Examples: "No automations yet. Add one using the builder above."
Never leave the user wondering what to do when there *is* something they can do.

| Surface | State | Copy |
|---|---|---|
| FinancesPage → Accounts | empty | "No accounts connected yet. Add one in Settings, under Sources." |
| RulesPanel → AlwaysOn policy | empty | "No policy rules yet." |
| RulesPanel → Trusted vendors | empty | "No trusted vendors yet." |
| RulesPanel → Automations | empty | "No automations yet. Add one using the builder above." |
| RulesPanel → Guardrails | empty | "No guardrails yet. Add one using the builder above." |
| RulesPanel → Suggested | empty | "Nothing suggested yet. Brain will show these as it spots patterns." |
| RuleDetail → Reported Problems | empty | "No problems reported on this rule yet." |
| RuleDetail → History | empty | "Nothing recorded yet." |
| InboxPage → Unresolved | empty | "Nothing needs your attention right now. Brain is keeping things moving." (only when the decision, input AND awareness sections are all empty) |
| InboxPage → Needs your input | unreachable | "Couldn't check whether any agent is waiting on information from you. This is a connection problem, not an all-clear." |
| InboxPage → Resolved | empty | "No resolved decisions yet." |
| InboxPage → Filtered | filtered | "No {tab} decisions match this filter." |
| VendorsPanel → Needs Review | empty | "Nothing to review. New and risky {noun} show up here automatically." |
| VendorsPanel → Trusted | empty | "No {trustedLabel} {noun} yet. Trust or confirm one from the Needs Review tab." |
| VendorsPanel → Paused | empty | "Nothing paused." |
| BrainAssistant → Sessions | empty | "Nothing here yet." |
| BrainAssistant → Sessions | search miss | "Nothing matches." |
| AuditLogSection | empty | "No audit records yet." |
| AuditLogSection | search miss | "No records match your search." |
| AuditLogSection | type-filtered | "No system, assistant, or decision records here." |
| DevelopersSection → Activity | empty | "Nothing recorded yet. API calls show up here as events." |
| DevelopersSection → Tenants (prod) | empty | "No tenant linked yet. Create your company to get a tenant." |
| DevelopersSection → Tenants (non-prod) | empty | "No tenant available." |
| SecurityModals → Sessions | empty | "No other active sessions." |
| TeamSection → Members | empty | "No members yet." |
| SourcesSection → Accounts | empty | "No accounts connected yet." |
| SourcesSection → Documents | empty | "No documents uploaded yet." |

**Category B — error / unavailable (data failed to load)**

Every error entry keeps the "this is a failure, not emptiness" reassurance — never drop it silently.
Lead with "Couldn't load …" (one declarative sentence). Add a second sentence when the
"empty vs. unavailable" distinction is high-stakes to the user.

| Surface | Copy |
|---|---|
| FinancesPage → Accounts | "Couldn't load your accounts. This list may be incomplete. It doesn't mean you have none." |
| PayablesTab | "Couldn't load your payables. This list may be incomplete. It doesn't mean you owe nothing." |
| ReceivablesTab | "Couldn't load your receivables. This list may be incomplete. It doesn't mean nobody owes you anything." |
| PayableDetailPopup → invoices | "Couldn't load your invoices. Whether one backs this payable is unknown…" |
| AccountDetailPopup → accounts | "Couldn't load your accounts. This account can't be shown right now — it hasn't been removed from your ledger." |
| RulesPanel → AlwaysOn policy | "Couldn't load your active policy from Brain right now." |
| RulesPanel → Trusted vendors | "Couldn't load vendors. This list may be incomplete." |
| InboxPage → decisions | "Brain couldn't load your decisions. This is a connection problem, not an empty queue. Don't read it as nothing to approve." |
| InboxPage → partial load | "Some decisions couldn't be loaded, so this list may be incomplete." |
| AuditLogSection | "Brain couldn't read your audit history." + detail "This list is unavailable, not empty." |
| DevelopersSection → Activity | "Couldn't load activity. Brain core may be unavailable. This isn't the same as no activity." |
| DevelopersSection → Keys | "Couldn't load keys. Brain core may be unavailable." |
| DevelopersSection → Key usage | "Couldn't load key usage. Brain core may be unavailable." |
| DevelopersSection → Tenants | "Couldn't load tenants. Brain core may be unavailable." |
| SettingsPage → Approval policy | "Couldn't read your approval policy. This limit is unknown, not absent." |
| TeamSection → Members | "Couldn't load team members." |
| SourcesSection → list | "Couldn't load this list. Connected items are still connected. This just failed to load." |
| SourcesSection → banner | "Couldn't load {feed}. Connected items are still connected — this just failed to load." |
| MemberDetailPopup | "This member is no longer available." |

### Checklist for new empty states

1. Pick the frame: in-panel row (`px-[16px] py-[12px] rounded-[8px]`) or standalone card.
2. Pick the voice: "No X yet" (collection) or "Nothing X yet" (activity feed).
3. Add a next-action sentence if there is a concrete thing the user can do.
4. For error states: use `UnavailableDataBox`, lead with "Couldn't load …".
5. No inline `style={{ color: "…" }}` — use `text-brain-v1baby-blue-60` or `text-brain-v1light-orange`.

## Merging to main — the review gate

Three merges have silently deleted finished work. Each was a long-lived "sync"
branch holding a stale copy of a file, merged in a diff large enough that nobody
read the deletions:

| merge | what it took | how long it was gone |
|---|---|---|
| "Sync today completed work into main" | Settings **Auto-Approve Limit** row and the **Escalation** block | 4 days |
| "Sync current BrainMVB changes to main" (101 files, −5860) | 8 test ids, 4 of them merged hours earlier the same day | never restored until audited |
| stale-branch merge | 6 memory index entries | until noticed by hand |

None of these were decisions. They were side effects.

**The rule: no PR reaches main without a review, including your own.** The
auto-approve-limit loss self-merged eight minutes after it opened. A tool cannot
fix that; only the gate can. Specifically:

1. **Never self-merge.** Not for a sync branch, not for "just a rebase", not for
   docs. The two smallest-looking merges in the table above did the most damage.
2. **Rebase before merging, never merge a stale branch.** If a branch has been
   open long enough that main moved, `git rebase origin/main` and re-read the
   diff. A squash merge of a stale branch reverts whatever landed meanwhile.
3. **Read the deletions, not the additions.** In a sync diff the additions are
   the intent and the deletions are the accident. `git diff origin/main...HEAD
   --diff-filter=M -- client/src | grep '^-'` is the two minutes that would have
   caught all three incidents.
4. **A deletion is a claim.** If a control disappears, the PR body has to say
   which control and why. "Sync" is not a reason.

## Shared panel primitives

All card/panel chrome lives in `client/src/components/LedgerWidgets.tsx`. Never create a local copy.

| Component | When to use |
|---|---|
| `WidgetPanel` | Any bordered panel shell (`bg #0a0c10`, border `#1d2132`, radius 16). Pass `noBorder` only when Figma explicitly shows no border. |
| `WidgetHeader` | The dot + uppercase title + optional count row. Accepts `children` for metadata that follows the count (e.g. version/quorum text). |
| `WidgetCard` | `WidgetHeader` + `WidgetPanel` composed together. Used by all Ledger tabs. |
| `Divider` | Full-width 1px separator at `#1d2132`. Import from LedgerWidgets; do not inline. |

SettingsPage panels are `<WidgetPanel noBorder>` — borderless per Figma, intentional. DevelopersSection panels are `<WidgetPanel>` (with border). RuleDetail inner panels (Rule Status, Trusted Vendors, Amount, Reported Problems, History, Rule Definition) are all `<WidgetPanel>`.

`scripts/check-removed-ui.mjs` enforces the mechanical part of this: a
`data-testid` / `testId` present on the base ref and absent from the branch is a
failure until it is declared in `scripts/ui-removals-allowed.txt`. Run it before
you merge:

```
node scripts/check-removed-ui.mjs            # against origin/main
node scripts/check-removed-ui.mjs origin/foo # against another base
```

It belongs in `.github/workflows/test.yml` as a `pull_request` step placed
*before* the install steps, so that a broken lockfile — CI's current state —
cannot hide a silent deletion. That step is not wired yet: updating a workflow
file needs a token with `workflow` scope. Until it is, this is a local check and
the review gate above is doing the work. It only sees
literal ids in `client/src` — untagged copy, dynamic ids, and server behaviour
are invisible to it, so it lowers the cost of the mistake but does not remove the
need for the review.
