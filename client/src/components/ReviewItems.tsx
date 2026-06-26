import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  /** The PaymentIntent id, when `live` — used to decline via the BFF. */
  intentId?: string;
};

export const NEEDS_REVIEW: ReviewItemType[] = [
  {
    id: 1,
    title: "Pay the office utilities?",
    vendor: "Con Edison Business",
    amount: "$486",
    due: "Due Friday",
    question: "Should I pay Con Edison Business $486 for the office electric bill?",
    description:
      "Due this Friday. This is your usual monthly utility payment for the headquarters. Operating cash will stay well above your reserve target after.",
    who: "Con Edison Business",
    amountFull: "$486.40",
    dueBy: "Friday, April 25",
    from: "Chase Business Checking",
    autoLabel: "Always pay Con Edison automatically",
  },
  {
    id: 2,
    title: "Pay the office lease?",
    amount: "$8,400",
    due: "runs tomorrow morning",
    question: "Should I send next month's office lease payment for $8,400?",
    description:
      "Runs tomorrow morning. Same amount as last month. It's your primary monthly facilities payment.",
    who: "Brookside Commercial Properties",
    amountFull: "$8,400.00",
    dueBy: "Tomorrow, 9:00 AM",
    from: "Chase Business Checking",
    autoLabel: "Always pay the lease automatically",
  },
  {
    id: 3,
    title: "Pay contractor invoice?",
    vendor: "Bright Futures Studio",
    amount: "$3,200",
    due: "Due Monday",
    question: "Should I pay Bright Futures Studio $3,200 for the April design retainer?",
    description:
      "Net-15 invoice received Apr 10. This matches your usual monthly contractor payment and is due soon.",
    who: "Bright Futures Studio",
    amountFull: "$3,200.00",
    dueBy: "Monday, April 28",
    from: "Chase Business Checking",
    autoLabel: "Always pay this contractor automatically",
  },
  {
    id: 4,
    title: "Renew the team SaaS subscription?",
    vendor: "Notion Team",
    amount: "$240",
    due: "Renews Sunday",
    question: "Should I renew Notion Team for $240 this month?",
    description:
      "Up a little from last month after adding two seats. Your card on file will be charged automatically.",
    who: "Notion Team",
    amountFull: "$239.40",
    dueBy: "Sunday, April 27",
    from: "Visa Business Debit ••6903",
    autoLabel: "Always renew team SaaS automatically",
  },
  {
    id: 5,
    title: "Sweep idle cash to treasury?",
    amount: "$25,000",
    due: "earn ~$104/mo",
    question: "Should I move $25,000 into your treasury yield account?",
    description:
      "Your operating balance is above your usual target. Moving this amount to treasury would earn interest while leaving a comfortable buffer for payroll.",
    who: "Mercury Treasury (T-Bills)",
    amountFull: "$25,000.00",
    dueBy: "When you confirm",
    from: "Chase Business Checking",
    autoLabel: "Always sweep idle cash to treasury",
  },
];

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

/* Checkbox — Figma 47:10802 (inactive) / 47:10808 (active).
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
}: {
  item: ReviewItemType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (auto: boolean) => void;
  onReject: () => void;
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
          {/* Title bar — Figma 4062:65550. Border on all sides per
              Figma; only the bottom is visible due to outer
              overflow-clip + rounded-[24px]. */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-[calc(50%-12px)] [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap">
              Review Details
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-review-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L11 11M11 1L1 11" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto">
            {/* Question + Description block — Figma 4062:65560,
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

              {/* Auto-action row — Figma 4071:65830, items-start. */}
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

            {/* For a real (live) PaymentIntent, approval is gated on owner + CFO
                quorum that the demo tenant cannot satisfy, so Confirm is disabled
                and only the (real) Decline action is offered. */}
            {item.live && (
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px] w-full">
                Approval needs owner + CFO sign-off — not available in the demo tenant. You can still
                decline it below.
              </p>
            )}

            {/* Action row — Figma 4071:65833. Confirm + Decline. */}
            <div className="flex gap-[16px] items-start w-full">
              <button
                onClick={() => onConfirm(auto)}
                disabled={item.live}
                data-testid="button-review-confirm"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#123509] hover:bg-[#174710] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#123509]"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#42bf23] text-[16px] whitespace-nowrap">{item.live ? "Approve" : "Confirm"}</span>
              </button>
              <button
                onClick={onReject}
                data-testid="button-review-reject"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#350011] hover:bg-[#4a0018] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d20344]"
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
