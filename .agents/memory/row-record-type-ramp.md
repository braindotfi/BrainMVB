---
name: Row-record type ramp and height
description: The Security settings table is the canonical typography AND geometry for row records; the 40px stack that makes heights match, and why line-height is load-bearing.
---

## The rule

The table on the Security settings subpage is the reference for every row record
in the app (Overview, Inbox, Ledger tabs, Sources, Audit Log). A record is:

- title:   `font-medium` `16px` `#a8b9f4` `leading-[20px]`
- gap:     `4px`
- subtext: `font-medium` `14px` `#6c779d` `leading-[16px]`

which makes the text stack exactly **40px**. Titles are **medium, never
semibold** — several surfaces drifted to `font-semibold` independently, and that
is the most common way the ramp breaks.

**Why:** the row surfaces were built at different times from different Figma
frames and drifted apart (13/14/15/16px titles, two greys, both weights). The
Security table was picked as the single reference so "which one is right?" has
an answer.

## Line-height is load-bearing, not cosmetic

Do not "improve" the subtext leading to 18–20px because wrapped text looks
tight. 20 + 4 + 16 is what produces the 40px stack; changing it silently breaks
height parity with the reference everywhere.

**Why:** this was learned the hard way — the leading was relaxed to 18/20px in a
typography pass for exactly that readability reason, and it had to be reverted
one step later when the heights were asked to match. The cramped-wrapping
complaint is real but it is the cost of the reference geometry.

## Matching "height" means matching the stack, not the outer box

The Security row's outer box is 40px with **zero** padding; its breathing room
comes from the parent card's `p-16` + `gap-16`, so each row occupies a 56px slot.
The other lists use `p-[8px]` + a bottom border instead. Give them the 40px
stack and they land on the same 56px slot automatically.

Do **not** force their outer box to a literal 40px — that needs zero vertical
padding and makes bordered rows collide.

**How to apply:** watch for anything in the title row taller than 20px. An
inline pill with `py-[3px]` plus a 1px border is 22px and quietly inflates the
whole stack to 42; `py-[2px]` brings it back to 20.

## Only the baseline row is 40px

Rows grow on purpose: a wrapping title, a third "note" line, the Rules tab's
paused-rule banner. Pin the *shortest* row of a surface, never all of them —
asserting a fixed height on every row is asserting the UI must clip its content.
`scripts/qa-measure-row-heights.mjs` enforces exactly this and stubs the
proposals GET, because Overview/Inbox have no proposals in the demo tenant and
measuring an empty state proves nothing.
