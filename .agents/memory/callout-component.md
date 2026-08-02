---
name: Shared callout component
description: All alert/warning/error boxes and info glyphs render through one component; how to find every call site, and the amber-vs-crimson tone tension it exposed.
---

# Callouts are shared, never hand-rolled

Every alert/warning/error box renders through `AlertCallout`, and every 16px
"circle + i" glyph through `InfoIcon`. Do not build a new one inline.

**Why:** before this there were ~25 bespoke boxes across three unrelated colour
schemes (amber, crimson-tint, and a separate red) plus a dozen byte-identical
copies of the same info SVG. They drifted independently, which is what made a
simple "match the Figma alert frame" request touch seventeen files.

**How to apply:** when adding a notice, import the component. When auditing,
see the search rule below.

## Finding every call site: search by geometry, not by page

A page-by-page survey of "where are the warning boxes" missed roughly two
thirds of them. What worked was grepping for the *artifacts* they share:

- the glyph's own path data (the distinctive `cy="4.7"` circle) finds every
  duplicated icon regardless of tint or indentation;
- the background/border colour tokens (`#4a2300`, `rgba(255,148,0,0.2)`,
  `rgba(239,68,68,...)`, `#350011`) find the frames.

Both searches return a lot of noise — badges, chips, status pills, tone lookup
maps, focus-ring colours and buttons share those tokens. Classify each hit as
*box* vs *chip* before touching it; only boxes are callouts.

Where the same glyph block repeats with only indentation and colour varying, a
scripted regex replacement is safer than a dozen hand edits — but it must also
merge the new import into any import line the file already has, or the second
pass overwrites the first.

## Amber meant two different things; the split is now explicit

Amber was doing double duty:

1. "this failed / this data is incomplete" — a genuine warning, and
2. "this feature is not connected yet" — an honest-unsupported-UI notice.

Collapsing both into one crimson frame makes category 2 read as a failure, so
the two are now separate exports: `AlertCallout` (crimson) for real failures
and things needing attention, `MutedCallout` (grey) for not-yet-available.

**Why:** user's explicit call — "not available yet should be in grey". It also
matches `honest-unsupported-ui.md`: a limitation should be plainly stated, not
dressed as an error.

**How to apply:** ask whether the thing described is *broken* or merely *not
built*. Loading failures, incomplete lists, paused rules, anomalies, form
errors and security cautions are alerts. "Not connected yet", "not active",
"propose-only" are muted. Add new tones to the `TONES` map inside the
component — never hand-roll a second frame at a call site, which is exactly how
the original drift started.

Related: the frame's Figma node is single-line text only. The optional `title`
prop exists because several real banners carry a heading over an explanation,
and flattening them would have lost the reason a rule paused.
