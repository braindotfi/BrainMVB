import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight,
  Lock,
  Plus,
  Sparkles,
  Check,
  Pencil,
  ArrowRight,
  Flag,
  AlertTriangle,
} from "lucide-react";
import {
  useRules,
  pauseRule,
  resumeRule,
  createRule,
  consumeRuleDraft,
  hydrateUserRules,
} from "@/lib/rulesStore";
import {
  useRuleSuggestions,
  acceptSuggestion,
  dismissSuggestion,
} from "@/lib/rule-suggestions";
import {
  TRUSTED_VENDORS,
  UNTRUSTED_VENDORS,
  BUILDER_CATEGORIES,
  CATEGORY_TO_POLICY,
} from "@/lib/mockRules";
import { useCurrency } from "@/lib/currencyContext";
import type { AutoRule, RuleSuggestion } from "@/lib/proposalTypes";

const ACTIVE = "#42bf23";

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
function Toggle({ active, onChange, testId }: { active: boolean; onChange: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      data-testid={testId}
      role="switch"
      aria-checked={active}
      title={active ? "Pause this rule" : "Resume this rule"}
      className="relative shrink-0 h-[24px] w-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[100px]"
    >
      <div
        className="absolute h-[20px] left-[2px] rounded-[100px] top-[2px] w-[36px] transition-colors"
        style={{ background: active ? "#123509" : "#222737" }}
      />
      <div
        className="absolute rounded-[100px] size-[16px] top-[4px] transition-all"
        style={{ background: active ? ACTIVE : "#06070a", left: active ? "20px" : "4px" }}
      />
    </button>
  );
}

const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

/* ── Section wrapper — card with header, collapses when empty ───────────────── */
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
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
      <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
        {children}
      </div>
    </div>
  );
}

/* ── Automation row — acts for you ──────────────────────────────────────────── */
function AutomationRow({ rule }: { rule: AutoRule }) {
  const [, navigate] = useLocation();
  const openReports = (rule.problemReports ?? []).filter((p) => !p.resolved);
  const pausedFromReport = !rule.active && openReports.length > 0;
  const open = () => navigate(`/rules/${rule.id}`);

  return (
    <div
      data-testid={`row-automation-${rule.id}`}
      className={`flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full ${
        pausedFromReport
          ? "bg-[#11141b] border border-[#1d2132]"
          : "bg-[#0a0c10] border border-transparent"
      }`}
    >
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap w-full">
          {rule.name}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
          {rule.scopeSummary ?? rule.summary}
        </p>
        {pausedFromReport && (
          <div className="bg-[#350011] border border-[rgba(210,3,68,0.2)] border-solid flex items-center p-[8px] relative rounded-[12px] w-full mt-[4px]">
            <div className="flex gap-[8px] items-start relative">
              <AlertTriangle size={16} className="text-[#d20344] shrink-0 mt-[1px]" />
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#d20344] text-[14px]">
                Paused after you reported a problem.
              </p>
            </div>
          </div>
        )}
      </button>
      <Toggle
        active={rule.active}
        onChange={() => (rule.active ? pauseRule(rule.id) : resumeRule(rule.id))}
        testId={`toggle-rule-${rule.id}`}
      />
    </div>
  );
}

