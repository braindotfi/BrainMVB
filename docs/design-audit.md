# BrainMVB — Design Consistency Audit

**Scope:** All app surfaces reachable from the sidebar — Overview (`HomePage`), Inbox (`InboxPage`), Ledger (`FinancesPage` + Payables/Receivables/Cash Flow tabs), Settings (`SettingsPage` + `components/settings/*`), Rules (`RulesPanel`), Rule Detail (`RuleDetail`), Vendors (`VendorsPanel`), the chat panel (`BrainAssistant`), the sidebar (`NavigationMenuSection`), and shared components in `client/src/components/**`.

**Status:** Audit only. No code was changed in this pass.

**Method:** Static read of the source tree. Counts come from pattern matching over `client/src` and are approximate — they indicate scale, not exact call-site totals. Line numbers are current as of this audit.

---

## Headline finding

BrainMVB **has a design token layer that is essentially unused.** `client/src/index.css:70-103` defines 25 Figma colour variables and `tailwind.config.ts:9-87` maps every one of them to a Tailwind class name. A token-name search across `client/src` returns, for nearly every token, **only the line that defines it**. The exceptions are `brain-v1white` (1 use), `shared-colorsheaderfooterbg` (5 uses), and `shared-colorsbaby-blue-60` (1 use).

Meanwhile the app contains roughly **2,724 hex literals and 5,324 pixel literals** across `client/src`. The palette is being re-typed by hand at every call site rather than referenced. That single fact is the root cause of most findings below: near-duplicate colours, off-scale spacing, and drifting radii are all symptoms of there being no enforced source of truth.

The second structural finding: **250 hand-rolled `<button>` elements versus 3 uses of the shared `ui/button.tsx` primitive.** The design system exists; the app does not consume it.

---

## Prioritized findings

### Quick wins — low risk, high visibility

| # | Finding | Where | Fix |
|---|---------|-------|-----|
| 1 | `#ff9400` vs `#ff9500` — two oranges, one meaning (warning/paused), differing by one RGB channel | `RuleDetail.tsx:215-221`, `VendorsPanel.tsx:75,685,765`, `HomePage.tsx:1210`, `RulesPanel.tsx:979` use `#ff9400`; `SettingsPage.tsx:550`, `DevelopersSection.tsx:1593` use the canonical `#ff9500` | Standardize on `#ff9500` (the token value) |
| 2 | Fractional font sizes leaked from a Figma export | `DeleteConfirmDialog.tsx:64` (18.75px), `:79` (20.625px), `:89/:99` (16.88px); border `0.938px` at `:59` | Round to 18/20/16px and 1px border |
| 3 | Four hover greys within 6 RGB points of each other | `#2a3040` (`RuleDetail.tsx:164,307,363`), `#2a3046` (`HomePage.tsx:1201`), `#2c3247` (`DevelopersSection.tsx:831,1607`), `#2b3145` (`VendorsPanel.tsx:752`) | Collapse to one hover grey — `#2c3247` is the most used |
| 4 | Delete Rule button has no hover state at all despite carrying `transition-colors` | `RuleDetail.tsx:248-255` | Apply the delete-modal hover `#4a0018` (`RuleDetail.tsx:367-373`) |
| 5 | Three destructive hover models for one visual treatment | `opacity-80` (`DeleteConfirmDialog.tsx:94-100`, `NavigationMenuSection.tsx:430-444`), concrete `#4a0018` (`RuleDetail.tsx:367-373`), none (`RuleDetail.tsx:248-255`) | Pick concrete `#4a0018`; keep bg `#350011` / text `#d20344` |
| 6 | Disabled treatment differs per button: `.4 cursor-wait`, `.4 cursor-not-allowed`, `.5` (primitive), or nothing | `DeleteConfirmDialog.tsx:99` (cancel has none), `VendorsPanel.tsx:765`, `ProposalCardParts.tsx:496-508`, `ui/button.tsx:7` | One rule: `disabled:opacity-40 disabled:cursor-not-allowed` |
| 7 | `FilterChipRow` re-implements `CountPill`'s exact geometry inline instead of importing it | `FilterChipRow.tsx:82-86` vs `CountPill.tsx:16-35` | Import the primitive |
| 8 | `FinancesPage` keeps an inline ledger row duplicating `LedgerRecordRow`'s geometry | `FinancesPage.tsx:315` vs canonical `LedgerRecordRow.tsx:49-59` | Use the shared row |
| 9 | Two syntaxes for the same font declaration | `font-['Gilroy',sans-serif]` (`ContactUpdateModal.tsx:168`) vs `[font-family:'Gilroy',sans-serif]` everywhere else | Standardize the bracket form |
| 10 | Overview page header lacks the eyebrow + 32px title + description structure used by Inbox and Ledger | `HomePage.tsx:1072-1082` (20px greeting only) vs `InboxPage.tsx:1437-1441`, `FinancesPage.tsx:261-265` | Adopt the Inbox/Ledger header |

