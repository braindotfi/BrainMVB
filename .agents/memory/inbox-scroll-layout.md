---
name: Nested scroll layout
description: Reliable pattern for bounded scrolling inside route pages in the three-panel shell
---

Use a positioned route surface with a two-row grid: fixed chrome in the first row and `minmax(0, 1fr)` in the second. Keep the second row `min-h-0`, and put `overflow-y-auto` on the actual records panel rather than relying on a flex descendant to establish the scrollport.

**Why:** A nested flex chain can allow the records panel to grow beyond the viewport even when several ancestors have `min-h-0`; the result is visible clipping with no usable scroll area.

**How to apply:** For fixed-header list pages, make the outer surface fill its route container, use grid rows for chrome/list, and give the list panel `flex-1 min-h-0 overflow-y-auto`.