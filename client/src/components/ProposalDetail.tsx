import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Receipt,
  HandCoins,
  Landmark,
  BookCheck,
  FileText,
  ArrowLeftRight,
  History,
  FileSignature,
  BookOpen,
  TrendingUp,
  ShieldAlert,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useCurrency } from "@/lib/currencyContext";
import type {
  Proposal,
  ProposalStatus,
  Agent,
  Severity,
  EvidenceItem,
} from "@/lib/proposalTypes";

/* Brain is PROPOSE-ONLY. One component renders every scenario; sections appear
   or collapse based on which fields are present. #D20344 is reserved for
   alerts / flags / danger only — purple is the affirmative accent. */

export type ProposalAction = "approve" | "reject" | "postpone" | "verifyFirst";

const ALERT = "#d20344";

const AGENT_META: Record<Agent, { label: string; icon: LucideIcon }> = {
  invoice: { label: "Invoice Agent", icon: Receipt },
  collections: { label: "Collections Agent", icon: HandCoins },
  cash: { label: "Cash Agent", icon: Landmark },
  close: { label: "Close Agent", icon: BookCheck },
};

const EVIDENCE_ICON: Record<EvidenceItem["kind"], LucideIcon> = {
  invoice: FileText,
  transaction: ArrowLeftRight,
  prior_payment: History,
  contract: FileSignature,
  ledger_entry: BookOpen,
  forecast: TrendingUp,
};

