/* Audit Log data model - types for canonical governance records and
   the shared AnchorStatus component used across the app. */

export type AuditEventType =
  | "approved"
  | "auto_approved"
  | "rejected"
  | "acknowledged"
  | "postponed"
  | "rule_change"
  | "trust_granted"
  | "trust_revoked"
  | "flagged"
  /* Routine, non-actionable platform activity (data ingestion, background
     jobs). Mirrors brain-core's own `system_activity` event_type default —
     nothing to approve/reject, Audit Log only, neutral chip. */
  | "system_activity";

/* Three honest anchor states, gated on brain-core's actual signals:
   - "anchored"                → a confirmed on-chain anchor tx exists (anchor_tx_hash
                                 non-null). Only this state may claim on-chain immutability
                                 or render a Verify link.
   - "recorded_pending_anchor" → a Merkle root exists (record is sealed in the append-only
                                 audit chain, cryptographically verifiable) but the on-chain
                                 anchor() tx has NOT mined yet. No Verify link, no
                                 immutability claim.
   - "pending_next_batch"      → no proof material yet (no Merkle root covers this record). */
export type AnchorStatus = "pending_next_batch" | "recorded_pending_anchor" | "anchored";

export interface AnchorProof {
  status: AnchorStatus;
  auditId: string;
  merkleRoot?: string; // present when recorded OR anchored
  baseTx?: string; // ONLY when anchored (confirmed on-chain tx, 0x-prefixed)
  block?: number; // ONLY when anchored
  anchoredAtLabel?: string; // ONLY when anchored
  recordedAtLabel?: string; // for the recorded-pending state ("Recorded at")
  verifyHref?: string; // ONLY when anchored — never built without a real tx hash
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
  /* Raw brain-core action id (e.g. "wiki.question") this record was mapped
     from — carried through so surfaces can special-case non-risk subtypes
     (assistant activity) until brain-core ships a distinct event type. */
  subtype?: string;
  /* brain-core's OWN authoritative event_type from /audit/events
     (system_activity | assistant_activity | flagged). Carried through raw so
     isAssistantActivity/isSystemActivity read the wire value instead of a
     hand-maintained per-action allowlist. */
  coreEventType?: string;
  /* Original question text (for assistant activity records) — always set so
     dedup between brain-core events and locally-recorded fallback rows can
     use the raw text, independent of truncation or lifecycle-step formatting. */
  rawQuestion?: string;
  /* Display name of the originating agent / surface (e.g. "Cash Forecasting",
     "Payment Agent").  Absent on brain-core records where the actor field
     already carries the approver identity; present on locally-synthesised
     records that originate from a LiveInsight (acknowledged items). */
  agentLabel?: string;
  /** For `proposal.decided` events: the raw `proposing_agent` value from
   *  brain-core's `outputs.proposal_summary`. May be an AgentKey type string
   *  (e.g. `"vendor_risk"`) OR a runtime agent ULID (e.g.
   *  `"agent_01KZ537WW1TZ70STRQ9TFT9Z4R"`). Absent on older events and on
   *  non-proposal records. Prefer `proposingAgentDisplay` for UI rendering. */
  proposingAgent?: string;
  /** Resolved display name for the proposing agent — populated whenever
   *  `proposingAgent` is a runtime ULID that was resolved via the BFF's
   *  execution-agent registry (e.g. `"Collections Agent"`). Undefined when the
   *  raw value is an AgentKey type string (those are rendered via
   *  AGENT_DISPLAY_NAME directly) or when resolution hasn't completed yet. */
  proposingAgentDisplay?: string;
}

/* Filter tabs for the Audit Log page */
export type AuditLogTab =
  | "All"
  | "Approval"
  | "Auto-Approved"
  | "Rejections"
  | "Acknowledged"
  | "Rule Changes"
  | "Trusted Changes"
  | "Flagged"
  | "Last 30 Days";

