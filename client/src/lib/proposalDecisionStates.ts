import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

/* ── Authoritative decision state (POST /v1/proposals/decision-states/query) ──
   Whether a proposal has already been decided is a fact about the proposal row
   in brain-core, not something to be reconstructed here. This module asks core
   directly.

   What it replaces: the Inbox used to derive the same answer by walking the
   audit feed and replaying every `proposal.decided` event in order. That made
   the answer a function of how much history had been loaded — a decision on an
   older page was invisible, so a decided proposal kept appearing in the
   unresolved queue until enough pages had been read. The endpoint reads the
   proposal and PaymentIntent rows directly and says so in its own description:
   "This route never derives state from audit history."

   What it does NOT replace: the decision receipts in ./decisionReceipts.ts.
   Those cover the seconds between "core accepted this decision" and "any
   authoritative read reflects it", which is a different window and still real.

   Contract confirmed against the DEPLOYED spec (api.brain.fi/v1/openapi.yaml,
   and identical on staging), not a merged PR:
     • scope execution:read, tenant-scoped, read-only despite being a POST
     • body { proposal_ids: [...] }, 1..100 entries, unique
     • ids must match ^(prop|pi)_<26-char ULID>$
     • response { states: [...] }, one per requested id, in request order
     • unknown AND cross-tenant ids both come back found=false              */

/** The id shape the endpoint accepts. Enforced by the request schema, so this
 *  is a hard gate rather than a nicety: see `queryableProposalIds`. */
export const PROPOSAL_ID_PATTERN = /^(prop|pi)_[0-9A-HJKMNP-TV-Z]{26}$/;

/** `maxItems` on the request schema. Larger id sets are split across calls. */
export const DECISION_STATE_BATCH_LIMIT = 100;

export const DECISION_STATES_QUERY_KEY = "brain/proposals/decision-states" as const;

/** One row of the authoritative answer, in this codebase's naming. */
export interface ProposalDecisionState {
  proposalId: string;
  /** False for an id core has no row for, including another tenant's. */
  found: boolean;
  /** "decided" | "pending", or null when core declines to characterise it. */
  decisionState: "pending" | "decided" | null;
  status: string | null;
  decision: string | null;
  /** The durable `proposal.decided` audit id, copied onto the proposal row. */
  auditId: string | null;
  decidedAt: string | null;
}

/**
 * Ids that can actually be sent: deduplicated, shape-checked, and sorted.
 *
 * The shape check is not defensive politeness. `proposal_ids` is validated by
 * the request schema, so ONE malformed id fails the whole batch with a 400 —
 * every other proposal in that call loses its authoritative answer because of
 * an unrelated neighbour. Sending only well-formed ids keeps one odd id from
 * taking the rest of the queue down with it.
 *
 * Sorting makes the query key stable: the same id set in a different order is
 * the same request, not a cache miss and a refetch on every render.
 */
export function queryableProposalIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && PROPOSAL_ID_PATTERN.test(id)) seen.add(id);
  }
  return [...seen].sort();
}

/** The ids left out by `queryableProposalIds`. They are not unimportant — no
 *  authoritative answer exists for them, so callers must treat them as unknown
 *  (and therefore still-open) rather than quietly dropping them. */
export function unqueryableProposalIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !PROPOSAL_ID_PATTERN.test(id)) seen.add(String(id));
  }
  return [...seen].sort();
}

export function chunkProposalIds(
  ids: readonly string[],
  size: number = DECISION_STATE_BATCH_LIMIT,
): string[][] {
  const step = Math.max(1, Math.floor(size));
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += step) out.push(ids.slice(i, i + step));
  return out;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asDecisionState(value: unknown): "pending" | "decided" | null {
  return value === "pending" || value === "decided" ? value : null;
}

/**
 * Read the response into a map keyed by proposal id.
 *
 * Keyed by id, NOT by position, even though the contract promises request
 * order. Position-matching is only correct while the array is exactly as long
 * as the request; if it is ever short or filtered, every state after the gap is
 * attributed to the wrong proposal — and the visible symptom of that is a
 * pending proposal being hidden as decided, which is precisely the failure this
 * whole change exists to prevent. Ids that were not requested are ignored.
 */
