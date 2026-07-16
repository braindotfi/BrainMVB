import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";

/* Title case helper, used for all labels platform-wide */
function titleCase(str: string) {
  return str
    .replace(/(^| )&($| )/g, "$1and$2")
    .replace(/\w\S*/g, (txt) => {
      const lower = txt.toLowerCase();
      if (lower === "ap" || lower === "ar") return lower.toUpperCase();
      return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
    });
}
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ReviewModal,
  type ReviewItemType,
} from "@/components/ReviewItems";
import { ProposalDetail, type ProposalAction } from "@/components/ProposalDetail";
import { AgentProposalModal, type AgentModalAction } from "@/components/AgentProposalModal";
import { useAppAlert } from "@/components/AppAlert";
import {
  useAgentDecisions,
  decideAgentProposal,
  needsReviewList,
  autoApprovedList,
  type AgentProposal,
} from "@/lib/agentProposals";
import { openRuleDetail } from "@/lib/openRuleDetail";
import { resolveProposal } from "@/lib/openProposalDetail";
import type { Proposal, ProposalStatus } from "@/lib/proposalTypes";
import { useCurrency } from "@/lib/currencyContext";
import { useIntents, type IntentRecord } from "@/lib/intentsStore";
import { useBrainReviewQueue } from "@/lib/brainQueue";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { mapApprovalRejection, parseCoreError, type ApprovalRejection } from "@/lib/approvalRejections";
import {
  useRules,
  pauseRule as storePauseRule,
  reportProblem as storeReportProblem,
  sendFeedback as storeSendFeedback,
  setRuleDraft,
} from "@/lib/rulesStore";
import { useReviewStatuses, setReviewStatus } from "@/lib/reviewStatusStore";

/* ── Tabs (mirrors the Activity page's segmented control) ─────────────────── */
type ReviewTab = "All" | "Needs Review" | "Approved Automatically";
/* "All" is intentionally hidden for now. Kept in the type/logic so the
   filtering branches still compile and can be re-enabled later. */
const REVIEW_TABS: ReviewTab[] = ["Needs Review", "Approved Automatically"];

/* ── Live brain-core PaymentIntents (real, gated approvals) ──────────────── */
function intentToReview(rec: IntentRecord): ReviewItemType {
  const amountStr = `$${rec.amount.toLocaleString()}`;
  const approvers = rec.requiredApprovers.length > 0 ? rec.requiredApprovers.join(" + ") : "owner + CFO";
  return {
    id: rec.intentId,
    live: true,
    intentId: rec.intentId,
    title: `Approve payment to ${rec.vendor}?`,
    vendor: rec.vendor,
    amount: amountStr,
    due: "Needs approval",
    question: `Should I pay ${rec.vendor} ${amountStr}?`,
    description: `Brain flagged this payment (${rec.invoiceNumber}) and the §6 policy gate flagged it for human sign-off. It is above your auto-pay limit and needs approval from ${approvers} before it can settle.`,
    who: rec.vendor,
    amountFull: amountStr,
    dueBy: "Awaiting approval",
    from: "Brain Smart Account",
    autoLabel: "Always require approval for large payments",
  };
}

/* ── Shared primitives (match Finances/Rules widgets) ────────────────────── */
const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

const WidgetHeader = ({ title, count }: { title: string; count?: number }) => (
  <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
    <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
      {typeof count === "number" && (
        <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
        </div>
      )}
    </div>
  </div>
);

