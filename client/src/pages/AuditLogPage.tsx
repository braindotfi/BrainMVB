import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useBrainAuditRecords } from "@/lib/brainAudit";
import { useBrainAutoApproved } from "@/lib/brainQueue";
import { AuditRecordPopup } from "@/components/AuditRecordPopup";
import type { AuditRecord, AuditEventType } from "@/lib/auditTypes";
import { AUDIT_TABS, auditRecordLabel, auditRecordChipClass, isAssistantActivity } from "@/lib/auditTypes";
import refreshIcon from "@assets/refresh_1784933925263.png";
import searchIcon from "@assets/Vector_1784933720094.png";
import { useCurrency } from "@/lib/useCurrency";
import { useReviewStatuses } from "@/lib/reviewStatusStore";
import { resolveProposal } from "@/lib/openProposalDetail";
import { statusOverrideToAuditRecord, autoApprovedToAuditRecord } from "@/lib/brainFeed";
import { useAuth } from "@/lib/authContext";
import { useAcknowledgedRecords } from "@/lib/acknowledgedStore";
import {
  partitionSystemActivity,
  auditEmptyState,
  systemActivityToggleLabel,
  readShowSystemActivity,
  writeShowSystemActivity,
} from "@/lib/auditVisibility";

type Tab = (typeof AUDIT_TABS)[number];

/** One search predicate, used for what is on screen AND for what the system
 *  activity filter is holding back — otherwise "no matches" could be hiding
 *  a match one toggle away. */
function matchesQuery(r: AuditRecord, q: string, format: (v: number) => string): boolean {
  return [
    r.summary,
    r.rowSubtitle ?? "",
    r.actor,
    r.id,
    r.counterparty ?? "",
    ...r.linked.map((l) => l.label),
    typeof r.amount === "number" ? format(r.amount) : "",
    typeof r.amount === "number" ? String(r.amount) : "",
  ].join(" ").toLowerCase().includes(q);
}

const TAB_TO_EVENT: Partial<Record<Tab, AuditEventType>> = {
  Approval: "approved",
  "Auto-Approved": "auto_approved",
  Rejections: "rejected",
  Acknowledged: "acknowledged",
  "Rule Changes": "rule_change",
  "Trusted Changes": "trust_granted",
  Flagged: "flagged",
};

