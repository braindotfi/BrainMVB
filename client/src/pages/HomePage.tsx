import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useIntents } from "@/lib/intentsStore";
import { intentToReview } from "@/lib/intentToReview";
import {
  useBrainReconciliationInsights,
  useBrainSubscriptionInsights,
  useBrainDisputeInsights,
  useBrainCashFlowInsight,
  type LiveInsight,
} from "@/lib/brainAgentSurfaces";
import { LiveInsightModal } from "@/components/LiveInsightModal";
import {
  useBrainProposals,
  useDecideProposal,
  isNeedsReview,
  agentKeyForProposalType,
  type BrainProposal,
  type ProposalDecision,
} from "@/lib/brainProposals";
import { LiveProposalModal, AGENT_DISPLAY_NAME } from "@/components/AgentProposalModal";
import {
  deriveProposalTier,
  thresholdsFromRules,
  tierForPaymentIntent,
  tierForReadOnlyInsight,
  TIER_ORDER,
} from "@/lib/proposalTiers";
import { TierSections, type TierRowAction, type TierRowModel } from "@/components/TierRowList";
import { buildProposalHeaderCopy, buildDecisionButtons } from "@/lib/proposalCards";
import { liabilitiesTotal, type ApInvoiceLike } from "@/lib/liabilities";
import { apiRequest } from "@/lib/queryClient";
import { mapApprovalRejection, parseCoreError, type ApprovalRejection } from "@/lib/approvalRejections";
import { ProposalDetail, type ProposalAction } from "@/components/ProposalDetail";
import { ReviewModal, type ReviewItemType } from "@/components/ReviewItems";
import type { Proposal } from "@/lib/proposalTypes";
import { openRuleDetail } from "@/lib/openRuleDetail";
import {
  useRules,
  hydrateUserRules,
  pauseRule as storePauseRule,
  reportProblem as storeReportProblem,
  sendFeedback as storeSendFeedback,
  setRuleDraft,
} from "@/lib/rulesStore";
import { useReviewStatuses } from "@/lib/reviewStatusStore";

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
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[14px] truncate">
          <span>{goal.name}</span>
          <span className="text-[#6c779d] font-medium"> · {goal.vault}</span>
        </p>
        <div className="flex items-center gap-[12px] shrink-0 [font-family:'JetBrains_Mono',monospace] tabular-nums">
          <p className="text-[#a8b9f4] text-[14px]">
            <span className="font-medium">{fmt(goal.saved)}</span>
            <span className="text-[#6c779d]"> of </span>
            <span className="font-medium">{fmt(goal.target)}</span>
          </p>
          <p className="text-[#6c779d] text-[14px] w-[36px] text-right">{pct}%</p>
        </div>
      </div>
      <div className="h-[6px] w-full rounded-full bg-[#1d2132] overflow-hidden">
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
    className="flex gap-[2px] items-center justify-center px-[10px] py-[4px] rounded-[100px] bg-[#4a2300] hover:bg-[#5a2c00] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9500]"
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
    <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#ff9500] text-[12px] whitespace-nowrap">
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
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-hidden rounded-[16px] w-full">
      <div className="border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] w-full">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
          Your Goals
        </p>
        <AddGoalButton onClick={() => setAddOpen(true)} />
      </div>
      <div className="flex flex-col gap-[16px] items-start p-[16px] w-full">
        {goals.length === 0 ? (
          <p
            data-testid="text-goals-empty"
            className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]"
          >
            No goals yet — add one to start tracking progress.
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
  onClick,
  testId,
}: {
  label: string;
  whole: string;
  cents?: string;
  suffix?: string;
  caption?: string;
  captionClass?: string;
  onClick?: () => void;
  testId: string;
}) => (
  <div
    className={`bg-[#0a0c10] flex flex-col gap-[8px] items-start justify-start p-[16px] relative rounded-[16px] border border-transparent ${
      onClick ? "cursor-pointer transition-colors hover:bg-[#11141b] hover:border-[#1d2132]" : ""
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
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[13px] uppercase">{label}</p>
    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full whitespace-nowrap">
      <span className="font-medium leading-[36px] text-[28px]">{whole}</span>
      {cents && <span className="font-medium leading-[36px] text-[#6c779d] text-[18px]">{cents}</span>}
      {suffix && <span className="font-medium leading-[36px] text-[#6c779d] text-[18px]">{suffix}</span>}
    </p>
    {caption && (
      <p className={`[font-family:'Gilroy',sans-serif] font-normal leading-[18px] text-[13px] w-full ${captionClass ?? "text-[#414965]"}`}>
        {caption}
      </p>
    )}
  </div>
);

// Shown when brain-core's ledger-grounded recommendation is unavailable — neutral,
// no invented figures (was a hardcoded "$432 less than last month. Nice.").
const SPENDING_INSIGHT_FALLBACK = { text: "No spending insight available yet.", colorClass: "text-[#6c779d]" };

/* ── Insight-text helpers ────────────────────────────────────────────────────────────
   The recommendation string from brain-core often contains raw numbers and
   dates. We post-process it to match the user's chosen formatting: comma-
   separated amounts, locale-aware dates, and color-coded sentiment. */

/** Locale for dates: USD → en-US ("Apr 15, 2025"), EUR → en-GB ("15 Apr 2025"). */
const DATE_LOCALE: Record<CurrencyCode, string> = { USD: "en-US", EUR: "en-GB" };

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
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
  if (negative.some((w) => lower.includes(w))) return "text-[#d20344]";
  // 2) Positive / inflow / good signals. Green, checked before warning so that
  //    an "upcoming inflow" is green (the inflow wins) not orange.
  const positive = [
    "saved", "surplus", "extra", "more than", "higher", "increase", "gained",
    "growth", "up", "rising", "exceeded target", "ahead", "on track", "nice",
    "good", "strong", "healthy", "positive", "inflow", "received", "collected",
  ];
  if (positive.some((w) => lower.includes(w))) return "text-[#42bf23]";
  // 3) Warning / caution signals. Orange, only when no positive signal present
  const warning = [
    "watch", "caution", "careful", "attention", "upcoming", "due soon",
    "approaching", "nearing", "almost", "limited", "tight", "constrained",
    "review", "verify", "check", "pending", "unusual", "unexpected",
  ];
  if (warning.some((w) => lower.includes(w))) return "text-[#ff9500]";
  // 4) Neutral / no strong sentiment → baby-blue (matches existing default)
  return "text-[#a8b9f4]";
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
  const updatedLabel = useMemo(() => timeAgo(lastUpdated), [lastUpdated]);
  const { format, currency, formatText } = useCurrency();
  const [, navigate] = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);

  /* Records opened directly from Home widgets. Each popup keeps its own
     section-specific sibling queue so Previous/Next stays within the card
     type the user tapped. */
  const [selectedReview, setSelectedReview] = useState<Proposal | null>(null);
  const reviewStatuses = useReviewStatuses();

  const rules = useRules();
  const ruleOf = (p: Proposal) =>
    p.rule ? rules.find((r) => r.id === p.rule!.id || r.policyId === p.rule!.policyId) : undefined;
  const isRulePaused = (p: Proposal): boolean => {
    const r = ruleOf(p);
    return r ? !r.active : p.rule ? !p.rule.active : false;
  };

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

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidateLiveQueue = () => {
    void queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/proposals") });
    void queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/payment-intents/") });
  };
  const approveLive = useMutation<unknown, Error, string>({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/brain/payment-intents/${id}/approve`, { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(mapApprovalRejection(parseCoreError(body)).detail);
      return body;
    },
    onSuccess: () => { setSelectedReview(null); invalidateLiveQueue(); },
    onError: (err) => toast({ title: "Couldn't approve", description: err.message, variant: "destructive" }),
  });
  const rejectLive = useMutation<unknown, Error, string>({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: id, reason: "Declined by operator" });
      return res.json();
    },
    onSuccess: () => { setSelectedReview(null); invalidateLiveQueue(); },
    onError: (err) => toast({ title: "Couldn't reject", description: err.message, variant: "destructive" }),
  });

  const handleReviewAction = (action: ProposalAction) => {
    if (!selectedReview) return;
    /* selectedReview is only ever set from the LIVE brain-core queue. Always
       ask core directly, never flip a client-side status for a live intent. */
    if (action === "approve") approveLive.mutate(selectedReview.id);
    else if (action === "reject") rejectLive.mutate(selectedReview.id);
    // postpone/verifyFirst have no brain-core equivalent for a live intent. No-op.
  };

  /* Session-scoped intents (same browser session as the Inbox). Mirroring the
     Inbox pattern: these render in Brain Detected and open a ReviewModal. */
  const { intents, markDeclined, setApprovalState } = useIntents();
  const sessionReviews = useMemo(
    () => intents.filter((i) => i.outcome === "confirm" && !i.declined && i.approvalState !== "approved").map((r) => intentToReview(r, format)),
    [intents, format],
  );
  const [selectedLiveIntent, setSelectedLiveIntent] = useState<ReviewItemType | null>(null);
  const [liveRejection, setLiveRejection] = useState<ApprovalRejection | null>(null);
  const [approvingIntentId, setApprovingIntentId] = useState<string | null>(null);
  const rejectIntent = useMutation<unknown, Error, string>({
    mutationFn: async (intentId: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: intentId, reason: "Declined by operator" });
      return res.json();
    },
    /* Announce the RESULT, not the click. The modal used to toast "Rejected"
       before the request was even sent, so a failed reject still reported
       success. Both the modal and the inline row action share this path now, so
       a failure has to say so in one place. */
    onSuccess: (_d, intentId) => {
      markDeclined(intentId);
      toast({ title: "Rejected", description: "The payment has been rejected.", variant: "default" });
    },
    onError: (err) => {
      toast({ title: "Couldn't reject the payment", description: err.message, variant: "destructive" });
    },
  });
  const approveIntent = async (intentId: string, surfaceRejection: boolean) => {
    setApprovingIntentId(intentId);
    setLiveRejection(null);
    try {
      const res = await fetch(`/api/brain/payment-intents/${intentId}/approve`, { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        const rej = mapApprovalRejection(parseCoreError(body));
        if (surfaceRejection) setLiveRejection(rej);
        else toast({ title: rej.title, description: rej.detail, variant: "destructive" });
        return;
      }
      const status: string = body?.intent?.status ?? "";
      if (status === "awaiting_second_approval" || status === "pending_approval") {
        setApprovalState(intentId, "awaiting_second");
        toast({ title: "Approval recorded", description: "One more approver is needed before this can settle.", variant: "default" });
      } else {
        setApprovalState(intentId, "approved");
        toast({ title: "Payment approved", description: "Brain core accepted the approval. It will settle shortly.", variant: "default" });
      }
      setSelectedLiveIntent(null);
    } catch {
      const rej: ApprovalRejection = { reason: "network_error", title: "Couldn't reach Brain core", detail: "The approval didn't go through. Check your connection and try again. Nothing was changed." };
      if (surfaceRejection) setLiveRejection(rej);
      else toast({ title: rej.title, description: rej.detail, variant: "destructive" });
    } finally {
      setApprovingIntentId(null);
    }
  };

  /* "Brain Did" (approved + auto-approved audit events) is deliberately NOT on
     Overview any more. Overview is what Brain is *waiting on*; a record that has
     already been decided needs nothing from the user and only competes with the
     rows that do. Nothing is lost — those same records are on Decisions under the
     Approved / Auto-approved statuses, and in full on the Audit Log. */

  /* What Brain is advising for review: live brain-core
     PaymentIntents needing approval, plus read-only live Ledger facts
     (reconciliation matches, subscription/disputed obligations, cash flow -
     see brainAgentSurfaces.ts) that have no proposal lifecycle of their own
     yet. Tapping a payment-intent row opens the actionable review sheet;
     tapping an insight row opens the read-only LiveInsightModal. */
  const { proposals: liveNeedsReview, isError: liveNeedsReviewError } = useBrainReviewQueue();
  const { insights: reconInsights, isError: reconError } = useBrainReconciliationInsights();
  const { insights: subscriptionInsights, isError: subscriptionError } = useBrainSubscriptionInsights();
  const { insights: disputeInsights, isError: disputeError } = useBrainDisputeInsights();
  const { insight: cashFlowInsight, isError: cashFlowError } = useBrainCashFlowInsight();
  const [selectedInsight, setSelectedInsight] = useState<LiveInsight | null>(null);
  const liveInsights: LiveInsight[] = useMemo(
    () => [...reconInsights, ...subscriptionInsights, ...disputeInsights, ...(cashFlowInsight ? [cashFlowInsight] : [])],
    [reconInsights, subscriptionInsights, disputeInsights, cashFlowInsight],
  );

  /* Live brain-core agent proposals (GET /v1/proposals) needing a decision -
     merged into the same "Brain Detected" widget as the live payment queue
     and read-only insights above. */
  const { proposals: liveProposals, isError: liveProposalsError } = useBrainProposals();
  const needsReviewProposals = useMemo(() => liveProposals.filter(isNeedsReview), [liveProposals]);
  /* The proposals Overview actually shows, in the order the tiers render them, so
     the detail modal's Previous/Next walks exactly what's on screen — a pager that
     steps onto a row the user can't see reads as a bug. */
  const tieredProposals = useMemo(() => {
    const withTier = needsReviewProposals.flatMap((p) => {
      const tier = deriveProposalTier(p, { thresholds: tierThresholds });
      return tier ? [{ proposal: p, tier }] : [];
    });
    return TIER_ORDER.flatMap((tier) => withTier.filter((e) => e.tier === tier).map((e) => e.proposal));
  }, [needsReviewProposals, tierThresholds]);
  const [selectedProposal, setSelectedProposal] = useState<BrainProposal | null>(null);

  const cycleRecord = <T extends { id: string | number }>(
    records: T[],
    selected: T | null,
    setSelected: (record: T) => void,
    delta: 1 | -1,
  ) => {
    if (!selected || records.length < 2) return;
    const index = records.findIndex((record) => record.id === selected.id);
    if (index < 0) return;
    setSelected(records[(index + delta + records.length) % records.length]);
  };

  const selectedReviewIndex = selectedReview
    ? liveNeedsReview.findIndex((record) => record.id === selectedReview.id)
    : -1;
  const selectedLiveIntentIndex = selectedLiveIntent
    ? sessionReviews.findIndex((record) => record.id === selectedLiveIntent.id)
    : -1;
  const selectedInsightIndex = selectedInsight
    ? liveInsights.findIndex((record) => record.id === selectedInsight.id)
    : -1;
  const selectedProposalIndex = selectedProposal
    ? tieredProposals.findIndex((record) => record.id === selectedProposal.id)
    : -1;
  const reviewPagerDisabled = selectedReviewIndex < 0 || liveNeedsReview.length < 2;
  const liveIntentPagerDisabled = selectedLiveIntentIndex < 0 || sessionReviews.length < 2;
  const insightPagerDisabled = selectedInsightIndex < 0 || liveInsights.length < 2;
  const proposalPagerDisabled = selectedProposalIndex < 0 || tieredProposals.length < 2;

  const decideProposal = useDecideProposal();

  /* Every row Overview shows, as ONE list. Tier decides which section it lands in
     (proposalTiers.ts); the record's own decisions decide its buttons. The rows
     carry their actions INLINE so an item can be cleared without opening anything —
     that is the whole point of the screen. `View full detail` still opens the same
     sheet as before for anyone who wants the evidence first. */
  /* Same contract as the Decisions timeline: every feed that contributes a row
     must be able to say it failed, or "Nothing needs your review right now"
     becomes a lie told in exactly the conditions where it is most costly. Adding
     a source to overviewRows means adding its error flag here. */
  const overviewUnreachable =
    liveNeedsReviewError ||
    liveProposalsError ||
    reconError ||
    subscriptionError ||
    disputeError ||
    cashFlowError;

  const overviewRows: TierRowModel[] = useMemo(() => {
    const testIdPrefix = "row-overview";

    // Session-scoped intents — title is specific; description is the "Why:".
    const sessionRows: TierRowModel[] = sessionReviews.map((r) => {
      const intentId = r.live ? r.intentId ?? null : null;
      return {
        /* Source-scoped. A session intent and a review-queue PaymentIntent can
           carry the SAME underlying id, and all four sources share one React key
           space and one test-id namespace in this list. */
        id: `session-${String(r.intentId ?? r.id)}`,
        tier: tierForPaymentIntent(),
        title: formatText(r.title),
        subtitle: r.description ? formatText(r.description) : undefined,
        testIdPrefix,
        onOpenDetail: () => setSelectedLiveIntent(r),
        /* No intent id means there is nothing to POST to. The row still opens its
           sheet; it just doesn't offer buttons that would silently do nothing. */
        actions: intentId
          ? [
              {
                id: "approve",
                label: "Approve",
                tone: "approve" as const,
                disabled: approvingIntentId !== null,
                onClick: () => void approveIntent(intentId, false),
              },
              {
                id: "reject",
                label: "Reject",
                tone: "reject" as const,
                disabled: approvingIntentId !== null || rejectIntent.isPending,
                onClick: () => rejectIntent.mutate(intentId),
              },
            ]
          : [],
      };
    });

    // PaymentIntents from the live review queue — title is already specific
    // (e.g. "Quick Pay Solutions scored 1.00 vendor risk…"); rationale is the
    // "Why:" line shown in Inbox.
    const queueBusy = approveLive.isPending || rejectLive.isPending;
    const queueRows: TierRowModel[] = liveNeedsReview.map((p) => ({
      id: `queue-${p.id}`,
      tier: tierForPaymentIntent(),
      title: formatText(p.title),
      subtitle: p.rationale ? formatText(p.rationale) : undefined,
      testIdPrefix,
      onOpenDetail: () => setSelectedReview(p),
      actions: [
        { id: "approve", label: "Approve", tone: "approve" as const, disabled: queueBusy, onClick: () => approveLive.mutate(p.id) },
        { id: "reject", label: "Reject", tone: "reject" as const, disabled: queueBusy, onClick: () => rejectLive.mutate(p.id) },
      ],
    }));

    /* Read-only ledger insights. No actions by design: they have no proposal
       lifecycle and nothing to decide, so a button here would be theatre. */
    const insightRows: TierRowModel[] = liveInsights.map((i) => ({
      id: `insight-${i.id}`,
      tier: tierForReadOnlyInsight(),
      title: formatText(i.title),
      subtitle: i.subtitle ? formatText(i.subtitle) : undefined,
      testIdPrefix,
      onOpenDetail: () => setSelectedInsight(i),
      actions: [],
    }));

    // Brain-core agent proposals (collections, vendor risk, etc.) — narrative is
    // the specific "Why:" text shown in Inbox; agent display name is the category.
    /* Tier comes from each record's own `available_decisions` + `risk_band`
       (proposalTiers.ts), never from its type. A record offering no decision this
       app can submit is dropped rather than shown under a tier that promises an
       action Overview can't deliver. */
    const proposalRows: TierRowModel[] = tieredProposals.flatMap((p) => {
      /* Same thresholds the `tieredProposals` memo used — if these two disagreed,
         a row's heading and its position in the pager would come apart. */
      const tier = deriveProposalTier(p, { thresholds: tierThresholds });
      if (!tier) return [];
      const agentName = AGENT_DISPLAY_NAME[agentKeyForProposalType(p.type)];
      const headerCopy = buildProposalHeaderCopy(p, agentName, formatText);
      /* Exactly the decision set the detail sheet renders, from the same builder.
         A decision brain-core won't accept is shown DISABLED rather than dropped,
         so the row never looks like it offers fewer options than the sheet does. */
      const actions: TierRowAction[] = buildDecisionButtons(
        p.available_decisions,
        p.presentation?.actions ?? null,
      ).map((d) => ({
        id: d.id,
        label: d.label,
        tone: d.tone,
        disabled: !d.writable || decideProposal.isPending,
        title: d.writable ? d.meaning ?? undefined : "Brain core can't accept this decision yet.",
        onClick: () => decideProposal.mutate({ id: p.id, decision: d.id as ProposalDecision }),
      }));
      return [{
        id: `proposal-${p.id}`,
        tier,
        title: headerCopy.title,
        subtitle: `${agentName} Agent`,
        testIdPrefix,
        onOpenDetail: () => setSelectedProposal(p),
        actions,
      }];
    });

    return [...sessionRows, ...queueRows, ...insightRows, ...proposalRows];
  }, [
    liveNeedsReview,
    sessionReviews,
    liveInsights,
    tieredProposals,
    tierThresholds,
    formatText,
    approvingIntentId,
    approveLive.isPending,
    rejectLive.isPending,
    rejectIntent.isPending,
    decideProposal.isPending,
  ]);

  // "Money in all accounts" total from brain-core's Ledger (via the BFF proxy).
  // Falls back to the static figure when brain-core is unreachable/unconfigured.
  const { data: brainAccounts } = useQuery<{ accounts?: { current_balance?: string | null }[] }>({
    queryKey: ["/api/brain/ledger/accounts"],
    retry: false,
  });
  const liveTotal =
    brainAccounts?.accounts && brainAccounts.accounts.length > 0
      ? brainAccounts.accounts.reduce((sum, a) => sum + (a.current_balance != null ? Number(a.current_balance) || 0 : 0), 0)
      : null;
  // No live ledger total → honest placeholder, never a fabricated figure (was "$86,993.42").
  const totalFormatted = liveTotal !== null ? format(liveTotal) : "-";
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
      ? { text: "Connect accounts to see monthly spend.", colorClass: "text-[#6c779d]" }
      : rawText
        ? { text: processedText, colorClass: detectSentimentColor(processedText) }
        : { text: processedText, colorClass: SPENDING_INSIGHT_FALLBACK.colorClass };

  /* Liabilities — outstanding accounts-payable, the same figure and the same
     filter the Ledger's Liabilities view quotes (lib/liabilities.ts owns it so the
     two can't drift). null, rendered "-", when no invoice data is reachable: zero
     would be a claim that nothing is owed. */
  const { data: brainInvoices } = useQuery<{ invoices?: ApInvoiceLike[] }>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const liabilities = liabilitiesTotal(brainInvoices?.invoices ?? null);
  const liabilitiesFormatted = liabilities !== null ? format(liabilities) : "-";
  const liabParts = liabilitiesFormatted.match(/^(.+)\.(\d{2})$/);
  const liabWhole = liabParts ? liabParts[1] : liabilitiesFormatted;
  const liabCents = liabParts ? `.${liabParts[2]}` : "";

  /* Runway — how long the cash lasts at the current net burn.
     Only defined while money is actually going out. A non-negative net flow has no
     burn to divide by, so the card says that in words rather than printing "∞", a
     huge meaningless number, or a figure that silently flips sign. */
  const runway = useMemo(() => {
    if (liveTotal === null || netMonthly === null) return { value: "-", caption: "Connect accounts to see runway." };
    if (netMonthly >= 0) return { value: "-", caption: "No net burn — cash flow is positive." };
    const months = liveTotal / Math.abs(netMonthly);
    if (!Number.isFinite(months) || months < 0) return { value: "-", caption: "Not enough data yet." };
    return { value: `${Math.floor(months)} mo`, caption: "At the current net burn." };
  }, [liveTotal, netMonthly]);

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
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[0] not-italic relative text-[#6c779d] text-[0px]">
                <span className="leading-[24px] text-[20px]">{greeting}{greetingName ? ", " : ""}</span>
                {greetingName && (
                  <span className="leading-[24px] text-[#a8b9f4] text-[20px]">{greetingName}</span>
                )}
                <span className="leading-[24px] text-[20px]">.</span>
              </p>
            </div>
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] not-italic relative text-[#a8b9f4] text-[32px]">
                Here's where your money stands today.
              </p>
            </div>
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">Updated {updatedLabel}</p>
            </div>
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
                caption="Across bank, digital, and agent accounts."
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
                caption={runway.caption}
                testId="card-metric-runway"
              />
              <MetricCard
                label="Liabilities"
                whole={liabWhole}
                cents={liabCents}
                caption="Unpaid bills you still owe."
                onClick={() => navigate("/ledger?tab=cash-flow")}
                testId="card-metric-liabilities"
              />
            </div>

            {/* brain-core's ledger-grounded read, deliberately OUTSIDE the cash-flow
                card. Sat inside it, its month-to-date figure read as a contradiction
                of the card's trailing monthly average rather than a second fact about
                a different period. Both numbers are real; only the framing was wrong. */}
            <p
              className={`[font-family:'Gilroy',sans-serif] font-normal leading-[20px] text-[16px] w-full ${insightLine.colorClass}`}
              data-testid="text-home-cash-insight"
            >
              {insightLine.text}
            </p>

            {/* Divider */}
            <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* The decision queue: ONE single-column list split into Urgent /
                Waiting on you / Insights, with each row's own actions inline.
                Replaces the "Brain Detected" / "Brain Did" two-panel split. */}
            <>
              {overviewUnreachable && overviewRows.length > 0 && (
                <div
                  className="flex items-start gap-[10px] p-[12px] mb-[12px] rounded-[12px] w-full"
                  style={{ background: "rgba(210,3,68,0.08)", border: "1px solid rgba(210,3,68,0.28)" }}
                  data-testid="banner-overview-incomplete"
                >
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#d20344] text-[14px]">
                    Some items couldn’t be loaded, so this list may be incomplete.
                  </p>
                </div>
              )}
              <TierSections
                rows={overviewRows}
                emptyMessage={
                  overviewUnreachable
                    ? "Brain couldn’t load what needs your review. This is a connection problem, not an empty queue."
                    : "Nothing needs your review right now."
                }
              />
            </>

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

      {/* Brain Detected - read-only live Ledger insight (reconciliation/subscription/dispute/cash flow) */}
      <LiveInsightModal
        insight={selectedInsight}
        open={selectedInsight !== null}
        onOpenChange={(o) => { if (!o) setSelectedInsight(null); }}
        onPrev={() => cycleRecord(liveInsights, selectedInsight, setSelectedInsight, -1)}
        onNext={() => cycleRecord(liveInsights, selectedInsight, setSelectedInsight, 1)}
        pagerDisabled={insightPagerDisabled}
      />

      {/* Brain Detected - live brain-core agent proposal */}
      <LiveProposalModal
        proposal={selectedProposal}
        open={selectedProposal !== null}
        onOpenChange={(o) => { if (!o) setSelectedProposal(null); }}
        onPrev={() => cycleRecord(tieredProposals, selectedProposal, setSelectedProposal, -1)}
        onNext={() => cycleRecord(tieredProposals, selectedProposal, setSelectedProposal, 1)}
        hasPrev={!proposalPagerDisabled}
        hasNext={!proposalPagerDisabled}
        position={
          !proposalPagerDisabled
            ? `Proposal ${selectedProposalIndex + 1} of ${tieredProposals.length}`
            : undefined
        }
      />

      {/* Brain Detected - proposal sheet, opened in place */}
      <ProposalDetail
        proposal={selectedReview}
        currentStatus={selectedReview ? (reviewStatuses[selectedReview.id] ?? selectedReview.status) : undefined}
        open={selectedReview !== null}
        onOpenChange={(o) => { if (!o) setSelectedReview(null); }}
        onPrev={() => cycleRecord(liveNeedsReview, selectedReview, setSelectedReview, -1)}
        onNext={() => cycleRecord(liveNeedsReview, selectedReview, setSelectedReview, 1)}
        pagerDisabled={reviewPagerDisabled}
        onAction={handleReviewAction}
        rulePaused={selectedReview ? isRulePaused(selectedReview) : undefined}
        onPauseRule={(p) => { const r = ruleOf(p); if (r) storePauseRule(r.id); }}
        onReviewRule={(p) => {
          setSelectedReview(null);
          openRuleDetail(p.rule?.id, navigate);
        }}
        onAlwaysHandle={(p) => {
          setRuleDraft({
            kind: "automation",
            name: p.counterparty ? `Auto clear ${p.counterparty}` : "Auto clear this payment",
            category: "bill",
            agent: p.agent,
            cap: typeof p.amount === "number" ? Math.ceil(p.amount / 50) * 50 : undefined,
            allowlist: p.counterparty ? [p.counterparty] : [],
          });
          setSelectedReview(null);
          navigate("/ledger?tab=rules&create=1");
        }}
        onReportProblem={(p, report) => {
          const r = ruleOf(p);
          if (!r) return;
          if (report.pause) {
            storeReportProblem(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
            setSelectedReview(null);
            openRuleDetail(r.id, navigate);
          } else {
            storeSendFeedback(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
          }
        }}
      />

      {/* Brain Detected - session-scoped PaymentIntent review (mirrors Inbox) */}
      <ReviewModal
        item={selectedLiveIntent}
        open={selectedLiveIntent !== null}
        onOpenChange={(o) => { if (!o) { setSelectedLiveIntent(null); setLiveRejection(null); } }}
        onConfirm={() => {
          if (selectedLiveIntent?.live && selectedLiveIntent.intentId) void approveIntent(selectedLiveIntent.intentId, true);
          else setSelectedLiveIntent(null);
        }}
        onReject={() => {
          if (selectedLiveIntent?.live && selectedLiveIntent.intentId) {
            // The toast now comes from the mutation's own onSuccess/onError.
            rejectIntent.mutate(selectedLiveIntent.intentId);
          }
          setSelectedLiveIntent(null);
          setLiveRejection(null);
        }}
        onPrev={() => cycleRecord(sessionReviews, selectedLiveIntent, setSelectedLiveIntent, -1)}
        onNext={() => cycleRecord(sessionReviews, selectedLiveIntent, setSelectedLiveIntent, 1)}
        pagerDisabled={liveIntentPagerDisabled}
        busy={approvingIntentId !== null}
        rejection={liveRejection}
      />

    </div>
  );
}
