import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currencyContext";
import { useIntents } from "@/lib/intentsStore";

// ─── brain-core shapes (subset rendered here; via the BFF proxy) ─────────────

interface BrainInvoiceDTO {
  id: string;
  invoice_number: string;
  counterparty_id: string;
  amount_due: string;
  currency: string;
  due_date?: string | null;
  status: string;
  metadata?: { scenario?: string; po?: string | null; flags?: string[] } | null;
}
interface InvoicesResponse {
  invoices: BrainInvoiceDTO[];
}

interface CounterpartyDTO {
  id: string;
  name?: string | null;
}
interface CounterpartiesResponse {
  counterparties: CounterpartyDTO[];
}

interface PolicyTraceEntry {
  rule_id: string;
  matched: boolean;
  checks: Array<{ key: string; passed: boolean; detail?: string }>;
}
interface PolicyDecision {
  outcome: "allow" | "confirm" | "reject";
  matched_rule_id: string | null;
  required_approvers: string[];
  trace: PolicyTraceEntry[];
}
interface PaymentIntentDTO {
  id: string;
  amount: string;
  currency: string;
  status: string;
  policy_decision_id: string | null;
}
interface ProposeResponse {
  intent: PaymentIntentDTO;
  decision: PolicyDecision | null;
}

// ─── decision presentation ───────────────────────────────────────────────────

type OutcomeStyle = { label: string; color: string; bg: string; blurb: (d: PolicyDecision) => string };

/** Map the §6/Policy outcome to label + palette + one-line explanation.
 *  We derive the outcome from the authoritative PaymentIntent.status, falling
 *  back to the evaluate decision (they agree on the demo seed). */
const OUTCOME_STYLE: Record<PolicyDecision["outcome"], OutcomeStyle> = {
  allow: {
    label: "Auto-approved",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    blurb: () => "Brain can pay this now — approved vendor, within the auto-pay limit.",
  },
  confirm: {
    label: "Needs approval",
    color: "#ff9500",
    bg: "rgba(255,149,0,0.08)",
    blurb: (d) =>
      `Above the auto-pay limit — requires sign-off from ${
        d.required_approvers.length > 0 ? d.required_approvers.join(" + ") : "an approver"
      } before it can settle.`,
  },
  reject: {
    label: "Blocked",
    color: "#d20344",
    bg: "rgba(210,3,68,0.08)",
    blurb: () => "Brain refused this — the vendor is not on the approved list.",
  },
};

/** PaymentIntent.status → policy outcome (HTTP states collapse onto the triple). */
function statusToOutcome(status: string): PolicyDecision["outcome"] {
  if (status === "rejected") return "reject";
  if (status === "pending_approval") return "confirm";
  return "allow"; // approved / proposed
}

function fmtDue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── component ───────────────────────────────────────────────────────────────

