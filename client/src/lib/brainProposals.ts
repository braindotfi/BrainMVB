import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { parseCoreError } from "./approvalRejections";
import { clearDecisionReceipt, recordDecisionReceipt } from "./decisionReceipts";
import { isDecisionStateBatchFor } from "./proposalDecisionStates";
import type { AgentKey } from "./agentProposals";
import {
  fetchBrainRead,
  isBrainRateLimitError,
  reportBrainReadCooldownIfActive,
  throwBrainRateLimitIfNeeded,
  useBrainReadCooldown,
} from "./rateLimit";

/* ── Live brain-core agent proposals (GET/POST /v1/proposals*) ────────────────
   Non-financial agent outputs (vendor risk, collections, treasury, etc.) that a
   human reviews and decides on - distinct from the PaymentIntent queue in
   brainQueue.ts. Contract MERGED via brain-core #268-271 and LIVE on
   api.brain.fi (GET /v1/proposals returns 401, i.e. deployed, not 404). Shape
   verified against brain-core source: services/execution/src/proposals/
   read-model.ts + decision-service.ts on main. */

/** Every public type in brain-core's read model (docs/contracts/proposals-read-model.md,
 *  "Public Types"). The eight advisory domains after `fraud_anomaly` were promoted by
 *  the same contract; they reach this client through the identical row shape, so they
 *  render through the shared card rather than a fallback view. */
export type KnownProposalType =
  | "vendor_risk"
  | "payment"
  | "collections"
  | "treasury"
  | "cash_forecast"
  | "dispute"
  | "compliance"
  | "revenue_intel"
  | "reconciliation"
  | "subscription"
  | "fraud_anomaly"
  | "bill_management"
  | "debt_optimization"
  | "financial_health"
  | "personal_budget"
  | "purchase_advisor"
  | "savings"
  | "tax_prep"
  | "travel_finance";

/** The live proposal feed is forwarded by the BFF without type normalization.
 * Keep the known catalog for static guidance while allowing a newly introduced
 * upstream type to be rendered safely as an unrecognized record. */
export type ProposalType = KnownProposalType | (string & {});

export type ProposalStatus = "pending" | "approved" | "acknowledged" | "rejected" | "undone" | (string & {});
export type ProposalRiskBand = "low" | "standard" | "elevated" | "high";
export type ProposalMode = "propose" | "notify_only";
export type ProposalDecision = "approve" | "reject" | "acknowledge" | "undo";

/** A ledger amount as it leaves the BFF: structured, never a formatted string,
 *  so the active display currency + FX rate are applied at render time. */
export interface ProposalAmount {
  value: string;
  currency: string;
}

/** Provenance attached to policy decisions by brain-core #645. These are raw
 * references; entity refs are copied into the shared evidence stream by the BFF. */
export interface ProposalSourceRefs {
  source_action_id?: string;
  source_proposal_id?: string;
  payment_intent_id?: string;
  source_entity_refs?: { kind: string; ref: string }[];
  amount?: ProposalAmount;
}

/** brain-core sends only `{kind, ref, resolvable}`. Everything below it is added
 *  by the BFF (server/brain/proposalEnrichment.ts), which joins each `ref` against
 *  the tenant's counterparties/invoices/accounts/obligations/members.
 *
 *  All resolved fields are OPTIONAL on purpose: enrichment degrades to the raw
 *  triple if reference data can't be read, and a proposal fetched by any path that
 *  bypasses the enriching route still type-checks. Render `display ?? ref`. */
export interface ProposalEvidenceItem {
  kind: string;
  ref: string;
  resolvable: boolean;
  /** Human caption for the row, e.g. "Customer", "Invoice". */
  label?: string;
  /** Resolved name, e.g. "Thornebury Imports". Null when the ref matched nothing. */
  display?: string | null;
  /** Bare business identifier ("AR-MIDMARKET-001") when the record has one, so
   *  the card headline can quote the document number without parsing `display`. */
  code?: string | null;
  amount?: ProposalAmount | null;
  /** Decision-supporting rows derived from real ledger fields (due date, days
   *  overdue, status, PO, …) — never fabricated. */
  facts?: { label: string; value: string }[];
  /** True for broad background citations (brain-core `wiki:` refs) rather than
   *  the record the proposal is about. These belong in the technical section
   *  only — a collections proposal cites the whole counterparty book. */
  context?: boolean;
}

