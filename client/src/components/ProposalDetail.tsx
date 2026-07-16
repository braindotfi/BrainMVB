import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  Receipt,
  HandCoins,
  Landmark,
  BookCheck,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Check,
  CircleCheckBig,
  Flag,
  PauseCircle,
  SlidersHorizontal,
  Sparkles,
  CreditCard,
  TrendingUp,
  MessageSquare,
  Scale,
  LineChart,
  RefreshCw,
  Repeat2,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { useCurrency } from "@/lib/currencyContext";
import { resolveRule } from "@/lib/openRuleDetail";
import { openDocumentDetail, resolveDocument } from "@/lib/openDocumentDetail";
import { DocumentViewerPopup } from "./DocumentViewerPopup";
import { type DocumentRecord, docKindLabel } from "@/lib/documentTypes";
import { useBrainInvoiceDocument } from "@/lib/brainInvoiceDocument";
import type {
  Proposal,
  ProposalStatus,
  Agent,
  Severity,
  FactRow,
} from "@/lib/proposalTypes";

/* Title case helper, used for all labels platform-wide */
function titleCase(str: string) {
  return str
    .replace(/(^| )&($| )/g, "$1and$2")
    .replace(/\w\S*/g, (txt) => {
      const lower = txt.toLowerCase();
      if (lower === "ap" || lower === "ar") return lower.toUpperCase();
      return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
    });
}

/* Brain is PROPOSE-ONLY. One component renders every scenario; sections appear
   or collapse based on which fields are present. #D20344 is reserved for
   alerts, flags, danger only. Purple is the affirmative accent. */

export type ProposalAction = "approve" | "reject" | "postpone" | "verifyFirst";

const ALERT = "#d20344";

export const AGENT_META: Record<Agent, { label: string; shortLabel: string; icon: LucideIcon }> = {
  /* Legacy agent types - kept for backward compat with live brain-core data */
  invoice:              { label: "Invoice Agent",               shortLabel: "Payment",               icon: Receipt       },
  collections:          { label: "Collections Agent",           shortLabel: "Collections",            icon: HandCoins     },
  cash:                 { label: "Cash Agent",                  shortLabel: "Treasury",               icon: Landmark      },
  close:                { label: "Close Agent",                 shortLabel: "Reconciliation",         icon: BookCheck     },
  /* New agent types matching Figma designs */
  vendor_risk:          { label: "Vendor Risk Agent",           shortLabel: "Vendor Risk",            icon: ShieldAlert   },
  payment:              { label: "Payment Agent",               shortLabel: "Payment",                icon: CreditCard    },
  treasury:             { label: "Treasury Agent",              shortLabel: "Treasury",               icon: Landmark      },
  cash_forecast:        { label: "Cash Forecast Agent",         shortLabel: "Cash Forecasting",       icon: TrendingUp    },
  dispute:              { label: "Dispute Agent",               shortLabel: "Dispute",                icon: MessageSquare },
  compliance:           { label: "Compliance Agent",            shortLabel: "Compliance",             icon: Scale         },
  revenue_intelligence: { label: "Revenue Intelligence Agent",  shortLabel: "Revenue Intelligence",   icon: LineChart     },
  reconciliation:       { label: "Reconciliation Agent",        shortLabel: "Reconciliation",         icon: RefreshCw     },
  subscription:         { label: "Subscription Agent",          shortLabel: "Subscription",           icon: Repeat2       },
  fraud_anomaly:        { label: "Fraud and Anomaly Agent",     shortLabel: "Fraud and Anomaly",      icon: ScanSearch    },
};

/* Status badge config for the hero section */
function getStatusBadge(severity: Severity): { label: string; className: string; Icon?: LucideIcon } {
  switch (severity) {
    case "danger":
      return {
        label: "High Risk",
        className: "bg-[#350011] text-[#d20344] border border-[rgba(210,3,68,0.2)]",
        Icon: ShieldAlert,
      };
    case "warning":
      return {
        label: "Elevated",
        className: "bg-[#4a2300] text-[#ff9500] border border-[rgba(255,149,0,0.2)]",
      };
    case "info":
      return {
        label: "Standard",
        className: "bg-[#222737] text-[#a8b9f4] border border-[rgba(168,185,244,0.2)]",
      };
    case "clean":
    default:
      return {
        label: "Standard",
        className: "bg-[#222737] text-[#6c779d] border border-[rgba(108,119,157,0.2)]",
      };
  }
}

