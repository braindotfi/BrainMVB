/**
 * Cash projection — the running balance over the next few weeks.
 *
 * ## Where "Confirmed" and "Projected" actually come from
 *
 * There is no certainty field on any brain-core record. Checked: obligations
 * carry `kind`/`due_date`/`status`/`amount_due`, invoices carry a `scenario`
 * marker, and neither has a confidence or expected-payment-probability. The
 * `confidence` that does exist on accounts and proposals is about extraction
 * quality, not about whether money will move.
 *
 * So the split here is by SOURCE, which is a real distinction rather than an
 * invented field:
 *
 *   Confirmed  ← payable obligations. Payroll, tax and bills the tenant has
 *                already incurred and scheduled. Money leaves on the due date
 *                unless someone intervenes.
 *   Projected  ← outstanding AR invoices. Money the tenant has asked for and
 *                may or may not receive on the due date.
 *
 * That asymmetry is the point of the card: a payroll run and a customer's
 * promise are not the same kind of fact, and drawing them with equal weight is
 * what makes a projection lie. Callers MUST render the two differently and say
 * in words what the split means — `CASH_EVENT_BASIS` is the caption for that,
 * kept here so the explanation cannot drift away from the logic it describes.
 *
 * ## Why an incomplete read produces no chart
 *
 * A projection is a running total, so a missing outflow does not shift the line
 * down by a little — it removes a dip entirely, and the "lowest projected
 * point" callout then names the wrong date with a comfortable number attached.
 * Both feeds must have finished their cursor walk before anything is drawn.
 */

import { payableObligations } from "./liabilities";
import type { RawObligation } from "./brainObligations";
import { arReceivables, type RawInvoice } from "./receivables";

/** How far ahead the chart looks. "~3 weeks" per the Overview spec. */
export const PROJECTION_DAYS = 21;

/** The one-line honesty caption. See the header for why this wording exists. */
export const CASH_EVENT_BASIS =
  "Confirmed = scheduled obligations (payroll, tax, bills). Projected = outstanding customer invoices, not yet received.";

export type CashEventCertainty = "confirmed" | "projected";

export interface CashEvent {
  id: string;
  /** ISO date (YYYY-MM-DD) the money is expected to move. */
  date: string;
  label: string;
  /** Signed: negative for money out, positive for money in. */
  amount: number;
  certainty: CashEventCertainty;
  /** Running balance AFTER this event settles, counting confirmed AND projected. */
  balanceAfter: number;
  /**
   * Running balance counting ONLY confirmed events — i.e. the balance if not one
   * outstanding invoice is paid in the window.
   *
   * This is the honest floor, and the reason the card draws two tracks. A single
   * line that blends a payroll run with a customer's promise reports one number
   * for two very different facts; the gap between the tracks IS the uncertainty,
   * and it is the part worth looking at.
   */
  confirmedOnlyBalanceAfter: number;
}

export type CashProjectionKind =
  | "failed"
  | "loading"
  /** A feed was cut short — see the header on why no line is drawn. */
  | "unreadable"
  /** Reads finished but no cash total is known, so there is nothing to run a balance from. */
  | "no_balance"
  /** Complete reads, no dated events inside the window. */
  | "empty"
  | "rows";

export interface CashProjectionView {
  kind: CashProjectionKind;
  startingBalance: number | null;
  events: CashEvent[];
  /**
   * The trough of the running balance, and the event that caused it. Null when
   * there are no events. Stated as a figure and a date by the card, because a
   * dip that is only visible as a wiggle in a line is not a warning anyone acts
   * on.
   */
  lowest: { amount: number; date: string; label: string } | null;
  /**
   * The trough of the confirmed-only track: where cash lands if no outstanding
   * invoice is paid inside the window. This is the figure that decides whether
   * payroll clears, so the card states it in words rather than leaving it as a
   * second line the reader has to interpret.
   */
  lowestConfirmedOnly: { amount: number; date: string } | null;
  /** True when at least one projected inflow exists, i.e. the two tracks differ. */
  hasProjectedInflow: boolean;
  /** Inclusive ISO date bounds of the window actually plotted. */
  windowStart: string;
  windowEnd: string;
}

const MS_PER_DAY = 86_400_000;

/** UTC calendar day as YYYY-MM-DD, so the axis is stable across timezones. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDay(v: string | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.floor(t / MS_PER_DAY) : null;
}

/**
 * Build the projection.
 *
 * `now` is injected so the window boundary is assertable rather than dependent
 * on when the suite runs. Undated records are dropped: an obligation with no due
 * date cannot be placed on a timeline, and defaulting it to "today" would invent
 * a dip that does not exist.
 */
