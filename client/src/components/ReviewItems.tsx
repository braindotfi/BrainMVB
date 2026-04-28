import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Checkbox } from "@/components/ui/checkbox";

export type ReviewItemType = {
  id: number;
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
};

export const NEEDS_REVIEW: ReviewItemType[] = [
  {
    id: 1,
    title: "Pay the electric bill?",
    vendor: "Con Edison",
    amount: "$124",
    due: "Due Friday",
    question: "Should I pay Con Edison $124 for your electric bill?",
    description:
      "Due this Friday. This is your usual monthly home utility payment. You'll have plenty left in checking after.",
    who: "Con Edison",
    amountFull: "$124.18",
    dueBy: "Friday, April 25",
    from: "Chase Consumer Checking",
    autoLabel: "Always pay Con Edison automatically",
  },
  {
    id: 2,
    title: "Pay rent for next month?",
    amount: "$2,450",
    due: "runs tomorrow morning",
    question: "Should I pay next month's rent for $2,450?",
    description:
      "Runs tomorrow morning. Same amount as last month. It's your primary monthly housing payment.",
    who: "Brookside Apartments",
    amountFull: "$2,450.00",
    dueBy: "Tomorrow, 9:00 AM",
    from: "Chase Consumer Checking",
    autoLabel: "Always pay rent automatically",
  },
  {
    id: 3,
    title: "Pay daycare invoice?",
    vendor: "Bright Futures Daycare",
    amount: "$980",
    due: "Due Monday",
    question: "Should I pay Bright Futures Daycare $980 for this month's tuition?",
    description:
      "Net-15 invoice received Apr 10. This matches your monthly childcare payment and is due soon.",
    who: "Bright Futures Daycare",
    amountFull: "$980.00",
    dueBy: "Monday, April 28",
    from: "Chase Consumer Checking",
    autoLabel: "Always pay daycare automatically",
  },
  {
    id: 4,
    title: "Renew the streaming subscription?",
    vendor: "Netflix",
    amount: "$24",
    due: "Renews Sunday",
    question: "Should I renew Netflix for $24 this month?",
    description:
      "Up a little from last month after adding an extra profile. Your card on file will be charged automatically.",
    who: "Netflix",
    amountFull: "$23.99",
    dueBy: "Sunday, April 27",
    from: "Visa Debit ••6903",
    autoLabel: "Always renew streaming automatically",
  },
  {
    id: 5,
    title: "Move extra cash to savings?",
    amount: "$5,000",
    due: "earn ~$20/mo",
    question: "Should I move $5,000 into your high-yield savings?",
    description:
      "Your checking balance is above your usual target. Moving this amount to savings would earn interest while leaving a comfortable cushion.",
    who: "Marcus High-Yield Savings",
    amountFull: "$5,000.00",
    dueBy: "When you confirm",
    from: "Chase Consumer Checking",
    autoLabel: "Always sweep spare cash to savings",
  },
];

const InfoCell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-[#0a0c10] flex flex-col h-[58px] items-start p-[12px] rounded-[16px] w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#414965] text-[12px] whitespace-nowrap">{label}</p>
    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] whitespace-nowrap">{value}</p>
  </div>
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
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap">
              Review Needed
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
            <div className="flex flex-col items-start w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px] w-full">
                {item.question}
              </p>
              <DialogPrimitive.Description
                id="review-modal-description"
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#414965] text-[16px] w-full mt-[4px]"
              >
                {item.description}
              </DialogPrimitive.Description>
            </div>

            <div className="flex flex-col gap-[24px] items-start w-full">
              <div className="grid grid-cols-2 gap-[8px] w-full">
                <InfoCell label="Who"     value={item.who} />
                <InfoCell label="Amount"  value={item.amountFull} />
                <InfoCell label="Due by"  value={item.dueBy} />
                <InfoCell label="From"    value={item.from} />
              </div>

              <label
                htmlFor={`review-auto-${item.id}`}
                className="flex gap-[16px] items-center w-full cursor-pointer"
              >
                <Checkbox
                  id={`review-auto-${item.id}`}
                  checked={auto}
                  onCheckedChange={(v) => setAuto(v === true)}
                  data-testid="checkbox-review-auto"
                  className="size-[20px] shrink-0 bg-[#240757] border-[rgba(118,49,238,0.2)] rounded-[4px] data-[state=checked]:bg-[#240757] data-[state=checked]:text-[#7631EE]"
                />
                <span className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
                  {item.autoLabel}
                </span>
              </label>
            </div>

            <div className="flex gap-[16px] items-start w-full">
              <button
                onClick={() => onConfirm(auto)}
                data-testid="button-review-confirm"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#123509] hover:bg-[#174710] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23]"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#42bf23] text-[16px] whitespace-nowrap">Confirm</span>
              </button>
              <button
                onClick={onReject}
                data-testid="button-review-reject"
                className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#350011] hover:bg-[#4a0018] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d20344]"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#d20344] text-[16px] whitespace-nowrap">Reject</span>
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
