---
name: Rules store & receipt report-a-problem path
description: How standing auto-clear rules, the receipt "report a problem" flow, and RuleDetail share state in /review.
---

# Rules store + report-a-problem

`client/src/lib/rulesStore.ts` is the single source of truth for the standing
auto-clear rules (active state, scope cap/allowlist, ProblemReport trail). It uses the
module-level `useSyncExternalStore` pattern (same as `rule-suggestions.ts` / `intentsStore.ts`).
Seeded from the 4 exported rule consts in `mockProposals.ts` (UTILITY/SAAS/LEASE/PAYROLL).

**Why a store:** receipts (`ProposalDetail` auto-handled branch), the review queue
(`ReviewPage`), and `RuleDetail` (`/rules/:id`) all must reflect the same pause/report
state. Local React state in ReviewPage couldn't reach RuleDetail.

**How to apply:**
- Rules are keyed by a URL-safe `id` slug (utility/saas/lease/payroll), NOT policyId
  (policyId has slashes → bad in routes). Navigate to `/rules/<id>`.
- Each `AutoRule` referenced by an auto-handled proposal's `rule:` field is the SAME const
  object the store seeds from — match by `id` OR `policyId` when looking one up from a proposal.
- Report flow: `reportProblem(id,{proposalId,reason,note})` pauses + records;
  `sendFeedback(...)` records but leaves active. `resumeRule` marks all open reports resolved.
- "Paused from report" banner shows only when `!active && has unresolved report`.
- Related-pending-item flagging (ReviewPage `relatedRuleFor`) is a NON-BLOCKING note —
  never changes status. Match = same `agent` + `counterparty` in rule `allowlist` + `amount ≤ cap`.
  Pending MOCK_PROPOSALS have `counterparty`/`agent`/`amount` but NO `category` field (only
  rule consts have category) — so don't match on category for pending items.
- Linked-payment in banner navigates `/review?receipt=<proposalId>`; ReviewPage reads
  `useSearch()` and auto-opens the receipt, then strips the query param with replace nav.
- Color discipline: `#d20344` is alerts/problems ONLY; purple `#7631ee` is affirmative
  (e.g. "Pause rule and review" primary, Resume confirm). Amounts/dates/policyIds monospace.
- SAAS rule is pre-seeded paused + 1 ProblemReport (proposalId `auto-figma`) for demoability;
  UTILITY stays active for the live Con Edison receipt path.