/* ── Rich card fields (brain-core #384, docs/contracts/proposals-read-model.md) ──
   Additive on every row: `stored_action_type`, `details`, `policy`, `presentation`,
   and `available_decisions`. Verified live against tnt_01KYS8R54VDRSW6ND3GN2649T0
   across fraud_anomaly, cash_forecast, treasury, subscription and compliance.

   Every one is OPTIONAL here on purpose: a row cached from before the contract
   shipped, or fetched by a path that bypasses the enriching route, must still
   type-check and render the compact card. */

/** Pass-through of the stored action fields (or PaymentIntent ledger columns shaped
 *  as action details). Per-type keys — `risk_score`, `ranked_signals`, `finding_type`,
 *  `match_basis`, `recurring_amount`, … — so it stays an open record rather than a
 *  fabricated per-type interface the contract does not guarantee. */
export type ProposalDetails = Record<string, unknown>;

/** One entry of `policy.trace`: the rules the engine walked and what they checked. */
export interface ProposalPolicyTraceEntry {
  rule_id?: string | null;
  matched?: boolean;
  checks?: { key?: string; detail?: string; passed?: boolean }[];
}

/** The policy summary. NOTE: `policy_id` is null on most live rows even when the rest
 *  of the object is populated, which is why the "Flagged by" line resolves through
 *  buildFlaggedBy()'s fallback chain rather than reading `policy_id` directly. */
export interface ProposalPolicy {
  decision?: string | null;
  policy_id?: string | null;
  policy_version?: number | null;
  matched_rule_id?: string | null;
  explanation?: string | null;
  required_approvers?: string[] | null;
  trace?: ProposalPolicyTraceEntry[] | null;
}

/** A `presentation.key_facts` row. Values arrive as strings or numbers. */
export interface ProposalKeyFact {
  label: string;
  value: string | number | null;
}

/** What each decision would do, keyed by decision id. Null where it does not apply. */
export interface ProposalConsequences {
  approve?: string | null;
  reject?: string | null;
  acknowledge?: string | null;
  [decisionId: string]: string | null | undefined;
}

/** A semantic decision the API will accept at POST /proposals/{id}/decide. The card's
 *  buttons are built from this list — never from a hardcoded Approve/Reject pair. */
export interface ProposalDecisionOption {
  id: string;
  label: string;
  meaning?: string | null;
}

/** Six-layer technical breakdown. Keys are stable per the contract. */
export interface ProposalTechnicalDetail {
  "1_ingest"?: unknown;
  "2_extract"?: unknown;
  "3_classify"?: unknown;
  "4_score"?: unknown;
  "5_policy"?: unknown;
  "6_propose"?: unknown;
  [layer: string]: unknown;
}

/** Normalized card data brain-core computes so every client renders the same words. */
export interface ProposalPresentation {
  headline?: string | null;
  recommendation?: string | null;
  key_facts?: ProposalKeyFact[] | null;
  confidence_band?: string | null;
  policy?: ProposalPolicy | null;
  consequences?: ProposalConsequences | null;
  actions?: ProposalDecisionOption[] | null;
  technical_detail?: ProposalTechnicalDetail | null;
}

/** BFF-resolved key fact (server/brain/proposalEnrichment.ts).
 *
 *  `value` has had raw ledger ids swapped for the entity's name wherever the
 *  enrichment index could resolve one. `technical` marks a row the primary view must
 *  NOT show — an identifier column, or an id nothing resolved — so raw ULIDs stay in
 *  the collapsed technical section instead of the card face. */
export interface ResolvedKeyFact {
  label: string;
  value: string;
  /** True when this row is an identifier rather than a fact a human reads. */
  technical?: boolean;
  /** Set when the original value was an id we replaced with a name. */
  ref?: string | null;
}

/** GET /proposals row = GET /proposals/{id} detail - identical shape, no extra
 *  detail-only fields (read-model.ts's `ProposalReadItem`). */
export interface BrainProposal {
  id: string;
  type: ProposalType;
  created_at: string;
  status: ProposalStatus;
  risk_band: ProposalRiskBand | null;
  confidence: number | null;
  mode: ProposalMode;
  narrative: string | null;
  evidence: ProposalEvidenceItem[];
  agent: { id: string; kind: string; display_name: string } | null;
  payment_intent_id: string | null;
  action_type: string | null;
  /** BFF-added: the headline entity to name this card by, when one resolved. */
  subject?: { label: string; display: string } | null;
  /** BFF-preserved provenance for policy decisions (brain-core #645). */
  source_refs?: ProposalSourceRefs | null;