### Larger reconciliation — needs shared components or a token pass

| # | Finding | Why it's bigger |
|---|---------|-----------------|
| A | **Adopt the token layer.** ~2,724 hex literals bypass 25 defined tokens | Touches nearly every file; needs a codemod plus agreement on token names |
| B | **Button system.** 250 hand-rolled buttons vs 3 primitive uses; heights 36/45/48px for the same roles | Requires designing real variants (action pill, modal confirm, compact) before migrating |
| C | **Modal shell unification.** Widths 320/375/400/402/480/520px; radii 16/22.5/24px; Radix vs hand-rolled overlays | `AddAccountModal.tsx:352,434,527,629` is non-Radix; `VendorsPanel.tsx:182` has no shell chrome at all |
| D | **RuleDetail panel system.** The most bespoke surface — local copies of panel, header, divider, and row chrome | `RuleDetail.tsx:228,383-410,460-484,769-831` should consume `LedgerWidgets` `WidgetCard` |
| E | **Typography scale.** 16 distinct px sizes in use; 13px (97) vs 14px (230) and 11px (34) vs 12px (156) compete for the same roles | Needs a semantic scale decision before mass edits |
| F | **Missing `leading-` on custom sizes.** Many `text-[Npx]` have no line-height while neighbours set one explicitly | Fixing changes vertical rhythm — must be verified visually per surface |
| G | **Empty-state voice and frame.** Three different tones and two different frames | Needs a copy standard, not just CSS |

---

## 0. Design token drift (own category, per request)

**What exists.** `client/src/index.css:70-103` defines 25 colour variables (18 `brain-v1*`, 2 aliases, 4 `shared-colors*`, `--white`), one typography variable (`subheading-2x-small`: Gilroy, 11px/500/0.22px/12px), and the shadcn HSL set at `:216-280` including `--radius: 0.5rem`. Fonts loaded: Gilroy (100-900 + italic 900) at `:7-17`, Gridular at `:19-26`, JetBrains Mono at `:28-44`. `tailwind.config.ts:9-69` exposes all colour vars; `:70-82` declares font families; `:83-87` declares radius aliases.

**Actual usage.** Effectively zero. Every Figma token except three appears only at its own definition. CSS variables are never consumed via `var()` in TSX.

**Duplicates — hardcoded hex where a token already exists** (occurrence counts across `client/src`):

