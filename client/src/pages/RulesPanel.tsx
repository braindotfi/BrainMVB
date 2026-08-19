import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  ChevronDown,
  Plus,
  Sparkles,
  Check,
  Pencil,
  Flag,
  Lock,
} from "lucide-react";
import { FilterChipRow } from "@/components/FilterChipRow";
import { Button } from "@/components/ui/button";
import closeIcon from "@assets/Close_1783293571882.png";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import shieldKeyIcon from "@assets/Normal_1783346551915.png";
import {
  useRules,
  createRule,
  consumeRuleDraft,
  hydrateUserRules,
  useRulesHydration,
} from "@/lib/rulesStore";
import {
  useRuleSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  hydrateSuggestions,
} from "@/lib/rule-suggestions";
import { useBrainPolicy } from "@/lib/brainPolicy";
import { useBrainVendors } from "@/lib/brainVendors";
import { useCurrency } from "@/lib/useCurrency";
import type { AutoRule, RuleSuggestion } from "@/lib/proposalTypes";
import { AlertCallout, PolicyCallout, UnavailableDataBox } from "@/components/Callout";
import { AppAlertLink, useAppAlert } from "@/components/AppAlert";
import { Divider, WidgetHeader, WidgetPanel } from "@/components/LedgerWidgets";

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
    <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[22px] leading-[28px] w-full">
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
    <WidgetPanel>
      <div className="flex flex-col items-start relative w-full">
        {count === 0 && empty ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full">
            {empty}
          </div>
        ) : (
          children
        )}
      </div>
    </WidgetPanel>
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
      className="flex gap-[12px] items-center px-[16px] py-[16px] relative shrink-0 w-full bg-brain-v1highlight-dropdown-bg transition-colors border-b border-solid border-brain-v1stroke-2 last:border-b-0 hover:bg-brain-v1baby-blue-5 cursor-pointer"
    >
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] whitespace-nowrap w-full">
          {titleCase(rule.name)}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px]">
          {titleCase(rule.scopeSummary ?? rule.summary)}
        </p>
        {pausedFromReport && (
          <AlertCallout className="mt-[4px]">Paused after you reported a problem.</AlertCallout>
        )}
      </button>
      <div className="content-stretch flex items-center justify-center px-[10px] py-[4px] relative rounded-pill shrink-0 border border-solid bg-brain-v1dark-green border-[rgba(66,191,35,0.2)]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap text-brain-v1green">
          Anchored
        </p>
      </div>
    </div>
  );
}

