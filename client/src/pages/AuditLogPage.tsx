import { useState, useMemo, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, ChevronRight, ShieldCheck, Clock } from "lucide-react";
import { MOCK_AUDIT_RECORDS } from "@/lib/mockAuditRecords";
import { AuditRecordPopup } from "@/components/AuditRecordPopup";
import type { AuditRecord, AuditEventType } from "@/lib/auditTypes";
import { AUDIT_TABS, auditEventLabel, auditEventChipClass } from "@/lib/auditTypes";
import { useCurrency } from "@/lib/currencyContext";

type Tab = (typeof AUDIT_TABS)[number];

const TAB_TO_EVENT: Partial<Record<Tab, AuditEventType>> = {
  Approvals: "approved",
  "Auto-Approved": "auto_approved",
  "Rule Changes": "rule_change",
  "Trust Changes": "trust_granted", // trust_granted + trust_revoked
  Flagged: "flagged",
};

const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

export function AuditLogPage() {
  const { format } = useCurrency();
  const [activeTab, setActiveTab] = useState<Tab>("Approvals");
  const [activeRecord, setActiveRecord] = useState<AuditRecord | null>(null);
  const search = useSearch();
  const [, navigate] = useLocation();

  /* Deep-link: ?record=AUD-xxx opens that record automatically */
  useEffect(() => {
    const params = new URLSearchParams(search);
    const recordId = params.get("record");
    if (!recordId) return;
    const found = MOCK_AUDIT_RECORDS.find((r) => r.id === recordId || r.anchor.auditId === recordId);
    if (found) {
      setActiveRecord(found);
    }
  }, [search]);

  const handleCloseRecord = () => {
    setActiveRecord(null);
    navigate("/audit-log", { replace: true });
  };

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const filtered = useMemo(() => {
    if (activeTab === "Last 30 Days") {
      return MOCK_AUDIT_RECORDS.filter((r) => r.occurredAtMs >= thirtyDaysAgo);
    }
    const ev = TAB_TO_EVENT[activeTab];
    if (activeTab === "Trust Changes") {
      return MOCK_AUDIT_RECORDS.filter(
        (r) => r.eventType === "trust_granted" || r.eventType === "trust_revoked",
      );
    }
    if (ev) {
      return MOCK_AUDIT_RECORDS.filter((r) => r.eventType === ev);
    }
    return MOCK_AUDIT_RECORDS;
  }, [activeTab]);

  /* Header pager — cycle (wrap-around) through the records in the active tab. */
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
          <div className="flex items-start justify-between w-full">
            <div className="flex flex-col items-start gap-[4px] relative shrink-0">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Audit Log</p>
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">Here's your decision history with Brain.</p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">Every decision is recorded, anchored, and verifiable.</p>
            </div>
            <button
              type="button"
              className="flex items-center gap-[6px] px-[12px] py-[8px] rounded-[100px] bg-[#0a0c10] border border-[#1d2132] hover:bg-[#11141b] transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              data-testid="button-export-audit-log"
            >
              <Download size={14} className="text-[#6c779d]" />
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#6c779d]">Export</span>
            </button>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Tab bar — active tab is ORANGE */}
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
            {filtered.length === 0 && (
              <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                  {activeTab === "Approvals" && "No approval records yet."}
                  {activeTab === "Auto-Approved" && "No auto-approval records yet."}
                  {activeTab === "Rule Changes" && "No rule changes recorded yet."}
                  {activeTab === "Trust Changes" && "No trust status changes yet."}
                  {activeTab === "Flagged" && "No flagged transactions yet."}
                  {activeTab === "Last 30 Days" && "No events in the last 30 days."}
                </p>
              </div>
            )}

            {filtered.length > 0 && (
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
                  {filtered.map((record, idx) => {
                    const isFlagged = record.eventType === "flagged";
                    const isAnchored = record.anchor.status === "anchored";
                    return (
                      <div key={record.id} className="flex flex-col gap-[8px] w-full">
                        <button
                          type="button"
                          onClick={() => setActiveRecord(record)}
                          data-testid={`row-audit-${record.id.toLowerCase()}`}
                          className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                          style={isFlagged ? { borderLeft: "3px solid #d20344" } : undefined}
                        >
                          <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                            <div className="flex gap-[8px] items-center w-full">
                              <span className={`px-[6px] py-[2px] rounded-[4px] [font-family:'JetBrains_Mono',monospace] font-medium text-[10px] uppercase tracking-[0.06em] shrink-0 ${auditEventChipClass(record.eventType)}`}>
                                {auditEventLabel(record.eventType)}
                              </span>
                              {isAnchored ? (
                                <ShieldCheck size={12} className="text-[#42bf23] shrink-0" />
                              ) : (
                                <Clock size={12} className="text-[#6c779d] shrink-0" />
                              )}
                            </div>
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">
                              {record.summary}
                            </p>
                            <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[16px] text-[12px] text-[#6c779d] truncate w-full">
                              {record.rowSubtitle ?? `${typeof record.amount === "number" ? format(record.amount) : ""} · ${record.actor} · ${record.id}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-[6px] shrink-0">
                            <span
                              className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] px-[6px] py-[2px] rounded-[4px]"
                              style={{
                                color: isAnchored ? "#42bf23" : "#414965",
                                background: isAnchored ? "rgba(66,191,35,0.08)" : "#1d2132",
                              }}
                            >
                              {isAnchored ? "Anchored" : "Pending"}
                            </span>
                            <ChevronRight size={14} className="text-[#414965] shrink-0" />
                          </div>
                        </button>
                        {idx < filtered.length - 1 && <Divider />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer caption */}
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#414965] w-full">
              A governance record — every entry is anchored and independently verifiable.
            </p>
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