| Hex | Token | Count |
|-----|-------|-------|
| `#6c779d` | `--brain-v1baby-blue-60` | 493 |
| `#1d2132` | `--brain-v1stroke-2` | 347 |
| `#a8b9f4` | `--brain-v1baby-blue-100` | 326 |
| `#7631ee` | `--brain-v1purple` | 230 |
| `#0a0c10` | `--brain-v1highlight-dropdown-bg` | 176 |
| `#222737` | `--brain-v1baby-blue-15` | 163 |
| `#414965` | `--brain-v1baby-blue-30` | 149 |
| `#d20344` | `--brain-v1pink-red` | 90 |
| `#42bf23` | `--brain-v1green` | 80 |
| `#11141b` | `--brain-v1baby-blue-5` | 74 |
| `#ff9500` | `--brain-v1light-orange` | 65 |
| `#4a2300` | `--brain-v1dark-orange` | 61 |
| `#240757` | `--brain-v1dark-purple` | 51 |
| `#350011` | `--brain-v1dark-pink-red` | 49 |
| `#ff9400` | *(no token — 1-channel drift from `#ff9500`)* | 38 |
| `#123509` | `--brain-v1dark-green` | 38 |
| `#06070a` | `--brain-v1headerfooterbg` | 17 |
| `#12032d` | `--brain-v1dark-dark-purple` | 12 |

`index.css:56,62` itself repeats `#222737` despite defining the token. Inline `style` attributes also bypass Tailwind entirely (`LedgerWidgets.tsx:12`, `FilterChipRow.tsx:54`).

**Radius is untokenized in practice.** Theme radius is `0.5rem` (Tailwind `sm`=4, `md`=6, `lg`=8), but surfaces hardcode 8/12/16/22/22.5/24/100/400px (`SettingsPage.tsx:204,215,307`; `RuleDetail.tsx:228,383,519`; `FilterChipRow.tsx:53,70`; `LedgerWidgets.tsx:34`).

**Most drift-concentrated files:** `settings/DevelopersSection.tsx`, `VendorDetailPopup.tsx`, `ProposalDetail.tsx`, `RulesPanel.tsx`, `RuleDetail.tsx`, `ProposalCardParts.tsx`, `BrainAssistant.tsx`.

**Recommendation:** Adopt the Tailwind token classes (`text-brain-v1baby-blue-60` etc.) as the standard, promote the de-facto radius values (12px rows, 16px panels, 24px dialogs, 100px pills) into named tokens, and delete `#ff9400`.

---

## 1. Typography

**Font stacks.** The intended UI font is Gilroy — `index.css:6-17` labels it the primary UI face and custom surfaces set it explicitly (`RecordPill.tsx:26`, `FilterChipRow.tsx:77`, `ProposalCardParts.tsx:133`). Numeric/identifier data uses JetBrains Mono (`TransactionDetailPopup.tsx:156,187,229`; `ProposalCardParts.tsx:269,448`). Gridular is reserved for the wordmark (`index.css:19-26`).

**The drift:** Tailwind's `font-sans` — the default for anything that doesn't opt in — is **Plus Jakarta Sans**, not Gilroy (`tailwind.config.ts:70-81`). So every shadcn primitive renders in a different typeface than the surrounding app: `ui/textarea.tsx:12`, `ui/drawer.tsx:87,101`, `ui/table.tsx:12,46,76,102` set sizes but no stack. `HomePage.tsx:1078-1082` also relies on the inherited font rather than declaring Gilroy.
**Standard:** Gilroy for UI, JetBrains Mono only for amounts and identifiers. Either change Tailwind's `sans` default to Gilroy or make every primitive declare it.

**Size scale.** Distinct sizes found, with approximate counts:
`9px(1) · 10px(16) · 11px(34) · 12px(156) · 13px(97) · 14px(230) · 15px(27) · 16px(221) · 18px(24) · 20px(72) · 22px(8) · 24px(3) · 26px(3) · 28px(3) · 32px(13) · 40px(4)` plus anomalies `16.88px(4) · 18.75px(2) · 20.625px(2) · 0px(3) · 0.8rem(1)`. Utility classes: `text-xs`(20), `text-sm`(59), `text-base`(2), `text-lg`(4), `text-2xl`(1).

Near-duplicates competing for the same role: **13px vs 14px** and **11px vs 12px**. Detail popups pair 12px labels with 13px values (`detailPopup.tsx:59-64`; `AccountDetailPopup.tsx:86-91`; `ProposalDetail.tsx:749-755,783-787`) while comparable row labels elsewhere use 14px.
**Standard:** 16px row titles · 14px labels and body · 12px compact metadata and badges · 13px only for dense description text · 11px only for pills.

