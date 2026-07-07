import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronRight, CheckCircle, AlertTriangle } from "lucide-react";
import closeIcon from "@assets/Close_1783293571882.png";
import type { AuditRecord, LinkedEntity } from "@/lib/auditTypes";
import { auditEventLabel, linkedRelationship } from "@/lib/auditTypes";
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
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
}) {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  useMembersCache();
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);

  if (!record) return null;

  const isFlagged = record.eventType === "flagged";

  const handleNavigate = (link: LinkedEntity) => {
    const returnTo = `/audit-log?record=${record.id}`;
    if (link.kind === "rule") {
      openRuleDetail(link.refId, navigate);
    } else if (link.kind === "proposal") {
      openProposalDetail(link.refId, navigate, returnTo);
    } else if (link.kind === "vendor") {
      openVendorDetail(link.refId, navigate, returnTo);
    } else if (link.kind === "invoice") {
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

  const statusPill = () => {
    const label = auditEventLabel(record.eventType);
    const isApproved = record.eventType === "approved";
    const isAuto = record.eventType === "auto_approved";
    return (
      <div
        className="content-stretch flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0 border border-solid"
        style={
          isApproved || isAuto
            ? { background: "#123509", borderColor: "rgba(66,191,35,0.2)" }
            : isFlagged
              ? { background: "#350011", borderColor: "rgba(210,3,68,0.2)" }
              : { background: "#222737", borderColor: "rgba(108,119,157,0.2)" }
        }
      >
        <p
          className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap"
          style={
            isApproved || isAuto
              ? { color: "#42bf23" }
              : isFlagged
                ? { color: "#d20344" }
                : { color: "#6c779d" }
          }
        >
          {label}
        </p>
      </div>
    );
  };

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-[1_0_0] h-px bg-[#1d2132] min-w-px" />
    </div>
  );

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
            {/* Header */}
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid h-[56px] flex items-center relative shrink-0 w-full">
              <div className="absolute right-[11px] top-[11px]">
                {onPrev && onNext && (
                  <RecordPager
                    onPrev={onPrev}
                    onNext={onNext}
                    disabled={pagerDisabled}
                    testIdPrefix="audit-record"
                  />
                )}
              </div>
              <DialogPrimitive.Close
                className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
                data-testid="button-close-audit-popup"
              >
                <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
              </DialogPrimitive.Close>
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] text-center whitespace-nowrap absolute left-1/2 -translate-x-1/2 top-[calc(50%-12px)]">
                Audit Record
              </p>
            </div>

            {/* Summary header */}
            <div className="border-[#1d2132] border-b border-solid content-stretch flex flex-col items-start p-[24px] relative shrink-0 w-full">
              <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
                  {record.summary}
                </p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
                  {typeof record.amount === "number" ? format(record.amount) : ""}
                  {typeof record.amount === "number" && record.occurredAtLabel ? " · " : ""}
                  {record.occurredAtLabel}
                </p>
                {statusPill()}
              </div>
            </div>

            <div className="flex flex-col gap-[32px] items-start p-[24px] w-full overflow-y-auto">
              {/* Decision Lifecycle */}
              {record.lifecycle.length > 0 && (
                <div className="relative shrink-0 w-full">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
                    <SectionHeader>Decision Lifecycle</SectionHeader>
                    <div className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex flex-col items-start relative rounded-[12px] shrink-0 w-full">
                      <div className="content-stretch flex items-start p-[16px] relative shrink-0 w-full">
                        <div className="content-stretch flex flex-[1_0_0] flex-col gap-[16px] items-start min-w-px relative">
                          {record.lifecycle.map((step, idx) => {
                            const isLast = idx === record.lifecycle.length - 1;
                            const Icon = step.kind === "alert" ? AlertTriangle : CheckCircle;
                            const iconColor = step.kind === "alert" ? "#d20344" : "#42bf23";
                            const actorRole = resolveActorRole(step.actor);
                            const actorMember = resolveMemberByTokens(actorIdentityTokens(step.actor));
                            return (
                              <div key={idx} className="content-stretch flex gap-[8px] items-start relative shrink-0 w-full">
                                <div className="flex flex-col items-center shrink-0">
                                  <Icon size={16} style={{ color: iconColor }} />
                                  {!isLast && (
                                    <div className="w-px flex-1 min-h-[16px] bg-[#1d2132] mt-[4px]" />
                                  )}
                                </div>
                                <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col font-['Gilroy',sans-serif] font-medium gap-[8px] items-start justify-center leading-[16px] min-w-px not-italic relative text-[14px]">
                                  <p className="relative shrink-0 text-[#a8b9f4] w-full">
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
                                      <span data-testid={`text-actor-role-${idx}`} className="text-[#6c779d]">
                                        {" "}
                                        · {actorRole}
                                      </span>
                                    )}
                                    {step.authority && (
                                      <span data-testid={`text-actor-authority-${idx}`} className="text-[#6c779d]">
                                        {" "}
                                        · {step.authority}
                                      </span>
                                    )}
                                  </p>
                                  {step.note && (
                                    <p className="relative shrink-0 text-[#414965] w-full">{step.note}</p>
                                  )}
                                  <p className="relative shrink-0 text-[#6c779d] w-full">{step.timestamp}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Evidence */}
              {record.linked.length > 0 && (
                <div className="relative shrink-0 w-full">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
                    <SectionHeader>Linked Evidence</SectionHeader>
                    <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                      {record.linked.map((link) => {
                        const ruleGone = link.kind === "rule" && !resolveRule(link.refId);
                        const vendorGone = link.kind === "vendor" && !resolveVendor(link.refId);
                        const invoiceGone = link.kind === "invoice" && !resolveDocument(link.refId);
                        const proposalGone = link.kind === "proposal" && !resolveProposal(link.refId);
                        const tappable =
                          (link.kind === "proposal" && !proposalGone) ||
                          (link.kind === "rule" && !ruleGone) ||
                          (link.kind === "vendor" && !vendorGone) ||
                          (link.kind === "invoice" && !invoiceGone);
                        const chipLabel = linkedRelationship(record, link) ?? link.kind;

                        if (!tappable) {
                          return (
                            <div
                              key={`${link.kind}-${link.refId}`}
                              data-testid={`text-linked-${link.kind}-${link.refId}`}
                              className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative rounded-[12px] shrink-0 w-full"
                            >
                              <div className="content-stretch flex flex-[1_0_0] gap-[16px] items-center min-w-px relative">
                                <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] text-center whitespace-nowrap uppercase">
                                    {chipLabel}
                                  </p>
                                </div>
                                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                                  {link.label}
                                </p>
                              </div>
                              {(ruleGone || vendorGone || invoiceGone || proposalGone) && (
                                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#414965] shrink-0">
                                  ({link.kind} unavailable)
                                </p>
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
                            className="bg-[#0a0c10] border border-[#1d2132] border-solid content-stretch flex gap-[16px] items-center px-[16px] py-[12px] relative rounded-[12px] shrink-0 w-full text-left hover:bg-[#11141b] hover:border-[#1d2132] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                          >
                            <div className="content-stretch flex flex-[1_0_0] gap-[16px] items-center min-w-px relative">
                              <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid content-stretch flex items-center justify-center px-[8px] py-[3px] relative rounded-[22px] shrink-0">
                                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] text-center whitespace-nowrap uppercase">
                                  {chipLabel}
                                </p>
                              </div>
                              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]">
                                {link.label}
                              </p>
                            </div>
                            <ChevronRight size={16} className="text-[#6c779d] shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Anchor Proof */}
              <div className="relative shrink-0 w-full">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
                  <SectionHeader>Anchor Proof</SectionHeader>
                  <AnchorStatus anchor={record.anchor} mode="proof" onVerify={handleVerify} />
                </div>
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
