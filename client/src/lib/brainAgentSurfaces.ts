import { useQuery } from "@tanstack/react-query";
import { useCurrency } from "./useCurrency";

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
  /** Discriminant vs brain-core proposal items: these are ledger-derived
   *  observations — nothing is proposed for execution, so they must never
   *  render Approve/Reject. */
  itemKind: "detection";
  badge: string;
  /** Second hero pill summarising WHY the item was flagged, e.g. "New
   *  subscription" or "Recurring charge". Sourced from `flag_reason` when
   *  brain-core exposes it; derived from available obligation fields otherwise.
   *  Omit if genuinely no signal is available. */
  triggerBadge?: string;
  title: string;
  subtitle?: string;
  /** 0..1, only set when brain-core reports a real match confidence score. */
  confidence?: number;
  explanation?: string;
  /** One or two sentences from the agent's actual reasoning about what
   *  triggered this flag. Sourced from brain-core output when available;
   *  derived from available fields otherwise. */
  whyFlagged?: string;
  fields?: LiveInsightField[];
  /** Provenance / raw artifact id that is the originating source document for
   *  this insight. Shown as a clickable "Source" link in the modal. */
  sourceDocumentId?: string;
  evidenceIds?: string[];
  /** Per-cycle historical amounts for the payment history chart (oldest →
   *  newest). The current cycle is the last element. Empty / undefined until
   *  brain-core exposes obligation history — declared here so the modal can
   *  render it without a schema change when that endpoint ships. */
  paymentHistory?: LiveInsightChartPoint[];
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
      itemKind: "detection",
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
  return { isLoading: q.isLoading, isError: q.isError, insights };
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
  /** Raw artifact id that brain-core used as the source for this obligation.
   *  Present when brain-core exposes provenance on the obligations endpoint. */
  provenance?: string | null;
  /** brain-core's extraction confidence for this obligation record (0..1). Used
   *  as a recurrence-confidence proxy — no separate recurrence_confidence field
   *  is exposed by the API yet. Backend gap: if brain-core ever adds a dedicated
   *  recurrence confidence score, thread it through here instead. */
  confidence?: number | null;
  /** Why the agent surfaced this subscription for review. Backend gap: not yet
   *  emitted by brain-core's obligations endpoint; will be null until it does.
   *  When present, surface it verbatim as the trigger badge and Why Flagged
   *  copy rather than deriving a fallback. */
  flag_reason?: string | null;
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

/** Derive the trigger badge label from available obligation fields.
 *
 *  Brain-core's obligations endpoint does not yet emit a `flag_reason` field,
 *  so we fall back to a signal derived from what IS available. When brain-core
 *  adds `flag_reason`, the raw value will be surfaced verbatim instead
 *  (forward-compat: the field is declared on BrainObligation above).
 *
 *  Backend gap: replace the derived fallback below with `o.flag_reason` once
 *  brain-core populates it on the subscriptions feed. */
function deriveTriggerBadge(o: BrainObligation): string {
  if (o.flag_reason) return o.flag_reason;
  // A recurrence pattern hasn't been established → likely first occurrence.
  if (!o.recurrence) return "New subscription";
  // Low extraction confidence → worth a human look.
  if (typeof o.confidence === "number" && o.confidence < 0.6) return "Needs verification";
  return "Recurring charge";
}

/** Honest recurrence display. When brain-core provides a recurrence value,
 *  show it alongside the extraction confidence (the obligation-level confidence
 *  is the closest proxy for recurrence confidence the API currently offers).
 *
 *  Backend gap: replace `o.confidence` with a dedicated `recurrence_confidence`
 *  field if brain-core ever emits one. */
function recurrenceDisplay(o: BrainObligation): string {
  if (!o.recurrence) return "Not yet established (first occurrence)";
  const base = o.recurrence;
  if (typeof o.confidence === "number") {
    const pct = Math.round(o.confidence * 100);
    return `${base} (inferred, ${pct}% confidence)`;
  }
  return `${base} (inferred)`;
}

/** One or two sentences explaining the specific signal that triggered the flag.
 *
 *  Backend gap: brain-core does not yet emit agent reasoning on the obligations
 *  endpoint. When it does, `o.flag_reason` (or a `why_flagged` field) should
 *  replace the derivation below. */
