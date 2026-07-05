import { useState } from "react";
import { useLocation } from "wouter";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DocumentViewerPopup } from "@/components/DocumentViewerPopup";
import { useCurrency } from "@/lib/currencyContext";
import { useIntents } from "@/lib/intentsStore";
import type { DocumentRecord } from "@/lib/documentTypes";
import arrowIcon from "@assets/arrow_1783201262245.png";
import documentIcon from "@assets/doc_1783202136247.png";
import closeIcon from "@assets/Close_1783271500515.png";

/* ── Bill detail popup ───────────────────────────────────────────────────────────
   Centered modal (DialogPrimitive) pixel-matched to Figma "Bill Details"
   (node-id 5480-62602, file cC2lQwC3g9hv96o5Wgy8Ek).
   Opened from a Bills-inbox row. Shows the bill facts, reuses the shared
   invoice viewer (DocumentViewerPopup) for the source document, and bridges to
   the payment lifecycle without lying about state. */

export interface BrainInvoiceDTO {
  id: string;
  invoice_number: string;
  counterparty_id: string;
  amount_due: string;
  currency: string;
  due_date?: string | null;
  status: string;
  metadata?: { scenario?: string; po?: string | null; flags?: string[] } | null;
  created_at?: string | null;
}

const FLAG_LABEL: Record<string, string> = {
  new_wire_instructions: "New bank details on this invoice",
  urgency_language: "Pushy / urgent wording",
  no_po: "No purchase order on file",
  duplicate: "Looks like a possible duplicate",
  amount_mismatch: "Amount differs from what's expected",
};

function humanizeFlag(flag: string): string {
  return FLAG_LABEL[flag] ?? flag.replace(/_/g, " ");
}

