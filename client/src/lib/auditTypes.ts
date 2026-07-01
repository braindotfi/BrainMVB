/* Audit Log data model — types for canonical governance records and
   the shared AnchorStatus component used across the app. */

export type AuditEventType =
  | "approved"
  | "auto_approved"
  | "rule_change"
  | "trust_granted"
  | "trust_revoked"
  | "flagged";

export type AnchorStatus = "pending_next_batch" | "anchored";

export interface AnchorProof {
  status: AnchorStatus;
  auditId: string;
  merkleRoot?: string; // present when anchored
  baseTx?: string; // present when anchored
  block?: number;
  anchoredAtLabel?: string;
  verifyHref?: string;
}

export interface LifecycleStep {
  label: string;
  timestamp: string;
  note?: string;
  kind: "ok" | "alert";
}

export type LinkedEntityKind = "vendor" | "proposal" | "rule";

export interface LinkedEntity {
  kind: LinkedEntityKind;
  label: string;
  refId: string;
}

export interface AuditRecord {
  id: string; // "AUD-7K2M"
  eventType: AuditEventType;
  summary: string; // plain-language
  counterparty?: string;
  amount?: number;
  actor: string; // "sarah@meridian" | "system"
  occurredAtLabel: string;
  occurredAtMs: number; // epoch ms for "Last 30 Days" filtering
  lifecycle: LifecycleStep[];
  linked: LinkedEntity[];
  anchor: AnchorProof;
  /* Link back to an operational item when this record is an approved/executed
     payment so the settled Approved Record card can deep-link to the log. */
  proposalId?: string;
  /* Optional subtitle for the register row (key facts: amount · actor · audit id) */
  rowSubtitle?: string;
}

/* Filter tabs for the Audit Log page */
export type AuditLogTab =
  | "Approvals"
  | "Auto-Approved"
  | "Rule Changes"
  | "Trust Changes"
  | "Flagged"
  | "Last 30 Days";

export const AUDIT_TABS: AuditLogTab[] = [
  "Approvals",
  "Auto-Approved",
  "Rule Changes",
  "Trust Changes",
  "Flagged",
  "Last 30 Days",
];

/* Event-type label / chip style mapping */
export function auditEventLabel(type: AuditEventType): string {
  switch (type) {
    case "approved": return "APPROVED";
    case "auto_approved": return "AUTO-APPROVED";
    case "rule_change": return "RULE CHANGE";
    case "trust_granted": return "TRUST GRANTED";
    case "trust_revoked": return "TRUST REVOKED";
    case "flagged": return "FLAGGED";
  }
}

export function auditEventChipClass(type: AuditEventType): string {
  switch (type) {
    case "flagged":
      return "bg-[#350011] text-[#d20344]";
    default:
      return "bg-[#1d2132] text-[#a8b9f4]";
  }
}