**Weights.** Same role, different weight: `ProposalCardParts.tsx:411` uses 16px semibold for a row title, `TierRowList.tsx:220` uses 16px **medium** for the same concept. At 14px, `ProposalCardParts.tsx:46` is semibold and `:383` is medium.
**Standard:** semibold (600) for titles and labels; medium (500) for explanatory body.

**Line height.** 14px text appears with `leading-14`, `-16`, `-18`, and `-20` across the app. Many custom sizes set no `leading-` at all and inherit `normal` while their neighbours pin one — `GlobalSearch.tsx:44` sets 14px/20px but its own result rows at `:221-279` set none; also `ContactUpdateModal.tsx:168-169`, `ProposalCardParts.tsx:176,269,328,383`, `PayableDetailPopup.tsx:130`.
**Standard:** every custom size declares leading — 12→16, 13→16, 14→20, 16→20/24.

**Letter spacing.** Almost absent: one `tracking-[0.4px]` for a 12px uppercase header (`TierRowList.tsx:274`), against shadcn's `tracking-tight` (`ui/drawer.tsx:87`) and `tracking-widest` (`ui/menubar.tsx:230`).
**Standard:** 0.4px for compact uppercase labels; avoid arbitrary tracking elsewhere.

---

## 2. Colour

**Status semantics are mostly sound.** Green `#42bf23` on `#123509` consistently means active/trusted/success (`RuleDetail.tsx:217`, `RulesPanel.tsx:169-170,240-241`, `VendorDetailPopup.tsx:298,319`). Red `#d20344` on `#350011` consistently covers destructive, error, and urgent (`RuleDetail.tsx:371`, `VendorsPanel.tsx:75`, `TierRowList.tsx:31`, `ProposalCardParts.tsx:325`) — worth documenting as one shared meaning rather than splitting into a separate urgent token.

**The exception is orange.** Same warning meaning, two text colours: `#ff9400` (`HomePage.tsx:1210`, `RulesPanel.tsx:979`, `RuleDetail.tsx:221`, `VendorsPanel.tsx:75,685,765`) vs the canonical `#ff9500` (`SettingsPage.tsx:536-550`, `DevelopersSection.tsx:1593`).

**Near-duplicates to collapse:**
- Hover greys — `#2a3040` / `#2a3046` / `#2c3247` / `#2b3145` (see quick win 3).
- Orange hovers — `#5a2d00`, `#5a2b00`, `#5a2c00`, plus `#3a2600` / `#3a2500` / `#2a2010`. Standardize base `#4a2300`, hover `#5a2d00`.
- Purple hovers — `#2e0a6b` vs `#2e0a6e`; `#8442f5` vs `#8a4bf5`. Standardize one pair against base `#7631ee`.
- `#11141b` vs `#0a0c10` are **both legitimate** (distinct tokens: card surface vs dropdown/highlight) — do not merge; define which role gets which. `RulesPanel.tsx:127,151` uses `#0a0c10` card with `#11141b` hover, while `VendorsPanel.tsx:184` uses `#11141b` as a base background.

**Contrast risks:**
- `#6c779d` (493 uses) carries body copy, placeholders, icons, and button labels on `#0a0c10`/`#11141b`. It is marginal for small text — avoid it for essential status detail; promote to `#a8b9f4`.
- **Compounded disabled states are the real problem:** muted `#6c779d` text combined with `disabled:opacity-40` (`VendorDetailPopup.tsx:740-757`, `ProposalCardParts.tsx:549-559`, `DevelopersSection.tsx:831-843,1607-1619`, `HomePage.tsx:1201`, `VendorsPanel.tsx:752`) drops effective contrast to roughly 16% — functionally invisible. Use ~0.5-0.6 opacity with a brighter base, or a dedicated disabled token.
- `#414965` (token: baby-blue-30, a *border* value) is used for readable text — policy ID at `RuleDetail.tsx:187` and an empty-state heading at `RulesPanel.tsx:96`. Reserve it for borders.

