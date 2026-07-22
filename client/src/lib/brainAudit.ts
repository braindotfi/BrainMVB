import { useQuery } from "@tanstack/react-query";
import type { AuditRecord, AuditEventType, AnchorProof, LifecycleStep } from "./auditTypes";
import { isAssistantActivity, humanReadableActor } from "./auditTypes";

/* ── Live brain-core audit events → AuditRecord ───────────────────────────────
   Replaces MOCK_AUDIT_RECORDS as the AuditLogPage data source with
   `GET /audit/events` + `GET /audit/anchor/latest` (both proxied verbatim by
   the BFF's generic GET passthrough - no new route needed; see
   server/brain/proxy.ts). `audit:read` is on the session/member token.

   Shape verified against brain-core source, not docs:
   - services/api/assets/openapi.yaml:2646 (`/audit/events`) and :2746
     (`/audit/anchor/latest`).
   - services/audit/src/repository.ts (AuditEventRow - id, tenant_id, layer,
     actor, action, inputs, outputs, policy_version, event_hash,
     prev_event_hash, created_at). No per-event anchor/proof field.
   - services/execution/src/payment-intents/PaymentIntentService.ts - real
     `action` strings + inputs/outputs shapes for the events this queue will
     actually see: `payment_intent.created` (inputs: action_type,
     source_account_id, destination_counterparty_id, amount, currency),
     `payment_intent.approved` (inputs: payment_intent_id, approval_id),
     `payment_intent.rejected` (inputs: payment_intent_id, reason).

   Honesty: brain-core's event list carries NO audit-record id in the app's
   "AUD-xxxx" format, no rich lifecycle narrative, and no mock-store cross-refs
   (rule/vendor/document/proposal ids). We do not fabricate any of that - see
   mapAuditEventToRecord below for exactly what is real vs honestly omitted. */

export interface BrainAuditEvent {
  id: string;
  tenant_id: string;
  layer: string;
  actor: string;
  action: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  policy_version: number | null;
  policy_decision_id?: string | null;
  event_hash: string;
  prev_event_hash: string | null;
  created_at: string;
}
interface AuditEventsResponse {
  events: BrainAuditEvent[];
  next_cursor: string | null;
}

export interface BrainAnchor {
  merkle_root: string;
  event_count: number;
  period_start: string;
  period_end: string;
  onchain_tx_hash: string;
  onchain_block_number: number;
}

/** action → (eventType, plain-language summary prefix). Anything not listed
 *  here falls back to a generic "system event" reading — no invented eventType.
 *
 *  Verified against brain-core source (2026-07-16), not docs — grepped every
 *  `action: "..."` / `action: '...'` audit emit call across services/execution,
 *  services/api, services/wiki:
 *   - services/execution/src/payment-intents/PaymentIntentService.ts:457,634,683,721,832,882,962,1131
 *     (created/approved/rejected/cancelled/paused/resumed/execute.after/enqueued)
 *     and :1351 (`approval_rejected`, a distinct action emitted from
 *     `emitApprovalRejected` when an approve() CALL itself is rejected —
 *     e.g. self-approval blocked, actor unresolved — separate from a human
 *     explicitly rejecting the payment via `payment_intent.rejected`).
 *   - services/execution/src/payment-intents/PaymentIntentService.ts:591
 *     (`proposal.awaiting_second_approval` — fired when the first approval
 *     lands but a second is still required; distinct from `.created`).
 *   - services/execution/src/routes.ts:88,180,203 (execution.propose/approve/escalate).
 *   - services/execution/src/members/routes.ts:380 (`member.changed`).
 *   - services/wiki/src/routes/question.ts:52 (`wiki.question`).
 *
 *  No `auto_approved` or `postponed` action exists anywhere in brain-core —
 *  see the ponytail note below for what that means for those two tabs. */
const ACTION_MAP: Record<string, { eventType: AuditEventType; summary: (e: BrainAuditEvent) => string }> = {
  "payment_intent.created": { eventType: "flagged", summary: () => "Payment proposed, awaiting decision" },
  "proposal.awaiting_second_approval": { eventType: "flagged", summary: () => "Payment awaiting second approval" },
  "payment_intent.approved": { eventType: "approved", summary: () => "Payment approved" },
  "payment_intent.rejected": { eventType: "rejected", summary: () => "Payment rejected" },
  "approval_rejected": { eventType: "rejected", summary: () => "Approval attempt rejected" },
  "execution.approve": { eventType: "approved", summary: () => "Payment approved" },
  "execution.escalate": { eventType: "flagged", summary: () => "Payment escalated for review" },
  "wiki.question": { eventType: "flagged", summary: () => "Assistant asked a question" },
  "member.changed": { eventType: "flagged", summary: () => "Team member updated" },
};

/** `proposal.decided` (services/execution/src/proposals/decision-service.ts)
 *  emits `inputs: { proposal_id, decision }` - NOT outputs - and carries its
 *  eventType in the decision itself (approve|reject|acknowledge|undo), not a
 *  fixed action string, so it's handled separately from the static ACTION_MAP
 *  above rather than one entry per decision. proposal_id is included as plain
 *  reference text (not a tappable link) - see the `linked: []` honesty note on
 *  mapAuditEventToRecord below. */
function classifyProposalDecided(e: BrainAuditEvent): { eventType: AuditEventType; summary: string } {
  const decision = typeof e.inputs.decision === "string" ? e.inputs.decision : "decided";
  const proposalId = typeof e.inputs.proposal_id === "string" ? e.inputs.proposal_id : undefined;
  const eventType: AuditEventType =
    decision === "reject" ? "rejected" : decision === "undo" ? "flagged" : "approved";
  return { eventType, summary: `Proposal decided - ${decision}${proposalId ? ` (${proposalId})` : ""}` };
}

