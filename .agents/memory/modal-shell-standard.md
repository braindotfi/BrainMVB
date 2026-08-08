---
name: Modal shell standard
description: Canonical modal spec, width variants, and traps found during the modal convergence pass
---

## The standard

| property | value |
|---|---|
| overlay | `bg-black/60 backdrop-blur-[2px]` — NOT `backdrop-blur-sm` |
| background | `bg-brain-v1baby-blue-5` (#11141b) — NOT `bg-brain-v1highlight-dropdown-bg` or `#0a0c10` |
| border | `border border-brain-v1stroke-2 border-solid` |
| radius | `rounded-modal` (24px) |
| shadow | `shadow-[0_24px_60px_rgba(0,0,0,0.6)]` |
| title bar | `h-[56px] backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-brain-v1stroke-2` |
| all modals | use Radix Dialog (`DialogPrimitive.Root/Portal/Overlay/Content`) — no hand-rolled div overlays |

## Width variants

| name | px | applies to |
|---|---|---|
| standard | 480 | detail popups (account/bill/transaction/vendor/audit/proposal/agent) |
| form | 400 | form dialogs (contact update, billing, security, goals) |
| compact | 375 | confirm only (DeleteConfirmDialog) |

## Known traps

**AgentProposalModal was missed in the initial explorer survey.** When auditing modals, always grep for `w-\[NNNpx\]` directly rather than relying on a list. The inbox opens `AgentProposalModal` (data-testid `live-proposal-modal`) for proposal rows, not AuditRecordPopup.

**`backdrop-blur-sm` ≠ `backdrop-blur-[2px]`.** Three form-modal shells (BillingModals, ContactUpdateModal, SecurityModals) had `blur-sm` which visually differs. Always check the blur value.

**SecurityModals had `#0a0c10` (too dark) not `#11141b`.** Any new shell that uses an inline `style={{ background: ... }}` needs the correct hex.

**AddAccountModal wizard pattern.** Multi-step wizard (4 steps, each was a full `fixed inset-0` return) migrates to Radix by: computing `stepContent` via an IIFE before the return, then a single `DialogPrimitive.Root` wrapping the content. The `QRPopup` (absolute inset-0) and `AccountPopup` (fixed inset-0 z-[60]) sub-panels continue to work because they're DOM children of the Radix Content portal.

**Why:** DetailPopupShell in `detailPopup.tsx` is the shared shell; it gained a `widthClass` prop. CLAUDE.md "Modal shell standard" section is the authoritative reference.

**How to apply:** Any new modal → pick a variant from the width table, use DetailPopupShell or the closest local shell, add a `DialogPrimitive.Description` (may be sr-only), verify focus trap + overlay + Esc before shipping.
