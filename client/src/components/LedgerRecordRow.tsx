import type { KeyboardEvent, ReactNode } from "react";
import { RecordPill } from "@/components/RecordPill";

export interface LedgerRowPill {
  label: string;
  bg: string;
  border: string;
  fg: string;
  testId?: string;
}

/**
 * The canonical row for debt-like records.
 *
 * Payables and Receivables established this shape first: counterparty + status
 * pill, a secondary fact line, then a signed amount on the right. Cash Flow uses
 * this too, rather than making its merged projection look like a different kind
 * of record. The source can still differ; the presentation does not.
 */
export function LedgerRecordRow({
  name,
  pill,
  secondary,
  amount,
  sign,
  amountColor,
  nameTestId,
  amountTestId,
  rowTestId,
  onClick,
  onKeyDown,
  additionalPill,
}: {
  name: string;
  pill?: LedgerRowPill;
  secondary?: ReactNode;
  amount: string;
  sign: "+" | "-" | "";
  amountColor: string;
  nameTestId?: string;
  amountTestId?: string;
  rowTestId?: string;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  additionalPill?: ReactNode;
}): JSX.Element {
  const interactive = onClick != null;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-testid={rowTestId}
      className={[
        "flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full",
        "bg-[#0a0c10] border-b border-solid border-[#1d2132] last:border-b-0",
        interactive ? "cursor-pointer transition-colors hover:bg-[#11141b] outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]" : "",
      ].join(" ")}
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <div className="flex gap-[8px] items-center relative shrink-0 max-w-full">
          <p
            className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] truncate"
            data-testid={nameTestId}
          >
            {name}
          </p>
          {pill && (
            <RecordPill
              className=""
              style={{ background: pill.bg, borderColor: pill.border, color: pill.fg }}
              testId={pill.testId}
            >
              {pill.label}
            </RecordPill>
          )}
          {additionalPill}
        </div>
        {secondary && (
          <div className="flex gap-[4px] items-center relative shrink-0 max-w-full">
            {secondary}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end justify-center relative shrink-0">
        <p
          className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[18px] text-right whitespace-nowrap"
          style={{ color: amountColor }}
          data-testid={amountTestId}
        >
          {sign}
          {amount}
        </p>
      </div>
    </div>
  );
}