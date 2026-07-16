import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { INLINE_FIGMA } from "@/assets/inline-figma-icons";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { AddGoalModal, type AddGoalPayload } from "@/components/AddGoalModal";
import { useAuth } from "@/lib/authContext";
import { useCurrency, type CurrencyCode } from "@/lib/currencyContext";
import { useToast } from "@/hooks/use-toast";
import { useBrainReviewQueue } from "@/lib/brainQueue";
import { useBrainAuditRecords } from "@/lib/brainAudit";
import { apiRequest } from "@/lib/queryClient";
import {
  ADOBE_SETTLED,
  COMCAST_SETTLED,
  MERIDIAN_RECEIVABLE_SETTLED,
  GUSTO_RECON_SETTLED,
} from "@/lib/mockProposals";
import { AgentProposalModal, type AgentModalAction } from "@/components/AgentProposalModal";
import {
  useAgentDecisions,
  decideAgentProposal,
  needsReviewList,
  type AgentProposal,
} from "@/lib/agentProposals";
import { AUTO_APPROVED_IDS } from "@/lib/mockAuditRecords";
import { mapApprovalRejection, parseCoreError } from "@/lib/approvalRejections";
import { ProposalDetail, type ProposalAction } from "@/components/ProposalDetail";
import type { Proposal } from "@/lib/proposalTypes";
import { openRuleDetail } from "@/lib/openRuleDetail";
import {
  useRules,
  pauseRule as storePauseRule,
  reportProblem as storeReportProblem,
  sendFeedback as storeSendFeedback,
  setRuleDraft,
} from "@/lib/rulesStore";
import { useReviewStatuses } from "@/lib/reviewStatusStore";

/* Brain Did widget icons (Figma 3839:43693), green circle with checkmark */
const IMG_CHECK_ELLIPSE = INLINE_FIGMA.homeCheckEllipse;
const IMG_CHECK_VECTOR  = INLINE_FIGMA.homeCheckVector;

/* Brain Detected widget icons (Figma 3839:43709), orange circle with "i" */
const IMG_INFO_ELLIPSE = INLINE_FIGMA.homeInfoEllipse;
const IMG_INFO_VEC1    = INLINE_FIGMA.homeInfoVec1;
const IMG_INFO_VEC2    = INLINE_FIGMA.homeInfoVec2;

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

/* Initial four goals matching the original Figma mock-up. New goals
   created via the modal are appended to local state; nothing is
   persisted yet. The wiring will land when brain-core is integrated. */
const SEED_GOALS: GoalRow[] = [
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
     wiring lands. They reset on refresh by design. */
  const [goals, setGoals] = useState<GoalRow[]>(SEED_GOALS);

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
        {goals.map((g) => <GoalProgress key={g.id} goal={g} />)}
      </div>
      <AddGoalModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={handleCreate}
      />
    </div>
  );
};

const GreenCheckIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_CHECK_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[16.65%_12.5%_16.68%_12.5%]">
        <div className="absolute inset-[-7.03%_-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_CHECK_VECTOR} />
        </div>
      </div>
    </div>
  </div>
);

const OrangeInfoIcon = () => (
  <div className="relative rounded-[100px] shrink-0 size-[24px]">
    <div className="absolute left-0 size-[24px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_INFO_ELLIPSE} />
    </div>
    <div className="absolute left-[4px] size-[16px] top-[4px]">
      <div className="absolute inset-[12.5%]">
        <div className="absolute inset-[-6.25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC1} />
        </div>
      </div>
      <div className="absolute inset-[30.18%_46.88%_63.57%_46.88%]">
        <div className="absolute inset-[-25%]">
          <img alt="" className="block max-w-none size-full" src={IMG_INFO_VEC2} />
        </div>
      </div>
    </div>
  </div>
);

