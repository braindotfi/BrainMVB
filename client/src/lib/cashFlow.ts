/**
 * Cash flow — the Ledger's single money-movement view.
 *
 * Replaces five separate tabs (Recent, Bills, Income, Expenses, Liabilities) that
 * were each a filtered read of the same two feeds: ledger transactions and ledger
 * invoices. Splitting one dataset across five tabs meant the same $48,000 payment
 * was a row under "Recent" and a contribution to a total under "Income", and
 * nothing on screen said they were the same event.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **Nothing is silently dropped.** Every transaction becomes a row, including
 *    `transfer` and `adjustment`, which are neither income nor expense. Filtering
 *    them out would make money vanish from the only page that claims to show all
 *    of it. They render with no sign rather than being forced into a bucket.
 *
 * 2. **Unreachable is not zero.** Totals are `null` when their source could not be
 *    read. `$0 income` is a claim about the business; a failed fetch is not that
 *    claim, and the two must not render alike. This mirrors `liabilitiesTotal`,
 *    which already got this right and is reused here rather than reimplemented so
 *    the Overview metric and this view can never disagree.
 */

import { liabilitiesTotal, unpaidApInvoices, type ApInvoiceLike } from "./liabilities";

export interface CashFlowTxLike {
  id: string;
  amount?: string | number | null;
  direction?: "inflow" | "outflow" | "transfer" | "adjustment" | string | null;
  transaction_date?: string | null;
  counterparty_id?: string | null;
  description_normalized?: string | null;
  description_raw?: string | null;
}

export interface CashFlowInvoiceLike extends ApInvoiceLike {
  id: string;
  invoice_number?: string | null;
  metadata?: { scenario?: string | null; flags?: string[] } | null;
}

/** What a row represents. `bill` is money owed but not yet moved — it is not a
 *  transaction, which is why it never counts toward income or expenses. */
export type CashFlowKind = "income" | "expense" | "transfer" | "adjustment" | "bill";

export interface CashFlowRow {
  key: string;
  kind: CashFlowKind;
  label: string;
  sublabel: string;
  /** ISO date used for ordering. Empty when the source carried none. */
  date: string;
  amount: number;
  /** How the figure reads. Transfers and adjustments deliberately carry no sign. */
  sign: "+" | "-" | "";
  /** Set on rows that open the transaction detail popup. */
  txId?: string;
  /** Set on rows that open the bill detail popup. */
  invoiceId?: string;
  flagged: boolean;
}

const KIND_OF: Record<string, CashFlowKind> = {
  inflow: "income",
  outflow: "expense",
  transfer: "transfer",
  adjustment: "adjustment",
};

const SIGN_OF: Record<CashFlowKind, "+" | "-" | ""> = {
  income: "+",
  expense: "-",
  transfer: "",
  adjustment: "",
  bill: "-",
};

export const KIND_LABEL: Record<CashFlowKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  adjustment: "Adjustment",
  bill: "Bill",
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function isoDay(v: string | null | undefined): string {
  if (typeof v !== "string" || !v.trim()) return "";
  return v.slice(0, 10);
}

/**
 * One ordered list of everything that moved or is owed.
 *
 * `transactions` / `invoices` accept `undefined` to mean "could not be read",
 * distinct from `[]` meaning "read fine, nothing there". The caller renders those
 * two differently; this function simply contributes no rows for an unreadable feed
 * rather than pretending it was empty.
 */
