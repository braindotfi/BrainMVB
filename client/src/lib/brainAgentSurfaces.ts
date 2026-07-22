import { useQuery } from "@tanstack/react-query";
import { useCurrency } from "./currencyContext";

/* ── Live read-only informational records from brain-core's Ledger ───────────
   The "Your Review" / "Brain Detected" surfaces used to render 11 fabricated
   agent-proposal cards (agentProposals.ts - now dormant scaffolding, see
   deliverables/BRAIN-CORE-ORCHESTRATION-GAP.md). brain-core has no
   /v1/proposals resource, so there's still no real replacement for most of
   those agents - but four of them map onto real Ledger reads that already
   exist: reconciliation matches, subscription/disputed obligations, and a
   cash-flow aggregate. These hooks surface exactly those facts, honestly,
   with no invented fields and no decision lifecycle (no approve/reject -
   brain-core doesn't have one for these yet). */

export interface LiveInsightField {
  label: string;
  value: string;
}
export interface LiveInsightChartPoint {
  label: string;
  value: number;
}
export interface LiveInsightChart {
  points: LiveInsightChartPoint[];
  unit: string;
  note: string;
}

export type LiveInsightKind = "reconciliation" | "subscription" | "dispute" | "cashflow";

/** View-model AgentProposalModal's shape doesn't fit (it requires a
 *  scenarioModule/whySuggested/recommendedAction/whatHappensNext for every
 *  record - fields these read-only ledger facts don't have and shouldn't
 *  fabricate). Rendered instead by LiveInsightModal, which only shows the
 *  sections a given insight actually has data for. */
export interface LiveInsight {
  id: string;
  kind: LiveInsightKind;
  badge: string;
  title: string;
  subtitle?: string;
  /** 0..1, only set when brain-core reports a real match confidence score. */
  confidence?: number;
  explanation?: string;
  fields?: LiveInsightField[];
  evidenceIds?: string[];
  chart?: LiveInsightChart;
}

/* ── Reconciliation matches: GET /ledger/reconciliation-matches ─────────── */

interface BrainReconciliationMatch {
  id: string;
  match_type: string;
  status: string;
  confidence_score?: number | null;
  explanation?: string | null;
  evidence_ids?: string[];
  left_entity_type: string;
  left_entity_id: string;
  right_entity_type: string;
  right_entity_id: string;
}
interface ReconciliationMatchesResponse {
  matches: BrainReconciliationMatch[];
}

const MATCH_TYPE_LABEL: Record<string, string> = {
  transaction_receipt: "Transaction receipt match",
  invoice_payment: "Invoice payment match",
  statement_balance: "Statement balance match",
  wallet_transfer: "Wallet transfer match",
  payroll_bank_debit: "Payroll bank debit match",
  subscription_charge: "Subscription charge match",
  card_charge: "Card charge match",
};
const RECON_STATUS_LABEL: Record<string, string> = {
  unmatched: "Unmatched",
  duplicate_possible: "Possible duplicate",
  disputed: "Disputed",
};
/* Only the statuses that genuinely need a human look; "matched"/"cleared"/etc.
   don't belong in a review surface. */
const RECON_ATTENTION_STATUSES = new Set(["unmatched", "duplicate_possible", "disputed"]);

export function useBrainReconciliationInsights() {
  const q = useQuery<ReconciliationMatchesResponse>({
    queryKey: ["/api/brain/ledger/reconciliation-matches"],
    retry: false,
  });
  const insights: LiveInsight[] = (q.data?.matches ?? [])
    .filter((m) => RECON_ATTENTION_STATUSES.has(m.status))
    .map((m) => ({
      id: `recon-${m.id}`,
      kind: "reconciliation",
      badge: "Reconciliation",
      title: MATCH_TYPE_LABEL[m.match_type] ?? m.match_type,
      subtitle: RECON_STATUS_LABEL[m.status] ?? m.status,
      confidence: typeof m.confidence_score === "number" ? m.confidence_score : undefined,
      explanation: m.explanation ?? undefined,
      evidenceIds: m.evidence_ids && m.evidence_ids.length > 0 ? m.evidence_ids : undefined,
      fields: [
        { label: "Left record", value: `${m.left_entity_type} ${m.left_entity_id}` },
        { label: "Right record", value: `${m.right_entity_type} ${m.right_entity_id}` },
      ],
    }));
  return { isLoading: q.isLoading, insights };
}

/* ── Obligations: GET /ledger/obligations (subscriptions + disputed) ─────── */

