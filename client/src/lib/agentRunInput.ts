/**
 * "Needs Your Input" — agent runs that stopped because a fact was missing.
 *
 * ## Source
 *
 * `agent.run.missing_evidence` audit events, read off the same live
 * `GET /audit/events` feed the Audit Log already uses. brain-core's
 * AgentRunService emits one when a run reaches a terminal `missing_evidence`
 * outcome, carrying the run id, the triggering event, the action it was
 * attempting, the entity refs involved, and the list of required-but-absent
 * fields. All seven agent workflows can reach this outcome.
 *
 * ## Why every field is read defensively from both inputs and outputs
 *
 * `BrainAuditEvent` types `inputs` and `outputs` as `Record<string, unknown>` —
 * the passthrough hands brain-core's payload to the browser unnormalized, so
 * TypeScript is asserting nothing here. Which of the two bags a given key rides
 * in is brain-core's choice and is not pinned by any contract this repo can see.
 * Reading `outputs` then `inputs` for each key means a payload reshuffle
 * degrades one field to "unknown" instead of emptying the whole section, and
 * `parseMissingEvidence` returns null rather than a half-built row when the one
 * genuinely load-bearing field (the missing-field list) is absent.
 *
 * ## Known limitation, deliberately shipped
 *
 * `entity_refs` are raw brain-core ids (`cp_01K…`, `obl_01K…`). This renders
 * them as-is behind a kind label. Resolving them to display names needs either a
 * batch lookup endpoint or denormalization at emission time in AgentRunService —
 * a real decision, not a detail, and it is tracked separately. A per-row lookup
 * would be N+1 against a feed that already pages, which is the one option worth
 * ruling out up front.
 */

import { useQuery } from "@tanstack/react-query";
import { AUDIT_EVENTS_LIMIT, fetchAllBrainAuditEvents, type BrainAuditEvent } from "./brainAudit";

/** brain-core's action string for the terminal outcome this section renders. */
export const MISSING_EVIDENCE_ACTION = "agent.run.missing_evidence";

export interface MissingEvidenceItem {
  /** Audit event id — stable, and unique per occurrence. */
  id: string;
  /** The agent run that stopped. Raw id; may be absent on older events. */
  runId: string | null;
  /** What the agent was attempting, e.g. "payment.execute". Raw, may be absent. */
  attemptedAction: string | null;
  /** The event that triggered the run. Raw, may be absent. */
  triggerEvent: string | null;
  /** Required fields brain-core could not find. Never empty — see `parseMissingEvidence`. */
  missingFields: string[];
  /** Raw entity ids involved. Not resolved to names — see the header. */
  entityRefs: string[];
  createdAt: string;
}

/* ── payload access ──────────────────────────────────────────────────────── */

function pick(e: BrainAuditEvent, key: string): unknown {
  const out = e.outputs?.[key];
  if (out !== undefined && out !== null) return out;
  return e.inputs?.[key];
}

function pickString(e: BrainAuditEvent, key: string): string | null {
  const v = pick(e, key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * A list of id-ish strings from a payload slot.
 *
 * `entity_refs` is documented as a list, but the same slot has been seen holding
 * a single string and a list of `{kind, ref}` objects elsewhere in this feed
 * (`proposal_summary.affected_entities` is exactly that shape). Accepting all
 * three costs nothing and avoids a section that silently renders no context
 * because the payload used the other spelling.
 */
function pickStringList(e: BrainAuditEvent, key: string): string[] {
  const v = pick(e, key);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry === "string" && entry.trim()) {
      out.push(entry.trim());
    } else if (entry && typeof entry === "object") {
      const ref = (entry as { ref?: unknown }).ref;
      if (typeof ref === "string" && ref.trim()) out.push(ref.trim());
    }
  }
  return out;
}

/**
 * Parse one audit event, or null when it is not a usable missing-evidence
 * record.
 *
 * Null on an empty `missing_required_evidence` is deliberate: the entire purpose
 * of a row here is to say what is missing. A row that reaches the screen saying
 * an agent stopped for no stated reason is worse than no row — it is an alert
 * the tenant cannot act on or dismiss.
 */
