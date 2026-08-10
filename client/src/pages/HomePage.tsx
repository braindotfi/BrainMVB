import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { AddGoalModal, type AddGoalPayload } from "@/components/AddGoalModal";
import { useAuth } from "@/lib/authContext";
import { onboardingKey as onboardingKeyFor, isOnboardingComplete, markOnboardingComplete } from "@/lib/onboarding";
import { useIsDemoData } from "@/lib/demoMode";
import { useCurrency } from "@/lib/useCurrency";
import { type CurrencyCode } from "@/lib/currencyContext";
import { useToast } from "@/hooks/use-toast";
import { useBrainReviewQueue } from "@/lib/brainQueue";
import { pendingAttentionSummary } from "@/lib/pendingAttention";
import { useDecidedProposalIds } from "@/lib/brainAudit";
import { useMissingEvidenceItems } from "@/lib/agentRunInput";
import { useIntents } from "@/lib/intentsStore";
import {
  useBrainProposals,
  isNeedsReview,
} from "@/lib/brainProposals";
import {
  deriveProposalTier,
  thresholdsFromRules,
  TIER_ORDER,
} from "@/lib/proposalTiers";
import { payablesView } from "@/lib/liabilities";
import { usePagedLedgerRead, ledgerFigureCaption } from "@/lib/ledgerRead";
import { arAgingView, AR_STALE_DAYS } from "@/lib/arAging";
import { concentrationView } from "@/lib/cashConcentration";
import { cashProjectionView, PROJECTION_DAYS, type CashEvent } from "@/lib/cashProjection";
import { CashProjectionCard } from "@/components/CashProjectionCard";
import { cashEventRecordIndex, type CashEventRecord } from "@/lib/cashEventRecords";
import { BillDetailPopup, type BrainInvoiceDTO } from "@/components/BillDetailPopup";
import { PayableDetailPopup } from "@/components/PayableDetailPopup";
import { ReceivableDetailPopup } from "@/components/ReceivableDetailPopup";
import type { CounterpartiesLiteResponse } from "@/components/LedgerWidgets";
import { accountsTotalView, type BrainAccountDTO } from "@/lib/brainAccounts";
import type { RawInvoice } from "@/lib/receivables";
import type { RawObligation } from "@/lib/brainObligations";
import {
  useRules,
  hydrateUserRules,
} from "@/lib/rulesStore";

/* Your Goals (Figma 3882:43037), progress bars per goal */
type GoalRow = {
  id: string;
  name: string;
  vault: string;
  saved: number;
  target: number;
  /** Tailwind/CSS color for the progress bar fill. */
  color: string;
};

/* DEMO-ONLY starter goals matching the original Figma mock-up — shown only
   when the signed-in account is a demo account (demoMode.ts). Real accounts
   start with zero goals and a genuine empty state. New goals created via the
   modal are appended to local state; nothing is persisted yet. */
const DEMO_GOALS: GoalRow[] = [
  { id: "tax",       name: "Q2 tax reserve",       vault: "USDC Vault", saved: 60_000, target: 100_000, color: "#42bf23" },
  { id: "runway",    name: "Operating runway",     vault: "USDC",       saved:  4_000, target:  10_000, color: "#ff9500" },
  { id: "marketing", name: "Q4 marketing budget",  vault: "USDC Vault", saved:    400, target:   2_000, color: "#7631EE" },
  { id: "equipment", name: "New equipment fund",   vault: "sUSDS",      saved:  4_295, target:   8_000, color: "#d20344" },
];

/* Palette for newly created goals so each new entry gets a fresh accent
   colour rather than always defaulting to the same one. */
const GOAL_COLORS = ["#42bf23", "#ff9500", "#7631EE", "#d20344", "#22d3ee"];

/* Map the modal's category enum onto a sensible vault label for the
   progress row. */
const CATEGORY_VAULT: Record<string, string> = {
  "Pay Off Debt":   "USDC",
  "Build Reserve":  "USDC Vault",
  "Hit Milestone":  "USDC Vault",
  "Cut Spend":      "USDC Vault",
  "Capital Deploy": "sUSDS",
  "Other":          "USDC Vault",
};

/* Best-effort numeric parse: accepts "$11,000", "11k", "5m", plain numbers etc.
   Returns 0 when the user leaves the field blank or types an unparseable string. */
const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const cleaned = raw.replace(/[\s,$]/g, "").toLowerCase();
  const match = cleaned.match(/^(-?\d*\.?\d+)\s*([kmb])?$/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  const mult = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return Math.max(0, Math.round(n * mult));
};

const useFmt = () => {
  const { format } = useCurrency();
  return (n: number) => format(n);
};

const GoalProgress = ({ goal }: { goal: GoalRow }) => {
  const fmt = useFmt();
  const pct = Math.max(0, Math.min(100, Math.round((goal.saved / goal.target) * 100)));
  return (
    <div className="flex flex-col gap-[8px] w-full" data-testid={`goal-${goal.id}`}>
      <div className="flex items-center justify-between gap-[12px] w-full">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[14px] truncate">
          <span>{goal.name}</span>
          <span className="text-brain-v1baby-blue-60 font-medium"> · {goal.vault}</span>
        </p>
        <div className="flex items-center gap-[12px] shrink-0 [font-family:'JetBrains_Mono',monospace] tabular-nums">
          <p className="text-brain-v1baby-blue-100 text-[14px] leading-[20px]">
            <span className="font-medium">{fmt(goal.saved)}</span>
            <span className="text-brain-v1baby-blue-60"> of </span>
            <span className="font-medium">{fmt(goal.target)}</span>
          </p>
          <p className="text-brain-v1baby-blue-60 text-[14px] leading-[20px] w-[36px] text-right">{pct}%</p>
        </div>
      </div>
      <div className="h-[6px] w-full rounded-full bg-brain-v1stroke-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: goal.color }}
        />
      </div>
    </div>
  );
};

