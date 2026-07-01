import { ChevronLeft, ChevronRight } from "lucide-react";

/* ── Record pager ─────────────────────────────────────────────────────────────
   Prev/Next arrows shown in a detail popup header so the user can cycle through
   the other records in the currently-queried category (active tab/filter),
   without closing the popup. Left = previous, Right = next. Parents wrap around
   the filtered list and disable the pair when there are no siblings. */

interface RecordPagerProps {
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  testIdPrefix: string;
}

const BTN =
  "size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#222737]";

export function RecordPager({ onPrev, onNext, disabled = false, testIdPrefix }: RecordPagerProps) {
  return (
    <div className="flex items-center gap-[4px] shrink-0">
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled}
        aria-label="Previous record"
        data-testid={`button-${testIdPrefix}-prev`}
        className={BTN}
      >
        <ChevronLeft size={14} className="text-[#a8b9f4]" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-label="Next record"
        data-testid={`button-${testIdPrefix}-next`}
        className={BTN}
      >
        <ChevronRight size={14} className="text-[#a8b9f4]" />
      </button>
    </div>
  );
}