interface BrainObligation {
  id: string;
  type: string;
  counterparty_id: string;
  amount_due: string;
  currency: string;
  due_date: string;
  recurrence?: string | null;
  status: string;
}
interface ObligationsResponse {
  obligations: BrainObligation[];
}
interface CounterpartyLite {
  id: string;
  name?: string | null;
}
interface CounterpartiesLiteResponse {
  counterparties: CounterpartyLite[];
}

/** Same fan-out-free name lookup pattern as brainQueue.ts's `nameOf`. */
function useCounterpartyNames() {
  const q = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });
  return (id: string) => q.data?.counterparties.find((c) => c.id === id)?.name ?? undefined;
}

function dueDateLabel(due_date: string): string {
  const d = new Date(due_date);
  return Number.isNaN(d.getTime())
    ? due_date
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function useBrainSubscriptionInsights() {
  const { format } = useCurrency();
  const nameOf = useCounterpartyNames();
  const q = useQuery<ObligationsResponse>({
    queryKey: ["/api/brain/ledger/obligations?type=subscription"],
    retry: false,
  });
  const insights: LiveInsight[] = (q.data?.obligations ?? [])
    .filter((o) => o.type === "subscription" && o.status !== "disputed")
    .map((o) => {
      const vendor = nameOf(o.counterparty_id) ?? "a vendor";
      const amt = format(o.amount_due);
      return {
        id: `sub-${o.id}`,
        kind: "subscription",
        badge: "Subscription",
        title: `Subscription: ${vendor}`,
        subtitle: `${amt} · due ${dueDateLabel(o.due_date)}`,
        fields: [
          { label: "Vendor", value: vendor },
          { label: "Amount", value: amt },
          { label: "Due date", value: dueDateLabel(o.due_date) },
          { label: "Recurrence", value: o.recurrence ?? "Not specified" },
        ],
      } satisfies LiveInsight;
    });
  return { isLoading: q.isLoading, insights };
}

export function useBrainDisputeInsights() {
  const { format } = useCurrency();
  const nameOf = useCounterpartyNames();
  const q = useQuery<ObligationsResponse>({
    queryKey: ["/api/brain/ledger/obligations?status=disputed"],
    retry: false,
  });
  const insights: LiveInsight[] = (q.data?.obligations ?? [])
    .filter((o) => o.status === "disputed")
    .map((o) => {
      const vendor = nameOf(o.counterparty_id) ?? "a vendor";
      const amt = format(o.amount_due);
      return {
        id: `dispute-${o.id}`,
        kind: "dispute",
        badge: "Dispute",
        title: `Disputed: ${vendor}`,
        subtitle: `${amt} · due ${dueDateLabel(o.due_date)}`,
        fields: [
          { label: "Vendor", value: vendor },
          { label: "Amount", value: amt },
          { label: "Due date", value: dueDateLabel(o.due_date) },
          { label: "Status", value: "Disputed" },
        ],
      } satisfies LiveInsight;
    });
  return { isLoading: q.isLoading, insights };
}

/* ── Cash flow: GET /ledger/cash_flows (trailing actuals, no projection) ─── */

interface BrainCashFlowDay {
  date: string;
  inflow: string;
  outflow: string;
  net: string;
}
interface BrainCashFlowCurrency {
  currency: string;
  inflow: string;
  outflow: string;
  net: string;
  transaction_count: number;
  by_day: BrainCashFlowDay[];
}
interface CashFlowSummaryResponse {
  since: string;
  until: string;
  currencies: BrainCashFlowCurrency[];
}

export function useBrainCashFlowInsight() {
  const { format } = useCurrency();
  const q = useQuery<CashFlowSummaryResponse>({
    queryKey: ["/api/brain/ledger/cash_flows"],
    retry: false,
  });
  // One record for the first currency present - cheapest honest slice; a
  // multi-currency tenant would need one card per currency, out of scope here.
  const currency = q.data?.currencies?.[0];
  if (!currency || currency.by_day.length === 0) {
    return { isLoading: q.isLoading, insight: null as LiveInsight | null };
  }
  const points: LiveInsightChartPoint[] = currency.by_day.map((d) => ({
    label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: Number(d.net) || 0,
  }));
  const insight: LiveInsight = {
    id: "cashflow-trailing",
    kind: "cashflow",
    badge: "Cash flow",
    title: `Trailing cash flow (${currency.currency})`,
    subtitle: `Net ${format(currency.net)} over ${currency.transaction_count} transactions`,
    chart: {
      points,
      unit: currency.currency,
      note: "Trailing actuals only - brain-core has no forward cash-flow projection yet.",
    },
  };
  return { isLoading: q.isLoading, insight };
}
