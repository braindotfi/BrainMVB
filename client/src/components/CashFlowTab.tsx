/**
 * Cash Flow — one tab in place of five (Recent, Bills, Income, Expenses,
 * Liabilities).
 *
 * Those five were filtered reads of the same two feeds, so the same $48,000
 * payment was a row under Recent and an invisible contribution to a total under
 * Income, with nothing on screen connecting them. This renders the feeds once:
 * three headline figures, then one dated list of everything that moved or is owed.
 *
 * Ordering and totals live in `lib/cashFlow.ts` so they are testable without a DOM.
 * What stays here is the part that must be seen to be judged — and the reachability
 * states, which are the reason this file is careful rather than short.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { unpaidApInvoices } from "@/lib/liabilities";
import {
  buildCashFlowRows,
  cashFlowTotals,
  cashFlowPeriodLabel,
  KIND_LABEL,
  type CashFlowKind,
} from "@/lib/cashFlow";
import {
  Divider,
  WidgetCard,
  type InvoicesLiteResponse,
  type CounterpartiesLiteResponse,
} from "@/components/LedgerWidgets";
import { BillDetailPopup, type BrainInvoiceDTO as BillDTO } from "@/components/BillDetailPopup";
import alertIcon from "@assets/Icons_1783274957589.png";

interface TxDTO {
  id: string;
  amount: string;
  currency: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
  counterparty_id?: string | null;
  description_normalized?: string | null;
  description_raw?: string | null;
}
interface TxResponse {
  transactions: TxDTO[];
}

type Format = (a: string | number) => string;

/* ── badges ──────────────────────────────────────────────────────────────── */
/* Colours are the existing surfaces already used for these meanings elsewhere
   (#123509 green, #350011 red, #4a2300 amber), so a row reads the same way here
   as the same fact does on Overview. Borders are declared with an explicit
   `border border-solid`; a colour alone renders no stroke at all. */
const KIND_BADGE: Record<CashFlowKind, { bg: string; border: string; fg: string }> = {
  income: { bg: "#123509", border: "rgba(66,191,35,0.25)", fg: "#42bf23" },
  expense: { bg: "#350011", border: "rgba(210,3,68,0.25)", fg: "#d20344" },
  bill: { bg: "#4a2300", border: "rgba(255,148,0,0.25)", fg: "#ff9400" },
  transfer: { bg: "#222737", border: "#2c3247", fg: "#6c779d" },
  adjustment: { bg: "#222737", border: "#2c3247", fg: "#6c779d" },
};

const AMOUNT_COLOUR: Record<"+" | "-" | "", string> = {
  "+": "#42bf23",
  "-": "#d20344",
  "": "#a8b9f4",
};

const KindBadge = ({ kind }: { kind: CashFlowKind }) => {
  const c = KIND_BADGE[kind];
  return (
    <span
      className="[font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[12px] px-[6px] py-[3px] rounded-[4px] border border-solid shrink-0"
      style={{ background: c.bg, borderColor: c.border, color: c.fg }}
    >
      {KIND_LABEL[kind]}
    </span>
  );
};

/* ── notices ─────────────────────────────────────────────────────────────── */

const Notice = ({
  tone,
  children,
  testId,
}: {
  tone: "amber" | "muted";
  children: React.ReactNode;
  testId?: string;
}) => {
  const c =
    tone === "amber"
      ? { bg: "#4a2300", border: "rgba(255,148,0,0.2)", fg: "#ff9400" }
      : { bg: "#0a0c10", border: "#1d2132", fg: "#6c779d" };
  return (
    <div
      className="flex items-start gap-[8px] p-[12px] rounded-[12px] w-full border border-solid shrink-0"
      style={{ background: c.bg, borderColor: c.border }}
      data-testid={testId}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke={c.fg} strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke={c.fg} strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill={c.fg} />
      </svg>
      <p
        className="[word-break:break-word] flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[18px] min-w-px text-[14px]"
        style={{ color: c.fg }}
      >
        {children}
      </p>
    </div>
  );
};

/* ── metrics ─────────────────────────────────────────────────────────────── */

