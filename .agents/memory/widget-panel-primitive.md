---
name: WidgetPanel — shared panel primitive
description: WidgetPanel/WidgetCard/WidgetHeader/Divider are the sole panel chrome; where each surface lives and what noBorder means.
---

All card/panel chrome lives in `client/src/components/LedgerWidgets.tsx`. Never create a local copy.

| Component | When to use |
|---|---|
| `WidgetPanel` | Any bordered panel shell (bg `#0a0c10`, border `#1d2132`, radius 16). Pass `noBorder` only when Figma explicitly shows no border. |
| `WidgetHeader` | Dot + uppercase title + optional count + optional `children` for trailing metadata (e.g. version/quorum text). |
| `WidgetCard` | `WidgetHeader` + `WidgetPanel` composed together. Used by all Ledger tabs. |
| `Divider` | Full-width 1px separator at `#1d2132`. Import from LedgerWidgets; never inline. |

**Surface inventory (all now migrated):**
- Ledger tabs (CashFlowTab, PayablesTab, ReceivablesTab) — `WidgetCard` ✓ (were already correct)
- RulesPanel — `WidgetPanel` for Section/PolicySection/SuggestionCard; `WidgetHeader` for the Rules header row
- RuleDetail — `WidgetPanel` for all 6 inner panels (adds previously missing borders)
- SettingsPage — `<WidgetPanel noBorder>` (borderless per Figma; intentional)
- DevelopersSection — `<WidgetPanel>` (adds the border the local Card was silently omitting)

**Why:** Before this migration each surface had a local `Card` or hand-rolled div that copied the panel chrome. DevelopersSection and RuleDetail were silently missing the border token, causing visual inconsistency.

**How to apply:** For any new panel surface, reach for `WidgetPanel` first. Only pass `noBorder` if the Figma frame explicitly shows no stroke. The test in `rowFormatting.test.ts` guards CountPill rendering callsites — RulesPanel is intentionally NOT on that list now (count flows through `WidgetHeader`'s `count=` prop).
