/**
 * The small count badge that sits beside a section heading — the "4" in "• ACCOUNTS 4".
 *
 * This exact markup had been hand-copied into six places (Ledger widget headers, the
 * Inbox decision count, the Rules count, the Counterparties count, the Inbox tier
 * headings) and re-invented in a seventh, where the Audit Log's count had drifted to a
 * pill-shaped outline badge at a different size. One component so the shape is a fact
 * rather than a convention nobody can check.
 *
 * Geometry is the Accounts-tab reference: 18px minimum width so single digits stay
 * square-ish, 11px semibold on a solid fill with dark text.
 */

import type { ReactNode } from "react";

export function CountPill({
  children,
  /** Fill colour. Defaults to the neutral grey; the Inbox tier headings pass their
   *  own accent so the badge matches the heading it belongs to. */
  background = "#6c779d",
  testId,
}: {
  children: ReactNode;
  background?: string;
  testId?: string;
}): JSX.Element {
  return (
    <div
      className="flex items-center justify-center min-w-[18px] px-[5px] py-[1px] rounded-[4px] shrink-0 transition-colors"
      style={{ background }}
      data-testid={testId}
    >
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1highlight-dropdown-bg text-[11px] text-center whitespace-nowrap">
        {children}
      </p>
    </div>
  );
}
