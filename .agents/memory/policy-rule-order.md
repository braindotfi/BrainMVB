---
name: Reading brain-core approval policy in the UI
description: Why any UI claim about "what runs automatically" must respect rule ORDER and applies_to scope, not just filter for execute:"auto"
---

# Deriving authorization claims from the approval policy

brain-core's policy VM evaluates `rules[]` **in order and short-circuits on the
first match**. The rule list is therefore not a set of independent facts — a
rule's meaning depends on everything above it.

**Rule:** any UI statement of the form "payments up to X run automatically" may
only be derived from the FIRST rule that can match the action being described.
A qualifying rule sitting behind another in-scope rule must be reported as
"conditional" (or equivalent), never as the effective line.

Two independent filters are required, and missing either produces a confident
falsehood:

1. **Order.** The common real shape is "over N requires a signer" followed by
   "under M is automatic". Filtering for `execute: "auto"` and taking the first
   amount cap reports M as a blanket limit, when in fact the earlier rule claims
   a large share of payments first.
2. **Scope.** `applies_to` decides which actions a rule can touch at all. An
   absent or empty `applies_to` means "any action" (includes payments). A rule
   scoped only to `ledger_write` / `inbound_payment` is not a payment limit and
   must not be counted as one — in either direction, including when deciding
   that *nothing* is automated.

Also: a rule with conditions beyond a bare `amount.lte` (counterparty
allowlists, confidence floors, risk ceilings) is not a flat limit. Rendering its
number as one claims automation that most transactions do not get.

**Why:** this is a money-authorization surface. A finance lead checks it to
decide whether anything can leave the account without them. Overstating
automation is alarming; understating is merely vague. Being wrong toward
"conditional / unknown" is the safe direction, and proving non-overlap between
DSL predicates is not worth re-implementing the VM in the client.

**How to apply:** whenever a screen turns `ApprovalPolicyFacts.rules` into a
sentence about what happens without a human — Settings, onboarding summaries,
bulk-approve gating, agent explanations. Note that `mapPolicyRuleToCard`
deliberately renders rules to prose and throws the numbers away; anything that
needs to COMPARE against a threshold must read `facts`, and anything that needs
to state an effective outcome must also respect order and scope.
