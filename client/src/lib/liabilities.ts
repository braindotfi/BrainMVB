/**
 * Liabilities — "what we owe" — derived from the live Ledger's OBLIGATIONS feed.
 *
 * ## Why this reads obligations, not invoices
 *
 * This module used to sum `/ledger/invoices` filtered to `metadata.scenario === "ap"`.
 * That was never a deliberate accounting decision to exclude payroll — the invoices
 * endpoint carries no payroll records at all (and no `type` field), so accrued payroll
 * was invisible to the figure purely as a side effect of the source chosen. Accrued
 * payroll is a genuine current liability, so the invoice-derived number understated
 * what the tenant owed: on the reference tenant, $211,200.00 against a true $278,328.76.
 *
 * `/ledger/obligations` carries both bills and payroll, so it is the honest source.
 * Three surfaces quote this number — the Overview metric card, the Cash Flow metric,
 * and the Ledger's Payables tab — and a metric that disagreed with the list it
 * links to reads as a bug in the data, not in the UI. One module owns it so they
 * cannot drift.
 *
 * ## The null-vs-zero contract (load-bearing — do not "simplify")
 *
 * `null` (not `0`) when no obligation data is reachable. Zero is a claim that the
 * tenant owes nothing; absence of data is not that claim, and the callers render the
 * two differently ("—" vs a real zero). A false all-clear on money owed is the single
 * worst thing this module can produce.
 */

import { normalizeObligation, isReceivable, type Obligation, type RawObligation } from "./brainObligations";

/* ── invoices: still the source for the Cash Flow dated list's bill ROWS ──────
   Unchanged and deliberately kept. The cash-flow list is a record of money that
   moved or is invoiced; it is a different question from "what do we owe in total",
   which is what the obligations feed above answers. */

/** The invoice fields this module reads. Structural so it stays testable and so
 *  callers keep owning their own fuller response types. */
export interface ApInvoiceLike {
  status?: string | null;
  amount_due?: string | number | null;
  due_date?: string | null;
  counterparty_id?: string;
  metadata?: { scenario?: string | null } | null;
}

/** Unpaid accounts-payable invoices, i.e. billed money the tenant still owes.
 *
 *  `scenario === "ap"` is what separates money-out from money-in: the same
 *  endpoint carries AR invoices (what customers owe the tenant), and summing
 *  those into liabilities would invert the sign of the whole card. */
export function unpaidApInvoices<T extends ApInvoiceLike>(invoices: readonly T[] | null | undefined): T[] {
  return (invoices ?? []).filter((i) => i?.metadata?.scenario === "ap" && i.status !== "paid");
}

/* ── obligations: the authoritative "what we owe" ─────────────────────────── */

/**
 * Statuses that mean the obligation is discharged and must NOT be counted.
 *
 * Anything not in this set counts as still owed. That direction is deliberate: an
 * unrecognised status inflating the total is a visible, checkable error, whereas one
 * silently discharging a debt hides money the tenant actually owes. brain-core
 * currently emits `upcoming` / `due` / `overdue` on the reference tenant, none of
 * which are settled, so this set exists to be defensive about statuses we have not
 * seen rather than to describe ones we have.
 */
const SETTLED_STATUSES = new Set(["paid", "settled", "cancelled", "canceled", "void", "voided", "written_off"]);

/**
 * Payable (AP) obligations the tenant still owes, normalized and sorted by due date.
 *
 * ## Why the AP filter is client-side
 *
 * `GET /ledger/obligations` accepts `?direction=payable`, and it does filter correctly.
 * We deliberately do not use it. A bogus or renamed value (`?direction=zzz`) returns
 * `{"obligations":[]}` with **HTTP 200** — no error, no signal. If brain-core ever
 * renames that param, a server-side filter would turn this surface into a confident
 * "you owe nothing" instead of failing loudly. Filtering here with the already-tested
 * `isReceivable` keeps the failure mode honest, and picks up a real `direction` field
 * automatically if brain-core starts sending one (today it is null on every row and
 * the payable/receivable hint rides on `type`).
 */
export function payableObligations(raw: readonly RawObligation[] | null | undefined): Obligation[] {
  return (raw ?? [])
    .filter((o): o is RawObligation => !!o)
    .map(normalizeObligation)
    .filter((o) => !isReceivable(o))
    .filter((o) => !SETTLED_STATUSES.has(o.status.trim().toLowerCase()))
    .sort((a, b) => {
      // Undated obligations sort last rather than to the top, where "" would put them.
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
}

/**
 * Total outstanding AP, or `null` when there is no obligation data to read.
 *
 * An unparseable `amount_due` contributes 0 rather than aborting the sum: one bad
 * row should understate the total, not blank the whole figure.
 */
export function liabilitiesTotal(raw: readonly RawObligation[] | null | undefined): number | null {
  if (raw == null) return null;
  return payableObligations(raw).reduce((sum, o) => sum + (Number(o.amount_due) || 0), 0);
}
