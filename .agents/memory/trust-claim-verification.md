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

**Why:** the product's stated stance and its provisioned policy disagree. The
stance is propose-only. The policy that ships with a fresh tenant carries an
`execute:"auto"` rule for outbound payments below a five-figure amount to
approved counterparties. Those payments run through Rules and never become a
Decision, so any copy promising a human step is false for the most common
payment path — and false in the direction that makes someone trust the system
more than they should. A reviewer caught one such sentence; the live read was
what settled it, because both sides of the argument sounded plausible from the
code alone.

**How to apply:** when writing, restoring, or reviewing copy on any screen that
touches payment authority, fetch the approval policy for a signed-in session and
enumerate the rules. If any payment-scoped rule has `execute:"auto"`, then:

- "runs through Rules **and Decisions**" is false — the auto path skips Decisions
- "you decide" / "nothing ships without you" is false
- what remains true, and is usually the real question anyway, is the *capability*
  boundary: granting data access is not granting spending authority

Prefer pointing the reader at the screen where the authority is visible over
asserting what the authority does. A sentence that sends someone to look is
still true after the policy changes; a sentence that quotes the behaviour is not.

## Known live contradictions

The Inbox footer still says "Brain proposes. You decide. A separate execution
service settles." That predates this rule and is the same class of claim. If you
are in that file for another reason, it needs the same treatment.
