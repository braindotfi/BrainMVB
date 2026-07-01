# CLAUDE.md — Brain Finance

Working notes for agents. The full project overview lives in `replit.md`; this file
captures contracts that are easy to break silently. Keep it short and current.

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
covers **rules, vendors, documents, and proposals** — resolution guards run first,
coherence guards second. Extend this one module; **don't fork** a parallel checker.

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

## Route ordering (wouter)
`/rules/:id` is registered before `/rules` in `App.tsx` — keep specific routes ahead
of generic ones. `RuleDetail` reads `params.id` and must not be modified to accept a
different key.
