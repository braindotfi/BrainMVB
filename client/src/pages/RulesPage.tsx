import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight,
  Lock,
  Pause,
  Play,
  Plus,
  Sparkles,
  Check,
  X,
  Pencil,
  ArrowRight,
  Flag,
} from "lucide-react";
import {
  useRules,
  pauseRule,
  resumeRule,
  setThreshold as setRuleThreshold,
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

const ALERT = "#d20344";
const ACTIVE = "#42bf23";
const PURPLE = "#7631ee";

type Fmt = (a: string | number) => string;

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

/* ── Inline-editable bordered mono threshold pill ───────────────────────────── */
function ThresholdPill({
  value,
  onSave,
  format,
  editable = true,
  testId,
}: {
  value: number;
  onSave: (n: number) => void;
  format: Fmt;
  editable?: boolean;
  testId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) onSave(Math.round(n));
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        data-testid={testId}
        className="inline-flex items-center gap-[6px] rounded-[8px] border border-[#1d2132] bg-[#06070a] px-[10px] py-[4px] transition-colors enabled:hover:border-[rgba(118,49,238,0.5)] disabled:cursor-default"
      >
        <span className="[font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4]">
          {format(value)}
        </span>
        {editable && <Pencil size={11} className="text-[#6c779d]" />}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-[6px]">
      <input
        value={draft}
        autoFocus
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        data-testid={testId ? `${testId}-input` : undefined}
        className="w-[92px] rounded-[8px] border border-[rgba(118,49,238,0.5)] bg-[#06070a] px-[10px] py-[4px] [font-family:'JetBrains_Mono',monospace] text-[13px] text-[#a8b9f4] focus:outline-none"
      />
      <button
        type="button"
        onClick={commit}
        data-testid={testId ? `${testId}-save` : undefined}
        className="flex size-[26px] items-center justify-center rounded-[8px] bg-[#7631ee] hover:bg-[#8a4bf5] transition-colors"
      >
        <Check size={14} className="text-white" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="flex size-[26px] items-center justify-center rounded-[8px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors"
      >
        <X size={14} className="text-[#a8b9f4]" />
      </button>
    </span>
  );
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

/* ── Section wrapper — collapses when empty ─────────────────────────────────── */
function Section({
  eyebrow,
  sub,
  count,
  children,
}: {
  eyebrow: string;
  sub: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-[10px] w-full">
      <div className="flex flex-col gap-[2px] px-[4px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold uppercase tracking-[0.08em] text-[#6c779d] text-[12px] leading-[16px]">
          {eyebrow}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[13px] leading-[18px]">
          {sub}
        </p>
      </div>
      <div className="bg-[#0a0c10] flex flex-col rounded-[16px] p-[8px] w-full gap-[2px]">
        {children}
      </div>
    </div>
  );
}

/* ── Automation row — acts for you ──────────────────────────────────────────── */
function AutomationRow({ rule, format }: { rule: AutoRule; format: Fmt }) {
  const [, navigate] = useLocation();
  const openReports = (rule.problemReports ?? []).filter((p) => !p.resolved);
  const pausedFromReport = !rule.active && openReports.length > 0;
  const open = () => navigate(`/rules/${rule.id}`);
  const hasInlineThreshold = rule.thresholdEditable && typeof rule.threshold === "number";

  return (
    <div
      className="relative flex items-center gap-[12px] rounded-[8px] p-[10px] pl-[12px]"
      style={pausedFromReport ? { boxShadow: `inset 3px 0 0 0 ${ALERT}` } : undefined}
      data-testid={`row-automation-${rule.id}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        className="flex flex-1 min-w-px cursor-pointer flex-col items-start gap-[3px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
          {rule.name}
        </span>
        <span className="flex flex-wrap items-center gap-[6px] [font-family:'JetBrains_Mono',monospace] text-[12px] leading-[18px] text-[#6c779d]">
          {rule.scopeSummary ?? rule.summary}
          {hasInlineThreshold && (
            <span onClick={(e) => e.stopPropagation()} className="inline-flex">
              <ThresholdPill
                value={rule.threshold!}
                onSave={(n) => setRuleThreshold(rule.id, n)}
                format={format}
                testId={`pill-threshold-${rule.id}`}
              />
            </span>
          )}
        </span>
        {pausedFromReport && (
          <span
            className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px]"
            style={{ color: ALERT }}
            data-testid={`text-paused-report-${rule.id}`}
          >
            Paused after you reported a problem · tap to review
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={open}
        aria-label="Open rule"
        className="flex size-[28px] items-center justify-center rounded-[8px] hover:bg-[#1d2132] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
        data-testid={`chevron-rule-${rule.id}`}
      >
        <ChevronRight size={16} className="text-[#6c779d]" />
      </button>

      {/* Paused-from-report rows route to detail for the resume confirm; others
          get a quick pause/resume toggle. */}
      {!pausedFromReport && (
        <Toggle
          active={rule.active}
          onChange={() => (rule.active ? pauseRule(rule.id) : resumeRule(rule.id))}
          testId={`toggle-rule-${rule.id}`}
        />
      )}
    </div>
  );
}

/* ── Guardrail row — pulls you back in above a threshold ─────────────────────── */
function GuardrailRow({ rule, format }: { rule: AutoRule; format: Fmt }) {
  const [, navigate] = useLocation();
  return (
    <div
      className="flex items-center gap-[12px] rounded-[8px] p-[10px] pl-[12px]"
      data-testid={`row-guardrail-${rule.id}`}
    >
      <button
        type="button"
        onClick={() => navigate(`/rules/${rule.id}`)}
        className="flex flex-1 min-w-px flex-col items-start gap-[4px] text-left focus:outline-none"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
          {rule.name}
        </span>
        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px]">
          {rule.summary}
        </span>
      </button>

      {typeof rule.threshold === "number" && (
        <ThresholdPill
          value={rule.threshold}
          onSave={(n) => setRuleThreshold(rule.id, n)}
          format={format}
          editable={rule.thresholdEditable ?? true}
          testId={`pill-threshold-${rule.id}`}
        />
      )}
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
  return (
    <div
      className="flex items-center gap-[12px] rounded-[8px] p-[10px] pl-[12px]"
      data-testid={`row-alwayson-${rule.id}`}
    >
      <div className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] bg-[#1d2132]">
        <Lock size={14} className="text-[#6c779d]" />
      </div>
      <div className="flex flex-1 min-w-px flex-col gap-[3px]">
        <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
          {rule.name}
        </span>
        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px]">
          {rule.summary}
        </span>
      </div>
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

type RuleTab = "Your Rules" | "Automations" | "Guardrails" | "Always On" | "Suggested";
const RULE_TABS: RuleTab[] = ["Your Rules", "Automations", "Guardrails", "Always On", "Suggested"];

export function RulesPage() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const rules = useRules();
  const suggestions = useRuleSuggestions();

  const [activeTab, setActiveTab] = useState<RuleTab>("Your Rules");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);
  const [openChip, setOpenChip] = useState<null | "category" | "vendor" | "action">(null);
  const [pendingCreate, setPendingCreate] = useState<AutoRule | null>(null);
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);

  const automations = rules.filter((r) => (r.kind ?? "automation") === "automation");
  const guardrails = rules.filter((r) => r.kind === "guardrail");
  const alwaysOn = rules.filter((r) => r.kind === "always_on");

  // "Your Rules" shows ONLY rules the user authored in the creator (persisted
  // per tenant). The category tabs below still show the full system + user set.
  const userRules = rules.filter((r) => r.userCreated);
  const userAutomations = userRules.filter((r) => (r.kind ?? "automation") === "automation");
  const userGuardrails = userRules.filter((r) => r.kind === "guardrail");

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

  const ruleTabCount = (tab: RuleTab) => {
    if (tab === "Your Rules") return userRules.length;
    if (tab === "Automations") return automations.length;
    if (tab === "Guardrails") return guardrails.length;
    if (tab === "Always On") return alwaysOn.length;
    return suggestions.length;
  };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[32px] items-start pb-[24px] pt-[40px] px-[16px] w-full">

          {/* Header + tab bar */}
          <div className="flex flex-col gap-[16px] items-start w-full">
            <div className="flex flex-col items-start gap-[4px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px]">Your Rules</p>
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">Your boundaries that Brain follows.</p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">
                Manage the rules that guide Brain's reviews, recommendations, and actions.
              </p>
            </div>

            {/* Tab bar — active tab is ORANGE */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap">
              {RULE_TABS.map((tab) => {
                const isActive = activeTab === tab;
                const count = ruleTabCount(tab);
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
                    {count > 0 && (
                      <span
                        className="[font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] px-[5px] py-[1px] rounded-[4px] min-w-[18px] text-center"
                        style={{
                          background: isActive ? "rgba(255,149,0,0.18)" : "#1d2132",
                          color: isActive ? "#ff9500" : "#6c779d",
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Create-rule confirmation — only on Your Rules tab */}
          {activeTab === "Your Rules" && pendingCreate && (
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

          {/* New rule — sentence builder — only on Your Rules tab */}
          {activeTab === "Your Rules" && (!builderOpen ? (
            <button
              type="button"
              onClick={() => setBuilderOpen(true)}
              data-testid="button-new-rule"
              className="w-full rounded-[16px] border border-dashed border-[#414965] hover:border-[rgba(118,49,238,0.6)] transition-colors p-[16px] flex items-center gap-[10px]"
            >
              <div className="flex size-[28px] items-center justify-center rounded-[8px] bg-[#240757]">
                <Plus size={16} className="text-[#7631ee]" />
              </div>
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px]">
                New rule
              </span>
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
                Write one in plain English
              </span>
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

          {/* YOUR RULES: only the rules this account authored in the creator */}
          {activeTab === "Your Rules" && (
            <div className="flex flex-col gap-[28px] w-full">
              {userAutomations.length > 0 && (
                <Section count={userAutomations.length}>
                  {userAutomations.map((r) => (
                    <AutomationRow key={r.id} rule={r} format={format} />
                  ))}
                </Section>
              )}
              {userGuardrails.length > 0 && (
                <Section
                  eyebrow="Guardrails · pull you back in"
                  sub="Brain stops and asks you above these limits."
                  count={userGuardrails.length}
                >
                  {userGuardrails.map((r) => (
                    <GuardrailRow key={r.id} rule={r} format={format} />
                  ))}
                </Section>
              )}
              {userRules.length === 0 && (
                <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                    You haven't created any rules yet. Use "New rule" above to write one in plain English — it'll be saved to your account.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "Automations" && (
            <Section
              eyebrow="Automations · act for you"
              sub="These run on their own. Tap one to see or tighten its scope."
              count={automations.length}
            >
              {automations.map((r) => (
                <AutomationRow key={r.id} rule={r} format={format} />
              ))}
            </Section>
          )}

          {activeTab === "Automations" && automations.length === 0 && (
            <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                No automations yet. Create one above.
              </p>
            </div>
          )}

          {activeTab === "Guardrails" && (
            <Section
              eyebrow="Guardrails · pull you back in"
              sub="Brain stops and asks you above these limits."
              count={guardrails.length}
            >
              {guardrails.map((r) => (
                <GuardrailRow key={r.id} rule={r} format={format} />
              ))}
            </Section>
          )}

          {activeTab === "Guardrails" && guardrails.length === 0 && (
            <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                No guardrails set. Add one to protect yourself from large payments.
              </p>
            </div>
          )}

          {activeTab === "Always On" && (
            <Section
              eyebrow="Always on · can't be turned off"
              sub="Built-in protections that run no matter what."
              count={alwaysOn.length}
            >
              {alwaysOn.map((r) => (
                <AlwaysOnRow key={r.id} rule={r} />
              ))}
            </Section>
          )}

          {activeTab === "Always On" && alwaysOn.length === 0 && (
            <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                No always-on rules configured.
              </p>
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
            <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                No suggestions right now. Brain will surface new ones as it learns your habits.
              </p>
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
      </ScrollArea>
    </div>
  );
}
