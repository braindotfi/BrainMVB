import { useSyncExternalStore } from "react";
import type { AuditRecord } from "./auditTypes";
import type { LiveInsight } from "./brainAgentSurfaces";

let records: AuditRecord[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return records;
}

function formatTimestamp(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

function insightToRecord(insight: LiveInsight): AuditRecord {
  const occurredAtMs = Date.now();
  const summary = `Acknowledged: ${insight.title}`;
  const occurredAtLabel = formatTimestamp(occurredAtMs);
  return {
    id: `local-acknowledged-${insight.id}`,
    eventType: "acknowledged",
    subtype: "inbox.acknowledge",
    summary,
    actor: "operator",
    occurredAtLabel,
    occurredAtMs,
    lifecycle: [{ label: summary, timestamp: occurredAtLabel, kind: "ok", actor: "operator" }],
    linked: [],
    anchor: { status: "pending_next_batch", auditId: `local-acknowledged-${insight.id}` },
    rowSubtitle: "Acknowledged from the Inbox; no payment was initiated.",
  };
}

export function useAcknowledgedRecords(): AuditRecord[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function acknowledgedInsightIds(): ReadonlySet<string> {
  return new Set(records.map((record) => record.id.replace("local-acknowledged-", "")));
}

export function acknowledgeInsight(insight: LiveInsight): void {
  const record = insightToRecord(insight);
  if (records.some((existing) => existing.id === record.id)) return;
  records = [record, ...records];
  listeners.forEach((listener) => listener());
}