export function buildCashFlowRows(input: {
  transactions?: readonly CashFlowTxLike[] | null;
  invoices?: readonly CashFlowInvoiceLike[] | null;
  nameOf?: (id: string | null | undefined) => string | null;
}): CashFlowRow[] {
  const nameOf = input.nameOf ?? (() => null);
  const rows: CashFlowRow[] = [];

  for (const t of input.transactions ?? []) {
    if (!t?.id) continue;
    const kind = KIND_OF[String(t.direction ?? "")] ?? "adjustment";
    const label =
      nameOf(t.counterparty_id) ??
      t.description_normalized ??
      t.description_raw ??
      (kind === "income" ? "Incoming payment" : kind === "expense" ? "Outgoing payment" : "Ledger movement");
    /* When the counterparty named the row, the description still carries the
       detail that distinguishes two payments from the same payer. */
    const detail = nameOf(t.counterparty_id) ? (t.description_normalized ?? t.description_raw ?? "") : "";
    rows.push({
      key: `tx:${t.id}`,
      kind,
      label,
      sublabel: detail,
      date: isoDay(t.transaction_date),
      amount: num(t.amount),
      sign: SIGN_OF[kind],
      txId: t.id,
      flagged: false,
    });
  }

  for (const inv of unpaidApInvoices(input.invoices ?? [])) {
    if (!inv?.id) continue;
    const flags = inv.metadata?.flags ?? [];
    const due = isoDay(inv.due_date);
    rows.push({
      key: `inv:${inv.id}`,
      kind: "bill",
      label: nameOf(inv.counterparty_id) ?? inv.invoice_number ?? "Bill",
      sublabel: [inv.invoice_number, due ? `due ${due}` : "", inv.status === "overdue" ? "overdue" : ""]
        .filter(Boolean)
        .join(" · "),
      date: due,
      amount: num(inv.amount_due),
      sign: "-",
      invoiceId: inv.id,
      flagged: flags.length > 0,
    });
  }

  /* Newest first. Rows with no usable date sort last rather than to the top,
     where an empty string would otherwise put them. */
  return rows.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

export interface CashFlowTotals {
  /** `null` means the transaction feed could not be read — never render as 0. */
  income: number | null;
  expenses: number | null;
  /** `null` means the invoice feed could not be read. */
  liabilities: number | null;
  /** ISO bounds of the transactions actually counted, for an honest period label. */
  periodStart: string | null;
  periodEnd: string | null;
}

export function cashFlowTotals(input: {
  transactions?: readonly CashFlowTxLike[] | null;
  invoices?: readonly CashFlowInvoiceLike[] | null;
}): CashFlowTotals {
  const txs = input.transactions;
  const liabilities = liabilitiesTotal(input.invoices ?? null);

  if (txs == null) {
    return { income: null, expenses: null, liabilities, periodStart: null, periodEnd: null };
  }

  let income = 0;
  let expenses = 0;
  let start: string | null = null;
  let end: string | null = null;

  for (const t of txs) {
    const kind = KIND_OF[String(t?.direction ?? "")];
    /* Transfers and adjustments are counted in neither total: a transfer between
       two of the tenant's own accounts is not revenue and not spend, and adding it
       to either would inflate a headline figure with money that never left. They
       are excluded from the period bounds too — the label sits beneath these two
       figures, so it must describe the rows that produced them and nothing else. */
    if (kind === "income") income += num(t.amount);
    else if (kind === "expense") expenses += num(t.amount);
    else continue;

    const d = isoDay(t?.transaction_date);
    if (!d) continue;
    if (start === null || d < start) start = d;
    if (end === null || d > end) end = d;
  }

  return { income, expenses, liabilities, periodStart: start, periodEnd: end };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(iso: string): string | null {
  const [y, m] = iso.split("-");
  const mi = Number(m) - 1;
  if (!y || !MONTHS[mi]) return null;
  return `${MONTHS[mi]} ${y}`;
}

/**
 * A label naming the period the totals actually cover — "Feb – Jun 2026" — rather
 * than a fixed window.
 *
 * The design mock labels these figures "(30d)". On real tenant data that window is
 * empty: every recorded transaction predates it, so a literal 30-day metric reads
 * `$0` and looks like a business that stopped earning, not like a window with no
 * data in it. A metric must say what it measured.
 */
export function cashFlowPeriodLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const a = monthYear(start);
  const b = monthYear(end);
  if (!a || !b) return null;
  if (a === b) return a;
  const [ya] = a.split(" ").slice(-1);
  const [yb] = b.split(" ").slice(-1);
  /* Same year: name it once — "Feb – Jun 2026", not "Feb 2026 – Jun 2026". */
  if (ya === yb) return `${a.split(" ")[0]} – ${b}`;
  return `${a} – ${b}`;
}
