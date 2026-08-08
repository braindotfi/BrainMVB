/**
 * Shared chrome for the Ledger's record-detail modals.
 *
 * Lifted out of BillDetailPopup unchanged so Payables can open the same popup for
 * records that have no invoice behind them. Pixel-matched to Figma "Bill Details"
 * (node-id 5480-62602, file cC2lQwC3g9hv96o5Wgy8Ek) — this markup IS that popup's,
 * moved rather than reproduced, so the two surfaces cannot drift apart.
 *
 * This is a shell, not a template. It owns the frame, the header block and the table
 * row shape, and knows nothing about what a given record means; everything
 * invoice-specific stays in BillDetailPopup.
 */

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";

export function fmtDue(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function daysToDue(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

export interface DueChip {
  text: string;
  color: string;
  bg: string;
  border: string;
}

/** The due/overdue chip beside the record's name. `null` when there is no date to
 *  reason about — an undated record gets no chip rather than a guessed one. */
export function dueChip(dd: number | null): DueChip | null {
  if (dd == null) return null;
  if (dd < 0) return { text: "Overdue", color: "#d20344", bg: "#350011", border: "rgba(210,3,68,0.2)" };
  if (dd === 0) return { text: "Due today", color: "#a8b9f4", bg: "#222737", border: "rgba(108,119,157,0.2)" };
  return {
    text: `Due in ${dd} day${dd === 1 ? "" : "s"}`,
    color: "#a8b9f4",
    bg: "#222737",
    border: "rgba(108,119,157,0.2)",
  };
}

/* ── Details table row, matching AccountDetailPopup/TransactionDetailPopup ── */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center w-full border-b border-brain-v1stroke-2 last:border-b-0">
      <div className="flex flex-col justify-center px-[12px] py-[8px] w-[140px] shrink-0">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-brain-v1baby-blue-60">
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center px-[12px] py-[8px] min-w-px">
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-100 break-all">
          {value}
        </span>
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-[8px] items-center w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-60 whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-brain-v1stroke-2" />
    </div>
  );
}

/** The bordered table the Row list sits in. */
export function DetailTable({ children }: { children: ReactNode }) {
  return (
    <div className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start rounded-row w-full">
      {children}
    </div>
  );
}

/** Name + due chip over amount + currency. */
export function DetailPopupHeader({
  name,
  chip,
  amount,
  currency,
  nameTestId,
  chipTestId,
  amountTestId,
}: {
  name: string;
  chip: DueChip | null;
  amount: string;
  currency: string;
  nameTestId?: string;
  chipTestId?: string;
  amountTestId?: string;
}) {
  return (
    <div className="border-b border-brain-v1stroke-2 border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
      <div className="flex flex-col gap-[8px] items-start w-full">
        <div className="flex gap-[8px] items-center w-full">
          <p
            className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-brain-v1baby-blue-100 text-[20px]"
            data-testid={nameTestId}
          >
            {name}
          </p>
          {chip && (
            <div
              className="flex items-center justify-center px-[10px] py-[4px] rounded-pill shrink-0 border border-solid"
              style={{ background: chip.bg, borderColor: chip.border }}
              data-testid={chipTestId}
            >
              <p
                className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[14px] text-center whitespace-nowrap"
                style={{ color: chip.color }}
              >
                {chip.text}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-[8px] items-center w-full">
          <p
            className="[font-family:'JetBrains_Mono',monospace] font-normal leading-[32px] text-brain-v1baby-blue-100 text-[32px]"
            data-testid={amountTestId}
          >
            {amount}
          </p>
          <div className="bg-brain-v1baby-blue-15 border border-[rgba(108,119,157,0.2)] border-solid flex items-center justify-center px-[8px] py-[3px] rounded-pill shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-60 text-[12px] text-center whitespace-nowrap">
              {currency}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The scrolling body the sections sit in. */
export function DetailPopupBody({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      className="flex flex-col gap-[32px] items-start p-[24px] relative w-full overflow-y-auto"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** Overlay, frame, title bar and close button. */
export function DetailPopupShell({
  title,
  open,
  onClose,
  closeTestId,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  closeTestId?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Title and Controls */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-brain-v1stroke-2 border-solid h-[56px] relative shrink-0 w-full">
            <DialogPrimitive.Title asChild>
              <p className="-translate-x-1/2 absolute [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] left-1/2 not-italic text-brain-v1baby-blue-100 text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
                {title}
              </p>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-[12px] top-[12px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
              data-testid={closeTestId}
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
