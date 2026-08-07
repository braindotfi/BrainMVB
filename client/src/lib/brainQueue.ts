import { useQuery, useQueries } from "@tanstack/react-query";
import type { Proposal, ProposalStatus } from "./proposalTypes";

/* ── Durable "Needs Review" queue - live brain-core PaymentIntents ─────────
   brain-core has no bulk list of full PaymentIntents, and no tenant-scoped
   `GET /actions` either: that path 404s `route_not_found` (the only actions
   route on the whole surface is the per-agent `GET /agents/{agent_id}/actions`,
   which is a different resource). The money-path list lives on GET /v1/proposals,
   a UNION ALL of the proposals table and ledger_payment_intents (brain-core
   read-model.ts) - rows with a non-null payment_intent_id ARE this queue, and
   are deliberately excluded from useBrainProposals for exactly that reason
   (see selectNonFinancialProposals).

   So this hook fans out: take payment_intent_ids from /proposals, then fetch
   each candidate's full record from GET /payment-intents/{id} (already exposed,
   passthrough-safe, execution:read scope).

   The authoritative status filter is on the DETAIL record, never the list row:
   the proposal row's own status is a merged read-model value whose mapping onto
   PaymentIntent statuses isn't part of the published contract, so trusting it to
   pre-narrow a queue would silently empty one if the mapping shifted. Both hooks
   share one list query key, so react-query issues a single list request and
   dedupes the detail fetches between them. */

/** Same key brainProposals.ts uses, so the two surfaces share one fetch. */
const PROPOSALS_QUERY_KEY = "/api/brain/proposals?limit=100";

interface ProposalsPage {
  proposals: { payment_intent_id: string | null }[];
}

/** The money-path payment_intent_ids on a /proposals page, de-duplicated and
 *  capped so a large page can't fan out unboundedly. Exported for tests. */
export function selectMoneyPathIntentIds(
  proposals: { payment_intent_id: string | null }[],
  cap = 25,
): string[] {
  const ids = new Set<string>();
  for (const p of proposals) {
    if (p.payment_intent_id) ids.add(p.payment_intent_id);
    if (ids.size >= cap) break;
  }
  return [...ids];
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
  /** Present only when the detail was fetched with `?expand=agent`; null if
   *  `created_by_agent_id` is null or the lookup misses (Brain_API_Specification.yaml
   *  GET /payment-intents/{id}). */
  agent?: { display_name: string } | null;
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
  const list = useQuery<ProposalsPage>({
    queryKey: [PROPOSALS_QUERY_KEY],
    retry: false,
    refetchOnWindowFocus: true,
  });
  const pendingIds = selectMoneyPathIntentIds(list.data?.proposals ?? []);

  // Fan out to the full record per candidate. useQueries (not useQuery-in-a-
  // loop, which breaks Rules of Hooks once the id list's length changes)
  // dedupes/caches each by its own key.
  const details = useQueries({
    queries: pendingIds.map((id) => ({
      // expand=agent: attaches the real proposing agent's display_name when
      // brain-core can resolve created_by_agent_id (null otherwise) - see
      // mapIntentToProposal's rowSubtitle below.
      queryKey: [`/api/brain/payment-intents/${id}?expand=agent`],
      retry: false,
      /* The fan-out needs the focus refetch as much as the list does, and it is
         the half that actually fixes the stale queue. selectMoneyPathIntentIds
         picks ids by `payment_intent_id != null` with NO status filter, so a
         teammate approving an intent does not remove it from the list — the
         `status` filter below, reading the DETAIL record, is what drops it.
         Refreshing only the list would therefore return the same ids, leave
         every detail on the app's infinite stale time, and keep rendering a
         settled intent as pending. */
      refetchOnWindowFocus: true,
    })),
  }) as { data?: BrainPaymentIntent; isLoading: boolean; isError: boolean }[];
  const counterparties = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
    refetchOnWindowFocus: true,
  });

  const intents = details
    .map((q) => q.data)
    .filter((d): d is BrainPaymentIntent => d !== undefined)
    // Only the statuses this queue is FOR - a detail fetch racing a status
    // change (e.g. approved between the two calls) shouldn't show stale.
    .filter((d) => d.status === "pending_approval" || d.status === "awaiting_second_approval");

  const nameOf = (id: string) => counterparties.data?.counterparties.find((c) => c.id === id)?.name ?? undefined;

  return {
    isLoading: list.isLoading || details.some((d) => d.isLoading),
    /* Incomplete if EITHER call fails. The list failing means we have no idea
       what is pending. But a detail fan-out failing is just as dishonest: the
       id came back on the list, so we know a pending approval exists, and
       dropping it from `intents` below removes a row the operator is on the
       hook for — silently, and only ever downwards. Counterparty lookup is
       excluded on purpose: losing it costs a display name, not a row. */
    isError: list.isError || details.some((d) => d.isError),
    proposals: intents.map((i) => mapIntentToProposal(i, nameOf(i.destination_counterparty_id))),
  };
}