export const AUDIT_TABS: AuditLogTab[] = [
  "All",
  "Approval",
  "Auto-Approved",
  "Rejections",
  "Acknowledged",
  "Rule Changes",
  "Trusted Changes",
  "Flagged",
  "Last 30 Days",
];

/* Event-type label / chip style mapping */
export function auditEventLabel(type: AuditEventType): string {
  switch (type) {
    case "approved": return "Approved";
    case "auto_approved": return "Auto-Approved";
    case "rejected": return "Rejected";
    case "acknowledged": return "Acknowledged";
    case "postponed": return "Postponed";
    case "rule_change": return "Rule Change";
    case "trust_granted": return "Trust Granted";
    case "trust_revoked": return "Trust Revoked";
    case "flagged": return "Flagged";
    case "system_activity": return "System Activity";
  }
}

/** Display name of the AGENT a record originated from, when one is known.
 *
 *  Priority order:
 *  1. `agentLabel` — set from a LiveInsight's surface or brain-core's agent
 *     registry (see isAgentLookup in brainAudit). This is the agent that
 *     *acted* (auto-approve, system event).
 *  2. `proposingAgent` — for proposal.decided events where a human approved,
 *     the actor is the human, not the proposing agent. We fall back to the
 *     proposing agent's display name so the popup title reads
 *     "Cash Forecasting Audit Record" rather than bare "Audit Record".
 *  3. Assistant / System activity special cases.
 *
 *  `record.actor` deliberately does NOT count: on a human-approved decision it
 *  holds the approver's email/display name, and titling that record
 *  "sarah@meridian Audit Record" would name the wrong party. Returns undefined
 *  when no agent is known so callers omit the prefix rather than guessing. */
