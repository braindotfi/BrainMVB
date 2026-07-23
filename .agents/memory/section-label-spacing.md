---
name: Section label spacing convention
description: Why subpage section labels need a 36px-tall row, not just a 4px gap
---
Section labels (16px/24 semibold #414965) above cards: default to a `min-h-[36px]` row (flex items-center), UNLESS the Figma frame explicitly specifies a 24px header row — then match Figma (e.g. Usage & Limits uses `h-[24px]`).

**Why:** The "correct-looking" reference pages (Developers Keys/Tenants) get their label breathing room from a 36px pill button in the header row, not from the 4px gap. Label-only rows at natural 24px height look cramped when improvised — but some Figma frames (Usage, 2026-07) deliberately use bare 24px header rows, so this is a default, not a hard rule.

**How to apply:** New section label rows in Developers/Settings subpages get `min-h-[36px]` on the wrapper (or contain a PillButton) when there's no Figma spec; follow the Figma row height when one exists. Gap to the card below stays 4px via parent `flex flex-col gap-[4px]`.
