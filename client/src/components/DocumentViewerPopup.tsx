import { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  FileText,
  Receipt,
  Landmark,
  FileSignature,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Package,
  ExternalLink,
  ArrowLeftRight,
  Info,
} from "lucide-react";
import invoiceImg from "@assets/invoice_1783385090730.png";
import magnifyingGlassImg from "@assets/magnifyingglass_1783385090731.png";
import closeIcon from "@assets/Close_1783293571882.png";
import type { DocKind, DocStatus, DocumentRecord } from "@/lib/documentTypes";
import { docKindLabel, docKindCaption, docStatusLabel, openDocumentOriginal } from "@/lib/documentTypes";
import { resolveDocument } from "@/lib/openDocumentDetail";
import { resolveProposal } from "@/lib/openProposalDetail";
import { useCurrency } from "@/lib/currencyContext";

/* ── Document / Record EVIDENCE Viewer ────────────────────────────────────────
   ONE read only viewer for every kind of evidence Brain surfaces behind a
   proposal, audit record, or receipt. Keyed off `document.kind`:
     invoice · purchase_order · prior_payment  → cream "paper" document pane
     bank_transaction                          → feed line + bank↔ledger recon
     contract                                  → agreement terms pane
   Shared across all kinds: an extracted-fields mono block, an amount-coherence
   note (when the doc backs a proposal), a provenance block, and a per-kind
   "viewer, not the system of record" caption. prior_payment / duplicate docs
   with a `compareToId` get an in-place COMPARE toggle. Brain READS; the source
   system owns the document.
   Color discipline: purple #7631ee for interactive, green #42bf23 for a match,
   #d20344 ONLY for a mismatch / danger. No orange except an existing UNPAID chip.
   ─────────────────────────────────────────────────────────────────────────── */

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const KIND_ICON: Record<DocKind, typeof FileText> = {
  invoice: FileText,
  purchase_order: ShoppingCart,
  prior_payment: Receipt,
  bank_transaction: Landmark,
  contract: FileSignature,
};

const STATUS_CHIP: Record<DocStatus, string> = {
  unpaid: "bg-[#3a2500] text-[#ff9500]",
  paid: "bg-[#0a2a0a] text-[#42bf23]",
  held: "bg-[#350011] text-[#d20344]",
  disputed: "bg-[#350011] text-[#d20344]",
  cancelled: "bg-[#1d2132] text-[#6c779d]",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">
      {children}
    </p>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-[8px]">
      <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
        {label}
      </span>
      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#a8b9f4] text-right">
        {value}
      </span>
    </div>
  );
}

/* ── Figma-style dark key-value table (140px label column) ──────────────── */
function DarkTableRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[#1d2132] border-b border-solid content-stretch flex items-start relative shrink-0 w-full last:border-b-0">
      <div className="content-stretch flex flex-col items-start justify-center px-[12px] py-[8px] relative shrink-0 w-[140px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[12px] whitespace-nowrap">
          {label}
        </p>
      </div>
      <div className="content-stretch flex flex-[1_0_0] flex-col items-start justify-center min-w-px px-[12px] py-[8px] relative">
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[13px] whitespace-nowrap">
          {value}
        </p>
      </div>
    </div>
  );
}

