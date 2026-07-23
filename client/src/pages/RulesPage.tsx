import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight,
  Plus,
  Sparkles,
  Check,
  Pencil,
  Flag,
} from "lucide-react";
import alertIcon from "@assets/Icons_1783274957589.png";
import closeIcon from "@assets/Close_1783293571882.png";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import infoIcon from "@assets/Icons_1783346130548.png";
import defaultInfoIcon from "@assets/Icons_1783346458429.png";
import shieldKeyIcon from "@assets/Normal_1783346551915.png";
import {
  useRules,
  createRule,
  consumeRuleDraft,
  hydrateUserRules,
} from "@/lib/rulesStore";
import {
  useRuleSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  hydrateSuggestions,
} from "@/lib/rule-suggestions";
import { useBrainPolicy } from "@/lib/brainPolicy";
import { useBrainVendors } from "@/lib/brainVendors";
import { useCurrency } from "@/lib/currencyContext";
import type { AutoRule, RuleSuggestion } from "@/lib/proposalTypes";

const ACTIVE = "#42bf23";

/* Plain-English category → the policy the rule "compiles to" (shown in the
   builder's visible compile line). Only used by the rule builder here. */
const CATEGORY_TO_POLICY: Record<string, string> = {
  bill: "policy/ap.tolerance.v3",
  subscription: "policy/ap.saas.v2",
  rent: "policy/ap.fixed.v1",
  payroll: "policy/ap.payroll.v4",
  invoice: "policy/ar.collections.v1",
};
const BUILDER_CATEGORIES = Object.keys(CATEGORY_TO_POLICY);

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const newId = (name: string) => `${slugify(name) || "rule"}-${Date.now().toString(36)}`;

/* Turn a partial draft (from the builder or an accepted suggestion) into a
   fully-formed rule, filling sensible defaults. */
function finalizeDraft(draft: Partial<AutoRule>): AutoRule {
  const name = draft.name ?? "New rule";
  return {
    id: draft.id ?? newId(name),
    kind: draft.kind ?? "automation",
    name,
    summary: draft.summary ?? "",
    createdLabel: "You just created this",
    policyId: draft.policyId ?? "policy/custom.v1",
    active: true,
    locked: false,
    agent: draft.agent,
    category: draft.category,
    cap: draft.cap,
    threshold: draft.threshold,
    thresholdEditable: draft.thresholdEditable,
    allowlist: draft.allowlist,
    scopeSummary: draft.scopeSummary,
  };
}

/* ── Pause/resume toggle ────────────────────────────────────────────────────── */
const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

/* Rule confirmation sentence: natural-language summary with highlighted vars */
function RuleConfirmSentence({ rule }: { rule: AutoRule }) {
  const { format } = useCurrency();
  const category = titleCase(rule.category || "payment");
  const isGuardrail = rule.kind === "guardrail";
  const vendor = rule.allowlist?.[0];
  const amount = rule.cap ?? rule.threshold ?? 0;
  const amountStr = format(amount);

  const actionLabel = isGuardrail
    ? "flag for review"
    : rule.name.startsWith("Queue")
      ? "queue for one-click approval"
      : "pay it automatically";

  return (
    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px] w-full">
      <span>When a </span>
      <span className="[font-family:'Gilroy',sans-serif] font-semibold underline [text-underline-position:from-font] decoration-from-font decoration-solid">{category}</span>
      {vendor && (
        <>
          <span> from </span>
          <span className="[font-family:'Gilroy',sans-serif] font-semibold underline [text-underline-position:from-font] decoration-from-font decoration-solid">{vendor}</span>
        </>
      )}
      <span> is {isGuardrail ? "over" : "under"} </span>
      <span className="[font-family:'Gilroy',sans-serif] font-semibold underline [text-underline-position:from-font] decoration-from-font decoration-solid">{amountStr}</span>
      <span> then </span>
      <span className="[font-family:'Gilroy',sans-serif] font-semibold underline [text-underline-position:from-font] decoration-from-font decoration-solid">{actionLabel}</span>
      <span>?</span>
    </p>
  );
}