export function AuditLogPage() {
  const { format, formatText } = useCurrency();
  const { isLoading, isError, records: brainRecords } = useBrainAuditRecords();
  const acknowledgedRecords = useAcknowledgedRecords();
  const { proposals: autoApprovedProposals } = useBrainAutoApproved();
  const { user } = useAuth();
  const reviewStatuses = useReviewStatuses();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  useQuery({
    queryKey: ["/api/brain/audit/events?limit=100"],
    retry: false,
    refetchInterval: 30_000,
  });

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/brain/audit/events?limit=100"] }),
        queryClient.refetchQueries({ queryKey: ["/api/brain/audit/anchor/latest"] }),
        queryClient.refetchQueries({ queryKey: ["/api/assistant/questions"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const records = useMemo(() => {
    const seen = new Set<string>();
    const merged: AuditRecord[] = [];
    const add = (r: AuditRecord) => {
      if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
    };
    brainRecords.forEach(add);
    autoApprovedProposals.map(autoApprovedToAuditRecord).forEach(add);
    acknowledgedRecords.forEach(add);
    for (const [id, status] of Object.entries(reviewStatuses)) {
      if (status !== "executing" && status !== "executed" && status !== "rejected") continue;
      const p = resolveProposal(id);
      if (!p) continue;
      add(statusOverrideToAuditRecord(p, status, user?.email ?? user?.username ?? "operator"));
    }
    return merged;
  }, [acknowledgedRecords, autoApprovedProposals, brainRecords, reviewStatuses, user]);

  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [activeRecord, setActiveRecord] = useState<AuditRecord | null>(null);
  const [query, setQuery] = useState("");
  /* Pipeline events are hidden by default; the choice is remembered per user.
     Re-read on an account switch, which does not remount this page. */
  const [showSystem, setShowSystem] = useState(() => readShowSystemActivity(user?.id));
  useEffect(() => { setShowSystem(readShowSystemActivity(user?.id)); }, [user?.id]);
  const search = useSearch();
  const [, navigate] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const recordId = params.get("record");
    if (!recordId) return;
    const found = records.find((r) => r.id === recordId || r.anchor.auditId === recordId);
    if (found) setActiveRecord(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, records.length]);

  const handleCloseRecord = () => {
    setActiveRecord(null);
    navigate("/audit-log", { replace: true });
  };

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const tabRecords = useMemo(() => {
    if (activeTab === "Last 30 Days") return records.filter((r) => r.occurredAtMs >= thirtyDaysAgo);
    if (activeTab === "Trusted Changes") return records.filter((r) => r.eventType === "trust_granted" || r.eventType === "trust_revoked");
    const ev = TAB_TO_EVENT[activeTab];
    if (ev) return records.filter((r) => r.eventType === ev);
    return records;
  }, [activeTab, records]);

  /* Split before searching, so the hidden set can still be reported on. */
  const { visible: decisionRecords, system: systemRecords } = useMemo(
    () => partitionSystemActivity(tabRecords),
    [tabRecords],
  );
  const shownRecords = showSystem ? tabRecords : decisionRecords;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shownRecords;
    return shownRecords.filter((r) => matchesQuery(r, q, format));
  }, [shownRecords, query, format]);

  /* What this tab is withholding right now, and how much of it the current
     search would have found. Both drive the empty state's wording. */
  const hiddenCount = showSystem ? 0 : systemRecords.length;
  const hiddenMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (showSystem || !q) return 0;
    return systemRecords.filter((r) => matchesQuery(r, q, format)).length;
  }, [showSystem, systemRecords, query, format]);

  const activeIdx = activeRecord ? filtered.findIndex((r) => r.id === activeRecord.id) : -1;
  const pagerDisabled = activeIdx < 0 || filtered.length <= 1;
  const pageRecord = (dir: 1 | -1) => {
    if (pagerDisabled) return;
    setActiveRecord(filtered[(activeIdx + dir + filtered.length) % filtered.length]);
  };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">

      {/* Static chrome: header + tab bar + search bar — never scrolls */}
      <div className="shrink-0 flex flex-col gap-[40px] items-start pt-[40px] px-[16px] pb-[16px] w-full min-w-0">
        <div className="flex items-start justify-between gap-[16px] relative w-full min-w-0">
          <div className="flex flex-col items-start gap-[4px] relative min-w-px flex-1">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px]">Your Audit Log</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">Here's your decision history with Brain.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">Every decision is recorded, verifiable, and anchored on-chain.</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh-audit-log"
            className="inline-flex items-center gap-[4px] px-[10px] py-[4px] rounded-[100px] bg-[#222737] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] text-[#6c779d] transition-colors hover:bg-[#2a3047] disabled:opacity-60 shrink-0"
          >
            <img src={refreshIcon} alt="" className={`size-[16px] object-contain shrink-0${refreshing ? " animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="flex flex-col gap-[16px] items-start w-full min-w-0">
          <div className="bg-[#06070a] flex gap-[2px] items-center overflow-x-auto p-[2px] relative rounded-[400px] shrink-0 w-full">
            {AUDIT_TABS.map((tab) => {
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

          <div className="bg-[#222737] flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full gap-[8px]">
            <img src={searchIcon} alt="" className="size-[24px] object-contain shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by any text including title, description, amount, vendor..."
              data-testid="input-audit-search"
              className="flex-1 min-w-px bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-[#a8b9f4] placeholder:text-[#6c779d]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                data-testid="button-clear-audit-search"
                className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] text-[#6c779d] hover:text-[#a8b9f4] shrink-0 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* The default view is decision history. This says so out loud, and
              says how much pipeline traffic is sitting behind it. */}
          <button
            type="button"
            role="switch"
            aria-checked={showSystem}
            onClick={() => {
              const next = !showSystem;
              setShowSystem(next);
              writeShowSystemActivity(user?.id, next);
            }}
            data-testid="toggle-system-activity"
            className="flex items-center gap-[8px] shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[100px] pr-[8px]"
          >
            <span
              aria-hidden
              className={`w-[36px] h-[20px] rounded-full relative transition-colors ${showSystem ? "bg-[#7631EE]" : "bg-[#222737]"}`}
            >
              <span className={`absolute top-[2px] size-[16px] rounded-full transition-all ${showSystem ? "right-[2px] bg-white" : "left-[2px] bg-[#6c779d]"}`} />
            </span>
            <span
              className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[16px] whitespace-nowrap"
              style={{ color: showSystem ? "#a8b9f4" : "#6c779d" }}
              data-testid="text-system-activity-toggle"
            >
              {systemActivityToggleLabel(systemRecords.length, showSystem)}
            </span>
          </button>

          {isLoading && (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                Loading your audit log…
              </p>
            </div>
          )}

          {!isLoading && isError && (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                Couldn't load the audit log from Brain right now.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Table area: the panel stays in place while only long record lists scroll. */}
      {!isLoading && !isError && (
        <div className="px-[16px] pb-[16px]">
          <div className="bg-[#0a0c10] flex flex-col overflow-hidden relative rounded-[16px] min-w-0">
            {/* Panel header — static */}
            <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
              <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{activeTab}</p>
                <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{filtered.length}</p>
                </div>
              </div>
            </div>

            {/* Records — short lists stay natural-height; long lists scroll here. */}
            <div className="max-h-[480px] overflow-y-auto p-[8px]">
              {filtered.length === 0 ? (
                <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                  <p
                    className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]"
                    data-testid="text-audit-empty"
                  >
                    {auditEmptyState({
                      tab: activeTab,
                      searching: query.trim().length > 0,
                      hiddenCount,
                      hiddenMatches,
                    })}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-[8px] items-start w-full min-w-0">
                  {filtered.map((record, idx) => {
                    const isAnchored = record.anchor.status === "anchored";
                    const isFlagged = record.eventType === "flagged" && !isAssistantActivity(record);
                    const isRejected = record.eventType === "rejected";
                    const borderLeft = isFlagged || isRejected ? "3px solid #d20344" : undefined;
                    const timestampText = new Date(record.occurredAtMs).toLocaleString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit",
                    });
                    const subtitle =
                      record.rowSubtitle ??
                      [
                        typeof record.amount === "number" ? format(record.amount) : "",
                        timestampText,
                      ].filter(Boolean).join(" · ");

                    return (
                      <div key={record.id} className="flex flex-col gap-[8px] w-full min-w-0">
                        <button
                          type="button"
                          data-testid={`row-audit-${record.id.toLowerCase()}`}
                          onClick={() => setActiveRecord(record)}
                          className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] hover:bg-[#11141b] transition-colors text-left min-w-0"
                          style={borderLeft ? { borderLeft } : undefined}
                        >
                          <div className="flex flex-[1_0_0] flex-col gap-[4px] items-start justify-center min-w-px">
                            <div className="flex gap-[8px] items-center w-full min-w-0">
                              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate min-w-0">
                                {formatText(record.summary)}
                              </p>
                              <span className={`inline-flex items-center justify-center px-[8px] py-[3px] rounded-[22px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[12px] whitespace-nowrap ${auditRecordChipClass(record)}`}>
                                {auditRecordLabel(record)}
                              </span>
                            </div>
                            {subtitle && (
                              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] w-full truncate">
                                {subtitle}
                              </p>
                            )}
                          </div>

                          {isAnchored ? (
                            <div className="bg-[#123509] border border-[rgba(66,191,35,0.2)] border-solid flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0">
                              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#42bf23] text-[14px] text-center whitespace-nowrap">
                                Anchored
                              </p>
                            </div>
                          ) : record.anchor.status === "recorded_pending_anchor" ? (
                            <div className="bg-[#3a2a05] border border-[rgba(245,158,11,0.25)] border-solid flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0">
                              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#f59e0b] text-[14px] text-center whitespace-nowrap">
                                Recorded
                              </p>
                            </div>
                          ) : (
                            <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] border-solid flex items-center justify-center px-[10px] py-[4px] relative rounded-[22px] shrink-0">
                              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[14px] text-center whitespace-nowrap">
                                Pending
                              </p>
                            </div>
                          )}
                        </button>

                        {idx < filtered.length - 1 && (
                          <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AuditRecordPopup
        record={activeRecord}
        open={activeRecord !== null}
        onOpenChange={(o) => { if (!o) handleCloseRecord(); }}
        onPrev={() => pageRecord(-1)}
        onNext={() => pageRecord(1)}
        pagerDisabled={pagerDisabled}
      />
    </div>
  );
}