/* Invoice pane, Figma 5573:97699 dark-themed invoice viewer */
function InvoicePane({ doc }: { doc: DocumentRecord }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const { format } = useCurrency();
  const proposal = resolveProposal(doc.proposalId);
  const match = proposal && typeof doc.amount === "number" && typeof proposal.amount === "number"
    ? Math.round(doc.amount) === Math.round(proposal.amount)
    : true;

  return (
    <div className="flex flex-col gap-[32px] w-full">
      {/* Fullscreen invoice preview overlay */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-[4px]"
          onClick={() => setPreviewOpen(false)}
          data-testid="invoice-preview-overlay"
        >
          <div
            className="relative max-w-[640px] w-[90vw] rounded-[16px] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={invoiceImg} alt="Invoice preview" className="w-full block" />
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              data-testid="button-close-invoice-preview"
              className="absolute top-[12px] right-[12px] size-[32px] flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 transition-colors focus:outline-none"
            >
              <img src={closeIcon} alt="" className="size-[24px]" />
            </button>
          </div>
        </div>
      )}

      {/* Top: thumbnail + invoice id + status + amount/date */}
      <div className="content-stretch flex gap-[16px] items-start relative shrink-0 w-full">
        {/* Invoice thumbnail: click expands full preview, hover shows magnifier */}
        <div
          className="group relative shrink-0 size-[56px] rounded-[12px] overflow-hidden cursor-pointer"
          onClick={() => setPreviewOpen(true)}
          data-testid="invoice-thumbnail"
        >
          <img
            src={invoiceImg}
            alt="Invoice"
            className="absolute inset-0 size-full object-cover rounded-[12px]"
          />
          <div className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/0 group-hover:bg-black/45 transition-all">
            <img src={magnifyingGlassImg} alt="View" className="size-[32px] opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="content-stretch flex flex-[1_0_0] flex-col gap-[8px] items-start min-w-px relative">
          <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px] whitespace-nowrap">
              {doc.id}
            </p>
            {doc.status && (
              <div
                className={`content-stretch flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0 border border-solid ${STATUS_CHIP[doc.status]}`}
                style={{ background: doc.status === "paid" ? "#123509" : doc.status === "held" ? "#350011" : "#222737", borderColor: doc.status === "paid" ? "rgba(66,191,35,0.2)" : doc.status === "held" ? "rgba(210,3,68,0.2)" : "rgba(108,119,157,0.2)" }}
              >
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap" style={{ color: doc.status === "paid" ? "#42bf23" : doc.status === "held" ? "#d20344" : "#6c779d" }}>
                  {docStatusLabel(doc.status)}
                </p>
              </div>
            )}
          </div>
          <div className="content-stretch flex items-center relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
              {typeof doc.amount === "number" ? format(doc.amount) : ""}
              {typeof doc.amount === "number" && doc.dateLabel ? " · " : ""}
              {doc.dateLabel.replace(/^(Issued|Due|Paid|Effective|Posted)\s+/, "")}
            </p>
          </div>
        </div>
      </div>

      {/* What Brain Extracted */}
      <div className="relative shrink-0 w-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
          <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">What Brain Extracted</p>
            <div className="flex-[1_0_0] h-px bg-[#1d2132] min-w-px" />
          </div>
          <div className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex flex-col items-start relative rounded-[12px] shrink-0 w-full">
            <DarkTableRow label="Party" value={doc.vendorName ?? doc.counterparty ?? "-"} />
            <DarkTableRow label="Document ID" value={doc.id} />
            {typeof doc.amount === "number" && (
              <DarkTableRow label="Amount" value={format(doc.amount)} />
            )}
            <DarkTableRow label={doc.dateCaption ?? "Date"} value={doc.dateLabel.replace(/^(Issued|Due|Paid|Effective|Posted)\s+/, "")} />
            {doc.payeeAccountLast4 && (
              <DarkTableRow label="Pay To" value={`••${doc.payeeAccountLast4}`} />
            )}
          </div>
        </div>
      </div>

      {/* Amount Coherence */}
      {proposal && typeof doc.amount === "number" && typeof proposal.amount === "number" && (
        <div className="relative shrink-0 w-full">
          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
            <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">Amount Coherence</p>
              <div className="flex-[1_0_0] h-px bg-[#1d2132] min-w-px" />
            </div>
            <div className="bg-[#123509] content-stretch flex items-center px-[16px] py-[12px] relative rounded-[12px] shrink-0 w-full">
              <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
                <CheckCircle2 size={16} className="text-[#42bf23] shrink-0" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#42bf23] text-[14px] whitespace-nowrap">
                  {match
                    ? `Matches the linked payment (${format(proposal.amount)})`
                    : `Differs from the linked payment. Document ${format(doc.amount)} vs payment ${format(proposal.amount)}`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provenance */}
      <div className="relative shrink-0 w-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
          <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">Provenance</p>
            <div className="flex-[1_0_0] h-px bg-[#1d2132] min-w-px" />
          </div>
          <div className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex flex-col items-start relative rounded-[12px] shrink-0 w-full">
            <DarkTableRow label="Source" value={doc.provenance.source} />
            <DarkTableRow label="Ingested" value={doc.provenance.ingestedAtLabel} />
            <DarkTableRow label="Channel" value={doc.provenance.enum.replace(/_/g, " ").toLowerCase()} />
            <DarkTableRow label="Ledger Ref" value={doc.provenance.ledgerRef} />
          </div>
        </div>
      </div>

      {/* Cleared By */}
      {proposal?.rule && (
        <div className="relative shrink-0 w-full">
          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
            <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">Cleared By</p>
              <div className="flex-[1_0_0] h-px bg-[#1d2132] min-w-px" />
            </div>
            <div className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex flex-col items-start relative rounded-[12px] shrink-0 w-full">
              <DarkTableRow label="Rule" value={proposal.rule.name} />
              <DarkTableRow label="Policy" value={proposal.policy?.id ?? "-"} />
            </div>
          </div>
        </div>
      )}

      {/* Info box, Figma 5573:97923. Between provenance and Open Original */}
      <div className="border border-[#1d2132] border-solid content-stretch flex items-center p-[8px] relative rounded-[12px] w-full">
        <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-start min-w-px">
          <Info size={16} className="text-[#6c779d] shrink-0 mt-[1px]" />
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] flex-1 min-w-px">
            A viewer, not an AP system. Brain reads this invoice; your accounting system owns it.
          </p>
        </div>
      </div>

      {/* Open Original in Source System — no icon per Figma */}
      {(doc.documentHref || doc.rawId) && (
        <button
          type="button"
          onClick={() => void openDocumentOriginal(doc)}
          data-testid="link-open-original"
          className="flex items-center justify-center px-[20px] py-[10px] rounded-[100px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] transition-opacity hover:opacity-80"
          style={{ background: "#240757" }}
        >
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px]" style={{ color: "#7631ee" }}>
            Open Original in Source System
          </span>
        </button>
      )}
    </div>
  );
}

