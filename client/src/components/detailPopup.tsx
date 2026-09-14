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
import { ChevronRight } from "lucide-react";
import closeIcon from "@assets/Close_1783293571882.png";
/* The chip's shape lives with the due-date arithmetic that produces it, in
   `lib/dueDates`; this header only renders whatever chip it is handed. */
import type { DueChip } from "@/lib/dueDates";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "September 14, 2026" — the due DAY, read in UTC.
 *
 * A bare `YYYY-MM-DD` parses to UTC midnight, so rendering it through
 * `toLocaleDateString` printed the day before anywhere west of Greenwich, while the
 * Payable popup (which reads the same value in UTC) printed the right one. Same
 * record, two dates, depending on which popup you opened it from.
 */
export function fmtDue(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
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

/** Name + due chip over amount + currency.
 *
 *  Optional `icon`: a ReactNode (e.g. a thumbnail image) rendered to the left
 *  of the name/amount block.  When omitted the header keeps its original
 *  single-column layout so existing callers are unaffected.
 */
export function DetailPopupHeader({
  name,
  chip,
  amount,
  currency,
  nameTestId,
  chipTestId,
  amountTestId,
  icon,
}: {
  name: string;
  chip: DueChip | null;
  amount: string;
  currency: string;
  nameTestId?: string;
  chipTestId?: string;
  amountTestId?: string;
  /** Optional leading icon — rendered at 56×56 px to the left of the name block. */
  icon?: ReactNode;
}) {
  return (
    <div className={`border-b border-brain-v1stroke-2 border-solid p-[24px] relative shrink-0 w-full ${icon ? "flex items-start gap-[16px]" : "flex flex-col items-start"}`}>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex flex-col gap-[8px] items-start w-full min-w-px">
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
                className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] text-center whitespace-nowrap"
                style={{ color: chip.color }}
              >
                {chip.text}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-[8px] items-center w-full">
          <p
            className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[32px] text-brain-v1baby-blue-100 text-[32px]"
            data-testid={amountTestId}
          >
            {amount}
          </p>
          <div className="bg-brain-v1baby-blue-15 border border-[rgba(108,119,157,0.2)] border-solid flex items-center justify-center px-[8px] py-[3px] rounded-pill shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1baby-blue-60 text-[12px] text-center whitespace-nowrap">
              {currency}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A linked-evidence row (chip + label + chevron) matching the AuditRecordPopup
 *  and AgentProposalModal pattern.  Tappable by default; pass `onClick` to wire
 *  the navigation action. */
export function LinkedEvidenceRow({
  kind,
  label,
  onClick,
  testId,
}: {
  kind: string;
  label: string;
  /* The event is passed through so a caller opening a nested dialog can capture the
     row as the element to restore focus to on close. A controlled Radix dialog has no
     Trigger of its own, so nothing else knows where the user came from. */
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  testId?: string;
}) {
  const inner = (
    <>
      <div className="bg-brain-v1baby-blue-15 border border-[rgba(108,119,157,0.2)] border-solid flex items-center justify-center px-[8px] py-[3px] rounded-pill shrink-0">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-brain-v1baby-blue-60 text-[12px] whitespace-nowrap">
          {kind}
        </p>
      </div>
      {/* normal-case: this row renders as a <button> when tappable, and the base-layer
          `button { text-transform: capitalize }` rule rewrote the tenant's own filename
          — "form_1120_2025.pdf" was showing as "Form_1120_2025.Pdf", which is not a file
          they have. The label is always upstream data (a filename, a record id), never
          app chrome, so it opts out unconditionally rather than per caller. */}
      <p className="normal-case [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] flex-1 min-w-px">
        {label}
      </p>
      <ChevronRight size={16} className="text-brain-v1baby-blue-60 shrink-0" />
    </>
  );

  const rowClass =
    "bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex gap-[16px] items-center px-[16px] py-[12px] rounded-row w-full text-left";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`${rowClass} hover:bg-brain-v1baby-blue-5 hover:border-brain-v1stroke-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div data-testid={testId} className={rowClass}>
      {inner}
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

/**
 * Overlay, frame, title bar and close button — the canonical modal shell.
 * Fixed at the standard 480px width (record detail popups: account, bill,
 * transaction, vendor, audit, proposal…) with the mobile max-w clamp baked
 * in, not overridable, so a caller can't accidentally drop the clamp.
 *
 * Shares the same overlay (bg-black/60 backdrop-blur-[2px]), background
 * (bg-brain-v1baby-blue-5 / #11141b), border (brain-v1stroke-2 / #1d2132), radius
 * (rounded-modal / 24px), and shadow (0 24px 60px rgba(0,0,0,0.6)) as the other
 * shell variants (see CLAUDE.md "Modal shell standard").
 */
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
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 border-solid flex flex-col items-start overflow-hidden rounded-modal max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out w-[480px] max-w-[calc(100vw-32px)]">
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
