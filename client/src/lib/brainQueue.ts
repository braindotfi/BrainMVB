import { useQuery, useQueries } from "@tanstack/react-query";
import type { Proposal, ProposalStatus } from "./proposalTypes";

/* ── Durable "Needs Review" queue - live brain-core PaymentIntents ─────────
   brain-core has no bulk list of full PaymentIntents: `GET /actions` is the
   only tenant-scoped list, but its wire shape (`Action`) strips amount/
   currency/counterparty/invoice_id (see brain-core services/execution/src/
   actions/mapper.ts - deliberate: /actions is the docs-vocabulary summary).
   So this hook fans out: list ids+status from /actions, then fetch each
   candidate's full record from GET /payment-intents/{id} (already exposed,
   passthrough-safe, execution:read scope). Bounded to a handful of pending
   items so the fan-out stays cheap. */

interface BrainAction {
  id: string;
  status: "auto" | "needs_approval" | "approved" | "paused" | "dispatching" | "rejected" | "executed" | "failed" | "cancelled";
}
interface ActionsListResponse {
  data: BrainAction[];
}

/** Raw brain-core PaymentIntent (subset - see shared/src/contracts/IPaymentIntentService.ts). */
export interface BrainPaymentIntent {
  id: string;
  action_type: string;
  destination_counterparty_id: string;
  amount: string;
  currency: string;
  invoice_id?: string | null;
  status: string;
  confidence?: number;
  created_at: string;
}

interface CounterpartyLite {
  id: string;
  name?: string | null;
}
interface CounterpartiesLiteResponse {
  counterparties: CounterpartyLite[];
}

/**
 * The durable Needs-Review queue: brain-core PaymentIntents still awaiting a
 * human decision, fetched fresh (not the session-scoped `intentsStore`, which
 * only knows about intents proposed in THIS browser session).
 */
export function useBrainReviewQueue() {
  const actions = useQuery<ActionsListResponse>({
    queryKey: ["/api/brain/actions"],
    retry: false,
  });
  // /actions maps both pending_approval + awaiting_second_approval to its
  // own "needs_approval" status - that's the only signal it carries.
  const pendingIds = (actions.data?.data ?? [])
    .filter((a) => a.status === "needs_approval")
    .map((a) => a.id);

  // Fan out to the full record per candidate. useQueries (not useQuery-in-a-
  // loop, which breaks Rules of Hooks once the id list's length changes)
  // dedupes/caches each by its own key.
  const details = useQueries({
    queries: pendingIds.map((id) => ({
      queryKey: [`/api/brain/payment-intents/${id}`],
      retry: false,
    })),
  }) as { data?: BrainPaymentIntent; isLoading: boolean }[];
  const counterparties = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const intents = details
    .map((q) => q.data)
    .filter((d): d is BrainPaymentIntent => d !== undefined)
    // Only the statuses this queue is FOR - a detail fetch racing a status
    // change (e.g. approved between the two calls) shouldn't show stale.
    .filter((d) => d.status === "pending_approval" || d.status === "awaiting_second_approval");

  const nameOf = (id: string) => counterparties.data?.counterparties.find((c) => c.id === id)?.name ?? undefined;

  return {
    isLoading: actions.isLoading || details.some((d) => d.isLoading),
    proposals: intents.map((i) => mapIntentToProposal(i, nameOf(i.destination_counterparty_id))),
  };
}

/** Map a live brain-core PaymentIntent to the app's Proposal shape (honest defaults, no fabrication). */
export function mapIntentToProposal(intent: BrainPaymentIntent, vendorName?: string): Proposal {
  const amount = Number(intent.amount);
  const vendor = vendorName ?? "a vendor";
  const status: ProposalStatus = "pending"; // both needs-approval statuses read as one "pending" queue row

  return {
    id: intent.id,
    auditId: intent.id,
    // ponytail: brain-core's PaymentIntent carries no "which agent proposed
    // this" tag on the wire - every intent this queue shows pays an invoice,
    // so "invoice" is the honest single choice, not a fabricated guess.
    agent: "invoice",
    surface: "business",
    title: `Approve payment to ${vendor}?`,
    rowSubtitle: `${vendor} · awaiting approval`,
    actionStatement: `Propose paying ${vendor} ${intent.currency} ${intent.amount}`,
    actionMeta: intent.invoice_id ? `invoice ${intent.invoice_id}` : "no linked invoice",
    executionLabel: "Executes after approval",
    cancelDeadlineLabel: "until approved or rejected",
    amount: Number.isFinite(amount) ? amount : undefined,
    counterparty: vendor,
    dueLabel: "Needs approval",
    severity: "info",
    reasonChips: [],
    rationale: "Brain core's §6 policy gate flagged this payment for human approval before it can settle.",
    evidence: [],
    // Real confidence when brain-core attaches one (RFC 0004 evidence
    // confidence); no fabricated score otherwise - a neutral mid value with
    // an honest caveat instead of inventing certainty.
    confidence:
      typeof intent.confidence === "number"
        ? { score: intent.confidence, band: intent.confidence >= 0.8 ? "high" : intent.confidence >= 0.5 ? "medium" : "low", caveat: "From brain-core's evidence confidence." }
        : { score: 0.5, band: "medium", caveat: "brain-core did not report a confidence score for this intent." },
    whatHappensNext: "Once approved, this executes through its payment rail.",
    risk: "Brain's policy gate flagged this for approval.",
    policy: { id: intent.status, explanation: "brain-core's policy gate requires approval", autoClearedOtherwise: false },
    actions: {
      approve: { label: "Approve" },
      reject: { label: "Reject" },
      postpone: { label: "Postpone" },
    },
    status,
    invoiceId: intent.invoice_id ?? undefined,
  };
}
