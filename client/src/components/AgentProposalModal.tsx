import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowDown,
  AlertTriangle,
  BookCheck,
  Check,
  ClipboardCheck,
  FileText,
  HandCoins,
  Landmark,
  LineChart,
  Pencil,
  Receipt,
  Repeat,
  Scale,
  ShieldAlert,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCurrency } from "@/lib/currencyContext";
import {
  RISK_META,
  useAgentDecisions,
  type AgentKey,
  type AgentProposal,
  type EvidenceLine,
  type ScenarioModule,
} from "@/lib/agentProposals";

/* One reusable shell for all 11 agents — header → why → evidence → confidence
   → scenario module → recommended action → next steps → risk note → footer.
   ONLY the scenario-module slot swaps per agent (see renderScenarioModule).
   Propose-mode records get Reject / Edit / Approve; notify-only records get a
   single Acknowledge; approved_automatically records get a disabled footer
   with an Undo link. */

export type AgentModalAction = "approve" | "reject" | "acknowledge" | "undo";

const AGENT_ICONS: Record<AgentKey, LucideIcon> = {
  vendor_risk: ShieldAlert,
  payment: Receipt,
  collections: HandCoins,
  treasury: Landmark,
  cash_forecast: LineChart,
  dispute: Scale,
  compliance: ClipboardCheck,
  revenue_intel: TrendingUp,
  reconciliation: BookCheck,
  subscription: Repeat,
  fraud_anomaly: AlertTriangle,
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-[8px] items-center w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[13px] tracking-[0.08em] uppercase whitespace-nowrap">
      {children}
    </p>
    <div className="flex-1 h-px bg-[#1d2132]" />
  </div>
);

const HR = () => <div className="h-px w-full bg-[#1d2132]" />;

/* ── Scenario modules — the one slot that differs per agent ─────────────── */

