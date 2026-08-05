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
import { unpaidApInvoices, payableObligations } from "@/lib/liabilities";
import { usePagedLedgerRead, ledgerFigureCaption } from "@/lib/ledgerRead";
import type { RawObligation } from "@/lib/brainObligations";
import {
  buildCashFlowRows,
  cashFlowTotals,
  cashFlowPeriodLabel,
  detailLine,
  incompleteMessage,
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
import { AlertCallout, UnavailableDataBox } from "@/components/Callout";
import { capitalCase } from "@/lib/displayLabels";
import { RecordPill } from "@/components/RecordPill";

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

/* `label` lets an owed row keep the bill treatment while naming what it actually is
   (Payroll, Tax). The styling is the kind's; only the word changes. */
const KindBadge = ({ kind, label }: { kind: CashFlowKind; label?: string }) => {
  const c = KIND_BADGE[kind];
  return (
    <RecordPill
      className=""
      style={{ background: c.bg, borderColor: c.border, color: c.fg }}
    >
      {capitalCase(label || KIND_LABEL[kind])}
    </RecordPill>
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
    const formatted = value == null ? "-" : format(value);
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
      "The invoice feed is unavailable. That is not the same as nothing being overdue. Treat this as unknown, not clear.";
  } else {
    if (invoices == null) return null; // still loading; the parent shows the settling state
    const overdue = invoices.filter(
      (i) => i.status === "overdue" && i.metadata?.scenario !== "ap",
    );
    if (overdue.length === 0) return null;
    /* "Customer" is doing real work here. This counts receivables — money owed TO
       you, but it now sits directly above the liabilities card and a list of bills
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

  return failed ? (
    <UnavailableDataBox testId="banner-overdue-unavailable">
      {headline}. {detail}
    </UnavailableDataBox>
  ) : (
    <AlertCallout title={headline} testId="banner-overdue">
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
  /* Liabilities read obligations, not invoices: the invoice feed carries no payroll,
     so the old figure understated what was owed and disagreed with the Payables
     tab. Invoices are still read above — they supply the dated bill ROWS below. */
  const obQ = usePagedLedgerRead<RawObligation>("/api/brain/ledger/obligations", "obligations");

  /* Three states, not two. `data === undefined` covers both "still loading" and
     "the request failed", and collapsing them is precisely how a failed read ends
     up rendering as a confident empty list. Derived without isPending/isLoading so
     it does not depend on which react-query major is installed. */
  const txs = txQ.data?.transactions ?? null;
  const invs = invQ.data?.invoices ?? null;
  const txFailed = txQ.isError || (txQ.data != null && txQ.data.transactions == null);
  const invFailed = invQ.isError || (invQ.data != null && invQ.data.invoices == null);
  const obs = obQ.read?.rows ?? null;
  const obFailed = obQ.failed;
  const txPending = txs == null && !txFailed;
  const invPending = invs == null && !invFailed;
  const settling = txPending || invPending;

  const nameOf = (id: string | null | undefined) =>
    (id && cpQ.data?.counterparties.find((c) => c.id === id)?.name) || null;

  /* Rows may be listed from a partial read — a row that exists is a real debt. The
     TOTAL may not: `cashFlowTotals` is handed the whole read so it can withhold a
     figure it could not finish summing. */
  const rows = buildCashFlowRows({ transactions: txs, invoices: invs, obligations: obs, nameOf });
  const totals = cashFlowTotals({ transactions: txs, invoices: invs, obligations: obQ.read });
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
  // Expenses = outflows already settled; what is still owed is captured under Liabilities.
  const expensesCaption = "Outflows settled and posted · what you still owe is in Payables";

  /* Liabilities: N obligations, next counterparty due — never restate the total.
     Counts obligations rather than the bill rows listed below, because that is what
     the figure above it now sums. Saying "N unpaid bills" here while the total also
     included payroll would have made the caption contradict its own number. */
  const obRows = payableObligations(obs);
  const liabilitiesCaption = (() => {
    if (obFailed) return "Source unavailable";
    if (obs == null) return "Loading…";
    /* Not final yet, and the number above cannot show that by itself: a truncated
       read has no total at all, and one taken mid-import is a floor that looks like
       a settled figure. Shared wording, so the same caveat reads identically here,
       on Overview, and at the foot of the Payables list. */
    if (obQ.read && (!obQ.read.complete || obQ.ingesting)) {
      return ledgerFigureCaption({ truncated: !obQ.read.complete, mayGrow: obQ.ingesting }, "");
    }
    if (obRows.length === 0) return "Nothing outstanding";
    // payableObligations sorts by due date, so the first non-overdue row is the next due.
    const next = obRows.find((o) => o.status !== "overdue");
    const nextParty = next ? (nameOf(next.counterparty_id) ?? "a counterparty") : null;
    return `${obRows.length} payable${obRows.length === 1 ? "" : "s"}${nextParty ? ` · next due ${nextParty}` : ""}`;
  })();

  return (
    <div className="flex flex-col gap-[16px] items-start w-full pb-[8px]">
      <OverdueInvoicesBanner format={format} invoices={invs} failed={invFailed} nameOf={nameOf} />

      {/* A source that failed must say so even though the rest of the tab still
          renders. Silence here is the difference between "no expenses" and
          "we could not find out". */}
      {(txFailed || invFailed || obFailed) && (
        <UnavailableDataBox testId="banner-cashflow-incomplete">
          {incompleteMessage({ tx: txFailed, inv: invFailed, ob: obFailed })}
        </UnavailableDataBox>
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

      {/* Separator — same pattern as Overview: h-px hairline + mb-[26px] gives the
          same breathing room between the metric block and the section label below. */}
      <div className="h-px relative shrink-0 w-full mb-[26px]" style={{ background: "#1d2132" }} />

      <WidgetCard title="Transactions" count={settling && rows.length === 0 ? undefined : rows.length}>
        {settling && rows.length === 0 ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] rounded-[8px] w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
              Loading…
            </p>
          </div>
        ) : rows.length === 0 ? (
          txFailed || invFailed ? (
            <UnavailableDataBox testId="text-cashflow-empty">
              {txFailed && invFailed
                ? "Nothing could be loaded, so there is nothing to show here yet."
                : txFailed
                  ? "Transactions couldn't be loaded, so there is nothing to show here yet."
                  : "Bills couldn't be loaded, so this list may be incomplete."}
            </UnavailableDataBox>
          ) : (
            <div className="flex gap-[12px] items-center px-[16px] py-[12px] rounded-[8px] w-full bg-[#0a0c10]" data-testid="text-cashflow-empty">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
                No money movement recorded yet. This fills in from your ledger as money comes in and goes out.
              </p>
            </div>
          )
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
                      <KindBadge kind={row.kind} label={row.badgeLabel} />
                      {row.flagged && (
                        <RecordPill
                          className="bg-[#350011] text-[#d20344] border-[rgba(210,3,68,0.2)]"
                          testId={`badge-cashflow-anomaly-${idx}`}
                        >
                          <img src={alertIcon} alt="" className="size-[12px]" />
                          Anomaly
                        </RecordPill>
                      )}
                    </div>
                    {detailLine(row.sublabel, row.date) && (
                      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px]">
                        {detailLine(row.sublabel, row.date)}
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
