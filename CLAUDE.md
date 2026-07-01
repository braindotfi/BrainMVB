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
    id in `refId` (vendors use `kind:"vendor"` and render as plain text — no vendor
    page exists yet).
  - There is **no** `ruleId`/`rule_id` field for RuleDetail refs; don't introduce
    naming drift. (`BrainBillsInbox`'s `rule_id` is the separate brain-core bills
    payload — unrelated.)
- **Unresolvable id = graceful fallback:** the reference renders as plain,
  non-tappable text with a muted `(rule unavailable)` note. This path is a runtime
  safety net (e.g. a rule deleted via `deleteRule`, then an old receipt is opened) —
  **shipped mock data must have zero dangling refs.**

### Dev guards (two tiers)
`client/src/lib/ruleConsistencyCheck.ts` runs on dev boot (imported in `main.tsx`,
guarded by `import.meta.env.DEV`). It never throws; it only `console.error`s.

1. **`checkRuleReferences()`** — resolution guard. Collects every rule ref from
   `MOCK_AUDIT_RECORDS` + `AUTO_HANDLED_PROPOSALS` and asserts each resolves via
   `getRule`. Catches bad ids like `cleaning`/`contractor` that don't exist in the
   store. Logs: `[rule-consistency] OK ...` or a list of unresolved `source → 'id'`.

2. **`checkSemanticAuditRecords()`** — narrative guard. Asserts that the mock audit
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