function deriveWhyFlagged(o: BrainObligation, vendor: string, amt: string): string {
  if (o.flag_reason) {
    return `Brain flagged this subscription because: ${o.flag_reason}.`;
  }
  if (!o.recurrence) {
    return (
      `Brain detected what appears to be a new subscription charge from ${vendor} ` +
      `(${amt}). No prior recurrence pattern has been established for this vendor, ` +
      `so it is surfaced for your awareness.`
    );
  }
  const conf =
    typeof o.confidence === "number"
      ? ` Brain's extraction confidence for this record is ${Math.round(o.confidence * 100)}%.`
      : "";
  return (
    `Brain detected a recurring subscription charge from ${vendor} (${amt}, ` +
    `${o.recurrence} recurrence). Review the amount and due date to confirm no ` +
    `unexpected changes since the prior cycle.${conf}`
  );
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
        itemKind: "detection",
        badge: "Subscription",
        triggerBadge: deriveTriggerBadge(o),
        title: `Subscription: ${vendor}`,
        subtitle: `${amt} · due ${dueDateLabel(o.due_date)}`,
        whyFlagged: deriveWhyFlagged(o, vendor, amt),
        /* Vendor row removed: the vendor name is already in the card title so
           repeating it in Key Facts added no information. */
        fields: [
          { label: "Amount", value: amt },
          /* Backend gap (item 3): amount delta vs prior cycle omitted — the
             obligations API does not expose prior_amount. When brain-core adds
             it, render here as "${amt} (+$X vs last cycle)" with warning colour. */
          { label: "Due date", value: dueDateLabel(o.due_date) },
          { label: "Recurrence", value: recurrenceDisplay(o) },
        ],
        /* Source link (item 4): provenance is brain-core's raw artifact id for
           the document this obligation was extracted from. Present when brain-core
           populates the field; undefined otherwise. */
        sourceDocumentId: o.provenance ?? undefined,
        /* Backend gap (item 6): payment history chart requires per-cycle
           historical amounts, which the obligations endpoint does not yet expose.
           paymentHistory is intentionally left undefined until that data exists. */
      } satisfies LiveInsight;
    });
  return { isLoading: q.isLoading, isError: q.isError, insights };
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
        itemKind: "detection",
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
  return { isLoading: q.isLoading, isError: q.isError, insights };
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
    return { isLoading: q.isLoading, isError: q.isError, insight: null as LiveInsight | null };
  }
  const points: LiveInsightChartPoint[] = currency.by_day.map((d) => ({
    label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: Number(d.net) || 0,
  }));
  // Meaningful comparison from the same endpoint (not an echo of the subtitle):
  // the latest day's net vs a 30-day rolling daily average. A short window is
  // noise, not signal, so with fewer than 3 data points the Why line is omitted
  // entirely; with 3-29 days we fall back to the available window and say so.
  const windowDays = currency.by_day.slice(-30);
  const windowCount = windowDays.length;
  const latest = currency.by_day[currency.by_day.length - 1];
  const latestNet = Number(latest.net) || 0;
  let explanation: string | undefined;
  if (windowCount >= 3) {
    const windowNet = windowDays.reduce((s, d) => s + (Number(d.net) || 0), 0);
    const avgDailyNet = windowNet / windowCount;
    const windowLabel =
      windowCount >= 30 ? "30-day" : `${windowCount}-day (all available data)`;
    const avgStr = format(avgDailyNet.toFixed(2));
    if (windowNet < 0) {
      explanation = `Cash flow is trending negative. Outflows exceeded inflows by ${format(Math.abs(windowNet).toFixed(2))} over the past ${windowCount} days.`;
    } else if (avgDailyNet > 0 && latestNet > 2 * avgDailyNet) {
      explanation = `Latest day netted ${format(latestNet.toFixed(2))}, well above your ${avgStr} ${windowLabel} daily average. Check for a one-time item before reading this as a trend.`;
    } else if (avgDailyNet > 0 && latestNet < 0.5 * avgDailyNet) {
      explanation = `Latest day netted ${format(latestNet.toFixed(2))}, well below your ${avgStr} ${windowLabel} daily average.`;
    } else {
      explanation = `Latest day netted ${format(latestNet.toFixed(2))}, in line with your ${avgStr} ${windowLabel} daily average.`;
    }
  } else {
    /* Too short a window to compare against anything — but the card still owes
       the reader a reason it is on their screen, so state the trigger and the
       limitation instead of dropping the section. Never a comparison the data
       cannot support. */
    explanation =
      `Brain reports your trailing cash position whenever the ledger has activity. ` +
      `Only ${windowCount} day${windowCount === 1 ? "" : "s"} of movement ${windowCount === 1 ? "has" : "have"} been recorded so far, ` +
      `which is too short a window to compare against a trend.`;
  }
  const insight: LiveInsight = {
    id: "cashflow-trailing",
    kind: "cashflow",
    itemKind: "detection",
    badge: "Cash Forecasting",
    title: `Trailing cash flow (${currency.currency})`,
    subtitle: `Net ${format(currency.net)} over ${currency.transaction_count} transactions`,
    explanation,
    chart: {
      points,
      unit: currency.currency,
      note: "Trailing actuals only - brain-core has no forward cash-flow projection yet.",
    },
  };
  return { isLoading: q.isLoading, isError: q.isError, insight };
}
