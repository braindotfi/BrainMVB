import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight } from "lucide-react";
import closeIcon from "@assets/Close_1783293571882.png";
import { ICONS } from "@/assets/figma-icons";
import { useCurrency } from "@/lib/useCurrency";
import { AlertCallout } from "@/components/Callout";
import { CardActions } from "@/components/ProposalCardParts";
import { useCardTransition } from "@/lib/cardTransition";

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
  <div className="bg-brain-v1highlight-dropdown-bg flex flex-col h-[58px] items-start p-[12px] rounded-panel w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1baby-blue-30 text-[12px] whitespace-nowrap">{label}</p>
    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-100 text-[14px] whitespace-nowrap">{value}</p>
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
      "overflow-clip relative size-[20px] shrink-0 rounded-[4px] border border-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple " +
      (checked
        ? "bg-brain-v1dark-purple border-[rgba(118,49,238,0.2)]"
        : "bg-brain-v1headerfooterbg border-brain-v1baby-blue-15")
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
  onPrev,
  onNext,
  pagerDisabled = false,
  hasPrev,
  hasNext,
  pagerStep,
  busy = false,
  rejection = null,
}: {
  item: ReviewItemType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (auto: boolean) => void;
  onReject: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
  /** Per-direction state, for a pager walking one shared list of mixed record
   *  kinds: at the first row Previous is dead while Next is not, and a single
   *  `pagerDisabled` cannot say that. Defaults to `pagerDisabled` for callers
   *  that still page within one uniform queue. */
  hasPrev?: boolean;
  hasNext?: boolean;
  /** True when this surface was opened by a Previous/Next step rather than by
   *  the user picking a record. Skips the entrance animation — see
   *  useCardTransition. */
  pagerStep?: boolean;
  /** True while a real approve/decline call to brain-core is in flight. */
  busy?: boolean;
  /** brain-core's refusal, mapped to user copy. Rendered inline (danger tone). */
  rejection?: { title: string; detail: string; reason: string } | null;
}) => {
  const [auto, setAuto] = useState(false);
  const { format, formatText } = useCurrency();
  const transition = useCardTransition(open, pagerStep);
  const swap = (s: string) => s.replace(/\$[\d,]+(?:\.\d+)?/g, m => format(m));
  const hasPager = Boolean(onPrev && onNext);
  const prevDisabled = hasPrev === undefined ? pagerDisabled : !hasPrev;
  const nextDisabled = hasNext === undefined ? pagerDisabled : !hasNext;

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
          className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] ${transition.overlay}`}
          data-testid="review-modal-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby="review-modal-description"
          className={`fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none ${transition.card}`}
          data-testid="review-modal"
        >
          {/* Title bar, Figma 4062:65550. Border on all sides per
              Figma; only the bottom is visible due to outer
              overflow-clip + rounded-modal. */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-[calc(50%-12px)] [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-100 text-[20px] text-center whitespace-nowrap">
              Review Details
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-review-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto">
            {/* Question + Description block, Figma 4062:65560,
                gap-8, description #6c779d (Baby Blue 60). */}
            <div className="flex flex-col gap-[8px] items-start w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-100 text-[20px] w-full">
                {swap(item.question)}
              </p>
              <div className="flex items-center w-full">
                <DialogPrimitive.Description
                  id="review-modal-description"
                  className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px]"
                >
                  {formatText(item.description)}
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
                <span className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px]">
                  {item.autoLabel}
                </span>
              </label>
            </div>

            {/* Real (live) PaymentIntent: approving asks brain-core to sign it off.
                We do NOT pre-gate. Core is the sole enforcer. If it refuses, its
                exact reason is rendered below (danger tone); otherwise a neutral note. */}
            {item.live && !rejection && (
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-brain-v1baby-blue-60 text-[13px] w-full">
                This is a real payment. Approving asks Brain core to sign it off under your approval
                authority. It will only settle if core accepts it.
              </p>
            )}

            {/* brain-core refusal: the honest, verbatim reason (self-approval, over
                limit, second approver needed, signer revoked, …). Danger color only. */}
            {rejection && (
              <AlertCallout
                testId={`review-rejection-${rejection.reason}`}
                title={rejection.title}
              >
                {rejection.detail}
              </AlertCallout>
            )}

            {/* Action row, Figma 4071:65833. Confirm + Decline, under the same
                full-width rule every other record card closes with. */}
            <CardActions testId="divider-review-actions">
              <div className="flex gap-[16px] items-start w-full">
              <button
                onClick={() => onConfirm(auto)}
                disabled={busy}
                data-testid="button-review-confirm"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-pill bg-brain-v1dark-green hover:bg-brain-v1dark-green-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1green disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-brain-v1dark-green"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1green text-[16px] whitespace-nowrap">{busy ? "Working…" : item.live ? "Approve" : "Confirm"}</span>
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                data-testid="button-review-reject"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-pill bg-brain-v1dark-pink-red hover:bg-brain-v1dark-pink-red-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1pink-red disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1pink-red text-[16px] whitespace-nowrap">Decline</span>
              </button>
              </div>
            </CardActions>

            {hasPager && (
              <div className="border-t border-brain-v1stroke-2 pt-[16px] flex gap-[16px] items-center w-full">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={prevDisabled}
                  aria-label="Previous record"
                  data-testid="button-review-prev"
                  className="flex flex-1 items-center justify-center gap-[8px] px-[20px] py-[8px] rounded-pill bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-15-hover transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-60 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                >
                  <ArrowLeft size={18} />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={nextDisabled}
                  aria-label="Next record"
                  data-testid="button-review-next"
                  className="flex flex-1 items-center justify-center gap-[8px] px-[20px] py-[8px] rounded-pill bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-15-hover transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-60 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                >
                  Next
                  <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