export function parseMissingEvidence(e: BrainAuditEvent): MissingEvidenceItem | null {
  if (e.action !== MISSING_EVIDENCE_ACTION) return null;
  const missingFields = pickStringList(e, "missing_required_evidence");
  if (missingFields.length === 0) return null;
  return {
    id: e.id,
    runId: pickString(e, "run_id"),
    attemptedAction: pickString(e, "action") ?? pickString(e, "attempted_action"),
    triggerEvent: pickString(e, "trigger_event") ?? pickString(e, "trigger"),
    missingFields,
    entityRefs: pickStringList(e, "entity_refs"),
    createdAt: e.created_at,
  };
}

/** Every usable missing-evidence row in a feed, newest first. */
export function missingEvidenceItems(events: readonly BrainAuditEvent[] | null | undefined): MissingEvidenceItem[] {
  const out: MissingEvidenceItem[] = [];
  for (const e of events ?? []) {
    const item = parseMissingEvidence(e);
    if (item) out.push(item);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The "Needs Your Input" feed.
 *
 * Deliberately shares `useBrainAuditRecords`' exact query key so react-query
 * serves both from one cache entry: this is a second reading of the same audit
 * feed, not a second fetch, and a divergent key would double the request AND let
 * the two surfaces show different snapshots of the same events.
 *
 */
export function useMissingEvidenceItems() {
  const query = useQuery<{ events: BrainAuditEvent[]; next_cursor: string | null }>({
    queryKey: [`/api/brain/audit/events?limit=${AUDIT_EVENTS_LIMIT}`],
    queryFn: ({ signal }) => fetchAllBrainAuditEvents(signal),
    retry: false,
  });
  const events = query.data?.events;
  return {
    items: missingEvidenceItems(events),
    isError: query.isError,
    isLoading: query.isLoading,
  };
}

/* ── plain language ──────────────────────────────────────────────────────── */

/**
 * Human phrasing for the missing fields brain-core is known to report.
 *
 * Unlisted fields fall through to a de-underscored version of the raw name
 * rather than a guess. That keeps a newly-added field readable ("shipping
 * address") without this map having to claim it knows what the field means.
 */
const FIELD_PHRASE: Record<string, string> = {
  payment_destination: "a payment destination",
  payment_method: "a payment method",
  bank_account: "a bank account",
  balance: "an up-to-date account balance",
  account_balance: "an up-to-date account balance",
  transaction_record: "a matching transaction record",
  transaction: "a matching transaction",
  invoice: "the related invoice",
  counterparty: "counterparty details",
  contact_email: "a contact email address",
  due_date: "a due date",
  amount: "an amount",
  tax_id: "a tax ID",
};

/** Verb phrase for the action a run was attempting. */
const ACTION_PHRASE: Record<string, string> = {
  "payment.execute": "pay this bill",
  "payment.schedule": "schedule this payment",
  "collections.remind": "chase this overdue invoice",
  "reconciliation.match": "match this transaction",
  "treasury.sweep": "move cash between accounts",
  "vendor_risk.assess": "check this vendor",
  "fraud.review": "review this transaction",
  "cash_forecast.project": "update the cash forecast",
};

export function humanizeField(field: string): string {
  return FIELD_PHRASE[field] ?? field.replace(/_/g, " ").trim();
}

/** "a, b and c" — an Oxford-free list, because this reads inside a sentence. */
function joinPhrases(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The row's headline sentence: what Brain tried to do, and what stopped it.
 *
 * Built only from the action and the field list — both present in the payload —
 * so it needs no name resolution. When the action is one this map does not know,
 * the sentence degrades to naming the raw action rather than inventing a verb
 * for it: "Brain tried to run `foo.bar`" is honest and still tells the tenant
 * which workflow stalled.
 */
export function describeMissingEvidence(item: MissingEvidenceItem): string {
  const fields = joinPhrases(item.missingFields.map(humanizeField));
  const action = item.attemptedAction;
  if (!action) return `Brain stopped an action because it couldn't find ${fields}.`;
  const phrase = ACTION_PHRASE[action];
  if (phrase) return `Brain tried to ${phrase} but couldn't find ${fields}.`;
  return `Brain tried to run ${action} but couldn't find ${fields}.`;
}

/* ── entity refs ─────────────────────────────────────────────────────────── */

/** id prefix → what kind of record it is. Unknown prefixes render as "Reference". */
const REF_KIND_LABEL: Record<string, string> = {
  cp: "Counterparty",
  obl: "Obligation",
  inv: "Invoice",
  txn: "Transaction",
  tx: "Transaction",
  acct: "Account",
  act: "Account",
  pi: "Payment intent",
  raw: "Source document",
  doc: "Document",
  pr: "Proposal",
};

/**
 * Label a raw entity ref for display, e.g. `cp_01K…` → "Counterparty".
 *
 * This is a prefix reading, NOT a name resolution: the id is still shown in
 * full alongside it. The distinction matters because a label that looked like a
 * resolved name would imply the lookup happened.
 */
export function refKindLabel(ref: string): string {
  const prefix = ref.split("_")[0]?.toLowerCase() ?? "";
  return REF_KIND_LABEL[prefix] ?? "Reference";
}

/* ── Row-level rendering helpers (added to fix template bug) ─────────────────
   Previously describeMissingEvidence built the title from attemptedAction +
   missingFields ONLY — entity_refs were never read, so three vendor-risk runs
   against three different counterparties rendered identically. The helpers below
   carry a nameMap (cp_id → display name) so titles and subtitles can name the
   real entity involved. */

/**
 * Maps a brain-core `action` string (e.g. "vendor_risk.assess") to the AgentKey
 * used by agentBadgeLabel, so rows can show "Vendor Risk Agent" instead of the
 * generic "Agent blocked" label.
 */
export function agentKeyFromAction(action: string | null): string {
  if (!action) return "agent";
  const MAP: Record<string, string> = {
    "payment.execute":      "payment",
    "payment.schedule":     "payment",
    "collections.remind":   "collections",
    "reconciliation.match": "reconciliation",
    "treasury.sweep":       "treasury",
    "vendor_risk.assess":   "vendor_risk",
    "fraud.review":         "fraud_anomaly",
    "cash_forecast.project":"cash_forecast",
  };
  if (MAP[action]) return MAP[action];
  // Best-effort: first segment ("bill_management.approve" → "bill_management")
  return action.split(".")[0] ?? "agent";
}

/** Keep row headlines sentence case without changing resolved entity names. */
function sentenceCaseTitle(title: string): string {
  return title ? `${title[0].toUpperCase()}${title.slice(1)}` : title;
}

/**
 * Builds a per-row title that names the real counterparty/entity from entity_refs.
 *
 * nameMap maps cp_ ids to their display names. When the ref isn't in the map the
 * raw id is used rather than omitting the name entirely — a raw id is still more
 * informative than a sentence that applies equally to every run of the same type.
 *
 * Template bug this fixes: describeMissingEvidence never read entity_refs, so three
 * vendor_risk.assess runs on three different counterparties all rendered the same
 * title, making them look like duplicate rows.
 */
export function buildInputRowTitle(
  item: MissingEvidenceItem,
  nameMap: Map<string, string>,
): string {
  const agentKey = agentKeyFromAction(item.attemptedAction);
  const primaryField = item.missingFields[0];

  // Resolve the primary counterparty, if one exists in entity_refs
  const cpRef = item.entityRefs.find((r) => r.startsWith("cp_"));
  const entityName = cpRef ? (nameMap.get(cpRef) ?? cpRef) : null;

  switch (agentKey) {
    case "vendor_risk":
      return sentenceCaseTitle(entityName
        ? `vendor risk check blocked — couldn't classify ${entityName} as a vendor`
        : `vendor risk check blocked — ${humanizeField(primaryField ?? "required information")} missing`);

    case "payment":
      return sentenceCaseTitle(entityName
        ? `payment blocked for ${entityName} — missing ${humanizeField(primaryField ?? "payment information")}`
        : `payment blocked — missing ${humanizeField(primaryField ?? "payment information")}`);

    case "collections":
      return sentenceCaseTitle(entityName
        ? `collections reminder blocked for ${entityName} — missing ${humanizeField(primaryField ?? "contact information")}`
        : `collections reminder blocked — missing ${humanizeField(primaryField ?? "contact information")}`);

    case "reconciliation":
      return sentenceCaseTitle(`transaction matching blocked — missing ${humanizeField(primaryField ?? "transaction record")}`);

    case "treasury":
      return sentenceCaseTitle(`treasury action blocked — missing ${humanizeField(primaryField ?? "account balance")}`);

    case "fraud_anomaly":
      return sentenceCaseTitle(`fraud review blocked — missing ${humanizeField(primaryField ?? "transaction record")}`);

    case "cash_forecast":
      return sentenceCaseTitle(`cash forecast blocked — missing ${humanizeField(primaryField ?? "account balance")}`);

    default: {
      const label = agentKey.replace(/_/g, " ");
      return sentenceCaseTitle(entityName
        ? `${label} blocked for ${entityName} — missing ${humanizeField(primaryField ?? "required information")}`
        : `${label} blocked — missing ${humanizeField(primaryField ?? "required information")}`);
    }
  }
}

/**
 * Builds a three-part subtitle: "{Entity name} · {reference ID} · Missing: {field}".
 *
 * - Entity name: cp_ ref resolved to a display name (or kind:id for other ref types).
 * - Reference ID: runId when present; triggerEvent otherwise; omitted when neither exists.
 *   Long IDs are truncated after 20 chars to keep the row scannable.
 * - Missing field: human label for the first (or only) missing field.
 *
 * Any segment whose value is absent is dropped rather than shown blank.
 */
export function buildInputRowSubtitle(
  item: MissingEvidenceItem,
  nameMap: Map<string, string>,
): string | undefined {
  const parts: string[] = [];

  // Entity name segment
  const cpRef = item.entityRefs.find((r) => r.startsWith("cp_"));
  if (cpRef) {
    parts.push(nameMap.get(cpRef) ?? `${refKindLabel(cpRef)}: ${cpRef}`);
  } else if (item.entityRefs.length > 0) {
    const ref = item.entityRefs[0];
    parts.push(`${refKindLabel(ref)}: ${ref}`);
  }

  // Reference ID segment — prefer runId (stable across re-runs)
  const refId = item.runId ?? item.triggerEvent ?? null;
  if (refId) {
    const short = refId.length > 20 ? `${refId.slice(0, 20)}…` : refId;
    parts.push(short);
  }

  // Missing field segment
  const fieldLabel = item.missingFields.map(humanizeField).join(", ");
  if (fieldLabel) parts.push(`Missing: ${fieldLabel}`);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Label for the primary action button on a "Needs Your Input" row.
 *
 * ROUTING STATUS — confirmed destinations are wired in MissingEvidenceModal /
 * inputRowFixPath; unconfirmed field types navigate to the audit log as a safe
 * fallback rather than guessing:
 *
 *   CONFIRMED:  counterparty, tax_id, contact_email, payment_destination → counterparty panel
 *               invoice → /ledger?tab=payables
 *               balance, account_balance → /ledger?tab=accounts
 *               bank_account → /settings?section=sources  (add/link a bank account)
 *               payment_method → /settings?section=billing  (add a card / payment method)
 *               transaction_record, transaction → /ledger?tab=cash-flow
 *
 *   UNCONFIRMED (uses audit-log fallback):
 *               all other/unknown fields
 */
export function inputRowActionLabel(field: string | undefined): string {
  switch (field) {
    case "counterparty":        return "Add Vendor";
    case "tax_id":              return "Add Tax ID";
    case "contact_email":       return "Add Contact Email";
    case "payment_destination": return "Add Payment Info";
    case "invoice":             return "Link Invoice";
    case "balance":
    case "account_balance":     return "Refresh Account Balance";
    case "bank_account":        return "Add Banking Info";
    case "payment_method":      return "Add Payment Method";
    case "transaction_record":
    case "transaction":         return "Find Transaction";
    default:                    return "Resolve";
  }
}

/**
 * Navigate path for the primary row action button.
 *
 * Mirrors the confirmed/unconfirmed split in inputRowActionLabel. Unconfirmed
 * field types route to the audit log rather than a plausible-but-wrong page.
 */
export function inputRowFixPath(item: MissingEvidenceItem): string {
  const cpRef = item.entityRefs.find((r) => r.startsWith("cp_"));
  switch (item.missingFields[0]) {
    case "counterparty":
    case "tax_id":
    case "contact_email":
    case "payment_destination":
      return cpRef
        ? `/ledger?tab=counterparties&vendor=${encodeURIComponent(cpRef)}`
        : "/ledger?tab=counterparties";
    case "invoice":
      return "/ledger?tab=payables";
    case "balance":
    case "account_balance":
      return "/ledger?tab=accounts";
    case "bank_account":
      return "/settings?section=sources";
    case "payment_method":
      return "/settings?section=billing";
    case "transaction_record":
    case "transaction":
      return "/ledger?tab=cash-flow";
    default:
      return "/settings?section=audit";
  }
}
