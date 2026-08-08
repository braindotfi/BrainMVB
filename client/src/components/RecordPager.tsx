import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function RecordPager({
  onPrev,
  onNext,
  disabledPrev = false,
  disabledNext = false,
  testIdPrefix,
}: RecordPagerProps) {
  return (
    <div className="flex gap-[16px] items-center w-full">
      <Button
        variant="secondary"
        onClick={onPrev}
        disabled={disabledPrev}
        aria-label="Previous record"
        data-testid={`button-${testIdPrefix}-prev`}
        className="flex-1"
      >
        <ChevronLeft size={16} className="text-brain-v1baby-blue-60" />
        Previous
      </Button>
      <Button
        variant="secondary"
        onClick={onNext}
        disabled={disabledNext}
        aria-label="Next record"
        data-testid={`button-${testIdPrefix}-next`}
        className="flex-1"
      >
        Next
        <ChevronRight size={16} className="text-brain-v1baby-blue-60" />
      </Button>
    </div>
  );
}
