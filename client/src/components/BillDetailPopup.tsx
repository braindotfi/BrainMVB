import { useState } from "react";
import { useLocation } from "wouter";
import { DocumentViewerPopup } from "@/components/DocumentViewerPopup";
import {
  DetailPopupShell,
  DetailPopupHeader,
  DetailPopupBody,
  DetailTable,
  Row,
  SectionLabel,
  LinkedEvidenceRow,
  fmtDue,
  daysToDue,
  dueChip,
} from "@/components/detailPopup";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/useCurrency";
import { useIntents } from "@/lib/intentsStore";
import { toBrainInvoiceDocument } from "@/lib/brainInvoiceDocument";
import arrowIcon from "@assets/arrow_1783201262245.png";
import { AlertCallout } from "@/components/Callout";

/* ── Bill detail popup ───────────────────────────────────────────────────────────
   Centered modal pixel-matched to Figma "Bill Details"
   (node-id 5480-62602, file cC2lQwC3g9hv96o5Wgy8Ek).
   Opened from a Bills-inbox row, a Cash Flow bill row, or an invoice-backed
   Payables row. Shows the bill facts, reuses the shared invoice viewer
   (DocumentViewerPopup) for the source document, and bridges to the payment
   lifecycle without lying about state.

   The frame, header and table primitives live in components/detailPopup.tsx so the
   Payables popup for records with NO invoice behind them is the same popup rather
   than a lookalike. */

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

export function BillDetailPopup({
  bill,
  vendorName,
  bills,
  onClose,
  onSelectBill,
  hidePager,
}: {
  bill: BrainInvoiceDTO | null;
  vendorName: string;
  bills?: BrainInvoiceDTO[];
  onClose: () => void;
  onSelectBill?: (bill: BrainInvoiceDTO) => void;
  hidePager?: boolean;
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

  const statusChip = dueChip(dd);

  const goReview = () => { onClose(); navigate("/review"); };

  return (
    <>
      <DetailPopupShell
        title="Bill Details"
        open={open}
        onClose={onClose}
        closeTestId="button-close-bill-popup"
      >
        {bill ? (
          <>
            <DetailPopupHeader
              name={vendorName}
              chip={statusChip}
              amount={format(Number(bill.amount_due))}
              currency={bill.currency}
              nameTestId="text-bill-vendor"
              chipTestId="bill-due-chip"
              amountTestId="text-bill-amount"
            />

            <DetailPopupBody testId="bill-detail-popup-content">
              {/* Details */}
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>Details</SectionLabel>
                <DetailTable>
                  <Row label="Invoice" value={bill.invoice_number} />
                  {bill.metadata?.po && <Row label="PO" value={bill.metadata.po} />}
                  <Row label="Amount" value={format(Number(bill.amount_due))} />
                  <Row label="Due" value={fmtDue(bill.due_date)} />
                  <Row label="Source" value={bill.id} />
                </DetailTable>
              </div>

              {/* Linked Evidence — the source invoice document */}
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>Linked Evidence</SectionLabel>
                <LinkedEvidenceRow
                  kind="Invoice"
                  label={bill.invoice_number}
                  onClick={() => setViewingDoc(true)}
                  testId="button-view-invoice-document"
                />
              </div>

              {/* Flags */}
              {isFlagged && (
                <div className="flex flex-col gap-[16px] items-start w-full" data-testid="bill-flags">
                  <SectionLabel>Needs a Closer Look</SectionLabel>
                  <AlertCallout title="Anomalies detected">
                    <div className="flex flex-col gap-[8px] items-start w-full">
                      {flags.map((f) => (
                        <p key={f} className="w-full">{humanizeFlag(f)}</p>
                      ))}
                    </div>
                  </AlertCallout>
                </div>
              )}

              {/* What Happens Next */}
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>What Happens Next</SectionLabel>
                {intent ? (
                  <div className="flex flex-col gap-[10px] items-start w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-100 text-[16px] w-full">
                      {isFlagged
                        ? "Brain proposed this, but flagged it for review. Nothing moves until you approve."
                        : "Brain has proposed this payment. Nothing moves until you approve it."}
                    </p>
                    <button
                      type="button"
                      onClick={goReview}
                      data-testid="button-review-proposal"
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] rounded-[8px] px-[12px] py-[8px] w-fit transition-colors"
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
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-100 text-[16px] w-full">
                    {isFlagged
                      ? "This hasn't been proposed yet. The flags above need a human look first. You'll approve before any money moves."
                      : overdue
                      ? "This is past due and hasn't been proposed yet. You'll approve before any money moves."
                      : "Brain hasn't proposed this yet. When it does, you'll approve before any money moves."}
                  </p>
                )}
              </div>
            </DetailPopupBody>

            {!hidePager && (
              <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-brain-v1stroke-2 border-solid flex flex-col items-start p-[24px] relative shrink-0 w-full">
                <div className="flex gap-[16px] items-center w-full">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={!prevBill}
                    data-testid="button-bill-previous"
                    onClick={() => prevBill && onSelectBill?.(prevBill)}
                  >
                    <img src={arrowIcon} alt="" className="size-[16px] rotate-180" />
                    <span className="whitespace-nowrap">Previous</span>
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={!nextBill}
                    data-testid="button-bill-next"
                    onClick={() => nextBill && onSelectBill?.(nextBill)}
                  >
                    <span className="whitespace-nowrap">Next</span>
                    <img src={arrowIcon} alt="" className="size-[16px]" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </DetailPopupShell>

      {bill && (
        <DocumentViewerPopup
          document={viewingDoc ? toBrainInvoiceDocument(bill, vendorName) : null}
          open={viewingDoc}
          onOpenChange={setViewingDoc}
        />
      )}
    </>
  );
}
