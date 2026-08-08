---
name: Global restyle and codemod passes
description: How to run an app-wide mechanical style pass (type scale, spacing, colour) without shipping a regression the spec didn't anticipate.
---

# Applying a scale across a whole app

## Count a before → after transition table before judging risk

A mechanical pass is easy to *apply* and hard to *assess*. The useful artifact is not the file list
and not the line count — it is the tally of transitions, one row per `old → new` pair:

```
26  14/none -> 14/20
26  12/20   -> 12/16     <- tightening; nothing asked for this
21  13/none -> 14/20
```

**Why:** a rule stated as "loosen the cramped sizes" still tightens things, because some sites were
already looser than the target. That direction is invisible in a summary that only says "313 lines
changed", and tightening is the direction that actually breaks layout — loosening is forgiving,
compression clips and cramps. The tally surfaces it in one line and tells you exactly which
transition classes deserve a rendered before/after.

**How to apply:** after the pass, diff each changed line against the baseline, extract the old and
new values, and `sort | uniq -c`. Check the unintended direction first, then confirm whether those
sites wrap — a tightened *single-line* label only changes box height, while a tightened wrapped
paragraph is a readability regression.

## A component's geometry invariant outranks the global table

An app-wide scale is written in terms of roles (title, body, label). Components are built in terms
of geometry (this row is exactly 40px so every list aligns). Where the two disagree, the geometry
wins and the table needs a documented exception — flattening them into one rule is what breaks
alignment across every list at once.

The general form: **fixed geometry follows the geometry, flow text follows the table.** The same
split governs anything sized by its box rather than its prose — row stacks, badges, fixed-height
controls, pill-shaped buttons.

**Why:** the global rule is a generalisation over roles and has no way to express "these three
values sum to a height that something else depends on". Nothing in the class string says so either;
the constraint usually lives only in a test or in a sibling component.

**How to apply:** when a mechanical pass turns an existing test red, read the test before editing
it. A guard that pins specific values with a geometric rationale is reporting a real collision, and
"update the assertion to match the new output" converts a caught regression into a shipped one.
Take the exception, and write it down next to the rule it contradicts so the next reader does not
re-flatten it.