export function auditRecordAgentName(record: AuditRecord): string | undefined {
  const label = record.agentLabel?.trim();
  if (label) return label;
  if (record.proposingAgent) {
    /* Type-key path (all-lowercase + underscores, e.g. "collections"): use the
       display-name table directly. Covers both direct type keys from brain-core
       AND keys recovered from the session cache (which always wins over the raw
       registry display string, so the canonical category name is shown). */
    if (/^[a-z_]+$/.test(record.proposingAgent)) {
      // Titles use the base name without "Agent" suffix: "Collections Audit Record".
      const displayNames: Record<string, string> = {
        vendor_risk: "Vendor Risk", payment: "Payment", collections: "Collections",
        treasury: "Treasury", cash_forecast: "Cash Forecasting", dispute: "Dispute",
        compliance: "Compliance", revenue_intel: "Revenue Intelligence",
        reconciliation: "Reconciliation", subscription: "Subscription",
        fraud_anomaly: "Fraud and Anomaly", bill_management: "Bill Management",
        debt_optimization: "Debt Optimization", financial_health: "Financial Health",
        personal_budget: "Personal Budget", purchase_advisor: "Purchase Advisor",
        savings: "Savings", tax_prep: "Tax Prep", travel_finance: "Travel Finance",
      };
      const name = displayNames[record.proposingAgent];
      if (name) return name;
      return record.proposingAgent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    /* ULID path: proposingAgent is an opaque execution-agent ID. Fall back to
       the registry display name (strip " Agent" suffix for titles) if available.
       Omit rather than expose the raw ULID. */
    if (record.proposingAgentDisplay) {
      return record.proposingAgentDisplay.replace(/\s+Agent\s*$/i, "").trim();
    }
    return undefined;
  }
  if (isAssistantActivity(record)) return "Assistant";
  if (isSystemActivity(record)) return "System";
  return undefined;
}

/** Title for a record's detail surface: "<Agent Name> Audit Record" when the
 *  originating agent is known, otherwise the bare "Audit Record". */
export function auditRecordTitle(record: AuditRecord): string {
  const agent = auditRecordAgentName(record);
  return agent ? `${agent} Audit Record` : "Audit Record";
}

export function auditEventChipClass(type: AuditEventType): string {
  switch (type) {
    case "approved":
    case "trust_granted":
    case "rule_change":
      return "bg-[#123509] text-[#42bf23] border-[rgba(66,191,35,0.2)]";
    case "acknowledged":
      return "bg-[#123509] text-[#42bf23] border-[rgba(66,191,35,0.2)]";
    case "auto_approved":
      return "bg-[rgba(255,255,255,0.3)] text-white border-[rgba(255,255,255,0.2)] backdrop-blur-sm";
    case "flagged":
    case "rejected":
      return "bg-[#350011] text-[#d20344] border-[rgba(210,3,68,0.2)]";
    case "trust_revoked":
      return "bg-[#350011] text-[#d20344] border-[rgba(210,3,68,0.2)]";
    case "postponed":
      return "bg-[#1a1c24] text-[#6c779d] border-[rgba(108,119,157,0.2)]";
    case "system_activity":
      return "bg-[#222737] text-[#6c779d] border-[rgba(108,119,157,0.2)]";
  }
}

/* Legacy allowlist of assistant subtypes, kept ONLY as a fallback for events
   that predate brain-core's authoritative event_type field. When
   `coreEventType` is present on the record it wins — brain-core decides what
   is assistant activity, not this list. */
const ASSISTANT_SUBTYPES: ReadonlyArray<string> = ["wiki.question"];

export function isAssistantActivity(
  record: Pick<AuditRecord, "eventType" | "subtype" | "coreEventType">,
): boolean {
  if (record.coreEventType === "assistant_activity") return true;
  return (
    (record.eventType === "flagged" || record.eventType === "system_activity") &&
    !!record.subtype &&
    ASSISTANT_SUBTYPES.includes(record.subtype)
  );
}

/* Routine platform activity (ingestion, background jobs): informational,
   never actionable — excluded from Inbox queues, shown in Audit Log with a
   neutral chip. Assistant activity has its own label, so it's carved out. */
export function isSystemActivity(
  record: Pick<AuditRecord, "eventType" | "subtype" | "coreEventType">,
): boolean {
  return record.eventType === "system_activity" && !isAssistantActivity(record);
}

/* Record-aware label/chip: same as the eventType mapping except assistant
   activity gets a neutral tag. Prefer these over the raw eventType helpers on
   any surface that renders live brain-core records. */
export function auditRecordLabel(
  record: Pick<AuditRecord, "eventType" | "subtype" | "coreEventType">,
): string {
  return isAssistantActivity(record) ? "Assistant Activity" : auditEventLabel(record.eventType);
}

export function auditRecordChipClass(
  record: Pick<AuditRecord, "eventType" | "subtype" | "coreEventType">,
): string {
  return "bg-[#222737] text-[#6c779d] border border-[rgba(108,119,157,0.2)]";
}

/* Raw internal identifiers (user_01KY…, evt_01KY…, tnt_…, agt_…) must never
   render inline as if they were names. An actor string is "human-readable"
   only if it is NOT a prefixed-ULID-style machine id. "system" is allowed
   (it is honest and meaningful). Returns the actor if displayable, else
   undefined so callers omit the actor line entirely. */
const RAW_ID_RE = /^[a-z]+_[0-9A-Za-z]{16,}$/;

export function humanReadableActor(actor: string | undefined): string | undefined {
  if (!actor) return undefined;
  const trimmed = actor.trim();
  if (!trimmed) return undefined;
  if (RAW_ID_RE.test(trimmed)) return undefined;
  /* Synthetic bootstrap identities (machine-generated placeholders, not people):
     any actor at the reserved .invalid TLD or with a `bootstrap+` local-part
     prefix. Omit honestly rather than substitute. If brain-core later supplies
     a real display_name for these members, it wins via the resolution order. */
  const lower = trimmed.toLowerCase();
  if (/@[^@\s]+\.invalid$/.test(lower)) return undefined;
  if (lower.startsWith("bootstrap+")) return undefined;
  return trimmed;
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
