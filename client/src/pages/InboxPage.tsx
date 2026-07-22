import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ReviewModal, type ReviewItemType } from "@/components/ReviewItems";
import { ProposalDetail, type ProposalAction } from "@/components/ProposalDetail";
import { useAppAlert } from "@/components/AppAlert";
import { openRuleDetail } from "@/lib/openRuleDetail";
import { resolveProposal } from "@/lib/openProposalDetail";
import type { Proposal, ProposalStatus } from "@/lib/proposalTypes";
import { useCurrency } from "@/lib/currencyContext";
import { useIntents } from "@/lib/intentsStore";
import { intentToReview } from "@/lib/intentToReview";
import { useBrainReviewQueue, useBrainAutoApproved } from "@/lib/brainQueue";
import {
  useBrainReconciliationInsights,
  useBrainSubscriptionInsights,
  useBrainDisputeInsights,
  useBrainCashFlowInsight,
  type LiveInsight,
} from "@/lib/brainAgentSurfaces";
import { LiveInsightModal } from "@/components/LiveInsightModal";
import { useBrainProposals, isNeedsReview, type BrainProposal } from "@/lib/brainProposals";
import { LiveProposalModal, LiveProposalRow } from "@/components/AgentProposalModal";
import { useBrainAuditRecords } from "@/lib/brainAudit";
import type { AuditRecord, AuditEventType } from "@/lib/auditTypes";
import { auditEventLabel, auditEventChipClass, isAssistantActivity, isSystemActivity, humanReadableActor } from "@/lib/auditTypes";
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
import infoIcon from "@assets/Icons_1783346130548.png";

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
type InboxTab = "Needs Review" | "Auto-Approved" | "Rejected" | "Rule Changes";
const INBOX_TABS: InboxTab[] = ["Needs Review", "Auto-Approved", "Rejected", "Rule Changes"];

/* Map an audit event type onto its Inbox tab. */
function auditTab(eventType: AuditEventType): InboxTab {
  switch (eventType) {
    case "rejected":
      return "Rejected" as InboxTab;
    case "rule_change":
    case "trust_granted":
    case "trust_revoked":
      return "Rule Changes";
    case "postponed":
    case "flagged":
      return "Needs Review";
    default:
      /* approved / auto_approved — history of things that were cleared. */
      return "Auto-Approved";
  }
}

/* One-line "Why" for an audit-log record: prefer the first lifecycle note
   (real recorded reasoning), fall back to an honest per-type line. */
function auditWhy(r: AuditRecord): string {
  const note = r.lifecycle.find((s) => s.note)?.note;
  if (note) return note;
  switch (r.eventType) {
    case "auto_approved":
      return "Cleared by your standing rules without needing a human decision.";
    case "approved":
      return r.actor && r.actor !== "system" && humanReadableActor(r.actor)
        ? `Approved by ${humanReadableActor(r.actor)} after review.`
        : "Approved after review.";
    case "rejected":
      return "Rejected — this payment was declined and nothing moved.";
    case "postponed":
      return "Postponed — parked for a later decision.";
    case "rule_change":
      return "A standing rule was changed, so Brain's future behavior changes too.";
    case "trust_granted":
      return "Trust was granted, expanding what Brain can clear automatically.";
    case "trust_revoked":
      return "Trust was revoked, narrowing what Brain can clear automatically.";
    case "flagged":
      /* Only genuinely mapped flagged events earn the risk line. An unmapped
         action's summary IS the raw action id (classify()'s honest fallback) —
         repeat that instead of fabricating "didn't fit the usual pattern"
         boilerplate that doesn't describe what happened. */
      return r.subtype && r.summary === r.subtype
        ? `Recorded as ${r.subtype} — flagged by Brain core for review.`
        : "Flagged for attention — Brain saw something that didn't fit the usual pattern.";
    case "system_activity":
      return "Routine system activity — recorded for the audit trail, no decision needed.";
  }
}

