---
name: Matching Figma pill/button specs
description: Why arbitrary Tailwind text sizes silently break button height, and when NOT to copy a Figma swatch verbatim.
---

## An arbitrary font size does not set a line height

In Tailwind v3, `text-[14px]` sets `font-size` **only** — unlike the named scale
(`text-sm`), it carries no paired `line-height`. The element then inherits
`1.5` from preflight, so a pill built as `py-[10px] text-[14px]` renders ~41px,
not the 40px you'd guess and nowhere near a 32px spec.

**The rule:** a pill action button whose height matters must pin `leading-`
explicitly. The app's standard action pill is **32px = `py-[8px]` +
`leading-[16px]`**, and that is what the bulk-approve bars and the Add
Rule / Add Vendor builders both use.

**Why:** a request to "make button A match button B" is unverifiable by eye
here — two buttons can share `px`, `rounded`, font family and weight and still
differ by 9px purely from a missing `leading-`. Compute the height
(`padding-top + line-height + padding-bottom`) before believing either one is
wrong.

**How to apply:** when asked to resize a button to match another, derive both
heights from their classes first. The surface named as "wrong" is often already
correct and the *reference* is the outlier — say so with the arithmetic rather
than editing the named surface.

## Before deviating from a frame's colour, look for a sibling implementation

Frames sometimes carry opacity that encodes a *state* rather than a colour, so
an alpha value can look like an export artifact. It often isn't.

A settled-outcome pill exported as `bg-[rgba(18,53,9,0.6)]
text-[rgba(66,191,35,0.6)]` was read as a 60%-alpha artifact of the "Approved"
artboard and replaced with the solid `#123509` / `#42bf23` chip mapping. Those
alphas were the real token: another surface already rendered the identical pill
with exactly those rgba values, deliberately, so a purple-tinted row shows
through. The "deviation" silently forked one component into two looks.

**Why:** a frame shows one state, so reasoning from the frame alone cannot tell
a state-artifact from a token. The codebase can: if any surface already renders
this element, its values settle the question.

**How to apply:** before overriding a frame's colour, grep for an existing
implementation of the same element (by label text, by the rgba values
themselves, or by the Figma node id in comments). If one exists, reuse its
component and palette rather than re-deriving them — extract to a shared module
if it is currently private to a page. Only when nothing implements it yet
should you fall back to the shared semantic mapping, and then say so.

**Still true:** take *semantic colour* from a mapping that covers every state
rather than from the single state the frame happens to show — a pill serving a
whole union must not inherit one member's swatch. And when a list groups
several outcomes under one generic pill label, a detail surface for a single
record should keep that record's own label; the grouping is a list affordance,
not a fact about the record.
