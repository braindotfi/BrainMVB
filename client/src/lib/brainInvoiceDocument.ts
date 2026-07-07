import { useQuery } from "@tanstack/react-query";
import type { DocumentRecord } from "./documentTypes";

/* ── Live brain-core invoice → evidence-viewer DocumentRecord ──────────────────
   The read-only document viewer renders an invoice-kind DocumentRecord. This is the
   ONE place a live brain-core invoice (from `/ledger/invoices`) becomes that record,
   reused by BillDetailPopup (the Bills inbox) and ProposalDetail (a live proposal's
   source invoice). Honest: only fields brain-core's Invoice actually carries. It has
   no line items, no payee account, no source-system link, and no vendor identity id,
   so those are omitted rather than fabricated. `compareToId`/`proposalId` are
   BrainMVB-only mock-document concepts and are never invented for a live invoice. */

/** The subset of a brain-core Ledger invoice the document mapper needs. BillDetailPopup's
 *  richer BrainInvoiceDTO is structurally assignable to this. */
export interface LedgerInvoice {
  id: string;
  invoice_number: string;
  counterparty_id: string;
  amount_due: string;
  due_date?: string | null;
  status: string;
  created_at?: string | null;
}

function fmtInvoiceDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** brain-core invoice status → the viewer's DocStatus. Only "paid"/"cancelled"/"disputed"
 *  are asserted from a real signal; every not-yet-settled state (draft/sent/partial/overdue)
 *  reads honestly as "unpaid". */
function mapInvoiceStatus(status: string): DocumentRecord["status"] {
  if (status === "paid") return "paid";
  if (status === "cancelled") return "cancelled";
  if (status === "disputed") return "disputed";
  return "unpaid";
}

/** Map a live brain-core invoice to an invoice-kind DocumentRecord. */
export function toBrainInvoiceDocument(invoice: LedgerInvoice, vendorName: string): DocumentRecord {
  return {
    id: invoice.invoice_number,
    kind: "invoice",
    title: `${vendorName} — invoice`,
    counterparty: vendorName,
    amount: Number(invoice.amount_due),
    dateLabel: `Due ${fmtInvoiceDate(invoice.due_date)}`,
    dateCaption: "Due",
    status: mapInvoiceStatus(invoice.status),
    provenance: {
      source: "brain-core Ledger",
      ingestedAtLabel: invoice.created_at
        ? `Extracted ${fmtInvoiceDate(invoice.created_at)}`
        : "Extracted from your ledger",
      enum: "CONNECTOR_SYNC",
      ledgerRef: invoice.id,
    },
  };
}

interface InvoicesResponse {
  invoices: LedgerInvoice[];
}
interface CounterpartiesLite {
  counterparties: { id: string; name?: string | null }[];
}

/**
 * Resolve a LIVE brain-core invoice (by ledger id OR invoice_number) to a DocumentRecord for
 * the evidence viewer. Returns undefined for an id that is NOT a live invoice (e.g. a mock
 * proposal's invoiceId), so callers fall back to the mock document store. Safe to call with
 * null/undefined — the queries disable.
 */
export function useBrainInvoiceDocument(invoiceId: string | null | undefined): DocumentRecord | undefined {
  const id = invoiceId ?? "";
  const invoicesQuery = useQuery<InvoicesResponse>({
    queryKey: ["/api/brain/ledger/invoices"],
    enabled: id.length > 0,
    retry: false,
  });
  const counterpartiesQuery = useQuery<CounterpartiesLite>({
    queryKey: ["/api/brain/ledger/counterparties"],
    enabled: id.length > 0,
    retry: false,
  });

  if (id.length === 0) return undefined;
  const invoice = (invoicesQuery.data?.invoices ?? []).find(
    (i) => i.id === id || i.invoice_number === id,
  );
  if (!invoice) return undefined;
  const vendorName =
    (counterpartiesQuery.data?.counterparties ?? []).find((c) => c.id === invoice.counterparty_id)
      ?.name ?? "a vendor";
  return toBrainInvoiceDocument(invoice, vendorName);
}
