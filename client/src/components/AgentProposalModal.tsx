import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import approveIcon from "@assets/approve_1784154649123.png";
import editIcon from "@assets/edit_1784154649123.png";
import rejectIcon from "@assets/reject_1784154649120.png";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowDown,
  AlertTriangle,
  BookCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  DollarSign,
  FileText,
  HandCoins,
  Info,
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
import { resolveDocument, openDocumentDetail } from "@/lib/openDocumentDetail";
import type { DocumentRecord } from "@/lib/documentTypes";
import { docKindLabel } from "@/lib/documentTypes";
import { DocumentViewerPopup } from "./DocumentViewerPopup";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RISK_META,
  useAgentDecisions,
  type AgentKey,
  type AgentProposal,
  type EvidenceLine,
  type ScenarioModule,
} from "@/lib/agentProposals";

/* One reusable shell for all 11 agents: header, why, evidence, confidence
   → scenario module → recommended action → next steps → risk note → footer.
   ONLY the scenario-module slot swaps per agent (see renderScenarioModule).
   Propose-mode records get Reject / Edit / Approve; notify-only records get a
   single Acknowledge; approved_automatically records get a disabled footer
   with an Undo link. */

export type AgentModalAction = "approve" | "reject" | "acknowledge" | "undo";

import type { AgentModalEditPayload } from "@/lib/agentProposals";
export type { AgentModalEditPayload };

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

