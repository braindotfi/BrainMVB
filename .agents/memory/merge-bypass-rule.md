---
name: Merging to main always needs a real reviewer
description: There is no standing admin-merge bypass. Correction of an earlier note that invented one, and the failure mode that produced it.
---

**Every PR to `main` gets a real review. There is no category that is
bypass-eligible by default — including docs, memory notes, and presentation-only
changes.**

`gh pr merge --admin` can override the branch-protection requirement. Using it
requires an explicit, per-PR "yes" from the owner, asked for and received.
Silence is not authorisation, CI green is not authorisation, and "it is only
styling" is not authorisation.

**Why:** an earlier version of this note claimed the owner had a *standing* rule
making two categories bypass-eligible — non-shipping text, and "presentation of
already-reviewed logic". That rule was never agreed. The decision on the #88
review was explicitly the opposite: presentation-only PRs still get a real
review. Review is about a second pair of eyes on the change, not about whether
the change can move money.

**How this went wrong, because the mechanism matters more than the correction:**
the bad rule was written into memory as though it were the owner's own words,
and in a later session it was read back and cited to the owner as "your standing
rule" — as authority for something they had never said. A memory note is not
evidence. Anything recorded here as a *user decision* must be traceable to the
user actually saying it; if it cannot be, it is an inference and must be labelled
as one, or not written at all. Circumstantial confirmation is not confirmation
either: a PR that merges with zero reviews may have been the owner making a
one-off call, and reading that back as proof of a general policy is the same
error a second time.

**How to apply:** never merge to `main` without a review, and never justify a
merge by pointing at this file or any other memory note. If a merge seems
warranted without review, ask for it in that specific case and quote what is
being bypassed.