---

## 3. Spacing & layout

**No spacing scale is defined** — only radius aliases exist in the theme. Values are typed per call site, so off-scale numbers accumulate.

**Off-scale outliers:** `DeleteConfirmDialog.tsx:59,64,77,84,89,99` (0.938px border, 22.5px radius, 30px padding, 15px/20px gaps) · `HomePage.tsx:1165` (`gap-[26px]`) · `TierRowList.tsx:270,341` (10px, 26px) · `RulesPanel.tsx:934,990` (6px, 10px) · `BrainAssistant.tsx:754,825` (7px insets) · `NavigationMenuSection.tsx:263` (`px-[7px]`).
**Standard:** a 4/8/16/24/32 ladder; 7px and 10px insets become 8px.

**Same concept, different internal padding:**
- `Callout` — `:99` is `px-16 py-12 rounded-8`, `:132` is `p-8 rounded-12`. One component, two geometries. Also `:99` centres its icon while `:135` top-aligns it.
- Overview card headers use `py-[14px]` against 16px bodies (`HomePage.tsx:225-232,282`).
- Empty rows use `py-[20px]` where normal rows use 16px (`TierRowList.tsx:330`).
- Footer action buttons: `px-[20px]` (`ProposalCardParts.tsx:549,559`) vs `px-[12px]` (`HomePage.tsx:1201`, `RulesPanel.tsx:970`) for the same role.
- Detail rows are consistent at `px-12 py-8` (`detailPopup.tsx:58,63`; `VendorDetailPopup.tsx:133,138`) — keep this as the standard.

**Vertical rhythm by surface:** Overview runs 40/16/12px (`HomePage.tsx:1072,1096,1102,1160`); Rules runs 10/16/8px (`RulesPanel.tsx:990,1002,1034`); Settings runs a clean 4/8/16 ladder (`SecuritySection.tsx:137,143-145`); Ledger mixes 4px metadata stacks (`PayablesTab.tsx:215`) with 8px widget rhythm (`LedgerWidgets.tsx:16`). **Settings' 4/8/16 ladder is the best existing model** — promote it, with 32px between major sections.

**Radius by concept:** cards 16px (`HomePage.tsx:225,282`; `SecuritySection.tsx:143`) · rows 12px (`RulesPanel.tsx:1014,1042,1072`; `TierRowList.tsx:287`) · callouts 8px *and* 12px · pills 22px (`RecordPill.tsx:26`; `detailPopup.tsx:122`) · modals 24px (`detailPopup.tsx:183`) and 22.5px (`DeleteConfirmDialog.tsx:59`).
**Standard:** cards 16 · rows 12 · callouts 12 · pills 9999 · modals 24.

---

## 4. Buttons & interactive elements

**Inventory:** 250 native `<button>` elements against **3** uses of `ui/button.tsx`. The primitive defines default/destructive/outline/secondary/ghost/link variants at heights 36/32/40px (`ui/button.tsx:6-27`) — none of which match the hand-rolled sizes in use.

**Same role, different size:**
- Action pills: `HomePage.tsx:164-170` is `px-10 py-4 gap-2`; `RuleDetail.tsx:234-243,248-255` is `px-12 py-8 gap-4`. Both are radius-100 pill actions.
- Modal confirm/cancel: `DeleteConfirmDialog.tsx:85-100` and `RuleDetail.tsx:359-371` are `w-150 h-45 px-22.5 text-16.88`; the Resume modal at `RuleDetail.tsx:303-315` is `flex-1 px-24 py-12 text-18` with no fixed height; `VendorsPanel.tsx:748-765` is `flex-1 h-36 px-12 text-16`. Three geometries for one job.
**Standard:** 36px compact controls, 45px×150px fixed modal buttons, 12px horizontal padding, 12px semibold labels for pills.