/* ── Guardrail row — pulls you back in above a threshold ─────────────────────── */
function GuardrailRow({ rule }: { rule: AutoRule }) {
  const [, navigate] = useLocation();
  const open = () => navigate(`/rules/${rule.id}`);
  return (
    <div
      data-testid={`row-guardrail-${rule.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent"
    >
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap w-full">
          {rule.name}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
          {rule.summary}
        </p>
      </button>
      <Toggle
        active={rule.active}
        onChange={() => (rule.active ? pauseRule(rule.id) : resumeRule(rule.id))}
        testId={`toggle-rule-${rule.id}`}
      />
    </div>
  );
}

/* ── Always-on row — locked, no toggle ──────────────────────────────────────── */
function AlwaysOnRow({ rule }: { rule: AutoRule }) {
  const [, navigate] = useLocation();
  const open = () => navigate(`/rules/${rule.id}`);
  return (
    <div
      data-testid={`row-alwayson-${rule.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent"
    >
      <div className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] bg-[#1d2132]">
        <Lock size={14} className="text-[#6c779d]" />
      </div>
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap w-full">
          {rule.name}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
          {rule.summary}
        </p>
      </button>
      <span className="shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-[#6c779d] whitespace-nowrap">
        Always on
      </span>
    </div>
  );
}

/* ── Evidence-backed suggestion card ────────────────────────────────────────── */
const CONFIDENCE: Record<RuleSuggestion["confidence"], { label: string; color: string }> = {
  high: { label: "High confidence", color: ACTIVE },
  medium: { label: "Medium confidence", color: "#ff9500" },
  low: { label: "Low confidence", color: "#6c779d" },
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
      className="flex flex-col gap-[12px] rounded-[12px] border border-[#1d2132] bg-[#0a0c10] p-[14px]"
      data-testid={`card-suggestion-${suggestion.id}`}
    >
      <div className="flex items-start gap-[10px]">
        <div className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] bg-[#240757]">
          <Sparkles size={15} className="text-[#7631ee]" />
        </div>
        <div className="flex flex-1 min-w-px flex-col gap-[2px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
            {suggestion.title}
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px]">
            {suggestion.description}
          </p>
        </div>
        <span
          className="shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] px-[8px] py-[3px] rounded-[100px] whitespace-nowrap"
          style={{ backgroundColor: `${conf.color}1f`, color: conf.color }}
          data-testid={`text-confidence-${suggestion.id}`}
        >
          {conf.label}
        </span>
      </div>

      {/* Mono fact block — the evidence behind the suggestion. */}
      <div className="rounded-[10px] bg-[#06070a] border border-[#1d2132] p-[12px] flex flex-col gap-[6px]">
        {suggestion.evidence.map((fact, i) => (
          <div key={i} className="flex items-baseline justify-between gap-[12px]">
            <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] leading-[16px] text-[#6c779d] whitespace-nowrap">
              {fact.label}
            </span>
            <span
              className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-right"
              style={{ color: fact.severity === "clean" ? ACTIVE : "#a8b9f4" }}
            >
              {fact.value}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-[8px]">
        <button
          type="button"
          onClick={onAccept}
          data-testid={`button-accept-suggestion-${suggestion.id}`}
          className="flex items-center gap-[6px] px-[14px] py-[8px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
        >
          <Check size={14} /> Review &amp; accept
        </button>
        <button
          type="button"
          onClick={onTweak}
          data-testid={`button-tweak-suggestion-${suggestion.id}`}
          className="flex items-center gap-[6px] px-[14px] py-[8px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
        >
          <Pencil size={13} /> Tweak first
        </button>
        <button
          type="button"
          onClick={onDismiss}
          data-testid={`button-dismiss-suggestion-${suggestion.id}`}
          className="ml-auto px-[12px] py-[8px] rounded-[100px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
        >
          Dismiss
        </button>
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
}: {
  value?: string;
  placeholder: string;
  open: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center gap-[4px] rounded-[8px] border px-[10px] py-[3px] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] ${
        value
          ? "border-[rgba(118,49,238,0.5)] bg-[#240757] text-[#a8b9f4]"
          : "border-dashed border-[#414965] bg-transparent text-[#6c779d]"
      }`}
    >
      {value ?? placeholder}
      <ChevronRight size={13} className={`transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

type BuilderState = {
  category: string;
  vendor: string;
  amount: string;
  action: "pay" | "ask";
};

const EMPTY_BUILDER: BuilderState = { category: "", vendor: "", amount: "", action: "pay" };

type RuleTab = "Automations" | "Guardrails" | "Always On" | "Suggested";
const RULE_TABS: RuleTab[] = ["Automations", "Guardrails", "Always On", "Suggested"];

export function RulesPage() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const rules = useRules();
  const suggestions = useRuleSuggestions();

  const [activeTab, setActiveTab] = useState<RuleTab>("Automations");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);
  const [openChip, setOpenChip] = useState<null | "category" | "vendor" | "action">(null);
  const [pendingCreate, setPendingCreate] = useState<AutoRule | null>(null);
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);

  const automations = rules.filter((r) => (r.kind ?? "automation") === "automation");
  const guardrails = rules.filter((r) => r.kind === "guardrail");
  const alwaysOn = rules.filter((r) => r.kind === "always_on");

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
      action: draft.kind === "guardrail" ? "ask" : "pay",
    });
    setOpenChip(null);
    setBuilderOpen(true);
  };

  /* Load this account's persisted user-created rules into the store on mount. */
  useEffect(() => {
    void hydrateUserRules();
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
  const isAuto = builder.action === "pay";
  const builderValid =
    builder.category !== "" &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (!isAuto || builder.vendor !== "");

  const builderPolicy = isAuto
    ? CATEGORY_TO_POLICY[builder.category] ?? "policy/ap.tolerance.v3"
    : "policy/guardrail.approval.v1";

  const buildDraft = (): AutoRule => {
    const amt = Math.round(amountNum);
    if (isAuto) {
      const name = `Auto-clear ${builder.category} from ${builder.vendor}`;
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
    const name = `Ask before paying over ${format(amt)}`;
    return finalizeDraft({
      kind: "guardrail",
      name,
      summary: `Any payment above ${format(amt)} waits for your approval`,
      policyId: builderPolicy,
      agent: "invoice",
      category: "approval threshold",
      threshold: amt,
      thresholdEditable: true,
      scopeSummary: `any payment over ${format(amt)}`,
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
    // Leave the suggestion in the list — accept is not final until confirmed.
    setPendingSuggestionId(null);
    setPendingCreate(null);
  };

  const onAcceptSuggestion = (s: RuleSuggestion) => {
    setPendingSuggestionId(s.id);
    setPendingCreate(finalizeDraft(s.proposedRule));
  };

  // tab counts removed — shown in table header instead

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
            {/* Tab bar — active tab is ORANGE */}
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

          {/* Create-rule confirmation — on Automations and Guardrails tabs */}
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
              <div className="flex gap-[10px] items-stretch w-full pt-[2px]">
                <button
                  type="button"
                  onClick={cancelCreate}
                  data-testid="button-create-cancel"
                  className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4]"
                >
                  Not yet
                </button>
                <button
                  type="button"
                  onClick={onConfirmCreate}
                  data-testid="button-create-confirm"
                  className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-white"
                >
                  Create rule
                </button>
              </div>
            </div>
          )}

          {/* New rule — sentence builder — on Automations and Guardrails tabs */}
          {(activeTab === "Automations" || activeTab === "Guardrails") && (!builderOpen ? (
            <button
              type="button"
              onClick={() => {
                setBuilder((b) => ({ ...b, action: activeTab === "Guardrails" ? "ask" : "pay" }));
                setBuilderOpen(true);
              }}
              data-testid="button-new-rule"
              className="w-full rounded-[16px] border border-dashed border-[#414965] hover:border-[rgba(118,49,238,0.6)] transition-colors p-[16px] flex items-center justify-between"
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
            <div className="w-full rounded-[16px] border border-[rgba(118,49,238,0.35)] bg-[#0a0c10] p-[16px] flex flex-col gap-[14px]" data-testid="panel-builder">
              {/* The sentence */}
              <div className="flex flex-wrap items-center gap-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[15px] leading-[28px]">
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
                    <div className="absolute z-10 mt-[6px] w-[200px] rounded-[10px] border border-[#1d2132] bg-[#11141b] p-[6px] shadow-lg">
                      {BUILDER_CATEGORIES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { setBuilder((b) => ({ ...b, category: c })); setOpenChip(null); }}
                          data-testid={`option-category-${c}`}
                          className="w-full text-left rounded-[8px] px-[10px] py-[7px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isAuto && (
                  <>
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
                        <div className="absolute z-10 mt-[6px] w-[260px] rounded-[10px] border border-[#1d2132] bg-[#11141b] p-[6px] shadow-lg max-h-[280px] overflow-y-auto">
                          <p className="px-[10px] pt-[4px] pb-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] uppercase tracking-[0.06em] text-[#6c779d]">
                            Trusted vendors
                          </p>
                          {TRUSTED_VENDORS.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => { setBuilder((b) => ({ ...b, vendor: v })); setOpenChip(null); }}
                              data-testid={`option-vendor-${slugify(v)}`}
                              className="w-full text-left rounded-[8px] px-[10px] py-[7px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]"
                            >
                              {v}
                            </button>
                          ))}
                          <p className="px-[10px] pt-[8px] pb-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] uppercase tracking-[0.06em] text-[#414965]">
                            Not trusted yet
                          </p>
                          {UNTRUSTED_VENDORS.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => { setOpenChip(null); navigate("/vendors"); }}
                              data-testid={`option-untrusted-${slugify(v)}`}
                              className="w-full flex items-center justify-between gap-[8px] rounded-[8px] px-[10px] py-[7px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#414965]"
                            >
                              {v}
                              <span className="flex items-center gap-[3px] text-[#6c779d] text-[12px]">
                                trust first <ArrowRight size={12} />
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                <span>is {isAuto ? "under" : "over"}</span>
                <input
                  value={builder.amount}
                  inputMode="numeric"
                  placeholder="$amount"
                  onChange={(e) => setBuilder((b) => ({ ...b, amount: e.target.value }))}
                  data-testid="input-builder-amount"
                  className="w-[110px] rounded-[8px] border border-[#1d2132] bg-[#06070a] px-[10px] py-[3px] [font-family:'JetBrains_Mono',monospace] text-[14px] text-[#a8b9f4] placeholder:text-[#414965] focus:outline-none focus-visible:border-[rgba(118,49,238,0.5)]"
                />
                <span>,</span>
                <div className="relative">
                  <Chip
                    value={isAuto ? "pay it automatically" : "ask me first"}
                    placeholder="do this"
                    open={openChip === "action"}
                    onClick={() => setOpenChip(openChip === "action" ? null : "action")}
                    testId="chip-action"
                  />
                  {openChip === "action" && (
                    <div className="absolute z-10 mt-[6px] w-[220px] rounded-[10px] border border-[#1d2132] bg-[#11141b] p-[6px] shadow-lg">
                      <button
                        type="button"
                        onClick={() => { setBuilder((b) => ({ ...b, action: "pay" })); setOpenChip(null); }}
                        data-testid="option-action-pay"
                        className="w-full text-left rounded-[8px] px-[10px] py-[7px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]"
                      >
                        pay it automatically
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBuilder((b) => ({ ...b, action: "ask" })); setOpenChip(null); }}
                        data-testid="option-action-ask"
                        className="w-full text-left rounded-[8px] px-[10px] py-[7px] hover:bg-[#1d2132] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#a8b9f4]"
                      >
                        ask me first
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Compile line — what the sentence becomes */}
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#7631ee]" data-testid="text-compile-line">
                compiles to {builderPolicy}
              </p>

              <div className="flex gap-[10px] items-stretch w-full">
                <button
                  type="button"
                  onClick={resetBuilder}
                  data-testid="button-builder-cancel"
                  className="px-[16px] py-[10px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!builderValid}
                  onClick={() => setPendingCreate(buildDraft())}
                  data-testid="button-builder-create"
                  className="flex-1 px-[16px] py-[10px] rounded-[100px] bg-[#7631ee] hover:bg-[#8a4bf5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-white"
                >
                  Create rule
                </button>
              </div>
            </div>
          ))}

          {/* Tab content — each tab shows its own section */}

          {activeTab === "Automations" && (
            <Section title="Automations" count={automations.length}>
              {automations.map((r, idx) => (
                <div key={r.id} className="flex flex-col gap-[8px] w-full">
                  <AutomationRow rule={r} />
                  {idx < automations.length - 1 && <Divider />}
                </div>
              ))}
            </Section>
          )}

          {activeTab === "Automations" && automations.length === 0 && (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No automated rules yet. Create one for Brain to automatically handle payments for you.</p>
            </div>
          )}

          {activeTab === "Guardrails" && (
            <Section title="Guardrails" count={guardrails.length}>
              {guardrails.map((r, idx) => (
                <div key={r.id} className="flex flex-col gap-[8px] w-full">
                  <GuardrailRow rule={r} />
                  {idx < guardrails.length - 1 && <Divider />}
                </div>
              ))}
            </Section>
          )}

          {activeTab === "Guardrails" && guardrails.length === 0 && (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No guardrails set. Create one to block risky transactions automatically.</p>
            </div>
          )}

          {activeTab === "Always On" && (
            <Section title="Always On" count={alwaysOn.length}>
              {alwaysOn.map((r, idx) => (
                <div key={r.id} className="flex flex-col gap-[8px] w-full">
                  <AlwaysOnRow rule={r} />
                  {idx < alwaysOn.length - 1 && <Divider />}
                </div>
              ))}
            </Section>
          )}

          {activeTab === "Always On" && alwaysOn.length === 0 && (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No always-on rules active. These run in the background without human approval.</p>
            </div>
          )}

          {activeTab === "Suggested" && suggestions.length > 0 && (
            <div className="flex flex-col gap-[10px] w-full">
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

          {activeTab === "Suggested" && suggestions.length === 0 && (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No new suggestions from Brain right now. Check back as your patterns grow.</p>
            </div>
          )}

          {/* Plain-English helper banner */}
          <div
            className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
            style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
          >
            <Flag size={15} className="text-[#7631ee] shrink-0 mt-[2px]" />
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px]">
              Rules are written in plain English, not code. Brain turns each one into an enforceable
              policy for every agent you use, then keeps learning and suggesting new ones — backed by
              the evidence behind them.
            </p>
          </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
