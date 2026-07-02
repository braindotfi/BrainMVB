import { useState } from "react";
import { useLocation } from "wouter";
import { FileText, AlertTriangle, ArrowRight, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DocumentViewerPopup } from "@/components/DocumentViewerPopup";
import { useCurrency } from "@/lib/currencyContext";
import { useIntents } from "@/lib/intentsStore";
import type { DocumentRecord } from "@/lib/documentTypes";

/* ── Bill detail popup ───────────────────────────────────────────────────────────
   Centered modal (DialogPrimitive) matching VendorDetailPopup / AuditRecordPopup.
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
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysToDue(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-[8px]">
      <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
        {label}
      </span>
      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#a8b9f4] text-right break-all">
        {value}
      </span>
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
  onClose,
}: {
  bill: BrainInvoiceDTO | null;
  vendorName: string;
  onClose: () => void;
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

  const dueChip = (() => {
    if (dd == null) return { text: bill?.status ?? "—", color: "#6c779d", bg: "#1d2132" };
    if (dd < 0) return { text: `Overdue ${Math.abs(dd)} day${Math.abs(dd) === 1 ? "" : "s"}`, color: "#d20344", bg: "#350011" };
    if (dd === 0) return { text: "Due today", color: "#a8b9f4", bg: "#1d2132" };
    return { text: `Due in ${dd} day${dd === 1 ? "" : "s"}`, color: "#a8b9f4", bg: "#1d2132" };
  })();

  const goReview = () => { onClose(); navigate("/review"); };

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
            {/* Header */}
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
              <div className="flex items-center gap-[8px] flex-1 min-w-px">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4]">Bill detail</span>
              </div>
              <DialogPrimitive.Close
                className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
                data-testid="button-close-bill-popup"
              >
                <X size={14} className="text-[#a8b9f4]" />
              </DialogPrimitive.Close>
            </div>

            <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto" data-testid="bill-detail-popup-content">
              {bill && (
                <div className="flex flex-col gap-[20px] w-full">
                  {/* Due-state chip */}
                  <div className="flex">
                    <span
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] rounded-[6px] px-[8px] py-[3px]"
                      style={{ color: dueChip.color, background: dueChip.bg }}
                      data-testid="bill-due-chip"
                    >
                      {dueChip.text}
                    </span>
                  </div>

                  {/* Headline */}
                  <div className="flex flex-col gap-[4px]">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px]">{vendorName}</p>
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[#a8b9f4] text-[26px]" data-testid="text-bill-amount">
                      {format(Number(bill.amount_due))}
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">
                      {bill.invoice_number} · due {fmtDue(bill.due_date)}
                    </p>
                  </div>

                  <div className="h-px w-full bg-[#1d2132]" />

                  {/* Facts */}
                  <div className="flex flex-col gap-[8px] w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">Details</p>
                    <div className="bg-[#0d1017] rounded-[8px] px-[12px] py-[10px] flex flex-col gap-[6px]">
                      <KeyValue label="invoice" value={bill.invoice_number} />
                      {bill.metadata?.po && <KeyValue label="po" value={bill.metadata.po} />}
                      <KeyValue label="amount" value={format(Number(bill.amount_due))} />
                      <KeyValue label="due" value={fmtDue(bill.due_date)} />
                      <KeyValue label="source" value={bill.id} />
                    </div>
                  </div>

                  {/* View source document */}
                  <button
                    type="button"
                    onClick={() => setViewingDoc(true)}
                    data-testid="button-view-invoice-document"
                    className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0d1017] hover:bg-[#151926] border border-transparent hover:border-[#7631ee]/40 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <FileText size={14} className="text-[#7631ee] shrink-0" />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#a8b9f4] flex-1 min-w-px text-left">
                      View invoice document
                    </span>
                    <ArrowRight size={14} className="text-[#414965] shrink-0" />
                  </button>

                  {/* Flags */}
                  {isFlagged && (
                    <div className="flex flex-col gap-[8px] p-[12px] rounded-[10px] bg-[#350011]" data-testid="bill-flags">
                      <div className="flex items-center gap-[8px]">
                        <AlertTriangle size={15} className="text-[#d20344] shrink-0" />
                        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#d20344]">
                          Needs a closer look before paying
                        </p>
                      </div>
                      <ul className="flex flex-col gap-[4px] pl-[23px]">
                        {flags.map((f) => (
                          <li key={f} className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#d20344] list-disc">
                            {humanizeFlag(f)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Bridge: what happens next */}
                  <div className="flex flex-col gap-[8px] w-full" data-testid="bill-bridge">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">What happens next</p>
                    {intent ? (
                      <div className="flex flex-col gap-[10px] p-[12px] rounded-[10px]" style={{ background: isFlagged ? "#350011" : "rgba(118,49,238,0.08)" }}>
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#a8b9f4]">
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
                      <div className="flex flex-col gap-[6px] p-[12px] rounded-[10px] bg-[#0d1017]">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#6c779d]">
                          {isFlagged
                            ? "Brain hasn't proposed this yet — the flags above need a human look first. You approve before any money moves."
                            : overdue
                            ? "This is past due and hasn't been proposed yet. You'll approve before any money moves."
                            : "Brain hasn't proposed this yet. When it does, you'll approve before any money moves."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
