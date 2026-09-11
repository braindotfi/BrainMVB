---
name: Restoring focus from a controlled Radix dialog
description: Why a nested, controlled Radix Dialog drops focus on <body>, and why the fix has to be deferred past the microtask queue.
---

A Radix `Dialog.Root` that is driven by state instead of a `Dialog.Trigger` does **not**
restore focus when it closes. Radix's close handler suppresses FocusScope's normal
prior-focus restoration and then focuses its own trigger ref — which nothing ever filled.
Every close path (Escape, a `Dialog.Close`, the scrim, and an action that sets the open
state to false) leaves focus on `<body>`.

**The fix:** keep a ref on the control that opened it and restore that ref from the
dialog's `onCloseAutoFocus`, after `event.preventDefault()`.

**The trap:** restoring synchronously, or via `queueMicrotask`, is not enough when closing
the dialog also re-renders the surface underneath it. An enclosing FocusScope watches for
the removal of the focused node with a MutationObserver; finding focus on `<body>`, it
pulls focus onto its own container. That callback is itself a microtask, so a microtask
restore races it and loses about as often as it wins. Defer with a timer instead.

**Why:** the paths diverge, which is what makes this expensive to find. A close that does
not re-render the parent (Escape, a close glyph) restores correctly with any timing, so a
test covering only those passes while the path a user actually takes is broken.

**How to apply:** whenever a dialog, sheet or popover is opened from state rather than a
Radix trigger. Cover *every* close path in tests, not one — and make the test flush a
macrotask, or it reads the frame before restoration and goes green for the wrong reason.
