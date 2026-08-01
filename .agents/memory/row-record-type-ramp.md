---
name: Row-record type ramp and row chrome
description: Two settings surfaces are the reference for every row record — Security for the 40px text stack, Profile for the 64px row box; why line-height is load-bearing and only baseline rows are pinned.
---

## There are TWO references, and they disagree about padding

Treating either one as "the row spec" gets you the wrong answer:

- **Text stack → the Security settings table.** 16px/20 title + 4px gap +
  14px/16 subtext = a **40px stack**.
- **Row chrome → the Profile settings rows (Identity card).** That same 40px
  stack in 12px vertical / 16px horizontal padding, 12px gap between the row's
  columns = a **64px row box**.

Security's own rows have **zero** padding — their breathing room comes from the
parent card's gaps — so Security is never the chrome reference. Overview, Inbox
and all four Ledger tabs follow the Profile chrome over the Security stack.

**Why:** these surfaces were built at different times from different Figma
frames and drifted apart (13/14/15/16px titles, two greys, both weights, three
paddings). Naming one reference per concern gives "which one is right?" an
answer.

## Titles are medium, never semibold

The single most common way the ramp breaks: a surface drifts to `font-semibold`
on the title. Every row title is medium.

## Never fork typography on an icon/variant flag

A shared row component that switches its *icon treatment* on a boolean must not
switch its *text ramp* on the same boolean.

**Why:** the settings row component did exactly that, and it hid a second,
older ramp (15px/12px with a 2px gap) inside the same component for a long time.
Nothing looked broken in isolation — the mismatch only showed up when someone
compared two rows on the same page. The icon treatment is a visual choice; the
text ramp is not.

## Line-height is load-bearing, not cosmetic

Do not relax the subtext leading to 18–20px because wrapped text looks tight.
20 + 4 + 16 is precisely what produces the 40px stack, and changing it silently
breaks height parity everywhere.

**Why:** learned the hard way — the leading was relaxed for exactly that
readability reason in one pass and had to be reverted in the next when the
heights were asked to match. The cramped-wrapping complaint is real; it is the
cost of the reference geometry.

**How to apply:** also watch for anything in the *title row* taller than 20px.
An inline pill with `py-[3px]` plus a 1px border is 22px and quietly inflates
the whole stack to 42.

## Only the baseline row is pinned

Rows grow on purpose: a wrapping title, a third "note" line, the Rules tab's
paused-rule banner. Assert the **shortest** row of a surface, never all of them
— pinning a fixed height on every row asserts the UI must clip its own content.

Subtract borders before comparing: these lists separate rows with a 1px
`border-b` on the row itself, whereas Profile uses a separate divider element,
so raw bounding boxes read 65 vs 64 for rows that genuinely match.

`scripts/qa-measure-row-heights.mjs` enforces all of the above, and stubs the
proposals GET because Overview/Inbox have none in the demo tenant — measuring an
empty state would prove nothing about the rows it is meant to check.

## What is deliberately NOT copied from Profile

- **The 40px circle icon and chevron button.** Those are content and affordance,
  not spacing. Giving a ledger transaction an icon would be inventing meaning.
- **The inset divider.** Profile insets its divider 16px; the lists run a
  full-width `border-b`. This is a known, accepted difference — changing it is
  structural (it interacts with `last:border-b-0`), not a spacing tweak.