export function cashProjectionView(input: {
  failed: boolean;
  startingBalance: number | null;
  obligations: { rows: readonly RawObligation[]; complete: boolean } | null;
  invoices: { rows: readonly RawInvoice[]; complete: boolean } | null;
  now: Date;
  /** Overridable only so tests can shorten the window. */
  horizonDays?: number;
}): CashProjectionView {
  const { failed, startingBalance, obligations, invoices, now } = input;
  const horizon = input.horizonDays ?? PROJECTION_DAYS;

  const today = Math.floor(now.getTime() / MS_PER_DAY);
  const windowStart = isoDay(new Date(today * MS_PER_DAY));
  const windowEnd = isoDay(new Date((today + horizon) * MS_PER_DAY));
  const base = {
    startingBalance,
    events: [] as CashEvent[],
    lowest: null,
    lowestConfirmedOnly: null,
    hasProjectedInflow: false,
    windowStart,
    windowEnd,
  };

  if (failed) return { kind: "failed", ...base };
  if (obligations == null || invoices == null) return { kind: "loading", ...base };
  if (!obligations.complete || !invoices.complete) return { kind: "unreadable", ...base };
  if (startingBalance == null) return { kind: "no_balance", ...base };

  type Pending = Omit<CashEvent, "balanceAfter" | "confirmedOnlyBalanceAfter"> & { day: number };
  const pending: Pending[] = [];

  /* Confirmed — money out. Amounts are stored unsigned on the wire; the sign is
     the direction, applied here once so the running total cannot double-negate. */
  for (const o of payableObligations(obligations.rows)) {
    const day = parseDay(o.due_date);
    if (day === null || day < today || day > today + horizon) continue;
    const amount = Number(o.amount_due) || 0;
    if (amount === 0) continue;
    pending.push({
      id: `obl:${o.id}`,
      day,
      date: isoDay(new Date(day * MS_PER_DAY)),
      label: o.kind ? o.kind.replace(/_/g, " ") : "Scheduled obligation",
      amount: -Math.abs(amount),
      certainty: "confirmed",
    });
  }

  /* Projected — money in. `outstanding` is what is still owed, not the billed
     total, so a part-paid invoice contributes only the remainder. */
  for (const r of arReceivables(invoices.rows)) {
    const day = parseDay(r.due_date);
    if (day === null || day < today || day > today + horizon) continue;
    if (r.outstanding === 0) continue;
    pending.push({
      id: `inv:${r.id}`,
      day,
      date: isoDay(new Date(day * MS_PER_DAY)),
      label: r.invoice_number ? `Invoice ${r.invoice_number}` : "Customer invoice",
      amount: Math.abs(r.outstanding),
      certainty: "projected",
    });
  }

  if (pending.length === 0) return { kind: "empty", ...base };

  /* Same-day ordering puts outflows first. Two events on one day produce two
     points on the line, and showing the dip before the recovery is the
     conservative reading — the tenant's balance really does touch the lower
     figure that day, and a chart that hides it understates the risk. */
  pending.sort((a, b) => a.day - b.day || a.amount - b.amount);

  let running = startingBalance;
  let confirmedOnly = startingBalance;
  const events: CashEvent[] = [];
  /* Seed both troughs with TODAY's balance, not null.
     The floor is a cash-risk statement, and the lowest point in the window can
     be the opening balance itself — when every scheduled event is an inflow, or
     when the account is already overdrawn. Starting from null let the callout
     skip day zero and quote a later, higher figure as the "lowest point", which
     understates exactly the risk the card exists to show. Comparisons below are
     strictly-less, so an event has to actually beat today to take the label. */
  let lowest: CashProjectionView["lowest"] = {
    amount: startingBalance,
    date: windowStart,
    label: "Opening balance",
  };
  let lowestConfirmedOnly: CashProjectionView["lowestConfirmedOnly"] = {
    amount: startingBalance,
    date: windowStart,
  };
  let hasProjectedInflow = false;

  for (const p of pending) {
    running += p.amount;
    if (p.certainty === "confirmed") confirmedOnly += p.amount;
    else hasProjectedInflow = true;

    events.push({
      id: p.id,
      date: p.date,
      label: p.label,
      amount: p.amount,
      certainty: p.certainty,
      balanceAfter: running,
      confirmedOnlyBalanceAfter: confirmedOnly,
    });
    if (lowest === null || running < lowest.amount) {
      lowest = { amount: running, date: p.date, label: p.label };
    }
    if (lowestConfirmedOnly === null || confirmedOnly < lowestConfirmedOnly.amount) {
      lowestConfirmedOnly = { amount: confirmedOnly, date: p.date };
    }
  }

  return { kind: "rows", startingBalance, events, lowest, lowestConfirmedOnly, hasProjectedInflow, windowStart, windowEnd };
}