export function parseDecisionStateResponse(
  body: unknown,
  requested: readonly string[],
): Map<string, ProposalDecisionState> {
  const out = new Map<string, ProposalDecisionState>();
  const rows = (body as { states?: unknown } | null | undefined)?.states;
  if (!Array.isArray(rows)) return out;
  const wanted = new Set(requested);
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const proposalId = asString(r.proposal_id);
    if (!proposalId || !wanted.has(proposalId)) continue;
    out.set(proposalId, {
      proposalId,
      /* Anything that is not literally true is not a found row. An absent
         `found` must not read as present. */
      found: r.found === true,
      decisionState: asDecisionState(r.decision_state),
      status: asString(r.status),
      decision: asString(r.decision),
      auditId: asString(r.audit_id),
      decidedAt: asString(r.decided_at),
    });
  }
  return out;
}


/**
 * Does this row actually tell us whether the proposal is settled?
 *
 * Three rows come back carrying no usable answer, and all three have to be
 * counted as gaps rather than as quiet "not decided"s:
 *   • found:false — core has no such row for this tenant, even though the id
 *     came out of this tenant's own proposal feed. That is a contradiction, and
 *     a contradiction is an unknown.
 *   • decision_state:null — core declined to say.
 *   • "decided" alongside decision "undo" — undo is the decision that REOPENS
 *     a record, so the row disagrees with itself.
 *
 * Treating these as answers is how an overcount ends up presented as an exact
 * figure: the hide switch correctly leaves the row visible, and then the
 * headline count claims to know that number is right.
 */
export function hasAuthoritativeAnswer(state: ProposalDecisionState | undefined): boolean {
  if (!state || !state.found) return false;
  if (state.decisionState === "pending") return true;
  if (state.decisionState !== "decided") return false;
  return state.decision !== "undo";
}

/**
 * Is this proposal settled, as far as core is concerned?
 *
 * Every uncertain answer resolves to false, because false is the direction that
 * shows work rather than hiding it: an unfound id, a null decision_state, and a
 * failed read all mean "no authoritative answer", and none of them is grounds
 * for taking a row off the operator's queue.
 */
export function isDecidedState(state: ProposalDecisionState | undefined): boolean {
  return hasAuthoritativeAnswer(state) && state!.decisionState === "decided";
}

export interface ProposalDecisionStatesResult {
  /** Authoritative rows, keyed by proposal id. Absent = no answer. */
  states: Map<string, ProposalDecisionState>;
  /** Ids core reports as settled. The hide switch. */
  decidedIds: Set<string>;
  isLoading: boolean;
  isError: boolean;
  /** Requested ids with no authoritative answer: a failed batch, an id the
   *  endpoint cannot accept, an id missing from the response, or a row that
   *  came back without a usable state. They are shown as open; a count built on
   *  them is conservative, not exact. */
  unansweredIds: string[];
}

/** One batch's outcome, in the only terms the aggregation below cares about. */
export interface DecisionStateBatchOutcome {
  isPending: boolean;
  isError: boolean;
  data?: Map<string, ProposalDecisionState>;
}

const EMPTY_STATES: Map<string, ProposalDecisionState> = new Map();
const EMPTY_IDS: Set<string> = new Set();
const EMPTY_LIST: string[] = [];

/**
 * Fold the per-batch outcomes into one answer.
 *
 * Pure and exported so the mixed cases that matter — one batch succeeded while
 * another failed, a row came back with nothing usable in it — can be tested
 * without a renderer.
 */
