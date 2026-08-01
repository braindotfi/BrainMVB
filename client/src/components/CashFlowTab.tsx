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
  type InvoiceLite,
  type InvoicesLiteResponse,
  type CounterpartiesLiteResponse,
} from "@/components/LedgerWidgets";
import { BillDetailPopup, type BrainInvoiceDTO as BillDTO } from "@/components/BillDetailPopup";
import alertIcon from "@assets/Icons_1783274957589.png";
import { AlertCallout, InfoIcon } from "@/components/Callout";

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
  // "amber" was this file's warning tone; warnings now share the app-wide alert
  // frame, so only the muted/neutral note stays local.
  if (tone === "amber") {
    return (
      <AlertCallout testId={testId} className="shrink-0">
        {children}
      </AlertCallout>
    );
  }
  return (
    <div
      className="flex items-start gap-[8px] p-[12px] rounded-[12px] w-full border border-solid shrink-0"
      style={{ background: "#0a0c10", borderColor: "#1d2132" }}
      data-testid={testId}
    >
      <InfoIcon color="#6c779d" className="mt-[2px]" />
      <p className="[word-break:break-word] flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[18px] min-w-px text-[14px] text-[#6c779d]">
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
  (() => {
    const formatted = value == null ? "—" : format(value);
    const parts = formatted.match(/^(.+)\.(\d{2})$/);
    const whole = parts ? parts[1] : formatted;
    const cents = parts ? `.${parts[2]}` : "";
    const amountColor = value == null ? "#414965" : (colour ?? "#a8b9f4");

    return (
  <div className="bg-[#0a0c10] border border-transparent rounded-[16px] p-[16px] flex flex-col gap-[8px]" data-testid={testId}>
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#414965] text-[13px] uppercase">
      {label}
    </p>
    <p
      className="[font-family:'JetBrains_Mono',monospace] leading-[0] relative shrink-0 text-[0px] w-full whitespace-nowrap"
    >
      <span className="font-medium leading-[36px] text-[28px]" style={{ color: amountColor }}>{whole}</span>
      {cents && <span className="font-medium leading-[36px] text-[18px]" style={{ color: amountColor }}>{cents}</span>}
    </p>
    <p className="[font-family:'Gilroy',sans-serif] font-normal leading-[18px] text-[#414965] text-[13px] w-full">{caption}</p>
  </div>
    );
  })()
);

/* ── overdue receivables banner (moved from FinancesPage) ────────────────── */

function daysLate(due?: string | null): number {
  if (!due) return 0;
  const t = new Date(due).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const OverdueInvoicesBanner = ({
  format,
  invoices,
  failed,
  nameOf,
}: {
  format: Format;
  /** null = not read yet. Distinct from `[]`, which means genuinely none. */
  invoices: readonly InvoiceLite[] | null;
  failed: boolean;
  nameOf: (id: string | null | undefined) => string | null;
}) => {
  let headline: string;
  let detail: string;

  if (failed) {
    /* This banner is a warning, and a warning that disappears when its source
       breaks is worse than no warning at all: the screen looks the same as a
       tenant with nothing overdue. It previously ran its own query and read
       `data?.invoices ?? []`, so an outage silently produced zero overdue rows.
       It now shares the parent's read and says so when that read failed. */
    headline = "Overdue invoices couldn't be checked";
    detail =
      "The invoice feed is unavailable. That is not the same as nothing being overdue — treat this as unknown, not clear.";
  } else {
    if (invoices == null) return null; // still loading; the parent shows the settling state
    const overdue = invoices.filter(
      (i) => i.status === "overdue" && i.metadata?.scenario !== "ap",
    );
    if (overdue.length === 0) return null;
    /* "Customer" is doing real work here. This counts receivables — money owed TO
       you — but it now sits directly above the liabilities card and a list of bills
       you owe. On the old split tabs the two piles never shared a screen; here, an
       unqualified "6 invoices overdue" over "3 bills" reads as one number
       contradicting the other. */
    headline = `${overdue.length} customer invoice${overdue.length === 1 ? "" : "s"} overdue!`;
    detail =
      overdue
        .slice(0, 3)
        .map(
          (i) =>
            `${format(Number(i.amount_due))} from ${nameOf(i.counterparty_id) ?? "a customer"} (${daysLate(i.due_date)} days late)`,
        )
        .join(" and ") + ".";
  }

  return (
    <AlertCallout title={headline} testId={failed ? "banner-overdue-unavailable" : "banner-overdue"}>
      {detail}
    </AlertCallout>
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

  /* ── per-card captions (short; headline number is already in the card) ── */

  // Income: how many customers, who leads — but never restate the total
  const incomeCaption = (() => {
    if (txs == null) return periodCaption;
    const s = summarizeIncome(txs);
    if (!s || s.topCpIds.length === 0) return periodCaption ?? "No dated activity yet";
    const names = s.topCpIds.slice(0, 2).map((id) => nameOf(id) ?? "a customer");
    const top = names.length === 1 ? names[0] : `${names[0]} & ${names[1]}`;
    return `${s.count} customer${s.count === 1 ? "" : "s"} · mostly ${top}`;
  })();

  // Expenses: always make the scope explicit so $0 next to large bills doesn't read as a bug.
  // Expenses = outflows already settled; unpaid AP bills are captured under Liabilities instead.
  const expensesCaption = "Outflows settled and posted · unpaid bills are in Liabilities";

  // Liabilities: N bills, next vendor due — never restate the total
  const liabilitiesCaption = (() => {
    if (invFailed) return "Source unavailable";
    if (invs == null) return "Loading…";
    if (apBills.length === 0) return "No outstanding bills";
    const next = [...apBills]
      .sort((a, b) => new Date(a.due_date ?? 0).getTime() - new Date(b.due_date ?? 0).getTime())
      .find((i) => i.status !== "overdue");
    const nextVendor = next ? (nameOf(next.counterparty_id) ?? "a vendor") : null;
    return `${apBills.length} unpaid bill${apBills.length === 1 ? "" : "s"}${nextVendor ? ` · next due ${nextVendor}` : ""}`;
  })();

  return (
    <div className="flex flex-col gap-[16px] items-start w-full pb-[8px]">
      <OverdueInvoicesBanner format={format} invoices={invs} failed={invFailed} nameOf={nameOf} />

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
          caption={incomeCaption}
          colour="#42bf23"
          testId="metric-cashflow-income"
          format={format}
        />
        <Metric
          label="Expenses"
          value={expenses}
          caption={expensesCaption}
          colour="#d20344"
          testId="metric-cashflow-expenses"
          format={format}
        />
        <Metric
          label="Liabilities"
          value={liabilities}
          caption={liabilitiesCaption}
          testId="metric-cashflow-liabilities"
          format={format}
        />
      </div>

      <WidgetCard title="Cash Flow" count={settling && rows.length === 0 ? undefined : rows.length}>
        {settling && rows.length === 0 ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] rounded-[8px] w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
              Loading…
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] rounded-[8px] w-full bg-[#0a0c10]" data-testid="text-cashflow-empty">
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
              <div
                  key={row.key}
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
                    "flex gap-[12px] items-center px-[16px] py-[12px] w-full bg-[#0a0c10] transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]",
                    "border-b border-solid border-[#1d2132] last:border-b-0",
                    open ? "hover:bg-[#11141b] cursor-pointer" : "",
                  ].join(" ")}
                >
                  <div className="flex flex-1 flex-col items-start justify-center min-w-px gap-[4px]">
                    <div className="flex gap-[8px] items-center flex-wrap">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px]">
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
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px]">
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
