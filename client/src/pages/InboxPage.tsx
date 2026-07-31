import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ReviewModal, type ReviewItemType } from "@/components/ReviewItems";
import { ProposalDetail, type ProposalAction } from "@/components/ProposalDetail";
import { useAppAlert } from "@/components/AppAlert";
import { openRuleDetail } from "@/lib/openRuleDetail";
import { resolveProposal } from "@/lib/openProposalDetail";
import type { Proposal, ProposalStatus } from "@/lib/proposalTypes";
import { useCurrency } from "@/lib/useCurrency";
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
import { useBrainProposals, useDecideProposal, isNeedsReview, agentKeyForProposalType, type BrainProposal } from "@/lib/brainProposals";
import {
  isDecidableProposal,
  buildDecisionButtons,
  buildProposalHeaderCopy,
  type DecisionButton,
} from "@/lib/proposalCards";
import { LiveProposalModal, AGENT_DISPLAY_NAME } from "@/components/AgentProposalModal";
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
import { acknowledgeInsight, useAcknowledgedRecords } from "@/lib/acknowledgedStore";
import { TierRow, type TierRowModel, type TierRowAction } from "@/components/TierRowList";
import {
  applyDecisionFilters,
  buildSearchText,
  decisionTypeLabel,
  hasActiveFilter,
  typeOptions,
  EMPTY_FILTERS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type DecisionFacets,
  type DecisionFilterState,
  type DecisionStatus,
  type RowTier,
} from "@/lib/decisionFilters";
import {
  deriveProposalTier,
  thresholdsFromRules,
  tierForPaymentIntent,
  tierForReadOnlyInsight,
} from "@/lib/proposalTiers";
import { useBrainPolicy } from "@/lib/brainPolicy";
import {
  bulkCandidateFrom,
  bulkLimitFor,
  elevatedThresholdsFromPolicy,
  isBlockedByType,
  isBulkEligible,
  resolveBulkSelection,
  runBulkApprove,
  type BulkCandidate,
} from "@/lib/bulkApprove";

/* ── Audit records → timeline facets ──────────────────────────────────────────
   The six tabs are gone. Where a tab used to answer "which list does this belong
   in", the row now carries independent facets and the toolbar filters on them.
   The old tab mapping collapsed distinctions the filters need to keep apart —
   `acknowledged` was filed under "Auto-Approved", for instance, which is not what
   happened to it. */

/** Is this record settled history, or does it still want attention? */
function auditTier(eventType: AuditEventType): RowTier {
  /* Postponed and flagged are unfinished business: parked or singled out, but not
     decided. They keep their place in the attention tiers even though this surface
     offers no button for them — the detail sheet is where they get resolved. */
  return eventType === "postponed" || eventType === "flagged" ? "waiting" : "decided";
}

function auditStatus(eventType: AuditEventType): DecisionStatus {
  switch (eventType) {
    case "rejected":
      return "declined";
    case "approved":
      return "approved";
    case "auto_approved":
      return "auto-approved";
    case "acknowledged":
    case "system_activity":
      return "informational";
    case "rule_change":
    case "trust_granted":
    case "trust_revoked":
      /* A rule change is a change that took effect, so it reads as approved —
         which is also how the prototype files it. */
      return "approved";
    case "postponed":
    case "flagged":
      return "pending";
  }
}

/**
 * The record's type facet.
 *
 * Audit records carry no proposal type — `subtype` is brain-core's raw action
 * string (e.g. `payment_intent.approved`), not a type key. Rule and trust events
 * are unambiguous; for everything else we look for a known type token in the raw
 * action and fall back to `payment`, which is what the audit feed is built from
 * (`brainAudit.ts` maps the payment-intent lifecycle). The fallback is a stated
 * assumption, not a guess dressed up as data — if core starts emitting other
 * lifecycles the token match picks them up.
 */
const AUDIT_TYPE_TOKENS = ["collections", "treasury", "fraud", "compliance", "subscription", "dispute", "reconciliation", "vendor_risk"] as const;

