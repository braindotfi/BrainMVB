import { useSyncExternalStore } from "react";
import type { AuditRecord } from "./auditTypes";
import type { LiveInsight } from "./brainAgentSurfaces";

let records: AuditRecord[] = [];
const listeners = new Set<() => void>();

/* The external-store seam `useAcknowledgedRecords` is built on. Exported so the
   reset behaviour can be asserted exactly as the hook would see it (snapshot
   contents AND that subscribers are notified) without needing a DOM. */
export function subscribeToAcknowledgedRecords(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function acknowledgedRecordsSnapshot(): AuditRecord[] {
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
  return useSyncExternalStore(
    subscribeToAcknowledgedRecords,
    acknowledgedRecordsSnapshot,
    acknowledgedRecordsSnapshot,
  );
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

/** Drop every acknowledged record. These are user-scoped and must NEVER survive
    an auth transition: this is a single-page app, so switching accounts does not
    remount the module, and a record acknowledged by one account would otherwise
    render in a freshly created account's Audit Log as activity it never had.
    Called from `applyUserScopedResets` (authContext.tsx) on every user change.

    Deliberately in-memory only — no localStorage/sessionStorage — so there is no
    second channel for this state to leak across accounts or browser tabs.

    Early-returns when already empty so subscribers aren't re-rendered for a
    no-op (same guard as membersStore's `clearMembers`). */
export function resetAcknowledgedStore(): void {
  if (records.length === 0) return;
  records = [];
  listeners.forEach((listener) => listener());
}