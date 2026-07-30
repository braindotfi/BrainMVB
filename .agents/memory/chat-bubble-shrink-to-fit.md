---
name: Shrink-wrapping a box to its wrapped text
description: Why no CSS property makes a wrapped box hug its longest line, and the measurement pattern that does.
---

# A wrapped box never shrinks back to its longest line

Once text wraps, a box with `max-width` keeps the **full max-width**, even when
every laid-out line is much shorter. Greedy line breaking routinely leaves
20-25% dead space, which reads as "all my bubbles are the same width".

None of these fix it — they all resolve to `min(max-content, available)`, which
*is* the max-width once the text is long enough to wrap:

- `width: fit-content`
- `display: inline-block` / `inline-flex`
- `display: table`
- flex `align-items: flex-start/end` (intrinsic cross-size)
- `text-wrap: balance` — changes *where* lines break, never the box width

**Why:** CSS sizes the box first, then flows text into it. Nothing re-measures
the resulting line boxes and feeds that back into the box. iMessage/WhatsApp
look like they hug because native text layout returns a bounding rect; the web
has no equivalent declarative hook.

## The pattern that works

Let the browser wrap at `max-width`, then measure and pin:

1. Clear the pin (`el.style.width = ""`) so wrapping recomputes from scratch.
2. Walk text nodes with a `TreeWalker`, `range.selectNodeContents(node)`,
   `range.getClientRects()`.
3. **Group rects by rounded `rect.top`** and take `max(right) - min(left)` per
   line. Without grouping, a line split across nodes (`total is <strong>$4,200</strong> due`)
   measures as its widest fragment, not its real width.
4. Set `width = ceil(widest + horizontal padding) + 1`. The +1px absorbs
   sub-pixel rounding so the last word cannot re-wrap. Keep `max-width` on as
   the cap.

Pinning to the widest line does not move break points in normal prose — every
line still fits — so it settles in one pass.

## Three traps this hits

- **ResizeObserver feedback.** Observe the *parent*, never the element you
  mutate. The observer still fires on parent **height** changes, which the
  re-wrap itself causes, so bail out unless the parent's *width* actually
  changed — otherwise every measurement schedules another.
- **Custom webfonts.** Fallback-face metrics differ, so anything measured
  before the swap is stale. Re-measure on `document.fonts.ready` when
  `document.fonts.status !== "loaded"`.
- **Stale measure keys.** The dependency must cover everything that changes the
  *rendered* output, not just the raw text — values interpolated at render time
  (currency symbols, formatted numbers) change glyph widths invisibly.

**How to apply:** any "make this box hug its text" request where the text can
wrap. Verify with a side-by-side harness — render the same messages with
measurement on and off; if the unmeasured column shows several different
messages at pixel-identical widths, that is the bug reproducing.
