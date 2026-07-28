---
name: Tag/chip constants carry border colors only
description: Why chip strokes silently vanish, and where the border width belongs.
---

The shared tag/chip style constants (the `TAG_*` set in the Inbox, and most
branches of `auditEventChipClass`) specify a border **color** such as
`border-[rgba(255,149,0,0.2)]` but deliberately no border **width**. A color
utility alone renders no stroke, so a chip that only spreads the constant into
its `className` shows no border at all — and it fails silently, looking merely
"flat" rather than broken.

**Rule:** the consuming element supplies `border border-solid`; the constants stay
color/semantic only.

**Why:** keeping width on the element rather than in each constant means every
chip source renders with a consistent stroke, and a new tag constant cannot
forget it. One `auditEventChipClass` branch (`system_activity`) does inline its
own `border`; the duplicate is harmless (same width and style), but do not copy
that pattern into new branches.

**How to apply:** when adding a chip/pill/tag, or when a designer reports a
missing stroke on one, check the consuming element for the width utility first —
the color is almost certainly already present in the constant.