  /* Rich card fields — see the block above. Optional: pre-#384 rows omit them. */
  /** Original stored action type (`flag_transaction`, `notify`, `block_payment`, …).
   *  The public `type` is DERIVED from this; both are shown in the technical layers. */
  stored_action_type?: string | null;
  details?: ProposalDetails | null;
  policy?: ProposalPolicy | null;
  presentation?: ProposalPresentation | null;
  available_decisions?: ProposalDecisionOption[] | null;
  /** BFF-added: `presentation.key_facts` with ids resolved to names and identifier
   *  rows flagged `technical` (server/brain/proposalEnrichment.ts). */
  key_facts?: ResolvedKeyFact[] | null;
  /** BFF-added: id → name for every raw id the record's prose mentions. Ids the
   *  server could not resolve are absent, and the client drops those rather than
   *  showing them. */
  resolved_refs?: Record<string, string> | null;
}

export interface ListProposalsResponse {
  proposals: BrainProposal[];
  next_cursor: string | null;
}

const PROPOSALS_PAGE_SIZE = 100;
const MAX_PROPOSAL_PAGES = 50;
export const BRAIN_PROPOSALS_QUERY_KEY = ["/api/brain/proposals?limit=100"] as const;
export const BRAIN_PENDING_PROPOSALS_QUERY_KEY = ["/api/brain/proposals?limit=100&status=pending"] as const;
export const BRAIN_PROPOSALS_STALE_MS = 30_000;

/** Read the complete proposals feed. Brain-core returns a cursor when the
 * merged proposal/payment-intent list spans more than one page. A partial
 * response must fail the query rather than render as a complete queue.
 *
 * `status` is forwarded to brain-core's read model as an explicit filter.
 * Pass `"pending"` for the non-financial inbox to avoid pulling old decided
 * rows; omit it for the PaymentIntent queue because that queue filters on the
 * detail record's authoritative status. */
export async function fetchAllBrainProposals(signal?: AbortSignal, status?: string): Promise<ListProposalsResponse> {
  const proposals: BrainProposal[] = [];
  const followed = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PROPOSAL_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PROPOSALS_PAGE_SIZE) });
    if (status) params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    const response = await fetchBrainRead(`/api/brain/proposals?${params.toString()}`, "proposals", {
      signal,
    });
    const body = (await response.json()) as Partial<ListProposalsResponse>;
    if (!Array.isArray(body.proposals)) {
      throw new Error("Brain proposals response did not contain a proposals array.");
    }
    proposals.push(...body.proposals);

    const next = typeof body.next_cursor === "string" && body.next_cursor.length > 0
      ? body.next_cursor
      : null;
    if (!next) return { proposals, next_cursor: null };
    if (followed.has(next)) {
      throw new Error("Brain proposals pagination did not advance.");
    }
    followed.add(next);
    cursor = next;
  }

  throw new Error("Brain proposals feed exceeded the maximum page count.");
}

/** `type` -> the client agent key is an identity mapping. The return stays open
 * because brain-core may publish a type before BrainMVB's display catalog does. */
export function agentKeyForProposalType(type: ProposalType): string {
  return type;
}

/* ── Queue-membership helpers (pure - see brainProposals.test.ts) ───────────── */

/** A record still awaiting a human decision. */
export function isNeedsReview(p: { status: ProposalStatus }): boolean {
  return p.status === "pending" || p.status === "pending_approval" || p.status === "awaiting_second_approval";
}

/** Non-financial rows only. GET /v1/proposals is a UNION ALL of the proposals
 *  table and ledger_payment_intents (brain-core read-model.ts) - a row with a
 *  non-null payment_intent_id is a money-path PaymentIntent already surfaced
 *  by the PaymentIntent queue (brainQueue.ts). Deciding it here would call
 *  paymentIntents.approve() and execute a real payment with no amount/vendor
 *  shown on this surface, so it must never reach a review/approve UI here. */
export function selectNonFinancialProposals(items: BrainProposal[]): BrainProposal[] {
  return items.filter((p) => p.payment_intent_id === null);
}

export function brainProposalsQueryOptions(enabled = true, status?: string) {
  return {
    queryKey: status === "pending" ? BRAIN_PENDING_PROPOSALS_QUERY_KEY : BRAIN_PROPOSALS_QUERY_KEY,
    queryFn: ({ signal }: { signal?: AbortSignal }) => fetchAllBrainProposals(signal, status),
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: BRAIN_PROPOSALS_STALE_MS,
    enabled,
  };
}