function auditDecisionType(r: AuditRecord): string {
  if (r.eventType === "rule_change" || r.eventType === "trust_granted" || r.eventType === "trust_revoked") return "rule";
  const raw = (r.subtype ?? "").toLowerCase();
  return AUDIT_TYPE_TOKENS.find((t) => raw.includes(t)) ?? "payment";
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
      return "Rejected: this payment was declined and nothing moved.";
    case "acknowledged":
      return "Acknowledged from the Inbox; no payment was initiated.";
    case "postponed":
      return "Postponed: parked for a later decision.";
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
        ? `Recorded as ${r.subtype}, flagged by Brain for review.`
        : "Flagged for attention. Brain saw something that didn't fit the usual pattern.";
    case "system_activity":
      return "Routine system activity, recorded for the audit trail. No decision needed.";
  }
}

/* ── Unified timeline item ────────────────────────────────────────────────── */
type InboxItem = DecisionFacets & {
  id: string;
  title: string;
  /* Status tag pill */
  tag: string;
  tagClass: string;
  /* One-line description (may carry vendor / rule / audit-id facts) */
  desc: string;
  time: string;
  /* "Why:" line — only real recorded reasoning; omitted (honest omission) when
     the source record carries no rationale. */
  why?: string;
  /* "proposal" items are decidable (Approve/Reject); "detection" items are
     ledger-derived observations — nothing is proposed, no decision buttons. */
  kind: "proposal" | "detection";
  amountDisplay?: string;
  /* Approve / Reject / Ask Brain why buttons (Needs you tab, decidable records only) */
  actionable: boolean;
  /* Source payloads — exactly one is set; drives tap + button behavior. */
  proposal?: Proposal;
  proposalIsLive?: boolean;
  intent?: ReviewItemType;
  insight?: LiveInsight;
  record?: AuditRecord;
  liveAgentProposal?: BrainProposal;
  /* Decisions brain-core will actually accept for this row. Row buttons are
     driven by this, never by a hardcoded Approve/Reject pair — a notify-only
     compliance or fraud finding offers `acknowledge` ONLY, and firing approve
     at it is a write the API rejects. */
  liveDecisions?: DecisionButton[];
  /* Core offers acknowledge and nothing else: render a single Acknowledge button
     instead of an Approve/Decline pair the API would reject. */
  acknowledgeOnly?: boolean;
};

const TAG_NEEDS_YOU = "bg-[#4a2300] text-[#ff9500] border-[rgba(255,149,0,0.2)]";
const TAG_AUTO = "bg-[#1d2132] text-[#a8b9f4] border-[rgba(168,185,244,0.2)]";
const TAG_APPROVED_BY_YOU = "bg-[#240757] text-[#a88afa] border-[rgba(168,138,250,0.2)]";
const TAG_REJECTED = "bg-[#350011] text-[#d20344] border-[rgba(210,3,68,0.2)]";
const TAG_DETECTED = "bg-[#222737] text-[#6c779d] border-[rgba(108,119,157,0.2)]";

/* Toolbar control. One class for selects and the search box so the four sit on a
   single visual line regardless of which wraps. */
