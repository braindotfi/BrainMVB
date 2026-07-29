import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuditRecord, AuditEventType, AnchorProof, LifecycleStep } from "./auditTypes";
import { isAssistantActivity, humanReadableActor } from "./auditTypes";
import { matchCannedPrompt } from "@shared/cannedPrompts";
import { explorerTxUrl, normalizeTxHash } from "./explorer";
import type { AssistantQuestion } from "@shared/schema";

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
  /* NULL until the on-chain anchor() tx has actually mined — a merkle_root is
     computed when the audit window's tree is built, BEFORE anything is
     broadcast to Base. brain-core only writes these on a confirmed receipt. */
  onchain_tx_hash: string | null;
  onchain_block_number: number | null;
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
  "wiki.question": {
    eventType: "flagged",
    // brain-core guarantees inputs.question on wiki.question events (see
    // api-surface contract: audit_event_contract…action_guarantees). The
    // question IS the record's identity, so it is the title — truncated to
    // card length here; the full text rides on the lifecycle step's note.
    summary: (e) => {
      const q = wikiQuestionText(e);
      if (!q) return "Assistant asked a question";
      /* App-generated canned prompts get their human title; user-typed
         questions keep rendering their own text, truncated for the card. */
      const canned = matchCannedPrompt(q);
      return canned ? canned.title : truncateForCard(q);
    },
  },
  "member.changed": { eventType: "flagged", summary: () => "Team member updated" },
  "raw.ingest.new": { eventType: "system_activity", summary: () => "New data ingested: Brain pulled in new records to process" },
  "raw.ingest.deduplicated": { eventType: "system_activity", summary: () => "Duplicate data: already ingested previously, skipped" },
};

/** Card-friendly single-line truncation for titles sourced from free text
 *  (currently the wiki.question question). Exported for tests. */
export const CARD_TITLE_MAX = 72;
export function truncateForCard(text: string, max: number = CARD_TITLE_MAX): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

/** The real question text on a wiki.question event, when present and usable.
 *  Defensive: the contract guarantees inputs.question, but older records may
 *  predate it — fall back to the generic title rather than rendering junk. */
function wikiQuestionText(e: BrainAuditEvent): string | undefined {
  if (e.action !== "wiki.question") return undefined;
  const q = e.inputs?.question;
  return typeof q === "string" && q.trim() ? q.trim() : undefined;
}

/** `proposal.decided`'s decision-time snapshot of what the proposal was about
 *  (services/execution/src/proposals/decision-service.ts's
 *  proposalActionSnapshot, carried in `outputs.proposal_summary` - the only
 *  place GET /audit/events actually returns it; beforeState/afterState exist
 *  server-side but serializeEvent() never surfaces them). Absent on audit
 *  events emitted before this shipped, and on decisions taken on the
 *  money-path (payment_intent.*), which doesn't emit this key at all -
 *  always optional, never assumed present. */
interface ProposalDecisionSummary {
  proposing_agent?: string;
  narrative?: string;
  summary?: string;
  risk_band?: string;
  finding_type?: string;
  severity?: string;
  rule_id?: string;
  recommended_remediation?: string;
  affected_entities?: Array<{ kind?: string; ref?: string }>;
}

function proposalSummaryFrom(e: BrainAuditEvent): ProposalDecisionSummary | undefined {
  const raw = e.outputs?.["proposal_summary"];
  return raw !== null && typeof raw === "object" ? (raw as ProposalDecisionSummary) : undefined;
}

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
    decision === "reject"
      ? "rejected"
      : decision === "acknowledge"
        ? "acknowledged"
        : decision === "undo"
          ? "flagged"
          : "approved";
  const fallback = `Proposal decided - ${decision}${proposalId ? ` (${proposalId})` : ""}`;
  // Prefer the real narrative brain-core now snapshots at decision time
  // (e.g. "Compliance review found policy_violation with high severity...").
  // Falls back to the old opaque id-only line for events predating this.
  const narrative = proposalSummaryFrom(e)?.narrative;
  return { eventType, summary: narrative && narrative.trim() ? narrative.trim() : fallback };
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
    timeZoneName: "short",
  });
}