/* Cream "paper" pane: invoice, purchase_order, prior_payment, or contract */
function PaperPane({ doc }: { doc: DocumentRecord }) {
  const partyName = doc.vendorName ?? doc.counterparty ?? "-";
  const isContract = doc.kind === "contract";

  return (
    <div
      className="w-full rounded-[12px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
      data-testid="document-paper-pane"
    >
      {/* Letterhead */}
      <div className="bg-[#f9f7f2] px-[20px] pt-[20px] pb-[16px] flex flex-col gap-[4px]">
        <div className="flex items-start justify-between gap-[12px]">
          <div>
            <p className="font-semibold text-[18px] leading-[24px] text-[#1a1205] [font-family:'Gilroy',sans-serif]">
              {partyName}
            </p>
            <p className="font-medium text-[13px] text-[#5a5040] [font-family:'Gilroy',sans-serif] mt-[2px]">
              {doc.id}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[11px] text-[#7a6a50] uppercase tracking-[0.04em]">
              {doc.dateCaption ?? "Date"}
            </p>
            <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">
              {doc.dateLabel.replace(/^(Issued|Due|Paid|Effective|Posted)\s+/, "")}
            </p>
            {isContract && doc.effectiveToLabel && (
              <>
                <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[11px] text-[#7a6a50] uppercase tracking-[0.04em] mt-[6px]">
                  Through
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">
                  {doc.effectiveToLabel}
                </p>
              </>
            )}
          </div>
        </div>
        <p className="font-medium text-[12px] text-[#7a6a50] [font-family:'Gilroy',sans-serif] mt-[4px]">
          {doc.title}
          {doc.billingPeriod ? ` · ${doc.billingPeriod}` : ""}
        </p>
      </div>

      {/* Body */}
      <div className="bg-[#f3f0e8]">
        {isContract ? (
          <div className="px-[20px] py-[14px] flex flex-col gap-[10px]">
            <div className="flex justify-between items-center">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#7a6a50]">
                Effective from
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">
                {doc.effectiveFromLabel ?? "-"}
              </p>
            </div>
            <div className="flex justify-between items-center">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#7a6a50]">
                Through
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">
                {doc.effectiveToLabel ?? "-"}
              </p>
            </div>
            {doc.cadence && (
              <div className="flex justify-between items-center">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#7a6a50]">
                  Payment cadence
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">
                  {doc.cadence}
                </p>
              </div>
            )}
            {typeof doc.amount === "number" && (
              <div className="flex justify-between items-center pt-[8px] border-t border-[#d8d2be]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#1a1205]">
                  Contracted amount
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[15px] text-[#1a1205]">
                  ${fmt(doc.amount)}
                  {doc.cadence ? ` / ${doc.cadence.toLowerCase()}` : ""}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {doc.lineItems && doc.lineItems.length > 0 && (
              <>
                <div className="flex gap-[8px] px-[20px] py-[8px] border-b border-[#ddd8c8]">
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#8a7a60] flex-1">
                    Description
                  </p>
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#8a7a60] w-[80px] text-right">
                    Amount
                  </p>
                </div>
                {doc.lineItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex gap-[8px] px-[20px] py-[10px] border-b border-[#e8e2d4] last:border-b-0"
                  >
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#2a2010] flex-1 leading-[18px]">
                      {item.label}
                    </p>
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[12px] text-[#2a2010] w-[80px] text-right self-start pt-[1px]">
                      ${fmt(item.amount)}
                    </p>
                  </div>
                ))}
              </>
            )}
            {typeof doc.amount === "number" && (
              <div className="px-[20px] py-[12px] bg-[#ece8d8] flex justify-between items-center">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#1a1205]">
                  {doc.kind === "prior_payment" ? "Amount paid" : "Total due"}
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[15px] text-[#1a1205]">
                  ${fmt(doc.amount)}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* bank_transaction: feed line + reconciliation side-by-side */
function BankTransactionPane({ doc }: { doc: DocumentRecord }) {
  const recon = doc.reconciliation;
  const amountsDiffer =
    !!recon && Math.round(recon.bankAmount) !== Math.round(recon.ledgerAmount);
  const gap = recon ? Math.abs(recon.bankAmount - recon.ledgerAmount) : 0;

  return (
    <div className="flex flex-col gap-[16px] w-full">
      {/* Feed line */}
      <div
        className="bg-[#0a0c10] rounded-[12px] p-[16px] flex flex-col gap-[10px]"
        data-testid="document-bank-line"
      >
        <div className="flex items-center gap-[8px]">
          <Landmark size={15} className="text-[#a8b9f4] shrink-0" />
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4] flex-1">
            {doc.counterparty ?? doc.title}
          </span>
          <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[15px] text-[#a8b9f4]">
            {doc.direction === "credit" ? "+" : "−"}
            {typeof doc.amount === "number" ? `$${fmt(doc.amount)}` : "-"}
          </span>
        </div>
        <div className="flex flex-col gap-[6px]">
          <KeyValue label="posted" value={doc.dateLabel.replace(/^Posted\s+/, "")} />
          <KeyValue
            label="direction"
            value={doc.direction === "credit" ? "credit (in)" : "debit (out)"}
          />
          {doc.payeeAccountLast4 && (
            <KeyValue label="account" value={`Operating ••${doc.payeeAccountLast4}`} />
          )}
        </div>
      </div>

      {/* Reconciliation */}
      {recon && (
        <div className="flex flex-col gap-[8px] w-full" data-testid="document-reconciliation">
          <SectionLabel>Reconciliation</SectionLabel>
          <div className="grid grid-cols-2 gap-[8px] w-full">
            {/* Bank side */}
            <div className="bg-[#0a0c10] rounded-[10px] p-[12px] flex flex-col gap-[6px]">
              <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#414965]">
                Bank line
              </p>
              <p
                className={`[font-family:'JetBrains_Mono',monospace] font-medium text-[15px] ${amountsDiffer ? "text-[#d20344]" : "text-[#42bf23]"}`}
              >
                ${fmt(recon.bankAmount)}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d]">
                {recon.bankDateLabel}
              </p>
            </div>
            {/* Ledger side */}
            <div className="bg-[#0a0c10] rounded-[10px] p-[12px] flex flex-col gap-[6px]">
              <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#414965]">
                Ledger {recon.ledgerRef}
              </p>
              <p
                className={`[font-family:'JetBrains_Mono',monospace] font-medium text-[15px] ${amountsDiffer ? "text-[#d20344]" : "text-[#42bf23]"}`}
              >
                ${fmt(recon.ledgerAmount)}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d]">
                {recon.ledgerDateLabel}
              </p>
            </div>
          </div>
          <div
            className={`flex items-start gap-[10px] p-[12px] rounded-[10px] ${amountsDiffer ? "bg-[#350011]" : "bg-[#0a2a0a]"}`}
          >
            {amountsDiffer ? (
              <AlertCircle size={15} className="text-[#d20344] shrink-0 mt-[1px]" />
            ) : (
              <CheckCircle2 size={15} className="text-[#42bf23] shrink-0 mt-[1px]" />
            )}
            <p
              className={`[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] ${amountsDiffer ? "text-[#d20344]" : "text-[#42bf23]"}`}
            >
              {amountsDiffer
                ? `Bank line and ledger differ by $${fmt(gap)}, outside close tolerance.`
                : "Bank line reconciles with the ledger entry."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Extracted fields mono block (paper-doc kinds) ──────────────────────────── */
function ExtractedBlock({ doc }: { doc: DocumentRecord }) {
  return (
    <div className="flex flex-col gap-[8px] w-full" data-testid="document-extracted-section">
      <SectionLabel>What Brain extracted</SectionLabel>
      <div className="bg-[#0a0c10] rounded-[8px] px-[12px] py-[10px] flex flex-col gap-[6px]">
        <KeyValue label="party" value={doc.vendorName ?? doc.counterparty ?? "-"} />
        <KeyValue label="document id" value={doc.id} />
        {typeof doc.amount === "number" && (
          <KeyValue label="amount" value={`$${fmt(doc.amount)}`} />
        )}
        <KeyValue label={doc.dateCaption?.toLowerCase() ?? "date"} value={doc.dateLabel} />
        {doc.payeeAccountLast4 && (
          <KeyValue label="pay to" value={`••${doc.payeeAccountLast4}`} />
        )}
      </div>
    </div>
  );
}

/* Amount-coherence note. Only when the doc backs a proposal/payment */
function CoherenceNote({ doc }: { doc: DocumentRecord }) {
  const { format } = useCurrency();
  const proposal = resolveProposal(doc.proposalId);
  if (!proposal || typeof doc.amount !== "number" || typeof proposal.amount !== "number") {
    return null;
  }
  const match = Math.round(doc.amount) === Math.round(proposal.amount);

  return (
    <div className="flex flex-col gap-[8px] w-full" data-testid="document-coherence-section">
      <SectionLabel>Amount coherence</SectionLabel>
      <div
        className={`flex items-start gap-[10px] p-[12px] rounded-[10px] ${match ? "bg-[#0a2a0a]" : "bg-[#350011]"}`}
      >
        {match ? (
          <CheckCircle2 size={15} className="text-[#42bf23] shrink-0 mt-[1px]" />
        ) : (
          <AlertCircle size={15} className="text-[#d20344] shrink-0 mt-[1px]" />
        )}
        <p
          className={`[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] ${match ? "text-[#42bf23]" : "text-[#d20344]"}`}
        >
          {match
            ? `Matches the linked payment (${format(proposal.amount)}).`
            : `Differs from the linked payment. Document ${format(doc.amount)} vs payment ${format(proposal.amount)}. Review before approving.`}
        </p>
      </div>
    </div>
  );
}

/* ── Provenance ─────────────────────────────────────────────────────────────── */
function ProvenanceBlock({ doc }: { doc: DocumentRecord }) {
  return (
    <div className="flex flex-col gap-[8px] w-full" data-testid="document-provenance-section">
      <SectionLabel>Provenance</SectionLabel>
      <div className="bg-[#0a0c10] rounded-[8px] px-[12px] py-[10px] flex flex-col gap-[6px]">
        <KeyValue label="source" value={doc.provenance.source} />
        <div className="flex justify-between items-start gap-[8px]">
          <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
            ingested
          </span>
          <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d] text-right">
            {doc.provenance.ingestedAtLabel}
          </span>
        </div>
        <div className="flex justify-between items-start gap-[8px]">
          <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
            channel
          </span>
          <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#a8b9f4] text-right">
            {doc.provenance.enum}
          </span>
        </div>
        <div className="flex justify-between items-start gap-[8px]">
          <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
            ledger ref
          </span>
          <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d] text-right break-all">
            {doc.provenance.ledgerRef}
          </span>
        </div>
      </div>
    </div>
  );
}

/* Compare columns: current doc beside its prior twin */
function CompareColumns({
  current,
  prior,
}: {
  current: DocumentRecord;
  prior: DocumentRecord;
}) {
  const amountDiffers =
    typeof current.amount === "number" &&
    typeof prior.amount === "number" &&
    Math.round(current.amount) !== Math.round(prior.amount);
  const accountDiffers =
    !!current.payeeAccountLast4 &&
    !!prior.payeeAccountLast4 &&
    current.payeeAccountLast4 !== prior.payeeAccountLast4;

  const col = (d: DocumentRecord, heading: string) => (
    <div className="bg-[#0a0c10] rounded-[10px] p-[12px] flex flex-col gap-[8px] flex-1 min-w-px">
      <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#414965]">
        {heading}
      </p>
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4] leading-[18px]">
        {d.id}
      </p>
      <div className="flex justify-between items-center gap-[6px]">
        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965]">
          amount
        </span>
        <span
          className={`[font-family:'JetBrains_Mono',monospace] text-[12px] font-medium ${amountDiffers ? "text-[#d20344]" : "text-[#a8b9f4]"}`}
        >
          {typeof d.amount === "number" ? `$${fmt(d.amount)}` : "-"}
        </span>
      </div>
      <div className="flex justify-between items-center gap-[6px]">
        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965]">
          date
        </span>
        <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d]">
          {d.dateLabel}
        </span>
      </div>
      <div className="flex justify-between items-center gap-[6px]">
        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965]">
          pay to
        </span>
        <span
          className={`[font-family:'JetBrains_Mono',monospace] text-[12px] font-medium ${accountDiffers ? "text-[#d20344]" : "text-[#a8b9f4]"}`}
        >
          {d.payeeAccountLast4 ? `••${d.payeeAccountLast4}` : "-"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-[8px] w-full" data-testid="document-compare-section">
      <SectionLabel>Compared with prior</SectionLabel>
      <div className="flex gap-[8px] w-full items-stretch">
        {col(current, "This document")}
        {col(prior, "Prior")}
      </div>
      {(amountDiffers || accountDiffers) && (
        <div className="flex items-start gap-[10px] p-[12px] rounded-[10px] bg-[#350011]">
          <AlertCircle size={15} className="text-[#d20344] shrink-0 mt-[1px]" />
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#d20344]">
            {accountDiffers
              ? "Payout account differs from the established one. A common invoice-redirect signal."
              : "Amounts differ between these near-identical documents. Check for a duplicate."}
          </p>
        </div>
      )}
    </div>
  );
}

export function DocumentViewerPopup({
  document: doc,
  open,
  onOpenChange,
}: {
  document: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [comparing, setComparing] = useState(false);

  // Reset the compare toggle whenever a different document is opened.
  useEffect(() => {
    setComparing(false);
  }, [doc?.id]);

  if (!doc) return null;

  const KindIcon = KIND_ICON[doc.kind];
  const prior = resolveDocument(doc.compareToId);
  const isPaperKind = doc.kind !== "bank_transaction";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[560px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.7)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out"
          data-testid="document-viewer-popup"
        >
          {/* Header: invoice uses "Invoice Record" centred title; other kinds show doc id + kind */}
          {doc.kind === "invoice" ? (
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid h-[56px] flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap absolute left-1/2 -translate-x-1/2 top-[calc(50%-12px)]">
                Invoice Record
              </p>
              <DialogPrimitive.Close
                className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
                data-testid="button-close-document-viewer"
              >
                <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
              </DialogPrimitive.Close>
            </div>
          ) : (
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
              <div className="flex items-center gap-[8px] flex-1 min-w-px">
                <div className="flex items-center justify-center size-[28px] rounded-[8px] bg-[#0d1523] shrink-0">
                  <KindIcon size={14} className="text-[#a8b9f4]" />
                </div>
                <div className="flex flex-col min-w-px">
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4] truncate">
                    {doc.id}
                  </span>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[9px] uppercase tracking-[0.08em] text-[#414965]">
                    {docKindLabel(doc.kind)}
                  </span>
                </div>
                {doc.status && (
                  <span
                    className={`px-[6px] py-[2px] rounded-[4px] [font-family:'JetBrains_Mono',monospace] font-medium text-[10px] uppercase tracking-[0.06em] shrink-0 ${STATUS_CHIP[doc.status]}`}
                    data-testid="document-status-chip"
                  >
                    {docStatusLabel(doc.status)}
                  </span>
                )}
              </div>
              <DialogPrimitive.Close
                className="size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
                data-testid="button-close-document-viewer"
              >
                <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
              </DialogPrimitive.Close>
            </div>
          )}

          <div className="flex flex-col gap-[20px] items-start p-[24px] w-full overflow-y-auto">
            {/* Primary pane: invoice uses dark Figma viewer; others use paper or bank.
                InvoicePane renders all its own sections internally (no duplicates below). */}
            {doc.kind === "invoice" ? (
              <InvoicePane doc={doc} />
            ) : isPaperKind ? (
              <>
                <PaperPane doc={doc} />

                {/* Compare toggle + columns */}
                {prior && (
                  <div className="flex flex-col gap-[12px] w-full">
                    <button
                      type="button"
                      onClick={() => setComparing((c) => !c)}
                      data-testid="button-toggle-compare"
                      className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0a0c10] hover:bg-[#151926] border border-transparent hover:border-[#7631ee]/40 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                    >
                      <ArrowLeftRight size={14} className="text-[#7631ee] shrink-0" />
                      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#a8b9f4] flex-1 min-w-px">
                        {comparing ? "Hide comparison" : `Compare with prior (${prior.id})`}
                      </span>
                    </button>
                    {comparing && <CompareColumns current={doc} prior={prior} />}
                  </div>
                )}

                <ExtractedBlock doc={doc} />
                <CoherenceNote doc={doc} />
                <ProvenanceBlock doc={doc} />

                {(doc.documentHref || doc.rawId) && (
                  <button
                    type="button"
                    onClick={() => void openDocumentOriginal(doc)}
                    data-testid="link-open-original"
                    className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0a0c10] hover:bg-[#151926] border border-transparent hover:border-[#7631ee]/40 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <ExternalLink size={14} className="text-[#7631ee] shrink-0" />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#a8b9f4] flex-1 min-w-px">
                      Open original in source system
                    </span>
                  </button>
                )}

                <div className="flex items-start gap-[8px] w-full">
                  <Package size={13} className="text-[#414965] shrink-0 mt-[2px]" />
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[16px] text-[#6c779d]">
                    {docKindCaption(doc.kind)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <BankTransactionPane doc={doc} />
                <CoherenceNote doc={doc} />
                <ProvenanceBlock doc={doc} />

                <div className="flex items-start gap-[8px] w-full">
                  <Package size={13} className="text-[#414965] shrink-0 mt-[2px]" />
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[16px] text-[#6c779d]">
                    {docKindCaption(doc.kind)}
                  </p>
                </div>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
