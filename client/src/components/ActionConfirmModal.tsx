import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import approvedIcon from "@assets/action_icons/approved.png";
import postponedIcon from "@assets/action_icons/postponed.png";
import rejectedIcon from "@assets/action_icons/rejected.png";

/* ─── Action-confirmation pop-up (Figma 5773:66469 / 5734:82359 / 5787:65369) ───
   Centered card that auto-dismisses after 2 s. Used after tapping approve /
   postpone / reject on a ProposalDetail or live PaymentIntent sheet.

   CRITICAL: the modal is pure display — the timer and callback live in the
   useActionConfirm hook so that manual dismiss (Escape / overlay click)
   cancels WITHOUT executing the callback. Only the timer-complete path runs
   the callback.                                                         */

export type ConfirmAction = "approve" | "postpone" | "reject";

const CONFIG: Record<ConfirmAction, { icon: string; title: string; titleColor: string; body: string }> = {
  approve: {
    icon: approvedIcon,
    title: "Approved",
    titleColor: "#42bf23",
    body: "The payment has been approved and will be processed.",
  },
  postpone: {
    icon: postponedIcon,
    title: "Postponed",
    titleColor: "#a8b9f4",
    body: "The payment has been postponed. You can review it later.",
  },
  reject: {
    icon: rejectedIcon,
    title: "Rejected",
    titleColor: "#d20344",
    body: "The payment has been rejected.",
  },
};

export function ActionConfirmModal({
  action,
  open,
  onOpenChange,
}: {
  action: ConfirmAction;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const cfg = CONFIG[action];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-testid={`modal-confirm-${action}`}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[60] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[#1d2132] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          style={{
            background: "#0a0c10",
            boxShadow:
              "0px 68px 13.5px rgba(0,0,0,0.06), 0px 38px 11.5px rgba(0,0,0,0.2), 0px 17px 8.5px rgba(0,0,0,0.34), 0px 4px 4.5px rgba(0,0,0,0.39)",
          }}
        >
          <Dialog.Title className="sr-only">{cfg.title}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {cfg.title} — {cfg.body}
          </Dialog.Description>

          <div className="flex gap-[16px] items-start p-[16px]">
            <img
              src={cfg.icon}
              alt=""
              aria-hidden="true"
              className="shrink-0 size-[24px] rounded-full object-cover"
            />
            <div className="flex flex-col flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-medium text-[16px]">
              <p
                data-testid={`confirm-title-${action}`}
                className="leading-[24px] w-full"
                style={{ color: cfg.titleColor }}
              >
                {cfg.title}
              </p>
              <p
                data-testid={`confirm-body-${action}`}
                className="leading-[20px] w-full text-[#6c779d]"
              >
                {cfg.body}
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* Hook: manages the 2 s dwell timer.
   - showConfirm starts the timer and stores the callback in a ref.
   - When the timer fires, the callback executes and state clears.
   - onCancel clears the timer and ref WITHOUT executing the callback
     (called when the user manually dismisses via Escape / overlay). */
export function useActionConfirm() {
  const [confirm, setConfirm] = useState<{ action: ConfirmAction } | null>(null);
  const onDoneRef = useRef<(() => void) | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showConfirm = useCallback((action: ConfirmAction, onDone?: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onDoneRef.current = onDone;
    setConfirm({ action });
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setConfirm(null);
      onDoneRef.current?.();
      onDoneRef.current = undefined;
    }, 2000);
  }, []);

  const onCancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    setConfirm(null);
    onDoneRef.current = undefined;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    confirm,
    showConfirm,
    onCancel,
  };
}
