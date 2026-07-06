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
- `AutoRule.history` (`RuleHistoryEvent[]`) is a separate lifecycle trail (created/paused/resumed),
  distinct from `problemReports`. Seeded with one "created" event from `createdLabel`;
  `pauseRule`/`resumeRule`/`reportProblem` append to it. Rendered on RuleDetail as its own
  "History" panel (same Figma panel pattern — see `figma-panel-pattern.md`), most-recent-first.
- A "still looks hover-highlighted" bug report on a rules-list row may not be an actual `:hover`
  class — check for a static conditional style keyed off row state (e.g. `pausedFromReport`) that
  reuses hover-like colors (`bg-[#11141b] border-[#1d2132]`). Figma's rows keep the plain resting
  bg even with a status banner; don't let per-state conditionals repaint the row container itself.
- Resume-rule confirmation is a Dialog modal (matches the create-rule modal pattern: Radix
  `DialogPrimitive`, `bg-black/60 backdrop-blur-[2px]` overlay, `#0a0c10`/`#1d2132` panel,
  green `#42bf23`/`#123509` confirm button), not an inline expand-in-place block. Body uses
  `p-[40px]` and `gap-[16px]` between the two full-width action buttons (`px-[24px] py-[12px]`,
  `text-[18px]`) — not the smaller `p-[24px]`/`gap-[10px]` used by other confirm dialogs.
- **Paused state uses ORANGE, not red** (`#d20344` stays reserved for danger/reject/delete only):
  Paused pill/banner = `bg-[#4a2300]` border `rgba(255,148,0,0.2)` text `#ff9400`. The
  "Paused After You Reported a Problem" banner is a plain orange info card (Flag icon, bold
  uppercase title, no linked-payment button) placed UNDER the Rule Status card — the
  linked-payment/receipt link lives in the Reported Problems accordion (`ReportCard` →
  "View the Receipt"), not duplicated in this banner.
