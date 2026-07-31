/**
 * Liabilities — "what we owe" — derived from the live Ledger.
 *
 * Outstanding accounts-payable is the real liabilities figure on the reference
 * tenant: it has no loan or line_of_credit accounts, so there is nothing else to
 * add. Kept in one module because two surfaces now quote the number — the
 * Overview metric card and the Ledger's Liabilities view — and a metric that
 * disagreed with the list it links to reads as a bug in the data, not in the UI.
 *
 * `null` (not `0`) when no invoice data is reachable at all. Zero is a claim that
 * the tenant owes nothing; absence of data is not that claim, and the callers
 * render the two differently ("—" vs a real zero).
 */

/** The invoice fields this module reads. Structural so it stays testable and so
 *  callers keep owning their own fuller response types. */
export interface ApInvoiceLike {
  status?: string | null;
  amount_due?: string | number | null;
  due_date?: string | null;
  counterparty_id?: string;
  metadata?: { scenario?: string | null } | null;
}

/** Unpaid accounts-payable invoices, i.e. bills the tenant still owes.
 *
 *  `scenario === "ap"` is what separates money-out from money-in: the same
 *  endpoint carries AR invoices (what customers owe the tenant), and summing
 *  those into liabilities would invert the sign of the whole card. */
export function unpaidApInvoices<T extends ApInvoiceLike>(invoices: readonly T[] | null | undefined): T[] {
  return (invoices ?? []).filter((i) => i?.metadata?.scenario === "ap" && i.status !== "paid");
}

/**
 * Total outstanding AP, or `null` when there is no invoice data to read.
 *
 * An unparseable `amount_due` contributes 0 rather than aborting the sum: one bad
 * row should understate the total, not blank the whole card.
 */
export function liabilitiesTotal(invoices: readonly ApInvoiceLike[] | null | undefined): number | null {
  if (invoices == null) return null;
  return unpaidApInvoices(invoices).reduce((sum, i) => sum + (Number(i.amount_due) || 0), 0);
}
