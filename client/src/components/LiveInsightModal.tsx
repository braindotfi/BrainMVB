import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { LiveInsight } from "@/lib/brainAgentSurfaces";
import { useCurrency } from "@/lib/useCurrency";
import { capitalCase } from "@/lib/displayLabels";
import {
  CardBody,
  CardSection,
  CardText,
  ConfidenceMeter,
  HeadingValue,
  KeyFactsTable,
  PagerFooter,
  StatusPill,
} from "@/components/ProposalCardParts";

/* Read-only viewer for live brain-core Ledger facts (reconciliation matches,
   subscription/disputed obligations, cash-flow aggregates) - see
   client/src/lib/brainAgentSurfaces.ts. These have no proposal lifecycle
   (brain-core has no /v1/proposals endpoint yet - see
   deliverables/BRAIN-CORE-ORCHESTRATION-GAP.md), so there is deliberately no
   approve/reject/acknowledge footer here, and no scenario module fabricated
   to fill AgentProposalModal's shape - only the sections a record actually
   has real data for are rendered. */
export function LiveInsightModal({
  insight,
  open,
  onOpenChange,
  onPrev,
  onNext,
  pagerDisabled = false,
  hasPrev,
  hasNext,
}: {
  insight: LiveInsight | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
  /** Per-direction state, for a pager walking one shared list of mixed record
   *  kinds: at the first row Previous is dead while Next is not, and a single
   *  `pagerDisabled` cannot say that. Defaults to `pagerDisabled` for callers
   *  that still page within one uniform queue. */
  hasPrev?: boolean;
  hasNext?: boolean;
}) {
  const { formatText } = useCurrency();
  if (!insight) return null;
  const confidencePct = typeof insight.confidence === "number" ? Math.round(insight.confidence * 100) : null;
  const hasPager = Boolean(onPrev && onNext);
  const agentName = capitalCase(`${insight.badge} Agent`);
  const factRows = (insight.fields ?? []).map((field) => ({
    label: capitalCase(field.label),
    value: formatText(field.value),
  }));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="live-insight-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby={insight.explanation ? "live-insight-description" : undefined}
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="live-insight-modal"
        >
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] shrink-0 w-full flex items-center justify-center px-[16px]">
            <DialogPrimitive.Title
              className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4] text-center whitespace-nowrap"
              data-testid="text-live-insight-agent-name"
            >
              {agentName}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-live-insight-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] flex items-center justify-center rounded-full bg-[#222737] hover:bg-[#2a3050] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <X size={16} className="text-[#6c779d]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col items-start w-full overflow-y-auto">
            <div className="border-b border-[#1d2132] border-solid flex flex-col gap-[8px] items-start p-[24px] shrink-0 w-full">
              {/* These records have no decision to make, so the hero pill states
                  what the card IS rather than borrowing a risk colour it has no
                  risk to report — the frame (6206:71135) shows the same. */}
              <StatusPill
                label={INSIGHT_PILL_LABEL}
                color="#6c779d"
                background="#222737"
                border="rgba(108,119,157,0.2)"
                testId="pill-live-insight-kind"
              />
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-[#a8b9f4] w-full truncate">
                {formatText(insight.title)}
              </p>
              {insight.subtitle && (
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] w-full">
                  {formatText(insight.subtitle)}
                </p>
              )}
            </div>

            <CardBody>
              {insight.explanation && (
                <CardSection title="Why This Matters" testId="section-live-insight-why">
                  <div id="live-insight-description" className="w-full">
                    <CardText testId="live-insight-description-text">{formatText(insight.explanation)}</CardText>
                  </div>
                </CardSection>
              )}

              {factRows.length > 0 && (
                <CardSection title="Key Facts" testId="section-live-insight-facts">
                  <KeyFactsTable rows={factRows} testId="table-live-insight-facts" />
                </CardSection>
              )}

              {insight.evidenceIds && insight.evidenceIds.length > 0 && (
                <CardSection title="Linked Evidence" testId="section-live-insight-evidence">
                  <div className="flex flex-col gap-[8px] w-full">
                    {insight.evidenceIds.map((id) => (
                      <div
                        key={id}
                        className="bg-[#0a0c10] border border-solid border-[#1d2132] rounded-[12px] px-[16px] py-[12px] w-full"
                      >
                        <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#a8b9f4] truncate">
                          {id}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardSection>
              )}

              {confidencePct !== null && (
                <CardSection
                  title="Confidence"
                  trailing={<HeadingValue>{`${confidencePct}%`}</HeadingValue>}
                  testId="section-live-insight-confidence"
                >
                  <ConfidenceMeter pct={confidencePct} />
                </CardSection>
              )}

              {insight.chart && (
                <CardSection title="Trend" testId="section-live-insight-chart">
                  <div className="flex flex-col gap-[8px] w-full" data-testid="chart-live-insight">
                    <div className="flex gap-[8px] items-end w-full">
                      {(() => {
                        const chart = insight.chart!;
                        const max = Math.max(1, ...chart.points.map((point) => Math.abs(point.value)));
                        return chart.points.map((point, idx) => (
                          <div key={`${point.label}-${idx}`} className="flex-1 flex flex-col gap-[4px] items-center min-w-0">
                            <div
                              className="w-full rounded-[8px] min-h-[4px]"
                              style={{
                                height: `${Math.max(4, Math.round((Math.abs(point.value) / max) * 88))}px`,
                                background: point.value >= 0 ? "#123509" : "#350011",
                                border: `1px solid ${point.value >= 0 ? "rgba(66,191,35,0.4)" : "rgba(210,3,68,0.4)"}`,
                              }}
                            />
                            <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[11px] leading-[14px] text-[#6c779d] text-center w-full truncate">
                              {point.label}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965] w-full">
                      {formatText(insight.chart.note)}
                    </p>
                  </div>
                </CardSection>
              )}

              <CardSection title="What Happens Next" testId="section-live-insight-next">
                <CardText>
                  Brain will continue monitoring this live ledger signal. This record is read-only;
                  no approval or automatic action is available for it yet.
                </CardText>
              </CardSection>

            </CardBody>
          </div>

          {hasPager && (
            <PagerFooter
              onPrev={onPrev!}
              onNext={onNext!}
              hasPrev={hasPrev === undefined ? !pagerDisabled : hasPrev}
              hasNext={hasNext === undefined ? !pagerDisabled : hasNext}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Every live insight is a read-only ledger observation with no decision
 *  attached, so the pill reports that status rather than the producing agent —
 *  the agent's name is the modal's own header, and an amber "needs you" pill on
 *  a record you cannot act on was reading as an unactioned task. */
export const INSIGHT_PILL_LABEL = "Informational";

/** Compact row for a live insight, matching ReviewPage/HomePage's existing
 *  ProposalRow/ListItem styling. */
export const LiveInsightRow = ({ insight, onClick }: { insight: LiveInsight; onClick: () => void }) => (
  <div
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    }}
    data-testid={`row-live-insight-${insight.id}`}
    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
  >
    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate min-w-0">
        {insight.title}
      </p>
      {insight.subtitle && (
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] truncate w-full text-[#6c779d]">
          {insight.subtitle}
        </p>
      )}
    </div>
    <span
      className="inline-flex items-center justify-center gap-[5px] border border-solid border-[rgba(108,119,157,0.2)] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] px-[8px] py-[2px] rounded-[22px] whitespace-nowrap shrink-0 text-[#6c779d] bg-[#222737]"
      data-testid={`pill-live-insight-row-${insight.id}`}
    >
      {INSIGHT_PILL_LABEL}
    </span>
  </div>
);