/** Honest event-type + summary derivation: use the known mapping, otherwise
 *  render the raw action id as the summary rather than guessing a category. */
function classify(e: BrainAuditEvent): { eventType: AuditEventType; summary: string } {
  if (e.action === "proposal.decided") return classifyProposalDecided(e);
  const known = ACTION_MAP[e.action];
  if (known) return { eventType: known.eventType, summary: known.summary(e) };
  // ponytail: no fabricated category for unmapped actions - the raw action id
  // is the honest label until this map grows to cover more of brain-core's
  // action vocabulary.
  //
  // "Auto-Approved" and "Postponed" tabs stay honestly near-empty: brain-core
  // has NO `auto_approved` or `postponed` audit action (verified above) —
  // "auto" clearance is a derived /actions status (proposed|approved
  // PaymentIntent, see services/execution/src/actions/mapper.ts:17-19), not
  // its own audit event, and "postpone" is a BrainMVB-local review-queue
  // state that never calls brain-core (no server route). `payment_intent.
  // paused`/`.cancelled` DO exist but are a different concept (an ops
  // kill-switch hold and a pre-approval agent cancel, respectively) — mapping
  // either to "postponed" would be inventing an equivalence brain-core
  // doesn't make, so they're left unmapped (raw action id) until brain-core
  // grows a real auto-approval / postpone event to key off of.
  return { eventType: "flagged", summary: e.action };
}

function label(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " ET";
}

/** A record is anchored iff its created_at falls within the latest anchor's
 *  period (the only per-record signal brain-core's anchor endpoint gives us -
 *  no per-record merkle proof from this list; that requires the separate
 *  GET /audit/event/{id} inclusion-proof endpoint, out of scope for a list view). */
function anchorFor(event: BrainAuditEvent, latest: BrainAnchor | undefined): AnchorProof {
  const auditId = event.id;
  if (!latest) return { status: "pending_next_batch", auditId };
  const createdMs = new Date(event.created_at).getTime();
  const anchored =
    createdMs <= new Date(latest.period_end).getTime() &&
    createdMs >= new Date(latest.period_start).getTime();
  if (!anchored) return { status: "pending_next_batch", auditId };
  return {
    status: "anchored",
    auditId,
    merkleRoot: latest.merkle_root,
    baseTx: latest.onchain_tx_hash,
    block: latest.onchain_block_number,
    anchoredAtLabel: label(new Date(latest.period_end).getTime()),
    verifyHref: `https://sepolia.basescan.org/tx/${latest.onchain_tx_hash}`,
  };
}

function amountFrom(e: BrainAuditEvent): number | undefined {
  const raw = e.inputs.amount;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Map a live brain-core AuditEvent to the app's AuditRecord shape. Honest,
 *  no fabrication:
 *  - lifecycle is a SINGLE step (the event itself) - brain-core's list gives
 *    one row per event, not a pre-assembled multi-step narrative per record;
 *    a richer lifecycle would require stitching multiple events by
 *    payment_intent_id, which is a follow-up (see ponytail note below).
 *  - linked[] is always empty - brain-core's event carries no rule/vendor/
 *    document/proposal id in this app's mock id space, and inputs/outputs
 *    only carry brain-core's OWN ids (payment_intent_id, counterparty_id,
 *    approval_id), which don't resolve against the still-mock rule/vendor/
 *    document stores. Fabricating a linked[] entry from them would make
 *    tappable evidence that resolves to the wrong (or no) record. */
export function mapAuditEventToRecord(event: BrainAuditEvent, latestAnchor: BrainAnchor | undefined): AuditRecord {
  const { eventType, summary } = classify(event);
  const createdMs = new Date(event.created_at).getTime();
  const amount = amountFrom(event);
  const counterparty =
    typeof event.inputs.destination_counterparty_id === "string"
      ? event.inputs.destination_counterparty_id
      : undefined;

  const assistantActivity = isAssistantActivity({ eventType, subtype: event.action });

  const step: LifecycleStep = {
    label: summary,
    timestamp: label(createdMs),
    kind:
      (eventType === "flagged" && !assistantActivity) || eventType === "rejected"
        ? "alert"
        : "ok",
    // Raw machine ids (user_01KY…) never render inline as if they were names —
    // pass the actor through only when it is human-readable.
    actor: event.actor !== "system" ? humanReadableActor(event.actor) : undefined,
  };

  return {
    id: event.id,
    eventType,
    subtype: event.action,
    summary,
    counterparty,
    amount,
    actor: event.actor,
    occurredAtLabel: label(createdMs),
    occurredAtMs: createdMs,
    // rowSubtitle left unset - AuditLogPage's own fallback formats amount
    // through useCurrency(), which this module has no access to.
    lifecycle: [step],
    // ponytail: rich linked-evidence (documents/vendors/rules resolved from a
    // live audit event) stays a follow-up until those stores are also live -
    // see BrainMVB-data-integration/CLAUDE.md's linked-evidence contract.
    linked: [],
    anchor: anchorFor(event, latestAnchor),
  };
}

export function useBrainAuditRecords() {
  const events = useQuery<AuditEventsResponse>({
    queryKey: ["/api/brain/audit/events?limit=100"],
    retry: false,
  });
  const anchor = useQuery<BrainAnchor>({
    queryKey: ["/api/brain/audit/anchor/latest"],
    retry: false,
  });

  const records = (events.data?.events ?? [])
    .map((e) => mapAuditEventToRecord(e, anchor.data))
    .sort((a, b) => b.occurredAtMs - a.occurredAtMs);

  return {
    isLoading: events.isLoading || anchor.isLoading,
    isError: events.isError,
    records,
  };
}