**Destructive styling:** base colours are consistent (`#350011` / `#d20344`) across `DeleteConfirmDialog.tsx:94-100`, `RuleDetail.tsx:248-255,367-373`, and `NavigationMenuSection.tsx:334-336,430-444`. **Hover is not** — opacity, concrete background, or nothing at all.

**States:** the primitive guarantees `disabled:pointer-events-none disabled:opacity-50`; hand-rolls vary between `.4 cursor-wait`, `.4 cursor-not-allowed`, and no disabled styling (`DeleteConfirmDialog.tsx` cancel). Hover models also mix within the sidebar itself — `hover:opacity-90` at `:367-380,405-417` vs a concrete `rgba(168,185,244,0.08)` background at `:314-326`. `BrainAssistant.tsx:1049-1053` has only `hover:underline`, which reads as a text link (likely intentional).

**Icon-to-label gaps:** 2px (`HomePage.tsx:169`), 4px (`RuleDetail.tsx:238,252`), 8px (`NavigationMenuSection.tsx:369,433`; `ProposalCardParts.tsx:515,549,559`).
**Standard:** 8px, with 4px reserved for compact 12px pills.

---

## 5. Components & patterns

**Primitives that exist but get bypassed:**
- `Callout.tsx:109-133` defines the shared notice. `RulesPanel.tsx:1014-1018,1042-1046,1072-1076` hand-rolls three policy notices with 12px padding and a bespoke purple `#240757` + `rgba(118,49,238,0.2)` border instead.
- `CountPill.tsx:16-35` vs the inline copy at `FilterChipRow.tsx:82-86`. `RulesPanel.tsx:898` adds a third badge shape (`px-8 py-2 rounded-100 text-10`).
- `RecordPill.tsx:25-32` (radius 22, `px-8 py-2`, 12px) vs `ProposalCardParts.tsx:164-165` (`px-12 py-4`) and `RuleDetail.tsx:519-530` (`px-10 py-4`, 14px).
- Card family splits between `bg-[#0a0c10] border-[#1d2132] rounded-[12px]` (`ProposalCardParts.tsx:252,309,420`) and borderless `rounded-[16px]` (`HomePage.tsx:225-235`; `VendorsPanel.tsx:282-283`).

**Modal shells.** The strongest existing standard is the detail popup family: Radix Content, `#11141b`, `#1d2132` border, radius 24, 480px, `shadow-[0_24px_60px_rgba(0,0,0,0.6)]`, overlay black/60 + 2px blur (`AccountDetailPopup.tsx:151-152`; `VendorDetailPopup.tsx:246-247`; `TransactionDetailPopup.tsx:130-131`). Divergences: `AuditRecordPopup.tsx:192` at 520px · `ContactUpdateModal.tsx:296-299` and `SecurityModals.tsx:401-403` at 400px · `AddAccountModal.tsx:189,352,434,527,629` non-Radix at 320/402px · `VendorsPanel.tsx:182` a Radix Content with **no shell chrome at all**. `DeleteConfirmDialog` (375px / 22.5px) is a deliberate compact variant — keep it, but align its border to 1px and radius to 24.

**Empty states — three different voices:**
- Reassuring: "Nothing needs your review right now." (`HomePage.tsx:1218-1224`), "Nothing needs your attention right now. Brain is keeping things moving." (`InboxPage.tsx:1430`)
- Factual: "Nothing outstanding. You have no unpaid bills or payroll on record." (`PayablesTab.tsx:140`), "Nothing outstanding. No unpaid customer invoices on record." (`ReceivablesTab.tsx:114`)
- Technical: "Nothing could be loaded, so there is nothing to show here yet." (`CashFlowTab.tsx:372`)
- Action-oriented: "No automated rules yet. Create one..." (`RulesPanel.tsx:1031,1061`) vs bare "Nothing yet." (`:1090`)

