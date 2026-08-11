---
name: Cross-currency totals and ratios
description: There is no FX rate anywhere in this app, so a total spanning currencies can only be faked — what to do instead, and why totals and ratios need OPPOSITE treatments.
---

# Cross-currency totals and ratios

There is **no FX rate anywhere in this codebase**. `formatAmounts` treats ETH as
native units precisely because it cannot convert it. Any figure that adds up
balances across currencies is therefore not "slightly off" — it is adding units
of different things.

This is not hypothetical: the demo tenant is provisioned with two USD bank
accounts **and an ETH smart account**, so any "all accounts" sum on a demo is a
mixed-currency sum by default. The ETH balance happens to be tiny, which is what
let the bug survive — the total looked plausible.

**Totals and ratios need opposite treatments, and this is the part that is easy
to get wrong:**

- A **total** may exclude the foreign accounts and report a labelled subtotal
  (one currency), as long as the caption says what was left out. A subtotal is a
  complete answer to a narrower question.
- A **ratio / share / concentration** must **refuse** rather than exclude.
  Dropping accounts from a denominator changes what the ratio means — the
  excluded holding is still real cash at risk, so excluding it *overstates*
  concentration in what remains.

**Why:** a caption is enough to make a narrower total honest, but nothing in a
caption can repair a percentage whose denominator silently changed meaning.

**How to apply:** any new "across all accounts" figure must decide which of the
two it is before it is written. If balances span currencies and you cannot name
the currency the figure is in, the figure does not exist.
