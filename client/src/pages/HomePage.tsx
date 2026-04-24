import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { INLINE_FIGMA } from "@/assets/inline-figma-icons";

const IMG_DOT     = INLINE_FIGMA.homeDot;
const IMG_DIVIDER = INLINE_FIGMA.homeDivider;

/* Actions widget icons (Figma 3839:43693) — green circle with checkmark */
const IMG_CHECK_ELLIPSE = INLINE_FIGMA.homeCheckEllipse;
const IMG_CHECK_VECTOR  = INLINE_FIGMA.homeCheckVector;

/* Recommendations widget icons (Figma 3839:43709) — orange circle with "i" */
const IMG_INFO_ELLIPSE = INLINE_FIGMA.homeInfoEllipse;
const IMG_INFO_VEC1    = INLINE_FIGMA.homeInfoVec1;
const IMG_INFO_VEC2    = INLINE_FIGMA.homeInfoVec2;

type ReviewItemType = {
  id: number;
  title: string;
  vendor?: string;
  amount: string;
  due: string;
  // Popup detail fields
  question: string;
  description: string;
  who: string;
  amountFull: string;
  dueBy: string;
  from: string;
  autoLabel: string;
};

const NEEDS_REVIEW: ReviewItemType[] = [
  {
    id: 1,
    title: "Pay your phone bill?",
    vendor: "Verizon",
    amount: "$189",
    due: "Due Friday",
    question: "Should I pay Verizon $189 for your phone bill?",
    description:
      "Due this Friday. You've paid Verizon every month for 2 years. The amount is normal. You'll have $47,934 left after.",
    who: "Verizon Wireless",
    amountFull: "$189.00",
    dueBy: "Friday, April 25",
    from: "Chase Business Checking",
    autoLabel: "Always pay Verizon automatically",
  },
  {
    id: 2,
    title: "Approve payroll for 8 people?",
    amount: "$12,800",
    due: "runs tomorrow morning",
    question: "Should I run payroll for 8 people for $12,800?",
    description:
      "Runs tomorrow morning. Same total as last month. You'll have $35,134 left in checking after.",
    who: "8 employees",
    amountFull: "$12,800.00",
    dueBy: "Tomorrow, 9:00 AM",
    from: "Chase Business Checking",
    autoLabel: "Always run payroll automatically",
  },
  {
    id: 3,
    title: "Pay invoice from Acme Design?",
    vendor: "Acme Design Co",
    amount: "$3,450",
    due: "Due Monday",
    question: "Should I pay Acme Design Co $3,450 for the brand refresh?",
    description:
      "Net-15 invoice received Apr 10, matches the SOW you approved. New vendor — first payment, so I'll need your confirmation.",
    who: "Acme Design Co",
    amountFull: "$3,450.00",
    dueBy: "Monday, April 28",
    from: "Chase Business Checking",
    autoLabel: "Always trust invoices from Acme Design",
  },
  {
    id: 4,
    title: "Renew AWS subscription?",
    vendor: "Amazon Web Services",
    amount: "$842",
    due: "Renews Sunday",
    question: "Should I renew AWS for $842 this month?",
    description:
      "Up $36 from last month from higher S3 usage. Card on file is your Wirex Debit. You've renewed AWS every month for 18 months.",
    who: "Amazon Web Services",
    amountFull: "$842.17",
    dueBy: "Sunday, April 27",
    from: "Wirex Debit ••6903",
    autoLabel: "Always renew AWS automatically",
  },
  {
    id: 5,
    title: "Move $50,000 to high-yield savings?",
    amount: "$50,000",
    due: "earn ~$202/mo",
    question: "Should I sweep $50,000 into your high-yield savings?",
    description:
      "Checking is well above your $25,000 target. Moving $50,000 to Marcus at 4.85% APY would earn about $202 a month and still leave a comfortable buffer.",
    who: "Marcus High-Yield Savings",
    amountFull: "$50,000.00",
    dueBy: "When you confirm",
    from: "Chase Business Checking",
    autoLabel: "Always sweep idle cash to savings",
  },
];

const ACTIONS = [
  { id: 1, label: "Paid 3 small bills this morning." },
  { id: 2, label: "Paid car payment for the month of March, due tomorrow." },
];

const RECOMMENDATIONS = [
  { id: 1, label: "I found a payments agent that can help you manage recurring payments. Would you like to review it?" },
  { id: 2, label: "Savings rate went up. Want me to move idle cash there?" },
];