/* Add Goal pill, Figma 4074:65844. Amber pill (#4a2300 / #ff9500),
   matches the same treatment as the Settings "Edit" button. */
const AddGoalButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    data-testid="button-add-goal"
    onClick={onClick}
    className="flex gap-[2px] items-center justify-center px-[10px] py-[4px] rounded-pill bg-brain-v1dark-orange hover:bg-brain-v1dark-orange-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1light-orange"
  >
    <span className="relative shrink-0 size-[16px]">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        <path d="M8 3.33V12.67M3.33 8H12.67" stroke="#ff9500" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
    <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1light-orange text-[12px] whitespace-nowrap">
      Add Goal
    </span>
  </button>
);

const GoalsSection = () => {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  /* Local-only state: new goals live in memory until the brain-core
     wiring lands. They reset on refresh by design. Demo accounts start
     with the Figma starter goals; real accounts start with none. */
  const isDemo = useIsDemoData();
  const [goals, setGoals] = useState<GoalRow[]>(() => (isDemo ? DEMO_GOALS : []));

  /* If the account changes without a remount (demo → real login in one
     session), never carry demo goals across. */
  useEffect(() => {
    setGoals(isDemo ? DEMO_GOALS : []);
  }, [isDemo]);

  const handleCreate = (payload: AddGoalPayload) => {
    const target = parseAmount(payload.amount);
    const fallbackName =
      payload.name.trim() || `${payload.category} goal`;
    const newGoal: GoalRow = {
      id: `goal-${Date.now()}`,
      name: fallbackName,
      vault: CATEGORY_VAULT[payload.category] ?? "USDC Vault",
      saved: 0,
      target: target || 0,
      color: GOAL_COLORS[goals.length % GOAL_COLORS.length],
    };
    setGoals((prev) => [...prev, newGoal]);
    setAddOpen(false);
    toast({
      title: "Goal created",
      description: `"${fallbackName}" added to your goals.`,
    });
  };

  return (
    <div className="bg-brain-v1highlight-dropdown-bg flex flex-col items-start overflow-hidden rounded-panel w-full">
      <div className="border-brain-v1stroke-2 border-b border-solid flex items-center justify-between px-[16px] py-[14px] w-full">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px]">
          Your Goals
        </p>
        <AddGoalButton onClick={() => setAddOpen(true)} />
      </div>
      <div className="flex flex-col gap-[16px] items-start p-[16px] w-full">
        {goals.length === 0 ? (
          <p
            data-testid="text-goals-empty"
            className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[14px]"
          >
            No goals yet. Add one to start tracking progress.
          </p>
        ) : (
          goals.map((g) => <GoalProgress key={g.id} goal={g} />)
        )}
      </div>
      <AddGoalModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={handleCreate}
      />
    </div>
  );
};


/**
 * One figure in the Overview metrics grid.
 *
 * `whole` / `cents` are pre-split so the cents render smaller, matching the
 * treatment the two original cards used. A card with no `onClick` is inert — it
 * gets no hover affordance, because a card that looks clickable and isn't is worse
 * than a plain one.
 */
const MetricCard = ({
  label,
  whole,
  cents,
  suffix,
  caption,
  captionClass,
  valueTone = "figure",
  onClick,
  testId,
}: {
  label: string;
  whole: string;
  cents?: string;
  suffix?: string;
  caption?: string;
  captionClass?: string;
  /**
   * `figure` is the 28px monospace treatment every numeric card uses. `text` is
   * for the cards whose answer is a statement rather than a number ("Not
   * applicable"): 28px mono words overflow the ~420px centre column outright,
   * and setting prose in a figure face reads as a value the tenant can compare.
   * The 36px leading is kept either way so the grid rows stay aligned.
   */
  valueTone?: "figure" | "text";
  onClick?: () => void;
  testId: string;
}) => (
  <div
    className={`bg-brain-v1highlight-dropdown-bg flex flex-col gap-[8px] items-start justify-start p-[16px] relative rounded-panel border border-transparent ${
      onClick ? "cursor-pointer transition-colors hover:bg-brain-v1baby-blue-5 hover:border-brain-v1stroke-2" : ""
    }`}
    data-testid={testId}
    {...(onClick
      ? {
          role: "button",
          tabIndex: 0,
          onClick,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick();
            }
          },
        }
      : {})}
  >
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-30 text-[12px] uppercase">{label}</p>
    <p
      className={`leading-[0] relative shrink-0 text-brain-v1baby-blue-100 text-[0px] w-full ${
        valueTone === "text"
          ? "[font-family:'Gilroy',sans-serif]"
          : "[font-family:'JetBrains_Mono',monospace] whitespace-nowrap"
      }`}
    >
      <span className={valueTone === "text" ? "font-semibold leading-[36px] text-[20px]" : "font-medium leading-[36px] text-[28px]"}>
        {whole}
      </span>
      {cents && <span className="font-medium leading-[36px] text-brain-v1baby-blue-60 text-[18px]">{cents}</span>}
      {suffix && <span className="font-medium leading-[36px] text-brain-v1baby-blue-60 text-[18px]">{suffix}</span>}
    </p>
    {caption && (
      <p className={`[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[13px] w-full ${captionClass ?? "text-brain-v1baby-blue-30"}`}>
        {caption}
      </p>
    )}
  </div>
);

