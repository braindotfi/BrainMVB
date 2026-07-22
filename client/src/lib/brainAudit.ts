import { useMemo } from "react";
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

/** brain-core's actor reference on every audit event: display_name/email are
 *  present when the emitting service captured them inline; `lookup` is a
 *  relative resolution path (/v1/members/{id} for user actors, /v1/agents/{id}
 *  for agent actors) when it wasn't. */
export interface BrainActorRef {
  id: string;
  type: string;
  display_name?: string;
  email?: string;
  lookup?: string;
}

export interface BrainAuditEvent {
  id: string;
  tenant_id: string;
  layer: string;
  actor: string;
  actor_ref?: BrainActorRef;
  action: string;
  /* brain-core's authoritative classification, present on every event —
     unset events default to system_activity server-side. This, not the local
     ACTION_MAP, decides flagged vs. informational. */
  event_type?: "system_activity" | "assistant_activity" | "flagged" | string;
  category?: string;
  severity?: string;
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
  "raw.ingest.new": { eventType: "system_activity", summary: () => "New data ingested — Brain pulled in new records to process" },
  "raw.ingest.deduplicated": { eventType: "system_activity", summary: () => "Duplicate data — already ingested previously, skipped" },
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

/** brain-core's own event_type mapped onto the client bucket, when present.
 *  assistant_activity records get eventType system_activity here (both are
 *  informational, non-actionable); the ASSISTANT ACTIVITY tag itself is driven
 *  by coreEventType via isAssistantActivity, not the eventType bucket. */
function coreBucket(e: BrainAuditEvent): AuditEventType | undefined {
  switch (e.event_type) {
    case "flagged":
      return "flagged";
    case "system_activity":
    case "assistant_activity":
      return "system_activity";
    default:
      return undefined;
  }
}

/** Event-type + summary derivation. Risk classification (flagged vs.
 *  informational) is brain-core's job — its authoritative `event_type` field
 *  is the primary signal. The local ACTION_MAP only (a) supplies richer
 *  DECISION types (approved/rejected/…) that core's 3-bucket field cannot
 *  express, and (b) provides human-readable summaries per action; unmapped
 *  actions keep the raw action id as their honest summary. */
function classify(e: BrainAuditEvent): { eventType: AuditEventType; summary: string } {
  if (e.action === "proposal.decided") return classifyProposalDecided(e);
  const known = ACTION_MAP[e.action];
  const summary = known ? known.summary(e) : e.action;
  // Mapped decision types (approved/rejected/etc) are richer than core's
  // buckets and stay authoritative for their tabs.
  if (known && known.eventType !== "flagged" && known.eventType !== "system_activity") {
    return { eventType: known.eventType, summary };
  }
  // Otherwise brain-core's event_type decides flagged vs. informational.
  // Events missing the field (older records): a mapped-flagged action keeps
  // its mapping; an UNMAPPED action defaults to system_activity — matching
  // brain-core's own server-side default, never a fabricated "flagged".
  const fallback: AuditEventType = known ? known.eventType : "system_activity";
  return { eventType: coreBucket(e) ?? fallback, summary };
  // "Auto-Approved" and "Postponed" tabs stay honestly near-empty: brain-core
  // has NO `auto_approved` or `postponed` audit action (verified above) —
  // "auto" clearance is a derived /actions status (proposed|approved
  // PaymentIntent, see services/execution/src/actions/mapper.ts:17-19), not
  // its own audit event, and "postpone" is a BrainMVB-local review-queue
  // state that never calls brain-core (no server route). `payment_intent.
  // paused`/`.cancelled` DO exist but are a different concept (an ops
  // kill-switch hold and a pre-approval agent cancel, respectively) — mapping
  // either to "postponed" would be inventing an equivalence brain-core
  // doesn't make, so they're left unmapped until brain-core grows a real
  // auto-approval / postpone event to key off of.
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
/** Inline display data on an actor_ref, when the emitting service captured it. */
function inlineActorDisplay(ref: BrainActorRef | undefined): string | undefined {
  const name = ref?.display_name?.trim() || ref?.email?.trim();
  return name || undefined;
}

/** Extract a display name from an actor-lookup response. Handles both shapes
 *  brain-core returns: a member object with top-level display_name/name/email,
 *  and an agent detail payload nested as { definition, registration }. Exported
 *  for tests. Returns null when no display data is present — never a raw id. */
export function extractActorName(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const pick = (o: Record<string, unknown>): string | null => {
    const name = o.display_name ?? o.name ?? o.email;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  };
  const direct = pick(obj);
  if (direct) return direct;
  for (const key of ["definition", "registration", "member", "agent"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object") {
      const found = pick(nested as Record<string, unknown>);
      if (found) return found;
    }
  }
  return null;
}

/** Resolve an actor_ref.lookup path (/v1/members/{id} or /v1/agents/{id})
 *  through the BFF's generic GET passthrough (same route /audit/events uses,
 *  member/session token). Returns null on any failure — callers then fall back
 *  to omitting the actor rather than showing a raw id. */
async function fetchActorName(lookup: string): Promise<string | null> {
  try {
    const path = `/api/brain${lookup.replace(/^\/v1/, "")}`;
    const resp = await fetch(path, { credentials: "include" });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    return extractActorName(data);
  } catch {
    return null;
  }
}

export function mapAuditEventToRecord(
  event: BrainAuditEvent,
  latestAnchor: BrainAnchor | undefined,
  resolvedActors?: Record<string, string | null>,
): AuditRecord {
  const { eventType, summary } = classify(event);
  const createdMs = new Date(event.created_at).getTime();
  const amount = amountFrom(event);
  const counterparty =
    typeof event.inputs.destination_counterparty_id === "string"
      ? event.inputs.destination_counterparty_id
      : undefined;

  const assistantActivity = isAssistantActivity({
    eventType,
    subtype: event.action,
    coreEventType: event.event_type,
  });

  /* Actor resolution order (raw ids NEVER render as a substitute):
     1. actor_ref.display_name / .email captured inline by the emitting service;
     2. the cached result of resolving actor_ref.lookup via the BFF;
     3. last resort: the raw actor string, which downstream surfaces filter
        through humanReadableActor() (so machine ids get omitted, not shown). */
  const ref = event.actor_ref;
  const resolvedName =
    inlineActorDisplay(ref) ??
    (ref?.lookup ? resolvedActors?.[ref.lookup] ?? undefined : undefined) ??
    undefined;
  const displayActor = resolvedName ?? event.actor;

  const step: LifecycleStep = {
    label: summary,
    timestamp: label(createdMs),
    kind:
      (eventType === "flagged" && !assistantActivity) || eventType === "rejected"
        ? "alert"
        : "ok",
    actor: event.actor !== "system" ? resolvedName ?? humanReadableActor(event.actor) : undefined,
  };

  return {
    id: event.id,
    eventType,
    subtype: event.action,
    coreEventType: event.event_type,
    summary,
    counterparty,
    amount,
    actor: displayActor,
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

  /* Distinct actor_ref.lookup paths that still need resolution (no inline
     display_name/email). Deduped + sorted so the query key is stable and each
     actor is fetched once per session, not per record or per render. */
  const lookups = useMemo(() => {
    const set = new Set<string>();
    for (const e of events.data?.events ?? []) {
      const ref = e.actor_ref;
      if (ref?.lookup && !inlineActorDisplay(ref)) set.add(ref.lookup);
    }
    return Array.from(set).sort();
  }, [events.data]);

  const actorLookups = useQuery<Record<string, string | null>>({
    queryKey: ["brain-actor-lookups", lookups],
    enabled: lookups.length > 0,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const entries = await Promise.all(
        lookups.map(async (l) => [l, await fetchActorName(l)] as const),
      );
      return Object.fromEntries(entries);
    },
  });

  const records = useMemo(
    () =>
      (events.data?.events ?? [])
        .map((e) => mapAuditEventToRecord(e, anchor.data, actorLookups.data))
        .sort((a, b) => b.occurredAtMs - a.occurredAtMs),
    [events.data, anchor.data, actorLookups.data],
  );

  return {
    isLoading: events.isLoading || anchor.isLoading,
    isError: events.isError,
    records,
  };
}