/** Per-event inclusion proof from GET /audit/event/{id} — computed by
 *  brain-core against the anchor window that ACTUALLY contains the event
 *  (not just the latest one). Same null-until-mined semantics as BrainAnchor:
 *  anchor_tx_hash/anchor_block are null until the on-chain anchor() tx has a
 *  confirmed receipt. */
export interface BrainInclusionProof {
  merkle_root: string | null;
  merkle_proof?: string[];
  anchor_tx_hash: string | null;
  anchor_block: number | null;
}
export interface BrainAuditEventDetail {
  event: BrainAuditEvent;
  inclusion_proof: BrainInclusionProof | null;
}

/** AnchorProof from a per-event inclusion proof. Authoritative when available:
 *  brain-core resolves coverage against the correct (possibly older) anchor
 *  window, so this never suffers anchorFor()'s latest-window-only limitation.
 *  Same three-state gate: anchored ⇔ anchor_tx_hash !== null, never a Merkle
 *  root or timestamp. */
export function anchorFromInclusionProof(
  auditId: string,
  proof: BrainInclusionProof | null | undefined,
  eventCreatedAt?: string,
): AnchorProof {
  if (!proof || !proof.merkle_root) return { status: "pending_next_batch", auditId };
  const recordedLabel = eventCreatedAt ? label(new Date(eventCreatedAt).getTime()) : undefined;
  const txHash = proof.anchor_tx_hash?.trim() || null;
  if (!txHash) {
    return {
      status: "recorded_pending_anchor",
      auditId,
      merkleRoot: proof.merkle_root,
      recordedAtLabel: recordedLabel,
    };
  }
  const baseTx = normalizeTxHash(txHash);
  return {
    status: "anchored",
    auditId,
    merkleRoot: proof.merkle_root,
    baseTx,
    block: proof.anchor_block ?? undefined,
    anchoredAtLabel: recordedLabel,
    verifyHref: explorerTxUrl(baseTx),
  };
}

/** Anchor state for a record, gated on brain-core's REAL signals:
 *  - The record is covered by the latest anchor window (its created_at falls
 *    within [period_start, period_end]) → the Merkle tree includes it, so it is
 *    "recorded & cryptographically verifiable".
 *  - It is ANCHORED only when onchain_tx_hash is additionally non-null — a
 *    merkle_root exists the moment the window's tree is built, BEFORE anything
 *    is broadcast; brain-core writes the tx hash/block only on a confirmed
 *    on-chain receipt. Covered-but-no-tx → "recorded_pending_anchor": no
 *    Verify link, no immutability claim, "Recorded at" (not "Anchored at").
 *
 *  KNOWN LIMITATION (list view only): coverage is computed against ONLY the
 *  most recent anchor window (/audit/anchor/latest returns a single row).
 *  Events covered by an EARLIER window are misclassified pending_next_batch
 *  here — coverage appears to "regress" as new windows open, which is
 *  impossible in reality. The detail popup avoids this by fetching the
 *  per-event /audit/event/{id} inclusion_proof (anchorFromInclusionProof
 *  above), but at 90+ list rows that endpoint is impractical and N requests
 *  is not an acceptable workaround. Correct list-level coverage needs a
 *  brain-core batched endpoint (all anchor windows for the tenant, or a bulk
 *  coverage lookup) — tracked in replit.md "Known upstream gaps". Until then
 *  the list may UNDER-claim (show Pending for covered events) but never
 *  over-claims. */