export function useBrainProposalsListQuery(status?: string) {
  const cooldown = useBrainReadCooldown("proposals");
  return useQuery<ListProposalsResponse>(brainProposalsQueryOptions(!cooldown.isCoolingDown, status));
}

// ponytail: the auto-approved live-proposal bucket (an agent decided without a
// human) is deferred - the merged read model carries no decider-identity field
// (no `decided_by`), so there's no honest way to tell an agent decision from a
// human one. Add it back when read-model.ts grows that field.

/* ── Reads ──────────────────────────────────────────────────────────────────── */

/** All pending (non-financial) proposals. The list already returns full detail
 *  records (no extra fields live on GET /proposals/{id} that aren't on the
 *  list row), so no fan-out is needed here unlike brainQueue.ts's
 *  PaymentIntent queue. */
export function useBrainProposals(): {
  isLoading: boolean;
  isError: boolean;
  proposals: BrainProposal[];
} {
  /* Focus refetch on a 30 s stale window. This is a shared work queue:
     a proposal decided by a teammate stays actionable here until something
     refetches. Returning to the Inbox tab is the realistic moment for that;
     the 30 s stale window also means the cache refreshes naturally when the
     user navigates back within a minute, without constant polling from every
     open tab. The explicit invalidation after every decide() call is kept so
     the UI reflects the operator's own action immediately. */
  const list = useBrainProposalsListQuery("pending");
  return {
    isLoading: list.isLoading,
    /* Surfaced so callers can tell "nothing to approve" from "couldn't ask".
       `retry: false` + `?? []` below means an unreachable core is otherwise
       indistinguishable from an empty queue, and on an approvals surface that
       reads as an all-clear. */
    isError: list.isError,
    // Money-path rows (payment_intent_id != null) are excluded here - see
    // selectNonFinancialProposals for why approving them on this surface
    // would be a blind second approval path that executes a real payment.
    proposals: selectNonFinancialProposals(list.data?.proposals ?? []),
  };
}

/* ── Decide (write) ───────────────────────────────────────────────────────── */

export interface DecideProposalInput {
  id: string;
  decision: ProposalDecision;
  /** Row context captured at decision time, so the receipt can render the
   *  decided row after core stops returning the proposal. Optional: a caller
   *  that cannot supply it still gets a receipt, just a plainer one. */
  receipt?: { title?: string; rowSubtitle?: string };
}

export interface ProposalDecisionResult {
  id: string;
  decision: ProposalDecision;
  status: string;
  audit_id: string | null;
  payment_intent_id: string | null;
}

/** Statuses that mean core recorded the decision but the item is not finished:
 *  another approver still has to act. Treated as a distinct outcome from a
 *  completed decision wherever the result is worded. */
export const AWAITING_STATUSES = new Set(["pending", "pending_approval", "awaiting_second_approval"]);

/** Statuses are compared lowercased and trimmed. A status that differed only in
 *  case would otherwise slip past every gate below and be treated as unknown —
 *  silently turning a known awaiting state into a finished one. */
function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

/**
 * How finished is the decision core just confirmed?
 *
 *   final    — a terminal status for the verb submitted. Safe to receipt and to
 *              report in the past tense.
 *   awaiting — recorded, but the item is explicitly not finished.
 *   unknown  — a status this client does not recognise. Recorded (core returned
 *              2xx for our proposal and did not contradict the verb), but
 *              nothing here knows whether it is finished, so it must not be
 *              receipted into Resolved or announced as done.
 */
export function decisionFinality(submitted: ProposalDecision, status: string): "final" | "awaiting" | "unknown" {
  const s = normalizeStatus(status);
  if (AWAITING_STATUSES.has(s)) return "awaiting";
  return TERMINAL_STATUS_VERB[s] === submitted ? "final" : "unknown";
}

/** Terminal statuses, grouped by the decision verb each one belongs to. A
 *  status from a verb OTHER than the one submitted is a contradiction: the
 *  outcome core is describing is not the outcome the operator asked for.
 *  Unknown statuses are not listed and are not treated as contradictions —
 *  core's vocabulary grows, and refusing an unrecognised status would break a
 *  decision that actually landed. */
const TERMINAL_STATUS_VERB: Record<string, ProposalDecision> = {
  approved: "approve",
  executed: "approve",
  paid: "approve",
  rejected: "reject",
  declined: "reject",
  denied: "reject",
  acknowledged: "acknowledge",
  dismissed: "acknowledge",
};

