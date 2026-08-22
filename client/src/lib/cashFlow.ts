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
import { isoDay, absAmount as num, debtKey, matchObligationsToInvoices } from "./debtIdentity";
import type { RawObligation } from "./brainObligations";
import { capitalCase } from "./displayLabels";
import { subLabel } from "./obligationRows";

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
  /** Source status for debt-like rows; shared with Payables/Receivables pills. */
  status?: string;
  label: string;
  sublabel: string;
  /** The kind/counterparty detail used by the canonical Payables row treatment. */
  secondaryLabel?: string;
  /** ISO date used for ordering. Empty when the source carried none. */
  date: string;
  amount: number;
  /** How the figure reads. Transfers and adjustments deliberately carry no sign. */
  sign: "+" | "-" | "";
  /** Set on rows that open the transaction detail popup. */
  txId?: string;
  /** Set on rows that open the bill detail popup. */
  invoiceId?: string;
  /** Set on unmatched obligation rows that open the payable detail popup. */
  obligationId?: string;
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

/* Debt identity lives in its own module because Payables needs the same definition
   to link an obligation row back to the invoice that billed it. If the two drifted,
   a bill Cash Flow collapses into one row would be a payable Payables calls
   uninvoiced. */

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
  /* The invoice and obligation twins can carry different lifecycle vocabulary
     ("sent" versus "upcoming"). Payables established the obligation's status as
     canonical for a debt row, so carry that status onto the invoice projection
     Cash Flow renders for the same debt. */
  const obligationByInvoice = new Map<string, RawObligation>();
  const payableRows = payableObligations(input.obligations ?? null);
  const obligationById = new Map(payableRows.map((o) => [o.id, o]));
  for (const [obligationId, invoice] of matchObligationsToInvoices(payableRows, input.invoices ?? [])) {
    const obligation = obligationById.get(obligationId);
    if (obligation) obligationByInvoice.set(invoice.id, obligation);
  }

  for (const inv of unpaidApInvoices(input.invoices ?? [])) {
    if (!inv?.id) continue;
    const flags = inv.metadata?.flags ?? [];
    const due = isoDay(inv.due_date);
    const matchedObligation = obligationByInvoice.get(inv.id);
    const counterpartyId = inv.counterparty_id ?? null;
    const counterpartyName = nameOf(counterpartyId);
    const matchedKind =
      matchedObligation && typeof matchedObligation.kind === "string"
        ? matchedObligation.kind
        : null;
    const key = debtKey(counterpartyId, num(inv.amount_due), due);
    listedDebts.set(key, (listedDebts.get(key) ?? 0) + 1);
    rows.push({
      key: `inv:${inv.id}`,
      kind: "bill",
      status: (() => {
        const obligationStatus = obligationByInvoice.get(inv.id)?.status;
        return typeof obligationStatus === "string" && obligationStatus.trim()
          ? obligationStatus
          : inv.status ?? undefined;
      })(),
      label: counterpartyName ?? inv.invoice_number ?? "Bill",
      sublabel: [inv.invoice_number, due ? `due ${due}` : "", inv.status === "overdue" ? "overdue" : ""]
        .filter(Boolean)
        .join(" · "),
      secondaryLabel: subLabel(matchedKind, counterpartyName, counterpartyId),
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
  for (const o of payableRows) {
    const due = isoDay(o.due_date);
    const key = debtKey(o.counterparty_id, num(o.amount_due), due);
    const alreadyListed = listedDebts.get(key) ?? 0;
    if (alreadyListed > 0) {
      listedDebts.set(key, alreadyListed - 1);
      continue;
    }
    const kindWord = o.kind && o.kind.trim() ? capitalCase(o.kind.trim()) : "";
    const counterpartyName = nameOf(o.counterparty_id);
    rows.push({
      key: `obl:${o.id}`,
      kind: "bill",
      badgeLabel: kindWord || "Owed",
      status: o.status,
      label: counterpartyName || "Unidentified counterparty",
      sublabel: [due ? `due ${due}` : "", o.status.toLowerCase() === "overdue" ? "overdue" : ""]
        .filter(Boolean)
        .join(" · "),
      secondaryLabel: subLabel(o.kind, counterpartyName, o.counterparty_id),
      date: due,
      amount: num(o.amount_due),
      sign: "-",
      obligationId: o.id,
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
  /** `null` means the obligations feed could not be read, or was read only in part —
   *  either way there is no figure to state. Never render it as 0. */
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
     read above, for the dated bill ROWS — a different question from the total.

     The whole READ, not just the rows: the obligations list pages behind a cursor, and
     a total summed from a partial walk is a plausible smaller number with nothing to
     mark it as partial. `complete: false` yields `null`, which this card already
     renders as "—". Rows may still be listed from a partial read; only the total is
     withheld. */
  obligations?: { rows: readonly RawObligation[]; complete: boolean } | null;
}): CashFlowTotals {
  const txs = input.transactions;
  const obligations = input.obligations ?? null;
  const liabilities = obligations && liabilitiesTotal(obligations.rows, obligations);

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
export function incompleteMessage(f: { tx: boolean; inv: boolean; ob: boolean; invTruncated?: boolean }): string {
  const lost: string[] = [];
  /* Obligations now supply rows as well as the figure: when that read fails the
     payroll and tax rows disappear from the list too, and a list that looks complete
     while quietly missing rows is worse than one that admits it. Named without
     enumerating kinds, which are open-ended. */
  if (f.ob) lost.push("liabilities and some of the rows below");
  if (f.tx) lost.push("income and expenses");
  if (f.inv) lost.push("the bills listed below");
  /* A cut-short (not failed) invoice walk still owes the same caveat: bills past the
     cap are just as invisible as bills from a read that failed outright. */
  else if (f.invTruncated) lost.push("some of the bills listed below");
  if (lost.length === 0) return "";
  const list = lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(", ")} and ${lost[lost.length - 1]}`;
  return (
    `${list.charAt(0).toUpperCase()}${list.slice(1)} couldn't be loaded. That is not a statement ` +
    `that nothing moved or that nothing is owed. Treat it as unknown, and refresh to see the real position.`
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-15" or "2026-08" → "Aug 2026"; returns null for unrecognised input. */
export function monthYear(iso: string): string | null {
  const [y, m] = iso.split("-");
  const mi = Number(m) - 1;
  if (!y || !MONTHS[mi]) return null;
  return `${MONTHS[mi]} ${y}`;
}

/**
 * Advance or retreat a YYYY-MM key by `delta` calendar months.
 * E.g. stepMonth("2026-01", -1) → "2025-12".
 */
function stepMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Generate `count` consecutive YYYY-MM keys ending at `endMonthKey`, returned
 * newest first.
 *
 * monthSeriesDesc("2026-08", 3) → ["2026-08", "2026-07", "2026-06"]
 */
export function monthSeriesDesc(endMonthKey: string, count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) result.push(stepMonth(endMonthKey, -i));
  return result;
}

// ─── monthly breakdown ────────────────────────────────────────────────────────

export interface MonthlyBreakdownEntry {
  /** Calendar month in YYYY-MM form, e.g. "2026-08". */
  monthKey: string;
  /** Human label, e.g. "Aug 2026". */
  label: string;
  income: number;
  expenses: number;
  /**
   * Top expense counterparty ids ranked by total spend, descending.
   * The id may be null when a transaction carried no counterparty reference.
   * The caller is responsible for resolving ids to display names — this module
   * holds no access to the counterparty feed, so it never looks up names.
   */
  topExpenseCounterpartyIds: Array<{ id: string | null; amount: number }>;
}

/**
 * Group raw transactions into calendar-month buckets and return them newest
 * first.
 *
 * Only inflows (income) and outflows (expenses) are counted. Transfers and
 * adjustments are deliberately excluded: they are neither revenue nor spend,
 * and including them in either total would inflate a figure the user is being
 * asked to compare month-over-month.
 *
 * Returns ALL months that appear in the data. The component decides which
 * window ("Last 6 months", "Last 12 months", "Year to date") to display.
 */
export function buildMonthlyBreakdown(
  transactions: readonly CashFlowTxLike[],
): MonthlyBreakdownEntry[] {
  const byMonth = new Map<
    string,
    { income: number; expenses: number; byCp: Map<string | null, number> }
  >();

  for (const t of transactions) {
    const kind = KIND_OF[String(t?.direction ?? "")];
    if (kind !== "income" && kind !== "expense") continue;
    const raw = t.transaction_date;
    if (!raw) continue;
    const monthKey = String(raw).slice(0, 7); // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;

    let entry = byMonth.get(monthKey);
    if (!entry) {
      entry = { income: 0, expenses: 0, byCp: new Map() };
      byMonth.set(monthKey, entry);
    }

    const amt = num(t.amount);
    if (kind === "income") {
      entry.income += amt;
    } else {
      entry.expenses += amt;
      const cpId = t.counterparty_id ?? null;
      entry.byCp.set(cpId, (entry.byCp.get(cpId) ?? 0) + amt);
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([monthKey, { income, expenses, byCp }]) => ({
      monthKey,
      label: monthYear(monthKey) ?? monthKey,
      income,
      expenses,
      topExpenseCounterpartyIds: Array.from(byCp.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id, amount]) => ({ id, amount })),
    }));
}

/**
 * Build a contiguous calendar-month window of income/expense entries.
 *
 * Unlike `buildMonthlyBreakdown`, which returns only months that appear in the
 * data, this fills in zero-income/zero-expense entries for every month in
 * `monthKeys` that has no transactions. The caller always receives exactly
 * `monthKeys.length` entries — gaps are visible rather than silently hidden.
 *
 * `monthKeys` must be YYYY-MM strings in the order the caller wants returned
 * (typically oldest-first so the chart reads left-to-right).
 *
 * Transactions whose month falls outside `monthKeys` are ignored — they do not
 * bleed into adjacent buckets.
 */
export function buildMonthlyWindow(
  transactions: readonly CashFlowTxLike[],
  monthKeys: readonly string[],
): MonthlyBreakdownEntry[] {
  const keySet = new Set(monthKeys);
  // Re-use the grouping logic but restrict to the requested window.
  const restricted = transactions.filter((t) => {
    const raw = t.transaction_date;
    if (!raw) return false;
    const mk = String(raw).slice(0, 7);
    return keySet.has(mk);
  });
  const grouped = new Map(buildMonthlyBreakdown(restricted).map((e) => [e.monthKey, e]));
  return monthKeys.map(
    (mk) =>
      grouped.get(mk) ?? {
        monthKey: mk,
        label: monthYear(mk) ?? mk,
        income: 0,
        expenses: 0,
        topExpenseCounterpartyIds: [],
      },
  );
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