function anchorFor(event: BrainAuditEvent, latest: BrainAnchor | undefined): AnchorProof {
  const auditId = event.id;
  if (!latest || !latest.merkle_root) return { status: "pending_next_batch", auditId };
  const createdMs = new Date(event.created_at).getTime();
  const covered =
    createdMs <= new Date(latest.period_end).getTime() &&
    createdMs >= new Date(latest.period_start).getTime();
  if (!covered) return { status: "pending_next_batch", auditId };
  const txHash = latest.onchain_tx_hash?.trim() || null;
  if (!txHash) {
    return {
      status: "recorded_pending_anchor",
      auditId,
      merkleRoot: latest.merkle_root,
      recordedAtLabel: label(new Date(latest.period_end).getTime()),
    };
  }
  const baseTx = normalizeTxHash(txHash);
  return {
    status: "anchored",
    auditId,
    merkleRoot: latest.merkle_root,
    baseTx,
    block: latest.onchain_block_number ?? undefined,
    anchoredAtLabel: label(new Date(latest.period_end).getTime()),
    verifyHref: explorerTxUrl(baseTx),
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
  /* Synthetic bootstrap identities (machine-generated placeholders, not
     people): emails at the reserved .invalid TLD or with a bootstrap+
     local-part prefix. Never render these — omit honestly instead. */
  const isSynthetic = (value: string): boolean => {
    const lower = value.toLowerCase();
    return /@[^@\s]+\.invalid$/.test(lower) || lower.startsWith("bootstrap+");
  };
  const pick = (o: Record<string, unknown>): string | null => {
    /* brain-core /v1/members/{id} returns camelCase displayName; older
       shapes use display_name. Check both before falling back to email. */
    const name = o.display_name ?? o.displayName ?? o.name ?? o.email;
    if (typeof name !== "string" || !name.trim()) return null;
    const trimmed = name.trim();
    return isSynthetic(trimmed) ? null : trimmed;
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

/** Map an actor_ref.lookup path to the BFF path that can actually resolve it.
 *
 *  Member lookups (`/v1/members/{id}`) pass straight through. AGENT lookups do
 *  NOT: brain-core emits `/v1/agents/{id}` carrying a runtime ULID
 *  (`agent_01J…`), but its own `/v1/agents/{agent_id}` route is the agent
 *  *catalog*, keyed by agent_key ("collections", "treasury", …) — it answers
 *  404 `agent_not_found` for every ULID. Registered runtime agents live at
 *  `/v1/execution/agents/{id}`, which resolves those ULIDs and returns
 *  display_name. So the emitted lookup is upstream-wrong and we re-point it.
 *  Exported for tests. */
export function bffPathForActorLookup(lookup: string): string {
  const path = lookup.replace(/^\/v1/, "");
  const agent = /^\/agents\/([^/]+)\/?$/.exec(path);
  return `/api/brain${agent ? `/execution/agents/${agent[1]}` : path}`;
}

/** Resolve an actor_ref.lookup path (/v1/members/{id} or /v1/agents/{id})
 *  through the BFF's generic GET passthrough (same route /audit/events uses,
 *  member/session token). Returns null on any failure — callers then fall back
 *  to omitting the actor rather than showing a raw id. */
async function fetchActorName(lookup: string): Promise<string | null> {
  try {
    const resp = await fetch(bffPathForActorLookup(lookup), { credentials: "include" });
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

  /* Full, untruncated question for wiki.question records: carried on the
     lifecycle step's note so the popup can show the whole thing while list
     cards keep the truncated title. Only set when truncation actually
     dropped text — otherwise the note would just repeat the title. */
  const fullQuestion = wikiQuestionText(event);

  /* proposal.decided-only: the decision-time snapshot (see
     proposalSummaryFrom above) - undefined for every other action, and for
     proposal.decided events emitted before brain-core started attaching it. */
  const proposalSummary = event.action === "proposal.decided" ? proposalSummaryFrom(event) : undefined;
  const proposalId =
    event.action === "proposal.decided" && typeof event.inputs.proposal_id === "string"
      ? event.inputs.proposal_id
      : undefined;
  /* Remediation/rule context reads as a second line under the narrative
     headline - only set when it says something the summary doesn't already. */
  const proposalNote =
    proposalSummary?.recommended_remediation &&
    proposalSummary.recommended_remediation !== summary
      ? proposalSummary.recommended_remediation
      : undefined;

  const step: LifecycleStep = {
    label: summary,
    timestamp: label(createdMs),
    kind:
      (eventType === "flagged" && !assistantActivity) || eventType === "rejected"
        ? "alert"
        : "ok",
    actor: event.actor !== "system" ? resolvedName ?? humanReadableActor(event.actor) : undefined,
    note: fullQuestion && fullQuestion !== summary ? fullQuestion : proposalNote,
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
    // Real linked-evidence for proposal.decided only (documents/vendors/rules
    // resolved from a live audit event otherwise stays a follow-up until
    // those stores are also live - see BrainMVB-data-integration/CLAUDE.md's
    // linked-evidence contract). The popup already gracefully falls back to
    // a plain, non-tappable "(proposal unavailable)" chip when the id
    // doesn't resolve against the demo proposal store (AuditRecordPopup.tsx),
    // so populating this for live tenants is safe today even though it
    // won't be tappable there until openProposalDetail/resolveProposal
    // learns to resolve live GET /v1/proposals/{id} data, not just the
    // demo-only mock corpus.
    linked: proposalId
      ? [{ kind: "proposal" as const, label: proposalId, refId: proposalId }]
      : [],
    anchor: anchorFor(event, latestAnchor),
    rawQuestion: fullQuestion,
  };
}

/* Local assistant questions that missed brain-core audit (Anthropic fallback) */
interface LocalQuestionsResponse {
  questions: AssistantQuestion[];
}

function localQuestionToRecord(q: AssistantQuestion): AuditRecord {
  const createdMs = new Date(q.createdAt ?? 0).getTime();
  const question = q.question.trim();
  const canned = matchCannedPrompt(question);
  const summary = canned ? canned.title : truncateForCard(question);
  const step: LifecycleStep = {
    label: summary,
    timestamp: label(createdMs),
    kind: "ok",
    note: question !== summary ? question : undefined,
  };
  return {
    id: `local-question-${q.id}`,
    eventType: "system_activity",
    subtype: "wiki.question",
    coreEventType: "assistant_activity",
    summary,
    actor: "Assistant",
    occurredAtLabel: label(createdMs),
    occurredAtMs: createdMs,
    lifecycle: [step],
    linked: [],
    anchor: { status: "pending_next_batch", auditId: `local-question-${q.id}` },
    rawQuestion: question,
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
  const localQuestions = useQuery<LocalQuestionsResponse>({
    queryKey: ["/api/assistant/questions"],
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

  /* Merge brain-core audit events with locally-recorded assistant questions.
     Deduplication: suppress a local synthetic record when its raw question
     text matches a brain-core wiki.question event within a 5-minute window.
     Uses `rawQuestion` (never truncated, always present on assistant records)
     so short questions and canned prompts dedup correctly. Per-question
     timestamp matching prevents false positives from unrelated wiki events.
     The local id prefix `local-question-` ensures no collision with brain-core ids. */
  const records = useMemo(() => {
    const brainRecords = (events.data?.events ?? [])
      .map((e) => mapAuditEventToRecord(e, anchor.data, actorLookups.data));
    /* Map: normalized question text → Set of timestamps from brain-core wiki.question events */
    const wikiTsByQuestion = new Map<string, Set<number>>();
    for (const r of brainRecords) {
      if (r.subtype === "wiki.question" && r.rawQuestion) {
        const key = r.rawQuestion.trim().toLowerCase();
        const set = wikiTsByQuestion.get(key) ?? new Set();
        set.add(r.occurredAtMs);
        wikiTsByQuestion.set(key, set);
      }
    }
    const FIVE_MIN_MS = 5 * 60 * 1000;
    const localRecords = (localQuestions.data?.questions ?? [])
      .map(localQuestionToRecord)
      .filter((r) => {
        if (!r.rawQuestion) return true;
        const key = r.rawQuestion.trim().toLowerCase();
        const coreTs = wikiTsByQuestion.get(key);
        if (!coreTs) return true;
        // Drop local record only when a same-question brain-core event exists
        // within 5 minutes — wide enough to cover upstream audit latency.
        for (const t of coreTs) {
          if (Math.abs(t - r.occurredAtMs) <= FIVE_MIN_MS) return false;
        }
        return true;
      });
    return [...brainRecords, ...localRecords]
      .sort((a, b) => b.occurredAtMs - a.occurredAtMs);
  }, [events.data, anchor.data, actorLookups.data, localQuestions.data]);

  return {
    isLoading: events.isLoading || anchor.isLoading || localQuestions.isLoading,
    isError: events.isError,
    records,
  };
}