/** Copy for a decision core recorded but explicitly has NOT finished. Present
 *  tense, one per verb: the operator has acted, the item has not moved. */
const DECISION_AWAITING_TITLE: Record<string, string> = {
  approve: "Approval recorded. One more needed",
  reject: "Decline recorded. Not final yet",
  acknowledge: "Acknowledgement recorded. Not final yet",
};

/** Past-tense confirmation copy, one per decision verb. Only shown once core
 *  has confirmed the decision with a response we could read. */
const DECISION_CONFIRMED_TITLE: Record<string, string> = {
  approve: "Approved",
  reject: "Declined",
  acknowledge: "Acknowledged",
  undo: "Decision undone",
};

const DECISION_CONFIRMED_DETAIL: Record<string, string> = {
  approve: "Brain recorded your approval. It's in Resolved.",
  reject: "Brain recorded your decision. It's in Resolved.",
  acknowledge: "Brain recorded this. It's in Resolved.",
  undo: "This is back in your unresolved list.",
};

/**
 * Read a decision response, or refuse it.
 *
 * brain-core answers a decision with the proposal id, the decision it recorded
 * and the resulting status. Anything that does not carry at least those is not
 * a confirmation we can show the operator — most importantly a body that echoes
 * a DIFFERENT decision than the one submitted, which would mean the thing that
 * got recorded is not the thing the user clicked.
 */
