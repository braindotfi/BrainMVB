---
name: Badge pill geometry vs the type scale
description: Why a global line-height pass must leave small bordered pills alone, and why only a runtime measurement catches it when it doesn't.
---

**A 12px bordered badge chip keeps `leading-14`.** Its height is its own vertical padding + that
14px line + 1px borders, and the padding differs per component, so there is no single "badge
height" to target. Re-leading to the table-correct 12/16 adds 2px to each of them.

**Why:** the smallest badge is exactly as tall as the row title line it sits on. Grow the badge and
you grow the title line, and every list row that carries a badge leaves its canonical height — on
several surfaces at once, from one shared component. Type-scale compliance and component geometry
are two different authorities; inside fixed-geometry chrome, geometry wins.

**How to apply:** before re-leading anything small and pill-shaped, ask whether it renders inside a
row stack. Three different things wear the same pill class — bordered badges (geometry-pinned),
action buttons with large vertical padding, and small borderless controls. Only the first is exempt;
judging the other two against a badge rule is wrong, not merely noisy. The border is the reliable
discriminator.

## The bigger lesson: what a green suite cannot see

A full unit suite, a design-token source scan and a typecheck all stayed green for the entire time
this bug was live, because **none of them can measure a rendered box**. A mechanical visual change
needs a guard that measures the running app, and that guard must fail when it matches *nothing* —
"0 violations" and "0 elements found" must never render as the same result. Widening such a guard
from one surface to three found real misses immediately.

Corollary for the reverse direction: a mechanical revert must key on the element's **role**, not on
the value it happens to hold. Reverting "everything at 14px + leading-16" also reverts flow prose
that legitimately arrived at those numbers.

## Probe-design traps that produced false alarms here

- `.sr-only` text is *supposed* to be clipped (1px box, overflow hidden). Any "text is clipped"
  check that does not exclude it reports mostly noise.
- A 16px element and a 14px element inside one row are **not** necessarily a title/subtext stack. A
  right-aligned timestamp matches that shape too. Detect stacks geometrically — shared left edge,
  second element directly below the first — or the probe invents regressions.
- Round a measured box once, at the end. Rounding `top` and `bottom` independently makes nearly
  every stack look 1px off its spec.
- A wrapped subtext legitimately makes a row taller; a fixed-height invariant only applies to the
  single-line case, so exclude wrapped rows explicitly rather than reporting them as failures.
