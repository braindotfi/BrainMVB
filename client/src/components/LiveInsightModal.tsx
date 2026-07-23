import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { LiveInsight } from "@/lib/brainAgentSurfaces";

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
}: {
  insight: LiveInsight | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!insight) return null;
  const confidencePct = typeof insight.confidence === "number" ? Math.round(insight.confidence * 100) : null;

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
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] shrink-0 w-full flex items-center justify-between px-[16px]">
            <DialogPrimitive.Title
              className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#a8b9f4]"
              data-testid="text-live-insight-badge"
            >
              {insight.badge}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="button-live-insight-close"
              aria-label="Close"
              className="size-[32px] flex items-center justify-center rounded-full hover:bg-[#1d2132] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <X size={18} className="text-[#6c779d]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[16px] p-[24px] w-full overflow-y-auto">
            <div>
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[26px] text-[#a8b9f4]">
                {insight.title}
              </p>
              {insight.subtitle && (
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d] mt-[4px]">
                  {insight.subtitle}
                </p>
              )}
            </div>

            {confidencePct !== null && (
              <div className="flex flex-col gap-[8px] w-full" data-testid="bar-live-insight-confidence">
                <div className="flex items-center justify-between">
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d]">
                    Match confidence
                  </span>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4]">
                    {confidencePct}%
                  </span>
                </div>
                <div className="h-[6px] w-full rounded-full bg-[#1d2132] overflow-hidden">
                  <div className="h-full rounded-full bg-[#7631ee]" style={{ width: `${confidencePct}%` }} />
                </div>
              </div>
            )}

            {insight.explanation && (
              <p
                id="live-insight-description"
                className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#a8b9f4]"
              >
                {insight.explanation}
              </p>
            )}

            {insight.fields && insight.fields.length > 0 && (
              <div className="flex flex-col gap-[1px] w-full rounded-[8px] overflow-hidden border border-[#1d2132]">
                {insight.fields.map((f) => (
                  <div key={f.label} className="flex items-center justify-between px-[12px] py-[8px] bg-[#0a0c10] gap-[12px]">
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] shrink-0">
                      {f.label}
                    </span>
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] text-right truncate">
                      {f.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {insight.chart && (
              <div className="flex flex-col gap-[8px] w-full" data-testid="chart-live-insight">
                <div className="flex gap-[8px] items-end w-full">
                  {(() => {
                    const chart = insight.chart!;
                    const max = Math.max(1, ...chart.points.map((p) => Math.abs(p.value)));
                    return chart.points.map((p, idx) => (
                      <div key={`${p.label}-${idx}`} className="flex-1 flex flex-col gap-[4px] items-center min-w-0">
                        <div
                          className="w-full rounded-[8px] min-h-[4px]"
                          style={{
                            height: `${Math.max(4, Math.round((Math.abs(p.value) / max) * 88))}px`,
                            background: p.value >= 0 ? "#123509" : "#350011",
                            border: `1px solid ${p.value >= 0 ? "rgba(66,191,35,0.4)" : "rgba(210,3,68,0.4)"}`,
                          }}
                        />
                        <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[11px] leading-[14px] text-[#6c779d] text-center w-full truncate">
                          {p.label}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965] w-full">
                  {insight.chart.note}
                </p>
              </div>
            )}

            {insight.evidenceIds && insight.evidenceIds.length > 0 && (
              <div className="flex flex-col gap-[4px] w-full">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d]">
                  Evidence
                </span>
                {insight.evidenceIds.map((id) => (
                  <p key={id} className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#a8b9f4] truncate">
                    {id}
                  </p>
                ))}
              </div>
            )}

            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#414965] pt-[8px] border-t border-[#1d2132] w-full">
              Read-only. Live data from brain-core's Ledger - brain-core has no
              decision workflow (/v1/proposals) for this record type yet.
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Compact row for a live insight, matching ReviewPage/HomePage's existing
 *  ProposalRow/ListItem styling. Shows the badge instead of a "Demo scenario"
 *  pill - this is real data, not a seeded record. */
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
      className="inline-flex items-center justify-center gap-[5px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[5px] rounded-[100px] whitespace-nowrap shrink-0"
      style={{ color: "#6c779d", background: "#1d2132" }}
    >
      {insight.badge}
    </span>
  </div>
);
