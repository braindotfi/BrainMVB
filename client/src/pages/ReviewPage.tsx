import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader, Flag } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ReviewModal,
  type ReviewItemType,
} from "@/components/ReviewItems";
import { ProposalDetail, type ProposalAction } from "@/components/ProposalDetail";
import { MOCK_PROPOSALS, ACCOUNT_SUMMARY, AUTO_HANDLED_PROPOSALS } from "@/lib/mockProposals";
import { openRuleDetail } from "@/lib/openRuleDetail";
import { resolveProposal } from "@/lib/openProposalDetail";
import type { Proposal, ProposalStatus } from "@/lib/proposalTypes";
import { useCurrency } from "@/lib/currencyContext";
import { useIntents, type IntentRecord } from "@/lib/intentsStore";
import { apiRequest } from "@/lib/queryClient";
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
/* "All" is intentionally hidden for now — kept in the type/logic so the
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
    description: `Brain proposed this payment (${rec.invoiceNumber}) and the §6 policy gate flagged it for human sign-off — it is above your auto-pay limit and needs approval from ${approvers} before it can settle.`,
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
      {proposal.severity === "danger" && (
        <div className="w-[3px] self-stretch rounded-full bg-[#d20344] shrink-0" />
      )}
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">
          {proposal.title}
        </p>
        <p className={`[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] truncate w-full ${parked ? "text-[#7631ee]" : "text-[#6c779d]"}`}>
          {parked ? "Verifying with vendor — draft ready for review" : proposal.rowSubtitle}
        </p>
      </div>
      {typeof proposal.amount === "number" && (
        <div className="flex flex-col items-end justify-center relative shrink-0">
          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
            {format(proposal.amount)}
          </p>
        </div>
      )}
    </div>
  );
};

/* ── Executing row — HELD confirmation state with manual Cancel / Mark settled ── */
const ExecutingRow = ({
  proposal,
  onCancel,
  onSettle,
  format,
}: {
  proposal: Proposal;
  onCancel: () => void;
  onSettle: () => void;
  format: (a: string | number) => string;
}) => (
  <div
    data-testid={`row-executing-${proposal.id}`}
    className="flex flex-col gap-[10px] p-[12px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-[#1d2132]"
  >
    <div className="flex gap-[12px] items-center w-full">
      {/* static processing affordance — no spin that implies auto-progress */}
      <Loader size={16} className="text-[#7631ee] shrink-0" />
      <div className="flex flex-1 flex-col min-w-px">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[15px] truncate">
          {proposal.title}
        </p>
        <p className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[#7631ee] text-[12px] truncate">
          Sent to execution · {proposal.cancelDeadlineLabel}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px] truncate">
          {proposal.executionLabel}
        </p>
      </div>
      {typeof proposal.amount === "number" && (
        <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[16px] shrink-0">
          {format(proposal.amount)}
        </p>
      )}
    </div>
    <div className="flex gap-[8px] w-full">
      <button
        type="button"
        onClick={onCancel}
        data-testid={`button-cancel-${proposal.id}`}
        className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#414965]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSettle}
        data-testid={`button-settle-${proposal.id}`}
        className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#240757] border border-[rgba(118,49,238,0.3)] hover:bg-[#2e0a6b] transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#7631ee] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
      >
        Mark settled
      </button>
    </div>
  </div>
);

/* ── Collapsed settled/rejected/postponed row ────────────────────────────── */
const SETTLED_META: Record<string, { icon: typeof CheckCircle2; color: string; label: (p: Proposal) => string }> = {
  executed: { icon: CheckCircle2, color: "#42bf23", label: (p) => `Executed · ${p.auditId}` },
  rejected: { icon: XCircle, color: "#d20344", label: () => "Rejected" },
  postponed: { icon: Clock, color: "#6c779d", label: () => "Postponed to tomorrow" },
};