/* ── Pending / verifying proposal row (tappable → opens detail) ──────────── */
const ProposalRow = ({
  proposal,
  status,
  onClick,
  format,
}: {
  proposal: Proposal;
  status: ProposalStatus;
  onClick: () => void;
  format: (a: string | number) => string;
}) => {
  const parked = status === "verifying";
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      data-testid={`row-proposal-${proposal.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <div className="flex items-start gap-[8px] w-full min-w-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate min-w-0">
            {proposal.title}
          </p>
          {proposal.severity === "danger" && (
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] px-[8px] py-[3px] rounded-[22px] whitespace-nowrap shrink-0 bg-[#350011] border border-[rgba(210,3,68,0.2)] text-[#d20344]">
              High Risk
            </span>
          )}
          {proposal.severity === "warning" && (
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] px-[8px] py-[3px] rounded-[22px] whitespace-nowrap shrink-0 bg-[#4a2300] border border-[rgba(255,149,0,0.2)] text-[#ff9400]">
              Elevated
            </span>
          )}
        </div>
        <p className={`[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] truncate w-full ${parked ? "text-[#7631ee]" : "text-[#6c779d]"}`}>
          {parked ? "Verifying with vendor, draft ready for review" : proposal.rowSubtitle}
        </p>
      </div>
      {typeof proposal.amount === "number" && (
        <div className="flex flex-col items-end justify-center relative shrink-0">
          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[24px] text-[#a8b9f4] text-[20px] text-right whitespace-nowrap">
            {format(proposal.amount)}
          </p>
        </div>
      )}
    </div>
  );
};

/* Agent proposal row, the 11 spec records (tappable, AgentProposalModal) */
const AgentRow = ({
  proposal,
  onClick,
  format,
}: {
  proposal: AgentProposal;
  onClick: () => void;
  format: (a: string | number) => string;
}) => {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      data-testid={`row-agent-proposal-${proposal.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <div className="flex items-start gap-[8px] w-full min-w-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate min-w-0">
            {proposal.title}
          </p>
          {proposal.riskLevel === "high" && (
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] px-[8px] py-[3px] rounded-[22px] whitespace-nowrap shrink-0 bg-[#350011] border border-[rgba(210,3,68,0.2)] text-[#d20344]">
              High Risk
            </span>
          )}
          {proposal.riskLevel === "elevated" && (
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] px-[8px] py-[3px] rounded-[22px] whitespace-nowrap shrink-0 bg-[#4a2300] border border-[rgba(255,149,0,0.2)] text-[#ff9400]">
              Elevated
            </span>
          )}
        </div>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] truncate w-full">
          {proposal.agentDisplayName} · {proposal.subtitle}
        </p>
      </div>
      {proposal.amount !== null && (
        <div className="flex flex-col items-end justify-center relative shrink-0">
          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[24px] text-[#a8b9f4] text-[20px] text-right whitespace-nowrap">
            {format(proposal.amount)}
          </p>
        </div>
      )}
    </div>
  );
};

/* ── Page ────────────────────────────────────────────────────────────────── */
export function ReviewPage() {
  const { format } = useCurrency();
  const { intents, markDeclined, setApprovalState } = useIntents();
  const [, navigate] = useLocation();

  /* Status overrides keyed by proposal id, held in the shared reviewStatusStore
     so decisions made here AND on the Home "Brain Detected" widget stay in sync.
     Every transition is user-driven. No setTimeout or auto-settle anywhere. */
  const statuses = useReviewStatuses();
  const [active, setActive] = useState<Proposal | null>(null);
  /* Provenance of the open proposal, captured AT OPEN TIME so an action can't
     be misrouted if list membership changes while the sheet is open: live
     brain-core rows mutate core; deep-linked mock records flip local status. */
  const [activeIsLive, setActiveIsLive] = useState(false);
  // When a proposal is opened via a deep-link that carried a `?from=` return
  // target (e.g. from the Audit Log record popup), dismissing the sheet returns
  // there so that surface re-opens, mirroring the stacked invoice experience.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTab>("Needs Review");

  const statusOf = (p: Proposal): ProposalStatus => statuses[p.id] ?? p.status;
  const setStatus = (id: string, status: ProposalStatus) => setReviewStatus(id, status);

  /* Durable "Needs Review" queue. Live brain-core PaymentIntents awaiting a
     human decision (replaces MOCK_PROPOSALS; see client/src/lib/brainQueue.ts
     for why this fans out to a per-id fetch). brain-core has no client-side
     "executing/verifying/settled" states for these. Approve/reject mutate
     the intent directly and the queue refetches, so there's nothing to hold
     in reviewStatusStore for a live row. */
  const { proposals: liveQueue, isLoading: liveQueueLoading } = useBrainReviewQueue();
  // Exclude intents already tracked by the session-scoped `intentsStore`. Those
  // render in the separate "Needs your approval" widget below (liveReviews) so
  // this durable queue doesn't show the same intent twice.
  const sessionIntentIds = new Set(intents.map((i) => i.intentId));
  const queue = liveQueue.filter((p) => !sessionIntentIds.has(p.id));
  /* Agent proposal records (one per Brain agent, per the proposal-detail-modal
     spec) seed the Needs Review + Approved Automatically tabs. Decisions are
     user-driven via the shared agentProposals decision store (no setTimeout):
     approve / reject / acknowledge drops a record out of the queue; Undo on an
     auto-approved record moves it back into Needs Review. */
  const agentDecisions = useAgentDecisions();
  const agentQueue: AgentProposal[] = needsReviewList(agentDecisions);
  const autoApproved: AgentProposal[] = autoApprovedList(agentDecisions);
  const [activeAgent, setActiveAgent] = useState<AgentProposal | null>(null);

  /* Bottom-right pop-up alerts (replaces plain toasts + center modals) */
  const alert = useAppAlert();

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
    onSuccess: () => { setActive(null); invalidateLiveQueue(); },
    onError: (err) => toast({ title: "Couldn't approve", description: err.message, variant: "destructive" }),
  });
  const rejectLive = useMutation<unknown, Error, string>({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: id, reason: "Declined by operator" });
      return res.json();
    },
    onSuccess: () => { setActive(null); invalidateLiveQueue(); },
    onError: (err) => toast({ title: "Couldn't reject", description: err.message, variant: "destructive" }),
  });

  const handleAction = (action: ProposalAction) => {
    if (!active) return;
    // A live brain-core row. Mutate core immediately, then show bottom-right alert.
    if (activeIsLive) {
      if (action === "approve") {
        alert.approved("Approved", "The payment has been approved and will be processed.", 2_000);
        approveLive.mutate(active.id);
      } else if (action === "reject") {
        alert.rejected("Rejected", "The payment has been rejected.", 2_000);
        rejectLive.mutate(active.id);
      }
      // postpone/verifyFirst have no brain-core equivalent for a live intent. No-op.
      return;
    }
    // Mock / deep-linked proposal. Flip local status, then show alert.
    const next: ProposalStatus =
      action === "approve" ? "executing"
        : action === "reject" ? "rejected"
          : action === "postpone" ? "postponed"
            : "verifying";
    if (action === "approve") {
      alert.approved("Approved", "The payment has been approved and will be processed.", 2_000);
    } else if (action === "reject") {
      alert.rejected("Rejected", "The payment has been rejected.", 2_000);
    } else if (action === "postpone") {
      alert.postponed("Postponed", "The payment has been postponed. You can review it later.", 2_000);
    }
    setStatus(active.id, next);
    setActive(null);
    setReturnTo(null);
  };

  /* Live brain-core PaymentIntents flagged by the §6 gate. Approved intents drop
     out of the queue; awaiting-second-approval ones stay (still need a second sign-off). */
  const liveReviews = intents
    .filter((i) => i.outcome === "confirm" && !i.declined && i.approvalState !== "approved")
    .map(intentToReview);
  const [activeLive, setActiveLive] = useState<ReviewItemType | null>(null);
  const [liveRejection, setLiveRejection] = useState<ApprovalRejection | null>(null);
  const { toast } = useToast();

  const reject = useMutation<unknown, Error, string>({
    mutationFn: async (intentId: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: intentId, reason: "Declined by operator" });
      return res.json();
    },
    onSuccess: (_d, intentId) => markDeclined(intentId),
  });

  /* Approve: ask brain-core to sign the intent off. NO client gate. We always
     call core and react to its answer. Reads the JSON body even on a non-2xx so the
     exact refusal reason surfaces inline. */
  const [approving, setApproving] = useState(false);
  const handleLiveApprove = async () => {
    if (!activeLive?.live || !activeLive.intentId) return;
    const intentId = activeLive.intentId;
    setApproving(true);
    setLiveRejection(null);
    try {
      const res = await fetch(`/api/brain/payment-intents/${intentId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        setLiveRejection(mapApprovalRejection(parseCoreError(body)));
        return;
      }
      const status: string = body?.intent?.status ?? "";
      if (status === "awaiting_second_approval" || status === "pending_approval") {
        setApprovalState(intentId, "awaiting_second");
        alert.approved("Approval recorded. One more needed", "Your approval is in. Brain core still needs a second approver before this can settle.", 2_000);
      } else {
        setApprovalState(intentId, "approved");
        alert.approved("Payment approved", "Brain core accepted the approval. It will settle shortly.", 2_000);
      }
      setActiveLive(null);
    } catch {
      setLiveRejection({
        reason: "network_error",
        title: "Couldn't reach Brain core",
        detail: "The approval didn't go through. Check your connection and try again. Nothing was changed.",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleLiveReject = () => {
    if (activeLive?.live && activeLive.intentId) {
      alert.rejected("Rejected", "The payment has been rejected.", 2_000);
      reject.mutate(activeLive.intentId);
    }
    setActiveLive(null);
    setLiveRejection(null);
  };

  /* Rule state lives in the shared rulesStore so receipts, the review queue, and
     RuleDetail all stay in sync. Pausing / reporting are the only receipt mutations. */
  const rules = useRules();
  const ruleOf = (p: Proposal) =>
    p.rule ? rules.find((r) => r.id === p.rule!.id || r.policyId === p.rule!.policyId) : undefined;
  const pauseRule = (p: Proposal) => {
    const r = ruleOf(p);
    if (r) storePauseRule(r.id);
  };
  const isRulePaused = (p: Proposal): boolean => {
    const r = ruleOf(p);
    return r ? !r.active : p.rule ? !p.rule.active : false;
  };

  /* Related pending items. A paused rule with an open report flags any pending
     proposal it would have auto-cleared, meaning one that falls inside the rule's
     actual scope (same agent, vendor on the rule's allowlist, amount within its
     cap). This is a non-blocking note. It never changes a proposal's status. */
  const pausedRulesWithReports = rules.filter(
    (r) => !r.active && (r.problemReports ?? []).some((pr) => !pr.resolved),
  );
  const relatedRuleFor = (p: Proposal) =>
    pausedRulesWithReports.find(
      (r) =>
        r.agent === p.agent &&
        typeof p.amount === "number" &&
        typeof r.cap === "number" &&
        p.amount <= r.cap &&
        !!p.counterparty &&
        (r.allowlist ?? []).includes(p.counterparty),
    );

  /* Auto-open a record linked from elsewhere:
       /review?proposal=<id>, any proposal by id (from the Audit Log's linked
                               evidence), resolved across every proposal source. */
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const proposalId = params.get("proposal");
    if (proposalId) {
      const target = resolveProposal(proposalId);
      if (target) {
        // Capture any `?from=` return target BEFORE we strip the query, so
        // dismissing the sheet can navigate back there (re-opening that surface).
        setReturnTo(params.get("from"));
        setActiveIsLive(false); // deep-linked mock record. Local status only
        setActive(target);
        navigate("/review", { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  /* Close the proposal sheet. If it was opened from another surface (carrying a
     `?from=` return target), navigate back there so it re-opens. */
  const dismissDetail = () => {
    setActive(null);
    if (returnTo) {
      const dest = returnTo;
      setReturnTo(null);
      navigate(dest, { replace: true });
    }
  };

  /* Open a proposal from within this page (row click). Clears any stale return
     target so a later dismiss doesn't wrongly navigate away. */
  const openLocal = (p: Proposal) => {
    setReturnTo(null);
    setActiveIsLive(true); // only live brain-core queue rows call openLocal
    setActive(p);
  };

  /* Header pager. Cycle (wrap-around) through the active tab's list. */
  const pagerList: Proposal[] | null = !active
    ? null
    : queue.some((p) => p.id === active.id)
      ? queue
      : null;
  const pagerIdx = active && pagerList ? pagerList.findIndex((p) => p.id === active.id) : -1;
  const proposalPagerDisabled = !pagerList || pagerList.length <= 1 || pagerIdx < 0;
  const pageProposal = (dir: 1 | -1) => {
    if (!pagerList || proposalPagerDisabled) return;
    setReturnTo(null);
    setActiveIsLive(true); // pager only cycles the live queue
    setActive(pagerList[(pagerIdx + dir + pagerList.length) % pagerList.length]);
  };

  /* Agent-proposal pager. Cycle within whichever tab list holds the open record. */
  const agentPagerList: AgentProposal[] | null = !activeAgent
    ? null
    : agentQueue.some((p) => p.id === activeAgent.id)
      ? agentQueue
      : autoApproved.some((p) => p.id === activeAgent.id)
        ? autoApproved
        : null;
  const agentPagerIdx = activeAgent && agentPagerList ? agentPagerList.findIndex((p) => p.id === activeAgent.id) : -1;
  const agentPagerDisabled = !agentPagerList || agentPagerList.length <= 1 || agentPagerIdx < 0;
  const pageAgent = (dir: 1 | -1) => {
    if (!agentPagerList || agentPagerDisabled) return;
    setActiveAgent(agentPagerList[(agentPagerIdx + dir + agentPagerList.length) % agentPagerList.length]);
  };

  /* Decide on an agent proposal. User-driven, logged via toast. The modal
     closes and the record drops out of (or returns to) the queue. */
  const handleAgentAction = (action: AgentModalAction, p: AgentProposal) => {
    if (action === "approve") {
      decideAgentProposal(p.id, "approved");
      alert.approved("Approved", p.whatHappensNext.ifApproved, 2_000);
      setActiveAgent(null);
    } else if (action === "reject") {
      decideAgentProposal(p.id, "rejected");
      alert.rejected("Rejected", p.whatHappensNext.ifRejected, 2_000);
      setActiveAgent(null);
    } else if (action === "acknowledge") {
      decideAgentProposal(p.id, "acknowledged");
      alert.success("Acknowledged", "Logged. Brain won't re-raise this flag.", 2_000);
      setActiveAgent(null);
    } else if (action === "undo") {
      decideAgentProposal(p.id, "undone_to_review");
      alert.info("Moved back to review", `"${p.title}" now needs your decision.`, 2_000);
      setActiveAgent(null);
    }
  };

  /* Tab visibility. "All" shows everything. The other tabs filter the view. */
  const showNeedsReview = activeTab === "All" || activeTab === "Needs Review";
  const showApproved = activeTab === "All" || activeTab === "Approved Automatically";

  /* Helper banner (purple). Sits mid-page in "All", but pins to the bottom
     of the page when the "Needs Review" tab is selected. */
  const HelperBanner = () => (
    <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
      <div className="flex flex-1 items-start min-w-px relative">
        <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px]">
          Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Brain proposes. You decide. A separate execution service settles.
        </p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Reviews</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">A few things I need your help on.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">Take a quick look and decide what should happen next.</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Tab bar */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0">
              {REVIEW_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex items-center justify-center px-[16px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                    style={{ background: isActive ? "#4a2300" : "transparent" }}
                    data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, "-")}`}
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

            {/* Live: real brain-core PaymentIntents flagged by §6 (only when present) */}
            {showNeedsReview && liveReviews.length > 0 && (
              <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
                <WidgetHeader title="Needs your approval" count={liveReviews.length} />
                <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                  {liveReviews.map((item) => (
                    <LiveRow key={item.id} item={item} onClick={() => setActiveLive(item)} format={format} />
                  ))}
                </div>
              </div>
            )}

            {/* Needs Review: live brain-core queue first, then the seeded agent records */}
            {showNeedsReview && (
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <WidgetHeader title="Needs Review" count={queue.length + agentQueue.length} />
              <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                {queue.length === 0 && agentQueue.length === 0 && (
                  <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
                    <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                      {liveQueueLoading ? "Checking for anything that needs your attention…" : "Nothing needs your attention right now. Brain is keeping things moving."}
                    </p>
                  </div>
                )}

                {queue.map((p, idx, arr) => (
                  <div key={p.id} className="flex flex-col gap-[8px] w-full">
                    <ProposalRow proposal={p} status={statusOf(p)} onClick={() => openLocal(p)} format={format} />
                    {(() => {
                      const related = relatedRuleFor(p);
                      if (!related) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => openRuleDetail(related.id, navigate)}
                          data-testid={`note-related-rule-${p.id}`}
                          className="flex items-center gap-[8px] mx-[8px] px-[10px] py-[7px] rounded-[8px] text-left transition-colors focus:outline-none focus-visible:ring-2"
                          style={{ backgroundColor: "rgba(210,3,68,0.07)", border: "1px solid rgba(210,3,68,0.25)", ["--tw-ring-color" as string]: "#d20344" }}
                        >
                          <Flag size={13} className="shrink-0" style={{ color: "#d20344" }} />
                          <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[12px] text-[#a8b9f4]">
                            Waiting because you paused <span className="font-semibold">“{titleCase(related.name)}”</span>. Review the rule
                          </span>
                        </button>
                      );
                    })()}
                    {(idx < arr.length - 1 || agentQueue.length > 0) && <Divider />}
                  </div>
                ))}

                {/* Agent proposal records, one per Brain agent (spec-seeded) */}
                {agentQueue.map((p, idx, arr) => (
                  <div key={p.id} className="flex flex-col gap-[8px] w-full">
                    <AgentRow proposal={p} onClick={() => setActiveAgent(p)} format={format} />
                    {idx < arr.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Helper banner, purple. In "All" it sits here. The "Needs Review"
                tab renders it at the very bottom of the page instead. */}
            {activeTab === "All" && <HelperBanner />}

            {/* Approved Automatically: agent records Brain cleared on its own. */}
            {showApproved && (
              <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
                <WidgetHeader title="Approved Automatically" count={autoApproved.length} />
                <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                  {autoApproved.length === 0 && (
                    <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
                      <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                        Nothing was approved automatically recently.
                      </p>
                    </div>
                  )}
                  {autoApproved.map((p, idx, arr) => (
                    <div key={p.id} className="flex flex-col gap-[8px] w-full">
                      <AgentRow proposal={p} onClick={() => setActiveAgent(p)} format={format} />
                      {idx < arr.length - 1 && (
                        <div className="h-px w-full" style={{ background: "#1d2132" }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Helper banner pinned to the BOTTOM of the page on the "Needs Review" tab. */}
            {activeTab === "Needs Review" && <HelperBanner />}

          </div>
        </div>
      </ScrollArea>

      {/* Data-driven proposal sheet. Also renders the auto_handled receipt branch */}
      <ProposalDetail
        proposal={active}
        currentStatus={active ? statusOf(active) : undefined}
        open={active !== null}
        onOpenChange={(o) => { if (!o) dismissDetail(); }}
        onPrev={() => pageProposal(-1)}
        onNext={() => pageProposal(1)}
        pagerDisabled={proposalPagerDisabled}
        onAction={handleAction}
        rulePaused={active ? isRulePaused(active) : undefined}
        onPauseRule={pauseRule}
        onReviewRule={(p) => {
          setActive(null);
          openRuleDetail(p.rule?.id, navigate);
        }}
        onAlwaysHandle={(p) => {
          // Promote a routine proposal into a standing rule: pre-fill the create
          // flow in allowlist mode, then hand off to the Rules page.
          setRuleDraft({
            kind: "automation",
            name: p.counterparty ? `Auto clear ${p.counterparty}` : "Auto clear this payment",
            category: "bill",
            agent: p.agent,
            cap: typeof p.amount === "number" ? Math.ceil(p.amount / 50) * 50 : undefined,
            allowlist: p.counterparty ? [p.counterparty] : [],
          });
          setActive(null);
          navigate("/rules?create=1");
        }}
        onReportProblem={(p, report) => {
          const r = ruleOf(p);
          if (!r) return;
          if (report.pause) {
            // Pause + record, then take the user to the rule to review it.
            storeReportProblem(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
            setActive(null);
            openRuleDetail(r.id, navigate);
          } else {
            // Feedback only. Record but leave the rule running.
            storeSendFeedback(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
          }
        }}
      />

      {/* Agent proposal detail. The spec-driven modal for the 11 agent records */}
      <AgentProposalModal
        proposal={activeAgent}
        open={activeAgent !== null}
        onOpenChange={(o) => { if (!o) setActiveAgent(null); }}
        onAction={handleAgentAction}
        onPrev={() => pageAgent(-1)}
        onNext={() => pageAgent(1)}
        pagerDisabled={agentPagerDisabled}
      />

      {/* Legacy / live approval modal. For a live PaymentIntent, Confirm/Approve
          asks brain-core to sign it off (no client gate); its refusal shows inline. */}
      <ReviewModal
        item={activeLive}
        open={activeLive !== null}
        onOpenChange={(o) => { if (!o) { setActiveLive(null); setLiveRejection(null); } }}
        onConfirm={() => { if (activeLive?.live) { void handleLiveApprove(); } else { setActiveLive(null); } }}
        onReject={handleLiveReject}
        busy={approving}
        rejection={liveRejection}
      />

    </div>
  );
}

/* Row used for both live PaymentIntents and legacy static demo items. */
const LiveRow = ({ item, onClick, format }: { item: ReviewItemType; onClick: () => void; format: (a: string | number) => string }) => (
  <div
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    data-testid={`row-review-${item.id}`}
    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
  >
    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">{item.title}</p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] truncate w-full">
        {item.vendor ? `${item.vendor} · ${item.due}` : item.due}
      </p>
    </div>
    <div className="flex flex-col items-end justify-center relative shrink-0">
      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[24px] text-[#a8b9f4] text-[20px] text-right whitespace-nowrap">{format(item.amount)}</p>
    </div>
  </div>
);
