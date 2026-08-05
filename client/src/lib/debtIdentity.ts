/**
 * What makes two records the same debt.
 *
 * brain-core exposes an obligation and the invoice that billed it as two unrelated
 * records: `source_ids` on an obligation points at the raw DOCUMENT it was extracted
 * from, never at an invoice, so there is no foreign key to join on. Two surfaces need
 * that join anyway —
 *
 *   - Cash Flow, to avoid listing the same bill twice (once from each feed), and
 *   - Payables, to open the invoice's detail popup from an obligation row.
 *
 * They must agree on what "the same debt" means, or a bill that Cash Flow collapses
 * into one row would be a payable that Payables says has no invoice. Hence one shared
 * definition rather than a copy on each side.
 */

import { unpaidApInvoices, type ApInvoiceLike } from "./liabilities";

/** Day-resolution date. The two feeds carry the same instant at different precision. */
export function isoDay(v: string | null | undefined): string {
  if (typeof v !== "string" || !v.trim()) return "";
  return v.slice(0, 10);
}

/** Magnitude of a wire amount. Non-numeric reads as 0 rather than NaN, which would
 *  make every key containing it unique and quietly defeat matching. */
export function absAmount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * Identifies the DEBT a record describes: who is owed, how much, and when.
 *
 * Deliberately NOT the record id — the whole point is to recognise one debt across
 * two feeds that assign it different ids.
 */
export function debtKey(
  counterpartyId: string | null | undefined,
  amount: number,
  isoDate: string,
): string {
  return `${counterpartyId ?? ""}|${amount.toFixed(2)}|${isoDate}`;
}

/** The obligation fields the match needs. Structural so both the raw and the
 *  normalized shape satisfy it. */
export interface DebtObligationLike {
  id: string;
  counterparty_id?: string | null;
  amount_due?: string | number | null;
  due_date?: string | null;
}

export interface DebtInvoiceLike extends ApInvoiceLike {
  id: string;
}

/**
 * Best-effort obligation → invoice link, for opening the invoice's detail popup
 * from a payable row.
 *
 * Counted, not set-based: each invoice backs exactly ONE obligation. A tenant owing
 * the same counterparty the same amount on the same day twice — one invoiced, one not
 * — has two real debts, and a presence flag would claim both were invoiced and send
 * the uninvoiced one to a popup describing a different record's invoice number, PO and
 * document. Matching one-for-one leaves the surplus obligation correctly unmatched.
 *
 * Candidates are unpaid AP invoices only, the same filter the liabilities total uses:
 * an AR invoice is money owed TO the tenant and must never be presented as the bill
 * behind a payable, and a paid invoice is not the outstanding debt in front of us.
 *
 * A missed match is the safe direction — the row still opens, just in the popup for a
 * payable with no invoice, which shows fewer fields rather than wrong ones.
 */
export function matchObligationsToInvoices<I extends DebtInvoiceLike>(
  obligations: readonly DebtObligationLike[] | null | undefined,
  invoices: readonly I[] | null | undefined,
): Map<string, I> {
  const unclaimed = new Map<string, I[]>();
  for (const inv of unpaidApInvoices(invoices)) {
    if (!inv?.id) continue;
    const key = debtKey(inv.counterparty_id, absAmount(inv.amount_due), isoDay(inv.due_date));
    const bucket = unclaimed.get(key);
    if (bucket) bucket.push(inv);
    else unclaimed.set(key, [inv]);
  }

  const matched = new Map<string, I>();
  for (const o of obligations ?? []) {
    if (!o?.id) continue;
    const key = debtKey(o.counterparty_id, absAmount(o.amount_due), isoDay(o.due_date));
    const bucket = unclaimed.get(key);
    const inv = bucket?.shift();
    if (inv) matched.set(o.id, inv);
  }
  return matched;
}
