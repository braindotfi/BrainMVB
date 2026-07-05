import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronRight, CheckCircle, AlertTriangle } from "lucide-react";
import closeIcon from "@assets/Close_1783293571882.png";
import type { AuditRecord, LinkedEntity } from "@/lib/auditTypes";
import { auditEventLabel, auditEventChipClass, linkedRelationship } from "@/lib/auditTypes";
import { resolveActorRole, actorIdentityTokens } from "@/lib/actors";
import { resolveMemberByTokens, openMemberDetail, useMembersCache } from "@/lib/membersStore";
import { AnchorStatus } from "./AnchorStatus";
import { DocumentViewerPopup } from "./DocumentViewerPopup";
import { useCurrency } from "@/lib/currencyContext";
import { useLocation } from "wouter";
import { openRuleDetail, resolveRule } from "@/lib/openRuleDetail";
import { openVendorDetail, resolveVendor } from "@/lib/openVendorDetail";
import { openDocumentDetail, resolveDocument } from "@/lib/openDocumentDetail";
import { openProposalDetail, resolveProposal } from "@/lib/openProposalDetail";
import type { DocumentRecord } from "@/lib/documentTypes";
import { RecordPager } from "./RecordPager";

export function AuditRecordPopup({
  record,
  open,
  onOpenChange,
  onPrev,
  onNext,
  pagerDisabled,
}: {
  record: AuditRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /* header pager — cycle through the other records in the active tab */
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
}) {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  // Subscribe to the members cache so actor labels become tappable once it primes.
  useMembersCache();
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);

  if (!record) return null;

  const isFlagged = record.eventType === "flagged";

  const handleNavigate = (link: LinkedEntity) => {
    // Route deep-links (rule/proposal/vendor) navigate to another page. We must
    // NOT call onOpenChange(false) here: the parent's close handler does
    // `navigate('/audit-log', {replace:true})` to clear the ?record= param, which
    // would REPLACE the deep-link we just pushed and dump the user back on the
    // audit log. The route change unmounts this page (and dialog) on its own.
    // The document branch opens a stacked viewer on THIS page, so it also stays.
    //
    // For vendor/proposal we pass a `returnTo` so closing that detail returns
    // to THIS exact audit record popup (re-opened via ?record=), matching the
    // stacked document-viewer experience.
    const returnTo = `/audit-log?record=${record.id}`;
    if (link.kind === "rule") {
      openRuleDetail(link.refId, navigate);
    } else if (link.kind === "proposal") {
      openProposalDetail(link.refId, navigate, returnTo);
    } else if (link.kind === "vendor") {
      openVendorDetail(link.refId, navigate, returnTo);
    } else if (link.kind === "invoice") {
      // Linked evidence documents (invoices today; any DocKind) open in the
      // universal document/record viewer via the ONE canonical resolver.
      openDocumentDetail(link.refId, (d) => {
        setViewingDocument(d);
        setDocumentOpen(true);
      });
    }
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
            {onPrev && onNext && (
              <RecordPager
                onPrev={onPrev}
                onNext={onNext}
                disabled={pagerDisabled}
                testIdPrefix="audit-record"
              />
            )}
            <DialogPrimitive.Close
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
              data-testid="button-close-audit-popup"
            >
              <img src={closeIcon} alt="" className="size-[14px]" />
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
                  // Actor role (+ optional future authority line) shown as a muted
                  // suffix on human-approval steps — resolved from the actor record,
                  // never hardcoded. Distinguishes the ACTOR (who decided) from the
                  // PAYEE in linked evidence (who was paid).
                  const actorRole = resolveActorRole(step.actor);
                  // Tappable ONLY when the actor maps to a real core member. Never a
                  // client authority claim — just a link into core's member record.
                  const actorMember = resolveMemberByTokens(actorIdentityTokens(step.actor));
                  return (
                    <div key={idx} className="flex gap-[12px] items-start w-full">
                      <div className="flex flex-col items-center shrink-0">
                        <Icon size={14} style={{ color: iconColor }} />
                        {!isLast && <div className="w-px flex-1 min-h-[16px] bg-[#1d2132] mt-[4px]" />}
                      </div>
                      <div className="flex flex-col gap-[2px] flex-1 min-w-px">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#a8b9f4]">
                          {actorMember ? (
                            <button
                              type="button"
                              onClick={() => openMemberDetail(actorMember.id)}
                              data-testid={`link-actor-member-${idx}`}
                              className="text-[#a8b9f4] underline decoration-[#414965] underline-offset-2 hover:decoration-[#a8b9f4] transition-colors"
                            >
                              {step.label}
                            </button>
                          ) : (
                            step.label
                          )}
                          {actorRole && (
                            <span data-testid={`text-actor-role-${idx}`} className="text-[#6c779d]"> · {actorRole}</span>
                          )}
                          {step.authority && (
                            <span data-testid={`text-actor-authority-${idx}`} className="text-[#6c779d]"> · {step.authority}</span>
                          )}
                        </p>
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
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#414965] uppercase tracking-[0.04em]">Linked evidence</p>
                <div className="flex flex-col gap-[4px] w-full">
                  {record.linked.map((link) => {
                    // Every linked kind resolves against its canonical store;
                    // a missing/deleted entity renders as plain, non-tappable text.
                    const ruleGone = link.kind === "rule" && !resolveRule(link.refId);
                    const vendorGone = link.kind === "vendor" && !resolveVendor(link.refId);
                    const invoiceGone = link.kind === "invoice" && !resolveDocument(link.refId);
                    const proposalGone = link.kind === "proposal" && !resolveProposal(link.refId);
                    const tappable =
                      (link.kind === "proposal" && !proposalGone) ||
                      (link.kind === "rule" && !ruleGone) ||
                      (link.kind === "vendor" && !vendorGone) ||
                      (link.kind === "invoice" && !invoiceGone);

                    // Row chip carries the RELATIONSHIP ("PAYEE" for a receiving
                    // party on a payment record), falling back to the entity kind.
                    const chipLabel = linkedRelationship(record, link) ?? link.kind;

                    if (!tappable) {
                      return (
                        <div
                          key={`${link.kind}-${link.refId}`}
                          data-testid={`text-linked-${link.kind}-${link.refId}`}
                          className="flex items-center gap-[8px] p-[8px] rounded-[8px] bg-[#0a0c10] w-full"
                        >
                          <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">{chipLabel}</span>
                          <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] flex-1 min-w-px">{link.label}</span>
                          {(ruleGone || vendorGone || invoiceGone || proposalGone) && (
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
                        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">{chipLabel}</span>
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
    <DocumentViewerPopup
      document={viewingDocument}
      open={documentOpen}
      onOpenChange={setDocumentOpen}
    />
    </>
  );
}
