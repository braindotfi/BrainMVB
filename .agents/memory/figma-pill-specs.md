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

## Figma alpha is often an artboard state, not a token

Frames routinely carry opacity that encodes a *state* rather than a colour:
a disabled button exported as `opacity-50`, an approved pill exported as
`bg-[rgba(18,53,9,0.6)] text-[rgba(66,191,35,0.6)]` where the design system's
real token is the solid `#123509` / `#42bf23`.

**Why:** copying that alpha into a status pill is actively wrong when the pill
must serve a whole event-type union. The frame only ever shows one state, so a
60%-alpha "Approved" ends up dimmer than a full-strength "Rejected" — the
opposite of the intended emphasis.

**How to apply:** take geometry, typography and glyphs from the frame verbatim;
take *semantic colour* from the shared mapping helper that covers every state.
Flag the deviation rather than silently picking one.
