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

**AddAccountModal wizard pattern.** Multi-step wizard (4 steps, each was a full `fixed inset-0` return) migrates to Radix by: computing `stepContent` via an IIFE before the return, then a single `DialogPrimitive.Root` wrapping the content. The `QRPopup` (`absolute inset-0`) sub-panel is genuinely unaffected — it stays scoped to its own positioned ancestor either way. **`AccountPopup` (`fixed inset-0 z-[60]`) is NOT unaffected** — this is a trap, not a "just works": `DialogPrimitive.Content` carries `translate-x-[-50%] translate-y-[-50%]`, and any non-`none` CSS `transform` establishes the containing block for `position: fixed` descendants (CSS Transforms §3). Combined with `overflow-hidden` on Content, `AccountPopup`'s `fixed inset-0` is scoped to and clipped by the modal box, not the viewport — it does NOT cover the page. The visible consequence: a click meant to land on the `fixed inset-0` backdrop outside that clipped box instead falls through to Radix's own overlay, hits `onPointerDownOutside`, and closes the whole dialog. If a sub-panel needs true viewport coverage inside a transformed Radix Content, it can't use `fixed` — render it via a nested `createPortal` to `document.body`, or restructure it as `absolute` sized to the modal.

**Why:** DetailPopupShell in `detailPopup.tsx` is the shared shell for the standard (480px) width; its width is fixed, not a prop, so the mobile clamp can't be dropped by a caller. CLAUDE.md "Modal shell standard" section is the authoritative reference (also tracks holdouts not yet converged).

**How to apply:** Any new modal → pick a variant from the width table, use DetailPopupShell (standard/480 only) or the closest local shell for form/compact widths, add a `DialogPrimitive.Description` (may be sr-only), verify focus trap + overlay + Esc before shipping.
