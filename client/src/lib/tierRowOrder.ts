/**
 * Display order for tiered rows.
 *
 * `TierSections` renders rows grouped by tier (Urgent → Waiting on you →
 * Insights), so the order a page happens to build its rows in is NOT the order
 * the user sees. That difference is invisible until something else walks the
 * list: the unified pager steps through the entries array, so with rows built
 * as [payments, insights, proposals] but drawn as [urgent, waiting, insight],
 * pressing Next from the first row on screen (an Urgent proposal, last in the
 * built order) can never reach the Insight rows — they sit *behind* it in the
 * array while sitting *below* it on screen.
 *
 * So both the sections and the pager order rows through this one function.
 *
 * Rows in a tier no section renders are dropped rather than moved to the end:
 * `TierSections` already omits them, and a pager entry for a row the user
 * cannot see is the same bug in the other direction.
 */
import { TIER_ORDER } from "./proposalTiers";
import type { RowTier } from "./decisionFilters";

export function orderRowsForDisplay<T extends { tier: RowTier }>(rows: readonly T[]): T[] {
  return TIER_ORDER.flatMap((tier) => rows.filter((row) => row.tier === tier));
}