export function parseDecisionResult(
  body: unknown,
  submitted: ProposalDecision,
  proposalId: string,
): ProposalDecisionResult | null {
  if (body === null || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const id = typeof b.id === "string" && b.id.length > 0 ? b.id : null;
  const status = typeof b.status === "string" && b.status.length > 0 ? b.status : null;
  if (!id || !status) return null;
  /* The response must be about the proposal we decided. A body describing a
     DIFFERENT id would otherwise write a receipt and a confirmation against the
     row the operator clicked, on the strength of someone else's outcome. */
  if (id !== proposalId) return null;
  /* An absent decision echo is tolerated (core has not always sent one); a
     CONTRADICTING one is not. */
  const echoed = typeof b.decision === "string" ? b.decision : null;
  if (echoed !== null && echoed !== submitted) return null;
  /* The status has to agree too. `{decision:"approve", status:"rejected"}` is
     not a confirmed approval however well-formed it looks, and taking the verb
     on trust would show "Approved" for a rejection. */
  const terminalVerb = TERMINAL_STATUS_VERB[normalizeStatus(status)];
  if (terminalVerb !== undefined && terminalVerb !== submitted) return null;
  return {
    id,
    decision: submitted,
    status,
    audit_id: typeof b.audit_id === "string" && b.audit_id.length > 0 ? b.audit_id : null,
    payment_intent_id:
      typeof b.payment_intent_id === "string" && b.payment_intent_id.length > 0
        ? b.payment_intent_id
        : null,
  };
}

class ProposalConflictError extends Error {
  constructor() {
    super("execution_proposal_invalid_state");
    this.name = "ProposalConflictError";
  }
}

/** POST /proposals/{id}/decide via the BFF. On success, invalidates the proposals
 *  list/detail queries + the audit feed (a decision emits `proposal.decided`).
 *  On a 409 `execution_proposal_invalid_state` (someone else decided it first,
 *  or a legacy `agent_proposal_invalid_state` alias), shows a friendly toast and
 *  still invalidates so the UI reflects the real state. */
export function useDecideProposal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = (decidedId: string) => {
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/proposals"),
    });
    /* The audit feed is a paginated (infinite) query, and INVALIDATING one
       re-issues every page loaded so far — on a long history a single decision
       becomes a burst of `/audit/events` requests, which is what the incident
       looked like from the server. Resetting discards the loaded pages and
       re-reads page ONE: bounded at a single request, and it genuinely
       refreshes, which marking-stale-without-refetching does not. That matters
       most for undo, where a cached page still carrying the old decision would
       go on suppressing the proposal that was just reopened. */
    void queryClient.resetQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/audit/"),
    });
    /* The authoritative decided-state read is what actually removes the row
       from the unresolved queue, so it has to be re-asked after every decision
       — including undo, where the expected answer is that the proposal is
       pending again.
       Only the batch CONTAINING this proposal is invalidated. Matching on the
       key prefix alone would re-POST every batch on screen, which on a large
       inbox is fifty requests per decision — the amplification this whole
       change set exists to remove, reintroduced one layer down. */
    void queryClient.invalidateQueries({
      predicate: (q) => isDecisionStateBatchFor(q.queryKey, decidedId),
    });
  };

  return useMutation<ProposalDecisionResult, Error, DecideProposalInput>({
    mutationFn: async ({ id, decision }) => {
      reportBrainReadCooldownIfActive("proposals");
      const res = await fetch(`/api/brain/proposals/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const text = await res.text().catch(() => "");
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = undefined;
      }
      if (!res.ok) {
        if (res.status === 429) {
          await throwBrainRateLimitIfNeeded(res, text, "proposals");
        }
        const code = parseCoreError(body)?.error?.code;
        if (res.status === 409 && (code === "execution_proposal_invalid_state" || code === "agent_proposal_invalid_state")) {
          throw new ProposalConflictError();
        }
        throw new Error(parseCoreError(body)?.error?.message ?? `Couldn't record the decision (${res.status}).`);
      }
      /* A 2xx with a body we can't read is NOT a success we may act on. Casting
         it through (which is what this used to do) would let an empty or
         error-shaped body become a receipt and a "decision recorded" toast,
         telling the operator their approval landed on the strength of a status
         code alone. Validate, and treat an unreadable body as a failure. */
      const result = parseDecisionResult(body, decision, id);
      if (!result) {
        throw new Error(
          "Brain accepted the decision but returned an unreadable response, so it can't be confirmed. Reload before deciding again.",
        );
      }
      return result;
    },
    onSuccess: (result, { id, decision, receipt }) => {
      /* Order matters. The receipt and the toast are written from the confirmed
         response BEFORE invalidation, so the decided row reaches Resolved in the
         same tick the decision is confirmed. The audit feed can then take as
         long as it needs to catch up without the row being invisible in the
         meantime — the gap that made a successful approval look like it had
         silently failed. */
      const finality = decision === "undo" ? "final" : decisionFinality(decision, result.status);
      if (decision === "undo" || finality !== "final") {
        /* Undo puts the proposal back in front of the operator, so the receipt
           claiming it was decided has to go with it.

           Anything short of a terminal status for THIS verb is the same
           situation for a different reason. An awaiting status says outright
           that another approver still has to act; an unrecognised status says
           nothing this client can read about whether the decision is finished.
           Either way a receipt would move the row into Resolved and hide it
           from the queue it may genuinely still be in. The toast below is the
           only thing that should report these outcomes. */
        clearDecisionReceipt(id);
      } else {
        recordDecisionReceipt({
          proposalId: id,
          decision,
          status: result.status,
          auditId: result.audit_id,
          paymentIntentId: result.payment_intent_id,
          decidedAtMs: Date.now(),
          title: receipt?.title?.trim() || "Recommendation",
          rowSubtitle: receipt?.rowSubtitle,
        });
      }
      /* Only a terminal status earns the past tense. The other two outcomes are
         worded for what they actually are, for EVERY verb — a decline that came
         back still pending is no more finished than an approval that did, and
         "Declined. It's in Resolved." would be false about both the outcome and
         where to find it. */
      toast(
        finality === "final"
          ? {
              title: DECISION_CONFIRMED_TITLE[decision] ?? "Decision recorded",
              description: DECISION_CONFIRMED_DETAIL[decision] ?? "Brain recorded your decision.",
            }
          : finality === "awaiting"
            ? {
                title: DECISION_AWAITING_TITLE[decision] ?? "Decision recorded. Not final yet",
                description: "Brain has your decision, but this isn't finished — it still needs another approver.",
              }
            : {
                /* No claim about where the row goes. An unrecognised status may
                   turn out to be terminal, in which case core stops returning
                   the proposal and it leaves the unresolved list — promising it
                   would stay there would be a guess this client cannot back. */
                title: "Decision recorded",
                description: `Brain reported it as "${result.status}", which this app doesn't recognise, so it can't say whether the item is finished. The audit log in Settings has the outcome.`,
              },
      );
      invalidate(id);
    },
    onError: (err, { id }) => {
      if (err instanceof ProposalConflictError) {
        toast({
          title: "Already decided elsewhere",
          description: "Someone (or something) else decided this proposal first - refreshed.",
          variant: "destructive",
        });
        invalidate(id);
      } else if (!isBrainRateLimitError(err)) {
        toast({ title: "Couldn't record decision", description: err.message, variant: "destructive" });
      }
    },
  });
}
