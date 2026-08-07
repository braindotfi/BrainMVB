import { ChevronLeft, ChevronRight } from "lucide-react";

/* ── Record pager ─────────────────────────────────────────────────────────────
   Prev/Next arrows shown in a detail popup header so the user can cycle through
   the other records in the currently-queried category (active tab/filter),
   without closing the popup. Left = previous, Right = next. Parents wrap around
   the filtered list and disable the pair when there are no siblings. */

interface RecordPagerProps {
  onPrev: () => void;
  onNext: () => void;
  disabledPrev?: boolean;
  disabledNext?: boolean;
  testIdPrefix: string;
}

const BTN =
  "bg-brain-v1baby-blue-15 flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-pill hover:bg-brain-v1baby-blue-15-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple shrink-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-brain-v1baby-blue-15";

export function RecordPager({
  onPrev,
  onNext,
  disabledPrev = false,
  disabledNext = false,
  testIdPrefix,
}: RecordPagerProps) {
  return (
    <div className="flex gap-[16px] items-center w-full">
      <button
        type="button"
        onClick={onPrev}
        disabled={disabledPrev}
        aria-label="Previous record"
        data-testid={`button-${testIdPrefix}-prev`}
        className={BTN}
      >
        <ChevronLeft size={16} className="text-brain-v1baby-blue-60" />
        <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
          Previous
        </span>
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabledNext}
        aria-label="Next record"
        data-testid={`button-${testIdPrefix}-next`}
        className={BTN}
      >
        <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-60 text-[16px] whitespace-nowrap">
          Next
        </span>
        <ChevronRight size={16} className="text-brain-v1baby-blue-60" />
      </button>
    </div>
  );
}