/* Pills: danger → alert red; warning → gold; info → baby blue; clean → purple. */
export function chipClasses(severity: Severity): string {
  switch (severity) {
    case "danger":
      return "bg-[#350011] text-[#d20344]";
    case "warning":
      return "bg-[#3a2600] text-[#ff9500]";
    case "info":
      return "bg-[#1d2132] text-[#a8b9f4]";
    case "clean":
    default:
      return "bg-[#240757] text-[#7631ee]";
  }
}

export function factColor(severity?: Severity): string {
  if (severity === "danger") return ALERT;
  if (severity === "warning") return "#ff9500";
  return "#a8b9f4";
}

export const SectionLabel = ({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) => (
  <div className="flex gap-[8px] items-center w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">
      {children}
    </p>
    <div className="flex-1 h-px bg-[#1d2132]" />
    {trailing}
  </div>
);

export function ProposalDetail({
  proposal,
  currentStatus,
  open,
  onOpenChange,
  onAction,
  rulePaused,
  onPauseRule,
  onReviewRule,
  onReportProblem,
  onAlwaysHandle,
  onPrev,
  onNext,
  pagerDisabled,
}: {
  proposal: Proposal | null;
  currentStatus?: ProposalStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /* Header pager. Cycle through the other records in the active tab */
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
  onAction: (action: ProposalAction) => void;
  /* Auto_handled receipt. Retroactive controls (decision already happened) */
  rulePaused?: boolean;
  onPauseRule?: (proposal: Proposal) => void;
  onReviewRule?: (proposal: Proposal) => void;
  onReportProblem?: (proposal: Proposal, report: { reason: string; note: string; pause: boolean }) => void;
  /* Routine pending proposal. Promote into a standing rule via the create flow */
  onAlwaysHandle?: (proposal: Proposal) => void;
}) {
  const { format } = useCurrency();
  const [showTrace, setShowTrace] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  // A LIVE proposal's invoiceId is a brain-core ledger id; fetch its invoice as a DocumentRecord
  // so the source-document link opens the REAL invoice (the mock store holds only design fixtures).
  // Returns undefined for a mock proposal's invoiceId, so we fall back to resolveDocument below.
  const liveInvoiceDoc = useBrainInvoiceDocument(proposal?.invoiceId);

  if (!proposal) return null;

  const agent = AGENT_META[proposal.agent];
  const AgentIcon = agent.icon;
  const confidencePct = Math.round(proposal.confidence.score * 100);
  const effectiveStatus = currentStatus ?? proposal.status;
  const isReceipt = effectiveStatus === "auto_handled";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="proposal-detail-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby="proposal-detail-rationale"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="proposal-detail"
        >
          {/* Header: short agent name centered + close X (matches Figma) */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full flex items-center justify-center">
            <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] whitespace-nowrap">
              {agent.shortLabel}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-proposal-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[32px] items-start p-[24px] w-full overflow-y-auto">
          {isReceipt ? (
            <AutoHandledReceipt
              proposal={proposal}
              format={format}
              rulePaused={rulePaused}
              onPauseRule={onPauseRule}
              onReviewRule={onReviewRule}
              onReportProblem={onReportProblem}
            />
          ) : (
          <>
            {/* ── Hero section: status badge + title + amount + subtitle ─────── */}
            {(() => {
              const badge = getStatusBadge(proposal.severity);
              const BadgeIcon = badge.Icon;
              return (
                <div className="flex flex-col gap-[16px] items-start w-full border-b border-[#1d2132] pb-[24px]">
                  <span className={`inline-flex items-center gap-[5px] px-[10px] py-[5px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] whitespace-nowrap ${badge.className}`}>
                    {BadgeIcon && <BadgeIcon size={12} className="shrink-0" />}
                    {badge.label}
                  </span>
                  <div className="flex items-start justify-between gap-[12px] w-full">
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-semibold leading-[26px] text-[#a8b9f4] text-[20px]"
                      data-testid="text-action-statement"
                    >
                      {proposal.title}
                    </p>
                    {proposal.amount != null && (
                      <p className="[font-family:'JetBrains_Mono',monospace] font-bold text-[20px] leading-[26px] text-[#a8b9f4] whitespace-nowrap shrink-0">
                        {format(proposal.amount)}
                      </p>
                    )}
                  </div>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#6c779d]">
                    {proposal.rowSubtitle}
                  </p>
                </div>
              );
            })()}

            {/* ── Why Brain Suggested This: rationale + optional bullets ─────── */}
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>Why Brain Suggested This</SectionLabel>
              <p
                id="proposal-detail-rationale"
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full"
              >
                {proposal.rationale}
              </p>
              {proposal.bullets && proposal.bullets.length > 0 && (
                <div className="flex flex-col gap-[8px] w-full pl-[4px]">
                  {proposal.bullets.map((bullet, i) => (
                    <div key={i} className="flex gap-[10px] items-start">
                      <span className="shrink-0 w-[5px] h-[5px] rounded-full bg-[#414965] mt-[7px]" />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                        {bullet}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Confidence: score + band ──────────────────────────────────── */}
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel
                trailing={
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[14px] leading-[14px] text-[#6c779d] whitespace-nowrap" data-testid="text-confidence">
                    {proposal.confidence.band} · {confidencePct}%
                  </span>
                }
              >
                Confidence
              </SectionLabel>
              {proposal.confidence.caveat && (
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px] w-full">
                  {proposal.confidence.caveat}
                </p>
              )}
            </div>

            {/* ── What Brain Found: facts table ────────────────────────────── */}
            {proposal.facts && proposal.facts.length > 0 && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>What Brain Found</SectionLabel>
                <div className="bg-[#0a0c10] border border-[#1d2132] border-solid rounded-[12px] w-full flex flex-col">
                  {proposal.facts.map((fact, i) => {
                    const isLast = i === proposal.facts!.length - 1;
                    return (
                      <div
                        key={`fact-${i}`}
                        className={`flex items-start w-full ${!isLast ? "border-b border-[#1d2132]" : ""}`}
                        data-testid={`brain-found-${i}`}
                      >
                        <div className="flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[140px]">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[12px] whitespace-nowrap">
                            {titleCase(fact.label)}
                          </p>
                        </div>
                        <div className="flex flex-1 flex-col items-start justify-center min-w-px px-[12px] py-[8px]">
                          <p
                            className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[13px]"
                            style={{ color: factColor(fact.severity) }}
                          >
                            {fact.value}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Linked Evidence ────────────────────────────────────────────── */}
            {proposal.evidence.length > 0 && (
              <div className="flex flex-col gap-[8px] items-start w-full">
                <SectionLabel>Linked Evidence</SectionLabel>
                {proposal.evidence.map((ev, i) => {
                  const doc = ev.documentId ? resolveDocument(ev.documentId) : undefined;
                  const clickable = !!doc;
                  const onClick = () => {
                    if (doc) {
                      setViewingDocument(doc);
                      setDocumentOpen(true);
                    }
                  };
                  const Wrapper = clickable ? "button" : "div";
                  return (
                    <Wrapper
                      key={`ev-${i}`}
                      type={clickable ? "button" : undefined}
                      onClick={clickable ? onClick : undefined}
                      data-testid={`linked-evidence-${i}`}
                      className={`flex items-center gap-[16px] px-[16px] py-[12px] rounded-[12px] bg-[#0a0c10] border border-[#1d2132] w-full text-left ${clickable ? "hover:bg-[#11141b] hover:border-[#7631ee]/40 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]" : ""}`}
                    >
                      <div className="flex flex-1 gap-[16px] items-center min-w-px">
                        <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] whitespace-nowrap px-[8px] py-[3px] rounded-[22px] bg-[#222737] border border-[rgba(108,119,157,0.2)]">
                          {titleCase(ev.kind.replace("_", " "))}
                        </span>
                        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                          {ev.title}
                        </p>
                      </div>
                      {clickable && <ChevronRight size={16} className="text-[#414965] shrink-0" />}
                    </Wrapper>
                  );
                })}
                {/* Source document: tappable link when invoiceId resolves (legacy fallback) */}
                {proposal.invoiceId && (() => {
                  const srcDoc = liveInvoiceDoc ?? resolveDocument(proposal.invoiceId);
                  if (!srcDoc) return null;
                  const openSource = () => {
                    if (liveInvoiceDoc) {
                      setViewingDocument(liveInvoiceDoc);
                      setDocumentOpen(true);
                    } else {
                      openDocumentDetail(proposal.invoiceId, (d) => { setViewingDocument(d); setDocumentOpen(true); });
                    }
                  };
                  return (
                    <button
                      type="button"
                      onClick={openSource}
                      data-testid="button-source-invoice"
                      className="flex items-center gap-[8px] p-[10px] rounded-[10px] bg-[#0a0c10] hover:bg-[#11141b] border border-transparent hover:border-[#7631ee]/40 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                    >
                      <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] text-[#414965]">{docKindLabel(srcDoc.kind)}</span>
                      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4] flex-1 min-w-px">#{srcDoc.id}</span>
                      <ChevronRight size={14} className="text-[#414965] shrink-0" />
                    </button>
                  );
                })()}
              </div>
            )}

            {/* ── Recommended Action ───────────────────────────────────────── */}
            {proposal.recommendedAction && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>Recommended Action</SectionLabel>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full">
                  {proposal.recommendedAction}
                </p>
              </div>
            )}

            {/* ── What Happens Next ────────────────────────────────────────── */}
            {proposal.whatHappensNext && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>What Happens Next</SectionLabel>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full">
                  {proposal.whatHappensNext}
                </p>
              </div>
            )}

            {/* ── Sweep math: reconciling mono breakdown (only when present) ── */}
            {proposal.sweepMath && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>The Math: Your Account Is Not Drained</SectionLabel>
                <div className="bg-[#0a0c10] rounded-[12px] w-full p-[14px] flex flex-col gap-[8px] [font-family:'JetBrains_Mono',monospace] text-[13px] leading-[18px]">
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-[#6c779d]">total cash</span>
                    <span className="text-[#a8b9f4]">{format(proposal.sweepMath.totalCash)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-[#6c779d]">– {proposal.sweepMath.bufferMonths}-month buffer</span>
                    <span className="text-[#a8b9f4]">−{format(proposal.sweepMath.bufferAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-[#6c779d]">– pending AP</span>
                    <span className="text-[#a8b9f4]">−{format(proposal.sweepMath.pendingAP)}</span>
                  </div>
                  <div className="h-px w-full bg-[#1d2132] my-[2px]" />
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-[#7631ee]">sweepable</span>
                    <span className="text-[#7631ee]">
                      {format(proposal.sweepMath.totalCash - proposal.sweepMath.bufferAmount - proposal.sweepMath.pendingAP)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-[#6c779d]">proposed sweep</span>
                    <span className="text-[#a8b9f4]">{format(proposal.sweepMath.sweepAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-[#6c779d]">operating after</span>
                    <span className="text-[#42bf23]">{format(proposal.sweepMath.operatingAfter)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-[#6c779d]">runway after</span>
                    <span className="text-[#a8b9f4]">{proposal.sweepMath.runwayAfterMonths} months</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── If This Is Wrong: risk + policy (only when risk text is set) ── */}
            {proposal.risk && (
              <div className="flex flex-col gap-[16px] items-start w-full">
                <SectionLabel>If This Is Wrong</SectionLabel>
                <div className="bg-[#350011] border border-[rgba(210,3,68,0.2)] rounded-[12px] w-full p-[8px] flex items-start gap-[8px]">
                  <ShieldAlert size={16} className="shrink-0" style={{ color: ALERT }} />
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[14px] w-full" style={{ color: ALERT }}>
                    {proposal.risk}
                  </p>
                </div>
                <div className="w-full flex flex-col gap-[16px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
                    Flagged by{" "}
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[#a8b9f4]">{proposal.policy.id}</span>
                    {" "}- {proposal.policy.explanation}.
                  </p>
                  {proposal.policy.autoClearedOtherwise && (
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#414965] text-[13px]">
                      Would have auto-cleared otherwise.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Actions footer ────────────────────────────────────────────── */}
            <div className="flex flex-col gap-[16px] items-start w-full">
              {proposal.actions.verifyFirst && (
                <button
                  type="button"
                  onClick={() => onAction("verifyFirst")}
                  data-testid="button-verify-first"
                  className="flex flex-col items-center justify-center w-full px-[20px] py-[12px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
                    {proposal.actions.verifyFirst.label}
                  </span>
                  {proposal.actions.verifyFirst.sublabel && (
                    <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[12px]">
                      {proposal.actions.verifyFirst.sublabel}
                    </span>
                  )}
                </button>
              )}
              <div className="flex gap-[10px] items-stretch w-full">
                <ActionButton
                  testId="button-reject"
                  onClick={() => onAction("reject")}
                  label={proposal.actions.reject.label}
                  variant="reject"
                />
                <ActionButton
                  testId="button-postpone"
                  onClick={() => onAction("postpone")}
                  label={proposal.actions.postpone.label}
                  variant="postpone"
                />
                <ActionButton
                  testId="button-approve"
                  onClick={() => onAction("approve")}
                  label={proposal.actions.approve.label}
                  variant="approve"
                />
              </div>

              {/* Routine proposal: promote into a standing rule (create flow). */}
              {proposal.batchApprovable && onAlwaysHandle && (
                <button
                  type="button"
                  onClick={() => onAlwaysHandle(proposal)}
                  data-testid="button-always-handle"
                  className="flex w-full items-center justify-center gap-[8px] px-[16px] py-[10px] rounded-[100px] bg-[#0a0c10] border border-[#1d2132] hover:border-[rgba(118,49,238,0.45)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <Sparkles size={15} className="text-[#7631ee] shrink-0" />
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[14px] text-[#a8b9f4]">
                    Always handle this for me
                  </span>
                </button>
              )}
            </div>

          </>
          )}

            {/* Technical detail: raw six-layer trace / JSON, collapsed */}
            <div className="w-full border-t border-[#1d2132] pt-[16px]">
              <button
                type="button"
                onClick={() => setShowTrace((s) => !s)}
                data-testid="button-toggle-trace"
                className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-[#414965] hover:text-[#6c779d] transition-colors uppercase"
              >
                <ChevronDown size={14} className={`transition-transform ${showTrace ? "rotate-180" : ""}`} />
                Technical detail
              </button>
              {showTrace && (
                <pre
                  data-testid="trace-json"
                  className="mt-[12px] bg-[#06070a] rounded-[12px] p-[14px] w-full overflow-x-auto [font-family:'JetBrains_Mono',monospace] text-[11px] leading-[16px] text-[#6c779d] whitespace-pre"
                >
{JSON.stringify(buildTrace(proposal, currentStatus), null, 2)}
                </pre>
              )}
            </div>
          </div>

          {/* Footer: Previous/Next pill buttons (matches Figma) */}
          {onPrev && onNext && (
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-solid border-t content-stretch flex flex-col items-start p-[24px] relative shrink-0 w-full">
              <div className="content-stretch flex gap-[16px] items-center relative shrink-0 w-full">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={pagerDisabled}
                  data-testid="button-proposal-prev"
                  className="flex-[1_0_0] flex items-center justify-center gap-[8px] min-w-px px-[20px] py-[8px] rounded-[100px] bg-[#222737] text-[#6c779d] hover:bg-[#2c3247] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#222737] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <ArrowLeft size={16} className="shrink-0" />
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px]">Previous</span>
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={pagerDisabled}
                  data-testid="button-proposal-next"
                  className="flex-[1_0_0] flex items-center justify-center gap-[8px] min-w-px px-[20px] py-[8px] rounded-[100px] bg-[#222737] text-[#6c779d] hover:bg-[#2c3247] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#222737] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px]">Next</span>
                  <ArrowRight size={16} className="shrink-0" />
                </button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <DocumentViewerPopup
        document={viewingDocument}
        open={documentOpen}
        onOpenChange={setDocumentOpen}
      />
    </DialogPrimitive.Root>
  );
}

/* Auto-handled RECEIPT: a record of a payment Brain already approved and settled
   under the user's standing rule. NO approve/reject/postpone/verify; the decision
   already happened and the money already moved. Retroactive controls only. ───── */
const REPORT_PRESETS = [
  "I didn't recognize this vendor",
  "Wrong amount",
  "Should have asked me first",
  "Duplicate of another payment",
  "Other",
];

function AutoHandledReceipt({
  proposal,
  format,
  rulePaused,
  onPauseRule,
  onReviewRule,
  onReportProblem,
}: {
  proposal: Proposal;
  format: (a: string | number) => string;
  rulePaused?: boolean;
  onPauseRule?: (proposal: Proposal) => void;
  onReviewRule?: (proposal: Proposal) => void;
  onReportProblem?: (proposal: Proposal, report: { reason: string; note: string; pause: boolean }) => void;
}) {
  const rule = proposal.rule;
  const paused = rulePaused ?? (rule ? !rule.active : false);
  // The link resolves only while the rule still exists in the store; a deleted
  // rule keeps the receipt readable but renders a muted "(rule unavailable)" note.
  const ruleResolves = !!rule && !!resolveRule(rule.id);
  /* Report flow is a small wizard: idle -> "reason" capture -> "confirm" safety
     action -> done. Never auto-advances; the user drives every step. */
  const [reportStep, setReportStep] = useState<"idle" | "reason" | "confirm" | "done">("idle");
  const [didPause, setDidPause] = useState(false);
  const [preset, setPreset] = useState("");
  const [note, setNote] = useState("");

  /* Reset the report panel whenever a different receipt is opened. */
  useEffect(() => {
    setReportStep("idle");
    setDidPause(false);
    setPreset("");
    setNote("");
  }, [proposal.id]);

  const reasonReady = preset !== "" || note.trim().length > 0;
  const effectiveReason = preset || (note.trim() ? "Other" : "");
  const submit = (pause: boolean) => {
    onReportProblem?.(proposal, { reason: effectiveReason, note: note.trim(), pause });
    if (!pause) {
      setDidPause(false);
      setReportStep("done");
    }
    // When pause=true the parent navigates to RuleDetail, so no "done" state needed here.
  };

  return (
    <>
      {/* ── Hero section: Auto-Approved badge + title + amount + subtitle ─── */}
      <div className="flex flex-col gap-[16px] items-start w-full border-b border-[#1d2132] pb-[24px]">
        <span
          data-testid="chip-auto-handled"
          className="inline-flex items-center gap-[5px] px-[10px] py-[5px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] whitespace-nowrap bg-[#123509] text-[#42bf23] border border-[rgba(66,191,35,0.2)]"
        >
          <CircleCheckBig size={12} className="shrink-0" />
          Auto-Approved
        </span>
        <div className="flex items-start justify-between gap-[12px] w-full">
          <p
            className="[font-family:'Gilroy',sans-serif] font-semibold leading-[26px] text-[#a8b9f4] text-[20px]"
            data-testid="text-past-tense"
          >
            {proposal.pastTenseStatement}
          </p>
          {proposal.amount != null && (
            <p className="[font-family:'JetBrains_Mono',monospace] font-bold text-[20px] leading-[26px] text-[#a8b9f4] whitespace-nowrap shrink-0">
              {format(proposal.amount)}
            </p>
          )}
        </div>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#6c779d]">
          {proposal.rowSubtitle}
        </p>
      </div>

      {/* ── Why This Didn't Need Review ───────────────────────────────────── */}
      <div className="flex flex-col gap-[16px] items-start w-full">
        <SectionLabel>Why This Didn't Need Review</SectionLabel>
        <p
          id="proposal-detail-rationale"
          className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full"
        >
          {proposal.rationale}
        </p>
        {proposal.bullets && proposal.bullets.length > 0 && (
          <div className="flex flex-col gap-[8px] w-full pl-[4px]">
            {proposal.bullets.map((bullet, i) => (
              <div key={i} className="flex gap-[10px] items-start">
                <span className="shrink-0 w-[5px] h-[5px] rounded-full bg-[#414965] mt-[7px]" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                  {bullet}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── What happened: timeline (shown when no bullets, backward compat) ── */}
      {!proposal.bullets && proposal.handoffTimeline && proposal.handoffTimeline.length > 0 && (
        <div className="flex flex-col gap-[16px] items-start w-full">
          <SectionLabel>What Happened</SectionLabel>
          <div className="flex flex-col w-full">
            {proposal.handoffTimeline.map((step, i, arr) => (
              <div key={i} className="flex gap-[12px] items-stretch w-full" data-testid={`timeline-step-${i}`}>
                {/* rail */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="flex items-center justify-center size-[22px] rounded-full bg-[#123509] shrink-0">
                    <Check size={13} className="text-[#42bf23]" strokeWidth={2.5} />
                  </div>
                  {i < arr.length - 1 && <div className="w-[2px] flex-1 bg-[#1d2132] my-[2px]" />}
                </div>
                {/* content */}
                <div className={`flex flex-col gap-[2px] pb-[12px] ${i === arr.length - 1 ? "" : ""}`}>
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-[#a8b9f4]">
                    {step.label}
                  </p>
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#414965]">
                    {step.timestamp}
                    {step.note && <span className="text-[#414965]"> · {step.note}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── What Brain Cleared ────────────────────────────────────────────── */}
      {proposal.clearedBecause && proposal.clearedBecause.length > 0 && (
        <div className="flex flex-col gap-[16px] items-start w-full">
          <SectionLabel>What Brain Cleared</SectionLabel>
          <div className="bg-[#0a0c10] border border-[#1d2132] border-solid rounded-[12px] w-full flex flex-col">
            {proposal.clearedBecause.map((fact, i) => {
              const isLast = i === proposal.clearedBecause!.length - 1;
              return (
                <div
                  key={`cleared-${i}`}
                  className={`flex items-start w-full ${!isLast ? "border-b border-[#1d2132]" : ""}`}
                >
                  <div className="flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[140px]">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[12px] whitespace-nowrap">
                      {titleCase(fact.label)}
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col items-start justify-center min-w-px px-[12px] py-[8px]">
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[13px]"
                      style={{ color: factColor(fact.severity) }}
                    >
                      {fact.value}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recommended Action (for new Figma-style auto proposals) ──────── */}
      {proposal.recommendedAction && (
        <div className="flex flex-col gap-[16px] items-start w-full">
          <SectionLabel>Recommended Action</SectionLabel>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full">
            {proposal.recommendedAction}
          </p>
        </div>
      )}

      {/* ── The Rule That Authorized ──────────────────────────────────────── */}
      {rule && (() => {
        const cardInner = (
          <>
            <div className="flex items-center gap-[8px] w-full">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[14px]">
                {rule.name}
              </span>
            </div>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px]">
              {rule.createdLabel}
            </p>
          </>
        );
        return (
          <div className="flex flex-col gap-[16px] items-start w-full">
            <SectionLabel>The Rule That Authorized This</SectionLabel>
            {ruleResolves ? (
              <button
                type="button"
                onClick={() => onReviewRule?.(proposal)}
                data-testid="button-rule-card"
                className="w-full rounded-[12px] border border-[#1d2132] bg-[#0a0c10] p-[14px] flex flex-col gap-[10px] text-left hover:border-[#7631ee]/40 hover:bg-[#0d0f16] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                {cardInner}
              </button>
            ) : (
              <div className="w-full rounded-[12px] border border-[#1d2132] bg-[#0a0c10] p-[14px] flex flex-col gap-[10px]">
                {cardInner}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Info note: this is a record, not a request ───────────────────── */}
      <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] rounded-[8px] w-full p-[12px]">
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[13px]">
          This is a record, not a request. It is already settled. You can change how Brain handles these going forward.
        </p>
      </div>

      {/* FOOTER: retroactive controls only. No approve/reject/postpone/verify. */}
      <div className="flex flex-col gap-[16px] items-start w-full">
        {paused && (
          <div
            data-testid="text-rule-paused-confirm"
            className="w-full rounded-[8px] bg-[#123509] border border-[rgba(66,191,35,0.25)] px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#42bf23]"
          >
            {rule ? `"${titleCase(rule.name)}" is paused. Brain won't auto-clear payments like this until you turn it back on.` : "Rule paused."}
          </div>
        )}
        <div className="flex gap-[10px] items-stretch w-full">
          <button
            type="button"
            disabled={paused}
            onClick={() => onPauseRule?.(proposal)}
            data-testid="button-pause-rule"
            className="flex flex-1 items-center justify-center gap-[8px] px-[12px] py-[10px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
          >
            <PauseCircle size={16} className="text-[#a8b9f4] shrink-0" />
            <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[14px] text-[#a8b9f4] whitespace-nowrap">
              {paused ? "Rule paused" : "Pause this rule"}
            </span>
          </button>
          <button
            type="button"
            disabled={!ruleResolves}
            onClick={() => onReviewRule?.(proposal)}
            data-testid="button-review-rule"
            className="flex flex-1 items-center justify-center gap-[8px] px-[12px] py-[10px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.35)] hover:bg-[#2e0a6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
          >
            <SlidersHorizontal size={16} className="text-[#7631ee] shrink-0" />
            <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[14px] text-[#7631ee] whitespace-nowrap">
              Review rule
            </span>
          </button>
        </div>

        {/* Report a problem: the escape hatch. #D20344 is the ONLY red here. */}
        {reportStep === "idle" && (
          <button
            type="button"
            onClick={() => setReportStep("reason")}
            data-testid="button-report-problem"
            className="flex w-full items-center justify-center gap-[8px] px-[16px] py-[12px] rounded-[100px] bg-[#350011] hover:bg-[#4a0018] transition-colors focus:outline-none focus-visible:ring-2"
            style={{ ["--tw-ring-color" as string]: ALERT }}
          >
            <Flag size={16} className="shrink-0" style={{ color: ALERT }} />
            <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[14px]" style={{ color: ALERT }}>
              Report a problem with this payment
            </span>
          </button>
        )}

        {/* Step 1: capture a reason. Preset chips + optional free-text note. */}
        {reportStep === "reason" && (
          <div className="w-full rounded-[12px] border border-[rgba(210,3,68,0.3)] bg-[#0a0c10] p-[14px] flex flex-col gap-[12px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[14px]" style={{ color: ALERT }}>
              What went wrong?
            </p>
            <div className="flex flex-wrap gap-[8px]">
              {REPORT_PRESETS.map((p) => {
                const selected = preset === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(selected ? "" : p)}
                    data-testid={`chip-report-reason-${p.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`}
                    aria-pressed={selected}
                    className="px-[12px] py-[6px] rounded-[100px] border transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] focus:outline-none focus-visible:ring-2"
                    style={
                      selected
                        ? { backgroundColor: "rgba(210,3,68,0.15)", borderColor: ALERT, color: ALERT, ["--tw-ring-color" as string]: ALERT }
                        : { backgroundColor: "#06070a", borderColor: "#1d2132", color: "#a8b9f4", ["--tw-ring-color" as string]: "#414965" }
                    }
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="input-report-note"
              placeholder="Add a note (optional)..."
              rows={2}
              className="w-full resize-none rounded-[8px] bg-[#06070a] border border-[#1d2132] px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#a8b9f4] placeholder:text-[#414965] focus:outline-none focus-visible:border-[rgba(210,3,68,0.5)]"
            />
            <div className="flex gap-[10px] items-stretch w-full">
              <button
                type="button"
                onClick={() => { setReportStep("idle"); setPreset(""); setNote(""); }}
                data-testid="button-report-cancel"
                className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reasonReady}
                onClick={() => setReportStep("confirm")}
                data-testid="button-report-continue"
                className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#350011] hover:bg-[#4a0018] transition-colors disabled:opacity-50 disabled:cursor-not-allowed [font-family:'Gilroy',sans-serif] font-semibold text-[13px] focus:outline-none focus-visible:ring-2"
                style={{ color: ALERT, ["--tw-ring-color" as string]: ALERT }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: confirm the safety action. Pausing is NEVER silent. */}
        {reportStep === "confirm" && (
          <div className="w-full rounded-[12px] border border-[rgba(210,3,68,0.3)] bg-[#0a0c10] p-[14px] flex flex-col gap-[12px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[14px] text-[#a8b9f4]">
              Want to pause this rule while you review?
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px]">
              Pausing{rule ? ` "${titleCase(rule.name)}"` : " the rule"} stops it from auto-clearing new payments and flags similar pending items for your review, so one bad auto-approval can't silently repeat. Sending feedback only logs the report and leaves the rule running.
            </p>
            <div className="flex flex-col gap-[8px] w-full">
              <button
                type="button"
                onClick={() => { setDidPause(true); submit(true); }}
                data-testid="button-report-pause-review"
                className="flex w-full items-center justify-center gap-[8px] px-[16px] py-[11px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                Pause rule and review
              </button>
              <button
                type="button"
                onClick={() => submit(false)}
                data-testid="button-report-feedback-only"
                className="flex w-full items-center justify-center gap-[8px] px-[16px] py-[11px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
              >
                Just send feedback
              </button>
              <button
                type="button"
                onClick={() => setReportStep("reason")}
                data-testid="button-report-back"
                className="self-center mt-[2px] px-[12px] py-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#6c779d] hover:text-[#a8b9f4] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[100px]"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Feedback-only confirmation (pause path navigates away instead). */}
        {reportStep === "done" && (
          <div
            data-testid="text-report-confirm"
            className="w-full rounded-[12px] border border-[#1d2132] bg-[#0a0c10] p-[14px] flex items-start gap-[10px]"
          >
            <Check size={16} className="shrink-0 mt-[1px] text-[#42bf23]" strokeWidth={2.5} />
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[13px] text-[#a8b9f4]">
              Thanks. We logged this as policy feedback{rule ? ` on "${titleCase(rule.name)}"` : ""}. The rule is still running; you can pause it anytime from its detail screen.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function ActionButton({
  label,
  onClick,
  variant,
  testId,
}: {
  label: string;
  onClick: () => void;
  variant: "approve" | "reject" | "postpone";
  testId: string;
}) {
  /* Per Figma: Reject = dark-red bg / alert-red text,
     Postpone/Edit = neutral gray bg / muted text, Approve = dark-green bg / green text.
     All: rounded-[100px] SemiBold 16px. */
  const styles =
    variant === "approve"
      ? "bg-[#123509] hover:bg-[#194d0d] focus-visible:ring-[#42bf23] text-[#42bf23]"
      : variant === "reject"
        ? "bg-[#350011] hover:bg-[#4a0018] focus-visible:ring-[#d20344] text-[#d20344]"
        : "bg-[#222737] hover:bg-[#2c3247] focus-visible:ring-[#414965] text-[#6c779d]";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] transition-colors focus:outline-none focus-visible:ring-2 ${styles}`}
    >
      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[16px] whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

/* The raw "six-layer trace" surfaced behind the Technical detail disclosure. */
function buildTrace(p: Proposal, currentStatus?: ProposalStatus) {
  return {
    audit_id: p.auditId,
    layers: {
      "1_ingest": { agent: p.agent, surface: p.surface, source_evidence: p.evidence.length },
      "2_extract": p.facts ?? [],
      "3_classify": { severity: p.severity, reason_chips: p.reasonChips },
      "4_score": p.confidence,
      "5_policy": p.policy,
      "6_propose": {
        action: p.actionStatement,
        execution: p.executionLabel,
        cancel_window: p.cancelDeadlineLabel,
        status: currentStatus ?? p.status,
      },
    },
  };
}
