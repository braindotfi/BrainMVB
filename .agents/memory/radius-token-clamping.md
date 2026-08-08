---
name: Radius tokens and corner clamping
description: Why swapping a small corner radius for a "pill" token is only safe below a size threshold, and why computed styles cannot verify it.
---

# Swapping a measured radius for a pill token

The used corner radius is `min(specified, W/2, H/2)` — the browser scales a radius down so
two adjacent corners cannot overrun the side they share.

So replacing a literal `r` with a large pill value (100px, 9999px) is visually neutral
**only while `min(W, H) <= 2r`**. For the common 22px chip corner that means `min(W,H) <= 44`.
Below the bound both values clamp to the same capsule; above it the pill really does open the
corner up to half the shorter side.

**Why:** a blanket `rounded-[22px]` → `rounded-pill` codemod was correct for 39 chips, badges and
segmented-control tracks and wrong for exactly one site — a 375px-wide fixed dialog, which never
reaches the clamp and would have rendered a 100px corner instead of 22px. Size context, not the
literal value, decides the mapping.

**How to apply:** when a radius codemod maps several literals onto one token, audit by *element*,
not by value. Grep the converted sites for `fixed`, `w-[3xx..9xx]`, `max-h-` — dialog shells hide
in the same value bucket as chips. Pick the token by what the element *is* (row / panel / modal /
pill), and let that override the measurement.

## Computed styles cannot confirm clamping

`getComputedStyle(el).borderTopLeftRadius` returns the **specified** value (`100px`), not the used
one. Every healthy 32px pill reports `100px`, so a check like "flag any radius above 24px" flags
all of them and proves nothing. Assert on the geometry instead: read
`getBoundingClientRect()` and test `min(width, height)` against the bound.

## Tooling footgun

`sed 's/a/b/'` without `/g` replaces the first match **on every line**, not the first match in the
file. Rewriting one occurrence in a multi-occurrence file needs an explicit line address
(`sed '59s/a/b/'`); otherwise the sibling call sites are silently rewritten too.
