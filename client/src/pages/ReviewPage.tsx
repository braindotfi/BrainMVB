import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NEEDS_REVIEW,
  ReviewModal,
  type ReviewItemType,
} from "@/components/ReviewItems";
import { useCurrency } from "@/lib/currencyContext";

/* Sum of all pending review amounts → "Account Totals" footer row. */
function totalAmount(items: ReviewItemType[], format: (a: string | number) => string): string {
  const sum = items.reduce((acc, i) => {
    const n = Number(i.amountFull.replace(/[^0-9.]/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return format(Math.round(sum));
}

/* Thin row separator used between Accounts/Expenses rows on the Finances page. */
const Divider = () => (
  <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
);

/* Card header — same typography as Finances/Rules widgets (text-[20px]). */
const WidgetHeader = ({ title, count }: { title: string; count?: number }) => (
  <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
    <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
      {typeof count === "number" && (
        <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
        </div>
      )}
    </div>
  </div>
);

/* Single review row — title + vendor/due subline on the left, amount on the right.
   Mirrors the Accounts row layout on the Finances page. */
const convertInline = (s: string, format: (a: string | number) => string) =>
  s.replace(/\$[\d,]+(?:\.\d+)?/g, m => format(m));

const ReviewRow = ({ item, onClick, format }: { item: ReviewItemType; onClick: () => void; format: (a: string | number) => string }) => (
  <div
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    data-testid={`row-review-${item.id}`}
    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
  >
    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
        {item.title}
      </p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">
        {convertInline(item.vendor ? `${item.vendor} · ${item.due}` : item.due, format)}
      </p>
    </div>
    <div className="flex flex-col items-end justify-center relative shrink-0">
      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
        {format(item.amount)}
      </p>
    </div>
  </div>
);

export function ReviewPage() {
  const [activeReview, setActiveReview] = useState<ReviewItemType | null>(null);
  const { format } = useCurrency();

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Review</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">A few things I need your help on.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#414965] text-[16px] whitespace-nowrap">Take a quick look and decide what should happen next.</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">

            {/* Needs Review — same shell as the Accounts card on Finances */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <WidgetHeader title="Needs Review" count={NEEDS_REVIEW.length} />
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  {NEEDS_REVIEW.map((item, idx) => (
                    <div key={item.id} className="flex flex-col gap-[8px] w-full">
                      <ReviewRow item={item} onClick={() => setActiveReview(item)} format={format} />
                      {idx < NEEDS_REVIEW.length - 1 && <Divider />}
                    </div>
                  ))}

                  {/* Account Totals footer row — informational only, no hover */}
                  <Divider />
                  <div
                    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]"
                    data-testid="row-review-totals"
                  >
                    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">Account Totals</p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">Enough for about 6 months at your current spending</p>
                    </div>
                    <div className="flex flex-col items-end justify-center relative shrink-0">
                      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
                        {totalAmount(NEEDS_REVIEW, format)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tip — same purple bar styling as Finances/Rules pages */}
            <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="flex flex-1 items-start min-w-px relative">
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px] w-full">
                    Not sure what to do? Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Swipe right to approve, left to reject, or up to postpone for tomorrow.
                  </p>
                </div>
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