const SettledRow = ({ proposal, status }: { proposal: Proposal; status: ProposalStatus }) => {
  const meta = SETTLED_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <div
      data-testid={`row-settled-${proposal.id}`}
      className="flex gap-[10px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full"
    >
      <Icon size={15} style={{ color: meta.color }} className="shrink-0" />
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px] truncate flex-1 min-w-px">
        {proposal.title}
      </p>
      <p className="[font-family:'JetBrains_Mono',monospace] leading-[16px] text-[12px] shrink-0" style={{ color: meta.color }}>
        {meta.label(proposal)}
      </p>
    </div>
  );
};

/* ── Auto-handled receipt row — already settled under a standing rule.
   Tapping opens the RECORD (not a decision). Green check + past-tense amount. ── */
const AutoHandledRow = ({
  proposal,
  onClick,
  format,
}: {
  proposal: Proposal;
  onClick: () => void;
  format: (a: string | number) => string;
}) => (
  <div
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    data-testid={`row-auto-handled-${proposal.id}`}
    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132]"
  >
    <CheckCircle2 size={16} className="text-[#42bf23] shrink-0" />
    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">
        {proposal.title}
      </p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] truncate w-full text-[#6c779d]">
        {proposal.rowSubtitle}
      </p>
    </div>
    {typeof proposal.amount === "number" && (
      <div className="flex flex-col items-end justify-center relative shrink-0">
        <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
          {format(proposal.amount)}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#42bf23] text-[12px] text-right whitespace-nowrap">
          Paid
        </p>
      </div>
    )}
  </div>
);

