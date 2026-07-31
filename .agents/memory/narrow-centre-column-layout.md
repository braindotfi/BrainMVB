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
