---
name: Which threshold gates a bulk approval
description: Why bulk-approve eligibility reads the second-approver line from the signed policy, never the auto-approve line — and why user rules may only tighten it.
---

Bulk-approve eligibility must be gated on **the amount above which the tenant's
policy demands more than one approver**, never on the policy's *auto-approve*
amount.

**Why:** the two sound interchangeable and are not. An auto-approve clause is
conditional on more than the amount — the live policy auto-executes outbound
payments under its limit *only when the counterparty is already an approved
vendor*. So an item under the auto-approve line that is nevertheless sitting in
the approvals queue is there precisely **because it failed that clause**. Gating
checkboxes on "under the auto-approve line" therefore offers one-click batch
approval to exactly the items the policy singled out for scrutiny — the inverse
of the intent. The second-approver line has no such trap: below it the tenant
has already said one person's approval suffices, and a bulk bar is one person
approving several things they could each have approved individually. It never
widens anyone's authority.

**How to apply:** read `execute: "confirm"` clauses whose `require` is *not* the
single-signer value, take their `amount.gt` per `applies_to` category, lowest
wins. Treat an unrecognised `require` as elevated — an allowlist of safe values,
not a denylist of dangerous ones, so a clause added to the DSL later fails
closed.

Two corollaries that are easy to get wrong, both caught in review:

- **A policy line is mandatory; a user rule may only tighten one.** A rule `cap`
  is an auto-clear ceiling — the same *kind* of number as the auto-approve
  clause rejected above — and asserts nothing about how many people must sign.
  Letting a cap stand alone as the gate reintroduces the exact semantics you
  rejected, and does it in the worst case: when the policy could not be read.
- **An elevated clause with no parseable amount suppresses its whole category.**
  "Outbound payments require owner and CFO", full stop, means *every* one needs
  two signers. Skipping it for having no number lets a sibling amount-gated
  clause set a limit and authorise batches the policy forbids outright. An
  unparsed comparator lands here too: unparsed is unknown, and unknown fails
  closed.

Two related rules that fall out of the same reasoning:

- **No amount, no checkbox.** An unreadable amount is not evidence of a small
  one. Same family as reading a failed fetch as an empty queue, but costlier.
- **Threshold source unreachable → no checkboxes at all.** If the policy read
  fails, every limit is unknown, so nothing is selectable. Offering an approval
  shortcut on the strength of a limit you could not load is the failure mode
  this whole area keeps producing.

There is no bulk endpoint in the BFF or in brain-core, so a batch is a
sequential loop over the single-item decide call. Run it sequentially (these are
money-path writes that land in the audit log in order) and report partial
results as partial — "approved 6" when 4 landed is the same untruth as a
wrongly-empty queue.