export function BrainBillsInbox() {
  const { format } = useCurrency();
  const { addProposed, markDeclined } = useIntents();
  const [results, setResults] = useState<Record<string, ProposeResponse>>({});
  const [openTrace, setOpenTrace] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: invData } = useQuery<InvoicesResponse>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const [declined, setDeclined] = useState<Record<string, boolean>>({});

  const propose = useMutation<ProposeResponse, Error, string>({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("POST", "/api/brain/propose", { invoice_id: invoiceId });
      return (await res.json()) as ProposeResponse;
    },
    onMutate: (invoiceId) => setActiveId(invoiceId),
    onSuccess: (data, invoiceId) => {
      setResults((r) => ({ ...r, [invoiceId]: data }));
      // Publish to the session-wide feed so Review/Activity can surface it.
      const bill = invData?.invoices.find((i) => i.id === invoiceId);
      const vendor = cpData?.counterparties.find((c) => c.id === bill?.counterparty_id)?.name ?? "Vendor";
      const amount = Number(data.intent.amount) || (bill ? Number(bill.amount_due) : 0) || 0;
      addProposed({
        intentId: data.intent.id,
        invoiceId,
        vendor,
        invoiceNumber: bill?.invoice_number ?? invoiceId,
        amount,
        currency: data.intent.currency || bill?.currency || "USD",
        outcome: statusToOutcome(data.intent.status),
        status: data.intent.status,
        requiredApprovers: data.decision?.required_approvers ?? [],
      });
    },
    onSettled: () => setActiveId(null),
  });

  // Operator declines a proposed bill → real reject on brain-core (no money moves).
  const reject = useMutation<PaymentIntentDTO, Error, { invoiceId: string; intentId: string }>({
    mutationFn: async ({ intentId }) => {
      const res = await apiRequest("POST", "/api/brain/reject", {
        payment_intent_id: intentId,
        reason: "Declined by operator",
      });
      return ((await res.json()) as { intent: PaymentIntentDTO }).intent;
    },
    onMutate: ({ invoiceId }) => setActiveId(invoiceId),
    onSuccess: (_data, { invoiceId, intentId }) => {
      setDeclined((d) => ({ ...d, [invoiceId]: true }));
      markDeclined(intentId);
    },
    onSettled: () => setActiveId(null),
  });

  // AP bills only (seed marks them scenario:"ap"); newest-largest first is fine as-is.
  const bills = (invData?.invoices ?? []).filter((i) => i.metadata?.scenario === "ap");
  if (bills.length === 0) return null; // brain-core unreachable / not configured

  const nameOf = (cpId: string): string => {
    const cp = cpData?.counterparties.find((c) => c.id === cpId);
    return cp?.name ?? "Unknown vendor";
  };

  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      {/* Header */}
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">Bills</p>
        </div>
      </div>

      <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
        {bills.map((bill) => {
          const result = results[bill.id];
          const isBusy = propose.isPending && activeId === bill.id;
          const outcome = result ? statusToOutcome(result.intent.status) : null;
          const style = outcome ? OUTCOME_STYLE[outcome] : null;
          const flags = bill.metadata?.flags ?? [];

          return (
            <div
              key={bill.id}
              data-testid={`bill-${bill.invoice_number}`}
              className="border border-[#1d2132] border-solid flex flex-col gap-[8px] p-[12px] relative rounded-[12px] shrink-0 w-full"
            >
              {/* Bill row */}
              <div className="flex gap-[16px] items-center w-full">
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
                    {nameOf(bill.counterparty_id)}
                  </p>
                  <div className="flex gap-[6px] items-center">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                      {bill.invoice_number}
                      {bill.due_date ? ` · due ${fmtDue(bill.due_date)}` : ""}
                    </p>
                    {flags.length > 0 && (
                      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#ff9500] text-[12px]">
                        ⚠ {flags.join(", ").replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>
                <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
                  {format(Number(bill.amount_due))}
                </p>
                {!result && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => propose.mutate(bill.id)}
                    data-testid={`propose-${bill.invoice_number}`}
                    className="[font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4] bg-[#240757] border border-[rgba(118,49,238,0.4)] rounded-[8px] px-[12px] py-[8px] whitespace-nowrap transition-colors hover:bg-[#2d0a6b] disabled:opacity-50"
                  >
                    {isBusy ? "Brain is thinking…" : "Let Brain pay"}
                  </button>
                )}
              </div>

              {/* Decision */}
              {result && style && outcome && (
                <div
                  className="flex flex-col gap-[6px] p-[10px] rounded-[8px] w-full"
                  style={{ background: style.bg, border: `1px solid ${style.color}33` }}
                >
                  <div className="flex items-center gap-[8px]">
                    <span
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] rounded-[6px] px-[8px] py-[2px]"
                      style={{ color: style.color, background: `${style.color}22` }}
                    >
                      {style.label}
                    </span>
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">
                      §6 gate · {outcome.toUpperCase()}
                    </span>
                  </div>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#a8b9f4] text-[14px]">
                    {result.decision ? style.blurb(result.decision) : style.blurb({ outcome, matched_rule_id: null, required_approvers: [], trace: [] })}
                  </p>

                  {result.decision && result.decision.trace.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpenTrace((o) => ({ ...o, [bill.id]: !o[bill.id] }))}
                        className="[font-family:'Gilroy',sans-serif] font-semibold text-[#7631ee] text-[13px] text-left w-fit"
                      >
                        {openTrace[bill.id] ? "Hide policy reasoning" : "Show policy reasoning"}
                      </button>
                      {openTrace[bill.id] && (
                        <div className="flex flex-col gap-[6px] mt-[4px]">
                          {result.decision.trace.map((rule) => (
                            <div
                              key={rule.rule_id}
                              className="border border-[#1d2132] rounded-[6px] p-[8px] flex flex-col gap-[3px]"
                              style={rule.matched ? { borderColor: `${style.color}55` } : undefined}
                            >
                              <p className="[font-family:'JetBrains_Mono',monospace] text-[12px]" style={{ color: rule.matched ? style.color : "#6c779d" }}>
                                {rule.matched ? "▸ " : "  "}
                                {rule.rule_id}
                                {rule.matched ? " (matched)" : ""}
                              </p>
                              {rule.checks.map((chk, i) => (
                                <p
                                  key={i}
                                  className="[font-family:'JetBrains_Mono',monospace] text-[12px] pl-[12px]"
                                  style={{ color: chk.passed ? "#34d399" : "#6c779d" }}
                                >
                                  {chk.passed ? "✓" : "✗"} {chk.key}
                                  {chk.detail ? ` — ${chk.detail}` : ""}
                                </p>
                              ))}
                            </div>
                          ))}
                          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px]">
                            Proposal {result.intent.id} · decision {result.intent.policy_decision_id ?? "—"} · not executed
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Human oversight: decline a proposed bill (real reject; no money moves) */}
                  {outcome !== "reject" &&
                    (declined[bill.id] ? (
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#d20344] text-[13px]">
                        ✕ You declined this — Brain will not pay it.
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={reject.isPending && activeId === bill.id}
                        onClick={() => reject.mutate({ invoiceId: bill.id, intentId: result.intent.id })}
                        data-testid={`decline-${bill.invoice_number}`}
                        className="[font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#d20344] border border-[rgba(210,3,68,0.4)] rounded-[8px] px-[12px] py-[6px] w-fit transition-colors hover:bg-[rgba(210,3,68,0.08)] disabled:opacity-50"
                      >
                        {reject.isPending && activeId === bill.id ? "Declining…" : "Decline"}
                      </button>
                    ))}
                </div>
              )}

              {propose.isError && activeId === null && !result && (
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#d20344] text-[13px]">
                  Couldn't reach Brain to propose this payment.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}