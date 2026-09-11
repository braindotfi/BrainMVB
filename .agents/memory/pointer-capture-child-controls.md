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

# Visible size and touch-target size are separate

A small visual mark can sit inside a larger real button without changing the
artwork. Prefer a genuine 32–44px button box over a pseudo-element that only
adds a few pixels around the mark.

**Why:** a 6px pagination dot with a 10×24px pseudo-element remains difficult
to tap and its actual element geometry still understates the interactive area.

**How to apply:** keep the visible dot in a child span and size the button
itself for touch. Verify the real button dimensions, not only pseudo-element
classes.