---
name: Overlay menus inside clipped surfaces
description: Why in-card dropdowns get cut off on Ledger-style surfaces, the fixed-portal recipe that fixes it, and the ARIA role rule that goes with it.
---

# An absolutely-positioned menu inside a card will be clipped

Card surfaces here routinely need `overflow` clipping to keep content inside their
rounded corners, and the three-panel shell clips its centre column as well. An
`absolute` menu is laid out relative to the card but still *painted* inside every
ancestor's clip box, so a menu taller than the remaining card height silently loses
its last options.

The tempting fix — removing `overflow-hidden` from the card — trades one defect for
another: the card's own footer borders and backgrounds then overshoot its rounded
corners. Do not reach for it.

**The fix:** render the menu through `createPortal(..., document.body)` with
`position: fixed`, positioned from the trigger's `getBoundingClientRect()`. A portal
escapes *every* ancestor clip, so the card keeps its own overflow intact.

**Why:** both symptoms (clipped menu, overshooting separator) were reported as
separate visual bugs on the same component; they are one root cause with one fix.

## Fixed positioning owns its own viewport safety

Nothing keeps a `fixed` element on screen. A portal menu needs, at minimum:

- a horizontal clamp against `window.innerWidth`,
- a flip above the trigger when the space below cannot hold it,
- a `maxHeight` derived from the space actually available,
- reposition on `resize` **and** on `scroll` with `capture: true` — a non-capturing
  window scroll listener misses scrolling inside an ancestor panel, and these
  surfaces scroll internally.

Placement needs the menu's own height, which does not exist on the first call.
Use a two-pass: place unmeasured, render the menu `visibility: hidden` for one
frame, then re-place from a layout effect once the ref is populated. Gate the
second pass on a `measured` flag or the effect loops.

## Do not claim a role the markup does not implement

`role="listbox"` / `role="option"` promises assistive tech a roving-focus widget
driven by arrow keys. A menu of ordinary `<button>`s reached with Tab does not
deliver that, and advertising it is worse than saying nothing — the user is told
to press keys that do nothing.

**How to apply:** for a plain button menu, use only `aria-expanded` on the trigger
(a disclosure) and `aria-current` on the selected row. Promote to listbox/menu
semantics only alongside real focus management.
