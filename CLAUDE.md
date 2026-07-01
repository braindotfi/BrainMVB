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

### Dev guard
`client/src/lib/ruleConsistencyCheck.ts` collects every rule ref from
`MOCK_AUDIT_RECORDS` + `AUTO_HANDLED_PROPOSALS` and asserts each resolves via
`getRule`. It runs once on boot in dev (`main.tsx`, guarded by `import.meta.env.DEV`)
and logs loudly: `[rule-consistency] OK …` or a `console.error` listing every
unresolved `source → 'id'`. If you add mock data that references a rule, this is the
check that catches a bad id. It never throws.

### History (2026-07): the "rule links don't work" bug
- Diagnosis: wiring was correct and complete; only MOCK DATA was wrong. Three audit
  records pointed at rules that never existed — `cleaning` (`AUD-9H4X`, `AUD-0C4U`)
  and `contractor` (`AUD-7N2S`) — so those taps fell through to plain text.
- Fix (no new rules invented; repointed to correct existing rules):
  - `AUD-9H4X` (Apex trust-revoked): removed the dangling rule link — `trust_revoked`
    is a vendor event, and no existing pausable rule governs untrusted Apex.
  - `AUD-0C4U` ("new rule created"): repointed to `sweep` ("Move extra cash to
    savings"), matching the weekly-sweep suggestion narrative.
  - `AUD-7N2S` (Bright Futures auto-approved): repointed to `lease` ("Auto-clear
    fixed rent & lease") — the fixed-recurring-amount automation.
- Also added the missing guards above (`console.warn` in `openRuleDetail`, the dev
  consistency check) so this drift can never ship silently again.

## Route ordering (wouter)
`/rules/:id` is registered before `/rules` in `App.tsx` — keep specific routes ahead
of generic ones. `RuleDetail` reads `params.id` and must not be modified to accept a
different key.
