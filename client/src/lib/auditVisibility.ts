/**
 * What the Audit Log shows by default, and how it describes what it is not
 * showing.
 *
 * The log is overwhelmingly pipeline traffic — wiki regenerations, router
 * selections, policy evaluations, ingest dedupes. On a live tenant that noise
 * buries the handful of records a person actually needs: who decided what.
 * So the default view is decision history, and pipeline events sit behind an
 * explicit toggle.
 *
 * The hazard this module exists to prevent: once a filter is on by default, an
 * empty list is no longer a fact about the log — it is a fact about the filter.
 * "No audit records yet" under a hidden 97 events is a false statement about
 * the tenant's history, and it is exactly the kind of reassuring emptiness this
 * codebase keeps getting wrong. Every empty state below therefore names what is
 * being withheld and how to see it.
 *
 * Assistant activity (someone asked Brain a question) stays visible by default.
 * It is not a decision, but it IS something a person did, and the control is
 * labelled "system activity" — hiding human Q&A behind it would misdescribe the
 * toggle.
 *
 * Role note: the brief asks for this to be off by default for non-admin roles.
 * The client has no trustworthy role signal today (AuthUser carries none, and
 * matching the session email against the paged members list can fail or return
 * unknown), so the toggle is off for EVERYONE. Defaulting from a signal that
 * degrades to "unknown" would make network reliability, not role, decide what
 * is hidden. Deferred until a real role signal exists.
 */

import { isSystemActivity } from "./auditTypes";
import type { AuditRecord, AuditLogTab } from "./auditTypes";

export interface AuditPartition {
  /** Decisions and human activity: what the log is for. */
  visible: AuditRecord[];
  /** Pipeline/system events, hidden unless the toggle is on. */
  system: AuditRecord[];
}

export function partitionSystemActivity(records: AuditRecord[]): AuditPartition {
  const visible: AuditRecord[] = [];
  const system: AuditRecord[] = [];
  for (const r of records) (isSystemActivity(r) ? system : visible).push(r);
  return { visible, system };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The sentence shown when a tab has nothing to display. */
export function tabEmptyBase(tab: AuditLogTab, anythingHidden: boolean): string {
  if (tab === "All") {
    /* With system activity hidden, "no audit records" would be a claim about
       the tenant's history that the filter has no standing to make. */
    return anythingHidden ? "No decision events yet." : "No audit records yet.";
  }
  switch (tab) {
    case "Approval": return "No approval records yet.";
    case "Auto-Approved": return "No auto-approval records yet.";
    case "Rejections": return "No rejected payment records yet.";
    case "Acknowledged": return "No acknowledged records yet.";
    case "Rule Changes": return "No rule changes recorded yet.";
    case "Trusted Changes": return "No trust status changes yet.";
    case "Flagged": return "No flagged transactions yet.";
    case "Last 30 Days": return "No events in the last 30 days.";
  }
}

export interface EmptyStateInput {
  tab: AuditLogTab;
  /** True when the user is searching, so "nothing here" means "no matches". */
  searching: boolean;
  /** System events this tab is withholding right now. */
  hiddenCount: number;
  /** Of those, how many match the current query. */
  hiddenMatches: number;
}

/** Empty-state copy that never lets the filter speak for the log. */
export function auditEmptyState({ tab, searching, hiddenCount, hiddenMatches }: EmptyStateInput): string {
  const reveal = 'turn on "Show system activity" to see';

  if (searching) {
    if (hiddenMatches > 0) {
      return `No matches in your decision history — but ${plural(hiddenMatches, "hidden system event matches", "hidden system events match")}. ${reveal} them.`;
    }
    return "No matches.";
  }

  const base = tabEmptyBase(tab, hiddenCount > 0);
  if (hiddenCount > 0) {
    return `${base} ${plural(hiddenCount, "system event is", "system events are")} hidden — ${reveal} them.`;
  }
  return base;
}

/** Label for the toggle itself. The count is part of the disclosure: a bare
 *  switch says a filter exists, a counted one says how much it is holding. */
export function systemActivityToggleLabel(hiddenCount: number, on: boolean): string {
  if (on) return "Showing system activity";
  return hiddenCount > 0 ? `Show system activity (${hiddenCount})` : "Show system activity";
}

/* ── Per-user preference ───────────────────────────────────────────────────
   Keyed by user id so an account switch cannot inherit the previous account's
   choice, and read on demand rather than held in module state (which survives
   SPA account switches). Storage failures fall back to the default. */

export const SYSTEM_ACTIVITY_DEFAULT = false;

function prefKey(userId: string | null | undefined): string | null {
  return userId ? `brain_audit_show_system_${userId}` : null;
}

export function readShowSystemActivity(userId: string | null | undefined): boolean {
  const key = prefKey(userId);
  if (!key) return SYSTEM_ACTIVITY_DEFAULT;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? SYSTEM_ACTIVITY_DEFAULT : raw === "true";
  } catch {
    return SYSTEM_ACTIVITY_DEFAULT;
  }
}

export function writeShowSystemActivity(userId: string | null | undefined, value: boolean): void {
  const key = prefKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore storage errors — the choice just won't persist */
  }
}