/* ── Guardrail row - fixed safety boundary, not user-configurable ─────────────── */
function GuardrailRow({ rule }: { rule: AutoRule }) {
  const [, navigate] = useLocation();
  const openReports = (rule.problemReports ?? []).filter((p) => !p.resolved);
  const pausedFromReport = !rule.active && openReports.length > 0;
  const open = () => navigate(`/rules/${rule.id}`);
  return (
    <div
      data-testid={`row-guardrail-${rule.id}`}
      className="flex gap-[12px] items-center px-[16px] py-[16px] relative shrink-0 w-full bg-brain-v1highlight-dropdown-bg transition-colors border-b border-solid border-brain-v1stroke-2 last:border-b-0 hover:bg-brain-v1baby-blue-5 cursor-pointer"
    >
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] whitespace-nowrap w-full">
          {titleCase(rule.name)}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px]">
          {titleCase(rule.summary)}
        </p>
        {pausedFromReport && (
          <AlertCallout className="mt-[4px]">Paused after you reported a problem.</AlertCallout>
        )}
      </button>
      {/* Guardrail badge: neutral lock treatment distinguishes a fixed safety
          boundary without reusing amber's needs-attention meaning. */}
      <div className="content-stretch flex items-center gap-[5px] justify-center px-[10px] py-[4px] relative rounded-pill shrink-0 border border-solid bg-brain-v1baby-blue-15 border-[rgba(108,119,157,0.2)]">
        <Lock size={11} className="text-brain-v1baby-blue-60 shrink-0" aria-hidden />
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap text-brain-v1baby-blue-60">
          Guardrail
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
      className="flex gap-[12px] items-center px-[16px] py-[16px] relative shrink-0 w-full bg-brain-v1highlight-dropdown-bg transition-colors border-b border-solid border-brain-v1stroke-2 last:border-b-0 hover:bg-brain-v1baby-blue-5 cursor-pointer"
    >
      <img src={shieldKeyIcon} alt="shield" className="shrink-0 w-[20px] h-[20px]" />
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple rounded-[6px]"
        data-testid={`button-open-rule-${rule.id}`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px] whitespace-nowrap w-full">
          {titleCase(rule.name)}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px]">
          {titleCase(rule.summary)}
        </p>
      </button>
      <div className="content-stretch flex items-center justify-center px-[10px] py-[4px] relative rounded-pill shrink-0 border border-solid bg-brain-v1dark-green border-[rgba(66,191,35,0.2)]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap text-brain-v1green">
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
function PolicySection({
  isLoading,
  isError,
  rules,
}: {
  isLoading: boolean;
  isError: boolean;
  rules: ReturnType<typeof useBrainPolicy>["rules"];
}) {
  return (
    <WidgetPanel>
      <div className="flex flex-col items-start relative shrink-0 w-full">
        {isLoading && (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-brain-v1highlight-dropdown-bg">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-brain-v1baby-blue-60 text-[16px]">
              Loading your active policy from Brain…
            </p>
          </div>
        )}
        {!isLoading && isError && (
          <UnavailableDataBox testId="text-policy-unavailable">
            Couldn't load your active policy from Brain right now.
          </UnavailableDataBox>
        )}
        {!isLoading && !isError && rules.length === 0 && (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-brain-v1highlight-dropdown-bg">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-brain-v1baby-blue-60 text-[16px]">
              No policy rules yet.
            </p>
          </div>
        )}
        {!isLoading && !isError && rules.map((r) => (
          <AlwaysOnRow key={r.id} rule={r} />
        ))}
      </div>
    </WidgetPanel>
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
    <WidgetPanel testId={`card-suggestion-${suggestion.id}`}>
      {/* Header: title + confidence pill */}
      <div className="bg-brain-v1highlight-dropdown-bg border-brain-v1stroke-2 border-b border-solid flex items-center justify-between px-[16px] py-[12px] relative shrink-0 w-full">
        <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
          <p className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] min-w-px text-brain-v1baby-blue-100 text-[20px]" data-testid={`text-suggestion-title-${suggestion.id}`}>
            {titleCase(suggestion.title)}
          </p>
          <span
            className="shrink-0 [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[16px] px-[10px] py-[4px] rounded-pill border border-solid whitespace-nowrap"
            style={{ backgroundColor: conf.bg, borderColor: conf.border, color: conf.text }}
            data-testid={`text-confidence-${suggestion.id}`}
          >
            {conf.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-[16px] items-start p-[16px] relative shrink-0 w-full">
        <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-brain-v1baby-blue-100 text-[16px]">
          {suggestion.description}
        </p>

        {/* Evidence table: key/value rows with fixed label column. */}
        <div className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start relative rounded-[8px] shrink-0 w-full">
          {suggestion.evidence.map((fact, i) => (
            <div
              key={i}
              className={`content-stretch flex items-start relative shrink-0 w-full ${i < suggestion.evidence.length - 1 ? "border-b border-brain-v1stroke-2" : ""}`}
            >
              <div className="flex flex-col items-start justify-center px-[12px] py-[8px] relative shrink-0 w-[200px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-60 text-[12px] whitespace-nowrap">
                  {titleCase(fact.label)}
                </p>
              </div>
              <div className="flex flex-1 flex-col items-start justify-center min-w-px px-[12px] py-[8px] relative">
                <p
                  className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px]"
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
            <Button
              variant="primary"
              size="compact"
              onClick={onAccept}
              data-testid={`button-accept-suggestion-${suggestion.id}`}
              className="w-[140px]"
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              size="compact"
              onClick={onTweak}
              data-testid={`button-tweak-suggestion-${suggestion.id}`}
              className="w-[140px]"
            >
              Edit
            </Button>
          </div>
          <Button
            variant="subtle"
            size="compact"
            onClick={onDismiss}
            data-testid={`button-dismiss-suggestion-${suggestion.id}`}
            className="w-[140px]"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </WidgetPanel>
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
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="inline-flex items-center justify-between gap-[8px] p-[8px] rounded-[8px] transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
      style={{
        background: hasValue ? "#240757" : "#222737",
        color: hasValue ? "#ffffff" : "#6c779d",
      }}
    >
      <span className="whitespace-nowrap">{value ?? placeholder}</span>
      <ChevronDown
        size={24}
        className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        style={{ color: hasValue ? "#ffffff" : "#6c779d" }}
      />
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

/**
 * Rules — a Ledger tab, no longer a top-level page.
 *
 * The full builder, the policy sections and the suggestion flow are unchanged.
 * Its four sub-tabs became a filter row so the Ledger's pill bar stays the only
 * control that changes page, and its filter moved from `?tab=` to `?rules=`
 * because `?tab=` now names the Ledger tab. `/rules/:id` is untouched — it is a
 * real route of its own, and wouter sends unregistered targets to NotFound in
 * silence.
 */
export function RulesPanel() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const alert = useAppAlert();
  const search = useSearch();
  const rules = useRules();
  const suggestions = useRuleSuggestions();
  const { vendors, isError: vendorsFailed } = useBrainVendors();
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

  /* Derived from the URL every render rather than copied into state at mount.
     A mirrored copy only agrees with the URL until something else changes it —
     a link from another panel, the back button, the `?create=1` handoff below —
     and then the pills and the address bar disagree with no way to tell which
     one is right. The URL is the single source of truth; `setActiveTab` only
     navigates. */
  const activeTab: RuleTab = (() => {
    const t = new URLSearchParams(search).get("rules");
    return t ? (TAB_PARAM_MAP[t] ?? "Default") : "Default";
  })();
  const setActiveTab = (tab: RuleTab) => {
    const sp = new URLSearchParams(search);
    sp.set("tab", "rules");
    sp.set("rules", tab.toLowerCase().replace(/\s+/g, "-"));
    navigate(`/ledger?${sp.toString()}`, { replace: true });
  };
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);
  const [openChip, setOpenChip] = useState<null | "category" | "vendor" | "action">(null);
  const [pendingCreate, setPendingCreate] = useState<AutoRule | null>(null);
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);

  // Lift policy rules to this level so the Default badge tracks the same count
  // PolicySection renders (brain-core policy rules), not the user-created rules.
  const {
    rules: policyRules,
    isLoading: policyLoading,
    isError: policyError,
    version: policyVersion,
    quorum: policyQuorum,
    policyLabel,
  } = useBrainPolicy();
  const rulesHydration = useRulesHydration();
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

  /* "Always handle this" handoff: consume the draft + open the builder pre-filled.
     Keyed on `search` rather than mount, so arriving at `?create=1` from a link
     while this panel is already mounted still opens the builder. `consumeRuleDraft`
     is destructive, so a ref makes it strictly one-shot. */
  const createHandled = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("create") !== "1" || createHandled.current) return;
    createHandled.current = true;

    const draft = consumeRuleDraft();
    if (draft) openBuilderPrefilled(draft);
    else setBuilderOpen(true);

    /* Land on a filter that actually draws the builder. It only renders under
       Automations and Guardrails, but `?create=1` carries no filter of its own,
       so the handoff used to sit on Default — builder state set, builder never
       mounted, and the "Always handle this" button on Overview and Decisions
       appeared to do nothing at all. */
    const requested = params.get("rules");
    const target: RuleTab =
      requested && TAB_PARAM_MAP[requested] === "Guardrails" ? "Guardrails" : "Automations";

    const next = new URLSearchParams(search);
    next.delete("create");
    next.set("tab", "rules");
    next.set("rules", target.toLowerCase());
    navigate(`/ledger?${next.toString()}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
      const createdRule = pendingCreate;
      createRule(createdRule);
      alert.success(
        "Success",
        <>
          You have successfully added rule: {createdRule.name}
          <br />
          <br />
          View the rule{" "}
          <AppAlertLink href={`/rules/${encodeURIComponent(createdRule.id)}`}>
            here
          </AppAlertLink>
          .
        </>,
      );
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

  // Default count tracks policyRules (brain-core policy) — what the tab renders —
  // not user-created rules, which are shown on the Automations/Guardrails tabs.
  const activeCount = activeTab === "Default"
    ? policyRules.length
    : activeTab === "Automations"
      ? automations.length
      : activeTab === "Guardrails"
        ? guardrails.length
        : suggestions.length;

  return (
    <div className="flex flex-col gap-[26px] items-start w-full pb-[8px]">

        <div className="flex flex-col gap-[16px] items-start w-full">
          <FilterChipRow
            chips={RULE_TABS.map((tab) => ({
              value: tab,
              label: tab,
            }))}
            value={activeTab}
            onChange={(v) => setActiveTab(v as RuleTab)}
            label="Filter rules"
            testIdPrefix="tab-rule"
          />

          {/* Create-rule confirmation: on Automations and Guardrails tabs */}
          {(activeTab === "Automations" || activeTab === "Guardrails") && pendingCreate && (
            <div
              className="w-full rounded-panel border p-[16px] flex flex-col gap-[12px]"
              style={{ background: "#240757", borderColor: "rgba(118,49,238,0.35)" }}
              data-testid="panel-create-confirm"
            >
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[16px] leading-[20px]">
                Create this rule?
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[14px] leading-[20px]">
                {pendingCreate.name}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[13px] leading-[18px]">
                {pendingCreate.summary}
              </p>
              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px] leading-[16px] text-brain-v1purple" data-testid="text-compile-confirm">
                compiles to {pendingCreate.policyId}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-brain-v1baby-blue-60">
                Saved to your rules to guide Brain&apos;s reviews. Your enforced policy stays the signed Active Brain policy above until this is applied to it.
              </p>
              <div className="flex gap-[10px] items-stretch w-full pt-[2px]">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={cancelCreate}
                  data-testid="button-create-cancel"
                >
                  Not yet
                </Button>
                <Button
                  variant="cta"
                  className="flex-1"
                  onClick={onConfirmCreate}
                  data-testid="button-create-confirm"
                >
                  Create rule
                </Button>
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
              className="w-full rounded-panel bg-brain-v1baby-blue-5 p-[16px] flex items-center justify-between cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple relative"
            >
              {/* SVG dashed border — stroke-weight 1, wider gap, exact Figma match */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden focusable="false">
                <rect
                  x="0.5" y="0.5"
                  style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }}
                  rx="15.5" ry="15.5"
                  fill="none"
                  stroke="#414965"
                  strokeWidth="1"
                  strokeDasharray="6 8"
                />
              </svg>
              <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-brain-v1baby-blue-60 text-[20px]">
                  Add a new rule in plain English
                </p>
              </div>
              <div className="bg-brain-v1dark-orange flex gap-[4px] items-center justify-center px-[12px] py-[8px] relative rounded-pill shrink-0">
                <Plus size={16} className="text-brain-v1light-orange" />
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1light-orange text-[12px] leading-[16px]">
                  Add Rule
                </span>
              </div>
            </button>
          ) : (
             <div className="w-full rounded-panel bg-brain-v1dark-dark-purple overflow-hidden flex flex-col" data-testid="panel-builder">
               <div className="w-full p-[16px]">
               {/* One continuous wrapping sentence, matches the updated Figma rule builder frame */}
               <div className="flex flex-wrap gap-[16px] items-center w-full [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[24px]">
                {/* "When a [kind]" */}
                <div className="flex gap-[16px] items-center shrink-0">
                  <span className="whitespace-nowrap">When a</span>
                  <div className="relative">
                    <Chip
                      value={builder.category || undefined}
                      placeholder="kind of payment"
                      open={openChip === "category"}
                      onClick={() => setOpenChip(openChip === "category" ? null : "category")}
                      testId="chip-category"
                    />
                    {openChip === "category" && (
                      <div className="absolute z-10 mt-[6px] w-[220px] rounded-row border border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-[8px] shadow-lg">
                        {BUILDER_CATEGORIES.map((c) => {
                          const selected = builder.category === c;
                          const label = titleCase(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => { setBuilder((b) => ({ ...b, category: c })); setOpenChip(null); }}
                              data-testid={`option-category-${c}`}
                              className="w-full flex items-center justify-between gap-[8px] text-left rounded-[8px] p-[8px] hover:bg-brain-v1baby-blue-15 focus-visible:bg-brain-v1baby-blue-15 transition-colors [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] text-brain-v1baby-blue-100"
                            >
                              {label}
                              {selected && (
                                <div className="flex items-center justify-center rounded-full bg-brain-v1green shrink-0" style={{ width: 16, height: 16 }}>
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

                {/* "from [vendor]" */}
                <div className="flex gap-[16px] items-center shrink-0">
                  <span className="whitespace-nowrap">from</span>
                  <div className="relative">
                    <Chip
                      value={builder.vendor || undefined}
                      placeholder="a trusted vendor"
                      open={openChip === "vendor"}
                      onClick={() => setOpenChip(openChip === "vendor" ? null : "vendor")}
                      testId="chip-vendor"
                    />
                    {openChip === "vendor" && (
                      <div className="absolute z-10 mt-[6px] w-[280px] rounded-row border border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-[8px] shadow-lg max-h-[320px] overflow-y-auto">
                        <p className="px-[10px] pt-[4px] pb-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] uppercase text-brain-v1baby-blue-100">
                          Trusted vendors
                        </p>
                        {/* An unreachable vendor list is not an empty vendor list.
                            Saying "none yet" here would invite someone to build a
                            rule around a vendor set that simply failed to load. */}
                        {trustedVendors.length === 0 && (
                          vendorsFailed ? (
                            <UnavailableDataBox testId="text-vendors-unavailable">
                              Couldn't load vendors. This list may be incomplete.
                            </UnavailableDataBox>
                          ) : (
                            <p
                              className="px-[8px] pb-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60"
                              data-testid="text-vendors-empty"
                            >
                              No trusted vendors yet.
                            </p>
                          )
                        )}
                        {trustedVendors.map((v) => {
                          const selected = builder.vendor === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => { setBuilder((b) => ({ ...b, vendor: v })); setOpenChip(null); }}
                              data-testid={`option-vendor-${slugify(v)}`}
                              className="w-full flex items-center justify-between gap-[8px] text-left rounded-[8px] p-[8px] hover:bg-brain-v1baby-blue-15 focus-visible:bg-brain-v1baby-blue-15 transition-colors [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] text-brain-v1baby-blue-100"
                            >
                              {v}
                              {selected && (
                                <div className="flex items-center justify-center rounded-full bg-brain-v1green shrink-0" style={{ width: 16, height: 16 }}>
                                  <Check size={10} className="text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                        <div className="mx-[8px] my-[6px] h-px bg-brain-v1stroke-2" />
                        <p className="px-[8px] pt-[2px] pb-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] uppercase text-brain-v1baby-blue-60">
                          Not Trusted Yet
                        </p>
                        {untrustedVendors.length === 0 ? (
                          <p className="px-[8px] pb-[4px] [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] text-brain-v1baby-blue-60">
                            Brain doesn't track an untrusted-vendor list yet.
                          </p>
                        ) : (
                          untrustedVendors.map((v) => (
                            <div
                              key={v}
                              className="w-full flex items-center justify-between gap-[8px] rounded-[8px] p-[8px]"
                            >
                               <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] text-brain-v1baby-blue-60">
                                {v}
                              </span>
                              <span className="shrink-0 px-[8px] py-[2px] rounded-pill bg-brain-v1dark-pink-red text-brain-v1pink-red [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] uppercase tracking-[0.04em]">
                                Not Trusted
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* "is under [amount]" */}
                <div className="flex gap-[16px] items-center shrink-0">
                  <span className="whitespace-nowrap">is {isAuto ? "under" : "over"}</span>
                     <input
                    value={builder.amount}
                    inputMode="numeric"
                    placeholder="$0"
                    onChange={(e) => setBuilder((b) => ({ ...b, amount: e.target.value }))}
                    data-testid="input-builder-amount"
                     className="w-[48px] h-[40px] rounded-[8px] bg-brain-v1baby-blue-15 px-[8px] py-[10px] [font-family:'Gilroy',sans-serif] text-[16px] leading-[20px] text-white placeholder:text-brain-v1baby-blue-60 focus:outline-none"
                  />
                </div>

                {/* "then [action]" */}
                <div className="flex gap-[16px] items-center shrink-0">
                  <span className="whitespace-nowrap">then</span>
                  <div className="relative">
                    <Chip
                      value={builder.action ? ACTION_LABELS[builder.action] : undefined}
                      placeholder="what happens"
                      open={openChip === "action"}
                      onClick={() => setOpenChip(openChip === "action" ? null : "action")}
                      testId="chip-action"
                    />
                    {openChip === "action" && (
                      <div className="absolute z-10 mt-[6px] w-[260px] rounded-row border border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg p-[8px] shadow-lg">
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
                              className="w-full flex items-center justify-between gap-[8px] text-left rounded-[8px] p-[8px] hover:bg-brain-v1baby-blue-15 focus-visible:bg-brain-v1baby-blue-15 transition-colors [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] text-brain-v1baby-blue-100"
                            >
                              {label}
                              {selected && (
                                <div className="flex items-center justify-center rounded-full bg-brain-v1green shrink-0" style={{ width: 16, height: 16 }}>
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
                </div>
               <div className="backdrop-blur-[10px] border-t border-brain-v1stroke-2 border-solid flex flex-col items-start p-[16px] w-full">
                 <div className="flex gap-[16px] items-center w-full">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={resetBuilder}
                  data-testid="button-builder-cancel"
                >
                  Cancel
                </Button>
                <Button
                  variant="warning"
                  className="flex-1"
                  disabled={!builderValid}
                  onClick={() => setPendingCreate(buildDraft())}
                  data-testid="button-builder-create"
                >
                   Create Rule
                </Button>
                 </div>
              </div>
            </div>
          ))}

        </div>{/* end filter row + builder block */}

      <div className="flex flex-col gap-[10px] w-full">
      <WidgetHeader title="Rules" count={activeCount}>
        {activeTab === "Default" && !policyLoading && !policyError && policyVersion != null && (
          <div className="ml-auto flex items-center gap-[8px] text-[12px] leading-[16px] text-brain-v1baby-blue-60 whitespace-nowrap">
            <span className="[font-family:'Gilroy',sans-serif] font-semibold">{policyLabel}</span>
            <span className="[font-family:'JetBrains_Mono',monospace]">v{policyVersion} · quorum {policyQuorum}</span>
          </div>
        )}
      </WidgetHeader>

      <div className="w-full flex flex-col gap-[16px]">

        {activeTab === "Default" && (
          <>
            <PolicySection
              isLoading={policyLoading}
              isError={policyError}
              rules={policyRules}
            />
            {/* Default-specific purple info banner */}
            {!policyLoading && !policyError && (
              <PolicyCallout>
                These are the active rules in {policyLabel}. Brain enforces them for every matching action. Changes must be made through Brain core’s admin layer.
              </PolicyCallout>
            )}
          </>
        )}

        {activeTab === "Automations" && (
          <>
            <Section
              title="Automations"
              count={automations.length}
              empty={<p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-brain-v1baby-blue-60 text-[16px]">No automations yet. Add one using the builder above.</p>}
            >
              {automations.map((r, idx) => (
                <div key={r.id} className="flex flex-col gap-[8px] w-full">
                  <AutomationRow rule={r} />
                  {idx < automations.length - 1 && <Divider />}
                </div>
              ))}
            </Section>
            {rulesHydration === "ready" && (
            <PolicyCallout>
              Rules are written in plain English, not code. Brain turns each one into an enforceable
              policy for every agent you use, then keeps learning and suggesting new ones, backed by
              the evidence behind them.
            </PolicyCallout>
            )}
          </>
        )}

        {activeTab === "Guardrails" && (
          <>
            <Section
              title="Guardrails"
              count={guardrails.length}
              empty={<p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-brain-v1baby-blue-60 text-[16px]">No guardrails yet. Add one using the builder above.</p>}
            >
              {guardrails.map((r, idx) => (
                <div key={r.id} className="flex flex-col gap-[8px] w-full">
                  <GuardrailRow rule={r} />
                  {idx < guardrails.length - 1 && <Divider />}
                </div>
              ))}
            </Section>
            {rulesHydration === "ready" && (
            <PolicyCallout>
              Rules are written in plain English, not code. Brain turns each one into an enforceable
              policy for every agent you use, then keeps learning and suggesting new ones, backed by
              the evidence behind them.
            </PolicyCallout>
            )}
          </>
        )}

        {activeTab === "Suggested" && (
          <Section
            title="Suggested"
            count={suggestions.length}
            empty={<p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-brain-v1baby-blue-60 text-[16px]">Nothing suggested yet. Brain will show these as it spots patterns.</p>}
          >
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onAccept={() => onAcceptSuggestion(s)}
                onTweak={() => { openBuilderPrefilled(s.proposedRule); dismissSuggestion(s.id); }}
                onDismiss={() => dismissSuggestion(s.id)}
              />
            ))}
          </Section>
        )}

      </div>{/* end table area */}
      </div>{/* end label + table wrapper */}
    </div>
  );
}
