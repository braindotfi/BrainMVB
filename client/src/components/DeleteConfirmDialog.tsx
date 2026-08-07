import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";

/**
 * DeleteConfirmDialog — standalone confirmation modal matching the Figma
 * "Delete Rule" frame spec (node 6199:70798 / 6239:69251).
 *
 * Renders as a self-contained Dialog overlay so it floats on top of any
 * parent popup, rather than being embedded inline inside it.
 *
 * Props
 * ─────
 * open          — whether the dialog is visible
 * onOpenChange  — called when Radix wants to close (Esc / overlay click)
 * title         — centered header text
 * body          — description paragraph (muted tone)
 * cancelLabel   — left neutral button ("Edit", "Cancel", etc.)
 * confirmLabel  — right destructive button ("Delete", "Remove", etc.)
 * onCancel      — fires when the cancel button is clicked
 * onConfirm     — fires when the destructive button is clicked
 * busy          — disables the confirm button while an action is in flight
 * cancelTestId  — data-testid for the cancel button
 * confirmTestId — data-testid for the confirm button
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy,
  cancelTestId,
  confirmTestId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  cancelTestId?: string;
  confirmTestId?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay — same spec as VendorDetailPopup */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Card — Figma: bg #0a0c10, border #1d2132, rounded-[24px], overflow-clip */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] bg-[#0a0c10] border border-solid border-[#1d2132] flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* ── Title and Controls — h-[56px], border-b ── */}
          <div className="bg-[#0a0c10] border-b border-solid border-[#1d2132] h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title asChild>
              <p className="-translate-x-1/2 absolute [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] left-1/2 text-[#a8b9f4] text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
                {title}
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[11px] top-1/2 -translate-y-1/2 size-[32px] p-0 rounded-[100px] hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              data-testid="button-close-delete-confirm-dialog"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          {/* ── Body — p-[40px], gap-[24px] ── */}
          <div className="flex flex-col gap-[24px] items-start p-[40px] w-full">
            {/* Figma: font-medium, 22px/28px, #414965 */}
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[28px] text-[#414965] text-[22px] w-full">
              {body}
            </p>

            {/* Buttons — gap-[16px], flex-1 each, 18px/24px semibold, px-24 py-12 */}
            <div className="flex gap-[16px] items-center w-full">
              <button
                type="button"
                onClick={onCancel}
                data-testid={cancelTestId}
                className="flex flex-1 min-w-px items-center justify-center px-[24px] py-[12px] rounded-[100px] hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[18px] leading-[24px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                style={{ background: "#222737" }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                data-testid={confirmTestId}
                className="flex flex-1 min-w-px items-center justify-center px-[24px] py-[12px] rounded-[100px] hover:opacity-80 disabled:opacity-40 disabled:cursor-wait transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[#d20344] text-[18px] leading-[24px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d20344]"
                style={{ background: "#350011" }}
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
