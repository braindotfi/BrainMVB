import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import chevronDownIcon from "@/assets/chevron_down_dropdown.png";
import { useLocation, useSearch } from "wouter";
import { Search } from "lucide-react";
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
import {
  sessionIntentRow,
  queueIntentRow,
  liveProposalRow,
  insightRow,
  type RecordRowPresentation,
} from "@/lib/recordRows";
import { useBrainProposals, useDecideProposal, isNeedsReview, agentKeyForProposalType, type BrainProposal } from "@/lib/brainProposals";
import {
  isDecidableProposal,
  buildDecisionButtons,
  buildProposalHeaderCopy,
  proposalInvoiceIdentity,
  type DecisionButton,
} from "@/lib/proposalCards";
import { LiveProposalModal, AGENT_DISPLAY_NAME } from "@/components/AgentProposalModal";
import type { AgentKey } from "@/lib/agentProposals";
import { agentBadgeLabel } from "@/lib/agentProposals";
import { capitalCase } from "@/lib/displayLabels";
import { useBrainAuditRecords, registerProposalAgentKey, useDecidedProposalIds } from "@/lib/brainAudit";
import { inboxTapTarget } from "@/lib/inboxTap";
import { pagerState, stepPager, type PagerEntry } from "@/lib/unifiedPager";
import { AuditRecordPopup } from "@/components/AuditRecordPopup";
import type { AuditRecord, AuditEventType } from "@/lib/auditTypes";
import { auditEventLabel, auditEventChipClass, isAssistantActivity, isSystemActivity, humanReadableActor } from "@/lib/auditTypes";
import {
  useMissingEvidenceItems,
  agentKeyFromAction,
  buildInputRowTitle,
  buildInputRowSubtitle,
  inputRowActionLabel,
  inputRowFixPath,
  type MissingEvidenceItem,
} from "@/lib/agentRunInput";
import { MissingEvidenceModal } from "@/components/MissingEvidenceModal";
import { useBrainVendors } from "@/lib/brainVendors";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { mapApprovalRejection, parseCoreError, type ApprovalRejection } from "@/lib/approvalRejections";
import { isRateLimitError, reportRateLimit } from "@/lib/rateLimit";
import {
  useRules,
  pauseRule as storePauseRule,
  reportProblem as storeReportProblem,
  sendFeedback as storeSendFeedback,
  setRuleDraft,
} from "@/lib/rulesStore";
import { useReviewStatuses, setReviewStatus } from "@/lib/reviewStatusStore";
import { acknowledgeInsight, useAcknowledgedRecords } from "@/lib/acknowledgedStore";
import { TierRow, RowSection, type TierRowModel, type TierRowAction, type TierRowStatusPill } from "@/components/TierRowList";
import { orderRowsForDisplay } from "@/lib/tierRowOrder";
import { inboxBucket } from "@/lib/inboxBuckets";
import {
  auditStatusPill,
  PILL_APPROVED,
  PILL_AUTO,
  PILL_REJECTED,
  PILL_ACKED,
  PILL_PENDING,
} from "@/lib/decisionPills";
import { FilterChipRow } from "@/components/FilterChipRow";
import {
  applyDecisionFilters,
  buildSearchText,
  canonicalDecisionType,
  decisionTypeLabel,
  hasActiveFilter,
  PRIORITY_OPTIONS,
  typeOptions,
  EMPTY_FILTERS,
  RECOMMENDATION_OPTIONS,
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
import { PolicyCallout, UnavailableDataBox } from "@/components/Callout";
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
import { CountPill } from "@/components/CountPill";
import { Button } from "@/components/ui/button";

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
  /** Anything the pill encodes in COLOUR alone. Decision rows are pilled with the
   *  agent name, so severity survives only as the chip's palette — this carries
   *  it as text for anyone who cannot see the colour. */
  tagSr?: string;
  /* One-line description (may carry vendor / rule / audit-id facts) */
  desc: string;
  time: string;
  /* "Why:" line — only real recorded reasoning; omitted (honest omission) when
     the source record carries no rationale. */
  why?: string;
  /** Title, pill and second line as rendered, from the shared presenters in
   *  recordRows.ts. Set on every LIVE record, because Overview renders the same
   *  four sources and the two screens must read identically. Settled history
   *  (auto-approved, decided, audit, acknowledged) is Inbox-only and keeps the
   *  outcome pills composed below. */
  presentation?: RecordRowPresentation;
  /** Right-side outcome pill for settled/decided rows (Figma nodes 6214-69xxx).
   *  When set, the badge slot shows the agent name instead of the status. */
  statusPill?: TierRowStatusPill;
  /** Container background override for settled rows. User-decided outcomes
   *  get a purple tint (#12032d); automated/in-flight stay on base (#0a0c10). */
  rowBg?: string;
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

const TAG_AUTO = "bg-[rgba(255,255,255,0.3)] text-white border-[rgba(255,255,255,0.2)] backdrop-blur-sm";
const TAG_APPROVED_BY_YOU = "bg-brain-v1dark-green text-brain-v1green border-[rgba(66,191,35,0.2)]";
const TAG_REJECTED = "bg-brain-v1dark-pink-red text-brain-v1pink-red border-[rgba(210,3,68,0.2)]";
const TAG_ACKNOWLEDGED = "bg-brain-v1dark-green text-brain-v1green border-[rgba(66,191,35,0.2)]";
const TAG_DETECTED = "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 border-[rgba(108,119,157,0.2)]";
/* Orange agent-name chip — matches the orange badges on live proposals so the
   settled history reads consistently with the queue above it. */
const TAG_AGENT = "bg-brain-v1dark-orange text-brain-v1light-orange border-[rgba(255,149,0,0.2)]";

/* The decision outcome pills (Approved / Auto-Approved / Rejected /
   Acknowledged / Pending) and their event-type mapping now live in
   lib/decisionPills, shared with the audit record popup so the pill on a
   Resolved row and the pill in that record's popup cannot drift apart. */

/** Background applied to the row container for settled records. */
const ROW_BG_DECIDED = "#12032d"; // purple tint — user was involved in this outcome
const ROW_BG_BASE    = "#0a0c10"; // no tint — automated / in-flight

/** Row container background for settled audit-event records. */
function auditRowBg(eventType: AuditEventType): string {
  switch (eventType) {
    case "approved":
    case "rejected":
    case "flagged":
    case "trust_revoked":
    case "acknowledged": return ROW_BG_DECIDED;
    default:             return ROW_BG_BASE;
  }
}

interface InboxDropdownOption {
  value: string;
  label: string;
}

/** Dropdown labels are presentation text; keep their filter values unchanged. */
function titleCaseDropdownLabel(label: string): string {
  return label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function InboxDropdown({
  values,
  options,
  onChange,
  label,
  testId,
  open,
  onOpenChange,
  width = "w-[120px]",
}: {
  values: readonly string[];
  options: readonly InboxDropdownOption[];
  onChange: (values: string[]) => void;
  label: string;
  testId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    measured: boolean;
  } | null>(null);
  const allOption = options[0];
  const selected = options.filter((option) => values.includes(option.value));
  const triggerLabel =
    selected.length === 0
      ? allOption?.label ?? ""
      : selected.length === 1
        ? selected[0].label
        : `${selected.length} selected`;

  /* The inbox sits inside several clipped/scrolling panels. A menu rendered
     absolute inside that tree is painted inside those clip boxes, so the
     bottom options disappear depending on the selected tab. Portal it to the
     document and position it from the trigger instead. */
  const placeMenu = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const trigger = button.getBoundingClientRect();
    const menu = menuRef.current;
    const menuHeight = menu?.scrollHeight ?? 0;
    const menuWidth = menu?.offsetWidth ?? 208;
    const measured = menu !== null;
    const margin = 8;
    const gap = 4;
    const spaceBelow = Math.max(0, window.innerHeight - trigger.bottom - gap - margin);
    const spaceAbove = Math.max(0, trigger.top - gap - margin);
    const flip = measured && menuHeight > spaceBelow && spaceAbove > spaceBelow;
    const availableSpace = flip ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, availableSpace);
    const left = Math.max(
      margin,
      Math.min(trigger.left, window.innerWidth - menuWidth - margin),
    );
    const top = flip
      ? Math.max(margin, trigger.top - gap - Math.min(menuHeight, maxHeight))
      : trigger.bottom + gap;

    setMenuPosition({ top, left, maxHeight, measured });
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (open && menuPosition && !menuPosition.measured) placeMenu();
  }, [open, menuPosition, placeMenu]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    placeMenu();
    const onScroll = () => placeMenu();
    const onResize = () => placeMenu();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onOpenChange(false);
    }, 120);
  };

  return (
    <div
      ref={rootRef}
      className={`relative ${width} shrink-0`}
      onPointerEnter={cancelClose}
      onPointerLeave={() => {
        if (open) scheduleClose();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        data-testid={testId}
        onClick={() => onOpenChange(!open)}
        className="bg-brain-v1baby-blue-15 rounded-[8px] p-[8px] flex items-center gap-[8px] w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
      >
        <span className="flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[14px] leading-[20px] whitespace-nowrap truncate">
          {titleCaseDropdownLabel(triggerLabel)}
        </span>
        <img src={chevronDownIcon} alt="" aria-hidden="true" className="shrink-0 h-[7px] w-auto" />
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="group"
          aria-label={label}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          className="fixed z-[80] bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start p-[8px] rounded-row w-[208px] overflow-y-auto shadow-[0px_68px_13.5px_rgba(0,0,0,0.06),0px_38px_11.5px_rgba(0,0,0,0.2),0px_17px_8.5px_rgba(0,0,0,0.34),0px_4px_4.5px_rgba(0,0,0,0.39)]"
          data-testid={`${testId}-menu`}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
            visibility: menuPosition.measured ? "visible" : "hidden",
          }}
        >
          {options.map((option) => {
            const isAll = option.value === "all";
            const selectedOption = isAll ? values.length === 0 : values.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-[8px] p-[8px] rounded-[8px] shrink-0 w-full text-left [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-100 text-[14px] whitespace-nowrap outline-none hover:bg-brain-v1baby-blue-15 cursor-pointer"
                data-testid={`${testId}-option-${option.value}`}
              >
                <input
                  type="checkbox"
                  checked={selectedOption}
                  onChange={() => {
                    if (isAll) {
                      onChange([]);
                      return;
                    }
                    onChange(
                      selectedOption
                        ? values.filter((value) => value !== option.value)
                        : [...values, option.value],
                    );
                  }}
                  className="decision-checkbox size-[16px] shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
                  data-testid={`${testId}-checkbox-${option.value}`}
                />
                {titleCaseDropdownLabel(option.label)}
              </label>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function InboxPage() {
  const { format, formatText } = useCurrency();
  const { intents, markDeclined, setApprovalState } = useIntents();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const alert = useAppAlert();

  const statuses = useReviewStatuses();
  const [filters, setFilters] = useState<DecisionFilterState>(EMPTY_FILTERS);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const setFilter = <K extends keyof DecisionFilterState>(key: K, value: DecisionFilterState[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  /* Detail surfaces (all pre-existing components — unchanged). */
  const [active, setActive] = useState<Proposal | null>(null);
  const [activeIsLive, setActiveIsLive] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [activeLive, setActiveLive] = useState<ReviewItemType | null>(null);
  const [liveRejection, setLiveRejection] = useState<ApprovalRejection | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<LiveInsight | null>(null);
  /* Settled history (approved / rejected / acknowledged) opens its record popup
     HERE, in the same timeline the row was tapped in. It used to navigate to
     /audit-log?record=…, which swapped the whole page for the old six-tab Audit
     Log — a settled row and a pending row must be the same experience. */
  const [activeRecord, setActiveRecord] = useState<AuditRecord | null>(null);
  const [pendingAcknowledgedIds, setPendingAcknowledgedIds] = useState<Set<string>>(() => new Set());

  const statusOf = (p: Proposal): ProposalStatus => statuses[p.id] ?? p.status;

  /* ── Data sources (same as the former Review + Activity pages) ─────────── */
  const { proposals: liveQueue, isLoading: liveQueueLoading, isError: liveQueueError } = useBrainReviewQueue();
  const sessionIntentIds = new Set(intents.map((i) => i.intentId));
  const queue = liveQueue.filter((p) => !sessionIntentIds.has(p.id));
  const {
    proposals: liveAutoApproved,
    isLoading: liveAutoApprovedLoading,
    isError: liveAutoApprovedError,
  } = useBrainAutoApproved();

  const { insights: reconInsights, isLoading: reconLoading, isError: reconError } = useBrainReconciliationInsights();
  const { insights: subscriptionInsights, isLoading: subscriptionLoading, isError: subscriptionError } = useBrainSubscriptionInsights();
  const { insights: disputeInsights, isLoading: disputeLoading, isError: disputeError } = useBrainDisputeInsights();
  const { insight: cashFlowInsight, isLoading: cashFlowLoading, isError: cashFlowError } = useBrainCashFlowInsight();
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
  const {
    proposals: liveProposals,
    isLoading: liveProposalsLoading,
    isError: liveProposalsError,
  } = useBrainProposals();
  const inboxSourcesLoading =
    liveQueueLoading ||
    liveAutoApprovedLoading ||
    reconLoading ||
    subscriptionLoading ||
    disputeLoading ||
    cashFlowLoading ||
    liveProposalsLoading;
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
  /* Track by index so the pager can step through missingEvidence in order.
     Derived item is the one at that index (null when no modal is open). */
  const [selectedInputIdx, setSelectedInputIdx] = useState<number | null>(null);
  /* Which timeline ROW currently has a detail surface open. The five surfaces
     below hold five unrelated record types, so the row id is the only handle
     the shared pager can compare across them. */
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  /** The open surface arrived via Previous/Next rather than a row tap. */
  const [steppedViaPager, setSteppedViaPager] = useState(false);

  const liveReviews = intents
    .filter((i) => i.outcome === "confirm" && !i.declined && i.approvalState !== "approved")
    .map((r) => intentToReview(r, format));

  /* Track every live proposal, not only the unresolved subset. Brain-core keeps
     decided proposals in GET /proposals, and those rows are the authoritative
     source of the functional agent type after the audit event is written.
     Passing only needsReviewProposals made a reload lose "collections" and
     fall back to the generic execution-agent name ("Demo Payment Agent"). */
  const { records: auditRecords, isError: auditError } = useBrainAuditRecords(liveProposals);
  /* The set of proposals the audit trail shows as settled, and how far it can be
     trusted. Deliberately NOT re-derived from `auditRecords` here: this set is a
     hide switch, so it has to model effective state — `undo` is a decision that
     REOPENS a record, and a set built by scanning mapped records for a proposal
     reference would keep suppressing a proposal an undo had put back in front of
     the tenant. useDecidedProposalIds replays the decisions in order and is the
     same rule the Overview count subtracts, so the two screens cannot disagree.
     It shares a query key with the read above, so this costs no extra request. */
  const { ids: decidedIds } = useDecidedProposalIds();

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
      if (!res.ok) {
        if (res.status === 429) {
          reportRateLimit({ "retry-after": res.headers.get("retry-after"), body });
        }
        throw new Error(
          res.status === 429
            ? "429: rate_limited"
            : mapApprovalRejection(parseCoreError(body)).detail,
        );
      }
      return body;
    },
    onSuccess: () => { setActive(null); invalidateLiveQueue(); },
    onError: (err) => {
      if (isRateLimitError(err)) return;
      toast({ title: "Couldn't approve", description: err.message, variant: "destructive" });
    },
  });
  const rejectLive = useMutation<unknown, Error, string>({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", "/api/brain/reject", { payment_intent_id: id, reason: "Declined by operator" });
      return res.json();
    },
    onSuccess: () => { setActive(null); invalidateLiveQueue(); },
    onError: (err) => {
      if (isRateLimitError(err)) return;
      toast({ title: "Couldn't reject", description: err.message, variant: "destructive" });
    },
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
        if (res.status === 429) {
          reportRateLimit({ "retry-after": res.headers.get("retry-after"), body });
          return;
        }
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

  /* Deep-link: /inbox?proposal=<id> — brain-core agent proposals.
     Brain proposals come from an async fetch (`liveProposals`) so they cannot
     be resolved in the synchronous `resolveProposal` call above.  This second
     effect re-runs whenever liveProposals loads or the search param changes so
     it still fires even if the data arrives after the URL does.
     Priority: if the durable-queue resolver already claimed the id, skip — one
     card per URL, first match wins. */
  useEffect(() => {
    const params = new URLSearchParams(search);
    const proposalId = params.get("proposal") ?? params.get("receipt");
    if (!proposalId) return;
    if (resolveProposal(proposalId)) return; // handled by the durable-queue effect
    const brainTarget = liveProposals.find((p) => p.id === proposalId);
    if (!brainTarget) return;
    setReturnTo(params.get("from"));
    setSelectedProposal(brainTarget);
    setOpenItemId(brainTarget.id);
    navigate("/inbox", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, liveProposals]);

  /* Deep-link: /inbox?record=<id>. This is the route a linked entity returns to
     after being opened FROM a settled record here, so it must reopen the popup
     rather than silently dropping the user on a bare timeline. Audit records
     arrive asynchronously, so this re-runs as they land instead of only on mount. */
  useEffect(() => {
    const params = new URLSearchParams(search);
    const recordId = params.get("record");
    if (!recordId) return;
    /* A proposal deep-link wins: both effects react to the same `search`, and
       without an explicit precedence a URL carrying both params would have two
       handlers racing to open a different surface and rewrite the route. */
    if (params.get("proposal") || params.get("receipt")) return;
    const found = [...auditRecords, ...acknowledgedRecords].find(
      (r) => r.id === recordId || r.anchor.auditId === recordId,
    );
    if (!found) return;
    setActiveRecord(found);
    navigate("/inbox", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, auditRecords, acknowledgedRecords]);

  const dismissDetail = () => {
    setActive(null);
    setOpenItemId(null);
    if (returnTo) {
      const dest = returnTo;
      setReturnTo(null);
      navigate(dest, { replace: true });
    }
  };

  const dismissLiveProposal = () => {
    setSelectedProposal(null);
    setOpenItemId(null);
    if (returnTo) {
      const dest = returnTo;
      setReturnTo(null);
      navigate(dest, { replace: true });
    }
  };

  /* ── Build the unified item list ───────────────────────────────────────── */
  const items: InboxItem[] = useMemo(() => {
    const fmt = { format, formatText };
    const out: InboxItem[] = [];
    const seen = new Set<string>();
    const push = (it: InboxItem) => {
      if (seen.has(it.id)) return;
      seen.add(it.id);
      out.push(it);
    };

    /* Brain-core never removes a proposal from the live /v1/proposals feed when
       it gets decided — it only adds an audit record. Without this guard a
       proposal and its settled audit record both appear simultaneously (the user
       sees two rows for the same invoice). Build a set of proposal IDs that the
       audit log already confirms as decided so we can suppress the live copy.

       Two properties this set MUST keep, because it is a hide switch:

       1. Decisions only. `record.proposalId` is populated for `proposal.decided`
          and for nothing else — deliberately not for `agent.action.proposed`,
          which quotes the same id in the same field the moment an agent files a
          proposal. Sourcing this from "any audit record mentioning an id" would
          hide every record while its own creation event was still in the page.
        2. Fail open. If the audit read fails, this set remains empty and the
           live proposal stays visible rather than being hidden accidentally.
           Successful audit reads are complete cursor walks. */
    const decidedProposalIds = decidedIds;

    /* Needs you: session-scoped §6-gated intents (decidable). */
    for (const item of liveReviews) {
      const sessionPresentation = sessionIntentRow(item, fmt);
      push({
        id: String(item.id),
        kind: "proposal",
        tier: tierForPaymentIntent(),
        status: "pending",
        type: "payment",
        search: buildSearchText(item.title, item.vendor, item.due, item.amount),
        title: item.title,
        /* Every live row's wording and pill come from recordRows.ts, which
           Overview renders too — see the note on InboxItem.presentation. */
        presentation: sessionPresentation,
        tag: sessionPresentation.badge.label,
        tagClass: sessionPresentation.badge.className,
        tagSr: sessionPresentation.badge.srLabel,
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
      const queuePresentation = queueIntentRow(p, fmt);
      push({
        id: p.id,
        kind: "proposal",
        tier: tierForPaymentIntent(),
        status: "pending",
        type: "payment",
        search: buildSearchText(p.title, p.rowSubtitle, p.amountDisplay),
        title: p.title,
        presentation: queuePresentation,
        tag: queuePresentation.badge.label,
        tagClass: queuePresentation.badge.className,
        tagSr: queuePresentation.badge.srLabel,
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
    /* One invoice, several live proposals — confirmed against a live tenant, not
       inferred: brain-core's collections agent re-proposes an open invoice on
       every sweep, and those runs overlap the proposals a tenant is seeded with,
       so two records citing the same invoice id sit in the queue at once. They
       are separate approvals (approving one leaves the other pending upstream),
       so neither may be suppressed. The rows instead say they share a document,
       grouped on the invoice ID each one cites. */
    const proposalsPerInvoice = new Map<string, number>();
    for (const p of needsReviewProposals) {
      if (decidedProposalIds.has(p.id)) continue;
      const identity = proposalInvoiceIdentity(p);
      if (!identity) continue;
      proposalsPerInvoice.set(identity.key, (proposalsPerInvoice.get(identity.key) ?? 0) + 1);
    }

    for (const p of needsReviewProposals) {
      /* Skip proposals the audit log already confirms as decided — brain-core
         never removes them from the feed, so without this guard both the live
         pending row and the settled audit row render for the same invoice. */
      if (decidedProposalIds.has(p.id)) continue;
      const agentKey = agentKeyForProposalType(p.type);
      // Cache the agent key so audit records produced by this proposal's
      // decision can recover the correct category (brain-core's proposing_agent
      // in the audit snapshot is the execution agent ULID, not the type key).
      registerProposalAgentKey(p.id, agentKey);
      const agentName = p.agent?.display_name || AGENT_DISPLAY_NAME[agentKey];
      const pillName = agentBadgeLabel(agentKey);
        const decisions = buildDecisionButtons(p.available_decisions, p.presentation?.actions);
      const headerCopy = buildProposalHeaderCopy(p, agentName, formatText);
      const identity = proposalInvoiceIdentity(p);
      const shared = identity ? (proposalsPerInvoice.get(identity.key) ?? 1) - 1 : 0;
      /* Counted, never ordered: the sibling could sort anywhere in the list, so
         the row claims only that another open proposal exists on the document. */
      const sharedNote =
        shared > 0
          ? `${shared === 1 ? "1 other open proposal" : `${shared} other open proposals`} on ${identity?.code ? `invoice ${identity.code}` : "the same invoice"}`
          : undefined;
      const proposalPresentation = liveProposalRow(headerCopy, pillName, sharedNote);
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
        presentation: proposalPresentation,
        tag: proposalPresentation.badge.label,
        tagClass: proposalPresentation.badge.className,
        tagSr: proposalPresentation.badge.srLabel,
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
      const insightPresentation = insightRow(i, fmt);
      push({
        id: i.id,
        kind: "detection",
        tier: tierForReadOnlyInsight(),
        status: "informational",
        /* Filter by the owning Brain agent, not the internal insight kind.
           In particular, trailing cash flow is a Cash Forecasting insight;
           "cashflow" is not an agent category and must not become a dropdown
           option. */
        type: canonicalDecisionType(i.kind),
        search: buildSearchText(i.title, i.subtitle, i.badge, i.explanation),
        title: i.title,
        /* Badge and second line come from the shared presenter Overview uses,
           so the same record cannot read differently on the two screens. The
           reasoning stays on the card (its "Why Brain Suggested This") rather
           than being promoted into the row here and nowhere else. */
        presentation: insightPresentation,
        tag: insightPresentation.badge.label,
        tagClass: insightPresentation.badge.className,
        tagSr: insightPresentation.badge.srLabel,
        desc: insightPresentation.subtitle ?? "",
        time: "",
        actionable: false,
        insight: i,
      });
    }

    /* Auto-approved: live brain-core intents that cleared §6 automatically. */
    for (const p of liveAutoApproved) {
      const autoAgentLabel = agentBadgeLabel(p.agent as AgentKey);
      push({
        id: p.id,
        kind: "proposal",
        tier: "decided",
        status: "auto-approved",
        type: "payment",
        search: buildSearchText(p.title, p.rowSubtitle, p.amountDisplay),
        title: p.title,
        tag: autoAgentLabel,
        tagClass: TAG_AGENT,
        desc: p.rowSubtitle,
        time: p.settledMeta ? "" : p.dueLabel ?? "",
        why: p.rationale,
        amountDisplay: typeof p.amount === "number" ? format(p.amount) : p.amountDisplay,
        actionable: false,
        proposal: p,
        proposalIsLive: true,
        statusPill: PILL_AUTO,
        rowBg: ROW_BG_BASE,
      });
    }

    /* In-session decisions made on this surface (before core's audit catches up).
       Once brain-core creates an audit record for a finished decision, suppress
       the local session row — the audit record is the authoritative version, and
       the two rows have different IDs (prop_id--status vs evt_…) so the seen
       guard cannot catch the pair by itself. "executing" is still in-flight so
       it must keep showing even when a proposal_id match exists. */
    for (const [id, status] of Object.entries(statuses)) {
      if (status !== "executing" && status !== "executed" && status !== "rejected" && status !== "postponed") continue;
      const p = resolveProposal(id);
      if (!p) continue;
      if ((status === "executed" || status === "rejected") && decidedProposalIds.has(id)) continue;
      const approved = status === "executing" || status === "executed";
      /* "executing" = brain is processing — still in-flight → Pending pill.
         "executed"  = confirmed done → Approved pill. */
      const sessionPill: TierRowStatusPill | undefined =
        status === "executed"   ? PILL_APPROVED  :
        status === "executing"  ? PILL_PENDING   :
        status === "rejected"   ? PILL_REJECTED  :
        undefined; // postponed keeps the badge (waiting tier, not decided)
      push({
        id: `${p.id}--${status}`,
        kind: "proposal",
        /* Postponed is parked, not settled — it stays in the attention tiers. */
        tier: status === "postponed" ? "waiting" : "decided",
        status: approved ? "approved" : status === "rejected" ? "declined" : "pending",
        type: p.agent ?? "payment",
        search: buildSearchText(p.title, p.rowSubtitle, p.amountDisplay, p.agent),
        title: p.title,
        /* Postponed keeps a small badge (no status pill); decided rows show agent
           name in the badge so the pill stands alone as the outcome. */
        tag: sessionPill
          ? agentBadgeLabel(p.agent as AgentKey)
          : (status === "postponed" ? "Postponed" : ""),
        tagClass: sessionPill ? TAG_AGENT : (status === "postponed" ? TAG_DETECTED : ""),
        desc: p.rowSubtitle,
        time: "Just now",
        why: p.rationale,
        amountDisplay: typeof p.amount === "number" ? format(p.amount) : p.amountDisplay,
        actionable: status === "postponed",
        proposal: p,
        proposalIsLive: false,
        statusPill: sessionPill,
        rowBg: sessionPill
          ? (status === "executed" || status === "rejected" ? ROW_BG_DECIDED : ROW_BG_BASE)
          : undefined,
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
      const aPill = auditStatusPill(r.eventType);
      push({
        id: r.id,
        kind: "proposal",
        tier: auditTier(r.eventType),
        status: auditStatus(r.eventType),
        type: auditDecisionType(r),
        search: buildSearchText(r.summary, r.rowSubtitle, humanReadableActor(r.actor), r.occurredAtLabel),
        title: r.summary,
        /* Decided rows: badge shows the PROPOSING agent (consistent with the
           row before the decision was made), never the human actor. The actor
           is shown in the detail popup; putting it on the badge here changes a
           recognisable "Payment" label to the approver's display name and makes
           the row look like a different record.
           `proposingAgent` comes from brain-core's proposal_summary snapshot
           (present on events after brain-core started attaching it). When
           absent (older events, non-proposal records) the badge is empty rather
           than falling back to the actor — an empty badge is honest; an actor
           name in an agent-coloured pill is not. */
        tag: aPill
          ? (() => {
              // Priority: (1) known type-key proposingAgent (from cache or
              // brain-core direct), (2) resolved display name for ULID agents,
              // (3) raw ULID fallback.
              if (r.proposingAgent && /^[a-z_]+$/.test(r.proposingAgent))
                return agentBadgeLabel(r.proposingAgent);
              if (r.proposingAgentDisplay)
                return r.proposingAgentDisplay.replace(/\s+Agent\s*$/i, "").trim() + " Agent";
              if (r.proposingAgent) return agentBadgeLabel(r.proposingAgent);
              return "";
            })()
          : auditEventLabel(r.eventType),
        tagClass: aPill
          ? (r.proposingAgent ? TAG_AGENT : "")
          : auditEventChipClass(r.eventType),
        desc: r.rowSubtitle ?? [typeof r.amount === "number" ? format(r.amount) : "", humanReadableActor(r.actor) ?? ""].filter(Boolean).join(" · "),
        time: r.occurredAtLabel,
        why: auditWhy(r),
        amountDisplay: typeof r.amount === "number" ? format(r.amount) : undefined,
        actionable: false,
        record: r,
        statusPill: aPill,
        rowBg: aPill ? auditRowBg(r.eventType) : undefined,
      });
    }

    /* Local insight acknowledgements are settled history even though their
       source insight is removed from `visibleLiveInsights`. Keep the canonical
       acknowledgement record in Inbox so the action removes the item from the
       attention queue without making it disappear. Brain-core acknowledgements
       are already represented by the audit-record loop above; the id guard in
       push prevents a duplicate if a local record is later mirrored upstream. */
    for (const r of acknowledgedRecords) {
      push({
        id: r.id,
        kind: "proposal",
        tier: "decided",
        status: "informational",
        type: "payment",
        search: buildSearchText(r.summary, r.rowSubtitle, humanReadableActor(r.actor), r.occurredAtLabel),
        title: r.summary,
        tag: r.agentLabel ? agentBadgeLabel(r.agentLabel) : "",
        tagClass: r.agentLabel ? TAG_AGENT : "",
        desc: r.rowSubtitle ?? "",
        time: r.occurredAtLabel,
        why: auditWhy(r),
        actionable: false,
        record: r,
        statusPill: PILL_ACKED,
        rowBg: ROW_BG_DECIDED,
      });
    }

    return out;
  }, [liveReviews, queue, needsReviewProposals, visibleLiveInsights, liveAutoApproved, statuses, auditRecords, acknowledgedRecords, format, formatText, thresholds]);

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

  /* ── Unresolved / Resolved tab ─────────────────────────────────────────────
     "Unresolved" = no decision taken yet (urgent / elevated / waiting tiers).
     "Resolved"   = a decision was recorded (decided tier — user, auto, or audit). */
  type InboxTab = "Unresolved" | "Resolved";
  const [activeTab, setActiveTab] = useState<InboxTab>("Unresolved");

  const unresolvedItems = useMemo(() => items.filter((it) => it.tier !== "decided"), [items]);
  const resolvedItems   = useMemo(() => items.filter((it) => it.tier === "decided"),  [items]);
  const tabItems        = activeTab === "Unresolved" ? unresolvedItems : resolvedItems;

  /* ── Needs your input ───────────────────────────────────────────────────────
     Agent runs that reached a terminal `missing_evidence` outcome. These are not
     proposals — nothing is being suggested and there is nothing to approve. Work
     simply stopped, and until now it stopped silently: the run left an audit
     event and no surface read it.

     Shipped deliberately reduced. Entity refs render as raw brain-core ids
     because resolving them needs either a batch lookup this feed doesn't offer
     or denormalization at emission time, and every row carries the same generic
     action rather than a per-field guess at where the fix lives. Both are
     tracked as follow-ups; a wrong deep link would be worse than a plain one. */
  const {
    items: missingEvidence,
    isError: missingEvidenceError,
  } = useMissingEvidenceItems();
  /* Derived from the index so the pager can step through the list. */
  const selectedInputItem = selectedInputIdx !== null ? (missingEvidence[selectedInputIdx] ?? null) : null;
  /* Counterparty id → display name. Shared with inputRows so titles can say
      "Vendor risk check blocked — couldn't classify Brightline Systems Inc. as a
     vendor" rather than repeating the same generic sentence for every run. */
  const { vendors } = useBrainVendors();
  const vendorNameMap = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.name])),
    [vendors],
  );

  const inputRows = useMemo<TierRowModel[]>(
    () =>
      missingEvidence.map((entry, idx) => {
        /* Derive the agent key from the attempted action so the badge chip can
           say "Vendor Risk Agent" / "Payment Agent" instead of "Agent blocked". */
        const agentKey = entry.agentKey ?? agentKeyFromAction(entry.attemptedAction);
        const primaryField = entry.missingFields[0];
        const fixPath = inputRowFixPath(entry);
        return {
          id: `missing-evidence-${entry.id}`,
          /* Amber, not red. A stalled run is real work not happening, but nothing
             is mid-flight and no money is at risk this minute. */
          tier: "waiting" as const,
          /* Interpolated title naming the real counterparty from entity_refs.
             Previously this called describeMissingEvidence which never read
             entity_refs, producing identical titles for every run of the same
             agent — the template bug confirmed in the accompanying notes. */
          title: buildInputRowTitle(entry, vendorNameMap),
          /* Agent-specific badge label ("Vendor Risk Agent", "Payment Agent", …)
             in place of the previous generic "Agent blocked" on every row. */
          badge: { label: agentBadgeLabel(agentKey), className: TAG_AGENT },
          /* Subtitle carries the entity, reference, and missing field context. */
          subtitle: buildInputRowSubtitle(entry, vendorNameMap),
          /* Row tap opens the detail modal. */
          onOpenDetail: () => setSelectedInputIdx(idx),
          /* Primary action button — label derives from the specific missing field;
             destination is confirmed for the common fields, falls back to the audit
             log for field types whose remediation page isn't confirmed yet (see
             inputRowActionLabel and inputRowFixPath comments for the split). */
          actions: [
            {
              id: "fix",
              label: inputRowActionLabel(primaryField),
              tone: "warning" as const,
              onClick: () => navigate(fixPath),
            },
          ],
          /* No checkbox, ever. Bulk approve batches decisions, and there is no
             decision here to batch. */
          testIdPrefix: "row-agent-input",
        };
      }),
    [missingEvidence, vendorNameMap, navigate],
  );

  const visibleItems = useMemo(() => applyDecisionFilters(tabItems, filters), [tabItems, filters]);
  /* Missing-evidence rows live outside `items`, so apply the urgency label
     facet explicitly. Every stalled run belongs to the waiting tier. */
  const visibleInputRows = useMemo(
    () =>
      filters.priority && filters.priority.length > 0 && !filters.priority.includes("waiting")
        ? []
        : inputRows,
    [filters.priority, inputRows],
  );
  /* "All Types" is a shared Inbox facet, not a facet of whichever resolution
     tab happens to be selected. Building it from resolvedItems made the menu
     lose every type that only had unresolved rows — and older settled audit
     records may not carry a proposal type at all. Keep the option set stable
     across the two tabs while still exposing only types present in this Inbox. */
  const availableTypes = useMemo(() => typeOptions(items), [items]);
  /* Dropdowns only help when the selected tab has records to narrow. Use the
     unfiltered tab contents so a filter that matches nothing can still be
     cleared through the dropdowns. Missing-evidence rows are part of the
     Unresolved tab even though they live outside the unified item list. */
  const activeTabHasRecords =
    activeTab === "Unresolved"
      ? unresolvedItems.length + inputRows.length > 0
      : resolvedItems.length > 0;
  const hasUnresolvedRecords = unresolvedItems.length + inputRows.length > 0;
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

  /* ── Tap / button handlers ─────────────────────────────────────────────── */
  /* Row taps route through inboxTapTarget — a pure helper whose return type has
     NO navigation variant, so a settled row can never navigate away from /inbox
     again (it used to swap the page for the old Audit Log). The helper's
     behavior is pinned by client/src/lib/inboxTap.test.ts. */
  const openItem = (item: InboxItem) => {
    const target = inboxTapTarget(item);
    /* The pager needs to know WHICH ROW is open, not just which record: the
       five surfaces below hold five unrelated record types, and only the row id
       is comparable across them. */
    setOpenItemId(target.surface === "none" ? null : item.id);
    switch (target.surface) {
      case "agent-proposal-modal":
        setSelectedProposal(target.proposal);
        return;
      case "intent-modal":
        setLiveRejection(null);
        setActiveLive(target.intent);
        return;
      case "insight-modal":
        setSelectedInsight(target.insight);
        return;
      case "proposal-sheet":
        setReturnTo(null);
        setActiveIsLive(target.isLive);
        setActive(target.proposal);
        return;
      case "audit-popup":
        /* Settled history opens its popup IN PLACE — never a route change. */
        setActiveRecord(target.record);
        return;
      case "none":
        return;
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

  /* One pager across the whole timeline. Every openable row participates in
     display order, whichever of the five surfaces it opens, so Previous/Next
     mean "the next row you can see" instead of "the next row of this same kind"
     — which used to strand the user at the edge of whichever queue they had
     happened to open. */
  /* The row behind the open insight card, so the card's Acknowledge writes to
     the same pending/acknowledged state the row's own button does. Resolved by
     insight id against the UNFILTERED list: the row id and the insight id are
     different namespaces, and the row leaves `visibleItems` the moment it is
     acknowledged (or a filter hides it) while the card is still open. */
  const selectedInsightItem = selectedInsight
    ? (items.find((item) => item.insight?.id === selectedInsight.id) ?? null)
    : null;

  const pagerEntries: PagerEntry[] = visibleItems
    .filter((item) => inboxTapTarget(item).surface !== "none")
    .map((item) => ({ id: item.id, open: () => openItem(item) }));
  const pager = pagerState(pagerEntries, openItemId);
  const closeOpenSurface = () => {
    setActive(null);
    setActiveLive(null);
    setLiveRejection(null);
    setSelectedInsight(null);
    setSelectedProposal(null);
    setActiveRecord(null);
    setReturnTo(null);
  };
  const stepItem = (delta: 1 | -1) => {
    /* Stepping closes one dialog and opens another; the surface that opens must
       know it is a step, not a fresh open, so it can skip the entrance
       animation. Cleared below once nothing is open. */
    setSteppedViaPager(true);
    stepPager(pagerEntries, openItemId, delta, closeOpenSurface);
  };
  /* Reset off the SURFACES, not off openItemId: an action that closes a card
     (approve, acknowledge, follow a link out) does not always clear the open item
     id, and a flag left set would silence the next card the user opens by hand. */
  const anySurfaceOpen =
    active !== null ||
    activeLive !== null ||
    selectedInsight !== null ||
    selectedProposal !== null ||
    activeRecord !== null;
  useEffect(() => {
    if (!anySurfaceOpen) setSteppedViaPager(false);
  }, [anySurfaceOpen]);
  /* Every surface below shares these, so the pager reads the same everywhere. */
  const pagerProps = {
    onPrev: () => stepItem(-1),
    onNext: () => stepItem(1),
    hasPrev: pager.hasPrev,
    hasNext: pager.hasNext,
    pagerStep: steppedViaPager,
  };

  /* One timeline row from a unified item.
     Actions come from what the record can actually accept, never a hardcoded
     Approve/Decline pair — a notify-only finding offers `acknowledge` and nothing
     else, and firing approve at it is a write brain-core rejects. */
  const toRow = (item: InboxItem): TierRowModel => {
    const busy = itemBusy(item);
    const actions: TierRowAction[] = [];
    if (item.liveAgentProposal && item.liveDecisions) {
      for (const decision of item.liveDecisions) {
        const label = decision.label;
        const supported =
          decision.id === "approve" ||
          decision.id === "reject" ||
          decision.id === "acknowledge";
        actions.push({
          id: decision.id,
          label,
          tone: decision.tone,
          disabled: busy || !decision.writable || !supported,
          onClick: () => {
            if (!decision.writable || !supported) return;
            if (decision.id === "approve") approveItem(item);
            else if (decision.id === "reject") rejectItem(item);
            else acknowledgeItem(item);
          },
        });
      }
    } else if (item.actionable) {
      actions.push({ id: "reject", label: "Reject", tone: "reject", disabled: busy, onClick: () => rejectItem(item) });
      actions.push({ id: "approve", label: "Approve", tone: "approve", disabled: busy, onClick: () => approveItem(item) });
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

    /* Live records read exactly as they do on Overview, because both screens
       render the SAME presenter output. Settled history has no counterpart
       there, so it keeps the composition above. */
    const presentation: RecordRowPresentation = item.presentation ?? {
      title: formatText(item.title),
      badge: { label: item.tag, className: item.tagClass, srLabel: item.tagSr },
      subtitle: [item.amountDisplay, detail].filter(Boolean).join(" · ") || undefined,
      note: item.time || undefined,
    };

    return {
      id: item.id,
      tier: item.tier,
      title: presentation.title,
      badge: item.tag ? presentation.badge : undefined,
      subtitle: presentation.subtitle,
      note: presentation.note,
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
      statusPill: item.statusPill,
      rowBg: item.rowBg,
    };
  };

  /* ── The three named sections ───────────────────────────────────────────────
     Split on what the record can actually DO, not on where it came from.

     `kind` looks like the taxonomy for this, and the split used to use it, but
     it is stamped per source: every agent proposal is pushed as
     kind: "proposal" regardless of what brain-core will accept for it. A
     notify_only fraud or compliance finding offers `acknowledge` and nothing
     else, and it was landing under "Needs your decision" above a single
     Acknowledge button — a heading demanding a decision over a row that has
     none to give. Sorting by outcome type instead means the heading and the
     buttons cannot disagree, because they now read the same field.

     Tier is NOT lost by regrouping: rows stay in tier order inside each section
     and every row keeps its own accent bar, so urgency still reads down the list. */
  const decisionRows = useMemo(
    () => orderRowsForDisplay(visibleItems.filter((it) => inboxBucket(it) === "approval").map(toRow)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toRow closes over live handler state and is rebuilt every render by design
    [visibleItems, toRow],
  );
  const awarenessRows = useMemo(
    () => orderRowsForDisplay(visibleItems.filter((it) => inboxBucket(it) === "awareness").map(toRow)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [visibleItems, toRow],
  );

  /* Filters are built from the facets of `items`, and missing-evidence rows are
     not in `items`. Their urgency label is applied separately above; status,
     type, and text filters do not apply to this source. */
  /* Caption removed: the truncation notice ("Showing the most recent audit
     events only…") was removed per spec — the section header is sufficient. */
  const inputSectionCaption =
    filters.status.length > 0 || filters.type.length > 0 || filters.query.trim() !== ""
      ? "Some filters don't apply to this section."
      : "";

  /* Which sections to show based on the recommendation filter.
     An empty filter means "all". The inputRows section lives outside
     visibleItems so it must be gated here rather than via matchesFilters. */
  const rec = filters.recommendation;
  const showApproval  = rec.length === 0 || rec.includes("approval");
  const labelAllowsInput =
    !filters.priority?.length || filters.priority.includes("waiting");
  const showInput     = (rec.length === 0 || rec.includes("input")) && labelAllowsInput;
  const showAwareness = rec.length === 0 || rec.includes("awareness");

  const unresolvedEmpty =
    activeTab === "Unresolved" &&
    (showApproval  ? visibleItems.filter((it) => inboxBucket(it) === "approval").length  === 0 : true) &&
    (showInput     ? visibleInputRows.length === 0 : true) &&
    (showAwareness ? visibleItems.filter((it) => inboxBucket(it) === "awareness").length === 0 : true);

  /* Three different silences, three different sentences. "No decisions match this
     filter" after the user narrowed the list is information; the same words on an
     unfiltered empty queue would read as a fault. */
  const emptyText = decisionsUnreachable
    ? "Brain couldn't load your decisions. This is a connection problem, not an empty queue. Don't read it as nothing to approve."
    : filtering
    ? `No ${activeTab.toLowerCase()} decisions match this filter.`
    : liveQueueLoading
      ? "Checking for anything that needs your attention\u2026"
      : activeTab === "Unresolved"
        ? "Nothing needs your attention right now. Brain is keeping things moving."
        : "No resolved decisions yet.";

  return (
    <div className="bg-brain-v1baby-blue-5 overflow-hidden absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)]">

      {/* Static chrome: header + filter toolbar — never scrolls */}
      <div className="shrink-0 flex flex-col gap-[40px] items-start pt-[40px] px-[16px] pb-[16px] w-full min-w-0">
        <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-60 text-[20px] whitespace-nowrap">Your AI Inbox</p>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-brain-v1baby-blue-100 text-[32px]">Know what needs your attention.</p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-30 text-[16px]">
            Review recommended actions, important updates, and insights from Brain's AI agents in one place.
          </p>
        </div>

         {/* Filter toolbar — closed controls stay compact; the open menu follows
             Figma node 6191:69205 exactly. */}
        <div className="flex flex-col items-start gap-[12px] w-fit max-w-full min-w-0">

        {/* Search. The predicate, the `query` field and its tests all survived a
            merge that deleted only the control, so this filter has been running
            against a value nothing could set. Its own row rather than a fourth
            item in the toolbar: the centre column is ~420px and three dropdowns
            already fill it. No clear button -- "Clear filters" below resets
            `query` with the rest, and hasActiveFilter already counts it.

            GlobalSearch also renders on this route, so the wording has to keep
            the two apart. That bar looks across decisions, vendors and accounts
            and NAVIGATES to one record; this one narrows the list in front of
            you and changes nothing else. The original copy ("Search vendor,
            amount or description") predated the global bar and now reads as a
            second attempt at the same job. */}
        {activeTabHasRecords && (
          <div className="flex h-[40px] items-center gap-[8px] p-[8px] rounded-[8px] bg-brain-v1baby-blue-15 w-full min-w-0">
            <Search className="shrink-0 size-[20px] text-brain-v1baby-blue-60" strokeWidth={1.8} aria-hidden="true" />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilter("query", e.target.value)}
              placeholder="Filter these decisions"
              aria-label="Filter decisions by text"
              data-testid="filter-search"
              className="flex-1 min-w-0 h-[24px] bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 placeholder:text-brain-v1baby-blue-60 text-[14px] leading-[20px]"
            />
          </div>
        )}

          <div className="flex flex-row flex-wrap gap-[12px] items-center w-fit max-w-full">
          {activeTabHasRecords && ([
            {
              values: filters.recommendation,
              onChange: (v: string[]) => setFilter("recommendation", v as DecisionFilterState["recommendation"]),
              label: "Filter by recommendation",
              testId: "filter-recommendation",
              options: [{ value: "all", label: "All Recommendations" }, ...RECOMMENDATION_OPTIONS],
              width: "w-[196px]",
            },
            {
              values: filters.priority ?? [],
              onChange: (v: string[]) => setFilter("priority", v as DecisionFilterState["priority"]),
              label: "Filter by label",
              testId: "filter-label",
              options: [{ value: "all", label: "All Labels" }, ...PRIORITY_OPTIONS],
              width: "w-[160px]",
            },
            {
              values: filters.status,
              onChange: (v: string[]) => setFilter("status", v as DecisionFilterState["status"]),
              label: "Filter by status",
              testId: "filter-status",
              options: [{ value: "all", label: "All Status" }, ...STATUS_OPTIONS],
              width: undefined,
            },
            {
              values: filters.type,
              onChange: (v: string[]) => setFilter("type", v),
              label: "Filter by type",
              testId: "filter-type",
              /* Types from rows present so the filter is never vacuously empty. */
              options: [{ value: "all", label: "All Types" }, ...availableTypes],
              width: undefined,
            },
          ] as const).map(({ values, onChange, label, testId, options, width }) => (
            <InboxDropdown
              key={testId}
              values={values}
              onChange={onChange}
              label={label}
              testId={testId}
              options={options}
              open={openDropdown === testId}
              onOpenChange={(nextOpen) => setOpenDropdown(nextOpen ? testId : null)}
              width={width}
            />
          ))}
          {activeTabHasRecords && filtering && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              data-testid="button-clear-filters"
              className="ml-auto [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1purple text-[12px] hover:underline outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple rounded-[4px] shrink-0"
            >
              Clear filters
            </button>
          )}
        </div>
        </div>
      </div>

      {/* The timeline itself — one list, scrolls. */}
      <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-[16px] pb-[16px] pt-[26px] flex flex-col gap-[26px]">

        {/* Unresolved / Resolved tab strip — same FilterChipRow pattern as the
            Rules subpage. Counts show items before the dropdown filters apply so
            the badge is always honest even when a filter hides rows. */}
        <FilterChipRow
          chips={[
            /* Includes stalled runs: they are unresolved things asking something
               of you, and a tab badge that omits them under-reports the queue. */
            { value: "Unresolved", label: "Unresolved", count: unresolvedItems.length + inputRows.length },
            { value: "Resolved",   label: "Resolved",   count: resolvedItems.length   },
          ]}
          value={activeTab}
          onChange={(v) => {
            setActiveTab(v as InboxTab);
            setFilters(EMPTY_FILTERS);
            setOpenDropdown(null);
          }}
          label="Filter by resolution status"
          testIdPrefix="tab-inbox"
        />

        {/* Inner content — count label + list rows. gap-[10px] matches the
            original row-to-row spacing; the 26px gap above comes from the
            outer container separating this block from the chip strip. */}
        <div className="flex flex-col gap-[10px] items-start w-full">


        {/* A partial list is as misleading as a wrongly-empty one — say so above
            the rows rather than letting the count imply completeness. */}
        {decisionsUnreachable && visibleItems.length > 0 && (
          <UnavailableDataBox testId="banner-decisions-incomplete">
            Some decisions couldn’t be loaded, so this list may be incomplete.
          </UnavailableDataBox>
        )}

        {/* Bulk bar. Appears at two, matching the prototype — one selected item is
            just the row's own Approve button with extra steps. The sentence names
            the real limit and where it came from, so nobody has to guess what
            "eligible" meant. */}
        {selection.count >= 2 && selection.limit && (
          <div
            className="order-first bg-brain-v1dark-dark-purple flex flex-col mb-[12px] overflow-hidden rounded-panel shrink-0 w-full"
            data-testid="bulk-bar"
          >
            {/* Body — count metric + Brain Observed sentence */}
            <div className="flex flex-col items-start p-[16px] w-full">
              <div className="bg-brain-v1dark-purple flex gap-[26px] items-start overflow-hidden px-[32px] py-[16px] rounded-panel w-full">
                {/* Left: Number Selected */}
                <div className="flex flex-col gap-[4px] items-start justify-center shrink-0 w-[128px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1purple text-[16px]">
                    Number Selected
                  </p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[48px] text-[40px] text-white" data-testid="bulk-bar-count">
                    {selection.count}
                  </p>
                </div>
                {/* Hairline vertical divider */}
                <div className="w-px self-stretch shrink-0 bg-brain-v1dark-dark-purple" />
                {/* Right: Brain Observed */}
                <div className="flex min-w-0 flex-1 flex-col gap-[4px] items-start justify-center">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1purple text-[16px]">
                    Brain Observed
                  </p>
                  <p
                    className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[16px] text-white w-full min-w-0"
                    data-testid="bulk-bar-summary"
                  >
                    {`All ${selectionLabel}, each under ${format(selection.limit.value)} `}
                    {selection.limit.source === "rule"
                      ? "limit from your own rule."
                      : "limit above which Brain needs a second approver."}
                  </p>
                </div>
              </div>
            </div>
            {/* Footer — Cancel / Approve Selected */}
            <div className="border-t border-brain-v1dark-purple bg-brain-v1dark-dark-purple flex flex-col items-start p-[16px] w-full">
              <div className="flex gap-[16px] items-center w-full">
                <Button
                  variant="secondary"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkRunning}
                  data-testid="button-bulk-clear"
                  className="flex-1 min-w-px"
                >
                  Cancel
                </Button>
                <Button
                  variant="warning"
                  onClick={() => void approveSelected()}
                  disabled={bulkRunning}
                  data-testid="button-bulk-approve"
                  className="flex-1 min-w-px"
                >
                  {bulkRunning ? "Approving\u2026" : "Approve"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Unresolved" && !hasUnresolvedRecords && (
          <div className="flex gap-[8px] items-center w-full" data-testid="heading-unresolved-decisions">
            <div className="size-[6px] rounded-full shrink-0 bg-brain-v1baby-blue-60" />
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-60 text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">
              Unresolved Decisions
            </p>
            <CountPill testId="count-unresolved-decisions">{visibleItems.length + visibleInputRows.length}</CountPill>
          </div>
        )}

        {activeTab === "Resolved" && (
          <div className="flex gap-[8px] items-center w-full" data-testid="heading-resolved-decisions">
            <div className="size-[6px] rounded-full shrink-0 bg-brain-v1baby-blue-60" />
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-60 text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">
              Resolved Decisions
            </p>
            <CountPill testId="count-resolved-decisions">{visibleItems.length}</CountPill>
          </div>
        )}

        {(activeTab === "Unresolved" ? unresolvedEmpty : visibleItems.length === 0) ? (
          decisionsUnreachable ? (
            <UnavailableDataBox testId="text-decisions-empty">{emptyText}</UnavailableDataBox>
          ) : (
            <div
              className="flex items-center px-[16px] py-[20px] w-full rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg"
              data-testid="text-decisions-empty"
            >
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[16px]">
                {emptyText}
              </p>
            </div>
          )
        ) : activeTab === "Unresolved" ? (
          /* Grouped by what each section ASKS OF YOU. An empty section renders
             nothing at all — three "nothing here" boxes on a quiet day trains
             people to stop reading the page. */
          <div className="flex flex-col gap-[26px] w-full">
            {showApproval && decisionRows.length > 0 && (
              <RowSection
                title="Needs your approval"
                accent="#d20344"
                rows={decisionRows}
                testId="section-needs-decision"
                headingTestId="heading-needs-decision"
              />
            )}
            {showInput && (missingEvidenceError ? (
              <UnavailableDataBox testId="text-needs-input-unavailable">
                Couldn't check whether any agent is waiting on information from you. This is a connection problem, not an all-clear.
              </UnavailableDataBox>
            ) : (
               visibleInputRows.length > 0 && (
                <RowSection
                  title="Needs your input"
                  accent="#ff9500"
                   rows={visibleInputRows}
                  caption={inputSectionCaption || undefined}
                  testId="section-needs-input"
                  headingTestId="heading-needs-input"
                />
              )
            ))}
            {showAwareness && awarenessRows.length > 0 && (
              <RowSection
                title="For your awareness"
                accent="#a8b9f4"
                rows={awarenessRows}
                testId="section-for-awareness"
                headingTestId="heading-for-awareness"
              />
            )}
          </div>
        ) : (
          /* Resolved is history, not a queue: nothing is being asked of anyone,
             so the "needs your …" grouping would be meaningless here. */
          <div className="shrink-0 flex flex-col w-full rounded-row border border-solid border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg overflow-hidden">
            <div className="flex flex-col w-full">
              {visibleItems.map((item) => (
                <TierRow key={item.id} row={toRow(item)} />
              ))}
            </div>
          </div>
        )}

        {/* Helper banner — shown while anything is still awaiting a decision. */}
        {!inboxSourcesLoading && !decisionsUnreachable && visibleItems.some((it) => it.actionable) && (
          <PolicyCallout>
            Tap any item to see why Brain suggested it, what happens next, and what the risk is before you approve anything. Brain proposes. You decide. A separate execution service settles.
          </PolicyCallout>
        )}
        </div>{/* end inner gap-[10px] wrapper */}
      </div>

      {/* Existing detail surfaces — unchanged components */}
      <ProposalDetail
        proposal={active}
        currentStatus={active ? statusOf(active) : undefined}
        open={active !== null}
        onOpenChange={(o) => { if (!o) dismissDetail(); }}
        {...pagerProps}
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
        onOpenChange={(o) => { if (!o) { setActiveLive(null); setLiveRejection(null); setOpenItemId(null); } }}
        {...pagerProps}
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

      {/* Acknowledge is bound to the open INSIGHT, never to the row: the row
          disappears from the list the instant it is acknowledged, and a control
          that vanishes mid-interaction reads as a bug. It stays put, disabled. */}
      <LiveInsightModal
        insight={selectedInsight}
        open={selectedInsight !== null}
        onOpenChange={(o) => { if (!o) { setSelectedInsight(null); setOpenItemId(null); } }}
        {...pagerProps}
        position={pager.position ?? undefined}
        onAcknowledge={
          selectedInsight
            ? () => { if (selectedInsightItem) acknowledgeItem(selectedInsightItem); }
            : undefined
        }
        acknowledged={
          selectedInsight !== null &&
          (acknowledgedIds.has(selectedInsight.id) ||
            (selectedInsightItem !== null && pendingAcknowledgedIds.has(selectedInsightItem.id)))
        }
      />

      {/* Settled history, opened in place. Same popup the Audit Log uses, so the
          record's evidence and anchor state are identical — only the surrounding
          page no longer changes out from under the user. */}
      <AuditRecordPopup
        record={activeRecord}
        open={activeRecord !== null}
        onOpenChange={(o) => { if (!o) { setActiveRecord(null); setOpenItemId(null); } }}
        {...pagerProps}
        position={pager.position ?? undefined}
        returnToBase="/inbox"
      />

      {/* Live brain-core agent proposal (vendor risk, collections, treasury, etc.) */}
      <LiveProposalModal
        proposal={selectedProposal}
        open={selectedProposal !== null}
        onOpenChange={(o) => { if (!o) dismissLiveProposal(); }}
        {...pagerProps}
        position={pager.position ?? undefined}
      />

      {/* Blocked-run detail — "Needs Your Input" rows open this.
          Previous / Next pages through missingEvidence in newest-first order,
          matching the list order the user sees in the Needs Your Input section. */}
      <MissingEvidenceModal
        item={selectedInputItem}
        open={selectedInputIdx !== null}
        onOpenChange={(o) => { if (!o) setSelectedInputIdx(null); }}
        vendorNameMap={vendorNameMap}
        hasPrev={selectedInputIdx !== null && selectedInputIdx > 0}
        hasNext={selectedInputIdx !== null && selectedInputIdx < missingEvidence.length - 1}
        onPrev={() => setSelectedInputIdx((i) => (i !== null && i > 0 ? i - 1 : i))}
        onNext={() => setSelectedInputIdx((i) => (i !== null && i < missingEvidence.length - 1 ? i + 1 : i))}
        position={
          selectedInputIdx !== null && missingEvidence.length > 1
            ? `${selectedInputIdx + 1} of ${missingEvidence.length}`
            : undefined
        }
      />
    </div>
  );
}
