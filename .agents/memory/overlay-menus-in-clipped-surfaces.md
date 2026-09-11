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
frame, then re-place once the element exists.

### Get the element through a callback ref, not a `useRef`

The obvious two-pass — a `useRef` plus a `measured` flag the layout effect sets
once `ref.current` is populated — is broken whenever the overlay's content is
mounted by a library in a *later* commit than the hook's own. Radix's
`Dialog.Content` does exactly this. On every run of the effect `ref.current` is
still null, the flag never flips, the effect's deps never change so it never
runs again, and the element stays `visibility: hidden` forever. The symptom is
an overlay that dims the screen with nothing on it, and no console error.

Put the node in **state** via a callback ref (`ref={setContent}`) and make the
placement callback depend on it. The element arriving is then a render, which is
what makes the second pass happen at all. It still terminates: pass one has no
element, pass two has one, and nothing after that changes the dependency.

**Why:** a whole screenshot round was lost to a blank overlay caused by exactly
this ref-timing assumption.

### Anchor to the frame, not to the button

When the trigger sits inside a padded chrome element (a rail, a toolbar), design
almost always butts the overlay against that chrome's *outer* border while
aligning it vertically with the button. Reading both edges off the button slides
the overlay over the chrome's padding and hides its border — a few pixels, but
it reads as the overlay sitting on top of the rail rather than beside it. Have
the chrome publish itself (`data-…-frame`) and take the horizontal edge from
`anchor.closest(...)`, keeping the trigger rect for the vertical alignment.

## Do not claim a role the markup does not implement

`role="listbox"` / `role="option"` promises assistive tech a roving-focus widget
driven by arrow keys. A menu of ordinary `<button>`s reached with Tab does not
deliver that, and advertising it is worse than saying nothing — the user is told
to press keys that do nothing.

**How to apply:** for a plain button menu, use only `aria-expanded` on the trigger
(a disclosure) and `aria-current` on the selected row. Promote to listbox/menu
semantics only alongside real focus management.
