---
name: Rule reference wiring
description: How every "open this rule" link across the app must behave.
---

# Rule references → RuleDetail

Every RULE REFERENCE surface (auto-handled receipt sub-card + "Review rule",
Audit Log record popup "Linked" rule rows, settled record "Cleared by rule",
Review page related-rule note + report-problem pause path) opens RuleDetail
through the single helper `client/src/lib/openRuleDetail.ts` —
`openRuleDetail(ruleId, navigate)` and `resolveRule(ruleId)`. Do not hand-roll
`navigate('/rules/'+id)` on new surfaces (RulesPage's own list rows are the only
sanctioned exception, since those rules come straight from the store).

**Why:** a rule id may be stale (rule deleted). `resolveRule` gates whether a
reference is a tappable link or plain, non-tappable text with a muted
"(rule unavailable)" note (openRuleDetail also console.warns on an unresolved id, never silent) — so there is never a dead tap or crash.

**How to apply:**
- Resolution is against the live rules store (`getRule`), not the embedded
  `proposal.rule` object — an auto-handled receipt can carry a rule that was
  since deleted.
- Back-navigation to the origin (receipt / audit record page) relies on the
  browser back button: use push `navigate` (never `{replace:true}`). RuleDetail's
  own in-page back button is hardcoded to `/rules`, and RuleDetail must not be
  modified.
- Vendor references stay plain text until a vendor detail page exists.
- Shipped mock data must have ZERO dangling refs. Note the dev guard that was supposed to
  assert this (`ruleConsistencyCheck.ts`) DOES NOT EXIST — verified 2026-07-29, no such file
  in the repo and main.tsx imports nothing of the sort, despite replit.md/CLAUDE.md still
  describing it as running. Check refs by hand; see linked-references-contract.md.
  The "(rule unavailable)" fallback is only for rules deleted at runtime.
