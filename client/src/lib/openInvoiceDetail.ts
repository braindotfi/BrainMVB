import { MOCK_INVOICES } from "./mockInvoices";
import type { Invoice } from "./invoiceTypes";

/* ── Single source of truth for opening an invoice viewer ────────────────────
   Every invoice reference across the app resolves the same way: look the
   invoice up by id in the mock catalogue and — only if it resolves — call the
   caller's open-setter. Callers use `resolveInvoice` to decide whether to
   render a tappable link or plain text; they never duplicate the lookup.
   An unresolved id is a bug (dangling reference) — we `console.warn` loudly
   rather than fail silently.
   ─────────────────────────────────────────────────────────────────────────── */

export function resolveInvoice(
  invoiceId: string | null | undefined,
): Invoice | undefined {
  if (!invoiceId) return undefined;
  return MOCK_INVOICES.find((inv) => inv.id === invoiceId);
}

/** Open an invoice viewer if (and only if) the id resolves. Returns whether it did. */
export function openInvoiceDetail(
  invoiceId: string | null | undefined,
  setOpen: (invoice: Invoice) => void,
): boolean {
  const inv = resolveInvoice(invoiceId);
  if (!inv) {
    console.warn(
      `openInvoiceDetail: no invoice found for id '${invoiceId ?? ""}'`,
    );
    return false;
  }
  setOpen(inv);
  return true;
}