/* ── Unified inbox item ───────────────────────────────────────────────────── */
type InboxItem = {
  id: string;
  tab: InboxTab;
  title: string;
  /* Status tag pill */
  tag: string;
  tagClass: string;
  /* One-line description (may carry vendor / rule / audit-id facts) */
  desc: string;
  time: string;
  why: string;
  amountDisplay?: string;
  /* Approve / Reject / Ask Brain why buttons (Needs you tab, decidable records only) */
  actionable: boolean;
  /* Source payloads — exactly one is set; drives tap + button behavior. */
  proposal?: Proposal;
  proposalIsLive?: boolean;
  intent?: ReviewItemType;
  insight?: LiveInsight;
  record?: AuditRecord;
};

const PILL_BASE =
  "inline-flex items-center justify-center px-[10px] py-[4px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[16px] whitespace-nowrap shrink-0 border border-solid";

const TAG_NEEDS_YOU = "bg-[#4a2300] text-[#ff9500] border-[rgba(255,149,0,0.2)]";
const TAG_AUTO = "bg-[#1d2132] text-[#a8b9f4] border-[rgba(168,185,244,0.2)]";
const TAG_APPROVED_BY_YOU = "bg-[#240757] text-[#a88afa] border-[rgba(168,138,250,0.2)]";
const TAG_REJECTED = "bg-[#350011] text-[#d20344] border-[rgba(210,3,68,0.2)]";
const TAG_DETECTED = "bg-[#222737] text-[#6c779d] border-[rgba(108,119,157,0.2)]";

const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

