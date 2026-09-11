---
name: Translating a Figma frame to Tailwind faithfully
description: The two systematic errors that make a "pixel perfect" frame translation quietly wrong, and how to catch them by measuring.
---

Two mistakes are systematic rather than occasional, and neither is visible by eye.

## Figma's stroke is outside the frame; Tailwind's border is inside

A Figma frame's border rect is emitted at `left/right/top: -1px`, so the frame number is the
**content** width. Tailwind is border-box, so a literal `w-[<frame>]` spends two of those
pixels on the stroke. The gutters then come out 2px short, and the failure surfaces far from
its cause: a line of copy that fits in the frame wraps, and the popup grows by a whole line
height.

**How to apply:** when translating a frame that has a stroke, declare the width as
frame + stroke, and verify by measuring the inner content box, not the outer one.

## A global `text-transform` reaches data, not just labels

`button { text-transform: capitalize }` (or any global casing rule) applies to every
descendant. Any tenant-authored string rendered inside a button — an account name, a vendor,
a document title — is silently retitled. `textContent` is unaffected, so **no test catches
it**; only a screenshot does.

**How to apply:** add `normal-case` to any element rendering user or tenant text inside a
button, and check a rendered screenshot for casing whenever data appears in a control.

## Measure rather than eyeball

Both were found by driving the real component in a headless browser and comparing
`boundingBox()` against the frame's absolute coordinates. A frame's absolute `top` values
reduce to a flow layout; reproducing them and checking the resulting heights match is a
cheap, decisive test that a visual comparison is not.