export function aggregateDecisionStates(
  batches: readonly (readonly string[])[],
  outcomes: readonly (DecisionStateBatchOutcome | undefined)[],
  unqueryable: readonly string[],
): ProposalDecisionStatesResult {
  if (batches.length === 0) {
    return {
      states: EMPTY_STATES,
      decidedIds: EMPTY_IDS,
      isLoading: false,
      isError: false,
      unansweredIds: unqueryable.length > 0 ? [...unqueryable] : EMPTY_LIST,
    };
  }

  const states = new Map<string, ProposalDecisionState>();
  const decidedIds = new Set<string>();
  const unanswered = new Set<string>(unqueryable);
  let isLoading = false;
  let isError = false;

  batches.forEach((batch, i) => {
    const outcome = outcomes[i];
    if (!outcome || outcome.isPending) {
      /* Still in flight. NOT unanswered — the caller reads isLoading, and
         narrating a gap that has not happened yet is its own wrong answer. */
      isLoading = true;
      return;
    }
    if (outcome.isError || !outcome.data) {
      /* One batch failing costs only its own ids their answers. The batches
         beside it keep theirs, which is the whole reason they are separate
         queries rather than one request. */
      isError = true;
      for (const id of batch) unanswered.add(id);
      return;
    }
    for (const id of batch) {
      const state = outcome.data.get(id);
      if (!hasAuthoritativeAnswer(state)) {
        unanswered.add(id);
        /* Keep the row anyway when there was one: a caller that wants to show
           what core DID say about it should not have to re-fetch. */
        if (state) states.set(id, state);
        continue;
      }
      states.set(id, state!);
      if (isDecidedState(state)) decidedIds.add(id);
    }
  });

  return {
    states,
    decidedIds,
    isLoading,
    isError,
    unansweredIds: [...unanswered].sort(),
  };
}

async function fetchDecisionStates(ids: string[]): Promise<Map<string, ProposalDecisionState>> {
  const res = await fetch("/api/brain/proposals/decision-states/query", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal_ids: ids }),
  });
  if (!res.ok) {
    throw new Error(`decision-states query failed: ${res.status}`);
  }
  return parseDecisionStateResponse(await res.json().catch(() => null), ids);
}

/**
 * Ask core which of these proposals have already been decided.
 *
 * One query per batch of 100 via `useQueries`, so a single oversized inbox does
 * not become a single oversized request, and one failing batch does not discard
 * the answers the others returned.
 *
 * The batch's ids sit in the query key AS AN ARRAY, not as a joined string, so
 * a decision can invalidate the one batch holding that proposal instead of
 * every batch on screen. On a large inbox the difference is one request versus
 * fifty, per decision.
 */
export function useProposalDecisionStates(ids: readonly string[]): ProposalDecisionStatesResult {
  const idKey = useMemo(() => queryableProposalIds(ids).join(","), [ids]);
  const unqueryable = useMemo(() => unqueryableProposalIds(ids), [ids]);
  const batches = useMemo(
    () => chunkProposalIds(idKey === "" ? [] : idKey.split(",")),
    [idKey],
  );

  const results = useQueries({
    queries: batches.map((batch) => ({
      queryKey: [DECISION_STATES_QUERY_KEY, batch] as const,
      queryFn: () => fetchDecisionStates(batch),
      /* The answer changes when a decision is recorded, and the decision
         mutation invalidates the batch holding it. Between those moments it is
         stable enough not to need a poll, but stale enough that a remount
         should re-ask. */
      staleTime: 30_000,
    })),
  });

  /* useQueries hands back a NEW array every render, so memoising on it would
     memoise nothing — and the Set this hook returns is a dependency of the
     Inbox's row-building memo, which would then rebuild the entire timeline on
     every render. This signature changes only when a batch actually resolves,
     fails, or refetches, which is the only time the answer can differ. */
  const resultsKey = results
    .map((r) => `${r.status}:${r.dataUpdatedAt ?? 0}:${r.errorUpdatedAt ?? 0}`)
    .join("|");

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `results` is tracked through resultsKey (see above).
  return useMemo(
    () => aggregateDecisionStates(batches, results, unqueryable),
    [batches, resultsKey, unqueryable],
  );
}

/**
 * Does this react-query key belong to the decision-state batch holding `id`?
 *
 * Used as the invalidation predicate after a decision. It exists as a named,
 * exported function rather than an inline lambda because the cheap version of
 * it — matching the key PREFIX — silently re-POSTs every batch on screen, and
 * that regression is invisible in the UI. Pinning it here makes it testable.
 */
export function isDecisionStateBatchFor(queryKey: readonly unknown[], id: string): boolean {
  if (queryKey[0] !== DECISION_STATES_QUERY_KEY) return false;
  const batch = queryKey[1];
  return Array.isArray(batch) && batch.includes(id);
}
