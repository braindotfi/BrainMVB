---
name: Pointer capture and child controls
description: How parent swipe gestures can silently make pagination and other nested controls untappable on touch browsers.
---

# A swipe surface must not capture its child controls

Before calling `setPointerCapture` on a swipeable parent, check whether the
pointer started on a button, link, input, or other interactive descendant. If
it did, leave the pointer with that control.

**Why:** pointer capture can retarget the eventual pointer-up and click to the
capturing parent. Synthetic click-only tests stay green, while pagination dots
inside the swipe surface become untappable on touch devices.

**How to apply:** test nested controls with the complete
pointer-down → pointer-up → click sequence and assert the parent did not call
`setPointerCapture`. Record gesture state before attempting capture and guard
the call because some older touch browsers expose the method but reject it.

# Preserve measured pagination geometry

Do not enlarge the actual pagination button when the design specifies exact dot
centres, spacing, and vertical placement. Expanding each box shifts the centres
apart even if the visible child remains small.

**Why:** replacing measured 6px buttons with 32px boxes made the dots visibly
too far apart and moved them off their correct baseline. The untappable state
was caused by parent pointer capture, not by the visual geometry.

**How to apply:** fix event ownership first. Preserve the measured button boxes
and use a pseudo-element for any invisible hit expansion that does not alter
layout. Verify the actual dot centres and gaps in a real browser.

# Pointer-event tests do not prove touch swiping

When swipe behavior matters on touch devices, implement and test an explicit
touch-event path rather than assuming every embedded/mobile browser will
translate a finger gesture into the expected PointerEvent sequence.

**Why:** synthetic PointerEvent tests passed while the real card still did not
swipe. A Chromium run using actual touch input proved the native
touchstart/touchmove path worked.

**How to apply:** keep mouse/pen pointer handling separate from touch handling
to avoid double advances. Validate with a touch-enabled browser and dispatch
real touch input, not only jsdom events.