const SectionLabel = ({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) => (
  <div className="flex gap-[8px] items-center w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[14px] whitespace-nowrap">
      {children}
    </p>
    <div className="flex-1 h-px bg-[#1d2132]" />
    {right}
  </div>
);

const HR = () => <div className="h-px w-full bg-[#1d2132]" />;

const RECONCILIATION_CATEGORIES = [
  "Merchant fees",
  "Software",
  "Office supplies",
  "Travel & meals",
  "Professional services",
  "Rent & utilities",
  "Marketing",
  "Equipment",
  "Insurance",
  "Payroll",
  "Taxes",
  "Other",
];

/* Evidence card row — clickable, shows dark card style */
const EvidenceRow = ({
  line,
  isLast,
  onClick,
  index,
}: {
  line: EvidenceLine;
  isLast: boolean;
  onClick: () => void;
  index: number;
}) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={`link-evidence-${index}`}
    className={`flex items-start gap-[8px] px-[12px] py-[10px] text-left w-full hover:bg-[#0e1118] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] ${!isLast ? "border-b border-[#1d2132]" : ""}`}
  >
    <ArrowUpRight
      size={16}
      className="text-[#7631ee] shrink-0"
    />
    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[16px] text-[#7631ee]">
      {line.text}
    </span>
  </button>
);

/* Scenario modules: the one slot that differs per agent */

function AccountTable({
  label,
  badge,
  fields,
  riskColor,
}: {
  label: string;
  badge?: string;
  fields: { label: string; value: string; differs?: boolean }[];
  riskColor: string;
}) {
  return (
    <div className="bg-[#0a0c10] border border-[#1d2132] rounded-[12px] overflow-hidden w-full">
      <div className="border-b border-[#1d2132] flex gap-[8px] items-center px-[12px] py-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-[#a8b9f4] flex-1 min-w-0">
          {label}
        </p>
        {badge && (
          <div className="inline-flex items-center justify-center bg-[#222737] border border-[rgba(108,119,157,0.2)] px-[8px] py-[3px] rounded-[22px] shrink-0">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-[#6c779d] whitespace-nowrap">
              {badge}
            </span>
          </div>
        )}
      </div>
      {fields.map((f, i) => (
        <div
          key={f.label}
          className={`flex items-start ${i < fields.length - 1 ? "border-b border-[#1d2132]" : ""}`}
        >
          <div className="w-[140px] shrink-0 px-[12px] py-[8px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d] whitespace-nowrap">
              {f.label}
            </p>
          </div>
          <div className="flex-1 px-[12px] py-[8px] min-w-0">
            <p
              className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[20px] truncate"
              style={{ color: f.differs ? riskColor : "#a8b9f4" }}
            >
              {f.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function renderScenarioModule(
  module: ScenarioModule,
  riskColor: string,
  format: (a: string | number) => string,
  editing: boolean,
  draft: string,
  setDraft: (v: string) => void,
  onOpenDocument: (doc: DocumentRecord) => void,
) {
  switch (module.kind) {
    case "account_comparison": {
      const toTitleCase = (s: string) =>
        s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      const oldBadgeMatch = module.old.label.match(/\((.*?)\)/);
      const oldBadge = oldBadgeMatch ? toTitleCase(oldBadgeMatch[1]) : undefined;
      const oldTitle = module.old.label.replace(/\s*\(.*?\)/, "").trim();
      const oldTitleFormatted = toTitleCase(oldTitle);
      const nextTitle = toTitleCase(module.next.label);
      return (
        <div className="flex flex-col gap-[8px] w-full" data-testid="module-account-comparison">
          <AccountTable
            label={oldTitleFormatted}
            badge={oldBadge}
            fields={module.old.fields}
            riskColor={riskColor}
          />
          <AccountTable
            label={nextTitle}
            fields={module.next.fields}
            riskColor={riskColor}
          />
        </div>
      );
    }
    case "entity_comparison":
      return (
        <div className="flex flex-col gap-[8px] w-full" data-testid="module-entity-comparison">
          <AccountTable
            label={module.entities[0].label}
            fields={module.entities[0].fields}
            riskColor={riskColor}
          />
          <AccountTable
            label={module.entities[1].label}
            fields={module.entities[1].fields}
            riskColor={riskColor}
          />
          {module.sharedNote && (
            <p className="mt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965]">
              {module.sharedNote}
            </p>
          )}
        </div>
      );
    case "document_stack":
      return (
        <div className="flex flex-col gap-[8px] items-start w-full" data-testid="module-document-stack">
          <SectionLabel>
            {module.title ?? "Linked Evidence"}
          </SectionLabel>
          {module.docs.map((doc, i) => {
            const resolved = doc.documentId ? resolveDocument(doc.documentId) : undefined;
            const clickable = !!resolved;
            const onClick = () => {
              if (resolved) onOpenDocument(resolved);
            };
            const Wrapper = clickable ? "button" : "div";
            return (
              <Wrapper
                key={i}
                type={clickable ? "button" : undefined}
                onClick={clickable ? onClick : undefined}
                data-testid={`module-doc-${i}`}
                className={`flex items-center gap-[16px] px-[16px] py-[12px] rounded-[12px] bg-[#0a0c10] border border-[#1d2132] w-full text-left ${clickable ? "hover:bg-[#11141b] hover:border-[#7631ee]/40 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]" : ""}`}
              >
                <div className="flex flex-1 gap-[16px] items-center min-w-px">
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] whitespace-nowrap px-[8px] py-[3px] rounded-[22px] bg-[#222737] border border-[rgba(108,119,157,0.2)]">
                    {resolved ? docKindLabel(resolved.kind) : "Document"}
                  </span>
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                    {doc.label}
                  </p>
                </div>
                {clickable && <ChevronRight size={16} className="text-[#414965] shrink-0" />}
              </Wrapper>
            );
          })}
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
            {editing
              ? "Editing the draft directly. Changes apply when you approve."
              : "Draft reminder. Tap Edit to change the wording before it goes out."}
          </p>
        </div>
      );
    case "account_flow":
      return (
        <div
          className="bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[16px] flex flex-col gap-[16px] items-center w-full"
          data-testid="module-account-flow"
        >
          {/* FROM row */}
          <div className="flex gap-[24px] items-center w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#a8b9f4] flex-1 min-w-0 truncate">
              {module.from.name}
            </p>
            <div className="flex gap-[4px] items-center shrink-0">
              <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[14px] leading-[20px] text-[#6c779d] whitespace-nowrap">
                {format(module.from.before)}
              </span>
              <ArrowRight size={16} className="text-[#6c779d]" />
              <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[14px] leading-[20px] text-[#6c779d] whitespace-nowrap">
                {format(module.from.after)}
              </span>
            </div>
          </div>
          {/* Center transfer indicator */}
          <div className="flex items-center justify-center size-[32px] rounded-full bg-[#1d2132] shrink-0">
            <ArrowDown size={16} className="text-[#a8b9f4]" />
          </div>
          {/* TO row */}
          <div className="flex gap-[24px] items-center w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#a8b9f4] flex-1 min-w-0 truncate">
              {module.to.name}
            </p>
            <div className="flex gap-[4px] items-center shrink-0">
              <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[14px] leading-[20px] text-[#6c779d] whitespace-nowrap">
                {format(module.to.before)}
              </span>
              <ArrowRight size={16} className="text-[#6c779d]" />
              <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[14px] leading-[20px] text-[#42bf23] whitespace-nowrap">
                {format(module.to.after)}
              </span>
            </div>
          </div>
        </div>
      );
    case "forecast_chart": {
      const max = Math.max(...module.weeks);
      const CHART_H = 88;
      const weekLabels = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12", "W13"];
      return (
        <div
          className="flex flex-col gap-[16px] items-start w-full"
          data-testid="module-forecast-chart"
        >
          <SectionLabel>{module.title}</SectionLabel>
          <div className="w-full">
            <div className="flex gap-[4px] items-end w-full">
              {module.weeks.map((v, i) => {
                const isShortfall = v < module.floor;
                return (
                  <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-[4px]">
                    <div
                      className={`w-full rounded-[8px] border ${isShortfall ? "bg-[#1a050a] border-[rgba(210,3,68,0.4)]" : "bg-[#123509] border-[rgba(66,191,35,0.4)]"}`}
                      style={{ height: `${Math.max(4, Math.round((v / max) * CHART_H))}px` }}
                    />
                    <span className="[font-family:'JetBrains_Mono',monospace] text-[10px] leading-[12px] text-[#414965]">
                      {weekLabels[i]}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965] w-full">
              {module.note}
            </p>
          </div>
        </div>
      );
    }
    case "line_diff":
      return (
        <div
          className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] overflow-hidden"
          data-testid="module-line-diff"
        >
          <div className="flex w-full border-b border-[#1d2132]">
            <div className="w-[96px] shrink-0 px-[12px] py-[8px]" />
            {module.columns.map((c) => (
              <p
                key={c}
                className="flex-1 px-[12px] py-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-[#6c779d]"
              >
                {c}
              </p>
            ))}
          </div>
          {module.rows.map((row, i) => (
            <div
              key={row.label}
              className={`flex w-full ${i < module.rows.length - 1 ? "border-b border-[#1d2132]" : ""}`}
            >
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
    case "subscription_table":
      return (
        <div
          className="bg-[#0a0c10] border border-[#1d2132] rounded-[12px] overflow-hidden w-full"
          data-testid="module-subscription-table"
        >
          <div className="border-b border-[#1d2132] flex gap-[16px] items-center px-[12px] py-[8px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-[#a8b9f4] flex-1 min-w-0">
              Activity Status
            </p>
            <div className="inline-flex items-center justify-center bg-[#222737] border border-[rgba(108,119,157,0.2)] px-[8px] py-[3px] rounded-[22px] shrink-0">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-[#6c779d] whitespace-nowrap">
                {module.badge}
              </span>
            </div>
          </div>
          {module.rows.map((row, i) => (
            <div
              key={row.label}
              className={`flex items-start${i < module.rows.length - 1 ? " border-b border-[#1d2132]" : ""}`}
            >
              <div className="flex flex-col items-start justify-center w-[140px] shrink-0 px-[12px] py-[8px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d] whitespace-nowrap">
                  {row.label}
                </p>
              </div>
              <div className="flex flex-col items-start justify-center flex-1 min-w-px px-[12px] py-[8px]">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] leading-[20px] w-full overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ color: row.valueColor ?? "#a8b9f4" }}
                >
                  {row.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      );
    case "document_checklist":
      return (
        <div
          className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[12px] flex flex-col"
          data-testid="module-document-checklist"
        >
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
                {!item.present && ", missing"}
              </p>
            </div>
          ))}
        </div>
      );
    case "trend_chart": {
      const max = Math.max(...module.points.map((p) => p.value));
      const CHART_H = 88;
      return (
        <div
          className="flex flex-col gap-[16px] items-start w-full"
          data-testid="module-trend-chart"
        >
          <SectionLabel>{module.title}</SectionLabel>
          <div className="w-full">
            <div className="flex gap-[8px] items-end w-full">
              {module.points.map((p) => (
                <div key={p.label} className="flex-1 flex flex-col gap-[4px] items-center min-w-0">
                  <div
                    className="w-full rounded-[8px] bg-[#123509] border border-[rgba(66,191,35,0.4)] min-h-[4px]"
                    style={{ height: `${Math.max(4, Math.round((p.value / max) * CHART_H))}px` }}
                  />
                  <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[12px] leading-[14px] text-[#6c779d] text-center w-full">
                    {p.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965] w-full">
              {module.note}
            </p>
          </div>
        </div>
      );
    }
  }
}

/* Nested evidence sheet: stub view of the linked_source */

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
    <DialogPrimitive.Root
      open={line !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="evidence-source-sheet"
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] rounded-[24px] w-[480px] max-w-[calc(100vw-48px)] overflow-hidden flex flex-col shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          {line && (
            <>
              {/* Header bar */}
              <div className="relative h-[56px] shrink-0 w-full backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] flex items-center justify-center px-[12px]">
                <DialogPrimitive.Title className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4] text-center">
                  {SOURCE_TYPE_LABEL[line.linkedSource.type] ?? line.linkedSource.type}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close
                  aria-label="Close"
                  data-testid="button-evidence-sheet-close"
                  className="absolute right-[11px] top-[12px] size-[32px] flex items-center justify-center rounded-full bg-[#1d2132] hover:bg-[#252a3d] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <X size={14} className="text-[#a8b9f4]" />
                </DialogPrimitive.Close>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-[24px] p-[24px] w-full">
                {/* Evidence title */}
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-[#a8b9f4] w-full">
                  {line.text}
                </p>

                {/* Info card — 140px label column matching AccountTable */}
                <div className="bg-[#0a0c10] border border-[#1d2132] rounded-[12px] overflow-hidden w-full">
                  <div className="border-b border-[#1d2132] flex items-start w-full">
                    <div className="w-[140px] shrink-0 px-[12px] py-[8px] flex flex-col items-start justify-center">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d] whitespace-nowrap">
                        Record ID
                      </p>
                    </div>
                    <div className="flex-1 px-[12px] py-[8px] min-w-0">
                      <p className="[font-family:'JetBrains_Mono',monospace] text-[13px] leading-[20px] text-[#a8b9f4] truncate">
                        {line.linkedSource.id}
                      </p>
                    </div>
                  </div>
                  <div className="border-b border-[#1d2132] flex items-start w-full">
                    <div className="w-[140px] shrink-0 px-[12px] py-[8px] flex flex-col items-start justify-center">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d] whitespace-nowrap">
                        Deep Link
                      </p>
                    </div>
                    <div className="flex-1 px-[12px] py-[8px] min-w-0">
                      <p className="[font-family:'JetBrains_Mono',monospace] text-[13px] leading-[20px] text-[#7631ee] truncate">
                        {line.linkedSource.deepLink}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start w-full">
                    <div className="w-[140px] shrink-0 px-[12px] py-[8px] flex flex-col items-start justify-center">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] text-[#6c779d] whitespace-nowrap">
                        Derived From
                      </p>
                    </div>
                    <div className="flex-1 px-[12px] py-[8px] min-w-0">
                      <p className="[font-family:'JetBrains_Mono',monospace] text-[13px] leading-[20px] text-[#a8b9f4] truncate">
                        {source}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer description */}
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] w-full">
                  Preview of the underlying record. This is a viewer, not the system of record. Close it to return to the proposal.
                </p>
              </div>
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
  onAction: (action: AgentModalAction, proposal: AgentProposal, payload?: AgentModalEditPayload) => void;
  onPrev?: () => void;
  onNext?: () => void;
  pagerDisabled?: boolean;
}) {
  const { format } = useCurrency();
  const decisions = useAgentDecisions();
  const [viewingEvidence, setViewingEvidence] = useState<EvidenceLine | null>(null);
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editFloor, setEditFloor] = useState("");
  const [editForecastNote, setEditForecastNote] = useState("");
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);

  /* Reset transient edit state whenever a different record is shown. */
  const proposalId = proposal?.id;
  useEffect(() => {
    setEditing(false);
    setViewingEvidence(null);
    setUndoConfirmOpen(false);
    if (proposal) {
      setDraft(
        proposal.scenarioModule.kind === "message_preview"
          ? proposal.scenarioModule.draft
          : "",
      );
      setEditAmount(proposal.amount !== null ? Number(proposal.amount).toLocaleString("en-US") : "");
      setEditCategory(proposal.agentKey === "reconciliation" ? "Merchant fees" : "");
      if (proposal.scenarioModule.kind === "forecast_chart") {
        setEditFloor(Number(proposal.scenarioModule.floor).toLocaleString("en-US"));
        setEditForecastNote("");
      } else {
        setEditFloor("");
        setEditForecastNote("");
      }
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
     auto-approved one, so the seed status is overridden by the decision. */
  const isAutoApproved =
    proposal.status === "approved_automatically" &&
    decisions[proposal.id] !== "undone_to_review";
  /* The user's decision on this record (if any). A decided needs_review record
     opened again (e.g. as a receipt from the Activity page) renders a muted
     decision line in the footer instead of re-offering Approve / Reject. */
  const decided = decisions[proposal.id];
  const riskNoteColor =
    proposal.riskLevel === "high"
      ? "#d20344"
      : proposal.riskLevel === "elevated"
        ? "#ff9500"
        : "#6c779d";
  /* Inline edit form applies to propose-mode agents whose editable surface is a
     field (amount / category) rather than the message preview itself. */
  const editViaModule = proposal.scenarioModule.kind === "message_preview";
  const showEditForm = editing && !editViaModule;

  const nextSteps: { icon: string; label: string; text: string }[] = [
    {
      icon: approveIcon,
      label: "Approve",
      text: proposal.whatHappensNext.ifApproved,
    },
    {
      icon: editIcon,
      label: "Edit",
      text: proposal.whatHappensNext.ifEdited,
    },
    {
      icon: rejectIcon,
      label: "Reject",
      text: proposal.whatHappensNext.ifRejected,
    },
  ];

  const hasPager = onPrev && onNext;

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
          {/* Header: agent name centered, close right */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full flex items-center justify-between px-[16px]">
            {/* Left: spacer to balance close button */}
            <div className="w-[32px] shrink-0" />
            {/* Center: agent name */}
            <DialogPrimitive.Title
              className="absolute left-1/2 -translate-x-1/2 [font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[24px] text-[#a8b9f4] whitespace-nowrap"
              data-testid="text-agent-name"
            >
              {proposal.agentDisplayName}
            </DialogPrimitive.Title>
            {/* Right: close */}
            <DialogPrimitive.Close
              data-testid="button-agent-proposal-close"
              aria-label="Close"
              className="size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] shrink-0"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          {/* Hero: status badge + title/amount row + subtitle */}
          <div className="border-b border-[#1d2132] border-solid flex flex-col gap-[8px] items-start p-[24px] shrink-0 w-full">
            {isAutoApproved ? (
              <div
                className="inline-flex items-center justify-center bg-[#123509] border border-[rgba(66,191,35,0.25)] px-[12px] py-[5px] rounded-[100px]"
                data-testid="pill-auto-approved"
              >
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[16px] text-[#42bf23] whitespace-nowrap">
                  Auto-Approved
                </span>
              </div>
            ) : (
              <div
                className="inline-flex items-center justify-center px-[12px] py-[5px] rounded-[100px]"
                style={{ background: risk.bg, border: `1px solid ${risk.border}` }}
                data-testid="pill-risk-level"
              >
                <span
                  className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[16px] whitespace-nowrap"
                  style={{ color: risk.color }}
                >
                  {risk.label}
                </span>
              </div>
            )}
            <div className="flex gap-[24px] items-start w-full">
              <p
                className="[font-family:'Gilroy',sans-serif] font-semibold text-[20px] leading-[28px] text-[#a8b9f4] flex-1 min-w-0"
                data-testid="text-agent-proposal-title"
              >
                {proposal.title}
              </p>
              {proposal.amount !== null && (
                <p
                  className="[font-family:'JetBrains_Mono',monospace] font-medium text-[20px] leading-[28px] text-[#a8b9f4] shrink-0"
                  data-testid="text-agent-proposal-amount"
                >
                  {format(proposal.amount)}
                </p>
              )}
            </div>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] w-full">
              {proposal.subtitle}
            </p>
          </div>

          {/* Scrollable body */}
          <div className="flex flex-col gap-[32px] items-start p-[24px] w-full overflow-y-auto">

            {/* WHY BRAIN SUGGESTED THIS / WHY THIS DIDN'T NEED REVIEW */}
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>
                {isAutoApproved ? "Why This Didn't Need Review" : "Why Brain Suggested This"}
              </SectionLabel>
              <p
                id="agent-proposal-trigger"
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] w-full"
                data-testid="text-agent-proposal-trigger"
              >
                {proposal.whySuggested.trigger}
              </p>
              {/* Evidence card: dark card with icon rows */}
              <div className="bg-[#0a0c10] border border-[#1d2132] rounded-[12px] w-full flex flex-col overflow-hidden">
                {proposal.whySuggested.evidence.map((line, i) => (
                  <EvidenceRow
                    key={i}
                    line={line}
                    isLast={i === proposal.whySuggested.evidence.length - 1}
                    onClick={() => setViewingEvidence(line)}
                    index={i}
                  />
                ))}
              </div>
              {/* Scenario module (e.g. subscription_table, entity_comparison)
                  sits inside the WHY section for both tabs, below evidence */}
              <div className="mt-[16px] w-full">
                {renderScenarioModule(
                  proposal.scenarioModule,
                  risk.color,
                  format,
                  editing,
                  draft,
                  setDraft,
                  (doc) => { setViewingDocument(doc); setDocumentOpen(true); },
                )}
              </div>
              {/* Auto-approved: "Auto-approved because: ..." */}
              {isAutoApproved && proposal.approvedAutomaticallyMeta && (
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] w-full"
                  data-testid="text-auto-approved-reason"
                >
                  <span className="font-semibold text-[#a8b9f4]">Auto-approved because: </span>
                  {proposal.approvedAutomaticallyMeta.autoApprovalReason}
                </p>
              )}
            </div>

            {/* CONFIDENCE — hidden for auto-approved (receipt) proposals.
                The HR separator lives inside this block so the bar → HR
                spacing matches Figma (bar ends at 36px, HR at ~68px). */}
            {!isAutoApproved && (
              <div className="flex flex-col gap-[16px] items-start w-full" data-testid="bar-confidence">
                <SectionLabel
                  right={
                    <span className="[font-family:'JetBrains_Mono',monospace] font-semibold text-[14px] leading-[14px] text-[#6c779d] shrink-0">
                      {confidencePct}%
                    </span>
                  }
                >
                  Confidence
                </SectionLabel>
                <div className="flex flex-col gap-[32px] w-full">
                  <div className="h-[6px] w-full rounded-[3px] bg-[#222737] relative overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full rounded-[3px] bg-[#7631ee]"
                      style={{ width: `${confidencePct}%` }}
                    />
                  </div>
                  <HR />
                </div>
              </div>
            )}

            {/* Inline edit form for non-message agents */}
            {showEditForm && (
              <div className="flex flex-col gap-[16px] items-start w-full" data-testid="form-inline-edit">
                <SectionLabel>
                  {(() => {
                    if (proposal.agentKey === "reconciliation") return "Edit Amount & Category";
                    if (proposal.agentKey === "cash_forecast") return "Edit Forecast";
                    return "Edit Amount";
                  })()}
                </SectionLabel>
                {(proposal.amount !== null || proposal.agentKey === "reconciliation") && (
                  <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[16px] p-[16px] flex flex-col gap-[16px]">
                    {/* Amount row */}
                    {proposal.amount !== null && (
                      <div className="flex gap-[16px] items-center w-full">
                        <p className="w-[140px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#a8b9f4]">
                          Amount
                        </p>
                        <div className="bg-[#222737] flex flex-1 items-center px-[8px] py-[10px] rounded-[8px] min-w-0">
                          <div className="flex gap-[2px] items-center w-full">
                            <DollarSign size={16} className="shrink-0 text-[#6c779d]" />
                            <input
                              value={editAmount}
                              onChange={(e) =>
                                setEditAmount(e.target.value.replace(/[^0-9.,]/g, ""))
                              }
                              inputMode="decimal"
                              data-testid="input-edit-amount"
                              className="bg-transparent border-none [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] focus:outline-none w-full"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Category row (reconciliation only) */}
                    {proposal.agentKey === "reconciliation" && (
                      <div className="flex gap-[16px] items-center w-full">
                        <p className="w-[140px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#a8b9f4]">
                          Entry category
                        </p>
                        <div className="flex-1 min-w-0">
                          <Select
                            value={editCategory}
                            onValueChange={setEditCategory}
                          >
                            <SelectTrigger
                              data-testid="select-edit-category"
                              className="w-full bg-[#222737] border-none rounded-[8px] px-[8px] py-[10px] [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] focus:ring-2 focus:ring-[#7631EE] focus:ring-offset-0 h-auto"
                            >
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#11141b] border border-[#1d2132] rounded-[8px]">
                              {RECONCILIATION_CATEGORIES.map((cat) => (
                                <SelectItem
                                  key={cat}
                                  value={cat}
                                  className="[font-family:'Gilroy',sans-serif] text-[16px] text-[#a8b9f4] focus:bg-[#222737] focus:text-[#a8b9f4] cursor-pointer"
                                >
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Cash forecasting editable fields */}
                {proposal.agentKey === "cash_forecast" && (
                  <div className="w-full bg-[#0a0c10] border border-[#1d2132] rounded-[16px] p-[16px] flex flex-col gap-[16px]">
                    <div className="flex gap-[16px] items-center w-full">
                      <p className="w-[140px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#a8b9f4]">
                        Working Capital Floor
                      </p>
                      <div className="bg-[#222737] flex flex-1 items-center px-[8px] py-[10px] rounded-[8px] min-w-0">
                        <div className="flex gap-[2px] items-center w-full">
                          <DollarSign size={16} className="shrink-0 text-[#6c779d]" />
                          <input
                            value={editFloor}
                            onChange={(e) =>
                              setEditFloor(e.target.value.replace(/[^0-9.,]/g, ""))
                            }
                            inputMode="decimal"
                            data-testid="input-edit-floor"
                            className="bg-transparent border-none [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] focus:outline-none w-full"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-[16px] items-start w-full">
                      <p className="w-[140px] shrink-0 pt-[10px] [font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-[#a8b9f4]">
                        Notes / Assumptions
                      </p>
                      <textarea
                        value={editForecastNote}
                        onChange={(e) => setEditForecastNote(e.target.value)}
                        rows={3}
                        data-testid="input-edit-forecast-note"
                        placeholder="Add known upcoming expenses or income..."
                        className="flex-1 bg-[#222737] border-none rounded-[8px] px-[8px] py-[10px] [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] resize-none min-w-0"
                      />
                    </div>
                  </div>
                )}

                <p className="mt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] leading-[14px] text-[#414965]">
                  Changes only apply after you approve.
                </p>
              </div>
            )}

            {/* RECOMMENDED ACTION */}
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>Recommended Action</SectionLabel>
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[21px] text-[#a8b9f4] text-[15px] w-full"
                data-testid="text-recommended-action"
              >
                {proposal.recommendedAction}
              </p>
            </div>

            {/* WHAT HAPPENS NEXT / OUTCOME */}
            <div className="flex flex-col gap-[16px] items-start w-full">
              <SectionLabel>
                {isAutoApproved ? "Outcome" : "What Happens Next"}
              </SectionLabel>
              {isAutoApproved && proposal.approvedAutomaticallyMeta ? (
                <>
                  {/* Title + date stacked */}
                  <div className="flex flex-col gap-[16px] items-start w-full">
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] w-full"
                      data-testid="text-outcome-summary"
                    >
                      {proposal.approvedAutomaticallyMeta.outcome.summary}
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px]">
                      {new Date(
                        proposal.approvedAutomaticallyMeta.approvedAt,
                      ).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {/* Purple View button */}
                  <button
                    type="button"
                    onClick={() =>
                      setViewingEvidence({
                        text: "View record",
                        linkedSource: proposal.approvedAutomaticallyMeta!.outcome.linkedSource,
                      })
                    }
                    data-testid="link-outcome-record"
                    className="inline-flex items-center gap-[8px] px-[20px] py-[8px] rounded-[100px] bg-[#240757] hover:bg-[#2e0a6e] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#7631ee] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <ArrowUpRight size={20} className="text-[#7631ee] shrink-0" />
                    View{" "}
                    {proposal.approvedAutomaticallyMeta.outcome.linkedSource.type
                      .split("_")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")}{" "}
                    Record
                  </button>
                </>
              ) : isNotifyOnly ? (
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] w-full"
                  data-testid="text-notify-only-next"
                >
                  This is a flag for your awareness. Brain does not take action on it automatically.
                </p>
              ) : (
                <div className="flex flex-col gap-[16px] w-full">
                  {nextSteps.map((step) => (
                    <div
                      key={step.label}
                      className="flex items-center gap-[10px] w-full"
                      data-testid={`next-step-${step.label.toLowerCase()}`}
                    >
                      <img
                        src={step.icon}
                        alt={step.label}
                        className="size-[28px] shrink-0"
                      />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[19px] text-[13px] text-[#6c779d]">
                        <span className="font-semibold text-[#a8b9f4]">{step.label}</span>
                        {" "}
                        {step.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {/* Info box — matches Figma 5822-66648: border-only, Info icon, riskNote */}
              <div
                className="border border-[#1d2132] rounded-[12px] p-[8px] flex items-start gap-[8px] w-full"
                data-testid="box-risk-info"
              >
                <Info size={16} className="text-[#6c779d] shrink-0 mt-[1px]" />
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] flex-1 min-w-0"
                  data-testid="text-risk-note"
                >
                  {proposal.riskNote}
                </p>
              </div>
            </div>
          </div>

          {/* Sticky action footer — hidden for auto-approved irreversible/informational */}
          {(!isAutoApproved || proposal.approvedAutomaticallyMeta?.reversibility === "reversible") && (
          <div className="border-t border-[#1d2132] bg-[rgba(17,20,27,0.9)] backdrop-blur-[10px] p-[24px] w-full shrink-0">
            {isAutoApproved ? (
              (() => {
                const meta = proposal.approvedAutomaticallyMeta!;
                return (
                  <div className="flex flex-col gap-[16px] w-full">
                    {undoConfirmOpen ? (
                      <div className="flex flex-col gap-[16px] w-full">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#a8b9f4] text-center">
                          {meta.undoAction}
                        </p>
                        <div className="flex gap-[12px] w-full">
                          <button
                            type="button"
                            onClick={() => setUndoConfirmOpen(false)}
                            data-testid="button-undo-cancel"
                            className="flex-1 px-[20px] py-[10px] rounded-[100px] bg-[#222737] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUndoConfirmOpen(false);
                              onAction("undo", proposal);
                            }}
                            data-testid="button-undo-confirm"
                            className="flex-1 px-[20px] py-[10px] rounded-[100px] bg-[#123509] hover:bg-[#0e2a07] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#42bf23] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23]"
                          >
                            Undo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setUndoConfirmOpen(true)}
                        data-testid="button-agent-undo"
                        className="w-full px-[20px] py-[10px] rounded-[100px] bg-[#222737] hover:bg-[#2a3050] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                );
              })()
            ) : decided === "approved" || decided === "rejected" ? (
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d] text-center w-full"
                data-testid="text-agent-decided"
              >
                {decided === "approved"
                  ? "You approved this proposal."
                  : "You rejected this proposal."}
              </p>
            ) : isNotifyOnly && decided === "acknowledged" ? (
              <p
                className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-[#6c779d] text-center w-full"
                data-testid="text-agent-acknowledged"
              >
                You acknowledged this flag.
              </p>
            ) : isNotifyOnly ? (
              <button
                type="button"
                onClick={() => onAction("acknowledge", proposal)}
                data-testid="button-agent-acknowledge"
                className="w-full px-[20px] py-[10px] rounded-[100px] bg-[#7631ee] hover:bg-[#6528d4] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#11141b]"
              >
                Acknowledge
              </button>
            ) : (
              <div className="flex gap-[12px] w-full">
                <button
                  type="button"
                  onClick={() =>
                    onAction("reject", proposal, {
                      amount: editAmount,
                      category: editCategory,
                      floor: editFloor,
                      forecastNote: editForecastNote,
                      draft,
                    })
                  }
                  data-testid="button-agent-reject"
                  className="flex-1 px-[20px] py-[10px] rounded-[100px] bg-[#350011] hover:bg-[#44001a] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#d20344] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d20344]"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  data-testid="button-agent-edit"
                  className={`flex-1 px-[20px] py-[10px] rounded-[100px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] ${
                    editing
                      ? "bg-[#240757] border border-[rgba(118,49,238,0.4)] text-[#7631ee]"
                      : "bg-[#222737] hover:bg-[#2a3050] text-[#6c779d]"
                  }`}
                >
                  {editing ? "Done" : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAction("approve", proposal, {
                      amount: editAmount,
                      category: editCategory,
                      floor: editFloor,
                      forecastNote: editForecastNote,
                      draft,
                    })
                  }
                  data-testid="button-agent-approve"
                  className="flex-1 px-[20px] py-[10px] rounded-[100px] bg-[#123509] hover:bg-[#0e2a07] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#42bf23] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23]"
                >
                  Approve
                </button>
              </div>
            )}
          </div>
          )}

          {/* Navigation footer: previous / next pager (moved from header) */}
          {hasPager && (
            <div className="border-t border-[#1d2132] bg-[rgba(17,20,27,0.9)] backdrop-blur-[10px] px-[24px] py-[16px] w-full shrink-0">
              <div className="flex items-center justify-between w-full">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={pagerDisabled}
                  aria-label="Previous record"
                  data-testid="button-agent-proposal-prev"
                  className="flex items-center gap-[8px] px-[20px] py-[8px] rounded-[100px] bg-[#222737] hover:bg-[#2a3050] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#6c779d] disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <ArrowLeft size={20} />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={pagerDisabled}
                  aria-label="Next record"
                  data-testid="button-agent-proposal-next"
                  className="flex items-center gap-[8px] px-[20px] py-[8px] rounded-[100px] bg-[#222737] hover:bg-[#2a3050] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[16px] text-[#6c779d] disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  Next
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* Nested evidence sheet. Closes back to the proposal, never navigates away */}
          <EvidenceSheet
            line={viewingEvidence}
            source={proposal.source}
            onClose={() => setViewingEvidence(null)}
          />

          {/* Document viewer for linked evidence in document_stack modules */}
          <DocumentViewerPopup
            document={viewingDocument}
            open={documentOpen}
            onOpenChange={setDocumentOpen}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