/**
 * The "Approved Automatically" queue: brain-core PaymentIntents that cleared
 * the §6 policy gate without needing a human decision. brain-core's own
 * mapper (services/execution/src/actions/mapper.ts:17-19,69-77) emits Action
 * status "auto" for PaymentIntent status "proposed" | "approved" — i.e.
 * policy-permitted and ready to run, NOT necessarily settled yet ("executed"
 * is a distinct, later status). So this queue is honestly "cleared", not
 * "paid" — see mapIntentToAutoApprovedProposal below.
 */
export function useBrainAutoApproved() {
  const list = useQuery<ProposalsPage>({
    queryKey: [PROPOSALS_QUERY_KEY],
    retry: false,
    refetchOnWindowFocus: true,
  });
  const autoIds = selectMoneyPathIntentIds(list.data?.proposals ?? []);

  const details = useQueries({
    queries: autoIds.map((id) => ({
      queryKey: [`/api/brain/payment-intents/${id}?expand=agent`],
      retry: false,
      /* Same reasoning as the review queue: the status filter below reads the
         detail record, so a stale detail keeps an executed intent sitting in
         "cleared". */
      refetchOnWindowFocus: true,
    })),
  }) as { data?: BrainPaymentIntent; isLoading: boolean; isError: boolean }[];
  const counterparties = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
    refetchOnWindowFocus: true,
  });

  const intents = details
    .map((q) => q.data)
    .filter((d): d is BrainPaymentIntent => d !== undefined)
    // Only the statuses "auto" actually maps from — a detail fetch racing a
    // status change (e.g. executed between the two calls) shouldn't show stale.
    .filter((d) => d.status === "proposed" || d.status === "approved");

  const nameOf = (id: string) => counterparties.data?.counterparties.find((c) => c.id === id)?.name ?? undefined;

  return {
    isLoading: list.isLoading || details.some((d) => d.isLoading),
    /* Same contract as the review queue above: a dropped row here understates
       what Brain has already cleared, which is the operator's audit trail. */
    isError: list.isError || details.some((d) => d.isError),
    proposals: intents.map((i) => mapIntentToAutoApprovedProposal(i, nameOf(i.destination_counterparty_id))),
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
    // ponytail: agent.display_name only renders when expand=agent resolved a real
    // creating agent (see BrainPaymentIntent above) - no fallback name invented.
    rowSubtitle: `${vendor} · awaiting approval${intent.agent?.display_name ? ` · proposed by ${intent.agent.display_name}` : ""}`,
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
    sourceCreatedAt: intent.created_at,
  };
}

/**
 * Map a live "auto"-cleared PaymentIntent to the app's auto_handled receipt
 * shape (ProposalDetail's isReceipt branch — no Approve/Reject, matches
 * brain-core's real "no human decision needed" semantics). Reuses
 * mapIntentToProposal for the shared fields, overriding only what differs
 * for a cleared-not-pending record.
 */
export function mapIntentToAutoApprovedProposal(intent: BrainPaymentIntent, vendorName?: string): Proposal {
  const base = mapIntentToProposal(intent, vendorName);
  const vendor = vendorName ?? "a vendor";
  return {
    ...base,
    title: `Payment to ${vendor}`,
    rowSubtitle: `${vendor} · cleared automatically by policy${intent.agent?.display_name ? ` · proposed by ${intent.agent.display_name}` : ""}`,
    dueLabel: "Approved automatically",
    rationale: "Brain core's §6 policy gate cleared this payment automatically; no human approval was required.",
    whatHappensNext: "This clears through its payment rail without further review.",
    risk: "Brain's policy gate cleared this automatically.",
    policy: { ...base.policy, explanation: "brain-core's policy gate did not require approval", autoClearedOtherwise: true },
    status: "auto_handled",
    // ponytail: brain-core's PaymentIntent status here is "proposed"/"approved"
    // (not "executed"), so say "cleared to pay", never "paid"/"settled" — and
    // skip settledMeta, there's no real settle timestamp yet to show.
    pastTenseStatement: `Brain cleared paying ${vendor} ${intent.currency} ${intent.amount} automatically`,
  };
}
