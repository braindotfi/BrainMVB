import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { parseCoreError } from "./approvalRejections";
import type { AgentKey } from "./agentProposals";

/* ── Live brain-core agent proposals (GET/POST /v1/proposals*) ────────────────
   Non-financial agent outputs (vendor risk, collections, treasury, etc.) that a
   human reviews and decides on - distinct from the PaymentIntent queue in
   brainQueue.ts. Contract MERGED via brain-core #268-271 and LIVE on
   api.brain.fi (GET /v1/proposals returns 401, i.e. deployed, not 404). Shape
   verified against brain-core source: services/execution/src/proposals/
   read-model.ts + decision-service.ts on main. */

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
  | "fraud_anomaly";

export type ProposalStatus = "pending" | "approved" | "acknowledged" | "rejected" | "undone" | (string & {});
export type ProposalRiskBand = "low" | "standard" | "elevated" | "high";
export type ProposalMode = "propose" | "notify_only";
export type ProposalDecision = "approve" | "reject" | "acknowledge" | "undo";

export interface ProposalEvidenceItem {
  kind: string;
  ref: string;
  resolvable: boolean;
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
}

interface ListProposalsResponse {
  proposals: BrainProposal[];
  next_cursor: string | null;
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

// ponytail: the auto-approved live-proposal bucket (an agent decided without a
// human) is deferred - the merged read model carries no decider-identity field
// (no `decided_by`), so there's no honest way to tell an agent decision from a
// human one. Add it back when read-model.ts grows that field.

/* ── Reads ──────────────────────────────────────────────────────────────────── */

/** All proposals. The list already returns full detail records (no extra
 *  fields live on GET /proposals/{id} that aren't on the list row), so no
 *  fan-out is needed here unlike brainQueue.ts's PaymentIntent queue. */
export function useBrainProposals(): { isLoading: boolean; proposals: BrainProposal[] } {
  const list = useQuery<ListProposalsResponse>({
    queryKey: ["/api/brain/proposals"],
    retry: false,
  });
  return {
    isLoading: list.isLoading,
    proposals: list.data?.proposals ?? [],
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
        toast({ title: "Couldn't record decision", description: err.message, variant: "destructive" });
      }
    },
  });
}