const ReviewItem = ({ item, onClick }: { item: ReviewItemType; onClick: () => void }) => (
  <div
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    className="content-stretch flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
    data-testid={`review-item-${item.id}`}
  >
    <div className="flex flex-1 flex-col items-start min-w-px relative">
      <div className="flex items-center justify-center relative shrink-0 w-full">
        <p className="flex-1 min-w-px [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px]">{item.title}</p>
      </div>
      <div className="flex gap-[8px] items-center justify-center relative shrink-0">
        {item.vendor && (
          <>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.vendor}</p>
            <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
          </>
        )}
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.amount}</p>
        <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.due}</p>
      </div>
    </div>
  </div>
);

const GreenCheckIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_CHECK_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[16.65%_12.5%_16.68%_12.5%]">
        <div className="absolute inset-[-7.03%_-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_CHECK_VECTOR} />
        </div>
      </div>
    </div>
  </div>
);

const OrangeInfoIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_INFO_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[12.5%]">
        <div className="absolute inset-[-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC1} />
        </div>
      </div>
      <div className="absolute inset-[30.18%_46.88%_63.57%_46.88%]">
        <div className="absolute inset-[-25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC2} />
        </div>
      </div>
    </div>
  </div>
);

/* ─── Review Needed popup (Figma 3846:44649) ─── */
const InfoCell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-[#0a0c10] flex flex-col h-[58px] items-start p-[12px] rounded-[16px] w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#414965] text-[12px] whitespace-nowrap">{label}</p>
    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] whitespace-nowrap">{value}</p>
  </div>
);

const ReviewModal = ({
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
          {/* Header */}
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

          {/* Body */}
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

type WidgetItem = { id: number; label: string };
const ListItem = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="bg-[#0a0c10] flex gap-[8px] items-start p-[8px] relative rounded-[8px] shrink-0 w-full">
    {icon}
    <div className="flex flex-1 flex-col items-start min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#a8b9f4] text-[16px] w-full">{label}</p>
    </div>
  </div>
);

const SectionWidget = ({ title, count, items, icon }: { title: string; count: number; items: WidgetItem[]; icon: React.ReactNode }) => (
  <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
    <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
      <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{title}</p>
        <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
        </div>
      </div>
    </div>
    <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
      <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
        {items.map((item, idx) => (
          <div key={item.id} className="flex flex-col gap-[8px] w-full">
            <ListItem icon={icon} label={item.label} />
            {idx < items.length - 1 && (
              <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export function HomePage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const [activeReview, setActiveReview] = useState<ReviewItemType | null>(null);

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[0] not-italic relative shrink-0 text-[#6c779d] text-[0px] whitespace-nowrap">
                <span className="leading-[24px] text-[20px]">{greeting}, </span>
                <span className="leading-[24px] text-[#a8b9f4] text-[20px]">Maria</span>
                <span className="leading-[24px] text-[20px]">.</span>
              </p>
            </div>
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] not-italic relative shrink-0 text-[#a8b9f4] text-[32px] whitespace-nowrap">
                Here's where your business stands today.
              </p>
            </div>
          </div>

          {/* Stat cards row */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex gap-[16px] items-stretch relative shrink-0 w-full">
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px]">
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">Money in all accounts</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">$86,993</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">.42</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] relative shrink-0 text-[#414965] text-[20px] w-full">
                      Across bank, crypto and agent accounts.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px]">
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">You're spending about</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">$7,324</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">/mo</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] relative shrink-0 text-[#42bf23] text-[20px] w-full">
$432 less than last month. Nice.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* Bottom row: Needs Review (left) + Actions/Recommendations stacked (right) */}
            <div className="flex gap-[16px] items-start relative shrink-0 w-full">
              {/* Needs Review */}
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px overflow-clip relative rounded-[16px]">
                <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                  <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">Needs Review</p>
                    <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{NEEDS_REVIEW.length}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                  <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                    {NEEDS_REVIEW.map((item, idx) => (
                      <div key={item.id} className="flex flex-col gap-[8px] w-full">
                        <ReviewItem item={item} onClick={() => setActiveReview(item)} />
                        {idx < NEEDS_REVIEW.length - 1 && (
                          <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column: Actions + Recommendations */}
              <div className="flex flex-1 flex-col gap-[16px] items-start relative">
                <SectionWidget title="Actions"          count={ACTIONS.length}          items={ACTIONS}          icon={<GreenCheckIcon />} />
                <SectionWidget title="Recommendations"  count={RECOMMENDATIONS.length}  items={RECOMMENDATIONS}  icon={<OrangeInfoIcon />} />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <ReviewModal
        item={activeReview}
        open={activeReview !== null}
        onOpenChange={(o) => { if (!o) setActiveReview(null); }}
        onConfirm={() => setActiveReview(null)}
        onReject={() => setActiveReview(null)}
      />
    </div>
  );
}
