---
name: The signed-in shell has a narrow centre column
description: Why viewport breakpoints clip content on the app's main surfaces, and what to size off instead.
---

Any grid or wide row placed in the app's main content column must size off the
**container** — `style={{ gridTemplateColumns: "repeat(auto-fit, minmax(Npx, 1fr))" }}` —
never viewport breakpoints like `lg:grid-cols-4`.

**Why:** the signed-in shell is three panels — nav, content, chat. At a 1280px
viewport the centre column is only ~420px wide, so a `lg:` breakpoint matches and
packs four cards into it, clipping every figure. The viewport says "desktop"; the
container says "phone". This cost a full screenshot round to catch — the values
were cut off mid-number and `tsc` obviously said nothing.

**How to apply:** reach for `auto-fit` + `minmax` for multi-column content on
Overview, Decisions, Ledger and anything else inside that column. Verify with the
chat panel **open**, which is the default state users see — a check with it
collapsed passes and tells you nothing.

## Measure sub-tab rows at 1280 before designing them

The centre column is ~512px at 1440 but only ~304px at 1280. A horizontal
sub-tab row is the affordable way to nest a second level of navigation (a
second sidebar is not), but four tabs plus a trailing link overflowed: 349px of
tabs in a 304px row.

**Why:** the row is `overflow-x-auto`, so the failure is silent — a tab simply
sits off-screen instead of the layout visibly breaking.

**How to apply:** measure `scrollWidth` vs `clientWidth` of the row at 1280 and
assert it in QA. Fix by shortening labels (keep the full name on the panel's own
heading) and moving trailing links out of the row — never by letting a tab hide
behind a scroll.
