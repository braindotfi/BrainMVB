---
name: Translating a Figma frame to Tailwind faithfully
description: The two systematic errors that make a "pixel perfect" frame translation quietly wrong, and how to catch them by measuring.
---

Two mistakes are systematic rather than occasional, and neither is visible by eye.

## Figma's stroke can fall outside the frame; Tailwind's border never does

Tailwind is border-box, so a literal `w-[<frame>]` may spend two of its pixels on the
stroke. Where that matters, the gutters come out 2px short and the failure surfaces far
from its cause: a line of copy that fits in the frame wraps, and the popup grows by a
whole line height.

It is **not** a blanket +2. Declare frame + stroke only when a child has a width that the
squeeze would actually change — a fixed-width column, or a text run sized to fit. When
every child is `w-full`, the frame number is also the right painted width, and using it
keeps the rendered box equal to the number the designer reads off the inspector, which is
the number they will quote back.

**How to apply:** decide per frame, then measure the inner content box, not the outer one.

## A component's library default is not this frame's geometry

Codegen inlines the *component definition*, defaults and all, then overrides them at the
instance. A search field declared `w-[288px]` in its definition and instantiated `w-full`
says nothing whatever about the frame around it — inferring the popup width from that 288
produced a popup 14px narrower than the design, and it survived review because the
arithmetic looked sound.

**Why:** the design-context dump mixes two different things (library defaults and this
frame's real layout) in one blob of JSX, and they are not distinguishable by reading.

**How to apply:** for any load-bearing dimension, call the Figma metadata tool for the
node. It returns real x/y/width/height per layer, so the frame's own size and its
children's true offsets are facts rather than inferences. Reach for it whenever a size
is being pinned, and always after a size is disputed.

## A fixed-size frame means the list scrolls, not the popup

A frame with an explicit height is a specification: the container stays that tall and its
records area absorbs the overflow. Do not translate it as a content-sized box that happens
to match at the row count the designer drew.

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
