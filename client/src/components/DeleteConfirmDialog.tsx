import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";

/**
 * DeleteConfirmDialog — standalone confirmation modal matching the compact
 * confirmation frame used for Delete Vendor and Remove Source.
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
 * cancelLabel   — left neutral button ("Cancel", etc.)
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

        {/* Card — updated Figma frame: 375px wide, 22px radius, 1px border. */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] bg-brain-v1highlight-dropdown-bg border-[1px] border-solid border-brain-v1stroke-2 flex flex-col items-start overflow-hidden rounded-modal w-[375px] max-w-[calc(100vw-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* ── Title and Controls — h-[52px], border-b ── */}
          <div className="bg-brain-v1highlight-dropdown-bg border-b-[1px] border-solid border-brain-v1stroke-2 h-[52px] relative shrink-0 w-full">
            <DialogPrimitive.Title asChild>
              <p className="-translate-x-1/2 absolute [font-family:'Gilroy',sans-serif] font-semibold leading-[22px] left-1/2 text-brain-v1baby-blue-100 text-[18px] text-center top-[calc(50%-11px)] whitespace-nowrap">
                {title}
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[11px] top-1/2 -translate-y-1/2 size-[30px] p-0 rounded-pill hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
              data-testid="button-close-delete-confirm-dialog"
            >
              <img src={closeIcon} alt="" className="size-[30px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          {/* ── Body — p-[30px], gap-[20px] ── */}
          <div className="flex flex-col gap-[20px] items-start p-[30px] w-full">
            {/* Figma: font-medium, 20px/26px. #414965 raised to #a8b9f4 — body copy must be readable. */}
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[26px] text-brain-v1baby-blue-100 text-[20px] w-full">
              {body}
            </p>

            {/* Buttons — fixed 150px width, gap-[15px], 16px/22px semibold. */}
            <div className="flex gap-[15px] items-center w-full">
              <button
                type="button"
                onClick={onCancel}
                data-testid={cancelTestId}
                className="flex shrink-0 h-[45px] items-center justify-center px-[22px] rounded-pill hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[16px] leading-[22px] w-[150px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                style={{ background: "#222737" }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                data-testid={confirmTestId}
                className="flex shrink-0 h-[45px] items-center justify-center px-[22px] rounded-pill bg-brain-v1dark-pink-red hover:bg-brain-v1dark-pink-red-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1pink-red text-[16px] leading-[22px] w-[150px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1pink-red"
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