// Shown when brain-core's ledger-grounded recommendation is unavailable — neutral,
// no invented figures (was a hardcoded "$432 less than last month. Nice.").
const SPENDING_INSIGHT_FALLBACK = { text: "No spending insight available yet.", colorClass: "text-brain-v1baby-blue-60" };

/* ── Insight-text helpers ────────────────────────────────────────────────────────────
   The recommendation string from brain-core often contains raw numbers and
   dates. We post-process it to match the user's chosen formatting: comma-
   separated amounts, locale-aware dates, and color-coded sentiment. */

/** Locale for dates: USD → en-US ("Apr 15, 2025"), EUR → en-GB ("15 Apr 2025"). */
const DATE_LOCALE: Record<CurrencyCode, string> = { USD: "en-US", EUR: "en-GB" };

function ordinalDay(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

function formatUpdatedAt(ts: number): string {
  const date = new Date(ts);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  const hours = date.getHours();
  const hour = hours % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hours < 12 ? "am" : "pm";
  return `${weekday} the ${ordinalDay(date.getDate())} at ${hour}:${minute}${meridiem}.`;
}

/** Re-format ISO dates (YYYY-MM-DD) and common month-day patterns in the text
  to the user's locale based on the selected currency. */
function formatDatesInText(text: string, currency: CurrencyCode): string {
  const locale = DATE_LOCALE[currency];
  // ISO dates: 2025-04-15
  let out = text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => {
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return _;
    return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  });
  // Month-name patterns: "April 15" or "April 15, 2025"
  out = out.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s+(\d{4}))?\b/g, (match, _month, day, year) => {
    const d = new Date(year ? `${match}` : `${_month} ${day}, ${new Date().getFullYear()}`);
    if (Number.isNaN(d.getTime())) return match;
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  });
  return out;
}

/** Detect sentiment in the recommendation text so we can colour-code it.
  Green = positive / inflow / "less spending" / "saved" / "surplus".
  Orange = warning / caution / "watch" / "upcoming" / "due" / "attention".
  Red = negative / outflow / "over" / "exceeded" / "shortfall" / "decline". */
function detectSentimentColor(text: string): string {
  const lower = text.toLowerCase();
  // 1) Negative / outflow / danger signals. Always red, highest priority
  const negative = [
    "over budget", "shortfall", "decline", "dropping", "fell",
    "negative", "deficit", "loss", "lost", "missed", "overdue", "late",
    "underfunded", "insufficient", "short", "risky", "danger", "critical",
    "overdraft", "bounced", "rejected", "failed", "unpaid",
  ];
  if (negative.some((w) => lower.includes(w))) return "text-brain-v1pink-red";
  // 2) Positive / inflow / good signals. Green, checked before warning so that
  //    an "upcoming inflow" is green (the inflow wins) not orange.
  const positive = [
    "saved", "surplus", "extra", "more than", "higher", "increase", "gained",
    "growth", "up", "rising", "exceeded target", "ahead", "on track", "nice",
    "good", "strong", "healthy", "positive", "inflow", "received", "collected",
  ];
  if (positive.some((w) => lower.includes(w))) return "text-brain-v1green";
  // 3) Warning / caution signals. Orange, only when no positive signal present
  const warning = [
    "watch", "caution", "careful", "attention", "upcoming", "due soon",
    "approaching", "nearing", "almost", "limited", "tight", "constrained",
    "review", "verify", "check", "pending", "unusual", "unexpected",
  ];
  if (warning.some((w) => lower.includes(w))) return "text-brain-v1light-orange";
  // 4) Neutral / no strong sentiment → baby-blue (matches existing default)
  return "text-brain-v1baby-blue-100";
}

// Net monthly cash flow (inflow − outflow, averaged over the months present) from
// brain-core ledger transactions. null when no transaction data is reachable
// (then the card keeps its static fallback). Transfers/adjustments don't count.
function netMonthlyCashflow(
  txs?: { amount?: string; direction?: string; transaction_date?: string }[],
): number | null {
  if (!txs || txs.length === 0) return null;
  const months = new Set<string>();
  let net = 0;
  let counted = 0;
  for (const t of txs) {
    const amt = Number(t.amount);
    if (!Number.isFinite(amt)) continue;
    if (t.direction === "inflow") net += amt;
    else if (t.direction === "outflow") net -= amt;
    else continue;
    counted++;
    if (t.transaction_date) months.add(t.transaction_date.slice(0, 7)); // YYYY-MM
  }
  if (counted === 0) return null;
  return net / Math.max(1, months.size);
}

