---
name: Section label spacing convention
description: Why subpage section labels need a 36px-tall row, not just a 4px gap
---
Section labels (16px/24 semibold #414965) above cards must sit in a row with `min-h-[36px]` (flex items-center).

**Why:** The "correct-looking" reference pages (Developers Keys/Tenants) get their label breathing room from a 36px pill button in the header row, not from the 4px gap. Label-only rows at natural 24px height look cramped; repeated attempts to fix this by tweaking the gap below the label were visual no-ops.

**How to apply:** Any new section label row in Developers/Settings subpages gets `min-h-[36px]` on the wrapper (or contains a PillButton). Gap to the card below stays 4px via parent `flex flex-col gap-[4px]`.
