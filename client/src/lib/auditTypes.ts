/* Audit Log data model - types for canonical governance records and
   the shared AnchorStatus component used across the app. */

export type AuditEventType =
  | "approved"
  | "auto_approved"
  | "rejected"
  | "postponed"
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
  /* Identity of the human who performed this step (email / actor id), present on
     HUMAN-approval steps only - system steps omit it. The muted role suffix
     ("· finance admin") is resolved from the actor record (see actors.ts), never
     hardcoded per step. */
  actor?: string;
  /* Optional authority line, the future home of the members/limits spec
     ("within her $10K payroll limit"). Rendered as a second muted suffix after
     the role. Left unset until that model lands. */
  authority?: string;
}

/* "vendor" | "rule" | "invoice" resolve against their canonical stores and open a
   detail surface. "proposal" deep-links to /review. "employee" | "protocol" |
   "ledger" are NON-VENDOR counterparties (payroll employees, DeFi protocols,
   internal accounts) that are NOT in the trust/allowlist model - they render as
   accurate plain, non-tappable text with no detail surface. */
export type LinkedEntityKind =
  | "vendor"
  | "proposal"
  | "rule"
  | "invoice"
  | "employee"
  | "protocol"
  | "ledger";

export interface LinkedEntity {
  kind: LinkedEntityKind;
  label: string;
  refId: string;
  /* Optional explicit RELATIONSHIP override for the row chip (e.g. "PAYEE"). When
     unset, the chip falls back to the kind, or to a relationship DERIVED from the
     record type via `linkedRelationship` (a receiving party on a payment record
     reads "PAYEE"). Set this only when the derived value is wrong for a row. */
  relationship?: string;
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
  /* Link to the source invoice document (if this record is payment-related). */
  invoiceId?: string;
  /* Optional subtitle for the register row (key facts: amount · actor · audit id) */
  rowSubtitle?: string;
  /* True when this record was synthesized from the fabricated agent-proposal demo
     surface (agentProposals.ts), not a live brain-core audit event — see
     deliverables/BRAIN-CORE-ORCHESTRATION-GAP.md. Drives the "Demo scenario" pill. */
  demo?: boolean;
}

/* Filter tabs for the Audit Log page */
export type AuditLogTab =
  | "Approvals"
  | "Auto-Approved"
  | "Rejections"
  | "Rule Changes"
  | "Trusted Changes"
  | "Flagged"
  | "Last 30 Days";

export const AUDIT_TABS: AuditLogTab[] = [
  "Approvals",
  "Auto-Approved",
  "Rejections",
  "Rule Changes",
  "Trusted Changes",
  "Flagged",
  "Last 30 Days",
];

/* Event-type label / chip style mapping */
export function auditEventLabel(type: AuditEventType): string {
  switch (type) {
    case "approved": return "APPROVED";
    case "auto_approved": return "AUTO-APPROVED";
    case "rejected": return "REJECTED";
    case "postponed": return "POSTPONED";
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
    case "rejected":
      return "bg-[#350011] text-[#d20344]";
    case "postponed":
      return "bg-[#1a1c24] text-[#6c779d]";
    default:
      return "bg-[#1d2132] text-[#a8b9f4]";
  }
}

/* Payment event types - records that move money to a receiving party. Trust and
   rule-change records ALSO carry vendor rows, but those vendors are not payees. */
const PAYMENT_EVENT_TYPES: ReadonlyArray<AuditEventType> = [
  "approved",
  "auto_approved",
  "rejected",
  "postponed",
  "flagged",
];
/* Counterparty kinds that RECEIVE the money on a payment record (the payee).
   protocol/ledger are destinations of treasury moves, not AP payees, so they keep
   their own kind chip; rule/invoice/proposal are evidence, not counterparties. */
const RECEIVING_KINDS: ReadonlyArray<LinkedEntityKind> = ["vendor", "employee"];

/* Relationship chip for a linked-evidence row: the RELATIONSHIP (e.g. "PAYEE"),
   not just the entity type. Explicit `link.relationship` wins; otherwise a
   receiving party on a payment record is derived as the PAYEE. Non-payment rows
   (trust/rule-change vendor rows, invoices, proposals) return undefined and fall
   back to the plain kind chip. Derived from record type - no per-surface hardcode. */
export function linkedRelationship(
  record: AuditRecord,
  link: LinkedEntity,
): string | undefined {
  if (link.relationship) return link.relationship;
  if (typeof record.amount !== "number") return undefined;
  if (!PAYMENT_EVENT_TYPES.includes(record.eventType)) return undefined;
  if (!RECEIVING_KINDS.includes(link.kind)) return undefined;
  return "PAYEE";
}