/* Pills: danger → alert red; warning → gold; info → baby blue; clean → purple. */
function chipClasses(severity: Severity): string {
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

function factColor(severity?: Severity): string {
  if (severity === "danger") return ALERT;
  if (severity === "warning") return "#ff9500";
  return "#a8b9f4";
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#414965] text-[12px] uppercase tracking-[0.04em] w-full">
    {children}
  </p>
);

export function ProposalDetail({
  proposal,
  currentStatus,
  open,
  onOpenChange,
  onAction,
}: {
  proposal: Proposal | null;
  currentStatus?: ProposalStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: ProposalAction) => void;
}) {
  const { format } = useCurrency();
  const [showTrace, setShowTrace] = useState(false);

  if (!proposal) return null;

  const agent = AGENT_META[proposal.agent];
  const AgentIcon = agent.icon;
  const confidencePct = Math.round(proposal.confidence.score * 100);
  const chips = proposal.reasonChips;

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
          {/* Header — agent badge + auditId mono (muted) + close X */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-[#1d2132] border-b border-solid flex items-center gap-[12px] px-[20px] py-[14px] relative shrink-0 w-full">
            <div className="flex items-center gap-[8px] flex-1 min-w-px">
              <div className="flex items-center justify-center size-[28px] rounded-[8px] bg-[#240757] shrink-0">
                <AgentIcon size={16} className="text-[#7631ee]" />
              </div>
              <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                {agent.label}
              </DialogPrimitive.Title>
              <span
                className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[#414965] text-[12px] whitespace-nowrap"
                data-testid="text-audit-id"
              >
                {proposal.auditId}
              </span>
            </div>
            <DialogPrimitive.Close
              data-testid="button-proposal-close"
              aria-label="Close"
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L11 11M11 1L1 11" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[24px] items-start p-[24px] w-full overflow-y-auto">
            {/* Reason chips — flags use alert red. Clean & no chips → "Looks routine" */}
            <div className="flex flex-wrap gap-[8px] items-center w-full">
              {chips.length > 0 ? (
                chips.map((chip, i) => (
                  <span
                    key={i}
                    data-testid={`chip-reason-${i}`}
                    className={`[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px] whitespace-nowrap ${chipClasses(chip.severity)}`}
                  >
                    {chip.label}
                  </span>
                ))
              ) : (
                <span
                  data-testid="chip-routine"
                  className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px] whitespace-nowrap bg-[#240757] text-[#7631ee]"
                >
                  Looks routine
                </span>
              )}
            </div>

            {/* Action statement (large) + meta + propose-only reassurance */}
            <div className="flex flex-col gap-[6px] items-start w-full">
              <p
                className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[22px] w-full"
                data-testid="text-action-statement"
              >
                {proposal.actionStatement}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] leading-[18px] text-[#6c779d] text-[13px] w-full">
                {proposal.actionMeta}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#414965] text-[13px] w-full">
                Brain won't move any funds until you approve.
              </p>
            </div>

            {/* Why this needs your call — rationale + facts mono block */}
            <div className="flex flex-col gap-[12px] items-start w-full">
              <SectionLabel>Why this needs your call</SectionLabel>
              <p
                id="proposal-detail-rationale"
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#6c779d] text-[15px] w-full"
              >
                {proposal.rationale}
              </p>
              {proposal.facts && proposal.facts.length > 0 && (
                <div className="bg-[#0a0c10] rounded-[12px] w-full p-[14px] flex flex-col gap-[8px]">
                  {proposal.facts.map((fact, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-[12px] w-full [font-family:'JetBrains_Mono',monospace] text-[13px] leading-[18px]"
                      data-testid={`fact-${i}`}
                    >
                      <span className="text-[#6c779d]">{fact.label}</span>
                      <span className="text-right" style={{ color: factColor(fact.severity) }}>
                        {fact.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Evidence grid — icon per kind; duplicate shows both invoices */}
            <div className="flex flex-col gap-[12px] items-start w-full">
              <SectionLabel>Evidence</SectionLabel>
              <div className="grid grid-cols-2 gap-[8px] w-full">
                {proposal.evidence.map((ev, i) => {
                  const EvIcon = EVIDENCE_ICON[ev.kind];
                  return (
                    <div
                      key={i}
                      data-testid={`evidence-${i}`}
                      className="bg-[#0a0c10] rounded-[12px] p-[12px] flex flex-col gap-[8px]"
                    >
                      <div className="flex items-center gap-[8px]">
                        <EvIcon size={15} className="text-[#7631ee] shrink-0" />
                        <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] leading-[12px] text-[#414965] uppercase tracking-[0.06em]">
                          {ev.kind.replace("_", " ")}
                        </span>
                      </div>
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[#a8b9f4] text-[14px]">
                        {ev.title}
                      </p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px]">
                        {ev.subtitle}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confidence — band + score + bar (purple) + caveat */}
            <div className="flex flex-col gap-[10px] items-start w-full">
              <div className="flex items-center justify-between w-full">
                <SectionLabel>Confidence</SectionLabel>
                <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] leading-[16px] text-[#a8b9f4]" data-testid="text-confidence">
                  {proposal.confidence.band} · {confidencePct}%
                </span>
              </div>
              <div className="h-[6px] w-full rounded-full bg-[#1d2132] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#7631ee] transition-all"
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px] w-full">
                {proposal.confidence.caveat}
              </p>
            </div>

            {/* Sweep math — reconciling mono breakdown (only when present) */}
            {proposal.sweepMath && (
              <div className="flex flex-col gap-[12px] items-start w-full">
                <SectionLabel>The math — your account isn't drained</SectionLabel>
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

            {/* What happens next — verbatim mechanics + cancel window */}
            <div className="flex flex-col gap-[10px] items-start w-full">
              <SectionLabel>What happens next</SectionLabel>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#6c779d] text-[15px] w-full" data-testid="text-what-next">
                {proposal.whatHappensNext}
              </p>
            </div>

            {/* If this is wrong — risk in alert red + policy chip */}
            <div className="flex flex-col gap-[10px] items-start w-full">
              <SectionLabel>If this is wrong</SectionLabel>
              <div className="flex items-start gap-[8px] w-full">
                <ShieldAlert size={16} className="shrink-0 mt-[2px]" style={{ color: ALERT }} />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[15px] w-full" style={{ color: ALERT }}>
                  {proposal.risk}
                </p>
              </div>
              <div className="bg-[#0a0c10] rounded-[12px] w-full p-[12px] flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[13px]">
                  Flagged by{" "}
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[#a8b9f4]">{proposal.policy.id}</span>
                  {" "}— {proposal.policy.explanation}.
                </p>
                {proposal.policy.autoClearedOtherwise && (
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#414965] text-[13px]">
                    Would have auto-cleared otherwise.
                  </p>
                )}
              </div>
            </div>

            {/* Surface-specific hint */}
            {proposal.surface === "business" ? (
              proposal.policyThreshold && (
                <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] rounded-[8px] w-full p-[10px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[13px]" data-testid="text-policy-threshold">
                    {proposal.policyThreshold}
                  </p>
                </div>
              )
            ) : (
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#414965] text-[12px] w-full text-center" data-testid="text-swipe-hint">
                Swipe right to approve · left to reject · up to postpone
              </p>
            )}

            {/* Actions footer. verifyFirst → prominent full-width fourth action ABOVE the row. */}
            <div className="flex flex-col gap-[12px] items-start w-full">
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
                  sublabel={proposal.actions.reject.sublabel}
                  variant="reject"
                />
                <ActionButton
                  testId="button-postpone"
                  onClick={() => onAction("postpone")}
                  label={proposal.actions.postpone.label}
                  sublabel={proposal.actions.postpone.sublabel}
                  variant="postpone"
                />
                <ActionButton
                  testId="button-approve"
                  onClick={() => onAction("approve")}
                  label={proposal.actions.approve.label}
                  sublabel={proposal.actions.approve.sublabel}
                  variant="approve"
                />
              </div>
            </div>

            {/* Technical detail — raw six-layer trace / JSON, collapsed */}
            <div className="w-full border-t border-[#1d2132] pt-[16px]">
              <button
                type="button"
                onClick={() => setShowTrace((s) => !s)}
                data-testid="button-toggle-trace"
                className="flex items-center gap-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-[#414965] hover:text-[#6c779d] transition-colors uppercase tracking-[0.04em]"
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ActionButton({
  label,
  sublabel,
  onClick,
  variant,
  testId,
}: {
  label: string;
  sublabel?: string;
  onClick: () => void;
  variant: "approve" | "reject" | "postpone";
  testId: string;
}) {
  /* Approve = purple accent (NOT alert red, even on danger items).
     Reject = alert red. Postpone = neutral. */
  const styles =
    variant === "approve"
      ? "bg-[#7631ee] hover:bg-[#8a4bf5] focus-visible:ring-[#7631EE] text-white"
      : variant === "reject"
        ? "bg-[#350011] hover:bg-[#4a0018] focus-visible:ring-[#d20344] text-[#d20344]"
        : "bg-[#1d2132] hover:bg-[#252a3d] focus-visible:ring-[#414965] text-[#a8b9f4]";
  const sublabelColor =
    variant === "approve"
      ? "text-white/70"
      : variant === "reject"
        ? "text-[#d20344]/70"
        : "text-[#6c779d]";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex flex-1 flex-col items-center justify-center px-[12px] py-[10px] rounded-[100px] transition-colors focus:outline-none focus-visible:ring-2 ${styles}`}
    >
      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[18px] text-[14px] whitespace-nowrap">
        {label}
      </span>
      {sublabel && (
        <span className={`[font-family:'Gilroy',sans-serif] font-medium leading-[14px] text-[11px] text-center ${sublabelColor}`}>
          {sublabel}
        </span>
      )}
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
