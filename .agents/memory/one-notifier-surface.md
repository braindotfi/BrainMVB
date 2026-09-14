---
name: One notifier surface
description: AppAlert owns the bottom-right corner; the two ways a second surface sneaks back in, and why an import scan only catches one of them.
---

# The bottom-right corner is one shared stack

AppAlert owns that corner. Every confirmation, warning, and failure goes through `useAppAlert()`,
and anything else that floats there portals into AppAlert's stack element instead of pinning its
own `fixed bottom/right`. If a notification needs something AppAlert cannot express, extend
AppAlert rather than adding a parallel surface.

A second surface gets in one of two ways, and they fail differently:

- **Undesigned duplicate** — a whole second system with its own chrome. The app carried the
  scaffolded shadcn `useToast`/`<Toaster>` trio next to AppAlert for a long time; it rendered a
  plain white card with no icon. Which one a user saw depended only on which hook a call site
  imported, so the designed surface appeared to randomly lose its styling. The migration onto
  AppAlert had been left half done, with single files calling *both* hooks — the designed one on
  their success paths and the white one on their error paths.
- **Positional collision** — a correctly-designed card that merely shares the coordinates. Two
  independently pinned cards do not queue, they cover each other. This one never looks wrong in
  isolation, which is what makes it easy to miss.

**Why it matters:** both shapes read to the user as the design work having been deleted or
regressed, and neither is visible in the component you would think to open.

**How to apply:** pick the variant that matches the outcome rather than flattening everything onto
success/destructive — a decline that genuinely landed is not a success, and a decision still
awaiting a second approver is neither. When auditing the corner, grep the position as well as the
notifier imports: an import scan finds the duplicate system but is completely blind to a
collision. Guard the positional invariant at runtime (assert the cards share one stack parent),
since a source scan cannot see layout.
