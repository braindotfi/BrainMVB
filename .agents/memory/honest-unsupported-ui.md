---
name: Rendering UI the backend does not support
description: The "visibly disabled + honest label" pattern, and the rule that a disabled control must not carry invented specifics that read as real configuration
---

# When a design shows something nothing backs

Default for this project: render the control in its **real shape**, visibly
disabled, with a label that says plainly what is and is not happening — not a
bare placeholder, and never a working-looking control that quietly does nothing.
A placeholder loses the design's information architecture; a live-looking dead
control is worse, because a user reasonably assumes it took effect.

## The refinement that matters: no invented specifics

Stripping the *functionality* is not enough — strip the **fabricated
particulars** too. A disabled row reading "SMS for anything over $100,000" or
"posts to #finance-approvals" states a threshold and a destination that exist
nowhere. A user reads those as their current configuration, not as sample text,
and may act on them. Design mocks are full of such placeholders because they
need something concrete to render.

**Rule:** a disabled control may name the *channel or capability* ("SMS for
urgent items"); it may not quote a **number, threshold, account, channel name,
recipient, or schedule** unless that value is really configured and really read
back from a live source.

**Why:** confirmed as the standing expectation 2026-07-31 — "honest disabled
state" means avoiding specific-sounding fake config, not just fake
functionality. It is the same failure as a fail-open empty state: the screen is
confidently telling the user something untrue about their own setup.

**How to apply:** when porting any mock, list its concrete values first and ask
of each one "can I read this back?" If not, drop the value and keep the shape.
One honest note per group of dead controls, not one per row — stacked
disclaimers stop being read.

## Same instinct, adjacent surfaces

- A UI-only field that a backend cannot persist must say it changes nothing (see
  the backup-approver mark in Settings → Team).
- An unreachable read must never render as an authoritative "none"/"empty" (see
  `unreachable-data-all-clear.md`).
- A value that cannot be summarized confidently reports as "conditional" /
  "unknown" rather than the closest available number (see
  `policy-rule-order.md`).