Frames differ too: `UnavailableDataBox` is radius 8 / `px-16 py-12` (`Callout.tsx:88-105`) while the list empty state is radius 12 / `px-16 py-20` (`TierRowList.tsx:324-335`).
**Standard:** one frame geometry; keep the tonal split meaningful — "Nothing…" for genuinely empty, "couldn't load" for unavailable — and always pair state with next action. `VendorsPanel.tsx:95,139,944` currently mixes status labels, data-empty, and queue-empty language.

**Section headers.** Ledger has the full hierarchy — 20px muted eyebrow + 32px title + 16px description (`FinancesPage.tsx:263-265`). Inbox has the eyebrow and title (`InboxPage.tsx:1437-1441`). Overview has only a 20px greeting (`HomePage.tsx:1078-1082`). Rules and Vendors use 12px uppercase tracked labels (`RulesPanel.tsx:990-996`; `VendorsPanel.tsx:904`). Rule Detail uses a one-off 26px title (`RuleDetail.tsx:177,735`).
**Standard:** 20px eyebrow + 32px page title; 12px uppercase for subsections only.

---

## 6. Cross-page drift

1. **Page headers** — Inbox and Ledger share `pt-40 px-16 gap-40` with eyebrow/title/description; Overview should adopt it.
2. **Tab bar** — `FinancesPage.tsx:269-304` is the only true `role="tablist"` (orange active pill, `#1d2132` bottom border). It should be the standard for page tabs. `FilterChipRow` correctly stays `role="group"` — do **not** convert filters into tabs.
3. **Ledger rows are the success story** — `LedgerRecordRow.tsx:49-59` is consumed by all three tabs (`PayablesTab.tsx:163`, `ReceivablesTab.tsx:123`, `CashFlowTab.tsx:423`). Outstanding: the inline duplicate at `FinancesPage.tsx:315`, and summary rows at `PayablesTab.tsx:106,126,135,212` / `CashFlowTab.tsx:363,378` that drop the border.
4. **Panel containers** — canonical is `WidgetCard` (`LedgerWidgets.tsx:23-39`: `#0a0c10`, `#1d2132` border, radius 16). Independently re-implemented at `SettingsPage.tsx:204,614` and `RuleDetail.tsx:383-410,460-484`. `RulesPanel.tsx:759` uses `#11141b` instead; `:786` uses `#12032d` (acceptable only as a deliberate highlight). `DevelopersSection.tsx:877,960` omits the border.
5. **RuleDetail** is the most bespoke surface — local panel, header (`px-16 py-14`), divider, and row implementations at `:228`, `:383-410`, `:769-831`. `RulesPanel.tsx:151,187,224` separately re-creates ledger row chrome.
6. **Settings one-offs** — local `Section` (`SettingsPage.tsx:204`), `Divider` (`:211`), and row (`:252`, hover `#0d1018`, a colour used nowhere else). `DevelopersSection.tsx:723-774` repeats bordered event rows; `:803,824` introduces a `backdrop-blur-10` sticky footer with no counterpart elsewhere — fine as a footer, not as general panel chrome.
7. **Assistant and sidebar are separately branded** — `BrainAssistant.tsx` (39 raw core-colour occurrences) and `NavigationMenuSection.tsx` (22) share no panel primitive with the rest of the app.

---

## Suggested sequence

1. **Delete `#ff9400`, round the fractional values, collapse the four hover greys, unify destructive hover and disabled states.** Pure find-and-replace, immediately visible, no structural risk.
2. **Import the primitives that already exist** — `CountPill` into `FilterChipRow`, `LedgerRecordRow` into `FinancesPage`, `Callout` into `RulesPanel`.
3. **Decide the scales** — type ramp, spacing ladder, radius-by-concept — and record them as tokens.
4. **Extract shared shells** — panel/`WidgetCard`, modal, and a real button variant set — then migrate RuleDetail, Settings, Assistant, and the sidebar onto them.

Steps 1-2 are safe to do incrementally. Steps 3-4 change vertical rhythm and should be verified surface by surface.
