import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CircleCheck, ChevronRight } from "lucide-react";
import closeIcon from "@assets/Close_1783208306441.png";
import { AnchorStatus } from "./AnchorStatus";
import { DocumentViewerPopup } from "./DocumentViewerPopup";
import { useCurrency } from "@/lib/currencyContext";
import { useLocation } from "wouter";
import type { Proposal } from "@/lib/proposalTypes";
import { AGENT_META, factColor, SectionLabel } from "./ProposalDetail";
import { MOCK_AUDIT_RECORDS } from "@/lib/mockAuditRecords";
import { openRuleDetail, resolveRule } from "@/lib/openRuleDetail";
import { openDocumentDetail, resolveDocument } from "@/lib/openDocumentDetail";
import { type DocumentRecord, docKindLabel } from "@/lib/documentTypes";
import { RecordPager } from "./RecordPager";

/* ── Settled Approved Record Card ─────────────────────────────────────────────────────────────
   Post-approval / settled view of a proposal. Same layout as ProposalDetail,
   but with past-tense wording, no decision buttons, and AnchorStatus in
   STATUS mode. */

export function SettledRecordCard({
  proposal,
  open,
  onOpenChange,
  onViewAuditLog,
  anchorAuditId,
  onPrev,
  onNext,
  pagerDisabled,
}: {
  proposal: Proposal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewAuditLog?: () => void;
  anchorAuditId?: string;
  /* header pager — cycle through the other records in the active tab */
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
}) {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);

  if (!proposal) return null;

  const realAnchor = (() => {
    if (!proposal.auditId) return null;
    const rec = MOCK_AUDIT_RECORDS.find(
      (r) => r.anchor.auditId === proposal.auditId || r.id === proposal.auditId,
    );
    return rec?.anchor ?? null;
  })();

  const agent = AGENT_META[proposal.agent];
  const AgentIcon = agent.icon;
  const isAuto = proposal.status === "auto_handled";
  const headline = proposal.pastTenseStatement ?? proposal.title;
  const meta = proposal.settledMeta ?? proposal.actionMeta;

  return (
    <>
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {/* Header */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
            <div className="flex items-center gap-[8px] flex-1 min-w-px">
              <div className="flex items-center justify-center size-[28px] rounded-[8px] bg-[#0a2a0a] shrink-0">
                <CircleCheck size={16} className="text-[#42bf23]" />
              </div>
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#a8b9f4]">
                {isAuto ? "Auto-approved · executed" : "You approved · executed"}
              </span>
              <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#414965]">{proposal.auditId}</span>
            </div>
            {onPrev && onNext && (
              <RecordPager
                onPrev={onPrev}
                onNext={onNext}
                disabled={pagerDisabled}
                testIdPrefix="settled-record"
              />
            )}
            <DialogPrimitive.Close
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
              data-testid="button-close-settled-card"
            >
              <img src={closeIcon} alt="" className="size-[14px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[20px] items-start p-[24px] w-full overflow-y-auto">
            {/* Title + meta */}
            <div className="flex flex-col gap-[6px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-[#a8b9f4]">{headline}</p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">{meta}</p>
            </div>

            {/* Reasoning — condensed (rationale only, no full confidence band) */}
            <div className="flex flex-col gap-[8px] w-full">
              <SectionLabel>Why Brain proposed this</SectionLabel>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[20px] text-[#6c779d]">{proposal.rationale}</p>
            </div>

            {/* Facts */}
            {proposal.facts && proposal.facts.length > 0 && (
              <div className="flex flex-col gap-[6px] w-full">
                <SectionLabel>Key facts</SectionLabel>
                <div className="bg-[#0a0c10] rounded-[8px] p-[12px] flex flex-col gap-[6px] w-full">
                  {proposal.facts.map((f, i) => (
                    <div key={i} className="flex gap-[8px] w-full">
                      <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#414965] uppercase">{f.label}</span>
                      <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] font-medium flex-1 text-right" style={{ color: factColor(f.severity) }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Handoff timeline if present */}
            {proposal.handoffTimeline && proposal.handoffTimeline.length > 0 && (
              <div className="flex flex-col gap-[8px] w-full">
                <SectionLabel>Execution timeline</SectionLabel>
                <div className="flex flex-col gap-[8px] w-full">
                  {proposal.handoffTimeline.map((step, idx) => (
                    <div key={idx} className="flex gap-[8px] items-start w-full">
                      <div className={`size-[8px] rounded-full shrink-0 mt-[4px] ${step.done ? "bg-[#42bf23]" : "bg-[#414965]"}`} />
                      <div className="flex flex-col flex-1 min-w-px">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#a8b9f4]">{step.label}</p>
                        <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#6c779d]">{step.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cleared by rule — links to RuleDetail when the governing rule
                still resolves; a deleted rule shows a muted "(rule unavailable)". */}
            {proposal.rule && (() => {
              const ruleGone = !resolveRule(proposal.rule!.id);
              if (ruleGone) {
                return (
                  <div className="flex flex-col gap-[8px] w-full">
                    <SectionLabel>Cleared by rule</SectionLabel>
                    <div
                      data-testid="text-cleared-by-rule"
                      className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0a0c10] w-full"
                    >
                      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] flex-1 min-w-px">{proposal.rule!.name}</span>
                      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#414965] shrink-0">(rule unavailable)</span>
                    </div>
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-[8px] w-full">
                  <SectionLabel>Cleared by rule</SectionLabel>
                  <button
                    type="button"
                    onClick={() => { openRuleDetail(proposal.rule!.id, navigate); onOpenChange(false); }}
                    data-testid="button-cleared-by-rule"
                    className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0a0c10] hover:bg-[#11141b] border border-transparent hover:border-[#7631ee]/40 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4] flex-1 min-w-px">{proposal.rule!.name}</span>
                    <ChevronRight size={14} className="text-[#414965] shrink-0" />
                  </button>
                </div>
              );
            })()}

            {/* Source document — tappable when invoiceId resolves */}
            {proposal.invoiceId && (() => {
              const srcDoc = resolveDocument(proposal.invoiceId);
              if (!srcDoc) {
                return (
                  <div className="flex flex-col gap-[8px] w-full">
                    <SectionLabel>Source document</SectionLabel>
                    <div
                      data-testid="text-source-invoice-unavailable"
                      className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0a0c10] w-full"
                    >
                      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] flex-1 min-w-px">{proposal.invoiceId}</span>
                      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#414965] shrink-0">(document unavailable)</span>
                    </div>
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-[8px] w-full">
                  <SectionLabel>Source document</SectionLabel>
                  <button
                    type="button"
                    onClick={() => openDocumentDetail(proposal.invoiceId, (d) => { setViewingDocument(d); setDocumentOpen(true); })}
                    data-testid="button-source-invoice"
                    className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0a0c10] hover:bg-[#11141b] border border-transparent hover:border-[#7631ee]/40 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] uppercase text-[#414965] tracking-[0.04em]">{docKindLabel(srcDoc.kind)}</span>
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4] flex-1 min-w-px">#{proposal.invoiceId}</span>
                    <ChevronRight size={14} className="text-[#414965] shrink-0" />
                  </button>
                </div>
              );
            })()}

            {/* Anchor Status — status mode */}
            <div className="h-px w-full bg-[#1d2132]" />
            <div className="flex flex-col gap-[8px] w-full">
              <SectionLabel>Governance record</SectionLabel>
              <AnchorStatus
                anchor={realAnchor ?? {
                  status: "pending_next_batch",
                  auditId: proposal.auditId,
                }}
                mode="status"
                onViewFullRecord={onViewAuditLog}
              />
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
