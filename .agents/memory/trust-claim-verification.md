---
name: Verifying a UI trust claim against the live policy
description: Copy that tells an operator what the product will or won't do with their money must be read back from the tenant's policy, not from the product's stated stance. The two disagree here.
---

## The rule

Any sentence in the UI that makes a promise about money movement — "nothing
moves without your approval", "Brain proposes, you decide", "this never lets
Brain spend" — must be checked against the **live policy of a real tenant**
before it ships or is restored. Read the rules back over the wire and look at
`execute` and the `when` clause. Do not verify it against the product's
self-description, the onboarding copy, or a fixture.

**Why:** it is tempting to settle this from the policy document, and that is
wrong in BOTH directions. A policy rule reading `execute: "auto"` -- and a live
evaluate returning `outcome: allow` with `required_approvers: []` -- does NOT
mean anything runs unattended: the payment intent was still created as
`pending_approval` and still asked a human to approve. `allow` means "no extra
confirmation required", not "no human involved". Reading the policy alone once
led to deleting a true reassurance ("you decide") and replacing it with copy
that advertised an automatic path nobody could demonstrate -- inventing a
capability, which is the same failure as overpromising safety, just pointed the
other way.

**How to apply:** do not verify from the policy document. **Exercise the path**
on a live tenant and observe the record it produces: propose the action and read
the resulting status and its approval evidence. Only a state you actually
produced is evidence about behaviour. If you cannot produce the state your copy
describes, the copy does not get to describe it.

What survives on policy evidence alone is the narrower *capability* boundary --
granting data access is not granting spending authority -- which is usually the
question being asked anyway.

Prefer pointing the reader at the screen where the authority is visible over
asserting what the authority does. A sentence that sends someone to look is
still true after the policy changes; a sentence that quotes the behaviour is not.

## Known live contradictions

The Inbox footer still says "Brain proposes. You decide. A separate execution
service settles." That predates this rule and is the same class of claim. If you
are in that file for another reason, it needs the same treatment.


## Statuses reached by two different paths

A terminal status is not provenance. Here `approved` is reached both by a human
approving and (allegedly) by policy clearing, so any UI that classifies on status
alone will describe some human decisions as automatic. The distinguishing
evidence is the approval record: a non-empty `approval_ids` means a person acted,
whatever the status says.

**Why:** one screen ended up showing two rows for the same payment -- "no human
approval was required" beside "Approved by <name> after review". The false row is
the one that reads like a system guarantee.

**How to apply:** classify records by the evidence that distinguishes the paths,
never by a status both paths share. If no record can be shown to reach the
"automatic" state without a human, render that surface empty rather than letting
it borrow human decisions to look populated.

## A rule can be unreachable because the caller cannot supply a check's input
A policy rule's conditions may reference a context field that **no caller can populate**. Seen live:
an AP auto-approve rule carried `agent.risk_level.lte: low`, but the policy-VM action shape is only
`{kind, counterparty_id, amount}` — there is nowhere to put an agent risk level, so that check
returned FAIL on every single evaluation. Counterparty and amount checks passed; the rule still
never fired, and every payment fell through to the review rule.

**Why:** the rule reads as satisfiable, and the allowlist/threshold values all look reasonable, so
inspecting the policy JSON (or the counterparty trust data) tells you nothing. Only running the VM
reveals that one check can never pass.

**How to apply:** before trusting *or* filing a bug about an "auto" rule, dry-run
`POST /policy/{tenantId}/evaluate` across a matrix that should pass — including a case engineered to
satisfy every documented condition. If the engineered pass still fails, read which check failed:
that names the unsatisfiable input. Also note real proposals may show the rule with an **empty
`checks` array and `matched:false`**, which means it was never evaluated (wrong action `kind`), NOT
that it was evaluated and rejected — the two are easy to confuse.