const Metric = ({
  label,
  value,
  caption,
  colour,
  testId,
  format,
}: {
  label: string;
  /** `null` renders an em dash. Never pass 0 for "we could not read it". */
  value: number | null;
  caption: string;
  colour?: string;
  testId: string;
  format: Format;
}) => (
  <div className="bg-[#0a0c10] border border-solid border-[#1d2132] rounded-[12px] p-[14px] flex flex-col gap-[6px]" data-testid={testId}>
    <p className="[font-family:'Gilroy',sans-serif] font-semibold uppercase leading-[14px] text-[#414965] text-[11px] tracking-[0.4px]">
      {label}
    </p>
    <p
      className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[26px] text-[22px]"
      style={{ color: value == null ? "#414965" : (colour ?? "#a8b9f4") }}
    >
      {value == null ? "—" : format(value)}
    </p>
    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[12px]">{caption}</p>
  </div>
);

/* ── overdue receivables banner (moved from FinancesPage) ────────────────── */

function daysLate(due?: string | null): number {
  if (!due) return 0;
  const t = new Date(due).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const OverdueInvoicesBanner = ({ format }: { format: Format }) => {
  const { data: invData } = useQuery<InvoicesLiteResponse>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesLiteResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  const overdue = (invData?.invoices ?? []).filter(
    (i) => i.status === "overdue" && i.metadata?.scenario !== "ap",
  );
  if (overdue.length === 0) return null;

  const nameOf = (id: string) => cpData?.counterparties.find((c) => c.id === id)?.name ?? "a customer";
  const detail = overdue
    .slice(0, 3)
    .map((i) => `${format(Number(i.amount_due))} from ${nameOf(i.counterparty_id)} (${daysLate(i.due_date)} days late)`)
    .join(" and ");

  return (
    <div className="bg-[#4a2300] border border-[rgba(255,148,0,0.2)] border-solid flex items-center p-[8px] relative rounded-[12px] shrink-0 w-full">
      <div className="flex flex-[1_0_0] gap-[8px] items-start min-w-px relative">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
          <circle cx="8" cy="8" r="7" stroke="#ff9400" strokeWidth="1.3" />
          <path d="M8 7.3v4.2" stroke="#ff9400" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="4.7" r="0.9" fill="#ff9400" />
        </svg>
        <div className="[word-break:break-word] flex flex-[1_0_0] flex-col gap-[4px] items-start justify-center leading-[16px] min-w-px text-[#ff9400] text-[14px]">
          {/* "Customer" is doing real work here. This banner counts receivables —
              money owed TO you — but it now sits directly above the liabilities
              card and a list of bills you owe. On the old split tabs the two piles
              never shared a screen; here, an unqualified "6 invoices overdue" over
              "3 bills" reads as one number contradicting the other. */}
          <p className="[font-family:'Gilroy',sans-serif] font-bold shrink-0 uppercase w-full">
            {overdue.length} customer invoice{overdue.length === 1 ? "" : "s"} overdue!
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium shrink-0 w-full">{detail}.</p>
        </div>
      </div>
    </div>
  );
};

/* ── income insight (moved from FinancesPage) ────────────────────────────── */

function summarizeIncome(txs: TxDTO[]): { monthly: number; count: number; topCpIds: string[]; share: number } | null {
  const inflows = txs.filter((t) => t.direction === "inflow");
  if (inflows.length === 0) return null;
  const months = new Set<string>();
  const byCp = new Map<string, number>();
  let total = 0;
  for (const t of inflows) {
    const amt = Number(t.amount);
    if (!Number.isFinite(amt)) continue;
    total += amt;
    months.add(t.transaction_date.slice(0, 7));
    const cp = t.counterparty_id ?? "-";
    byCp.set(cp, (byCp.get(cp) ?? 0) + amt);
  }
  const ranked = Array.from(byCp.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 3);
  const share = total > 0 ? Math.round((top.reduce((s, [, v]) => s + v, 0) / total) * 100) : 0;
  return { monthly: total / Math.max(1, months.size), count: byCp.size, topCpIds: top.map(([id]) => id), share };
}

/* ── the tab ─────────────────────────────────────────────────────────────── */

export function CashFlowTab({ format, onOpenTx }: { format: Format; onOpenTx: (txId: string) => void }): JSX.Element {
  const [openBill, setOpenBill] = useState<BillDTO | null>(null);

  const txQ = useQuery<TxResponse>({ queryKey: ["/api/brain/ledger/transactions"], retry: false });
  const invQ = useQuery<InvoicesLiteResponse>({ queryKey: ["/api/brain/ledger/invoices"], retry: false });
  const cpQ = useQuery<CounterpartiesLiteResponse>({ queryKey: ["/api/brain/ledger/counterparties"], retry: false });

  /* Three states, not two. `data === undefined` covers both "still loading" and
     "the request failed", and collapsing them is precisely how a failed read ends
     up rendering as a confident empty list. Derived without isPending/isLoading so
     it does not depend on which react-query major is installed. */
  const txs = txQ.data?.transactions ?? null;
  const invs = invQ.data?.invoices ?? null;
  const txFailed = txQ.isError || (txQ.data != null && txQ.data.transactions == null);
  const invFailed = invQ.isError || (invQ.data != null && invQ.data.invoices == null);
  const txPending = txs == null && !txFailed;
  const invPending = invs == null && !invFailed;
  const settling = txPending || invPending;

  const nameOf = (id: string | null | undefined) =>
    (id && cpQ.data?.counterparties.find((c) => c.id === id)?.name) || null;

  const rows = buildCashFlowRows({ transactions: txs, invoices: invs, nameOf });
  const totals = cashFlowTotals({ transactions: txs, invoices: invs });
  const period = cashFlowPeriodLabel(totals.periodStart, totals.periodEnd);

  /* The period the figures actually cover, named. The mock labels these "(30d)";
     on real data every recorded transaction predates that window, so a literal
     30-day metric reads $0 and looks like a business that stopped earning rather
     than a window with nothing in it. */
  const periodCaption = period ?? (txFailed ? "Source unavailable" : "No dated activity yet");

  const income = totals.income;
  const expenses = totals.expenses;
  const liabilities = totals.liabilities;

  const apBills = unpaidApInvoices(invs ?? []);
  const billById = new Map(apBills.map((b) => [b.id, b]));

  const incomeInsight = (() => {
    if (txs == null) return null;
    const s = summarizeIncome(txs);
    if (!s) return null;
    const names = s.topCpIds.map((id) => nameOf(id) ?? "a customer");
    const joined =
      names.length <= 1
        ? names[0] ?? "one customer"
        : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    const verb = names.length > 1 ? "are" : "is";
    const tail = s.share >= 99 ? ", essentially all your revenue" : `, together about ${s.share}% of your revenue`;
    return `About ${format(Math.round(s.monthly))} a month from ${s.count} customer${s.count === 1 ? "" : "s"}. Your biggest ${verb} ${joined}${tail}.`;
  })();

  const liabilityInsight = (() => {
    if (invs == null) return null;
    if (apBills.length === 0) return "No outstanding liabilities. You're all caught up.";
    const total = apBills.reduce((s, i) => s + (Number(i.amount_due) || 0), 0);
    const overdue = apBills.filter((i) => i.status === "overdue");
    const next = [...apBills]
      .sort((a, b) => new Date(a.due_date ?? 0).getTime() - new Date(b.due_date ?? 0).getTime())
      .find((i) => i.status !== "overdue");
    const owe = `You owe ${format(Math.round(total))} across ${apBills.length} bill${apBills.length === 1 ? "" : "s"}.`;
    const od = overdue.length
      ? ` ${nameOf(overdue[0].counterparty_id) ?? "A vendor"} for ${format(Number(overdue[0].amount_due))} is overdue.`
      : "";
    const nx = next
      ? ` Your next is ${nameOf(next.counterparty_id) ?? "a vendor"} for ${format(Number(next.amount_due))}.`
      : "";
    return `${owe}${od}${nx}`;
  })();

  return (
    <div className="flex flex-col gap-[16px] items-start w-full pb-[8px]">
      <OverdueInvoicesBanner format={format} />

      {/* A source that failed must say so even though the rest of the tab still
          renders. Silence here is the difference between "no expenses" and
          "we could not find out". */}
      {(txFailed || invFailed) && (
        <Notice tone="amber" testId="banner-cashflow-incomplete">
          {txFailed && invFailed
            ? "Cash flow couldn't be loaded. These figures are not a statement that nothing moved — reconnect or refresh to see the real position."
            : txFailed
              ? "Transactions couldn't be loaded, so income and expenses are unavailable. Bills below are complete."
              : "Bills couldn't be loaded, so liabilities are unavailable. Transactions below are complete."}
        </Notice>
      )}

      {/* Container-relative, never viewport breakpoints: the Ledger sits in a
          narrow centre column and fixed breakpoints clip the figures. */}
      <div className="grid gap-[12px] w-full" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Metric
          label="Income"
          value={income}
          caption={periodCaption}
          colour="#42bf23"
          testId="metric-cashflow-income"
          format={format}
        />
        <Metric
          label="Expenses"
          value={expenses}
          caption={periodCaption}
          colour="#d20344"
          testId="metric-cashflow-expenses"
          format={format}
        />
        <Metric
          label="Liabilities"
          value={liabilities}
          caption={invFailed ? "Source unavailable" : "Unpaid bills you still owe"}
          testId="metric-cashflow-liabilities"
          format={format}
        />
      </div>

      {incomeInsight && (
        <p
          className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[15px] w-full"
          data-testid="text-cashflow-income-insight"
        >
          {incomeInsight}
        </p>
      )}
      {liabilityInsight && (
        <p
          className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[15px] w-full"
          data-testid="text-cashflow-liability-insight"
        >
          {liabilityInsight}
        </p>
      )}

      <WidgetCard title="Cash flow" count={settling && rows.length === 0 ? undefined : rows.length}>
        {settling && rows.length === 0 ? (
          <div className="flex gap-[16px] items-center p-[8px] rounded-[8px] w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
              Loading…
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex gap-[16px] items-center p-[8px] rounded-[8px] w-full bg-[#0a0c10]" data-testid="text-cashflow-empty">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
              {txFailed && invFailed
                ? "Nothing could be loaded, so there is nothing to show here yet."
                : "No money movement recorded yet. This fills in from your ledger as money comes in and goes out."}
            </p>
          </div>
        ) : (
          rows.map((row, idx) => {
            const bill = row.invoiceId ? billById.get(row.invoiceId) : undefined;
            const open = row.txId
              ? () => onOpenTx(row.txId!)
              : bill
                ? () => setOpenBill(bill as unknown as BillDTO)
                : undefined;
            return (
              <div key={row.key} className="flex flex-col gap-[8px] w-full">
                <div
                  role={open ? "button" : undefined}
                  tabIndex={open ? 0 : undefined}
                  data-testid={`row-cashflow-${row.key}`}
                  onClick={open}
                  onKeyDown={
                    open
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            open();
                          }
                        }
                      : undefined
                  }
                  className={[
                    "flex gap-[16px] items-center p-[8px] rounded-[8px] w-full bg-[#0a0c10] border border-solid border-transparent transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]",
                    open ? "hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer" : "",
                  ].join(" ")}
                >
                  <div className="flex flex-1 flex-col items-start justify-center min-w-px gap-[4px]">
                    <div className="flex gap-[8px] items-center flex-wrap">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
                        {row.label}
                      </p>
                      <KindBadge kind={row.kind} />
                      {row.flagged && (
                        <span className="flex items-center gap-[4px] bg-[#350011] border border-solid border-[rgba(210,3,68,0.2)] rounded-[4px] px-[6px] py-[3px]">
                          <img src={alertIcon} alt="" className="size-[12px]" />
                          <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#d20344] text-[11px]">
                            anomaly
                          </span>
                        </span>
                      )}
                    </div>
                    {(row.sublabel || row.date) && (
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                        {[row.sublabel, row.date].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <p
                    className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[18px] text-right whitespace-nowrap shrink-0"
                    style={{ color: AMOUNT_COLOUR[row.sign] }}
                  >
                    {row.sign}
                    {format(row.amount)}
                  </p>
                </div>
                {idx < rows.length - 1 && <Divider />}
              </div>
            );
          })
        )}
      </WidgetCard>

      <BillDetailPopup
        bill={openBill}
        vendorName={openBill ? (nameOf(openBill.counterparty_id) ?? "Unknown vendor") : ""}
        bills={apBills as unknown as BillDTO[]}
        onSelectBill={(b) => setOpenBill(b)}
        onClose={() => setOpenBill(null)}
      />
    </div>
  );
}
