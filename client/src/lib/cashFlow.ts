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

import { liabilitiesTotal, unpaidApInvoices, payableObligations, type ApInvoiceLike } from "./liabilities";
import type { RawObligation } from "./brainObligations";
import { capitalCase } from "./displayLabels";

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
  /**
   * Overrides the badge text without changing the row's styling or sign.
   *
   * Payroll and tax are owed exactly the way a bill is, so they take the `bill`
   * treatment — but a payroll run badged "Bill" would be a lie about what it is,
   * and the obligation kinds are open-ended (bill / payroll / tax so far, and the
   * set has already grown once), so they cannot each become a `CashFlowKind`.
   */
  badgeLabel?: string;
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

/** Identifies the DEBT a row describes, so an invoice and its obligation twin
 *  collapse to one row. Day-resolution on purpose: the two feeds carry the same
 *  instant with different precision. */
function debtKey(counterpartyId: string | null | undefined, amount: number, isoDate: string): string {
  return `${counterpartyId ?? ""}|${amount.toFixed(2)}|${isoDate}`;
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
  /** Obligations supply what the invoice feed cannot: payroll and tax. See below. */
  obligations?: readonly RawObligation[] | null;
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

  /* How many debts of each identity are already listed from invoices, so the
     obligations pass below does not list the same debt twice.
     
     A COUNT, not a presence flag. With a plain set, one invoice would suppress every
     obligation sharing its identity — so a tenant genuinely owing the same
     counterparty the same amount on the same day twice (one invoiced, one not) would
     see the second debt silently vanish. Under-reporting money owed is the worst
     thing this list can do, so each invoice cancels exactly one obligation. */
  const listedDebts = new Map<string, number>();

  for (const inv of unpaidApInvoices(input.invoices ?? [])) {
    if (!inv?.id) continue;
    const flags = inv.metadata?.flags ?? [];
    const due = isoDay(inv.due_date);
    const key = debtKey(inv.counterparty_id, num(inv.amount_due), due);
    listedDebts.set(key, (listedDebts.get(key) ?? 0) + 1);
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

  /* ── obligations: the rows the invoice feed cannot supply ──────────────────
     The Liabilities figure above this list sums obligations, so a list built only
     from invoices could never add up to it: the invoice feed carries no payroll and
     no tax. That mismatch is the same confusion the figure itself was just fixed
     for — a total whose own list contradicts it reads as a bug in the data.

     Bills are deliberately still sourced from invoices rather than replaced by their
     obligation twins: the invoice row carries the invoice number and opens the bill
     detail popup, and the obligation carries neither. brain-core exposes NO invoice
     reference on an obligation (`source_ids` point at raw documents, not invoices),
     so the two records are matched on the debt they describe — counterparty, amount
     and due date, which align exactly on every bill.

     Matching on identity rather than excluding `type === "bill"` matters: obligation
     kinds are open-ended, and a bill obligation that has no invoice behind it is a
     real debt that must still appear rather than being filtered out by its name. */
  for (const o of payableObligations(input.obligations ?? null)) {
    const due = isoDay(o.due_date);
    const key = debtKey(o.counterparty_id, num(o.amount_due), due);
    const alreadyListed = listedDebts.get(key) ?? 0;
    if (alreadyListed > 0) {
      listedDebts.set(key, alreadyListed - 1);
      continue;
    }
    const kindWord = o.kind && o.kind.trim() ? capitalCase(o.kind.trim()) : "";
    rows.push({
      key: `obl:${o.id}`,
      kind: "bill",
      badgeLabel: kindWord || "Owed",
      label: nameOf(o.counterparty_id) || kindWord || "Payable",
      sublabel: [due ? `due ${due}` : "", o.status.toLowerCase() === "overdue" ? "overdue" : ""]
        .filter(Boolean)
        .join(" · "),
      date: due,
      amount: num(o.amount_due),
      sign: "-",
      flagged: false,
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

/**
 * The secondary line under a row's label.
 *
 * Owed rows put the due date in their sublabel ("due 2026-08-12") because for a bill
 * the date means something different than it does on a transaction — it is when the
 * money is owed, not when it moved. The row then also renders `date` for ordering
 * context, which printed the same day twice: "INV-CLOUDOPS-001 · due 2026-08-12 ·
 * 2026-08-12". The word is worth keeping and the repeat is not, so the bare date is
 * dropped when the sublabel already states it.
 */
export function detailLine(sublabel: string, date: string): string {
  const parts = [sublabel];
  if (date && !sublabel.includes(date)) parts.push(date);
  return parts.filter(Boolean).join(" · ");
}

export interface CashFlowTotals {
  /** `null` means the transaction feed could not be read — never render as 0. */
  income: number | null;
  expenses: number | null;
  /** `null` means the obligations feed could not be read. */
  liabilities: number | null;
  /** ISO bounds of the transactions actually counted, for an honest period label. */
  periodStart: string | null;
  periodEnd: string | null;
}

export function cashFlowTotals(input: {
  transactions?: readonly CashFlowTxLike[] | null;
  invoices?: readonly CashFlowInvoiceLike[] | null;
  /* Liabilities come from obligations, NOT from `invoices`. The invoice feed carries
     no payroll, so deriving the figure from it understated what the tenant owed and
     disagreed with the Payables tab this metric sits beside. `invoices` is still
     read above, for the dated bill ROWS — a different question from the total. */
  obligations?: readonly RawObligation[] | null;
}): CashFlowTotals {
  const txs = input.transactions;
  const liabilities = liabilitiesTotal(input.obligations ?? null);

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

/**
 * The partial-failure notice above the metrics.
 *
 * Three independent reads back the Cash Flow tab, and they fail independently. A single
 * generic "cash flow couldn't be loaded" overstates the damage when only one is down
 * and — the real problem — never says WHICH figure on screen is now untrustworthy. A
 * user cannot tell a $0 that means "nothing moved" from a $0 that means "we could not
 * find out" unless the banner names the casualty.
 *
 * Ordered by how much a wrong reading costs: money owed first, then earnings, then rows.
 */
export function incompleteMessage(f: { tx: boolean; inv: boolean; ob: boolean }): string {
  const lost: string[] = [];
  /* Obligations now supply rows as well as the figure: when that read fails the
     payroll and tax rows disappear from the list too, and a list that looks complete
     while quietly missing rows is worse than one that admits it. Named without
     enumerating kinds, which are open-ended. */
  if (f.ob) lost.push("liabilities and some of the rows below");
  if (f.tx) lost.push("income and expenses");
  if (f.inv) lost.push("the bills listed below");
  if (lost.length === 0) return "";
  const list = lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(", ")} and ${lost[lost.length - 1]}`;
  return (
    `${list.charAt(0).toUpperCase()}${list.slice(1)} couldn't be loaded. That is not a statement ` +
    `that nothing moved or that nothing is owed. Treat it as unknown, and refresh to see the real position.`
  );
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
  if (ya === yb) return `${a.split(" ")[0]} to ${b}`;
  return `${a} to ${b}`;
}