type WidgetItem = { id: string; label: string; onClick: () => void };
const ListItem = ({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="flex gap-[8px] items-start p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132] text-left"
  >
    {icon}
    <div className="flex flex-1 flex-col items-start min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#a8b9f4] text-[16px] w-full">{label}</p>
    </div>
  </button>
);

const DEFAULT_VISIBLE = 3;

const SectionWidget = ({
  title,
  items,
  icon,
  testIdPrefix,
  emptyMessage,
}: {
  title: string;
  items: WidgetItem[];
  icon: React.ReactNode;
  testIdPrefix: string;
  emptyMessage?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > DEFAULT_VISIBLE;
  const visible = expanded ? items : items.slice(0, DEFAULT_VISIBLE);
  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{title}</p>
          <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{items.length}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
        {visible.length === 0 ? (
          <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
              {emptyMessage ?? "Nothing here today."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
            {visible.map((item, idx) => (
              <div key={item.id} className="flex flex-col gap-[8px] w-full">
                <ListItem
                  icon={icon}
                  label={item.label}
                  testId={`${testIdPrefix}-${item.id}`}
                  onClick={item.onClick}
                />
                {idx < visible.length - 1 && (
                  <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />
                )}
              </div>
            ))}
          </div>
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            data-testid={`button-${testIdPrefix}-view-more`}
            className="mt-[8px] self-start flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px] transition-colors hover:bg-[#11141b] outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
          >
            <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[13px] whitespace-nowrap">
              {expanded ? "View less" : `View ${items.length - DEFAULT_VISIBLE} more`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

// Shown when brain-core's ledger-grounded recommendation is unavailable.
const SPENDING_INSIGHT_FALLBACK = { text: "$432 less than last month. Nice.", colorClass: "text-[#42bf23]" };

/* ── Insight-text helpers ────────────────────────────────────────────────────────────
   The recommendation string from brain-core often contains raw numbers and
   dates. We post-process it to match the user's chosen formatting: comma-
   separated amounts, locale-aware dates, and color-coded sentiment. */

/** Locale for dates: USD → en-US ("Apr 15, 2025"), EUR → en-GB ("15 Apr 2025"). */
const DATE_LOCALE: Record<CurrencyCode, string> = { USD: "en-US", EUR: "en-GB" };

/** Re-format raw amounts in a sentence like "$432", "$1234.56" or "48000.00 USD"
  into comma-formatted equivalents (respecting the active currency's symbol + FX rate).
  Matches: symbol-prefixed ($/€) OR plain number + currency code (USD/EUR/GBP). */
function formatAmountsInText(text: string, formatFn: (amount: string | number) => string): string {
  // Pattern 1: symbol-prefixed amounts ($123, $1,234.56, -€432)
  const symbolPattern = /(?:\+?-?)(?:\$|€)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/g;
  // Pattern 2: plain number + currency code (48000.00 USD, 1,234.56 EUR)
  const codePattern = /(?:\b\d{1,3}(?:,\d{3})*|\b\d+)(?:\.\d+)?\s*(?:USD|EUR|GBP)\b/g;

  const reformat = (match: string) => {
    const raw = match.replace(/[$,€\s]|USD|EUR|GBP/gi, "");
    const sign = match.startsWith("-") ? "-" : match.startsWith("+") ? "+" : "";
    const num = Number(raw);
    if (!Number.isFinite(num)) return match;
    const formatted = formatFn(num);
    return sign && !formatted.startsWith(sign) ? sign + formatted : formatted;
  };

  return text.replace(symbolPattern, reformat).replace(codePattern, reformat);
}

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

  // Dynamic "last updated" timestamp. Refreshes every 10s
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setLastUpdated(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);
  const updatedLabel = useMemo(() => timeAgo(lastUpdated), [lastUpdated]);
  const { format, currency } = useCurrency();
  const [, navigate] = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);

  /* Record opened directly from a Home widget. The proposal sheet (Brain
     Detected), opened in place, mirroring the Review page surface. (Brain Did
     rows deep-link straight to /audit-log; they carry no Proposal object.) */
  const [selectedReview, setSelectedReview] = useState<Proposal | null>(null);
  const reviewStatuses = useReviewStatuses();

  const rules = useRules();
  const ruleOf = (p: Proposal) =>
    p.rule ? rules.find((r) => r.id === p.rule!.id || r.policyId === p.rule!.policyId) : undefined;
  const isRulePaused = (p: Proposal): boolean => {
    const r = ruleOf(p);
    return r ? !r.active : p.rule ? !p.rule.active : false;
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidateLiveQueue = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/brain/actions"] });
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
    /* selectedReview is only ever set from the LIVE brain-core queue (the seeded
       agent records open AgentProposalModal instead). Always ask core directly,
       never flip a client-side status for a live intent. */
    if (action === "approve") approveLive.mutate(selectedReview.id);
    else if (action === "reject") rejectLive.mutate(selectedReview.id);
    // postpone/verifyFirst have no brain-core equivalent for a live intent. No-op.
  };

  /* Brain Did. Live brain-core audit events + the 4 static auto-approved mock
     proposals (Adobe, Comcast, Meridian, Gusto). Live records come first; the
     static ones fill in regardless of what brain-core returns. De-duped by id
     so a live brain-core event for the same record never produces a duplicate. */
  const { records: liveAuditRecords } = useBrainAuditRecords();
  const brainDidItems: WidgetItem[] = useMemo(() => {
    const seen = new Set<string>();
    const items: WidgetItem[] = [];
    const add = (id: string, label: string, go: () => void) => {
      if (!seen.has(id)) { seen.add(id); items.push({ id, label, onClick: go }); }
    };
    liveAuditRecords
      .filter((r) => r.eventType === "approved" || r.eventType === "auto_approved")
      .forEach((r) => add(r.id, r.summary, () => navigate(`/audit-log?record=${r.id}`)));
    /* Static auto-approved proposals - skip any whose audit id was already
       returned by the live feed (unlikely in demo but correct to de-dupe). */
    const liveAuditIds = new Set(liveAuditRecords.map((r) => r.id));
    const AUTO_APPROVED_PROPOSALS = [ADOBE_SETTLED, COMCAST_SETTLED, MERIDIAN_RECEIVABLE_SETTLED, GUSTO_RECON_SETTLED];
    AUTO_APPROVED_PROPOSALS.forEach((p) => {
      const auditId = p.auditId ?? p.id;
      if (!AUTO_APPROVED_IDS.has(auditId) || liveAuditIds.has(auditId)) return;
      add(auditId, p.pastTenseStatement ?? p.title, () => navigate(`/audit-log?record=${auditId}`));
    });
    return items;
  }, [liveAuditRecords, navigate]);

  /* Brain Detected. What Brain is advising for review. Mirrors the Review
     page: live brain-core PaymentIntents (primary), falling back to the seeded
     agent proposal records when the live queue is empty. Tapping opens the
     matching detail sheet in place. */
  const { proposals: liveNeedsReview } = useBrainReviewQueue();
  const agentDecisions = useAgentDecisions();
  const [homeAgent, setHomeAgent] = useState<AgentProposal | null>(null);
  const handleHomeAgentAction = (action: AgentModalAction, p: AgentProposal) => {
    if (action === "approve") {
      decideAgentProposal(p.id, "approved");
      toast({ title: "Approved", description: p.whatHappensNext.ifApproved });
    } else if (action === "reject") {
      decideAgentProposal(p.id, "rejected");
      toast({ title: "Rejected", description: p.whatHappensNext.ifRejected });
    } else if (action === "acknowledge") {
      decideAgentProposal(p.id, "acknowledged");
      toast({ title: "Acknowledged", description: "Logged. Brain won't re-raise this flag." });
    } else if (action === "undo") {
      decideAgentProposal(p.id, "undone_to_review");
      toast({ title: "Moved back to review", description: `"${p.title}" now needs your decision.` });
    }
    setHomeAgent(null);
  };
  const brainDetectedItems: WidgetItem[] = useMemo(() => {
    if (liveNeedsReview.length > 0) {
      return liveNeedsReview.map((p) => ({
        id: p.id,
        label: p.title,
        onClick: () => setSelectedReview(p),
      }));
    }
    /* Fallback: the seeded agent proposal records still awaiting a decision
       (mirrors ReviewPage's Needs Review list). */
    return needsReviewList(agentDecisions).map((p) => ({
      id: p.id,
      label: p.title,
      onClick: () => setHomeAgent(p),
    }));
  }, [liveNeedsReview, agentDecisions]);

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
  const totalWhole = liveTotal !== null ? format(Math.floor(liveTotal)) : "-";
  const totalCents = liveTotal !== null ? `.${String(Math.round((liveTotal - Math.floor(liveTotal)) * 100)).padStart(2, "0")}` : "";

  // Real ledger-grounded insight from brain-core (via the BFF). Falls back to a
  // static line when brain-core is unreachable/unconfigured.
  const { data: brainRec } = useQuery<{ text?: string }>({
    queryKey: ["/api/brain/recommendation"],
    retry: false,
  });
  /* Post-process the recommendation text: comma-format amounts, locale-format
     dates (USD → US date style, EUR → European), and detect sentiment for color.
     The fallback line is also formatted so static text stays consistent. */
  const rawText = brainRec?.text?.trim() ?? "";
  const processedText = rawText
    ? formatDatesInText(formatAmountsInText(rawText, format), currency)
    : formatAmountsInText(SPENDING_INSIGHT_FALLBACK.text, format);
  const insightLine = rawText
    ? { text: processedText, colorClass: detectSentimentColor(processedText) }
    : { text: processedText, colorClass: SPENDING_INSIGHT_FALLBACK.colorClass };

  // Net cash flow per month from the live Ledger. With only inflows seeded today
  // this reads as positive income; it nets real expenses automatically once money
  // -out transactions land. Falls back to the static figure when unreachable.
  const { data: brainTx } = useQuery<{
    transactions?: { amount?: string; direction?: string; transaction_date?: string }[];
  }>({
    queryKey: ["/api/brain/ledger/transactions"],
    retry: false,
  });
  const netMonthly = netMonthlyCashflow(brainTx?.transactions);
  const cashLabel = netMonthly !== null ? "Net cash flow" : "You're spending about";
  const cashValue =
    netMonthly !== null
      ? `${netMonthly >= 0 ? "+" : "-"}${format(Math.abs(Math.round(netMonthly)))}`
      : format("$7,324");

  // Show onboarding once per signed-in user, on first visit to the home screen.
  const onboardingKey = user ? `brain_onboarding_complete_${user.id}` : null;
  useEffect(() => {
    if (!onboardingKey) {
      setShowOnboarding(false);
      return;
    }
    try {
      const done = localStorage.getItem(onboardingKey);
      setShowOnboarding(!done);
    } catch {
      setShowOnboarding(true);
    }
  }, [onboardingKey]);

  const finishOnboarding = () => {
    if (onboardingKey) {
      try { localStorage.setItem(onboardingKey, "1"); } catch {}
    }
    setShowOnboarding(false);
  };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[0] not-italic relative shrink-0 text-[#6c779d] text-[0px] whitespace-nowrap">
                <span className="leading-[24px] text-[20px]">{greeting}, </span>
                <span className="leading-[24px] text-[#a8b9f4] text-[20px]">{(() => { try { return localStorage.getItem("brain_profile_name") || "ACME Inc."; } catch { return "ACME Inc."; } })()}</span>
                <span className="leading-[24px] text-[20px]">.</span>
              </p>
            </div>
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] not-italic relative shrink-0 text-[#a8b9f4] text-[32px] whitespace-nowrap">
                Here's where your money stands today.
              </p>
            </div>
            <div className="flex items-center relative shrink-0 w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px] whitespace-nowrap">Updated {updatedLabel}</p>
            </div>
          </div>

          {/* Stat cards row */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex gap-[16px] items-stretch relative shrink-0 w-full">
              <div
                className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px] cursor-pointer transition-colors hover:bg-[#11141b] border border-transparent hover:border-[#1d2132]"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/finances?tab=Accounts")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/finances?tab=Accounts"); } }}
              >
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">Money in all accounts</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">{totalWhole}</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">{totalCents}</span>
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-normal leading-[20px] relative shrink-0 text-[#414965] text-[18px] w-full">
                      Across bank, digital, and agent accounts.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0a0c10] flex flex-1 flex-col items-start min-w-px p-[16px] relative rounded-[16px]">
                <div className="flex flex-col gap-[8px] items-start justify-center relative shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[16px] uppercase whitespace-nowrap">{cashLabel}</p>
                  <div className="flex flex-col gap-[8px] items-start not-italic relative shrink-0 w-full">
                    <p className="[font-family:'Gilroy',sans-serif] leading-[0] relative shrink-0 text-[#a8b9f4] text-[0px] w-full">
                      <span className="font-medium leading-[36px] text-[32px]">{cashValue}</span>
                      <span className="font-medium leading-[36px] text-[#6c779d] text-[20px]">/mo</span>
                    </p>
                    <p className={`[font-family:'Gilroy',sans-serif] font-normal leading-[20px] relative shrink-0 text-[18px] w-full ${insightLine.colorClass}`}>
                      {insightLine.text}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px relative shrink-0 w-full" style={{ background: "#1d2132" }} />

            {/* Middle row: Brain Detected (left) + Brain Did (right) */}
            <div className="flex gap-[16px] items-start relative shrink-0 w-full">
              <div className="flex flex-1 min-w-px">
                <SectionWidget
                  title="Brain Detected"
                  items={brainDetectedItems}
                  icon={<OrangeInfoIcon />}
                  testIdPrefix="row-brain-detected"
                  emptyMessage="Brain hasn't detected any items that require your review yet."
                />
              </div>
              <div className="flex flex-1 min-w-px">
                <SectionWidget
                  title="Brain Did"
                  items={brainDidItems}
                  icon={<GreenCheckIcon />}
                  testIdPrefix="row-brain-did"
                  emptyMessage="Brain hasn't taken any actions yet."
                />
              </div>
            </div>

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

      {/* Brain Detected - seeded agent proposal sheet, opened in place */}
      <AgentProposalModal
        proposal={homeAgent}
        open={homeAgent !== null}
        onOpenChange={(o) => { if (!o) setHomeAgent(null); }}
        onAction={handleHomeAgentAction}
        pagerDisabled
      />

      {/* Brain Detected - proposal sheet, opened in place */}
      <ProposalDetail
        proposal={selectedReview}
        currentStatus={selectedReview ? (reviewStatuses[selectedReview.id] ?? selectedReview.status) : undefined}
        open={selectedReview !== null}
        onOpenChange={(o) => { if (!o) setSelectedReview(null); }}
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
          navigate("/rules?create=1");
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
    </div>
  );
}