/* ── Section wrapper - card with header, always visible ─────────────────────── */
function Section({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
          <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
        {count === 0 && empty ? (
          <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
            {empty}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ── Automation row - acts for you ──────────────────────────────────────────── */
function AutomationRow({ rule }: { rule: AutoRule }) {
  const [, navigate] = useLocation();
  const openReports = (rule.problemReports ?? []).filter((p) => !p.resolved);
  const pausedFromReport = !rule.active && openReports.length > 0;
  const open = () => navigate(`/rules/${rule.id}`);

  return (
    <div
      data-testid={`row-automation-${rule.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
    >
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap w-full">
          {titleCase(rule.name)}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
          {titleCase(rule.scopeSummary ?? rule.summary)}
        </p>
        {pausedFromReport && (
          <div className="bg-[#350011] border border-[rgba(210,3,68,0.2)] border-solid flex items-center p-[8px] relative rounded-[12px] w-full mt-[4px]">
            <div className="flex gap-[8px] items-start relative">
              <img src={alertIcon} alt="" className="size-[16px] rounded-full shrink-0 mt-[1px]" />
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#d20344] text-[14px]">
                Paused after you reported a problem.
              </p>
            </div>
          </div>
        )}
      </button>
      <div className="content-stretch flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0 border border-solid bg-[#123509] border-[rgba(66,191,35,0.2)]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap text-[#42bf23]">
          Anchored
        </p>
      </div>
    </div>
  );
}

/* ── Guardrail row - pulls you back in above a threshold ─────────────────────── */
function GuardrailRow({ rule }: { rule: AutoRule }) {
  const [, navigate] = useLocation();
  const openReports = (rule.problemReports ?? []).filter((p) => !p.resolved);
  const pausedFromReport = !rule.active && openReports.length > 0;
  const open = () => navigate(`/rules/${rule.id}`);
  return (
    <div
      data-testid={`row-guardrail-${rule.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
    >
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap w-full">
          {titleCase(rule.name)}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
          {titleCase(rule.summary)}
        </p>
        {pausedFromReport && (
          <div className="bg-[#350011] border border-[rgba(210,3,68,0.2)] border-solid flex items-center p-[8px] relative rounded-[12px] w-full mt-[4px]">
            <div className="flex gap-[8px] items-start relative">
              <img src={alertIcon} alt="" className="size-[16px] rounded-full shrink-0 mt-[1px]" />
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#d20344] text-[14px]">
                Paused after you reported a problem.
              </p>
            </div>
          </div>
        )}
      </button>
      <div className="content-stretch flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0 border border-solid bg-[#123509] border-[rgba(66,191,35,0.2)]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap text-[#42bf23]">
          Anchored
        </p>
      </div>
    </div>
  );
}

/* ── Always-on row - locked, no toggle ──────────────────────────────────────── */
function AlwaysOnRow({ rule }: { rule: AutoRule }) {
  const [, navigate] = useLocation();
  const open = () => navigate(`/rules/${rule.id}`);
  return (
    <div
      data-testid={`row-alwayson-${rule.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
    >
      <img src={shieldKeyIcon} alt="shield" className="shrink-0 w-[20px] h-[20px]" />
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap w-full">
          {titleCase(rule.name)}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
          {titleCase(rule.summary)}
        </p>
      </button>
      <div className="content-stretch flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0 border border-solid bg-[#123509] border-[rgba(66,191,35,0.2)]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap text-[#42bf23]">
          Always On
        </p>
      </div>
    </div>
  );
}

/* ── Brain-core default policy - displayed under the "Default" tab ────────
   Phase 2a: display only. The tenant's ACTUAL signed policy (thresholds,
   quorum, approval requirements), NOT the app's mock/user rule cards.
   Mutations (pause/edit threshold) need policy:sign scope the token lacks;
   that's Phase 2b. See client/src/lib/brainPolicy.ts for the mapping. */
function PolicySection() {
  const { isLoading, isError, rules, version, quorum } = useBrainPolicy();

  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">
            Default Brain Rules
          </p>
          <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{rules.length}</p>
          </div>
        </div>
        {!isLoading && !isError && version !== undefined && (
          <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] text-[#6c779d] whitespace-nowrap">
            v{version} · quorum {quorum}
          </p>
        )}
      </div>
      <div className="flex flex-col items-start p-[8px] gap-[8px] relative shrink-0 w-full">
        {isLoading && (
          <p className="w-full p-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
            Loading your active policy from Brain…
          </p>
        )}
        {!isLoading && isError && (
          <p className="w-full p-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
            Couldn't load your active policy from Brain right now.
          </p>
        )}
        {!isLoading && !isError && rules.length === 0 && (
          <p className="w-full p-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
            No active policy found for your account yet.
          </p>
        )}
        {!isLoading && !isError && rules.map((r, idx) => (
          <div key={r.id} className="flex flex-col gap-[8px] w-full">
            <AlwaysOnRow rule={r} />
            {idx < rules.length - 1 && <Divider />}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Title case helper, used for all labels platform-wide */
const ALWAYS_UPPER = new Set(["ap", "ar", "cfo", "ceo", "coo", "cto", "cmo", "cpo", "cro"]);
function titleCase(str: string) {
  return str
    .replace(/(^| )&($| )/g, "$1and$2")
    .replace(/\w\S*/g, (txt) => {
      const lower = txt.toLowerCase();
      if (ALWAYS_UPPER.has(lower)) return lower.toUpperCase();
      return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
    });
}

/* ── Confidence pill style per Figma ────────────────────────────────────────── */
const CONFIDENCE: Record<RuleSuggestion["confidence"], { label: string; bg: string; border: string; text: string }> = {
  high: { label: "High Confidence", bg: "#123509", border: "rgba(66,191,35,0.2)", text: "#42bf23" },
  medium: { label: "Medium Confidence", bg: "#4a2300", border: "rgba(255,148,0,0.2)", text: "#ff9500" },
  low: { label: "Low Confidence", bg: "#222737", border: "rgba(108,119,157,0.2)", text: "#6c779d" },
};

function SuggestionCard({
  suggestion,
  onAccept,
  onTweak,
  onDismiss,
}: {
  suggestion: RuleSuggestion;
  onAccept: () => void;
  onTweak: () => void;
  onDismiss: () => void;
}) {
  const conf = CONFIDENCE[suggestion.confidence];
  return (
    <div
      className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full"
      data-testid={`card-suggestion-${suggestion.id}`}
    >
      {/* Header: title + confidence pill */}
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[12px] relative shrink-0 w-full">
        <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
          <p className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] min-w-px text-[#a8b9f4] text-[20px]" data-testid={`text-suggestion-title-${suggestion.id}`}>
            {titleCase(suggestion.title)}
          </p>
          <span
            className="shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[16px] px-[10px] py-[4px] rounded-[22px] border border-solid whitespace-nowrap"
            style={{ backgroundColor: conf.bg, borderColor: conf.border, color: conf.text }}
            data-testid={`text-confidence-${suggestion.id}`}
          >
            {conf.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-[16px] items-start p-[16px] relative shrink-0 w-full">
        <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#a8b9f4] text-[16px]">
          {suggestion.description}
        </p>

        {/* Evidence table: key/value rows with fixed label column. */}
        <div className="bg-[#0a0c10] border border-[#1d2132] border-solid flex flex-col items-start relative rounded-[8px] shrink-0 w-full">
          {suggestion.evidence.map((fact, i) => (
            <div
              key={i}
              className={`content-stretch flex items-start relative shrink-0 w-full ${i < suggestion.evidence.length - 1 ? "border-b border-[#1d2132]" : ""}`}
            >
              <div className="flex flex-col items-start justify-center px-[12px] py-[8px] relative shrink-0 w-[200px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[12px] whitespace-nowrap">
                  {titleCase(fact.label)}
                </p>
              </div>
              <div className="flex flex-1 flex-col items-start justify-center min-w-px px-[12px] py-[8px] relative">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[13px]"
                  style={{ color: fact.severity === "clean" ? ACTIVE : "#a8b9f4" }}
                >
                  {fact.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons row: Accept + Edit on left, Dismiss on right. */}
        <div className="flex items-start justify-between relative shrink-0 w-full">
          <div className="flex gap-[16px] items-center relative shrink-0">
            <button
              type="button"
              onClick={onAccept}
              data-testid={`button-accept-suggestion-${suggestion.id}`}
              className="bg-[#240757] content-stretch flex items-center justify-center px-[12px] py-[8px] relative rounded-[100px] shrink-0 w-[140px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#7631ee] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onTweak}
              data-testid={`button-tweak-suggestion-${suggestion.id}`}
              className="bg-[#222737] content-stretch flex items-center justify-center px-[12px] py-[8px] relative rounded-[100px] shrink-0 w-[140px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
            >
              Edit
            </button>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            data-testid={`button-dismiss-suggestion-${suggestion.id}`}
            className="bg-[#11141b] content-stretch flex items-center justify-center px-[12px] py-[8px] relative rounded-[100px] shrink-0 w-[140px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Chip dropdown used by the sentence builder ─────────────────────────────── */
function Chip({
  value,
  placeholder,
  open,
  onClick,
  testId,
  compact,
}: {
  value?: string;
  placeholder: string;
  open: boolean;
  onClick: () => void;
  testId: string;
  compact?: boolean;
}) {
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center gap-[4px] rounded-[8px] transition-colors [font-family:'Gilroy',sans-serif] text-[14px] ${
        compact ? "py-[2px] px-[8px]" : "py-[3px] px-[10px]"
      } ${
        hasValue
          ? "bg-[#240757] text-[#a8b9f4] font-semibold"
          : "bg-[#11141b] text-[#6c779d] font-medium"
      }`}
    >
      {value ?? placeholder}
      <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

type BuilderAction = "auto" | "queue" | "flag" | "";

type BuilderState = {
  category: string;
  vendor: string;
  amount: string;
  action: BuilderAction;
};

const EMPTY_BUILDER: BuilderState = { category: "", vendor: "", amount: "", action: "" };

const ACTION_LABELS: Record<Exclude<BuilderAction, "">, string> = {
  auto: "pay it automatically",
  queue: "queue for one-click approval",
  flag: "flag for review",
};

type RuleTab = "Default" | "Automations" | "Guardrails" | "Suggested";
const RULE_TABS: RuleTab[] = ["Default", "Automations", "Guardrails", "Suggested"];
const TAB_PARAM_MAP: Record<string, RuleTab> = {
  default: "Default",
  automations: "Automations",
  guardrails: "Guardrails",
  suggested: "Suggested",
};

export function RulesPage() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const rules = useRules();
  const suggestions = useRuleSuggestions();
  const { vendors } = useBrainVendors();
  // Live counterparties carry no allowlist/trust-tier concept of their own —
  // "trusted" is the one real trustStatus brain-core-derived vendors can hit
  // (see brainVendors.ts's deriveTrustStatus). There's no live "untrusted"
  // signal to classify against, so that list stays honestly empty rather
  // than inventing one.
  // ponytail: brain-core never actually returns trustStatus "trusted" today
  // (deriveTrustStatus only yields "new"/"under_review"), so this reads
  // empty in practice until that changes — same honest-empty as untrusted.
  const trustedVendors = vendors.filter((v) => v.trustStatus === "trusted").map((v) => v.name);
  const untrustedVendors: string[] = [];

  const [activeTab, setActiveTabState] = useState<RuleTab>(() => {
    const sp = new URLSearchParams(search);
    const t = sp.get("tab");
    return t ? (TAB_PARAM_MAP[t] ?? "Default") : "Default";
  });
  const setActiveTab = (tab: RuleTab) => {
    setActiveTabState(tab);
    const slug = tab.toLowerCase().replace(/\s+/g, "-");
    navigate(`/rules?tab=${slug}`, { replace: true });
  };
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);
  const [openChip, setOpenChip] = useState<null | "category" | "vendor" | "action">(null);
  const [pendingCreate, setPendingCreate] = useState<AutoRule | null>(null);
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);

  const automations = rules.filter((r) => (r.kind ?? "automation") === "automation");
  const guardrails = rules.filter((r) => r.kind === "guardrail");

  const resetBuilder = () => {
    setBuilder(EMPTY_BUILDER);
    setOpenChip(null);
    setBuilderOpen(false);
  };

  const openBuilderPrefilled = (draft: Partial<AutoRule>) => {
    setBuilder({
      category: draft.category && BUILDER_CATEGORIES.includes(draft.category) ? draft.category : "",
      vendor: draft.allowlist?.[0] ?? "",
      amount: String(draft.cap ?? draft.threshold ?? ""),
      action: "",
    });
    setOpenChip(null);
    setBuilderOpen(true);
  };

  /* Load this account's persisted user-created rules + live suggestions on mount. */
  useEffect(() => {
    void hydrateUserRules();
    void hydrateSuggestions();
  }, []);

  /* "Always handle this" handoff: consume the draft + open the builder pre-filled. */
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("create") === "1") {
      const draft = consumeRuleDraft();
      if (draft) openBuilderPrefilled(draft);
      else setBuilderOpen(true);
      navigate("/rules", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountNum = Number(builder.amount.replace(/[^0-9.]/g, ""));
  const isAuto = builder.action === "auto" || builder.action === "queue";
  const builderValid =
    builder.category !== "" &&
    builder.action !== "" &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (!isAuto || builder.vendor !== "");

  const builderPolicy = isAuto
    ? CATEGORY_TO_POLICY[builder.category] ?? "policy/ap.tolerance.v3"
    : "policy/guardrail.approval.v1";

  const buildDraft = (): AutoRule => {
    const amt = Math.round(amountNum);
    if (builder.action === "auto") {
      const name = `Auto clear ${builder.category} from ${builder.vendor}`;
      return finalizeDraft({
        kind: "automation",
        name,
        summary: `${builder.vendor} · ${builder.category} · under ${format(amt)}`,
        policyId: builderPolicy,
        agent: "invoice",
        category: builder.category,
        cap: amt,
        allowlist: [builder.vendor],
        scopeSummary: `${builder.vendor} (${builder.category}) under ${format(amt)}`,
      });
    }
    if (builder.action === "queue") {
      const name = `Queue ${builder.category} from ${builder.vendor} for approval`;
      return finalizeDraft({
        kind: "automation",
        name,
        summary: `${builder.vendor} · ${builder.category} · under ${format(amt)} · queue for approval`,
        policyId: builderPolicy,
        agent: "invoice",
        category: builder.category,
        cap: amt,
        allowlist: [builder.vendor],
        scopeSummary: `${builder.vendor} (${builder.category}) under ${format(amt)} queued`,
      });
    }
    const name = `Flag ${builder.category} over ${format(amt)} for review`;
    return finalizeDraft({
      kind: "guardrail",
      name,
      summary: `Any ${builder.category} above ${format(amt)} gets flagged for review`,
      policyId: builderPolicy,
      agent: "invoice",
      category: "approval threshold",
      threshold: amt,
      thresholdEditable: true,
      scopeSummary: `any ${builder.category} over ${format(amt)}`,
    });
  };

  const onConfirmCreate = () => {
    if (pendingCreate) {
      createRule(pendingCreate);
      // Only retire the suggestion once the rule is actually confirmed.
      if (pendingSuggestionId) acceptSuggestion(pendingSuggestionId);
      setPendingSuggestionId(null);
      setPendingCreate(null);
      resetBuilder();
    }
  };

  const cancelCreate = () => {
    // Leave the suggestion in the list. Accept is not final until confirmed.
    setPendingSuggestionId(null);
    setPendingCreate(null);
  };

  const onAcceptSuggestion = (s: RuleSuggestion) => {
    setPendingSuggestionId(s.id);
    setPendingCreate(finalizeDraft(s.proposedRule));
  };

  // tab counts removed. Shown in table header instead

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px]">Rules</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">Your boundaries that Brain follows.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">
              Manage the rules that guide Brain's reviews, recommendations, and actions.
            </p>
          </div>

          <div className="flex flex-col gap-[16px] items-start w-full">
            {/* Tab bar: active tab is ORANGE */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap">
              {RULE_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex items-center justify-center gap-[6px] px-[14px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                    style={{ background: isActive ? "#4a2300" : "transparent" }}
                    data-testid={`tab-rule-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <p
                      className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap"
                      style={{ color: isActive ? "#ff9500" : "#414965" }}
                    >
                      {tab}
                    </p>
                  </button>
                );
              })}
            </div>

          {/* Create-rule confirmation: on Automations and Guardrails tabs */}
          {(activeTab === "Automations" || activeTab === "Guardrails") && pendingCreate && (
            <div
              className="w-full rounded-[16px] border p-[16px] flex flex-col gap-[12px]"
              style={{ background: "#240757", borderColor: "rgba(118,49,238,0.35)" }}
              data-testid="panel-create-confirm"
            >
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px] leading-[22px]">
                Create this rule?
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[15px] leading-[22px]">
                {pendingCreate.name}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px]">
                {pendingCreate.summary}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#7631ee]" data-testid="text-compile-confirm">
                compiles to {pendingCreate.policyId}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#6c779d]">
                Saved to your rules to guide Brain&apos;s reviews. Your enforced policy stays the signed Active Brain policy above until this is applied to it.
              </p>
              <div className="flex gap-[10px] items-stretch w-full pt-[2px]">
                <button
                  type="button"
                  onClick={cancelCreate}
                  data-testid="button-create-cancel"
                  className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4]"
                >
                  Not yet
                </button>
                <button
                  type="button"
                  onClick={onConfirmCreate}
                  data-testid="button-create-confirm"
                  className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-white"
                >
                  Create rule
                </button>
              </div>
            </div>
          )}

          {/* New rule: sentence builder. On Automations and Guardrails tabs */}
          {(activeTab === "Automations" || activeTab === "Guardrails") && (!builderOpen ? (
            <button
              type="button"
              onClick={() => {
                setBuilder(EMPTY_BUILDER);
                setBuilderOpen(true);
              }}
              data-testid="button-new-rule"
              className="w-full rounded-[16px] border border-dashed border-[#414965] bg-[#11141b] p-[16px] flex items-center justify-between cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#6c779d] text-[20px]">
                  Write a new rule in plain English
                </p>
              </div>
              <div className="bg-[#4a2300] flex gap-[4px] items-center justify-center px-[12px] py-[8px] relative rounded-[100px] shrink-0">
                <Plus size={16} className="text-[#ff9500]" />
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px]">
                  New Rule
                </span>
              </div>
            </button>
          ) : (
            <div className="w-full rounded-[16px] bg-[#0a0c10] p-[16px] flex flex-col gap-[12px]" data-testid="panel-builder">
              {/* Two-line sentence builder, matches Figma */}
              <div className="flex flex-col gap-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[15px] leading-[28px]">
                {/* Line 1: "When a [kind] from [vendor] is under [amount]" */}
                <div className="flex flex-wrap items-center gap-[6px]">
                  <span>When a</span>
                  <div className="relative">
                    <Chip
                      value={builder.category || undefined}
                      placeholder="kind of payment"
                      open={openChip === "category"}
                      onClick={() => setOpenChip(openChip === "category" ? null : "category")}
                      testId="chip-category"
                    />
                    {openChip === "category" && (
                      <div className="absolute z-10 mt-[6px] w-[220px] rounded-[12px] border border-[#1d2132] bg-[#11141b] p-[6px] shadow-lg">
                        {BUILDER_CATEGORIES.map((c) => {
                          const selected = builder.category === c;
                          const label = titleCase(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => { setBuilder((b) => ({ ...b, category: c })); setOpenChip(null); }}
                              data-testid={`option-category-${c}`}
                              className="w-full flex items-center justify-between gap-[8px] text-left rounded-[8px] px-[10px] py-[8px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]"
                            >
                              {label}
                              {selected && (
                                <div className="flex items-center justify-center rounded-full bg-[#42bf23] shrink-0" style={{ width: 16, height: 16 }}>
                                  <Check size={10} className="text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <span>from</span>
                  <div className="relative">
                    <Chip
                      value={builder.vendor || undefined}
                      placeholder="a trusted vendor"
                      open={openChip === "vendor"}
                      onClick={() => setOpenChip(openChip === "vendor" ? null : "vendor")}
                      testId="chip-vendor"
                    />
                    {openChip === "vendor" && (
                      <div className="absolute z-10 mt-[6px] w-[280px] rounded-[12px] border border-[#1d2132] bg-[#11141b] p-[6px] shadow-lg max-h-[320px] overflow-y-auto">
                        <p className="px-[10px] pt-[4px] pb-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] uppercase text-[#6c779d]">
                          Trusted vendors
                        </p>
                        {trustedVendors.length === 0 && (
                          <p className="px-[10px] pb-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#6c779d]">
                            No trusted vendors yet.
                          </p>
                        )}
                        {trustedVendors.map((v) => {
                          const selected = builder.vendor === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => { setBuilder((b) => ({ ...b, vendor: v })); setOpenChip(null); }}
                              data-testid={`option-vendor-${slugify(v)}`}
                              className="w-full flex items-center justify-between gap-[8px] text-left rounded-[8px] px-[10px] py-[8px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]"
                            >
                              {v}
                              {selected && (
                                <div className="flex items-center justify-center rounded-full bg-[#42bf23] shrink-0" style={{ width: 16, height: 16 }}>
                                  <Check size={10} className="text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                        <div className="mx-[10px] my-[6px] h-px bg-[#1d2132]" />
                        <p className="px-[10px] pt-[2px] pb-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] uppercase text-[#414965]">
                          Not Trusted Yet
                        </p>
                        {untrustedVendors.length === 0 ? (
                          <p className="px-[10px] pb-[4px] [font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#414965]">
                            Brain doesn't track an untrusted-vendor list yet.
                          </p>
                        ) : (
                          untrustedVendors.map((v) => (
                            <div
                              key={v}
                              className="w-full flex items-center justify-between gap-[8px] rounded-[8px] px-[10px] py-[8px]"
                            >
                              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#414965]">
                                {v}
                              </span>
                              <span className="shrink-0 px-[8px] py-[2px] rounded-[100px] bg-[#350011] text-[#d20344] [font-family:'Gilroy',sans-serif] font-semibold text-[10px] uppercase tracking-[0.04em]">
                                Not Trusted
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <span>is {isAuto ? "under" : "over"}</span>
                  <input
                    value={builder.amount}
                    inputMode="numeric"
                    placeholder="$0"
                    onChange={(e) => setBuilder((b) => ({ ...b, amount: e.target.value }))}
                    data-testid="input-builder-amount"
                    className="w-[80px] rounded-[8px] border border-[#1d2132] bg-[#06070a] px-[10px] py-[3px] [font-family:'JetBrains_Mono',monospace] text-[14px] text-[#a8b9f4] placeholder:text-[#414965] focus:outline-none focus-visible:border-[rgba(118,49,238,0.5)]"
                  />
                </div>

                {/* Line 2: "then [action]" */}
                <div className="flex flex-wrap items-center gap-[6px]">
                  <span>then</span>
                  <div className="relative">
                    <Chip
                      value={builder.action ? ACTION_LABELS[builder.action] : undefined}
                      placeholder="what happens"
                      open={openChip === "action"}
                      onClick={() => setOpenChip(openChip === "action" ? null : "action")}
                      testId="chip-action"
                    />
                    {openChip === "action" && (
                      <div className="absolute z-10 mt-[6px] w-[260px] rounded-[12px] border border-[#1d2132] bg-[#11141b] p-[6px] shadow-lg">
                        {([
                          { key: "auto", label: "Pay it automatically" },
                          { key: "queue", label: "Queue for one-click approval" },
                          { key: "flag", label: "Flag for review" },
                        ] as const).map(({ key, label }) => {
                          const selected = builder.action === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => { setBuilder((b) => ({ ...b, action: key })); setOpenChip(null); }}
                              data-testid={`option-action-${key}`}
                              className="w-full flex items-center justify-between gap-[8px] text-left rounded-[8px] px-[10px] py-[8px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]"
                            >
                              {label}
                              {selected && (
                                <div className="flex items-center justify-center rounded-full bg-[#42bf23] shrink-0" style={{ width: 16, height: 16 }}>
                                  <Check size={10} className="text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Compile line: what the sentence becomes */}
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#7631ee]" data-testid="text-compile-line">
                compiles to {builderPolicy}
              </p>

              <div className="h-px w-full bg-[#1d2132]" />

              <div className="flex gap-[10px] items-stretch w-full">
                <button
                  type="button"
                  onClick={resetBuilder}
                  data-testid="button-builder-cancel"
                  className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!builderValid}
                  onClick={() => setPendingCreate(buildDraft())}
                  data-testid="button-builder-create"
                  className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#4a2300] hover:bg-[#5a2d00] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#ff9500]"
                >
                  Create Rule
                </button>
              </div>
            </div>
          ))}

          {/* Tab content: each tab shows its own section */}

          {activeTab === "Default" && (
            <>
              <PolicySection />
              {/* Default-specific purple info banner */}
              <div
                className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
                style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
              >
                <img src={defaultInfoIcon} alt="info" className="shrink-0 mt-[2px] w-[15px] h-[15px]" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px]">
                  These rules are created automatically by Brain as a default policy layer to protect every tenant. They establish essential safeguards from the start, ensuring consistent security, governance, and oversight before any custom rules are added.
                </p>
              </div>
            </>
          )}

          {activeTab === "Automations" && (
            <>
              <Section
                title="Automations"
                count={automations.length}
                empty={<p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No automated rules yet. Create one for Brain to automatically handle payments for you.</p>}
              >
                {automations.map((r, idx) => (
                  <div key={r.id} className="flex flex-col gap-[8px] w-full">
                    <AutomationRow rule={r} />
                    {idx < automations.length - 1 && <Divider />}
                  </div>
                ))}
              </Section>
              <div
                className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
                style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
              >
                <img src={infoIcon} alt="info" className="shrink-0 mt-[2px] w-[15px] h-[15px]" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px]">
                  Rules are written in plain English, not code. Brain turns each one into an enforceable
                  policy for every agent you use, then keeps learning and suggesting new ones, backed by
                  the evidence behind them.
                </p>
              </div>
            </>
          )}

          {activeTab === "Guardrails" && (
            <>
              <Section
                title="Guardrails"
                count={guardrails.length}
                empty={<p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No guardrails set. Create one to block risky transactions automatically.</p>}
              >
                {guardrails.map((r, idx) => (
                  <div key={r.id} className="flex flex-col gap-[8px] w-full">
                    <GuardrailRow rule={r} />
                    {idx < guardrails.length - 1 && <Divider />}
                  </div>
                ))}
              </Section>
              <div
                className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
                style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
              >
                <img src={infoIcon} alt="info" className="shrink-0 mt-[2px] w-[15px] h-[15px]" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px]">
                  Rules are written in plain English, not code. Brain turns each one into an enforceable
                  policy for every agent you use, then keeps learning and suggesting new ones, backed by
                  the evidence behind them.
                </p>
              </div>
            </>
          )}

          {activeTab === "Suggested" && (
            <div className="flex flex-col gap-[16px] items-start w-full">
              {suggestions.length === 0 ? (
                <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                  <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                    Brain suggests policies as it sees patterns in your activity. Nothing yet.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
                  {suggestions.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      onAccept={() => onAcceptSuggestion(s)}
                      onTweak={() => { openBuilderPrefilled(s.proposedRule); dismissSuggestion(s.id); }}
                      onDismiss={() => dismissSuggestion(s.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
