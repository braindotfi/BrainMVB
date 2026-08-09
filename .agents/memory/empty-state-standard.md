---
name: Empty-state copy and frame geometry standard
description: Canonical frame geometry and copy voice for all empty and error states across the app
---

## Frame geometry

**In-panel row** (empty state inside a bordered section/card):
`px-[16px] py-[12px] rounded-[8px]` — no extra border; parent card provides the frame.

**Standalone card** (empty state IS the card, replacing a list with no outer panel):
`flex items-center px-[16px] py-[20px] w-full rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg`
Used in InboxPage and TierRowList — leave alone.

**Error/unavailable**: always `UnavailableDataBox` from Callout.tsx.

Never use `style={{ color: "#6c779d" }}` — use `text-brain-v1baby-blue-60`.
Never use `style={{ color: "#ff9500" }}` — use `text-brain-v1light-orange`.

## Copy standard

**Category A — truly empty:**
- `"No X yet"` for named/countable collections (accounts, rules, vendors, members, keys)
- `"Nothing X yet"` for activity/event feeds (history, suggestions, recorded activity, conversations)
- Append a second sentence when a concrete next action exists: "Add one using the builder above."

**Category B — error/unavailable:**
- Lead with `"Couldn't load …"` — one declarative sentence.
- Add a second sentence only when the empty vs. unavailable distinction is high-stakes.
- Never drop the "this is a failure, not emptiness" reassurance.

**Why:** The app had four tonal voices and inconsistent padding. Converging copy prevented "No X yet" from appearing on error states (falsely reassuring) and ensured every error state told the user why they're seeing nothing.

**How to apply:** See CLAUDE.md "Empty-state copy and frame geometry standard" for the full surface table and checklist.

## Walkthrough catch pattern

The initial survey missed: PayablesTab, ReceivablesTab, PayableDetailPopup, AccountDetailPopup, SettingsPage approval policy, DevelopersSection key usage, SourcesSection AlertCallout banner, AuditLogSection AlertCallout. A `grep -rn "couldn't be loaded\|could not\|wrong reason"` sweep after the surface-by-surface pass catches these.