/* ── Page ────────────────────────────────────────────────────────────────── */
export function ReviewPage() {
  const { format } = useCurrency();
  const { intents, markDeclined } = useIntents();
  const [, navigate] = useLocation();

  /* Status overrides keyed by proposal id, held in the shared reviewStatusStore
     so decisions made here AND on the Home "Brain Detected" widget stay in sync.
     Every transition is user-driven — no setTimeout / auto-settle anywhere. */
  const statuses = useReviewStatuses();
  const [active, setActive] = useState<Proposal | null>(null);
  // When a proposal is opened via a deep-link that carried a `?from=` return
  // target (e.g. from the Audit Log record popup), dismissing the sheet returns
  // there so that surface re-opens — mirroring the stacked invoice experience.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTab>("Needs Review");

  const statusOf = (p: Proposal): ProposalStatus => statuses[p.id] ?? p.status;
  const setStatus = (id: string, status: ProposalStatus) => setReviewStatus(id, status);

  const pending = MOCK_PROPOSALS.filter((p) => statusOf(p) === "pending");
  const verifying = MOCK_PROPOSALS.filter((p) => statusOf(p) === "verifying");
  const executing = MOCK_PROPOSALS.filter((p) => statusOf(p) === "executing");
  const settled = MOCK_PROPOSALS.filter((p) =>
    ["executed", "rejected", "postponed"].includes(statusOf(p)),
  );
  const queue = [...pending, ...verifying];

  const handleAction = (action: ProposalAction) => {
    if (!active) return;
    const next: ProposalStatus =
      action === "approve" ? "executing"
        : action === "reject" ? "rejected"
          : action === "postpone" ? "postponed"
            : "verifying";
    setStatus(active.id, next);
    setActive(null); // sheet closes on any action
    setReturnTo(null); // an action isn't a "return" close — drop any stale target
  };

  /* Live brain-core PaymentIntents flagged by the §6 gate. */
  const liveReviews = intents.filter((i) => i.outcome === "confirm" && !i.declined).map(intentToReview);
  const [activeLive, setActiveLive] = useState<ReviewItemType | null>(null);
  const reject = useMutation<unknown, Error, string>({
    mutationFn: async (intentId: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: intentId, reason: "Declined by operator" });
      return res.json();
    },
    onSuccess: (_d, intentId) => markDeclined(intentId),
  });
  const handleLiveReject = () => {
    if (activeLive?.live && activeLive.intentId) reject.mutate(activeLive.intentId);
    setActiveLive(null);
  };

  /* Auto-handled receipts — already approved + settled under standing rules.
     Banner count + total are DERIVED from this array so they can never drift. */
  const autoHandled = AUTO_HANDLED_PROPOSALS;
  const autoHandledTotal = autoHandled.reduce((sum, p) => sum + (p.amount ?? 0), 0);

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

  /* Related pending items: a paused rule with an open report flags any pending
     proposal it WOULD have auto-cleared — i.e. one that falls inside the rule's
     actual scope (same agent, vendor on the rule's allowlist, amount within its
     cap). This is a NON-BLOCKING note — it never changes a proposal's status. */
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
       /review?receipt=<id>  — a settled auto-handled receipt (from RuleDetail)
       /review?proposal=<id> — any proposal by id (from the Audit Log's linked
                               evidence), resolved across every proposal source. */
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const receiptId = params.get("receipt");
    if (receiptId) {
      const target = autoHandled.find((p) => p.id === receiptId);
      if (target) {
        // Reset the return target from this deep-link's own `?from=` (usually
        // absent → null), so a stale target from a prior open can't linger.
        setReturnTo(params.get("from"));
        setActive(target);
        navigate("/review", { replace: true });
      }
      return;
    }
    const proposalId = params.get("proposal");
    if (proposalId) {
      const target = resolveProposal(proposalId);
      if (target) {
        // Capture any `?from=` return target BEFORE we strip the query, so
        // dismissing the sheet can navigate back there (re-opening that surface).
        setReturnTo(params.get("from"));
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

  /* Open a proposal from within this page (row click) — clears any stale return
     target so a later dismiss doesn't wrongly navigate away. */
  const openLocal = (p: Proposal) => {
    setReturnTo(null);
    setActive(p);
  };

  /* Header pager — cycle (wrap-around) through the sibling list the open proposal
     belongs to: the Needs Review queue or the Approved Automatically receipts. A
     deep-linked proposal in neither list has no siblings, so the pager disables. */
  const pagerList: Proposal[] | null = !active
    ? null
    : queue.some((p) => p.id === active.id)
      ? queue
      : autoHandled.some((p) => p.id === active.id)
        ? autoHandled
        : null;
  const pagerIdx = active && pagerList ? pagerList.findIndex((p) => p.id === active.id) : -1;
  const proposalPagerDisabled = !pagerList || pagerList.length <= 1 || pagerIdx < 0;
  const pageProposal = (dir: 1 | -1) => {
    if (!pagerList || proposalPagerDisabled) return;
    setReturnTo(null);
    setActive(pagerList[(pagerIdx + dir + pagerList.length) % pagerList.length]);
  };

  /* Tab visibility — "All" shows everything; the other tabs filter the view. */
  const showNeedsReview = activeTab === "All" || activeTab === "Needs Review";
  const showApproved = activeTab === "All" || activeTab === "Approved Automatically";

  /* Helper banner (purple) — sits mid-page in "All", but pins to the bottom
     of the page when the "Needs Review" tab is selected. */
  const HelperBanner = () => (
    <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
      <div className="flex flex-1 items-start min-w-px relative">
        <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px]">
          Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Brain proposes — you decide, and a separate execution service settles.
        </p>
      </div>
    </div>
  );

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Review</p>
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

            {/* Approved automatically today — derived summary (count + total from the array).
                Stays pinned to the top for both "All" and the "Approved Automatically" tab. */}
            {showApproved && (
              <div
                className="flex items-center gap-[10px] px-[12px] py-[10px] rounded-[8px] w-full bg-[#0a0c10] border border-[#1d2132]"
                data-testid="row-auto-handled"
              >
                <CheckCircle2 size={16} className="text-[#42bf23] shrink-0" />
                <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#6c779d] text-[14px] min-w-px">
                  Brain approved{" "}
                  <span className="text-[#a8b9f4] font-semibold">{autoHandled.length} payments automatically</span>{" "}
                  today under a rule you set.
                </p>
                <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[18px] text-[#a8b9f4] text-[14px] shrink-0" data-testid="text-auto-handled-total">
                  {format(autoHandledTotal)}
                </p>
              </div>
            )}

            {/* Live — real brain-core PaymentIntents flagged by §6 (only when present) */}
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

            {/* Needs Review — the data-driven proposal queue */}
            {showNeedsReview && (
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <WidgetHeader title="Needs Review" count={queue.length} />
              <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                {queue.length === 0 && executing.length === 0 && (
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] p-[8px]">
                    Nothing left to review. You're all caught up.
                  </p>
                )}

                {queue.map((p, idx) => (
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
                            Waiting for you because you paused <span className="font-semibold">“{related.name}”</span> — review the rule
                          </span>
                        </button>
                      );
                    })()}
                    {idx < queue.length - 1 && <Divider />}
                  </div>
                ))}

                {/* Executing — held confirmation rows */}
                {executing.map((p) => (
                  <div key={p.id} className="flex flex-col gap-[8px] w-full">
                    {queue.length > 0 && <Divider />}
                    <ExecutingRow
                      proposal={p}
                      onCancel={() => setStatus(p.id, "pending")}
                      onSettle={() => setStatus(p.id, "executed")}
                      format={format}
                    />
                  </div>
                ))}

                {/* Account Totals — pendingAPTotal reconciles from the AP proposals */}
                <Divider />
                <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]" data-testid="row-account-totals">
                  <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">Account Totals</p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                      {format(ACCOUNT_SUMMARY.totalCash)} cash · about {ACCOUNT_SUMMARY.runwayMonths} months runway
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-center relative shrink-0">
                    <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap" data-testid="text-pending-ap">
                      {format(ACCOUNT_SUMMARY.pendingAPTotal)}
                    </p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#414965] text-[12px] whitespace-nowrap">pending AP</p>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Helper banner — purple. In "All" it sits here; the "Needs Review"
                tab renders it at the very bottom of the page instead. */}
            {activeTab === "All" && <HelperBanner />}

            {/* Settled today — collapsed executed/rejected/postponed */}
            {showNeedsReview && settled.length > 0 && (
              <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
                <WidgetHeader title="Settled today" count={settled.length} />
                <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                  {settled.map((p) => (
                    <SettledRow key={p.id} proposal={p} status={statusOf(p)} />
                  ))}
                </div>
              </div>
            )}

            {/* Approved Automatically — settled receipts; tapping a row opens the record */}
            {showApproved && autoHandled.length > 0 && (
              <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
                <WidgetHeader title="Approved Automatically" count={autoHandled.length} />
                <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                  {autoHandled.map((p, idx) => (
                    <div key={p.id} className="flex flex-col gap-[8px] w-full">
                      <AutoHandledRow proposal={p} onClick={() => openLocal(p)} format={format} />
                      {idx < autoHandled.length - 1 && <Divider />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showApproved && autoHandled.length === 0 && (
              <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                  No auto-approved payments yet. Brain will handle them under your standing rules.
                </p>
              </div>
            )}

            {/* Helper banner pinned to the BOTTOM of the page on the "Needs Review" tab. */}
            {activeTab === "Needs Review" && <HelperBanner />}

          </div>
        </div>
      </ScrollArea>

      {/* Data-driven proposal sheet — also renders the auto_handled receipt branch */}
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
            name: p.counterparty ? `Auto-clear ${p.counterparty}` : "Auto-clear this payment",
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
            // Feedback only — record but leave the rule running.
            storeSendFeedback(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
          }
        }}
      />

      {/* Legacy / live approval modal */}
      <ReviewModal
        item={activeLive}
        open={activeLive !== null}
        onOpenChange={(o) => { if (!o) setActiveLive(null); }}
        onConfirm={() => setActiveLive(null)}
        onReject={handleLiveReject}
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
    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">{item.title}</p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] truncate w-full">
        {item.vendor ? `${item.vendor} · ${item.due}` : item.due}
      </p>
    </div>
    <div className="flex flex-col items-end justify-center relative shrink-0">
      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{format(item.amount)}</p>
    </div>
  </div>
);
