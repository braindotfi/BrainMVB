---
name: Row-record type ramp
description: The Security settings table is the canonical typography for row records across the app, and why its line-height must not be copied verbatim.
---

## The rule

The table on the Security settings subpage is the reference type ramp for every
row record in the app (Overview, Inbox, Ledger tabs, Sources, Audit Log):

- row title: `font-medium` `16px` `#a8b9f4`
- row secondary text: `font-medium` `14px` `#6c779d`

Titles are **medium, never semibold**. Several row surfaces drifted to
`font-semibold` independently, which is the most common way this ramp breaks.

**Why:** the row surfaces were built at different times from different Figma
frames and drifted apart (13/14/15/16px titles, two greys, both weights). The
Security table was picked as the single reference so "which one is right?" has
an answer.

**How to apply:** when adding or restyling a row list, copy the two lines above.
Do not invent a third tier — the reference has exactly two levels, so auxiliary
row text uses the secondary style rather than a smaller/dimmer one.

## The line-height exception

Do **not** also copy the reference's `leading-[16px]` onto secondary text.

**Why:** the Security rows are all single-line (`whitespace-nowrap`), so their
tight leading is never exercised. Row lists elsewhere wrap — audit summaries and
Inbox subtitles routinely run to two lines — and 14px at 16px leading renders
visibly cramped there.

**How to apply:** match size, weight and colour to the reference; keep each
site's own leading (18–20px where text can wrap). Line-height is the one
property that should not be normalised across these surfaces.
