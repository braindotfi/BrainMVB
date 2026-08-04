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

## Demo vs real accounts — synthetic data fence

Real signups must start **genuinely empty**: zero connected sources, zero raw-layer
ingestion, zero ledger, no disguised mock data. Only the demo accounts may ever see
seeded/synthetic data.

- **Who is demo:** decided ONLY by `server/demoUsers.ts` (`isDemoEmail`) —
  `demo@brain.fi` (shared, `POST /api/auth/demo`) and `demo-fresh-*@brain.fi`
  (`POST /api/auth/demo-fresh`). `publicUser` (server/auth.ts) exposes it to the
  client as `user.isDemo`; never re-derive it anywhere else.
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
`loginWithPassword`, `register`, `loginDemo`, `loginDemoFresh`, session bootstrap,
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

6. **`checkAnchorUiCoherence()`** — anchor-UI honesty guard. On-chain verification
   is only real once a record is anchored, so any record whose `anchor.status` is
   `pending_next_batch` must NOT carry `merkleRoot` / `baseTx` / `verifyHref` (there
   is nothing to link to yet). This is the DATA-level assertion that keeps the ONE
   shared `AnchorStatus` component honest across every surface — the UI renders the
   Verify affordance disabled (with the caption "Verification opens once anchored.")
   purely from `anchor.status`, so a pending record carrying hashes/href would be a
   lie waiting to leak into the UI. Logs `[anchor-ui-consistency] OK ...`.

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
  now renders the Verify affordance DISABLED with the caption "Verification opens
  once anchored." and NO live link whenever `anchor.status` is `pending_next_batch`
  — in BOTH proof and status modes, driven purely from `anchor.status`. Guarded by
  `checkAnchorUiCoherence` (a pending record must not carry `merkleRoot`/`baseTx`/
  `verifyHref`).
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
