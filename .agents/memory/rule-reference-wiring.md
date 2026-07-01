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
"(rule removed)" note — so there is never a dead tap or crash.

**How to apply:**
- Resolution is against the live rules store (`getRule`), not the embedded
  `proposal.rule` object — an auto-handled receipt can carry a rule that was
  since deleted.
- Back-navigation to the origin (receipt / audit record page) relies on the
  browser back button: use push `navigate` (never `{replace:true}`). RuleDetail's
  own in-page back button is hardcoded to `/rules`, and RuleDetail must not be
  modified.
- Vendor references stay plain text until a vendor detail page exists.
- Unresolvable demo refIds today: `cleaning`, `contractor` (deleted-rule
  fallback demo); `utility` (Con Edison) and `saas` resolve.
