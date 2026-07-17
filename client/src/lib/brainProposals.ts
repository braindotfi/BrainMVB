import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { parseCoreError } from "./approvalRejections";
import type { AgentKey } from "./agentProposals";

/* ── Live brain-core agent proposals (GET/POST /v1/proposals*) ────────────────
   Non-financial agent outputs (vendor risk, collections, treasury, etc.) that a
   human reviews and decides on - distinct from the PaymentIntent queue in
   brainQueue.ts. Shape verified against brain-core source, not docs:
   services/execution/src/proposals/{repository,routes}.ts (PR #267, not yet
   deployed - every call here 404s against api.brain.fi today and must degrade
   to an honest empty state, same as every other live hook in this file). */

export type ProposalType =
  | "vendor_risk"
  | "payment_batch"
  | "collections"
  | "treasury"
  | "cash_forecast"
  | "dispute"
  | "compliance"
  | "revenue_intel"
  | "reconciliation"
  | "subscription"
  | "fraud_anomaly";

export type ProposalStatus = "needs_review" | "acknowledged" | "approved" | "rejected" | "undone_to_review";
export type ProposalRiskBand = "low" | "standard" | "elevated" | "high";
export type ProposalExecutionMode = "propose" | "notify_only";
export type ProposalDecision = "approved" | "rejected" | "acknowledged" | "undone_to_review";

export interface ProposalEvidenceItem {
  text: string;
  wiki_entity_id?: string;
}
export interface ProposalLinks {
  payment_intent_id?: string | null;
  counterparty_id?: string | null;
  raw_id?: string | null;
}

/** GET /proposals row (repository.ts's `AgentProposalSummary`). */
export interface BrainProposalSummary {
  id: string;
  type: ProposalType;
  agent_principal: string;
  risk_band: ProposalRiskBand;
  status: ProposalStatus;
  title: string;
  amount: string | null;
  created_at: string;
}

/** GET /proposals/{id} (repository.ts's `AgentProposalView`) - summary + detail fields. */
export interface BrainProposal extends BrainProposalSummary {
  execution_mode: ProposalExecutionMode;
  narrative: string;
  evidence: ProposalEvidenceItem[];
  links: ProposalLinks;
  policy_decision_id: string | null;
  confidence: number | null;
  reversible: boolean;
  decision: ProposalDecision | null;
  decided_by: string | null;
  decided_at: string | null;
}

interface ListProposalsResponse {
  proposals: BrainProposalSummary[];
}

/** Wire `type` -> the client's existing AgentKey (agentProposals.ts), for display
 *  meta (icon/name) reuse. Only `payment_batch` differs; every other value is the
 *  identical string, verified against the 11 AgentKey members. */
const TYPE_TO_AGENT_KEY: Record<ProposalType, AgentKey> = {
  vendor_risk: "vendor_risk",
  payment_batch: "payment",
  collections: "collections",
  treasury: "treasury",
  cash_forecast: "cash_forecast",
  dispute: "dispute",
  compliance: "compliance",
  revenue_intel: "revenue_intel",
  reconciliation: "reconciliation",
  subscription: "subscription",
  fraud_anomaly: "fraud_anomaly",
};
export function agentKeyForProposalType(type: ProposalType): AgentKey {
  return TYPE_TO_AGENT_KEY[type];
}

/* ── Queue-membership helpers (pure - see brainProposals.test.ts) ───────────── */

/** A record still awaiting a human decision (fresh, or sent back via Undo). */
export function isNeedsReview(p: { status: ProposalStatus }): boolean {
  return p.status === "needs_review" || p.status === "undone_to_review";
}

/** Cleared without a human decision - the agent itself decided (decided_by is
 *  an agent principal, not a member id). Requires the full detail (decided_by
 *  isn't on the list summary). */
export function isAutoApproved(p: { status: ProposalStatus; decided_by?: string | null }): boolean {
  return p.status === "approved" && typeof p.decided_by === "string" && p.decided_by.startsWith("agent_");
}

/** An auto-approved record the operator can send back to review. */
export function canUndo(p: { status: ProposalStatus; decided_by?: string | null; reversible: boolean }): boolean {
  return isAutoApproved(p) && p.reversible === true;
}

/* ── Reads ──────────────────────────────────────────────────────────────────── */

/** All proposals, as full detail records (fanned out from the list the same way
 *  brainQueue.ts's useBrainReviewQueue does for PaymentIntents) - callers need
 *  decided_by/reversible, which only the detail carries. Empty array on any
 *  failure (list 404s until brain-core deploys PR #267). */
export function useBrainProposals(): { isLoading: boolean; proposals: BrainProposal[] } {
  const list = useQuery<ListProposalsResponse>({
    queryKey: ["/api/brain/proposals"],
    retry: false,
  });
  // Only the statuses the UI renders: review queue + auto-approved detection.
  const ids = (list.data?.proposals ?? [])
    .filter((p) => p.status === "needs_review" || p.status === "undone_to_review" || p.status === "approved")
    .map((p) => p.id);
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: [`/api/brain/proposals/${id}`],
      retry: false,
    })),
  }) as { data?: BrainProposal; isLoading: boolean }[];
  return {
    isLoading: list.isLoading || details.some((d) => d.isLoading),
    proposals: details.map((d) => d.data).filter((d): d is BrainProposal => d !== undefined),
  };
}

/** A single proposal's detail (shares its cache key with the fan-out above). */
export function useBrainProposal(id: string | null | undefined) {
  return useQuery<BrainProposal>({
    queryKey: [`/api/brain/proposals/${id ?? ""}`],
    enabled: !!id,
    retry: false,
  });
}

/* ── Decide (write) ───────────────────────────────────────────────────────── */

export interface DecideProposalInput {
  id: string;
  decision: ProposalDecision;
  edit?: { amount?: string };
}

class ProposalConflictError extends Error {
  constructor() {
    super("agent_proposal_invalid_state");
    this.name = "ProposalConflictError";
  }
}

/** POST /proposals/{id}/decide via the BFF. On success, invalidates the proposals
 *  list/detail queries + the audit feed (a decision emits `proposal.decided`).
 *  On a 409 `agent_proposal_invalid_state` (someone else decided it first), shows
 *  a friendly toast and still invalidates so the UI reflects the real state. */
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

  return useMutation<BrainProposal, Error, DecideProposalInput>({
    mutationFn: async ({ id, decision, edit }) => {
      const res = await fetch(`/api/brain/proposals/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit !== undefined ? { decision, edit } : { decision }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        const code = parseCoreError(body)?.error?.code;
        if (res.status === 409 && code === "agent_proposal_invalid_state") {
          throw new ProposalConflictError();
        }
        throw new Error(parseCoreError(body)?.error?.message ?? `Couldn't record the decision (${res.status}).`);
      }
      return body as BrainProposal;
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