const EntityCard = ({
  card,
  accent,
}: {
  card: { label: string; fields: { label: string; value: string; differs?: boolean }[] };
  accent: string;
}) => (
  <div className="flex-1 min-w-0 bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] flex flex-col gap-[8px]">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[12px]">
      {card.label}
    </p>
    <div className="flex flex-col gap-[6px]">
      {card.fields.map((f) => (
        <div key={f.label} className="flex items-baseline justify-between gap-[8px]">
          <span className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965] shrink-0">
            {f.label}
          </span>
          <span
            className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-right truncate"
            style={{ color: f.differs ? accent : "#a8b9f4" }}
          >
            {f.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

function renderScenarioModule(
  module: ScenarioModule,
  riskColor: string,
  format: (a: string | number) => string,
  editing: boolean,
  draft: string,
  setDraft: (v: string) => void,
) {
  switch (module.kind) {
    case "account_comparison":
      return (
        <div className="flex gap-[8px] w-full" data-testid="module-account-comparison">
          <EntityCard card={module.old} accent="#a8b9f4" />
          <EntityCard card={module.next} accent={riskColor} />
        </div>
      );
    case "entity_comparison":
      return (
        <div className="flex flex-col gap-[8px] w-full" data-testid="module-entity-comparison">
          <div className="flex gap-[8px] w-full">
            <EntityCard card={module.entities[0]} accent={riskColor} />
            <EntityCard card={module.entities[1]} accent={riskColor} />
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d]">
            {module.sharedNote}
          </p>
        </div>
      );
    case "document_stack":
      return (
        <div className="flex flex-col gap-[8px] w-full" data-testid="module-document-stack">
          {module.docs.map((doc, i) => (
            <div
              key={i}
              className="flex items-center gap-[12px] px-[12px] py-[10px] rounded-[12px] bg-[#0a0c10] border border-[#1d2132] w-full"
              data-testid={`module-doc-${i}`}
            >
              <div className="flex items-center justify-center size-[32px] rounded-[8px] bg-[#1d2132] shrink-0">
                <FileText size={15} className="text-[#a8b9f4]" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[18px] text-[#a8b9f4] truncate">
                  {doc.label}
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[16px] text-[#6c779d] truncate">
                  {doc.meta}
                </p>
              </div>
            </div>
          ))}
        </div>
      );
    case "message_preview":
      return (
        <div className="w-full" data-testid="module-message-preview">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              data-testid="input-message-draft"
              className="w-full bg-[#0a0c10] border border-[#7631ee]/50 rounded-[12px] p-[12px] [font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[19px] text-[#a8b9f4] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            />
          ) : (
            <div className="bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[19px] text-[#a8b9f4] whitespace-pre-wrap">
                {draft}
              </p>
            </div>
          )}
          <p className="mt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965]">
            {editing ? "Editing the draft directly — changes apply when you approve." : "Draft reminder — tap Edit to change the wording before it goes out."}
          </p>
        </div>
      );
    case "account_flow":
      return (
        <div className="flex flex-col items-center gap-[6px] w-full" data-testid="module-account-flow">
          <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] flex items-center justify-between gap-[8px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[18px] text-[#a8b9f4]">
              {module.from.name}
            </p>
            <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#6c779d]">
              {format(module.from.before)} → <span className="text-[#a8b9f4]">{format(module.from.after)}</span>
            </p>
          </div>
          <div className="flex items-center gap-[8px]">
            <ArrowDown size={14} className="text-[#7631ee]" />
            <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#7631ee]">
              {format(module.amount)}
            </span>
          </div>
          <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] flex items-center justify-between gap-[8px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[18px] text-[#a8b9f4]">
              {module.to.name}
            </p>
            <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#6c779d]">
              {format(module.to.before)} → <span className="text-[#42bf23]">{format(module.to.after)}</span>
            </p>
          </div>
        </div>
      );
    case "forecast_chart": {
      const max = Math.max(...module.weeks);
      return (
        <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] flex flex-col gap-[8px]" data-testid="module-forecast-chart">
          <div className="relative flex items-end gap-[3px] h-[72px] w-full">
            {/* working-capital floor line */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-[#ff9500]/60"
              style={{ bottom: `${(module.floor / max) * 100}%` }}
            />
            {module.weeks.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-[2px] bg-[#7631ee]/70"
                style={{ height: `${(v / max) * 100}%` }}
              />
            ))}
          </div>
          <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] text-[#6c779d]">
            {module.note}
          </p>
        </div>
      );
    }
    case "line_diff":
      return (
        <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] overflow-hidden" data-testid="module-line-diff">
          <div className="flex w-full border-b border-[#1d2132]">
            <div className="w-[96px] shrink-0 px-[12px] py-[8px]" />
            {module.columns.map((c) => (
              <p key={c} className="flex-1 px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-[#6c779d]">
                {c}
              </p>
            ))}
          </div>
          {module.rows.map((row, i) => (
            <div key={row.label} className={`flex w-full ${i < module.rows.length - 1 ? "border-b border-[#1d2132]" : ""}`}>
              <p className="w-[96px] shrink-0 px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[16px] text-[#414965]">
                {row.label}
              </p>
              <p
                className="flex-1 px-[12px] py-[8px] [font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px]"
                style={{ color: "#a8b9f4" }}
              >
                {row.a}
              </p>
              <p
                className="flex-1 px-[12px] py-[8px] [font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px]"
                style={{ color: row.mismatch ? riskColor : "#a8b9f4" }}
              >
                {row.b}
              </p>
            </div>
          ))}
        </div>
      );
    case "usage_timeline": {
      const total = module.lastActivityDaysAgo + module.renewalInDays;
      const todayPct = (module.lastActivityDaysAgo / total) * 100;
      return (
        <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] flex flex-col gap-[10px]" data-testid="module-usage-timeline">
          <div className="relative h-[6px] w-full rounded-full bg-[#1d2132]">
            <div className="absolute left-0 top-0 h-full rounded-full bg-[#414965]" style={{ width: `${todayPct}%` }} />
            <div className="absolute top-[-3px] size-[12px] rounded-full bg-[#a8b9f4]" style={{ left: `calc(${todayPct}% - 6px)` }} />
            <div className="absolute top-[-3px] right-0 size-[12px] rounded-full border-2 border-[#ff9500] bg-[#0a0c10]" />
          </div>
          <div className="flex justify-between w-full">
            <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] text-[#6c779d]">
              last login · {module.lastActivityDaysAgo}d ago
            </p>
            <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] text-[#a8b9f4]">
              today
            </p>
            <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] text-[#ff9500]">
              renews in {module.renewalInDays}d
            </p>
          </div>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d]">
            {module.note}
          </p>
        </div>
      );
    }
    case "document_checklist":
      return (
        <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] flex flex-col" data-testid="module-document-checklist">
          {module.items.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center gap-[10px] px-[12px] py-[10px] ${i < module.items.length - 1 ? "border-b border-[#1d2132]" : ""}`}
            >
              {item.present ? (
                <Check size={14} className="text-[#42bf23] shrink-0" />
              ) : (
                <X size={14} className="shrink-0" style={{ color: riskColor }} />
              )}
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px]"
                style={{ color: item.present ? "#a8b9f4" : riskColor }}
              >
                {item.label}
                {!item.present && " — missing"}
              </p>
            </div>
          ))}
        </div>
      );
    case "trend_chart": {
      const max = Math.max(...module.points.map((p) => p.value));
      return (
        <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] flex flex-col gap-[8px]" data-testid="module-trend-chart">
          <div className="flex items-end gap-[8px] h-[72px] w-full">
            {module.points.map((p, i) => (
              <div key={p.label} className="flex-1 flex flex-col items-center gap-[4px] h-full justify-end">
                <div
                  className={`w-full rounded-t-[3px] ${i === module.points.length - 1 ? "bg-[#7631ee]" : "bg-[#414965]"}`}
                  style={{ height: `${(p.value / max) * 80}%` }}
                />
                <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] leading-[12px] text-[#414965]">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
          <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] text-[#6c779d]">
            {module.note}
          </p>
        </div>
      );
    }
  }
}

/* ── Nested evidence sheet — stub view of the linked_source ─────────────── */

const SOURCE_TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice",
  payment: "Payment",
  counterparty: "Counterparty",
  bank_feed: "Bank Feed Line",
  account: "Account",
  forecast: "Forecast",
  vendor_document: "Vendor Document",
  app_usage: "App Usage",
  subscription: "Subscription",
  receivable: "Receivable",
};

function EvidenceSheet({
  line,
  source,
  onClose,
}: {
  line: EvidenceLine | null;
  source: string;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root open={line !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="evidence-source-sheet"
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] rounded-[20px] w-[420px] max-w-[calc(100vw-48px)] p-[20px] flex flex-col gap-[16px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          {line && (
            <>
              <div className="flex items-center justify-between w-full">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px] bg-[#1d2132] text-[#a8b9f4]">
                  {SOURCE_TYPE_LABEL[line.linkedSource.type] ?? line.linkedSource.type}
                </span>
                <DialogPrimitive.Close
                  aria-label="Close"
                  data-testid="button-evidence-sheet-close"
                  className="size-[28px] flex items-center justify-center rounded-full bg-[#1d2132] hover:bg-[#252a3d] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <X size={14} className="text-[#a8b9f4]" />
                </DialogPrimitive.Close>
              </div>
              <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[18px]">
                {line.text}
              </DialogPrimitive.Title>
              <div className="bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[12px] flex flex-col gap-[8px] w-full">
                <div className="flex items-baseline justify-between gap-[8px]">
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965]">record id</span>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#a8b9f4]">{line.linkedSource.id}</span>
                </div>
                <div className="flex items-baseline justify-between gap-[8px]">
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965]">deep link</span>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#7631ee] truncate">{line.linkedSource.deepLink}</span>
                </div>
                <div className="flex items-baseline justify-between gap-[8px]">
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965]">derived from</span>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#a8b9f4]">{source}</span>
                </div>
              </div>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#414965]">
                Preview of the underlying record — this is a viewer, not the system of record. Close it to return to the proposal.
              </p>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ── The modal ──────────────────────────────────────────────────────────── */

export function AgentProposalModal({
  proposal,
  open,
  onOpenChange,
  onAction,
  onPrev,
  onNext,
  pagerDisabled,
}: {
  proposal: AgentProposal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: AgentModalAction, proposal: AgentProposal) => void;
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
}) {
  const { format } = useCurrency();
  const decisions = useAgentDecisions();
  const [viewingEvidence, setViewingEvidence] = useState<EvidenceLine | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);

  /* Reset transient edit state whenever a different record is shown. */
  const proposalId = proposal?.id;
  useEffect(() => {
    setEditing(false);
    setViewingEvidence(null);
    setUndoConfirmOpen(false);
    if (proposal) {
      setDraft(proposal.scenarioModule.kind === "message_preview" ? proposal.scenarioModule.draft : "");
      setEditAmount(proposal.amount !== null ? String(proposal.amount) : "");
      setEditCategory(proposal.agentKey === "reconciliation" ? "merchant fees" : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  if (!proposal) return null;

  const risk = RISK_META[proposal.riskLevel];
  const AgentIcon = AGENT_ICONS[proposal.agentKey];
  const confidencePct = Math.round(proposal.confidence * 100);
  const isNotifyOnly = proposal.executionMode === "notify_only";
  /* Footer mode follows the record's EFFECTIVE state: a record undone back to
     the review queue must render the actionable propose footer, not the
     auto-approved one — so the seed status is overridden by the decision. */
  const isAutoApproved =
    proposal.status === "approved_automatically" && decisions[proposal.id] !== "undone_to_review";
  /* The user's decision on this record (if any) — a decided needs_review record
     opened again (e.g. as a receipt from the Activity page) renders a muted
     decision line in the footer instead of re-offering Approve / Reject. */
  const decided = decisions[proposal.id];
  const riskNoteColor =
    proposal.riskLevel === "high" ? "#d20344" : proposal.riskLevel === "elevated" ? "#ff9500" : "#6c779d";
  /* Inline edit form applies to propose-mode agents whose editable surface is a
     field (amount / category) rather than the message preview itself. */
  const editViaModule = proposal.scenarioModule.kind === "message_preview";
  const showEditForm = editing && !editViaModule;

  const nextSteps: { icon: React.ReactNode; label: string; text: string }[] = [
    { icon: <Check size={13} className="text-[#42bf23]" />, label: "Approve", text: proposal.whatHappensNext.ifApproved },
    { icon: <Pencil size={13} className="text-[#a8b9f4]" />, label: "Edit", text: proposal.whatHappensNext.ifEdited },
    { icon: <X size={13} className="text-[#d20344]" />, label: "Reject", text: proposal.whatHappensNext.ifRejected },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="agent-proposal-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby="agent-proposal-trigger"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="agent-proposal-modal"
        >
          {/* Header — pager left, risk pill + close right */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full flex items-center justify-between px-[12px]">
            <div className="flex items-center gap-[4px]">
              {onPrev && onNext && (
                <>
                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={pagerDisabled}
                    aria-label="Previous record"
                    data-testid="button-agent-proposal-prev"
                    className="size-[28px] flex items-center justify-center rounded-full bg-[#1d2132] hover:bg-[#252a3d] transition-colors disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <ArrowLeft size={14} className="text-[#a8b9f4]" />
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={pagerDisabled}
                    aria-label="Next record"
                    data-testid="button-agent-proposal-next"
                    className="size-[28px] flex items-center justify-center rounded-full bg-[#1d2132] hover:bg-[#252a3d] transition-colors disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <ArrowRight size={14} className="text-[#a8b9f4]" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-[8px]">
              {isAutoApproved ? (
                <span
                  data-testid="pill-auto-approved"
                  className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px] whitespace-nowrap"
                  style={{ color: "#42bf23", background: "rgba(66,191,35,0.12)" }}
                >
                  Auto-approved
                </span>
              ) : (
                <span
                  data-testid="pill-risk-level"
                  className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] px-[10px] py-[4px] rounded-[100px] whitespace-nowrap"
                  style={{ color: risk.color, background: risk.bg }}
                >
                  {risk.label}
                </span>
              )}
              <DialogPrimitive.Close
                data-testid="button-agent-proposal-close"
                aria-label="Close"
                className="size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="flex flex-col gap-[28px] items-start p-[24px] w-full overflow-y-auto">
            {/* Agent badge + title + subtitle + amount */}
            <div className="flex flex-col gap-[12px] items-start w-full">
              <div className="flex items-center gap-[8px]">
                <div className="flex items-center justify-center size-[28px] rounded-[8px] bg-[#240757] shrink-0">
                  <AgentIcon size={16} className="text-[#7631ee]" />
                </div>
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[18px] text-[#a8b9f4]" data-testid="text-agent-name">
                  {proposal.agentDisplayName}
                </span>
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#414965]">
                  {proposal.category === "business" ? "Business agent" : "Agnostic agent"}
                </span>
              </div>
              <div className="flex flex-col gap-[4px] w-full">
                <DialogPrimitive.Title
                  className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[22px] w-full"
                  data-testid="text-agent-proposal-title"
                >
                  {proposal.title}
                </DialogPrimitive.Title>
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] w-full">
                  {proposal.subtitle}
                </p>
              </div>
              {proposal.amount !== null && (
                <p
                  className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[28px] text-[#a8b9f4] text-[24px] self-end"
                  data-testid="text-agent-proposal-amount"
                >
                  {format(proposal.amount)}
                </p>
              )}
            </div>

            <HR />

            {/* WHY BRAIN SUGGESTED THIS — trigger + tappable evidence links */}
            <div className="flex flex-col gap-[12px] items-start w-full">
              <SectionLabel>
                {isAutoApproved ? "Why This Didn't Need Review" : "Why Brain Suggested This"}
              </SectionLabel>
              <p
                id="agent-proposal-trigger"
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] w-full"
                data-testid="text-agent-proposal-trigger"
              >
                {proposal.whySuggested.trigger}
              </p>
              <div className="flex flex-col gap-[6px] w-full">
                {proposal.whySuggested.evidence.map((line, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setViewingEvidence(line)}
                    data-testid={`link-evidence-${i}`}
                    className="flex items-start gap-[8px] w-full text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px] px-[4px] py-[3px] -mx-[4px]"
                  >
                    <ArrowUpRight size={14} className="text-[#7631ee] shrink-0 mt-[2px]" />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[19px] text-[#7631ee] text-[14px] group-hover:underline">
                      {line.text}
                    </span>
                  </button>
                ))}
              </div>
              {isAutoApproved && proposal.approvedAutomaticallyMeta ? (
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] w-full">
                  <span className="font-semibold text-[#a8b9f4]">Auto-approved because: </span>
                  {proposal.approvedAutomaticallyMeta.autoApprovalReason}
                </p>
              ) : (
                /* Confidence bar — fill color tracks risk_level, NOT the number */
                <div className="flex items-center gap-[10px] w-full" data-testid="bar-confidence">
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d] shrink-0">
                    Confidence
                  </span>
                  <div className="flex-1 h-[6px] rounded-full bg-[#1d2132] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${confidencePct}%`, background: risk.color }}
                    />
                  </div>
                  <span className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#a8b9f4] shrink-0">
                    {confidencePct}%
                  </span>
                </div>
              )}
            </div>

            <HR />

            {/* SCENARIO MODULE — the one slot that swaps per agent */}
            {renderScenarioModule(proposal.scenarioModule, risk.color, format, editing, draft, setDraft)}

            {/* Inline edit form for non-message agents */}
            {showEditForm && (
              <div className="w-full bg-[#0a0c10] border border-[#7631ee]/50 rounded-[12px] p-[12px] flex flex-col gap-[10px]" data-testid="form-inline-edit">
                {proposal.amount !== null && (
                  <label className="flex items-center justify-between gap-[8px]">
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d]">Amount</span>
                    <input
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal"
                      data-testid="input-edit-amount"
                      className="w-[140px] bg-[#11141b] border border-[#1d2132] rounded-[8px] px-[10px] py-[6px] [font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                    />
                  </label>
                )}
                {proposal.agentKey === "reconciliation" && (
                  <label className="flex items-center justify-between gap-[8px]">
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d]">Entry category</span>
                    <input
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      data-testid="input-edit-category"
                      className="w-[180px] bg-[#11141b] border border-[#1d2132] rounded-[8px] px-[10px] py-[6px] [font-family:'Gilroy',sans-serif] text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                    />
                  </label>
                )}
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965]">
                  Changes apply when you approve — nothing moves until then.
                </p>
              </div>
            )}

            <HR />

            {/* RECOMMENDED ACTION */}
            <div className="flex flex-col gap-[12px] items-start w-full">
              <SectionLabel>Recommended Action</SectionLabel>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[21px] text-[#a8b9f4] text-[15px] w-full" data-testid="text-recommended-action">
                {proposal.recommendedAction}
              </p>
            </div>

            <HR />

            {/* WHAT HAPPENS NEXT / OUTCOME — propose-mode = 3 rows; notify-only = sentence; auto-approved = Outcome */}
            <div className="flex flex-col gap-[12px] items-start w-full">
              <SectionLabel>{isAutoApproved ? "Outcome" : "What Happens Next"}</SectionLabel>
              {isAutoApproved && proposal.approvedAutomaticallyMeta ? (
                <div className="flex flex-col gap-[8px] w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] w-full">
                    {proposal.approvedAutomaticallyMeta.outcome.summary}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewingEvidence({ text: "View record", linkedSource: proposal.approvedAutomaticallyMeta!.outcome.linkedSource })}
                    data-testid="link-outcome-record"
                    className="flex items-start gap-[8px] w-full text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px] px-[4px] py-[3px] -mx-[4px]"
                  >
                    <ArrowUpRight size={14} className="text-[#7631ee] shrink-0 mt-[2px]" />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[19px] text-[#7631ee] text-[14px] group-hover:underline">
                      View {proposal.approvedAutomaticallyMeta.outcome.linkedSource.type.replace(/_/g, " ")} record
                    </span>
                  </button>
                  <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] text-[#414965]">
                    {new Date(proposal.approvedAutomaticallyMeta.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              ) : isNotifyOnly ? (
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] w-full" data-testid="text-notify-only-next">
                  This is a flag for your awareness — Brain doesn't take action on it automatically.
                </p>
              ) : (
                <div className="flex flex-col gap-[8px] w-full">
                  {nextSteps.map((step) => (
                    <div key={step.label} className="flex items-start gap-[10px] w-full" data-testid={`next-step-${step.label.toLowerCase()}`}>
                      <div className="flex items-center justify-center size-[22px] rounded-full bg-[#1d2132] shrink-0 mt-[1px]">
                        {step.icon}
                      </div>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[19px] text-[13px] text-[#6c779d]">
                        <span className="font-semibold text-[#a8b9f4]">{step.label}</span>
                        {" → "}
                        {step.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {/* risk note — color tracks risk_level */}
              <div className="flex items-start gap-[8px] w-full" data-testid="text-risk-note">
                <AlertTriangle size={14} className="shrink-0 mt-[2px]" style={{ color: riskNoteColor }} />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[19px] text-[13px]" style={{ color: riskNoteColor }}>
                  {proposal.riskNote}
                </p>
              </div>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[14px] text-[#414965]">
                source: {proposal.source}
              </p>
            </div>
          </div>

          {/* Sticky footer — 3 buttons / Acknowledge / auto-approved variants */}
          <div className="border-t border-[#1d2132] bg-[rgba(17,20,27,0.9)] backdrop-blur-[10px] p-[16px] w-full shrink-0">
            {isAutoApproved ? (
              (() => {
                const meta = proposal.approvedAutomaticallyMeta!;
                if (meta.reversibility === "reversible") {
                  return (
                    <div className="flex flex-col gap-[10px] w-full">
                      {undoConfirmOpen ? (
                        <div className="flex flex-col gap-[12px] w-full">
                          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#a8b9f4] text-center">
                            {meta.undoAction}
                          </p>
                          <div className="flex gap-[8px] w-full">
                            <button
                              type="button"
                              onClick={() => setUndoConfirmOpen(false)}
                              data-testid="button-undo-cancel"
                              className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => { setUndoConfirmOpen(false); onAction("undo", proposal); }}
                              data-testid="button-undo-confirm"
                              className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#7631ee] hover:bg-[#6528d4] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-white"
                            >
                              Undo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-full">
                          <button
                            type="button"
                            onClick={() => setUndoConfirmOpen(true)}
                            data-testid="button-agent-undo"
                            className="px-[16px] py-[10px] rounded-[100px] border border-[#1d2132] hover:border-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                          >
                            Undo
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                if (meta.reversibility === "irreversible") {
                  return (
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#6c779d] text-center w-full" data-testid="text-irreversible">
                      This action can&apos;t be undone.
                    </p>
                  );
                }
                return (
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#6c779d] text-center w-full" data-testid="text-informational">
                    No action was taken — this is for your records.
                  </p>
                );
              })()
            ) : decided === "approved" || decided === "rejected" ? (
              /* Already decided (opened as a receipt, e.g. from the Activity page) —
                 show the decision instead of re-offering the action buttons. */
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#6c779d] text-center w-full"
                data-testid="text-agent-decided"
              >
                {decided === "approved" ? "You approved this proposal." : "You rejected this proposal."}
              </p>
            ) : isNotifyOnly && decided === "acknowledged" ? (
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[18px] text-[#6c779d] text-center w-full"
                data-testid="text-agent-acknowledged"
              >
                You acknowledged this flag.
              </p>
            ) : isNotifyOnly ? (
              <button
                type="button"
                onClick={() => onAction("acknowledge", proposal)}
                data-testid="button-agent-acknowledge"
                className="w-full px-[16px] py-[12px] rounded-[100px] bg-[#7631ee] hover:bg-[#6528d4] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[15px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#11141b]"
              >
                Acknowledge
              </button>
            ) : (
              <div className="flex gap-[8px] w-full">
                <button
                  type="button"
                  onClick={() => onAction("reject", proposal)}
                  data-testid="button-agent-reject"
                  className="flex-1 px-[12px] py-[11px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  data-testid="button-agent-edit"
                  className={`flex-1 px-[12px] py-[11px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] ${
                    editing
                      ? "bg-[#240757] border border-[rgba(118,49,238,0.4)] text-[#7631ee]"
                      : "bg-[#1d2132] hover:bg-[#252a3d] text-[#a8b9f4]"
                  }`}
                >
                  {editing ? "Done editing" : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => onAction("approve", proposal)}
                  data-testid="button-agent-approve"
                  className="flex-1 px-[12px] py-[11px] rounded-[100px] bg-[#7631ee] hover:bg-[#6528d4] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#11141b] flex items-center justify-center gap-[6px]"
                >
                  Approve
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Nested evidence sheet — closes back to the proposal, never navigates away */}
          <EvidenceSheet
            line={viewingEvidence}
            source={proposal.source}
            onClose={() => setViewingEvidence(null)}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