export function HomePage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const { user } = useAuth();
  // Real company name from the tenancy link, falling back to the user's own display name
  // (was a hardcoded "ACME Inc."). Mirrors client/src/pages/SettingsPage.tsx.
  const { data: tenancy } = useQuery<{ mode: string; linked: boolean; tenantId?: string; companyName?: string }>({
    queryKey: ["/api/brain/tenancy"],
  });
  // A locally-saved override from the Settings > Profile "Edit" field always wins, matching
  // client/src/pages/SettingsPage.tsx's ProfileSection.
  const nameOverride = (() => {
    try { return localStorage.getItem("brain_profile_name"); } catch { return null; }
  })();
  const greetingName = nameOverride || tenancy?.companyName || user?.name || "";

  // Dynamic "last updated" timestamp. Refreshes every 10s
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setLastUpdated(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);
  const updatedLabel = useMemo(() => formatUpdatedAt(lastUpdated), [lastUpdated]);
  const { format, currency, formatText } = useCurrency();
  const [, navigate] = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const rules = useRules();
  /* Overview needs the tenant's rules for more than the paused-rule badge: their
     configured limits are what promote an `elevated` proposal into Urgent. Without
     this the store stays empty here (only RulesPage hydrated it) and no proposal
     would ever be judged material. */
  useEffect(() => {
    void hydrateUserRules();
  }, []);

  /* proposal type → the tenant's own limit for it. Derived from real configured
     rules only; there is no built-in default, so on a tenant with no rules this is
     empty and nothing is promoted on materiality. */
  const tierThresholds = useMemo(() => thresholdsFromRules(rules), [rules]);

  /* Session-scoped payment intents (same browser session as the Inbox). Only
     the COUNT is needed here now — the rows themselves, and the approve/reject
     path, belong to the Inbox. */
  const { intents } = useIntents();
  const pendingSessionIntents = useMemo(
    () => intents.filter((i) => i.outcome === "confirm" && !i.declined && i.approvalState !== "approved").length,
    [intents],
  );
  /* An intent proposed in THIS session is also in the durable queue below once
     core has it. The Inbox drops the durable copy on exactly this rule; without
     the same exclusion here the same pending payment is one row over there and
     two items in the count on this page. */
  const sessionIntentIds = useMemo(() => new Set(intents.map((i) => i.intentId)), [intents]);

  /* "Brain Did" (approved + auto-approved audit events) is deliberately NOT on
     Overview any more. Overview is what Brain is *waiting on*; a record that has
     already been decided needs nothing from the user and only competes with the
     rows that do. Nothing is lost — those same records are on Decisions under the
     Approved / Auto-approved statuses, and in full on the Audit Log. */

  /* Live brain-core PaymentIntents needing approval. Counted, not listed: the
     rows and the approve/reject path are the Inbox's. Read-only Ledger facts
     (reconciliation, subscriptions, disputes, cash flow) are NOT read here at
     all — they are awareness records, they were never part of this count, and
     the Inbox is where they render. */
  const {
    proposals: liveNeedsReview,
    isError: liveNeedsReviewError,
    isLoading: liveNeedsReviewLoading,
  } = useBrainReviewQueue();
  const durableNeedsReview = useMemo(
    () => liveNeedsReview.filter((p) => !sessionIntentIds.has(p.id)),
    [liveNeedsReview, sessionIntentIds],
  );

  /* Live brain-core agent proposals (GET /v1/proposals) needing a decision. */
  const {
    proposals: liveProposals,
    isError: liveProposalsError,
    isLoading: liveProposalsLoading,
  } = useBrainProposals();
  const needsReviewProposals = useMemo(() => liveProposals.filter(isNeedsReview), [liveProposals]);
  /* Tier order is retained even though nothing is rendered from this list any
     more: `deriveProposalTier` returning null is how a proposal with no writable
     decision is excluded, and the count below re-derives per row. */
  const tieredProposals = useMemo(() => {
    const withTier = needsReviewProposals.flatMap((p) => {
      const tier = deriveProposalTier(p, { thresholds: tierThresholds });
      return tier ? [{ proposal: p, tier }] : [];
    });
    return TIER_ORDER.flatMap((tier) => withTier.filter((e) => e.tier === tier).map((e) => e.proposal));
  }, [needsReviewProposals, tierThresholds]);
  /* ── What's waiting on you, as ONE line ────────────────────────────────────
     Overview counts; the Inbox lists. This page used to render the same queue
     the Inbox does, which left two screens competing to be the place you work
     from — and two chances for them to disagree about what is pending. The
     rows, their inline actions, the bulk-approve bar and the four detail
     surfaces now live on /inbox and only there.

     The count has to match what the Inbox will actually show, so it applies the
     Inbox's rules rather than inventing its own:
       • payment intents — session-scoped and the durable review queue — which
         always tier as "waiting" (see tierForPaymentIntent),
       • agent proposals carrying a writable approve/reject. Acknowledge-only
         records tier as `insight` and belong under For Your Awareness, so they
         are deliberately NOT counted as something to decide,
       • minus proposals the audit feed already shows as decided: brain-core
         keeps decided rows in /v1/proposals and the Inbox suppresses them,
       • plus stalled agent runs — Needs Your Input — which are unresolved work
         asking something of the tenant.

     Honesty rule: a failed contributing feed is never treated as an empty queue. */
  const decided = useDecidedProposalIds();
  const missingEvidence = useMissingEvidenceItems();
  const decidedIds = decided.ids;
  const missingEvidenceCount = missingEvidence.items.length;
   /* Failed reads are the only incomplete state now: every successful list read
      follows its cursor to the end before contributing to this count. */
  const incompleteRead =
    liveNeedsReviewError ||
    liveProposalsError ||
    missingEvidence.isError ||
     decided.isError;
  /* Until every one of these has answered, the total is a running subtotal.
     Printing it would show a number that changes under the reader, and showing
     nothing would read as an all-clear — so the line says it is still asking. */
  const stillReading = liveNeedsReviewLoading || liveProposalsLoading || missingEvidence.isLoading || decided.isLoading;

  const pendingSummary = useMemo(() => {
    let urgent = 0;
    let waiting = 0;
    for (const p of tieredProposals) {
      if (decidedIds.has(p.id)) continue;
      const tier = deriveProposalTier(p, { thresholds: tierThresholds });
      if (tier === "urgent") urgent++;
      else if (tier === "waiting") waiting++;
    }
    /* Both payment-intent feeds land in "waiting" — see tierForPaymentIntent. */
    return pendingAttentionSummary({
      urgent,
      waiting: waiting + pendingSessionIntents + durableNeedsReview.length,
      input: missingEvidenceCount,
      incomplete: incompleteRead,
      loading: stillReading,
    });
  }, [
    tieredProposals,
    tierThresholds,
    decidedIds,
    pendingSessionIntents,
    durableNeedsReview.length,
    missingEvidenceCount,
    incompleteRead,
    stillReading,
  ]);


  // "Money in all accounts" total from brain-core's Ledger (via the BFF proxy).
  // Falls back to the static figure when brain-core is unreachable/unconfigured.
  /* The full DTO, not just `current_balance`: bank concentration needs each
     account's institution and type, and a second query for the same rows would
     let the total and the concentration figure disagree. */
  /* Every page. This was a single unpaged fetch, so a capped account list would
     have quietly become a smaller balance — and this figure is also the cash
     projection's opening balance, so the understatement would propagate. */
  const accountsRead = usePagedLedgerRead<BrainAccountDTO>("/api/brain/ledger/accounts", "accounts");
  const accountsTotal = useMemo(
    () =>
      accountsTotalView({
        failed: accountsRead.failed,
        read: accountsRead.read,
        displayCurrency: currency,
      }),
    [accountsRead.failed, accountsRead.read, currency],
  );
  const liveTotal = accountsTotal.kind === "value" ? accountsTotal.total : null;
  // No live ledger total → honest placeholder, never a fabricated figure (was "$86,993.42").
  const totalFormatted = liveTotal !== null ? format(liveTotal) : "-";

  /* The caption carries what the figure cannot: which currency it covers, and
     what was left out of it. Without this the card would show a smaller number
     than the tenant's real holdings with no explanation. */
  const totalCaption = useMemo(() => {
    const left = accountsTotal.excludedCurrencies.join(", ");
    const n = accountsTotal.excludedCount;
    const plural = n === 1 ? "account" : "accounts";
    switch (accountsTotal.kind) {
      case "failed":
        return "Couldn't read your accounts. This is a connection problem, not an empty balance.";
      case "loading":
        return "Reading your accounts…";
      case "incomplete":
        return "Part of your account list couldn't be read, so a total would understate this.";
      case "none":
        return "No accounts connected yet. Add one in Settings, under Sources.";
      case "no_matching_currency":
        return `No ${currency} accounts. Your ${n} ${plural} are held in ${left}, which can't be converted.`;
      case "unreadable":
        return "Your accounts didn't report a balance.";
      case "value":
        return n > 0
          ? `Across your ${currency} accounts. Excludes ${n} ${plural} held in ${left} — there's no conversion rate.`
          : "Across bank, digital, and agent accounts.";
    }
  }, [accountsTotal, currency]);
  const totalParts = totalFormatted.match(/^(.+)\.(\d{2})$/);
  const totalWhole = totalParts ? totalParts[1] : totalFormatted;
  const totalCents = totalParts ? `.${totalParts[2]}` : "";

  // Net cash flow per month from the live Ledger. With only inflows seeded today
  // this reads as positive income; it nets real expenses automatically once money
  // -out transactions land. null when no transactions are reachable at all.
  const { data: brainTx } = useQuery<{
    transactions?: { amount?: string; direction?: string; transaction_date?: string }[];
  }>({
    queryKey: ["/api/brain/ledger/transactions"],
    retry: false,
  });
  const netMonthly = netMonthlyCashflow(brainTx?.transactions);
  // No live transactions → honest placeholder, never a fabricated figure (was "$7,324").
  const cashLabel = netMonthly !== null ? "Net cash flow" : "Monthly spend";
  const cashFormatted = netMonthly !== null
    ? `${netMonthly >= 0 ? "+" : "-"}${format(Math.abs(netMonthly))}`
    : "-";
  const cashParts = cashFormatted.match(/^([+-]?)(.+)\.(\d{2})$/);
  const cashWhole = cashParts ? `${cashParts[1]}${cashParts[2]}` : cashFormatted;
  const cashCents = cashParts ? `.${cashParts[3]}` : "";

  // Real ledger-grounded insight from brain-core (via the BFF). Falls back to a
  // static (non-dollar) line when brain-core is unreachable/unconfigured; overridden
  // below with a neutral prompt when there are no transactions to speak of at all.
  const { data: brainRec } = useQuery<{ text?: string }>({
    queryKey: ["/api/brain/recommendation"],
    retry: false,
    // Matches the BFF's 15-minute recommendation cache: tab switches and
    // remounts within a session don't re-hit the BFF at all.
    staleTime: 15 * 60 * 1000,
  });
  /* Post-process the recommendation text: comma-format amounts, locale-format
     dates (USD → US date style, EUR → European), and detect sentiment for color.
     The fallback line is also formatted so static text stays consistent. */
  const rawText = brainRec?.text?.trim() ?? "";
  const processedText = rawText
    ? formatDatesInText(formatText(rawText), currency)
    : formatText(SPENDING_INSIGHT_FALLBACK.text);
  const insightLine =
    netMonthly === null
      ? { text: "Connect accounts to see monthly spend.", colorClass: "text-brain-v1baby-blue-60" }
      : rawText
        ? { text: processedText, colorClass: detectSentimentColor(processedText) }
        : { text: processedText, colorClass: SPENDING_INSIGHT_FALLBACK.colorClass };

  /* Liabilities — everything outstanding: unpaid bills AND accrued payroll. Same
     figure, same source, same module (lib/liabilities.ts) as the Cash Flow metric
     and the itemized list this card links to, so the three can't drift. Reads the
     obligations feed rather than invoices: invoices carry no payroll records, which
     silently understated this number. null, rendered "-", when nothing is reachable
     OR when only part of the ledger could be read: zero would be a claim that nothing
     is owed, and a partial sum is a smaller number that looks just as settled. */
  const obligationsRead = usePagedLedgerRead<RawObligation>("/api/brain/ledger/obligations", "obligations");
  const payables = payablesView({
    failed: obligationsRead.failed,
    read: obligationsRead.read,
    ingesting: obligationsRead.ingesting,
  });
  const liabilities = payables.total;
  const liabilitiesFormatted = liabilities !== null ? format(liabilities) : "-";
  const liabParts = liabilitiesFormatted.match(/^(.+)\.(\d{2})$/);
  const liabWhole = liabParts ? liabParts[1] : liabilitiesFormatted;
  const liabCents = liabParts ? `.${liabParts[2]}` : "";

  /* Runway — how long the cash lasts at the current net burn.
     Only defined while money is actually going out. A non-negative net flow has no
     burn to divide by, so the card says that in words rather than printing "∞", a
     huge meaningless number, or a figure that silently flips sign. */
  /* Three states, and they must not look alike. "-" used to mean all three, so a
     tenant whose cash flow is POSITIVE — the good outcome — saw the same dash as
     one whose accounts had failed to load, and read it as broken. Positive flow
     now says so in words and in green; only genuinely absent data keeps the dash. */
  const runway = useMemo<{ value: string; caption: string; tone: "figure" | "text"; captionClass?: string }>(() => {
    if (liveTotal === null || netMonthly === null) {
      return { value: "-", caption: "Connect accounts to see runway.", tone: "figure" };
    }
    if (netMonthly >= 0) {
      return {
        value: "Not applicable",
        caption: "Cash flow is positive — there's no burn to run out of.",
        tone: "text",
        captionClass: "text-brain-v1green",
      };
    }
    const months = liveTotal / Math.abs(netMonthly);
    if (!Number.isFinite(months) || months < 0) return { value: "-", caption: "Not enough data yet.", tone: "figure" };
    return { value: `${Math.floor(months)} mo`, caption: "At the current net burn.", tone: "figure" };
  }, [liveTotal, netMonthly]);

  /* ── Secondary indicators ──────────────────────────────────────────────────
     Invoices back BOTH the AR-aging card and the projected inflows, read once
     here and shared, so the two surfaces cannot disagree about what's outstanding. */
  const invoicesRead = usePagedLedgerRead<RawInvoice>("/api/brain/ledger/invoices", "invoices");

  /* Pinned at mount. A fresh Date() on every render would recompute the whole
     projection continuously and let a row silently cross the 90-day boundary
     mid-session; a reload is the honest refresh point for a day-grained figure. */
  const asOf = useMemo(() => new Date(), []);

  const arAging = useMemo(
    () => arAgingView({ failed: invoicesRead.failed, read: invoicesRead.read, now: asOf }),
    [invoicesRead.failed, invoicesRead.read, asOf],
  );
  const concentration = useMemo(
    () =>
      concentrationView({
        /* A partial account list makes the denominator too small, which
           OVERSTATES concentration — the one direction that would raise a false
           alarm. Refuse the same way a failed read does. */
        failed: accountsRead.failed || (accountsRead.read != null && !accountsRead.read.complete),
        accounts: accountsRead.read?.rows ?? null,
      }),
    [accountsRead.failed, accountsRead.read],
  );
  /* ── Opening the record behind a projection event ──────────────────────────
     The strip under the chart is the only place on this page where a specific
     ledger record is named, and until now naming it was all it did: the user
     read "Invoice AR-0042, Aug 20" and then had to go find that invoice on
     another page to see anything about it.

     Two extra reads make the same popups the Ledger opens available here. Both
     share their query keys with the Ledger tabs, so this costs no additional
     request once either page has been visited:
       - the invoice DTO feed, needed ONLY to find the bill behind a payable.
         The projection's own invoice read is the raw feed, whose fields are all
         `unknown`; handing those to a popup that expects strings is exactly the
         kind of lie the raw types exist to prevent.
       - counterparties, so a record opened from here is titled with the same
         name the Ledger row would show rather than "Unidentified counterparty". */
  const billsQ = useQuery<{ invoices?: BrainInvoiceDTO[] }>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const cpQ = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const eventRecords = useMemo(
    () =>
      cashEventRecordIndex({
        obligations: obligationsRead.read?.rows ?? null,
        invoices: invoicesRead.read?.rows ?? null,
        bills: billsQ.data?.invoices ?? null,
      }),
    [obligationsRead.read, invoicesRead.read, billsQ.data],
  );

  /* The card holds no feeds, so it cannot decide tappability itself. */
  const openableEventIds = useMemo(() => new Set(eventRecords.keys()), [eventRecords]);

  /* One slot for all three popups: an event resolves to exactly one record, and
     separate state per kind would allow two open at once. */
  const [openRecord, setOpenRecord] = useState<CashEventRecord | null>(null);
  const openEventRecord = (e: CashEvent) => {
    const record = eventRecords.get(e.id);
    /* Guarded rather than assumed: the chip's affordance is computed from the
       same map, but a feed can settle between paint and click. */
    if (record) setOpenRecord(record);
  };

  const counterpartyName = (id: string | null): string | null =>
    (id && cpQ.data?.counterparties.find((c) => c.id === id)?.name) || null;

  const projection = useMemo(
    () =>
      cashProjectionView({
        failed: obligationsRead.failed || invoicesRead.failed,
        startingBalance: liveTotal,
        obligations: obligationsRead.read,
        invoices: invoicesRead.read,
        now: asOf,
      }),
    [obligationsRead.failed, obligationsRead.read, invoicesRead.failed, invoicesRead.read, liveTotal, asOf],
  );

  /* AR over 90 days. The percentage is the point — a big number on a big book is
     a different problem from the same number on a small one — so the card leads
     with the amount and captions it with the share plus the single oldest debtor.
     Only the id is available for that debtor today; name resolution needs a
     lookup this feed doesn't offer. */
  const arStale = useMemo(() => {
    switch (arAging.kind) {
      case "failed":
        return { whole: "-", cents: "", caption: "Couldn't read your invoices." };
      case "loading":
        return { whole: "-", cents: "", caption: "Reading your invoices…" };
      case "unreadable":
        return { whole: "-", cents: "", caption: "Part of your ledger couldn't be read, so a share would mislead." };
      case "none":
        return { whole: format(0), cents: "", caption: `Nothing outstanding beyond ${AR_STALE_DAYS} days.` };
      default: {
        const formatted = format(arAging.staleAmount ?? 0);
        const parts = formatted.match(/^(.+)\.(\d{2})$/);
        const share =
          arAging.pctOfTotalAr !== null ? `${Math.round(arAging.pctOfTotalAr * 100)}% of all receivables. ` : "";
        const worst = arAging.worst;
        const oldest = worst ? `Oldest: ${worst.counterparty_id ?? "unknown customer"}, ${worst.days} days overdue.` : "";
        return {
          whole: parts ? parts[1] : formatted,
          cents: parts ? `.${parts[2]}` : "",
          caption: `${share}${oldest}`.trim(),
        };
      }
    }
  }, [arAging, format]);

  /* Bank concentration. Reported as a share rather than a balance because the
     risk is the ratio: $2M in one account is fine at $10M total and existential
     at $2.1M. */
  const bankConcentration = useMemo(() => {
    switch (concentration.kind) {
      case "failed":
        return { whole: "-", caption: "Couldn't read your accounts.", captionClass: undefined };
      case "loading":
        return { whole: "-", caption: "Reading your accounts…", captionClass: undefined };
      case "none":
        return { whole: "-", caption: "No cash accounts connected yet.", captionClass: undefined };
      case "unreadable":
        return { whole: "-", caption: "Your accounts didn't report balances.", captionClass: undefined };
      case "mixed_currency":
        return {
          whole: "-",
          caption: "Balances span more than one currency, so a single share would be meaningless.",
          captionClass: undefined,
        };
      default: {
        const pct = Math.round((concentration.pct ?? 0) * 100);
        const spread =
          concentration.bucketCount === 1
            ? "All of your cash is in one place."
            : `Spread across ${concentration.bucketCount} institutions.`;
        return {
          whole: `${pct}%`,
          caption: `In ${concentration.largestLabel}. ${spread}`,
          captionClass: concentration.warn ? "text-brain-v1light-orange" : undefined,
        };
      }
    }
  }, [concentration]);

  // Show onboarding once per signed-in user, on first visit to the home screen.
  const onboardingKey = onboardingKeyFor(user?.id);
  useEffect(() => {
    if (!onboardingKey) {
      setShowOnboarding(false);
      return;
    }
    setShowOnboarding(!isOnboardingComplete(user?.id));
  }, [onboardingKey, user?.id]);

  const finishOnboarding = () => {
    markOnboardingComplete(user?.id);
    setShowOnboarding(false);
  };

  return (
    <div className="bg-brain-v1baby-blue-5 overflow-hidden relative size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header — the eyebrow / 32px title / description stack Inbox and Ledger
              use. Previously each line sat in its own flex wrapper and the eyebrow
              used a `leading-[0] text-[0px]` parent to kill inter-span whitespace;
              plain sibling <p>s make it the same three-line shape as the other pages. */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-60 text-[20px]">
              {greeting}{greetingName ? ", " : ""}
              {greetingName && <span className="text-brain-v1baby-blue-100">{greetingName}</span>}.
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-brain-v1baby-blue-100 text-[32px]">
              Here's your financial snapshot for today.
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-30 text-[16px]">
              Updated {updatedLabel}
            </p>
          </div>

          {/* Metrics */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Auto-fit, not fixed breakpoints. Overview sits in a narrow centre
                column between the nav and the chat panel, so viewport-based
                `lg:grid-cols-4` puts four cards in ~420px and clips the figures.
                Sizing off the CONTAINER gives 2x2 here and four across once the
                chat panel is collapsed. */}
            <div className="grid gap-[16px] w-full" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <MetricCard
                label="Money in all accounts"
                whole={totalWhole}
                cents={totalCents}
                caption={totalCaption}
                onClick={() => navigate("/ledger?tab=accounts")}
                testId="card-metric-accounts"
              />
              <MetricCard
                label={cashLabel}
                whole={cashWhole}
                cents={cashCents}
                suffix="/mo"
                caption="Trailing monthly average."
                testId="card-metric-cashflow"
              />
              <MetricCard
                label="Runway"
                whole={runway.value}
                valueTone={runway.tone}
                caption={runway.caption}
                captionClass={runway.captionClass}
                testId="card-metric-runway"
              />
              <MetricCard
                label="Liabilities"
                whole={liabWhole}
                cents={liabCents}
                caption={ledgerFigureCaption(payables, "Everything you still owe.")}
                onClick={() => navigate("/ledger?tab=payables")}
                testId="card-metric-liabilities"
              />
            </div>

            {/* Second row: the two indicators that say whether the headline
                figures are healthy, rather than restating them. Same auto-fit
                sizing — never viewport breakpoints — because this grid sits in
                the same narrow centre column. */}
            <div
              className="grid gap-[16px] w-full"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
              data-testid="grid-home-secondary-metrics"
            >
              <MetricCard
                label={`AR over ${AR_STALE_DAYS} days`}
                whole={arStale.whole}
                cents={arStale.cents}
                caption={arStale.caption}
                onClick={() => navigate("/ledger?tab=receivables")}
                testId="card-metric-ar-aging"
              />
              <MetricCard
                label="Largest cash holding"
                whole={bankConcentration.whole}
                caption={bankConcentration.caption}
                captionClass={bankConcentration.captionClass}
                onClick={() => navigate("/ledger?tab=accounts")}
                testId="card-metric-bank-concentration"
              />
            </div>

            {/* brain-core's ledger-grounded read of the figures directly above.
                This is LIVE output, not leftover copy — when brain-core has no
                read it says "No spending insight available yet". It used to sit
                between the projection card and the divider, where its
                month-to-date figure read as a second, contradictory forecast of
                the same window. Moved up against the metrics it actually
                comments on: trailing spend, not the projection horizon. */}
            <p
              className={`[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[16px] w-full ${insightLine.colorClass}`}
              data-testid="text-home-cash-insight"
            >
              {insightLine.text}
            </p>

            {/* Divider */}
            <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* What's waiting on you: a COUNT and a way in, never the items
                themselves. Overview listing them too was the duplication this
                restructure exists to remove — the itemized queue, its inline
                actions and its detail surfaces all live on /inbox now.

                Hidden entirely when nothing is pending AND every feed was read
                — a permanent "0 items" badge trains people to stop reading the
                row. It is NOT hidden when a read failed: see pendingSummary. */}
            {pendingSummary && (
              <button
                type="button"
                onClick={() => navigate("/inbox")}
                data-testid="row-home-pending-summary"
                aria-label={`${pendingSummary.text}. Open the Inbox.`}
                className={`flex flex-col gap-[4px] px-[16px] py-[12px] rounded-panel border border-solid w-full text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple ${
                  pendingSummary.tone === "urgent"
                    ? "bg-brain-v1dark-pink-red border-[rgba(210,3,68,0.2)] hover:border-[rgba(210,3,68,0.45)]"
                    : "bg-brain-v1highlight-dropdown-bg border-brain-v1stroke-2 hover:border-brain-v1purple"
                }`}
              >
                <div className="flex items-center gap-[10px] w-full min-w-0">
                  <div
                    className="size-[8px] rounded-full shrink-0"
                    style={{
                      background:
                        pendingSummary.tone === "urgent"
                          ? "#d20344"
                          : /* Grey for both "we don't know yet" cases: still
                               reading, and read but failed. Amber would claim
                               there is something to act on. */
                            pendingSummary.tone === "unknown" || pendingSummary.tone === "loading"
                            ? "#6c779d"
                            : "#ff9500",
                    }}
                  />
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[16px] text-brain-v1baby-blue-100 flex-1 min-w-0">
                    {pendingSummary.text}
                  </p>
                  <span
                    className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[14px] text-brain-v1purple shrink-0"
                    aria-hidden="true"
                  >
                    Open Inbox
                  </span>
                </div>
                {pendingSummary.detail && (
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] text-brain-v1baby-blue-60 pl-[18px] w-full">
                    {pendingSummary.detail}
                  </p>
                )}
              </button>
            )}

            <CashProjectionCard
              view={projection}
              format={format}
              horizonDays={PROJECTION_DAYS}
              openableEventIds={openableEventIds}
              onOpenEvent={openEventRecord}
            />

            {/* Your Goals - hidden for now */}
            {/* <GoalsSection /> */}
          </div>
        </div>
      </ScrollArea>

      <OnboardingFlow
        open={showOnboarding}
        onClose={finishOnboarding}
        onComplete={finishOnboarding}
      />

      {/* Records opened from the cash-projection strip. The SAME popups the
          Ledger opens, deliberately — a second detail view of a payable would be
          a second place for its wording to go stale.

          No pager on any of them. Previous/Next walks the list the user is
          looking at, and the list here is the strip: payables and customer
          invoices interleaved in date order. Each popup can only step through
          one of those types, so paging would quietly skip every event of the
          other kind — the user would tap Next on the Aug 13 bill and land past
          the Aug 20 invoice sitting right beside it on screen. */}
      <BillDetailPopup
        bill={openRecord?.kind === "bill" ? openRecord.bill : null}
        vendorName={
          (openRecord?.kind === "bill" ? counterpartyName(openRecord.obligation.counterparty_id) : null) ??
          "Unidentified counterparty"
        }
        hidePager
        onClose={() => setOpenRecord(null)}
      />
      <PayableDetailPopup
        payable={openRecord?.kind === "payable" ? openRecord.payable : null}
        counterpartyName={openRecord?.kind === "payable" ? counterpartyName(openRecord.payable.counterparty_id) : null}
        invoicesUnknown={openRecord?.kind === "payable" ? openRecord.invoicesUnknown : undefined}
        hidePager
        onClose={() => setOpenRecord(null)}
      />
      <ReceivableDetailPopup
        receivable={openRecord?.kind === "receivable" ? openRecord.receivable : null}
        counterpartyName={
          openRecord?.kind === "receivable" ? counterpartyName(openRecord.receivable.counterparty_id) : null
        }
        hidePager
        onClose={() => setOpenRecord(null)}
      />

    </div>
  );
}
