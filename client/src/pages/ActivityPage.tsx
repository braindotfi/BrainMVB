import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrainAuditRecords } from "@/lib/brainAudit";
import type { AuditRecord } from "@/lib/auditTypes";
import { type ActivityType, type ActivityItemData, statusOverrideToActivity, autoHandledToActivity, agentDecisionToActivity } from "@/lib/brainFeed";
import {
  useAgentDecisions,
  agentDecisionTimeMs,
  getAgentProposal,
  decideAgentProposal,
  type AgentProposal,
} from "@/lib/agentProposals";
import { AgentProposalModal, type AgentModalAction } from "@/components/AgentProposalModal";
import { useToast } from "@/hooks/use-toast";
import {
  ADOBE_SETTLED,
  COMCAST_SETTLED,
  MERIDIAN_RECEIVABLE_SETTLED,
  GUSTO_RECON_SETTLED,
} from "@/lib/mockProposals";
import { useReviewStatuses, setReviewStatus } from "@/lib/reviewStatusStore";
import { resolveProposal } from "@/lib/openProposalDetail";
import { openRuleDetail } from "@/lib/openRuleDetail";
import {
  ProposalDetail,
  type ProposalAction,
} from "@/components/ProposalDetail";
import type { Proposal, ProposalStatus } from "@/lib/proposalTypes";
import {
  useRules,
  pauseRule as storePauseRule,
  reportProblem as storeReportProblem,
  sendFeedback as storeSendFeedback,
  setRuleDraft,
} from "@/lib/rulesStore";

type Tab = "All" | "Brain Did" | "You Approved" | "You Rejected";
/* "All" is intentionally hidden for now. Kept in the type/logic (filterByTab
   still treats it as the unfiltered view) so it can be re-enabled later. */
const TABS: Tab[] = ["Brain Did", "You Approved", "You Rejected"];

const TYPE_TO_TAB: Record<ActivityType, Tab> = {
  paid: "Brain Did",
  moved: "Brain Did",
  approved: "You Approved",
  rejected: "You Rejected",
};

const TAB_SLUG: Record<Tab, string> = {
  "All": "all",
  "Brain Did": "brain-did",
  "You Approved": "you-approved",
  "You Rejected": "you-rejected",
};

const SLUG_TO_TAB: Record<string, Tab> = Object.fromEntries(
  (Object.entries(TAB_SLUG) as [Tab, string][]).map(([t, s]) => [s, t]),
);

/** Map a live brain-core audit record onto an activity-feed item. */
function auditToActivity(r: AuditRecord): ActivityItemData {
  const isHuman = Boolean(r.actor && r.actor !== "system");
  return {
    id: r.id,
    type: isHuman ? "approved" : "paid",
    title: r.summary,
    meta1: isHuman ? r.actor : "Automated",
    meta2: "",
    amount: r.amount != null ? `$${r.amount.toLocaleString()}` : "",
    time: r.occurredAtLabel,
    linkTo: `/audit-log?record=${r.id}`,
  };
}

/** Bucket activity items by calendar day relative to now, newest-first within each. */
function bucketByDay(records: AuditRecord[]) {
  const startOfDay = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();
  const today = startOfDay(Date.now());
  const yesterday = today - 24 * 60 * 60 * 1000;

  const todayItems: ActivityItemData[] = [];
  const yesterdayItems: ActivityItemData[] = [];
  const earlierItems: ActivityItemData[] = [];

  for (const r of records) {
    const day = startOfDay(r.occurredAtMs);
    const item = auditToActivity(r);
    if (day === today) todayItems.push(item);
    else if (day === yesterday) yesterdayItems.push(item);
    else earlierItems.push(item);
  }

  return { todayItems, yesterdayItems, earlierItems };
}

