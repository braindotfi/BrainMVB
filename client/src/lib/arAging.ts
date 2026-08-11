/**
 * AR aging — "how much of what we're owed has gone stale, and who owes it".
 *
 * ## Why this is computed here and not read from a backend field
 *
 * There is no AR-aging endpoint. Checked against the codebase: the only
 * days-overdue arithmetic that exists is `server/brain/proposalEnrichment.ts`,
 * which computes it per-proposal for evidence facts, and the Current/1-30/…/90+
 * bucket names that appear in `server/brain/demo-seed/scenario.ts` are seed
 * scenario labels, not a live computation.
 *
 * What IS real is everything this needs: `arReceivables()` already normalizes a
 * per-invoice `due_date` and `outstanding` off the live invoices feed. So aging
 * is a new derivation over existing real data — not a new number invented to
 * fill a card. That distinction is the whole reason this file is thin: it adds
 * no source, it only subtracts two dates.
 *
 * ## Why the read state is required, not optional
 *
 * The percentage is the dangerous figure here. "12% of AR is over 90 days" read
 * off a truncated cursor walk is not a slightly-wrong number, it is a
 * confidently-wrong one: both the numerator and the denominator are short, and
 * the ratio between two partial sums has no relationship to the real ratio. So
 * this refuses to state a percentage — or a total — unless the caller proves it
 * walked every page, exactly as `receivablesTotal` does.
 */

import { arReceivables, type RawInvoice, type Receivable } from "./receivables";

/**
 * The aging boundary, in days past due. 90 is the spec'd bucket and the
 * conventional AR-aging cutoff; it is a presentation threshold, not a tenant
 * policy value read from anywhere.
 */
export const AR_STALE_DAYS = 90;

const MS_PER_DAY = 86_400_000;

/**
 * Whole days between a due date and `now`, or `null` when the invoice carries no
 * usable due date.
 *
 * Undated invoices are NOT treated as zero-days-overdue. An invoice with no due
 * date is one whose age is unknown, and folding unknowns into the "current"
 * bucket quietly asserts they are fine — the one direction of error that hides
 * money. They are excluded from the stale bucket and counted only in the
 * denominator, where their outstanding balance is a fact regardless of date.
 */
export function daysOverdue(dueDate: string | null, now: Date): number | null {
  if (!dueDate) return null;
  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) return null;
  // Compare on whole UTC days so a run at 23:59 and a run at 00:01 agree.
  const dueDay = Math.floor(due / MS_PER_DAY);
  const nowDay = Math.floor(now.getTime() / MS_PER_DAY);
  return nowDay - dueDay;
}

export interface StaleReceivable extends Receivable {
  /** Always > AR_STALE_DAYS for rows in the stale bucket. */
  days: number;
}

export type ArAgingKind =
  /** The read failed outright. */
  | "failed"
  /** No answer yet. */
  | "loading"
  /**
   * Rows came back but the cursor walk was cut short. No figure is stated: see
   * the header note on why a ratio of two partial sums is worse than silence.
   */
  | "unreadable"
  /** A complete read with nothing past the boundary. The only state that may say "none". */
  | "none"
  | "rows";

export interface ArAgingView {
  kind: ArAgingKind;
  /** Outstanding past the boundary. Null unless `kind === "rows"`. */
  staleAmount: number | null;
  /** Total outstanding AR (the denominator). Null unless the read completed. */
  totalAr: number | null;
  /** staleAmount / totalAr, 0..1. Null when either side is unknown or total is 0. */
  pctOfTotalAr: number | null;
  /** Every row past the boundary, oldest first. */
  rows: StaleReceivable[];
  /**
   * The row to name on the card: oldest first, ties broken by the larger
   * balance. Null when the bucket is empty.
   */
  worst: StaleReceivable | null;
}

/**
 * Decide what the "AR over 90 days" card shows.
 *
 * Pure and `now`-injected so the boundary behaviour (exactly 90 vs 91 days) can
 * be pinned by a real assertion instead of drifting with the clock the suite
 * happens to run at.
 */
export function arAgingView(input: {
  failed: boolean;
  read: { rows: readonly RawInvoice[]; complete: boolean } | null;
  now: Date;
}): ArAgingView {
  const { failed, read, now } = input;
  const none = {
    staleAmount: null,
    totalAr: null,
    pctOfTotalAr: null,
    rows: [] as StaleReceivable[],
    worst: null,
  };
  if (failed) return { kind: "failed", ...none };
  if (read == null) return { kind: "loading", ...none };
  if (!read.complete) return { kind: "unreadable", ...none };

  const all = arReceivables(read.rows);
  const totalAr = all.reduce((sum, r) => sum + r.outstanding, 0);

  const stale: StaleReceivable[] = [];
  for (const r of all) {
    const days = daysOverdue(r.due_date, now);
    if (days !== null && days > AR_STALE_DAYS) stale.push({ ...r, days });
  }
  // Oldest first; a tie on age is broken by the bigger balance, so the row the
  // card names is the one most worth chasing.
  stale.sort((a, b) => b.days - a.days || b.outstanding - a.outstanding);

  if (stale.length === 0) {
    return { kind: "none", staleAmount: 0, totalAr, pctOfTotalAr: 0, rows: [], worst: null };
  }

  const staleAmount = stale.reduce((sum, r) => sum + r.outstanding, 0);
  return {
    kind: "rows",
    staleAmount,
    totalAr,
    // A zero denominator would make this Infinity/NaN. It can happen for real:
    // fully-credited invoices net to zero outstanding while still being dated.
    pctOfTotalAr: totalAr > 0 ? staleAmount / totalAr : null,
    rows: stale,
    worst: stale[0],
  };
}