function fmtDue(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function daysToDue(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

/* ── Details table row, matching AccountDetailPopup/TransactionDetailPopup ── */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center w-full border-b border-[#1d2132] last:border-b-0">
      <div className="flex flex-col justify-center px-[12px] py-[8px] w-[140px] shrink-0">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d]">
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center px-[12px] py-[8px] min-w-px">
        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[20px] text-[#a8b9f4] break-all">
          {value}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-[8px] items-center w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[14px] text-[#6c779d] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-[#1d2132]" />
    </div>
  );
}

function toDocument(bill: BrainInvoiceDTO, vendorName: string): DocumentRecord {
  const paid = bill.status === "paid";
  return {
    id: bill.invoice_number,
    kind: "invoice",
    title: `${vendorName} — invoice`,
    counterparty: vendorName,
    amount: Number(bill.amount_due),
    dateLabel: `Due ${fmtDue(bill.due_date)}`,
    dateCaption: "Due",
    status: paid ? "paid" : "unpaid",
    provenance: {
      source: "brain-core Ledger",
      ingestedAtLabel: bill.created_at ? `Extracted ${fmtDue(bill.created_at)}` : "Extracted from your ledger",
      enum: "CONNECTOR_SYNC",
      ledgerRef: bill.id,
    },
  };
}

export function BillDetailPopup({
  bill,
  vendorName,
  bills,
  onClose,
  onSelectBill,
}: {
  bill: BrainInvoiceDTO | null;
  vendorName: string;
  bills?: BrainInvoiceDTO[];
  onClose: () => void;
  onSelectBill?: (bill: BrainInvoiceDTO) => void;
}) {
  const { format } = useCurrency();
  const { intents } = useIntents();
  const [, navigate] = useLocation();
  const [viewingDoc, setViewingDoc] = useState(false);

  const open = bill != null;
  const flags = bill?.metadata?.flags ?? [];
  const isFlagged = flags.length > 0;
  const intent = bill ? intents.find((i) => i.invoiceId === bill.id) : undefined;
  const dd = daysToDue(bill?.due_date);
  const overdue = dd != null && dd < 0;

  const list = bills ?? [];
  const currentIdx = bill ? list.findIndex((b) => b.id === bill.id) : -1;
  const prevBill = currentIdx > 0 ? list[currentIdx - 1] : null;
  const nextBill = currentIdx >= 0 && currentIdx < list.length - 1 ? list[currentIdx + 1] : null;

  const statusChip = (() => {
    if (dd == null) return null;
    if (dd < 0) return { text: "Overdue", color: "#d20344", bg: "#350011", border: "rgba(210,3,68,0.2)" };
    if (dd === 0) return { text: "Due today", color: "#a8b9f4", bg: "#222737", border: "rgba(108,119,157,0.2)" };
    return { text: `Due in ${dd} day${dd === 1 ? "" : "s"}`, color: "#a8b9f4", bg: "#222737", border: "rgba(108,119,157,0.2)" };
  })();

  const goReview = () => { onClose(); navigate("/review"); };

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
            {/* Title and Controls */}
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
              <DialogPrimitive.Title asChild>
                <p className="-translate-x-1/2 absolute font-['Gilroy',sans-serif] font-semibold leading-[24px] left-1/2 not-italic text-[#a8b9f4] text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
                  Bill Details
                </p>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="absolute right-[12px] top-[12px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                data-testid="button-close-bill-popup"
              >
                <img src={closeIcon} alt="" className="size-[14px]" />
              </DialogPrimitive.Close>
            </div>

            {bill ? (
              <>
                {/* Vendor / status tag / amount / currency */}
                <div className="border-b border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
                  <div className="flex flex-col gap-[8px] items-start w-full">
                    <div className="flex gap-[8px] items-center w-full">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]" data-testid="text-bill-vendor">
                        {vendorName}
                      </p>
                      {statusChip && (
                        <div
                          className="flex items-center justify-center px-[10px] py-[4px] rounded-[22px] shrink-0 border border-solid"
                          style={{ background: statusChip.bg, borderColor: statusChip.border }}
                          data-testid="bill-due-chip"
                        >
                          <p
                            className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] text-center whitespace-nowrap"
                            style={{ color: statusChip.color }}
                          >
                            {statusChip.text}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-[8px] items-center w-full">
                      <p className="[font-family:'JetBrains_Mono',monospace] font-normal leading-[32px] text-[#a8b9f4] text-[32px] tracking-[-2px]" data-testid="text-bill-amount">
                        {format(Number(bill.amount_due))}
                      </p>
                      <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid flex items-center justify-center px-[8px] py-[3px] rounded-[22px] shrink-0">
                        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] text-center whitespace-nowrap">
                          {bill.currency}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Container */}
                <div className="flex flex-col gap-[32px] items-start p-[24px] relative w-full overflow-y-auto" data-testid="bill-detail-popup-content">
                  {/* Details */}
                  <div className="flex flex-col gap-[16px] items-start w-full">
                    <SectionLabel>Details</SectionLabel>
                    <div className="bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start rounded-[12px] w-full">
                      <Row label="Invoice" value={bill.invoice_number} />
                      {bill.metadata?.po && <Row label="PO" value={bill.metadata.po} />}
                      <Row label="Amount" value={format(Number(bill.amount_due))} />
                      <Row label="Due" value={fmtDue(bill.due_date)} />
                      <Row label="Source" value={bill.id} />
                    </div>
                  </div>

                  {/* View source document */}
                  <button
                    type="button"
                    onClick={() => setViewingDoc(true)}
                    data-testid="button-view-invoice-document"
                    className="bg-[#0a0c10] border border-[#1d2132] border-solid flex items-start rounded-[12px] w-full hover:border-[#7631ee]/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <div className="flex flex-col items-center justify-center shrink-0 size-[64px]">
                      <img src={documentIcon} alt="" className="size-[24px]" />
                    </div>
                    <div className="flex flex-1 flex-col items-start justify-center min-w-px self-stretch">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] w-full text-left">
                        View invoice document
                      </p>
                    </div>
                    <div className="flex flex-col items-center justify-center shrink-0 size-[64px]">
                      <ChevronRight size={24} className="text-[#6c779d]" />
                    </div>
                  </button>

                  {/* Flags */}
                  {isFlagged && (
                    <div className="flex flex-col gap-[16px] items-start w-full" data-testid="bill-flags">
                      <SectionLabel>Needs a Closer Look</SectionLabel>
                      <div
                        className="bg-[#350011] border border-[rgba(210,3,68,0.2)] border-solid flex items-start p-[8px] rounded-[12px] w-full"
                      >
                        <div className="flex flex-1 gap-[8px] items-start min-w-px">
                          <AlertTriangle size={16} className="shrink-0 mt-[1px]" style={{ color: "#d20344" }} />
                          <div className="flex flex-1 flex-col gap-[8px] items-start justify-center min-w-px">
                            <p className="[font-family:'Gilroy',sans-serif] font-bold text-[14px] leading-[16px] text-[#d20344] uppercase w-full">
                              ANOMALIES DETECTED
                            </p>
                            {flags.map((f) => (
                              <p key={f} className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[16px] text-[#d20344] w-full">
                                {humanizeFlag(f)}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* What Happens Next */}
                  <div className="flex flex-col gap-[16px] items-start w-full">
                    <SectionLabel>What Happens Next</SectionLabel>
                    {intent ? (
                      <div className="flex flex-col gap-[10px] items-start w-full">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] w-full">
                          {isFlagged
                            ? "Brain proposed this, but flagged it for review. Nothing moves until you approve."
                            : "Brain has proposed this payment. Nothing moves until you approve it."}
                        </p>
                        <button
                          type="button"
                          onClick={goReview}
                          data-testid="button-review-proposal"
                          className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] rounded-[8px] px-[12px] py-[8px] w-fit transition-colors"
                          style={
                            isFlagged
                              ? { color: "#d20344", border: "1px solid rgba(210,3,68,0.4)" }
                              : { color: "#a8b9f4", background: "#240757", border: "1px solid rgba(118,49,238,0.4)" }
                          }
                        >
                          {isFlagged ? "Review now" : "Review proposal"}
                        </button>
                      </div>
                    ) : (
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] w-full">
                        {isFlagged
                          ? "This hasn't been proposed yet — the flags above need a human look first. You'll approve before any money moves."
                          : overdue
                          ? "This is past due and hasn't been proposed yet. You'll approve before any money moves."
                          : "Brain hasn't proposed this yet. When it does, you'll approve before any money moves."}
                      </p>
                    )}
                  </div>
                </div>

                {/* Previous / Next */}
                <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-[#1d2132] border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
                  <div className="flex gap-[16px] items-center w-full">
                    <button
                      type="button"
                      disabled={!prevBill}
                      data-testid="button-bill-previous"
                      onClick={() => prevBill && onSelectBill?.(prevBill)}
                      className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    >
                      <img src={arrowIcon} alt="" className="size-[16px] rotate-180" />
                      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                        Previous
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!nextBill}
                      data-testid="button-bill-next"
                      onClick={() => nextBill && onSelectBill?.(nextBill)}
                      className="bg-[#222737] flex flex-1 gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    >
                      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                        Next
                      </span>
                      <img src={arrowIcon} alt="" className="size-[16px]" />
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {bill && (
        <DocumentViewerPopup
          document={viewingDoc ? toDocument(bill, vendorName) : null}
          open={viewingDoc}
          onOpenChange={setViewingDoc}
        />
      )}
    </>
  );
}