const ActivityItem = ({
  item,
  highlighted,
  rowRef,
  onSelect,
}: {
  item: ActivityItemData;
  highlighted: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  onSelect?: (item: ActivityItemData) => void;
}) => {
  const clickable = Boolean(item.linkTo || item.proposal || item.agentProposal);
  const subtitle = [item.meta1, item.meta2, item.meta3, item.time]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      ref={rowRef}
      data-testid={`row-activity-${item.id}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect?.(item) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(item);
              }
            }
          : undefined
      }
      className={`flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border transition-colors hover:bg-[#11141b] hover:border-[#1d2132] ${
        clickable ? "cursor-pointer" : ""
      } ${highlighted ? "bg-[#11141b] border-[#7631EE]" : "border-transparent"} ${
        item.type === "rejected" ? "border-l-[3px] border-l-[#d20344]" : ""
      }`}
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] w-full">
          {item.title}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] w-full">
          {subtitle}
        </p>
      </div>
      {item.amount && (
        <div className="flex flex-col items-end justify-center relative shrink-0">
          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
            {item.amount}
          </p>
        </div>
      )}
    </div>
  );
};

const SectionCard = ({
  title,
  count,
  items,
  highlightedId,
  registerRowRef,
  onSelect,
  activeTab,
}: {
  title: string;
  count?: number;
  items: ActivityItemData[];
  highlightedId: string | null;
  registerRowRef: (id: number | string) => (el: HTMLDivElement | null) => void;
  onSelect?: (item: ActivityItemData) => void;
  activeTab: Tab;
}) => {
  const emptyText =
    activeTab === "You Approved"
      ? "No manual approvals yet. Items you personally approve will show up here."
      : activeTab === "You Rejected"
        ? "No rejected items yet. Anything you reject will appear here."
        : "Brain hasn't taken any actions yet. Auto-approvals and policy runs will appear here.";
  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
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
      <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
        {items.length === 0 ? (
          <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
              {emptyText}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
            {items.map((item, idx) => (
              <div key={item.id} className="flex flex-col gap-[8px] w-full">
                <ActivityItem
                  item={item}
                  highlighted={highlightedId === String(item.id)}
                  rowRef={registerRowRef(item.id)}
                  onSelect={onSelect}
                />
                {idx < items.length - 1 && <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export function ActivityPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const { records } = useBrainAuditRecords();
  const resolvedInitial = SLUG_TO_TAB[params.get("tab") ?? ""] ?? "Brain Did";
  const initialTab: Tab = resolvedInitial === "All" ? "Brain Did" : resolvedInitial;
  // Row ids can be numeric (static activities) or strings (auto-handled
  // receipts, e.g. "prop-aws"). Keep the raw param string and compare by string
  // so deep-links from the home page work for both.
  const initialRow = params.get("row") || null;

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [highlightedId, setHighlightedId] = useState<string | null>(initialRow);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerRowRef = (id: number | string) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(String(id), el);
    else rowRefs.current.delete(String(id));
  };

  // Sync state when the URL changes (e.g. coming from the home page).
  useEffect(() => {
    const tabParam = params.get("tab") ?? "";
    const resolved = SLUG_TO_TAB[tabParam] ?? "Brain Did";
    setActiveTab(resolved === "All" ? "Brain Did" : resolved);
    setHighlightedId(params.get("row") || null);
  }, [params]);

  // Scroll the highlighted row into view and clear the highlight after a short pause.
  useEffect(() => {
    if (highlightedId == null) return;
    const el = rowRefs.current.get(highlightedId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setHighlightedId(null), 2000);
    return () => window.clearTimeout(t);
  }, [highlightedId]);

  /* Merge live brain-core audit records with client-side review-status overrides
     (executed / rejected) so Activity reflects user decisions made on
     the Review surface even before brain-core's audit log catches up. */
  const reviewStatuses = useReviewStatuses();
  const agentDecisions = useAgentDecisions();
  const actionItems: ActivityItemData[] = useMemo(() => {
    const items: ActivityItemData[] = [];
    for (const [id, status] of Object.entries(reviewStatuses)) {
      if (status !== "executing" && status !== "executed" && status !== "rejected") continue;
      const p = resolveProposal(id);
      if (!p) continue;
      items.push(statusOverrideToActivity(p, status));
    }
    /* Agent-proposal decisions (the AgentProposalModal flow). Approvals and
       rejections made there live in the agentProposals decision store, not
       reviewStatusStore, so they are layered in here. */
    for (const [id, decision] of Object.entries(agentDecisions)) {
      if (decision !== "approved" && decision !== "rejected") continue;
      const p = getAgentProposal(id);
      if (!p) continue;
      items.push(agentDecisionToActivity(p, decision, agentDecisionTimeMs(id)));
    }
    return items;
  }, [reviewStatuses, agentDecisions]);

  const filterByTab = (items: ActivityItemData[]) =>
    activeTab === "All" ? items : items.filter((it) => TYPE_TO_TAB[it.type] === activeTab);

  const { todayItems: bucketedToday, yesterdayItems: bucketedYesterday, earlierItems: bucketedEarlier } =
    useMemo(() => bucketByDay(records), [records]);

  /* Static auto-approved items (Adobe, Comcast, Meridian, Gusto). These are
     mock proposals that were approved automatically by standing rules on Jul 5–6.
     They live in "Earlier" and always appear in the "Brain Did" tab regardless
     of what brain-core returns. De-duped against live records by proposal id. */
  const autoHandledItems: ActivityItemData[] = useMemo(() => {
    const liveIds = new Set(records.map((r) => r.proposalId).filter(Boolean));
    return [
      ADOBE_SETTLED,
      COMCAST_SETTLED,
      MERIDIAN_RECEIVABLE_SETTLED,
      GUSTO_RECON_SETTLED,
    ]
      .filter((p) => !liveIds.has(p.id))
      .map(autoHandledToActivity);
  }, [records]);

  /* De-dupe merged rows by id so a live record and a local synthetic row for
     the same action never render twice (mirrors the Audit Log's merge guard). */
  const dedupeById = (items: ActivityItemData[]) => {
    const seen = new Set<string>();
    return items.filter((it) => {
      const key = String(it.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  /* Client-side actions are always "Today" because they happened in-session. */
  const todayItems = filterByTab(dedupeById([...bucketedToday, ...actionItems]));
  const yesterdayItems = filterByTab(dedupeById(bucketedYesterday));
  const earlierItems = filterByTab(dedupeById([...bucketedEarlier, ...autoHandledItems]));

  /* Inline proposal detail sheet. Opened when an activity row with a proposal
     (review-status override or auto-handled receipt) is tapped. */
  const [activeProposal, setActiveProposal] = useState<Proposal | null>(null);
  const statuses = useReviewStatuses();
  const statusOf = (p: Proposal): ProposalStatus => statuses[p.id] ?? p.status;
  const rules = useRules();
  const ruleOf = (p: Proposal) =>
    p.rule ? rules.find((r) => r.id === p.rule!.id || r.policyId === p.rule!.policyId) : undefined;

  const handleSelect = (item: ActivityItemData) => {
    if (item.proposal) {
      setActiveProposal(item.proposal);
      return;
    }
    if (item.agentProposal) {
      setActiveAgentRecord(item.agentProposal);
      return;
    }
    if (item.linkTo) navigate(item.linkTo);
  };

  /* Agent-decision rows re-open the AgentProposalModal as a receipt. The modal
     renders a decided footer (no Approve/Reject) for already-decided records;
     the handler below only fires for the few actions still offered there
     (e.g. Undo on a reversible auto-approved record). */
  const [activeAgentRecord, setActiveAgentRecord] = useState<AgentProposal | null>(null);
  const { toast } = useToast();
  const handleAgentAction = (action: AgentModalAction, p: AgentProposal) => {
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
    setActiveAgentRecord(null);
  };

  /* Header pager. Cycle through all activity items that carry a proposal
     (review overrides + auto-handled receipts) in the current filtered view. */
  const allProposalItems = useMemo(
    () =>
      [...todayItems, ...yesterdayItems, ...earlierItems].filter(
        (it) => it.proposal,
      ),
    [todayItems, yesterdayItems, earlierItems],
  );
  const pagerIdx = activeProposal
    ? allProposalItems.findIndex((it) => it.proposal!.id === activeProposal.id)
    : -1;
  const pagerDisabled = allProposalItems.length <= 1 || pagerIdx < 0;
  const pageProposal = (dir: 1 | -1) => {
    if (pagerDisabled || !activeProposal) return;
    const next =
      allProposalItems[(pagerIdx + dir + allProposalItems.length) % allProposalItems.length];
    if (next.proposal) setActiveProposal(next.proposal);
  };

  const handleAction = (action: ProposalAction) => {
    if (!activeProposal) return;
    const next: ProposalStatus =
      action === "approve" ? "executing"
        : action === "reject" ? "rejected"
          : action === "postpone" ? "postponed"
            : "verifying";
    setReviewStatus(activeProposal.id, next);
    setActiveProposal(null);
  };

  const pauseRule = (p: Proposal) => {
    const r = ruleOf(p);
    if (r) storePauseRule(r.id);
  };
  const isRulePaused = (p: Proposal): boolean => {
    const r = ruleOf(p);
    return r ? !r.active : p.rule ? !p.rule.active : false;
  };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Activity</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">What Brain has been up to.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px] whitespace-nowrap">
              Follow everything that Brain did or noticed. Tap for details.
            </p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Tab bar */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0">
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setHighlightedId(null);
                    }}
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
            <SectionCard
              title="Today"
              count={todayItems.length}
              items={todayItems}
              highlightedId={highlightedId}
              registerRowRef={registerRowRef}
              onSelect={handleSelect}
              activeTab={activeTab}
            />
            <SectionCard
              title="Yesterday"
              count={yesterdayItems.length}
              items={yesterdayItems}
              highlightedId={highlightedId}
              registerRowRef={registerRowRef}
              onSelect={handleSelect}
              activeTab={activeTab}
            />
            <SectionCard
              title="Earlier"
              count={earlierItems.length}
              items={earlierItems}
              highlightedId={highlightedId}
              registerRowRef={registerRowRef}
              onSelect={handleSelect}
              activeTab={activeTab}
            />
          </div>

        </div>
      </ScrollArea>

      {/* Inline proposal detail sheet - same experience as Review / Audit record popup */}
      <ProposalDetail
        proposal={activeProposal}
        currentStatus={activeProposal ? statusOf(activeProposal) : undefined}
        open={activeProposal !== null}
        onOpenChange={(o) => { if (!o) setActiveProposal(null); }}
        onPrev={() => pageProposal(-1)}
        onNext={() => pageProposal(1)}
        pagerDisabled={pagerDisabled}
        onAction={handleAction}
        rulePaused={activeProposal ? isRulePaused(activeProposal) : undefined}
        onPauseRule={pauseRule}
        onReviewRule={(p) => {
          setActiveProposal(null);
          openRuleDetail(p.rule?.id, navigate);
        }}
        onReportProblem={(p, report) => {
          const r = ruleOf(p);
          if (!r) return;
          if (report.pause) {
            storeReportProblem(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
            setActiveProposal(null);
            openRuleDetail(r.id, navigate);
          } else {
            storeSendFeedback(r.id, { proposalId: p.id, reason: report.reason, note: report.note });
            setActiveProposal(null);
          }
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
          setActiveProposal(null);
          navigate("/rules?create=1");
        }}
      />

      {/* Agent recommendation receipt - opened from decided agent rows. */}
      <AgentProposalModal
        proposal={activeAgentRecord}
        open={activeAgentRecord !== null}
        onOpenChange={(o) => { if (!o) setActiveAgentRecord(null); }}
        onAction={handleAgentAction}
        pagerDisabled
      />
    </div>
  );
}
