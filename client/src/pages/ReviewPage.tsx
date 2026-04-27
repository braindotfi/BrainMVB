import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NEEDS_REVIEW,
  ReviewModal,
  ReviewRow,
  type ReviewItemType,
} from "@/components/ReviewItems";

/* Total of all pending review amounts → "Account Totals" footer row. */
function totalAmount(items: ReviewItemType[]): string {
  const sum = items.reduce((acc, i) => {
    const n = Number(i.amountFull.replace(/[^0-9.]/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return `$${sum.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function ReviewPage() {
  const [activeReview, setActiveReview] = useState<ReviewItemType | null>(null);

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[24px] items-start pb-[24px] pt-[40px] px-[16px] w-full max-w-[760px]">

          {/* Header */}
          <div className="flex flex-col items-start w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[20px] leading-[24px]">
              Your Review
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">
              A few things I need your help on.
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[16px] leading-[24px] mt-[4px]">
              Take a quick look and decide what should happen next.
            </p>
          </div>

          {/* Single "Accounts" card */}
          <div className="bg-[#0a0c10] flex flex-col items-start overflow-hidden rounded-[16px] w-full">
            <div className="border-[#1d2132] border-b border-solid flex items-center px-[16px] py-[14px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
                Accounts
              </p>
            </div>

            <div className="flex flex-col items-start p-[8px] w-full">
              <div className="flex flex-col gap-[8px] items-start w-full">
                {NEEDS_REVIEW.map((item, idx) => (
                  <div key={item.id} className="flex flex-col gap-[8px] w-full">
                    <ReviewRow item={item} onClick={() => setActiveReview(item)} />
                    {idx < NEEDS_REVIEW.length - 1 && (
                      <div className="h-px w-full" style={{ background: "#1d2132" }} />
                    )}
                  </div>
                ))}

                {/* Footer totals row — informational only, not clickable */}
                <div className="h-px w-full" style={{ background: "#1d2132" }} />
                <div className="flex items-center justify-between gap-[16px] p-[12px] rounded-[10px] w-full" data-testid="row-account-totals">
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
                      Account Totals
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                      Enough for about 6 months at your current spending
                    </p>
                  </div>
                  <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[#a8b9f4] text-[18px] shrink-0 tabular-nums">
                    {totalAmount(NEEDS_REVIEW)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Helper notice */}
          <div className="rounded-[12px] bg-[rgba(118,49,238,0.15)] border border-[rgba(118,49,238,0.4)] p-[14px] w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[14px] leading-[20px]">
              Not sure what to do? Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Swipe right to approve, left to reject, or up to postpone for tomorrow.
            </p>
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
