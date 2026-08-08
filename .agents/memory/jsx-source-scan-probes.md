---
name: JSX source-scan probes
description: Two regex traps that make ad-hoc "scan the components" audits report confident nonsense, and what to use instead.
---

# Scanning JSX tags with regex lies in two specific ways

Ad-hoc audits (count the buttons, find the rule violations, tally the tokens) are worth
running, but both obvious ways of grabbing "the opening tag" are wrong.

## Trap 1 — a fixed character window swallows children

`t[m.start() : m.start()+900]` after matching `<Button` reaches well past the tag and into
the element's **children**. A spinner `<span className="rounded-full">` or an `<img
className="rounded-full">` inside the button then gets attributed to the button.

This produced a confident "6 buttons override the radius" report where the real answer was
zero — every hit was a spinner or a logo image nested inside a correctly-styled button.

## Trap 2 — `[^>]*>` stops at the first `>`, which JSX puts inside attributes

`<Button\b[^>]*>` terminates at the `>` of an arrow function:

```tsx
<Button onClick={() => doThing()} className="...">
```

It matches up to `() =`**`>`**, so every attribute after the first handler is invisible. A
scan built this way reports "clean" because it never saw the classes. It is the same shape
of failure as trap 1, inverted: one over-reads, the other under-reads.

**Why:** both probes were used in the same audit and disagreed. The disagreement is the only
reason the false positive was caught — a single probe would have been believed.

**How to apply:** when a scan's result is load-bearing, confirm it with a second, differently
shaped probe (a plain `grep -n` for the literal string usually suffices) before acting or
reporting. If the two disagree, the scan is wrong until proven otherwise. Prefer bounding the
tag by balanced-brace scanning, or just grep the literal and read the hits.

A scan that cannot distinguish an element from its children cannot back a claim about either.
