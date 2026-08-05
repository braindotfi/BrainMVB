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
 *
 * ## Two ways the feed is short WITHOUT saying so (both measured live)
 *
 * 1. **Truncation.** The list endpoint pages behind a cursor, so an unpaged read
 *    returns some rows with HTTP 200 and no hint that more exist. `liabilitiesTotal`
 *    therefore takes the read STATE, not just the rows, and refuses to state a figure
 *    it cannot prove it summed in full — same contract as `receivablesTotal`.
 *
 * 2. **Rows that have not landed yet.** brain-core projects each ingested document
 *    into the ledger asynchronously, so a tenant's obligations arrive in waves. On a
 *    fresh demo tenant, timed: 3 bills at 1s ($211,200.00), 2 payroll at 26s
 *    ($278,328.76), 1 tax at 56s ($287,223.39). Every intermediate read is complete,
 *    internally consistent and wrong, and no property of the response distinguishes
 *    it from the final one. What DOES distinguish it is out of band: documents are
 *    still being read (`documentsInProgress` in lib/brainRefresh). That is why the
 *    view below takes an `ingesting` flag — the total keeps rendering, because it is
 *    a true floor, but it is captioned as one instead of as a settled figure.
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
 *
 * Exported because Receivables applies the identical test to AR invoices. "This
 * debt is discharged" must mean the same thing in both directions of the ledger;
 * two copies of this set would drift the first time one of them learned a new
 * status.
 */
export const SETTLED_STATUSES = new Set(["paid", "settled", "cancelled", "canceled", "void", "voided", "written_off"]);

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
 * Total outstanding AP, or `null` when no figure can honestly be stated.
 *
 * `null` covers BOTH "there was nothing to read" and "the read was truncated". The
 * second is why this takes the read state rather than just the rows: a partial cursor
 * walk produces a real, plausible, smaller number, and on a figure that says what the
 * tenant owes that is worse than no number at all.
 *
 * An unparseable `amount_due` contributes 0 rather than aborting the sum: one bad
 * row should understate the total, not blank the whole figure.
 */
export function liabilitiesTotal(
  raw: readonly RawObligation[] | null | undefined,
  read: { complete: boolean },
): number | null {
  if (raw == null) return null;
  if (!read.complete) return null;
  return payableObligations(raw).reduce((sum, o) => sum + (Number(o.amount_due) || 0), 0);
}

/* ── what the payables surfaces should show ───────────────────────────────── */

export type PayablesViewKind =
  | "failed"
  /** No answer yet. */
  | "loading"
  /**
   * Zero payables, but the read did not finish — so "nothing outstanding" is an
   * unknown, not a fact. The easiest state to get wrong and the hardest to notice:
   * the surface looks calm and says the tenant owes nothing, having seen only part
   * of the ledger.
   */
  | "unreadable"
  /**
   * Zero payables on a complete read, while documents are still being read into the
   * ledger. Also not "nothing outstanding" — just "not yet".
   */
  | "arriving"
  /** Zero payables, complete read, nothing still landing. The only state that may
   *  say the tenant owes nothing. */
  | "empty"
  | "rows";

export interface PayablesView {
  kind: PayablesViewKind;
  rows: Obligation[];
  /** Null whenever no honest figure exists — see `liabilitiesTotal`. */
  total: number | null;
  /** True when rows are shown but the read was cut short, so the list is partial. */
  truncated: boolean;
  /**
   * True while brain-core is still projecting documents into the ledger. The figure
   * on screen is then a floor, not a settled total, and must be captioned as one.
   */
  mayGrow: boolean;
}

/**
 * Decide what a payables surface renders.
 *
 * Pure, and separate from the components, because all three surfaces that quote this
 * figure have to agree — and because the interesting cases are exactly the ones a
 * component test in this repo cannot reach (vitest runs in `node`, with no DOM).
 * Keeping the branch order as data means "zero rows because the read was cut short"
 * and "zero rows because nothing has landed yet" are pinned by real assertions
 * instead of by a grep over JSX.
 */
export function payablesView(input: {
  failed: boolean;
  read: { rows: readonly RawObligation[]; complete: boolean } | null;
  /** From `useIngestInProgress` — documents still being read into the ledger. */
  ingesting: boolean;
}): PayablesView {
  const { failed, read, ingesting } = input;
  const none = { rows: [] as Obligation[], total: null, truncated: false, mayGrow: ingesting };
  if (failed) return { kind: "failed", ...none };
  if (read == null) return { kind: "loading", ...none };

  const rows = payableObligations(read.rows);
  const total = liabilitiesTotal(read.rows, read);
  const truncated = !read.complete;

  if (rows.length === 0) {
    // Order matters: a cut-short read outranks an unfinished ingest, and both
    // outrank "empty". Only the last of the three may claim nothing is owed.
    const kind: PayablesViewKind = truncated ? "unreadable" : ingesting ? "arriving" : "empty";
    return { kind, rows, total, truncated, mayGrow: ingesting };
  }
  return { kind: "rows", rows, total, truncated, mayGrow: ingesting };
}

/* The caption under a payables figure lives in `lib/ledgerRead.ts` as
   `ledgerFigureCaption` — the caveats it states are about the READ, not about
   liabilities, and Receivables states them in the same words. */
