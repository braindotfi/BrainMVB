import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ChevronRight, CheckCircle, AlertTriangle } from "lucide-react";
import type { AuditRecord, LinkedEntity } from "@/lib/auditTypes";
import { auditEventLabel, auditEventChipClass } from "@/lib/auditTypes";
import { AnchorStatus } from "./AnchorStatus";
import { InvoiceViewerPopup } from "./InvoiceViewerPopup";
import { useCurrency } from "@/lib/currencyContext";
import { useLocation } from "wouter";
import { openRuleDetail, resolveRule } from "@/lib/openRuleDetail";
import { openVendorDetail, resolveVendor } from "@/lib/openVendorDetail";
import { openInvoiceDetail, resolveInvoice } from "@/lib/openInvoiceDetail";
import type { Invoice } from "@/lib/invoiceTypes";

export function AuditRecordPopup({
  record,
  open,
  onOpenChange,
}: {
  record: AuditRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  if (!record) return null;

  const isFlagged = record.eventType === "flagged";

  const handleNavigate = (link: LinkedEntity) => {
    if (link.kind === "rule") {
      const opened = openRuleDetail(link.refId, navigate);
      if (!opened) return; // deleted rule — non-tappable, no-op
    } else if (link.kind === "proposal") {
      navigate(`/review`);
    } else if (link.kind === "vendor") {
      const opened = openVendorDetail(link.refId, navigate);
      if (!opened) return; // deleted vendor — non-tappable, no-op
    } else if (link.kind === "invoice") {
      const opened = openInvoiceDetail(link.refId, (inv) => {
        setViewingInvoice(inv);
        setInvoiceOpen(true);
      });
      if (!opened) return;
      return; // don't close the audit popup — invoice viewer stacks on top
    } else {
      return;
    }
    onOpenChange(false);
  };

  const handleVerify = () => {
    if (record.anchor.verifyHref) {
      window.open(record.anchor.verifyHref, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
            <div className="flex items-center gap-[8px] flex-1 min-w-px">
              <span className={`px-[6px] py-[2px] rounded-[4px] [font-family:'JetBrains_Mono',monospace] font-medium text-[10px] uppercase tracking-[0.06em] ${auditEventChipClass(record.eventType)}`}>
                {auditEventLabel(record.eventType)}
              </span>
              <span className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[#414965] text-[12px]">
                {record.id}
              </span>
            </div>
            <DialogPrimitive.Close
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
              data-testid="button-close-audit-popup"
            >
              <X size={14} className="text-[#a8b9f4]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto" data-testid="audit-record-popup-content">
            {/* Title + meta */}
            <div className="flex flex-col gap-[6px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-[#a8b9f4]">
                {record.summary}
              </p>
              <div className="flex gap-[4px] items-center flex-wrap">
                {record.counterparty && (
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">{record.counterparty}</p>
                )}
                {typeof record.amount === "number" && (
                  <p className="[font-family:'JetBrains_Mono',monospace] font-medium text-[14px] text-[#a8b9f4]">{format(record.amount)}</p>
                )}
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#414965]">· {record.occurredAtLabel}</p>
              </div>
            </div>

            {/* Decision lifecycle timeline */}
            <div className="flex flex-col gap-[12px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">Decision lifecycle</p>
              <div className="flex flex-col gap-[12px] w-full">
                {record.lifecycle.map((step, idx) => {
                  const isLast = idx === record.lifecycle.length - 1;
                  const Icon = step.kind === "alert" ? AlertTriangle : CheckCircle;
                  const iconColor = step.kind === "alert" ? "#d20344" : "#42bf23";
                  return (
                    <div key={idx} className="flex gap-[12px] items-start w-full">
                      <div className="flex flex-col items-center shrink-0">
                        <Icon size={14} style={{ color: iconColor }} />
                        {!isLast && <div className="w-px flex-1 min-h-[16px] bg-[#1d2132] mt-[4px]" />}
                      </div>
                      <div className="flex flex-col gap-[2px] flex-1 min-w-px">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#a8b9f4]">{step.label}</p>
                        {step.note && (
                          <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#414965]">{step.note}</p>
                        )}
                        <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d]">{step.timestamp}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Linked entities */}
            {record.linked.length > 0 && (
              <div className="flex flex-col gap-[8px] w-full">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">Linked</p>
                <div className="flex flex-col gap-[4px] w-full">
                  {record.linked.map((link) => {
                    // Rules and vendors resolve against their catalogues;
                    // a deleted entity renders as plain, non-tappable text.
                    const ruleGone = link.kind === "rule" && !resolveRule(link.refId);
                    const vendorGone = link.kind === "vendor" && !resolveVendor(link.refId);
                    const invoiceGone = link.kind === "invoice" && !resolveInvoice(link.refId);
                    const tappable =
                      link.kind === "proposal" ||
                      (link.kind === "rule" && !ruleGone) ||
                      (link.kind === "vendor" && !vendorGone) ||
                      (link.kind === "invoice" && !invoiceGone);

                    if (!tappable) {
                      return (
                        <div
                          key={`${link.kind}-${link.refId}`}
                          data-testid={`text-linked-${link.kind}-${link.refId}`}
                          className="flex items-center gap-[8px] p-[8px] rounded-[8px] bg-[#0a0c10] w-full"
                        >
                          <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">{link.kind}</span>
                          <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] flex-1 min-w-px">{link.label}</span>
                          {(ruleGone || vendorGone || invoiceGone) && (
                            <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#414965] shrink-0">
                              ({link.kind} unavailable)
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <button
                        key={`${link.kind}-${link.refId}`}
                        type="button"
                        onClick={() => handleNavigate(link)}
                        data-testid={`button-linked-${link.kind}-${link.refId}`}
                        className="flex items-center gap-[8px] p-[8px] rounded-[8px] bg-[#0a0c10] hover:bg-[#11141b] border border-transparent hover:border-[#1d2132] transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                      >
                        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">{link.kind}</span>
                        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4] flex-1 min-w-px">{link.label}</span>
                        <ChevronRight size={14} className="text-[#414965] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Divider before Anchor Proof */}
            <div className="h-px w-full bg-[#1d2132]" />

            {/* Anchor Proof — deepest section */}
            <div className="flex flex-col gap-[8px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">Anchor proof</p>
              <AnchorStatus anchor={record.anchor} mode="proof" onVerify={handleVerify} />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    <InvoiceViewerPopup
      invoice={viewingInvoice}
      open={invoiceOpen}
      onOpenChange={setInvoiceOpen}
    />
    </>
  );
}