/* ── Card ─────────────────────────────────────────────────────────────────── */
const InboxCard = ({
  item,
  onOpen,
  onApprove,
  onReject,
  busy,
}: {
  item: InboxItem;
  onOpen: (item: InboxItem) => void;
  onApprove?: (item: InboxItem) => void;
  onReject?: (item: InboxItem) => void;
  busy?: boolean;
}) => {
  const rejected = item.tab === "Rejected";
  return (
    <div
      data-testid={`card-inbox-${item.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
      className={`flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer outline-none focus-visible:border-[#1d2132] ${
        rejected ? "border-l-[3px] border-l-[#d20344]" : ""
      }`}
    >
      {/* Left column: title, desc, why, divider, buttons */}
      <div className="flex flex-1 flex-col gap-[4px] items-start justify-center min-w-px">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">
          {item.title}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] truncate w-full">
          {item.desc}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] w-full" data-testid={`why-inbox-${item.id}`}>
          Why: {item.why}
        </p>
        <div className="flex items-center gap-[8px] mt-[12px]" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove?.(item)}
            data-testid={`button-approve-${item.id}`}
            className="flex items-center justify-center h-[24px] w-[104px] px-[20px] py-[10px] rounded-[100px] bg-[#123509] text-[#42bf23] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject?.(item)}
            data-testid={`button-reject-${item.id}`}
            className="flex items-center justify-center h-[24px] w-[104px] px-[20px] py-[10px] rounded-[100px] bg-[#350011] text-[#d20344] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[20px] whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>

      {/* Right column: tag pill */}
      <div className="shrink-0 self-center">
        <span className={`${PILL_BASE} ${item.tagClass}`} data-testid={`tag-inbox-${item.id}`}>
          {item.tag}
        </span>
      </div>
    </div>
  );
};

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function InboxPage() {
  const { format } = useCurrency();
  const { intents, markDeclined, setApprovalState } = useIntents();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const alert = useAppAlert();

  const statuses = useReviewStatuses();
  const [activeTab, setActiveTab] = useState<InboxTab>("Needs Review");

  /* Detail surfaces (all pre-existing components — unchanged). */
  const [active, setActive] = useState<Proposal | null>(null);
  const [activeIsLive, setActiveIsLive] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [activeLive, setActiveLive] = useState<ReviewItemType | null>(null);
  const [liveRejection, setLiveRejection] = useState<ApprovalRejection | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<LiveInsight | null>(null);

  const statusOf = (p: Proposal): ProposalStatus => statuses[p.id] ?? p.status;

  /* ── Data sources (same as the former Review + Activity pages) ─────────── */
  const { proposals: liveQueue, isLoading: liveQueueLoading } = useBrainReviewQueue();
  const sessionIntentIds = new Set(intents.map((i) => i.intentId));
  const queue = liveQueue.filter((p) => !sessionIntentIds.has(p.id));
  const { proposals: liveAutoApproved } = useBrainAutoApproved();

  const { insights: reconInsights } = useBrainReconciliationInsights();
  const { insights: subscriptionInsights } = useBrainSubscriptionInsights();
  const { insights: disputeInsights } = useBrainDisputeInsights();
  const { insight: cashFlowInsight } = useBrainCashFlowInsight();
  const liveInsights: LiveInsight[] = [
    ...reconInsights,
    ...subscriptionInsights,
    ...disputeInsights,
    ...(cashFlowInsight ? [cashFlowInsight] : []),
  ];

  /* Live brain-core agent proposals (GET /v1/proposals - vendor risk, collections,
     treasury, etc.) - a decision lifecycle distinct from the PaymentIntent queue
     above. Merges into the Needs Review tab alongside the existing payment-intent rows. */
  const { proposals: liveProposals } = useBrainProposals();
  const needsReviewProposals = useMemo(() => liveProposals.filter(isNeedsReview), [liveProposals]);
  // ponytail: the auto-approved live-proposal bucket is deferred - the merged
  // read model carries no decider-identity field (no `decided_by`), so there's
  // no honest way to tell an agent decision from a human one here.
  const [selectedProposal, setSelectedProposal] = useState<BrainProposal | null>(null);

  const liveReviews = intents
    .filter((i) => i.outcome === "confirm" && !i.declined && i.approvalState !== "approved")
    .map((r) => intentToReview(r, format));

  const { records: auditRecords } = useBrainAuditRecords();

  /* ── Live approve / reject (durable brain-core queue rows) ─────────────── */
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

  /* ── Session-scoped intent approve / reject (§6-gated) ─────────────────── */
  const rejectIntent = useMutation<unknown, Error, string>({
    mutationFn: async (intentId: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: intentId, reason: "Declined by operator" });
      return res.json();
    },
    onSuccess: (_d, intentId) => markDeclined(intentId),
  });

  const [approvingIntentId, setApprovingIntentId] = useState<string | null>(null);
  const approveIntent = async (intentId: string, surfaceRejection: boolean) => {
    setApprovingIntentId(intentId);
    setLiveRejection(null);
    try {
      const res = await fetch(`/api/brain/payment-intents/${intentId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        const rej = mapApprovalRejection(parseCoreError(body));
        if (surfaceRejection) {
          setLiveRejection(rej);
        } else {
          toast({ title: rej.title, description: rej.detail, variant: "destructive" });
        }
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
      const rej: ApprovalRejection = {
        reason: "network_error",
        title: "Couldn't reach Brain core",
        detail: "The approval didn't go through. Check your connection and try again. Nothing was changed.",
      };
      if (surfaceRejection) setLiveRejection(rej);
      else toast({ title: rej.title, description: rej.detail, variant: "destructive" });
    } finally {
      setApprovingIntentId(null);
    }
  };

  /* ── ProposalDetail action plumbing (same semantics as before) ─────────── */
  const handleAction = (action: ProposalAction) => {
    if (!active) return;
    if (activeIsLive) {
      if (action === "approve") {
        alert.approved("Approved", "The payment has been approved and will be processed.", 2_000);
        approveLive.mutate(active.id);
      } else if (action === "reject") {
        alert.rejected("Rejected", "The payment has been rejected.", 2_000);
        rejectLive.mutate(active.id);
      }
      return;
    }
    const next: ProposalStatus =
      action === "approve" ? "executing"
        : action === "reject" ? "rejected"
          : action === "postpone" ? "postponed"
            : "verifying";
    if (action === "approve") alert.approved("Approved", "The payment has been approved and will be processed.", 2_000);
    else if (action === "reject") alert.rejected("Rejected", "The payment has been rejected.", 2_000);
    else if (action === "postpone") alert.postponed("Postponed", "The payment has been postponed. You can review it later.", 2_000);
    setReviewStatus(active.id, next);
    setActive(null);
    setReturnTo(null);
  };

  /* Rule plumbing for the ProposalDetail sheet. */
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

  /* Deep-link: /inbox?proposal=<id> (also honored on the legacy /review path). */
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const proposalId = params.get("proposal") ?? params.get("receipt");
    if (proposalId) {
      const target = resolveProposal(proposalId);
      if (target) {
        setReturnTo(params.get("from"));
        setActiveIsLive(false);
        setActive(target);
        navigate("/inbox", { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const dismissDetail = () => {
    setActive(null);
    if (returnTo) {
      const dest = returnTo;
      setReturnTo(null);
      navigate(dest, { replace: true });
    }
  };

  /* ── Build the unified item list ───────────────────────────────────────── */
  const items: InboxItem[] = useMemo(() => {
    const out: InboxItem[] = [];
    const seen = new Set<string>();
    const push = (it: InboxItem) => {
      if (seen.has(it.id)) return;
      seen.add(it.id);
      out.push(it);
    };

    /* Needs you: session-scoped §6-gated intents (decidable). */
    for (const item of liveReviews) {
      push({
        id: String(item.id),
        tab: "Needs Review",
        title: item.title,
        tag: "Needs approval",
        tagClass: TAG_NEEDS_YOU,
        desc: item.vendor ? `${item.vendor} · ${item.due}` : item.due,
        time: item.dueBy ?? "",
        why: item.description,
        amountDisplay: item.amount,
        actionable: true,
        intent: item,
      });
    }

    /* Needs you: durable brain-core review queue (decidable). */
    for (const p of queue) {
      push({
        id: p.id,
        tab: "Needs Review",
        title: p.title,
        tag: p.severity === "danger" ? "High risk" : p.severity === "warning" ? "Elevated" : "Needs review",
        tagClass: p.severity === "danger" ? TAG_REJECTED : TAG_NEEDS_YOU,
        desc: p.rowSubtitle,
        time: p.dueLabel ?? "",
        why: p.rationale,
        amountDisplay: typeof p.amount === "number" ? format(p.amount) : p.amountDisplay,
        actionable: true,
        proposal: p,
        proposalIsLive: true,
      });
    }

    /* Needs you: read-only live ledger facts Brain detected (not decidable —
       there is nothing to approve; "Ask Brain why" opens the insight). */
    for (const i of liveInsights) {
      push({
        id: i.id,
        tab: "Needs Review",
        title: i.title,
        tag: i.badge || "Detected",
        tagClass: TAG_DETECTED,
        desc: i.subtitle ?? "Brain noticed this in your ledger.",
        time: "",
        why: i.explanation ?? i.subtitle ?? "Brain surfaced this from live ledger data.",
        actionable: false,
        insight: i,
      });
    }

    /* Auto-approved: live brain-core intents that cleared §6 automatically. */
    for (const p of liveAutoApproved) {
      push({
        id: p.id,
        tab: "Auto-Approved",
        title: p.title,
        tag: "Auto-Approved",
        tagClass: TAG_AUTO,
        desc: p.rowSubtitle,
        time: p.settledMeta ? "" : p.dueLabel ?? "",
        why: p.rationale,
        amountDisplay: typeof p.amount === "number" ? format(p.amount) : p.amountDisplay,
        actionable: false,
        proposal: p,
        proposalIsLive: true,
      });
    }

    /* In-session decisions made on this surface (before core's audit catches up). */
    for (const [id, status] of Object.entries(statuses)) {
      if (status !== "executing" && status !== "executed" && status !== "rejected" && status !== "postponed") continue;
      const p = resolveProposal(id);
      if (!p) continue;
      const approved = status === "executing" || status === "executed";
      push({
        id: `${p.id}--${status}`,
        tab: approved ? "Auto-Approved" : status === "rejected" ? "Rejected" : "Needs Review",
        title: p.title,
        tag: approved ? "Approved by you" : status === "rejected" ? "Rejected by you" : "Postponed",
        tagClass: approved ? TAG_APPROVED_BY_YOU : status === "rejected" ? TAG_REJECTED : TAG_DETECTED,
        desc: p.rowSubtitle,
        time: "Just now",
        why: p.rationale,
        amountDisplay: typeof p.amount === "number" ? format(p.amount) : p.amountDisplay,
        actionable: status === "postponed",
        proposal: p,
        proposalIsLive: false,
      });
    }

    /* Everything from the live audit log (the former Activity feed).
       Assistant activity (wiki.question) is informational — nothing to
       approve or reject — so it stays in the Audit Log only and never
       lands in the actionable Inbox queues. */
    for (const r of auditRecords) {
      /* Assistant activity AND routine system activity (data ingestion,
         background jobs) are informational — nothing to approve or reject —
         so they stay in the Audit Log only, never in Inbox queues. */
      if (isAssistantActivity(r) || isSystemActivity(r)) continue;
      push({
        id: r.id,
        tab: auditTab(r.eventType),
        title: r.summary,
        tag: auditEventLabel(r.eventType),
        tagClass: auditEventChipClass(r.eventType),
        desc: r.rowSubtitle ?? [typeof r.amount === "number" ? format(r.amount) : "", humanReadableActor(r.actor) ?? ""].filter(Boolean).join(" · "),
        time: r.occurredAtLabel,
        why: auditWhy(r),
        amountDisplay: typeof r.amount === "number" ? format(r.amount) : undefined,
        actionable: false,
        record: r,
      });
    }

    return out;
  }, [liveReviews, queue, liveInsights, liveAutoApproved, statuses, auditRecords, format]);

  const counts: Record<InboxTab, number> = useMemo(() => {
    const c: Record<InboxTab, number> = { "Needs Review": 0, "Auto-Approved": 0, "Rejected": 0, "Rule Changes": 0 };
    for (const it of items) c[it.tab] += 1;
    c["Needs Review"] += needsReviewProposals.length;
    return c;
  }, [items, needsReviewProposals]);

  const visible = items.filter((it) => it.tab === activeTab);

  /* ── Tap / button handlers ─────────────────────────────────────────────── */
  const openItem = (item: InboxItem) => {
    if (item.intent) {
      setLiveRejection(null);
      setActiveLive(item.intent);
      return;
    }
    if (item.insight) {
      setSelectedInsight(item.insight);
      return;
    }
    if (item.proposal) {
      setReturnTo(null);
      setActiveIsLive(Boolean(item.proposalIsLive));
      setActive(item.proposal);
      return;
    }
    if (item.record) {
      navigate(`/audit-log?record=${item.record.id}`);
    }
  };

  const approveItem = (item: InboxItem) => {
    if (item.intent?.intentId) {
      alert.approved("Approving…", "Sending your approval to Brain core.", 1_500);
      void approveIntent(item.intent.intentId, false);
      return;
    }
    if (item.proposal && item.proposalIsLive) {
      alert.approved("Approved", "The payment has been approved and will be processed.", 2_000);
      approveLive.mutate(item.proposal.id);
      return;
    }
    if (item.proposal) {
      alert.approved("Approved", "The payment has been approved and will be processed.", 2_000);
      setReviewStatus(item.proposal.id, "executing");
    }
  };

  const rejectItem = (item: InboxItem) => {
    if (item.intent?.intentId) {
      alert.rejected("Rejected", "The payment has been rejected.", 2_000);
      rejectIntent.mutate(item.intent.intentId);
      return;
    }
    if (item.proposal && item.proposalIsLive) {
      alert.rejected("Rejected", "The payment has been rejected.", 2_000);
      rejectLive.mutate(item.proposal.id);
      return;
    }
    if (item.proposal) {
      alert.rejected("Rejected", "The payment has been rejected.", 2_000);
      setReviewStatus(item.proposal.id, "rejected");
    }
  };

  const itemBusy = (item: InboxItem) =>
    (item.intent?.intentId != null && approvingIntentId === item.intent.intentId) ||
    (item.proposal != null && item.proposalIsLive === true && (approveLive.isPending || rejectLive.isPending));

  /* Header pager for the ProposalDetail sheet — cycles the live queue. */
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
    setActiveIsLive(true);
    setActive(pagerList[(pagerIdx + dir + pagerList.length) % pagerList.length]);
  };

  const emptyText =
    activeTab === "Needs Review"
      ? liveQueueLoading
        ? "Checking for anything that needs your attention…"
        : "Nothing needs your attention right now. Brain is keeping things moving."
      : activeTab === "Auto-Approved"
        ? "Nothing was approved automatically recently."
        : activeTab === "Rejected"
          ? "No rejected items yet. Anything you or Brain rejects will appear here."
          : "No rule or trust changes recorded yet.";

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Inbox</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">Everything Brain needs you to see.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">Decisions waiting on you, and everything Brain already handled.</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Tab bar */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap">
              {INBOX_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex items-center justify-center gap-[6px] px-[16px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
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

            {/* Unified list */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{activeTab}</p>
                  <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{counts[activeTab]}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                {counts[activeTab] === 0 ? (
                  <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                    <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                      {emptyText}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                    {visible.map((item, idx) => (
                      <div key={item.id} className="flex flex-col gap-[8px] w-full">
                        <InboxCard
                          item={item}
                          onOpen={openItem}
                          onApprove={approveItem}
                          onReject={rejectItem}
                          busy={itemBusy(item)}
                        />
                        {(idx < visible.length - 1 || (activeTab === "Needs Review" && needsReviewProposals.length > 0)) && <Divider />}
                      </div>
                    ))}
                    {activeTab === "Needs Review" &&
                      needsReviewProposals.map((p, idx) => (
                        <div key={p.id} className="flex flex-col gap-[8px] w-full">
                          <LiveProposalRow proposal={p} onClick={() => setSelectedProposal(p)} />
                          {idx < needsReviewProposals.length - 1 && <Divider />}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Helper banner */}
            {activeTab === "Needs Review" && (
              <div
                className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
                style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
              >
                <img src={infoIcon} alt="info" className="shrink-0 mt-[2px] w-[15px] h-[15px]" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px]">
                  Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Brain proposes. You decide. A separate execution service settles.
                </p>
              </div>
            )}

          </div>
        </div>
      </ScrollArea>

      {/* Existing detail surfaces — unchanged components */}
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
            storeReportProblem(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
            setActive(null);
            openRuleDetail(r.id, navigate);
          } else {
            storeSendFeedback(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
          }
        }}
      />

      <ReviewModal
        item={activeLive}
        open={activeLive !== null}
        onOpenChange={(o) => { if (!o) { setActiveLive(null); setLiveRejection(null); } }}
        onConfirm={() => {
          if (activeLive?.live && activeLive.intentId) void approveIntent(activeLive.intentId, true);
          else setActiveLive(null);
        }}
        onReject={() => {
          if (activeLive?.live && activeLive.intentId) {
            alert.rejected("Rejected", "The payment has been rejected.", 2_000);
            rejectIntent.mutate(activeLive.intentId);
          }
          setActiveLive(null);
          setLiveRejection(null);
        }}
        busy={approvingIntentId !== null}
        rejection={liveRejection}
      />

      <LiveInsightModal
        insight={selectedInsight}
        open={selectedInsight !== null}
        onOpenChange={(o) => { if (!o) setSelectedInsight(null); }}
      />

      {/* Live brain-core agent proposal (vendor risk, collections, treasury, etc.) */}
      <LiveProposalModal
        proposal={selectedProposal}
        open={selectedProposal !== null}
        onOpenChange={(o) => { if (!o) setSelectedProposal(null); }}
      />
    </div>
  );
}
