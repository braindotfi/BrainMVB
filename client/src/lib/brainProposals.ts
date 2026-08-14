import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { parseCoreError } from "./approvalRejections";
import type { AgentKey } from "./agentProposals";
import { isRateLimitError, reportRateLimit } from "./rateLimit";

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
export type ProposalType =
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

/** Read the complete proposals feed. Brain-core returns a cursor when the
 * merged proposal/payment-intent list spans more than one page. A partial
 * response must fail the query rather than render as a complete queue. */
export async function fetchAllBrainProposals(signal?: AbortSignal): Promise<ListProposalsResponse> {
  const proposals: BrainProposal[] = [];
  const followed = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PROPOSAL_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PROPOSALS_PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/brain/proposals?${params.toString()}`, {
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")) || response.statusText;
      if (response.status === 429) {
        reportRateLimit({ "retry-after": response.headers.get("retry-after"), body: detail });
      }
      throw new Error(`${response.status}: ${detail}`);
    }
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

/** `type` -> the client's AgentKey (agentProposals.ts) is now the identity
 *  function - all 11 ProposalType values are the identical AgentKey strings. */
export function agentKeyForProposalType(type: ProposalType): AgentKey {
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

// ponytail: the auto-approved live-proposal bucket (an agent decided without a
// human) is deferred - the merged read model carries no decider-identity field
// (no `decided_by`), so there's no honest way to tell an agent decision from a
// human one. Add it back when read-model.ts grows that field.

/* ── Reads ──────────────────────────────────────────────────────────────────── */

/** All proposals. The list already returns full detail records (no extra
 *  fields live on GET /proposals/{id} that aren't on the list row), so no
 *  fan-out is needed here unlike brainQueue.ts's PaymentIntent queue. */
export function useBrainProposals(): {
  isLoading: boolean;
  isError: boolean;
  proposals: BrainProposal[];
} {
  const list = useQuery<ListProposalsResponse>({
    queryKey: ["/api/brain/proposals?limit=100"],
    queryFn: ({ signal }) => fetchAllBrainProposals(signal),
    retry: false,
    /* Focus refetch on a 30 s stale window. This is a shared work queue:
       a proposal decided by a teammate stays actionable here until something
       refetches. Returning to the Inbox tab is the realistic moment for that;
       the 30 s stale window also means the cache refreshes naturally when the
       user navigates back within a minute, without constant polling from every
       open tab. The explicit invalidation after every decide() call is kept so
       the UI reflects the operator's own action immediately. */
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
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
}

export interface ProposalDecisionResult {
  id: string;
  decision: ProposalDecision;
  status: string;
  audit_id: string | null;
  payment_intent_id: string | null;
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

  const invalidate = () => {
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/proposals"),
    });
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/audit/"),
    });
  };

  return useMutation<ProposalDecisionResult, Error, DecideProposalInput>({
    mutationFn: async ({ id, decision }) => {
      const res = await fetch(`/api/brain/proposals/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        if (res.status === 429) {
          reportRateLimit({ "retry-after": res.headers.get("retry-after"), body });
        }
        const code = parseCoreError(body)?.error?.code;
        if (res.status === 409 && (code === "execution_proposal_invalid_state" || code === "agent_proposal_invalid_state")) {
          throw new ProposalConflictError();
        }
        throw new Error(parseCoreError(body)?.error?.message ?? `Couldn't record the decision (${res.status}).`);
      }
      return body as ProposalDecisionResult;
    },
    onSuccess: () => invalidate(),
    onError: (err) => {
      if (err instanceof ProposalConflictError) {
        toast({
          title: "Already decided elsewhere",
          description: "Someone (or something) else decided this proposal first - refreshed.",
          variant: "destructive",
        });
        invalidate();
      } else {
        if (isRateLimitError(err)) return;
        toast({ title: "Couldn't record decision", description: err.message, variant: "destructive" });
      }
    },
  });
}