const CONTROL =
  "w-full min-w-0 bg-[#06070a] border border-solid border-[#1d2132] rounded-[10px] px-[12px] py-[9px] [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[18px] text-[#a8b9f4] outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] placeholder:text-[#414965]";

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function InboxPage() {
  const { format, formatText } = useCurrency();
  const { intents, markDeclined, setApprovalState } = useIntents();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const alert = useAppAlert();

  const statuses = useReviewStatuses();
  const [filters, setFilters] = useState<DecisionFilterState>(EMPTY_FILTERS);
  const setFilter = <K extends keyof DecisionFilterState>(key: K, value: DecisionFilterState[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  /* Detail surfaces (all pre-existing components — unchanged). */
  const [active, setActive] = useState<Proposal | null>(null);
  const [activeIsLive, setActiveIsLive] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [activeLive, setActiveLive] = useState<ReviewItemType | null>(null);
  const [liveRejection, setLiveRejection] = useState<ApprovalRejection | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<LiveInsight | null>(null);
  const [pendingAcknowledgedIds, setPendingAcknowledgedIds] = useState<Set<string>>(() => new Set());

  const statusOf = (p: Proposal): ProposalStatus => statuses[p.id] ?? p.status;

  /* ── Data sources (same as the former Review + Activity pages) ─────────── */
  const { proposals: liveQueue, isLoading: liveQueueLoading, isError: liveQueueError } = useBrainReviewQueue();
  const sessionIntentIds = new Set(intents.map((i) => i.intentId));
  const queue = liveQueue.filter((p) => !sessionIntentIds.has(p.id));
  const { proposals: liveAutoApproved, isError: liveAutoApprovedError } = useBrainAutoApproved();

  const { insights: reconInsights, isError: reconError } = useBrainReconciliationInsights();
  const { insights: subscriptionInsights, isError: subscriptionError } = useBrainSubscriptionInsights();
  const { insights: disputeInsights, isError: disputeError } = useBrainDisputeInsights();
  const { insight: cashFlowInsight, isError: cashFlowError } = useBrainCashFlowInsight();
  const liveInsights: LiveInsight[] = [
    ...reconInsights,
    ...subscriptionInsights,
    ...disputeInsights,
    ...(cashFlowInsight ? [cashFlowInsight] : []),
  ];
  const acknowledgedRecords = useAcknowledgedRecords();
  const acknowledgedIds = useMemo(
    () => new Set(acknowledgedRecords.map((record) => record.id.replace("local-acknowledged-", ""))),
    [acknowledgedRecords],
  );
  const visibleLiveInsights = liveInsights.filter((insight) => !acknowledgedIds.has(insight.id));

  /* Live brain-core agent proposals (GET /v1/proposals - vendor risk, collections,
     treasury, etc.) - a decision lifecycle distinct from the PaymentIntent queue
     above. Merges into the Needs Review tab alongside the existing payment-intent rows. */
  const { proposals: liveProposals, isError: liveProposalsError } = useBrainProposals();
  /* Decidable agent proposals only — but decidability is now read from the
     record's own `available_decisions`, not from `mode`.
     
     The old rule dropped every notify_only record here, which stranded the types
     brain-core's read model promoted into this queue: a compliance finding and a
     fraud hold are notify_only YET carry a real `acknowledge` decision a human has
     to record. They appeared in the Audit Log with no way to act on them. Rows
     with no writable decision are still informational and still stay out. */
  const needsReviewProposals = useMemo(
    () => liveProposals.filter((p) => isNeedsReview(p) && isDecidableProposal(p)),
    [liveProposals],
  );
  const decideProposal = useDecideProposal();
  // ponytail: the auto-approved live-proposal bucket is deferred - the merged
  // read model carries no decider-identity field (no `decided_by`), so there's
  // no honest way to tell an agent decision from a human one here.
  const [selectedProposal, setSelectedProposal] = useState<BrainProposal | null>(null);

  const liveReviews = intents
    .filter((i) => i.outcome === "confirm" && !i.declined && i.approvalState !== "approved")
    .map((r) => intentToReview(r, format));

  const { records: auditRecords, isError: auditError } = useBrainAuditRecords();

  /* ── Live approve / reject (durable brain-core queue rows) ─────────────── */
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

  const acknowledgeItem = (item: InboxItem) => {
    /* An acknowledge-only live proposal (compliance finding, fraud hold) is a real
       brain-core decision, not the local insight store. */
    if (item.liveAgentProposal) {
      if (!item.liveDecisions?.some((d) => d.id === "acknowledge" && d.writable)) return;
      decideProposal.mutate({ id: item.liveAgentProposal.id, decision: "acknowledge" });
      return;
    }
    if (item.kind !== "detection" || !item.insight) return;
    if (pendingAcknowledgedIds.has(item.id) || acknowledgedIds.has(item.id)) return;
    setPendingAcknowledgedIds((current) => new Set(current).add(item.id));
    window.setTimeout(() => {
      acknowledgeInsight(item.insight!);
      setPendingAcknowledgedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }, 250);
  };

  /* Rule plumbing for the ProposalDetail sheet — and the tenant's own configured
     limits, which decide whether an `elevated` proposal is material enough to be
     Urgent. No rules configured means no promotion, never an invented default. */
  const rules = useRules();
  const thresholds = useMemo(() => thresholdsFromRules(rules), [rules]);
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
        kind: "proposal",
        tier: tierForPaymentIntent(),
        status: "pending",
        type: "payment",
        search: buildSearchText(item.title, item.vendor, item.due, item.amount),
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
        kind: "proposal",
        tier: tierForPaymentIntent(),
        status: "pending",
        type: "payment",
        search: buildSearchText(p.title, p.rowSubtitle, p.amountDisplay),
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

    /* Needs you: live brain-core agent proposals (collections, treasury, cash
       forecast, etc. — GET /v1/proposals via the BFF). The tag carries the
       originating agent's identity; the "Why:" line is the agent's own
       narrative — omitted when the record carries none (honest omission). */
    for (const p of needsReviewProposals) {
      const agentKey = agentKeyForProposalType(p.type);
      const agentName = p.agent?.display_name || AGENT_DISPLAY_NAME[agentKey];
      const isPaymentAgent = agentKey === "payment" || /^(?:demo\s+)?payment agent$/i.test(agentName.trim());
      const pillName = isPaymentAgent ? "Payment" : agentName;
      const decisions = buildDecisionButtons(p.available_decisions);
      const headerCopy = buildProposalHeaderCopy(p, agentName, formatText);
      push({
        id: p.id,
        kind: "proposal",
        /* Tier is the record's own, derived from available_decisions + materiality
           — the same call Overview makes, so a row cannot be Urgent on one surface
           and Waiting on the other. */
        tier: deriveProposalTier(p, { thresholds }) ?? "waiting",
        status: "pending",
        type: p.type ?? "payment",
        search: buildSearchText(headerCopy.title, headerCopy.text, agentName, p.type),
        title: headerCopy.title,
        tag: pillName,
        tagClass: TAG_NEEDS_YOU,
        desc: headerCopy.text,
        time: "",
        /* Approve/Decline only when core actually offers them. */
        actionable: decisions.some((d) => d.writable && (d.id === "approve" || d.id === "reject")),
        liveAgentProposal: p,
        liveDecisions: decisions,
        acknowledgeOnly:
          decisions.some((d) => d.id === "acknowledge" && d.writable) &&
          !decisions.some((d) => d.id === "approve" || d.id === "reject"),
      });
    }

    /* Needs you: read-only live ledger facts Brain detected (not decidable —
       there is nothing to approve; "Ask Brain why" opens the insight). */
    for (const i of visibleLiveInsights) {
      push({
        id: i.id,
        kind: "detection",
        tier: tierForReadOnlyInsight(),
        status: "informational",
        type: i.kind,
        search: buildSearchText(i.title, i.subtitle, i.badge, i.explanation),
        title: i.title,
        tag: i.badge || "Detected",
        tagClass: TAG_DETECTED,
        desc: i.subtitle ?? "Brain noticed this in your ledger.",
        time: "",
        /* Only real recorded reasoning — never echo the subtitle as "Why". */
        why: i.explanation,
        actionable: false,
        insight: i,
      });
    }

    /* Auto-approved: live brain-core intents that cleared §6 automatically. */
    for (const p of liveAutoApproved) {
      push({
        id: p.id,
        kind: "proposal",
        tier: "decided",
        status: "auto-approved",
        type: "payment",
        search: buildSearchText(p.title, p.rowSubtitle, p.amountDisplay),
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
        kind: "proposal",
        /* Postponed is parked, not settled — it stays in the attention tiers. */
        tier: status === "postponed" ? "waiting" : "decided",
        status: approved ? "approved" : status === "rejected" ? "declined" : "pending",
        type: p.agent ?? "payment",
        search: buildSearchText(p.title, p.rowSubtitle, p.amountDisplay, p.agent),
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
        kind: "proposal",
        tier: auditTier(r.eventType),
        status: auditStatus(r.eventType),
        type: auditDecisionType(r),
        search: buildSearchText(r.summary, r.rowSubtitle, humanReadableActor(r.actor), r.occurredAtLabel),
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
  }, [liveReviews, queue, needsReviewProposals, visibleLiveInsights, liveAutoApproved, statuses, auditRecords, format, formatText, thresholds]);

  /* EVERY feed that contributes a row, not just the obvious ones. If any of them
     failed, this timeline is incomplete and must not be presented as an
     all-clear: each hook reads `data?.x ?? []` with `retry: false`, so an
     unreachable core produces exactly the same empty array as a genuinely clear
     queue. On an approvals surface those two states have opposite meanings —
     one says "nothing to do", the other says "you cannot see what you owe".
     Adding a source to `items` below means adding its error flag here. */
  const decisionsUnreachable =
    liveQueueError ||
    liveProposalsError ||
    auditError ||
    liveAutoApprovedError ||
    reconError ||
    subscriptionError ||
    disputeError ||
    cashFlowError;

  const visibleItems = useMemo(() => applyDecisionFilters(items, filters), [items, filters]);
  const availableTypes = useMemo(() => typeOptions(items), [items]);
  const filtering = hasActiveFilter(filters);

  /* ── Bulk approve ───────────────────────────────────────────────────────────
     A checkbox appears only on rows a batch may legally cover. `bulkApprove.ts`
     owns that rule and, importantly, the reasoning for WHICH threshold it reads —
     the tenant's second-approver line, not the auto-approve line, because an item
     under the auto-approve line that is still sitting in the queue is one that
     FAILED that clause.

     Note what happens when the policy cannot be read: `facts` is undefined, every
     limit resolves to null, and no row is selectable — not even one covered by a
     rule the tenant wrote, because a rule cap may only tighten a policy line, never
     stand in for one. That is deliberate. An approval shortcut offered on the
     strength of a limit we could not load is the same failure as an empty queue
     that is really a failed fetch — it just costs more when it is wrong. */
  const policy = useBrainPolicy();
  const policyElevation = useMemo(() => elevatedThresholdsFromPolicy(policy.facts), [policy.facts]);

  const candidates = useMemo<BulkCandidate[]>(
    () =>
      visibleItems.map((item) => {
        const proposal = item.liveAgentProposal;
        /* Only an `approve` core actually offered for THIS record counts. An
           acknowledge-only finding is not batch material — the write is rejected. */
        const approvable =
          item.actionable && (item.liveDecisions?.some((d) => d.id === "approve" && d.writable) ?? false);
        return proposal
          ? bulkCandidateFrom(item.id, proposal, approvable)
          : { id: item.id, type: null, category: null, amount: null, approvable: false };
      }),
    [visibleItems],
  );

  const limitOf = useMemo(
    () => (c: BulkCandidate) => bulkLimitFor(c.type, c.category, policyElevation, thresholds),
    [policyElevation, thresholds],
  );
  const eligible = useMemo(() => candidates.filter((c) => isBulkEligible(c, limitOf(c))), [candidates, limitOf]);
  const candidateById = useMemo(() => new Map(eligible.map((c) => [c.id, c])), [eligible]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const selection = useMemo(
    () => resolveBulkSelection(eligible, selectedIds, limitOf),
    [eligible, selectedIds, limitOf],
  );

  /* Checked state comes from the RESOLVED batch rather than the raw id set. The
     two differ only when something has put an out-of-scope id in the set, and in
     that case the row must not render as checked: a tick mark on a row the bulk bar
     is not counting and "approve selected" will not touch is a promise the surface
     cannot keep. */
  const batchIds = useMemo(() => new Set(selection.ids), [selection.ids]);

  /* Row id → the proposal id the approve endpoint takes. They are not always the
     same string, and sending the row id would 404 against core. */
  const proposalIdOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of visibleItems) if (item.liveAgentProposal) map.set(item.id, item.liveAgentProposal.id);
    return map;
  }, [visibleItems]);

  const toggleSelect = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectionLabel = selection.type ? decisionTypeLabel(selection.type).toLowerCase() : "";

  const approveSelected = async () => {
    if (selection.count < 2 || bulkRunning) return;
    setBulkRunning(true);
    const attempted = [...selection.ids];
    const outcome = await runBulkApprove(attempted, async (rowId) => {
      const proposalId = proposalIdOf.get(rowId);
      if (!proposalId) throw new Error("This item is no longer on screen.");
      await decideProposal.mutateAsync({ id: proposalId, decision: "approve" });
    });
    /* Clear only what actually went through. A failed item stays selected so the
       user can retry it without hunting for it again. */
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of outcome.approved) next.delete(id);
      return next;
    });
    setBulkRunning(false);

    /* Say exactly what happened. "Approved 6" when four went through is the same
       class of untruth as a wrongly-empty queue. */
    if (outcome.failed.length === 0) {
      toast({
        title: `Approved ${outcome.approved.length} ${selectionLabel} items`,
        description: "Each one was approved individually and recorded in the audit log.",
      });
    } else if (outcome.approved.length === 0) {
      toast({
        title: "Nothing was approved",
        description: outcome.failed[0].message,
        variant: "destructive",
      });
    } else {
      toast({
        title: `Approved ${outcome.approved.length} of ${attempted.length}`,
        description: `${outcome.failed.length} couldn\u2019t be approved and ${outcome.failed.length === 1 ? "is" : "are"} still selected. ${outcome.failed[0].message}`,
        variant: "destructive",
      });
    }
  };

  /* Proposal queue behind the card's Previous / Next, in the order the rows are
     listed so paging matches what the user just scrolled past. Only live
     proposals participate — the other row kinds open different modals. */
  const pagedProposals = visibleItems
    .map((it) => it.liveAgentProposal)
    .filter((p): p is BrainProposal => p != null);
  const pagedIndex = selectedProposal
    ? pagedProposals.findIndex((p) => p.id === selectedProposal.id)
    : -1;
  const canPage = pagedIndex >= 0 && pagedProposals.length > 1;
  const stepProposal = (delta: number) => {
    const next = pagedProposals[pagedIndex + delta];
    if (next) setSelectedProposal(next);
  };

  /* ── Tap / button handlers ─────────────────────────────────────────────── */
  const openItem = (item: InboxItem) => {
    if (item.liveAgentProposal) {
      setSelectedProposal(item.liveAgentProposal);
      return;
    }
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
    if (item.liveAgentProposal) {
      // Never send a decision core did not offer for this proposal.
      if (!item.liveDecisions?.some((d) => d.id === "approve" && d.writable)) return;
      decideProposal.mutate({ id: item.liveAgentProposal.id, decision: "approve" });
      return;
    }
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
    if (item.liveAgentProposal) {
      if (!item.liveDecisions?.some((d) => d.id === "reject" && d.writable)) return;
      decideProposal.mutate({ id: item.liveAgentProposal.id, decision: "reject" });
      return;
    }
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
    (item.proposal != null && item.proposalIsLive === true && (approveLive.isPending || rejectLive.isPending)) ||
    (item.liveAgentProposal != null && decideProposal.isPending);

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

  /* One timeline row from a unified item.
     Actions come from what the record can actually accept, never a hardcoded
     Approve/Decline pair — a notify-only finding offers `acknowledge` and nothing
     else, and firing approve at it is a write brain-core rejects. */
  const toRow = (item: InboxItem): TierRowModel => {
    const busy = itemBusy(item);
    const actions: TierRowAction[] = [];
    if (item.actionable) {
      actions.push({ id: "approve", label: "Approve", tone: "approve", disabled: busy, onClick: () => approveItem(item) });
      actions.push({ id: "reject", label: "Decline", tone: "reject", disabled: busy, onClick: () => rejectItem(item) });
    } else if (item.kind === "detection" || item.acknowledgeOnly) {
      const done = pendingAcknowledgedIds.has(item.id);
      actions.push({
        id: "acknowledge",
        label: done ? "Acknowledged" : "Acknowledge",
        tone: "acknowledge",
        disabled: done || busy,
        onClick: () => acknowledgeItem(item),
      });
    }

    /* Second line: real recorded reasoning when the record carries it, otherwise
       its own description. Both are backend prose carrying raw amounts, so both
       go through formatText. */
    const detail = item.liveAgentProposal
      ? item.desc
      : item.why
        ? `Why: ${formatText(item.why)}`
        : item.desc
          ? formatText(item.desc)
          : "";

    /* Checkbox only where a batch may legally reach. Rows of another type stay
       visible but disabled while a batch is open — bulk approval covers one type
       at a time, and a checkbox that vanishes as you select elsewhere makes the
       list jump under the cursor. */
    const candidate = candidateById.get(item.id);
    const blocked = candidate ? isBlockedByType(candidate, selection.type) : false;

    return {
      id: item.id,
      tier: item.tier,
      title: formatText(item.title),
      badge: item.tag ? { label: item.tag, className: item.tagClass } : undefined,
      subtitle: [item.amountDisplay, detail].filter(Boolean).join(" · ") || undefined,
      note: item.time || undefined,
      actions,
      select: candidate
        ? {
            checked: batchIds.has(item.id),
            disabled: bulkRunning || blocked,
            title: blocked
              ? `Bulk approval covers one type at a time. Clear the selection to choose ${decisionTypeLabel(candidate.type ?? "").toLowerCase()} items instead.`
              : undefined,
            label: `Select for bulk approval: ${item.title}`,
            onChange: () => toggleSelect(item.id),
          }
        : undefined,
      onOpenDetail: () => openItem(item),
      testIdPrefix: "row-decision",
    };
  };

  /* Three different silences, three different sentences. "No decisions match this
     filter" after the user narrowed the list is information; the same words on an
     unfiltered empty queue would read as a fault. */
  const emptyText = decisionsUnreachable
    ? "Brain couldn\u2019t load your decisions. This is a connection problem, not an empty queue \u2014 don\u2019t read it as \u201cnothing to approve\u201d."
    : filtering
    ? "No decisions match this filter."
    : liveQueueLoading
      ? "Checking for anything that needs your attention\u2026"
      : "Nothing needs your attention right now. Brain is keeping things moving.";

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">

      {/* Static chrome: header + filter toolbar — never scrolls */}
      <div className="shrink-0 flex flex-col gap-[24px] items-start pt-[40px] px-[16px] pb-[16px] w-full min-w-0">
        <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Decisions</p>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">Every decision, one timeline.</p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">
            Every agent in one place. Open any item to see why Brain suggested it before you decide.
          </p>
        </div>

        {/* Filter toolbar. Auto-fit rather than fixed columns: this column is
            ~420px between the nav and the chat panel, and fixed columns clip.
            Search sits on its own full-width row below the three selects \u2014 left in
            the same grid it wrapped to a ragged fourth cell. */}
        <div className="flex flex-col gap-[8px] w-full">
        <div
          className="grid gap-[8px] w-full"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
        >
          <select
            className={CONTROL}
            value={filters.priority}
            onChange={(e) => setFilter("priority", e.target.value as DecisionFilterState["priority"])}
            aria-label="Filter by priority"
            data-testid="filter-priority"
          >
            <option value="all">All priority</option>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className={CONTROL}
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value as DecisionFilterState["status"])}
            aria-label="Filter by status"
            data-testid="filter-status"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {/* Types come from the rows actually present — an option that can only
              return "no results" teaches the user the filter is broken. */}
          <select
            className={CONTROL}
            value={filters.type}
            onChange={(e) => setFilter("type", e.target.value)}
            aria-label="Filter by type"
            data-testid="filter-type"
          >
            <option value="all">All types</option>
            {availableTypes.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          className={CONTROL}
          value={filters.query}
          onChange={(e) => setFilter("query", e.target.value)}
          placeholder="Search vendor, amount or description"
          aria-label="Search decisions"
          data-testid="filter-search"
        />
        </div>
      </div>

      {/* The timeline itself — one list, scrolls. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-[16px] pb-[16px] flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px] w-full min-h-[20px]">
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[13px]" data-testid="text-decision-count">
            {visibleItems.length === items.length
              ? `${items.length} ${items.length === 1 ? "decision" : "decisions"}`
              : `${visibleItems.length} of ${items.length} decisions`}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              data-testid="button-clear-filters"
              className="ml-auto [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[4px]"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* A partial list is as misleading as a wrongly-empty one — say so above
            the rows rather than letting the count imply completeness. */}
        {decisionsUnreachable && visibleItems.length > 0 && (
          <div
            className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
            style={{ background: "rgba(210,3,68,0.08)", border: "1px solid rgba(210,3,68,0.28)" }}
            data-testid="banner-decisions-incomplete"
          >
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#d20344] text-[14px]">
              Some decisions couldn’t be loaded, so this list may be incomplete.
            </p>
          </div>
        )}

        {/* Bulk bar. Appears at two, matching the prototype — one selected item is
            just the row's own Approve button with extra steps. The sentence names
            the real limit and where it came from, so nobody has to guess what
            "eligible" meant. */}
        {selection.count >= 2 && selection.limit && (
          <div
            className="flex flex-col sm:flex-row gap-[10px] sm:items-center justify-between p-[12px] rounded-[12px] w-full"
            style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.35)" }}
            data-testid="bulk-bar"
          >
            <p
              className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#a88afa] text-[13px]"
              data-testid="bulk-bar-summary"
            >
              <b className="font-semibold text-[#a8b9f4]">{selection.count} selected</b>
              {` \u00b7 all ${selectionLabel}, each under the ${format(selection.limit.value)} `}
              {selection.limit.source === "rule"
                ? "limit from your own rule."
                : "limit above which Brain needs a second approver."}
            </p>
            <div className="flex gap-[8px] items-center shrink-0">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkRunning}
                data-testid="button-bulk-clear"
                className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-[#6c779d] hover:text-[#a8b9f4] disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[4px] px-[8px] py-[6px]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void approveSelected()}
                disabled={bulkRunning}
                data-testid="button-bulk-approve"
                className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-white bg-[#7631ee] hover:bg-[#8a4bf5] disabled:opacity-50 rounded-[8px] px-[12px] py-[7px] outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                {bulkRunning ? "Approving\u2026" : "Approve selected"}
              </button>
            </div>
          </div>
        )}

        {visibleItems.length === 0 ? (
          <div
            className="flex items-center px-[16px] py-[20px] w-full rounded-[12px] border border-solid border-[#1d2132] bg-[#0a0c10]"
            data-testid="text-decisions-empty"
          >
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
              {emptyText}
            </p>
          </div>
        ) : (
          <div className="flex flex-col w-full rounded-[12px] border border-solid border-[#1d2132] overflow-hidden divide-y divide-[#1d2132]">
            {visibleItems.map((item) => (
              <TierRow key={item.id} row={toRow(item)} />
            ))}
          </div>
        )}

        {/* Helper banner — shown while anything is still awaiting a decision. */}
        {visibleItems.some((it) => it.actionable) && (
          <div
            className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
            style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
              <circle cx="8" cy="8" r="7" stroke="#7631ee" strokeWidth="1.3" />
              <path d="M8 7.3v4.2" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="8" cy="4.7" r="0.9" fill="#7631ee" />
            </svg>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px]">
              Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Brain proposes. You decide. A separate execution service settles.
            </p>
          </div>
        )}
      </div>

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
          navigate("/ledger?tab=rules&create=1");
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
        onPrev={canPage ? () => stepProposal(-1) : undefined}
        onNext={canPage ? () => stepProposal(1) : undefined}
        hasPrev={pagedIndex > 0}
        hasNext={pagedIndex >= 0 && pagedIndex < pagedProposals.length - 1}
        position={canPage ? `Proposal ${pagedIndex + 1} of ${pagedProposals.length}` : undefined}
      />
    </div>
  );
}
