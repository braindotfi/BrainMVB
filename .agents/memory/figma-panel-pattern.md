---
name: Figma panel pattern
description: Reusable "list panel" visual shape for Figma-matching restyles (used by AuditLogPage and RuleDetail); reuse for future pages needing pixel-perfect Figma panels.
---

Several pages in this app (Audit Log, Rule Detail) share the same Figma panel shape for
list-style content:

- Outer panel: `rounded-[16px] bg-[#11141b] border border-[#1d2132]`.
- Header row: title + a count badge (small pill, `bg-[#414965]`-style background) showing the
  number of items in the list.
- Rows separated by a divider (`border-b border-[#1d2132]` on all but the last row), each row a
  flex layout with label/value on one side and an action pill (e.g. "Remove", "Edit", "Cancel/
  Save") on the other.
- Rows that need inline confirm (delete, pause/resume) swap the action pill for a confirm pill
  pair rather than opening a separate modal.
- Accordion-style rows (e.g. "Reported Problems") use a chevron-up/down toggle button with a
  `data-testid` on the toggle itself (not just the card), so expand/collapse is directly
  testable.

**Why:** These pages were restyled independently against different Figma nodes but converged on
the same structural pattern — recognizing it up front avoids re-deriving the layout from scratch
and keeps visual consistency across pages that weren't explicitly cross-referenced in the design.

**How to apply:** When asked to pixel-match a new page/section against a Figma node that shows a
list of items with a header count and per-row actions, check whether this shape fits before
inventing a new layout. Look at `client/src/pages/AuditLogPage.tsx` and the panel sections of
`client/src/pages/RuleDetail.tsx` (Trusted Vendors / Amount / Reported Problems) as reference
implementations.
