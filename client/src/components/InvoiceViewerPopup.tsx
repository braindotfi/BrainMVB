import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, FileText, CheckCircle2, AlertCircle, Package } from "lucide-react";
import type { Invoice } from "@/lib/invoiceTypes";
import { useCurrency } from "@/lib/currencyContext";

/* ── Invoice Viewer Popup ────────────────────────────────────────────────────
   Read-only view of a source invoice document. Shows:
   - Paper-card document preview with line items
   - Extracted fields (mono block)
   - Amount coherence note (green = match, D20344 = mismatch)
   - Provenance block (where + how Brain received it)
   ─────────────────────────────────────────────────────────────────────────── */

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceViewerPopup({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { format } = useCurrency();

  if (!invoice) return null;

  const coherenceMatch = invoice.coherence.status === "match";
  const coherenceUnverified = invoice.coherence.status === "unverified";

  const statusLabel: Record<Invoice["status"], string> = {
    unpaid: "UNPAID",
    paid: "PAID",
    held: "HELD",
    disputed: "DISPUTED",
  };

  const statusChipClass: Record<Invoice["status"], string> = {
    unpaid: "bg-[#3a2500] text-[#ff9500]",
    paid: "bg-[#0a2a0a] text-[#42bf23]",
    held: "bg-[#350011] text-[#d20344]",
    disputed: "bg-[#350011] text-[#d20344]",
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[560px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.7)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out"
          data-testid="invoice-viewer-popup"
        >
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
            <div className="flex items-center gap-[8px] flex-1 min-w-px">
              <div className="flex items-center justify-center size-[28px] rounded-[8px] bg-[#0d1523] shrink-0">
                <FileText size={14} className="text-[#a8b9f4]" />
              </div>
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4] truncate">
                {invoice.number}
              </span>
              <span
                className={`px-[6px] py-[2px] rounded-[4px] [font-family:'JetBrains_Mono',monospace] font-medium text-[10px] uppercase tracking-[0.06em] shrink-0 ${statusChipClass[invoice.status]}`}
              >
                {statusLabel[invoice.status]}
              </span>
            </div>
            <DialogPrimitive.Close
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
              data-testid="button-close-invoice-viewer"
            >
              <X size={14} className="text-[#a8b9f4]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[20px] items-start p-[24px] w-full overflow-y-auto">

            {/* ── Paper document card ─────────────────────────────────── */}
            <div
              className="w-full rounded-[12px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
              data-testid="invoice-document-card"
            >
              {/* Document header — cream paper */}
              <div className="bg-[#f9f7f2] px-[20px] pt-[20px] pb-[16px] flex flex-col gap-[4px]">
                <div className="flex items-start justify-between gap-[12px]">
                  <div>
                    <p className="font-semibold text-[18px] leading-[24px] text-[#1a1205] [font-family:'Gilroy',sans-serif]">
                      {invoice.vendorName}
                    </p>
                    <p className="font-medium text-[13px] text-[#5a5040] [font-family:'Gilroy',sans-serif] mt-[2px]">
                      {invoice.number}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[11px] text-[#7a6a50] uppercase tracking-[0.04em]">Issued</p>
                    <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">{invoice.issuedLabel}</p>
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[11px] text-[#7a6a50] uppercase tracking-[0.04em] mt-[6px]">Due</p>
                    <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">{invoice.dueLabel}</p>
                  </div>
                </div>
                {invoice.billingPeriod && (
                  <p className="font-medium text-[12px] text-[#7a6a50] [font-family:'Gilroy',sans-serif] mt-[4px]">
                    Billing period: {invoice.billingPeriod}
                  </p>
                )}
              </div>

              {/* Line items — slightly darker cream */}
              <div className="bg-[#f3f0e8]">
                {/* Table header */}
                <div className="flex gap-[8px] px-[20px] py-[8px] border-b border-[#ddd8c8]">
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#8a7a60] flex-1">Description</p>
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#8a7a60] w-[60px] text-right">Qty</p>
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#8a7a60] w-[72px] text-right">Unit</p>
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase tracking-[0.06em] text-[#8a7a60] w-[80px] text-right">Total</p>
                </div>
                {invoice.lineItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex gap-[8px] px-[20px] py-[10px] border-b border-[#e8e2d4] last:border-b-0"
                  >
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#2a2010] flex-1 leading-[18px]">
                      {item.description}
                    </p>
                    <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#5a5040] w-[60px] text-right self-start pt-[1px]">
                      {item.quantity ?? "—"}
                    </p>
                    <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#5a5040] w-[72px] text-right self-start pt-[1px]">
                      {item.unitPrice != null ? `$${fmt(item.unitPrice)}` : "—"}
                    </p>
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[12px] text-[#2a2010] w-[80px] text-right self-start pt-[1px]">
                      ${fmt(item.total)}
                    </p>
                  </div>
                ))}

                {/* Totals */}
                <div className="px-[20px] py-[12px] bg-[#ece8d8] flex flex-col gap-[6px]">
                  <div className="flex justify-between items-center">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#7a6a50]">Subtotal</p>
                    <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">${fmt(invoice.subtotal)}</p>
                  </div>
                  {invoice.tax != null && invoice.tax > 0 && (
                    <div className="flex justify-between items-center">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#7a6a50]">Tax</p>
                      <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#3a2e1e]">${fmt(invoice.tax)}</p>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-[6px] border-t border-[#d8d2be]">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#1a1205]">Total due</p>
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[15px] text-[#1a1205]">${fmt(invoice.total)}</p>
                  </div>
                </div>
              </div>

              {/* Notes — if present */}
              {invoice.notes && (
                <div className="bg-[#f0ece0] px-[20px] py-[12px] border-t border-[#ddd8c8]">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] text-[#7a6a50] uppercase tracking-[0.04em] mb-[4px]">Notes</p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#5a5040] leading-[18px]">
                    {invoice.notes}
                  </p>
                </div>
              )}
            </div>

            {/* ── Amount coherence ────────────────────────────────────── */}
            <div className="flex flex-col gap-[8px] w-full" data-testid="invoice-coherence-section">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">
                Amount coherence
              </p>
              <div
                className={`flex items-start gap-[10px] p-[12px] rounded-[10px] ${
                  coherenceUnverified
                    ? "bg-[#1d2132]"
                    : coherenceMatch
                      ? "bg-[#0a2a0a]"
                      : "bg-[#350011]"
                }`}
              >
                {coherenceUnverified ? (
                  <Package size={15} className="text-[#6c779d] shrink-0 mt-[1px]" />
                ) : coherenceMatch ? (
                  <CheckCircle2 size={15} className="text-[#42bf23] shrink-0 mt-[1px]" />
                ) : (
                  <AlertCircle size={15} className="text-[#d20344] shrink-0 mt-[1px]" />
                )}
                <p
                  className={`[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] ${
                    coherenceUnverified
                      ? "text-[#6c779d]"
                      : coherenceMatch
                        ? "text-[#42bf23]"
                        : "text-[#d20344]"
                  }`}
                >
                  {invoice.coherence.note}
                </p>
              </div>
              {invoice.coherence.proposalAmount != null && (
                <div className="bg-[#0a0c10] rounded-[8px] px-[12px] py-[10px] flex flex-col gap-[5px]">
                  <div className="flex justify-between items-center">
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">
                      invoice total
                    </span>
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] font-medium text-[#a8b9f4]">
                      {format(invoice.coherence.invoiceAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">
                      proposed amount
                    </span>
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] font-medium text-[#a8b9f4]">
                      {format(invoice.coherence.proposalAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Provenance ──────────────────────────────────────────── */}
            <div className="flex flex-col gap-[8px] w-full" data-testid="invoice-provenance-section">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">
                Provenance
              </p>
              <div className="bg-[#0a0c10] rounded-[8px] px-[12px] py-[10px] flex flex-col gap-[6px]">
                <div className="flex justify-between items-start gap-[8px]">
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
                    source
                  </span>
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#a8b9f4] text-right">
                    {invoice.provenance.source}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-[8px]">
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
                    received
                  </span>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d] text-right">
                    {invoice.provenance.receivedLabel}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-[8px]">
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
                    extracted by
                  </span>
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#a8b9f4] text-right">
                    {invoice.provenance.extractedBy}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-[8px]">
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em] shrink-0">
                    extracted at
                  </span>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d] text-right">
                    {invoice.provenance.extractedAtLabel}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
