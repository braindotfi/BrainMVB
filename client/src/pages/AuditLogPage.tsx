import { useState, useMemo, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrainAuditRecords } from "@/lib/brainAudit";
import { AuditRecordPopup } from "@/components/AuditRecordPopup";
import type { AuditRecord, AuditEventType } from "@/lib/auditTypes";
import { AUDIT_TABS } from "@/lib/auditTypes";
import { useCurrency } from "@/lib/currencyContext";
import { useReviewStatuses } from "@/lib/reviewStatusStore";
import { resolveProposal } from "@/lib/openProposalDetail";
import { statusOverrideToAuditRecord, agentDecisionToAuditRecord } from "@/lib/brainFeed";
import { useAgentDecisions, agentDecisionTimeMs, getAgentProposal } from "@/lib/agentProposals";
import { useAuth } from "@/lib/authContext";

type Tab = (typeof AUDIT_TABS)[number];

const TAB_TO_EVENT: Partial<Record<Tab, AuditEventType>> = {
  Approvals: "approved",
  "Auto-Approved": "auto_approved",
  Rejections: "rejected",
  Postponed: "postponed",
  "Rule Changes": "rule_change",
  "Trusted Changes": "trust_granted", // trust_granted + trust_revoked
  Flagged: "flagged",
};

const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

