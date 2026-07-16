import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import { ICONS } from "@/assets/figma-icons";
import { useCurrency } from "@/lib/currencyContext";

export type ReviewItemType = {
  id: number | string;
  title: string;
  vendor?: string;
  amount: string;
  due: string;
  question: string;
  description: string;
  who: string;
  amountFull: string;
  dueBy: string;
  from: string;
  autoLabel: string;
  /** True for a real brain-core PaymentIntent awaiting approval (vs a static demo item). */
  live?: boolean;
  /** The PaymentIntent id, when `live`. Used to decline via the BFF. */
  intentId?: string;
};

/* InfoCell — Figma 4062:65566 et al.
   bg #0a0c10 (Highlight Dropdown BG), p-12, radius 16, h-58.
   Label  text-12 leading-14 #414965 (Baby Blue 30) Gilroy SemiBold.
   Value  text-14 leading-20 #a8b9f4 (Baby Blue 100) Gilroy Medium. */
const InfoCell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-[#0a0c10] flex flex-col h-[58px] items-start p-[12px] rounded-[16px] w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#414965] text-[12px] whitespace-nowrap">{label}</p>
    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] whitespace-nowrap">{value}</p>
  </div>
);

/* Checkbox, Figma 47:10802 (inactive) / 47:10808 (active).
   Inactive: bg #06070a, border #222737.
   Active:   bg #240757, border rgba(118,49,238,0.2), purple checkmark
             rendered from the Figma SVG, inset-[20%] w/ inner inset
             [0_-25%_-58.33%_-33.33%] (matches Figma layout). */
const FigmaCheckbox = ({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) => (
  <button
    type="button"
    role="checkbox"
    id={id}
    aria-checked={checked}
    data-state={checked ? "checked" : "unchecked"}
    data-testid="checkbox-review-auto"
    onClick={() => onChange(!checked)}
    className={
      "overflow-clip relative size-[20px] shrink-0 rounded-[4px] border border-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] " +
      (checked
        ? "bg-[#240757] border-[rgba(118,49,238,0.2)]"
        : "bg-[#06070a] border-[#222737]")
    }
  >
    {checked && (
      <div className="absolute inset-[20%]">
        <div className="absolute inset-[0_-25%_-58.33%_-33.33%]">
          <img alt="" className="block max-w-none size-full" src={ICONS.checkbox_checkmark} />
        </div>
      </div>
    )}
  </button>
);

export const ReviewModal = ({
  item,
  open,
  onOpenChange,
  onConfirm,
  onReject,
  busy = false,
  rejection = null,
}: {
  item: ReviewItemType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (auto: boolean) => void;
  onReject: () => void;
  /** True while a real approve/decline call to brain-core is in flight. */
  busy?: boolean;
  /** brain-core's refusal, mapped to user copy. Rendered inline (danger tone). */
  rejection?: { title: string; detail: string; reason: string } | null;
}) => {
  const [auto, setAuto] = useState(false);
  const { format } = useCurrency();
  const swap = (s: string) => s.replace(/\$[\d,]+(?:\.\d+)?/g, m => format(m));

  // Reset the "auto" checkbox whenever the modal opens for a new item
  // or whenever it closes, so prior state doesn't leak between reviews.
  useEffect(() => {
    if (!open) setAuto(false);
  }, [open, item?.id]);

  if (!item) return null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setAuto(false);
        onOpenChange(o);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="review-modal-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby="review-modal-description"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="review-modal"
        >
          {/* Title bar, Figma 4062:65550. Border on all sides per
              Figma; only the bottom is visible due to outer
              overflow-clip + rounded-[24px]. */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-[calc(50%-12px)] [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap">
              Review Details
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-review-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto">
            {/* Question + Description block, Figma 4062:65560,
                gap-8, description #6c779d (Baby Blue 60). */}
            <div className="flex flex-col gap-[8px] items-start w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] w-full">
                {swap(item.question)}
              </p>
              <div className="flex items-center w-full">
                <DialogPrimitive.Description
                  id="review-modal-description"
                  className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]"
                >
                  {item.description}
                </DialogPrimitive.Description>
              </div>
            </div>

            <div className="flex flex-col gap-[24px] items-start w-full">
              <div className="grid grid-cols-2 gap-[8px] w-full">
                <InfoCell label="Who"     value={item.who} />
                <InfoCell label="Amount"  value={format(item.amountFull)} />
                <InfoCell label="Due by"  value={item.dueBy} />
                <InfoCell label="From"    value={item.from} />
              </div>

              {/* Auto-action row, Figma 4071:65830, items-start. */}
              <label
                htmlFor={`review-auto-${item.id}`}
                className="flex gap-[16px] items-start w-full cursor-pointer"
              >
                <FigmaCheckbox
                  id={`review-auto-${item.id}`}
                  checked={auto}
                  onChange={setAuto}
                />
                <span className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
                  {item.autoLabel}
                </span>
              </label>
            </div>

            {/* Real (live) PaymentIntent: approving asks brain-core to sign it off.
                We do NOT pre-gate. Core is the sole enforcer. If it refuses, its
                exact reason is rendered below (danger tone); otherwise a neutral note. */}
            {item.live && !rejection && (
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px] w-full">
                This is a real payment. Approving asks Brain core to sign it off under your approval
                authority. It will only settle if core accepts it.
              </p>
            )}

            {/* brain-core refusal: the honest, verbatim reason (self-approval, over
                limit, second approver needed, signer revoked, …). Danger color only. */}
            {rejection && (
              <div
                data-testid={`review-rejection-${rejection.reason}`}
                className="w-full rounded-[12px] border border-[rgba(210,3,68,0.3)] bg-[rgba(210,3,68,0.08)] p-[14px]"
              >
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#d20344] text-[15px]">
                  {rejection.title}
                </p>
                <p className="mt-1 [font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px]">
                  {rejection.detail}
                </p>
              </div>
            )}

            {/* Action row, Figma 4071:65833. Confirm + Decline. */}
            <div className="flex gap-[16px] items-start w-full">
              <button
                onClick={() => onConfirm(auto)}
                disabled={busy}
                data-testid="button-review-confirm"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#123509] hover:bg-[#174710] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#123509]"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#42bf23] text-[16px] whitespace-nowrap">{busy ? "Working…" : item.live ? "Approve" : "Confirm"}</span>
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                data-testid="button-review-reject"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#350011] hover:bg-[#4a0018] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d20344] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#d20344] text-[16px] whitespace-nowrap">Decline</span>
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