export function AuditLogPage() {
  const { format } = useCurrency();
  const { isLoading, isError, records: brainRecords } = useBrainAuditRecords();
  const { user } = useAuth();
  const reviewStatuses = useReviewStatuses();
  const agentDecisions = useAgentDecisions();

  /* Merge live brain-core audit records with client-side review-status overrides
     so the Audit Log captures rejected and postponed actions made on the Review
     surface even before brain-core's audit events catch up.

     NOTE: de-duplication against live brain-core events is not yet possible because
     brain-core audit events carry brain-core ids (payment_intent_id), while
     client-side overrides use app-level proposal.id. The overrides are stored
     in a module-global store (no localStorage) that clears on refresh, so any
     transient duplicate only persists within a single session and is visually
     distinguishable by its synthetic id and `pending_next_batch` anchor status.
     This is a known gap that requires a stable cross-reference before safe dedup. */
  const records = useMemo(() => {
    /* Start with live brain-core records, then layer in client-side overrides.
       De-dupe by id so a live brain-core event for the same record doesn't
       produce a duplicate. */
    const seen = new Set<string>();
    const merged: AuditRecord[] = [];
    const add = (r: AuditRecord) => {
      if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
    };
    brainRecords.forEach(add);
    /* Layer in client-side review-status overrides (reject / postpone / approve). */
    for (const [id, status] of Object.entries(reviewStatuses)) {
      if (status !== "executing" && status !== "executed" && status !== "rejected" && status !== "postponed") continue;
      const p = resolveProposal(id);
      if (!p) continue;
      add(statusOverrideToAuditRecord(p, status, user?.email ?? user?.username ?? "operator"));
    }
    /* Layer in agent-proposal decisions (the AgentProposalModal flow) — these
       live in the agentProposals decision store, not reviewStatusStore. Records
       a decision made on the still-present labeled demo surface (the "Demo
       scenario" pill), NOT a live brain-core event; the id-continuity gap this
       creates is documented in deliverables/BRAIN-CORE-ORCHESTRATION-GAP.md. */
    for (const [id, decision] of Object.entries(agentDecisions)) {
      if (decision !== "approved" && decision !== "rejected") continue;
      const p = getAgentProposal(id);
      if (!p) continue;
      add(agentDecisionToAuditRecord(p, decision, user?.email ?? user?.username ?? "operator", agentDecisionTimeMs(id)));
    }
    return merged;
  }, [brainRecords, reviewStatuses, agentDecisions, user]);

  const [activeTab, setActiveTab] = useState<Tab>("Approvals");
  const [activeRecord, setActiveRecord] = useState<AuditRecord | null>(null);
  const search = useSearch();
  const [, navigate] = useLocation();

  /* Deep-link: ?record=AUD-xxx opens that record automatically */
  useEffect(() => {
    const params = new URLSearchParams(search);
    const recordId = params.get("record");
    if (!recordId) return;
    const found = records.find((r) => r.id === recordId || r.anchor.auditId === recordId);
    if (found) {
      setActiveRecord(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, records.length]);

  const handleCloseRecord = () => {
    setActiveRecord(null);
    navigate("/audit-log", { replace: true });
  };

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const filtered = useMemo(() => {
    if (activeTab === "Last 30 Days") {
      return records.filter((r) => r.occurredAtMs >= thirtyDaysAgo);
    }
    if (activeTab === "Trusted Changes") {
      return records.filter(
        (r) => r.eventType === "trust_granted" || r.eventType === "trust_revoked",
      );
    }
    const ev = TAB_TO_EVENT[activeTab];
    if (ev) {
      return records.filter((r) => r.eventType === ev);
    }
    return records;
  }, [activeTab, records]);

  /* Header pager - cycle (wrap-around) through the records in the active tab. */
  const activeIdx = activeRecord ? filtered.findIndex((r) => r.id === activeRecord.id) : -1;
  const pagerDisabled = activeIdx < 0 || filtered.length <= 1;
  const pageRecord = (dir: 1 | -1) => {
    if (pagerDisabled) return;
    setActiveRecord(filtered[(activeIdx + dir + filtered.length) % filtered.length]);
  };

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Audit Log</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">Here's your decision history with Brain.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px] whitespace-nowrap">Every decision is recorded, anchored, and verifiable.</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Tab bar - active tab is ORANGE */}
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap">
              {AUDIT_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex items-center justify-center px-[14px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
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

            {!isLoading && !isError && (
              <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
                <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                  <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{activeTab}</p>
                    <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{filtered.length}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                  {filtered.length === 0 ? (
                    <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                      <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                        {activeTab === "Approvals" && "No approval records yet."}
                        {activeTab === "Auto-Approved" && "No auto-approval records yet."}
                        {activeTab === "Rejections" && "No rejected payment records yet."}
                        {activeTab === "Postponed" && "No postponed payment records yet."}
                        {activeTab === "Rule Changes" && "No rule changes recorded yet."}
                        {activeTab === "Trusted Changes" && "No trust status changes yet."}
                        {activeTab === "Flagged" && "No flagged transactions yet."}
                        {activeTab === "Last 30 Days" && "No events in the last 30 days."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                      {filtered.map((record, idx) => {
                        const isFlagged = record.eventType === "flagged";
                        const isRejected = record.eventType === "rejected";
                        const isPostponed = record.eventType === "postponed";
                        const borderLeft = isFlagged || isRejected
                          ? "3px solid #d20344"
                          : isPostponed
                            ? "3px solid #6c779d"
                            : undefined;
                        return (
                          <div key={record.id} className="flex flex-col gap-[8px] w-full">
                            <button
                              type="button"
                              onClick={() => setActiveRecord(record)}
                              data-testid={`row-audit-${record.id.toLowerCase()}`}
                              className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                              style={borderLeft ? { borderLeft } : undefined}
                            >
                              <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                                <div className="flex items-center gap-[8px] w-full min-w-0">
                                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap truncate">
                                    {record.summary}
                                  </p>
                                  {/* Fabricated seed record, not a live brain-core event — see
                                      deliverables/BRAIN-CORE-ORCHESTRATION-GAP.md */}
                                  {record.demo && (
                                    <span
                                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px] px-[8px] py-[2px] rounded-[100px] whitespace-nowrap shrink-0"
                                      style={{ color: "#6c779d", background: "#1d2132" }}
                                    >
                                      Demo scenario
                                    </span>
                                  )}
                                </div>
                                <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap w-full">
                                  {record.rowSubtitle ?? `${typeof record.amount === "number" ? format(record.amount) : ""} · ${record.actor} · ${record.id}`}
                                </p>
                              </div>
                              <div className="flex flex-col items-end justify-center relative shrink-0 gap-[4px]">
                                {typeof record.amount === "number" && (
                                  <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
                                    {format(record.amount)}
                                  </p>
                                )}
                              </div>
                            </button>
                            {idx < filtered.length - 1 && <Divider />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </ScrollArea>

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
