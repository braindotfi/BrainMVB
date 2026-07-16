/* ── Generalized document / record EVIDENCE model ─────────────────────────────
   ONE data model for every read only piece of evidence Brain surfaces behind a
   proposal, audit record, or settled receipt - keyed off a `kind` discriminator.
   The viewer (DocumentViewerPopup) renders ALL kinds from this one shape; there
   is no per-kind type. Brain READS these documents - it never owns them; the
   source system (AP, bank, ERP, CLM) remains the system of record. */

export type DocKind =
  | "invoice"
  | "prior_payment"
  | "bank_transaction"
  | "contract"
  | "purchase_order";

/* Where a document came from - provenance is shown on every kind so a human can
   judge how much to trust the extracted facts. */
export type Provenance =
  | "CONNECTOR_SYNC" // pulled from an accounting/AP connector
  | "EMAIL_INGEST" // parsed from an emailed attachment
  | "DOCUMENT_UPLOAD" // uploaded by a human
  | "PAYMENT_RAIL" // recorded by the payment execution service
  | "BANK_FEED"; // synced from the bank feed (e.g. Plaid)

export interface DocProvenance {
  /** Human-readable source, e.g. "QuickBooks Online" | "Plaid · Mercury". */
  source: string;
  /** When Brain ingested it, e.g. "Ingested Jun 29, 2026 · 8:04 AM ET". */
  ingestedAtLabel: string;
  /** Machine tag for the provenance class. */
  enum: Provenance;
  /** Opaque reference into the source system, e.g. "qbo:bill:8841". */
  ledgerRef: string;
}

export interface DocLineItem {
  label: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
}

/* Bank-line ↔ ledger reconciliation. bank_transaction records carry this so the
   viewer can render the two sides beside each other and highlight the gap. */
export interface DocReconciliation {
  ledgerRef: string;
  ledgerAmount: number;
  ledgerDateLabel: string;
  bankAmount: number;
  bankDateLabel: string;
  direction: "debit" | "credit";
}

/* A document's own status. Only meaningful for kinds that have a payment
   lifecycle (invoice / prior_payment / purchase_order); left undefined for
   bank_transaction and contract. */
export type DocStatus =
  | "unpaid"
  | "paid"
  | "held"
  | "disputed"
  | "cancelled";

export interface DocumentRecord {
  id: string; // canonical id, e.g. "AWS-2026-07" | "TXN-2026-0621"
  kind: DocKind;
  title: string; // e.g. "AWS - June usage" | "Office Lease Agreement"

  /* Counterparty. A KNOWN vendor carries `vendorId` (resolves + deep-links to
     the vendor detail). NON-vendor counterparties (landlords, internal ledgers,
     one-off payees) carry only `counterparty` text and never a vendorId. */
  vendorId?: string;
  vendorName?: string;
  counterparty?: string;

  amount?: number;
  dateLabel: string; // primary date, e.g. "Due Jul 8, 2026"
  dateCaption?: string; // caption for the primary date, e.g. "Issued" | "Paid"
  status?: DocStatus;
  payeeAccountLast4?: string;

  lineItems?: DocLineItem[];
  billingPeriod?: string; // e.g. "Jun 1 – Jun 30, 2026"

  /* contract-specific */
  effectiveFromLabel?: string;
  effectiveToLabel?: string;
  cadence?: string; // e.g. "Monthly" | "Annual"

  /* bank_transaction-specific */
  direction?: "debit" | "credit";
  reconciliation?: DocReconciliation;

  /* When this record has a natural prior/comparison twin (duplicate invoice, or
     an established payment on the OLD account), point at it by id - the viewer
     offers an in-place COMPARE toggle that renders the two side by side. */
  compareToId?: string;

  provenance: DocProvenance;

  /* When this evidence backs a specific proposal/payment, the viewer shows an
     amount-coherence note (does the document amount match the payment?). */
  proposalId?: string;

  /* Link to the original file in the source system, if any. */
  documentHref?: string;
}

export function docKindLabel(kind: DocKind): string {
  switch (kind) {
    case "invoice": return "Invoice";
    case "prior_payment": return "Prior Payment";
    case "bank_transaction": return "Bank Txn";
    case "contract": return "Contract";
    case "purchase_order": return "Purchase Order";
  }
}

/* Per-kind reminder that Brain is a viewer, not the system of record. */
export function docKindCaption(kind: DocKind): string {
  switch (kind) {
    case "invoice":
      return "A viewer, not an AP system. Brain reads this invoice; your accounting system owns it.";
    case "prior_payment":
      return "A viewer, not a payments ledger. Brain reads this past payment; your bank and AP system own it.";
    case "bank_transaction":
      return "A viewer, not a banking system. Brain reads this bank-feed line; your bank owns it.";
    case "contract":
      return "A viewer, not a contract system. Brain reads this agreement; your CLM owns it.";
    case "purchase_order":
      return "A viewer, not a procurement system. Brain reads this PO; your ERP owns it.";
  }
}

export function docStatusLabel(status: DocStatus): string {
  switch (status) {
    case "unpaid": return "UNPAID";
    case "paid": return "PAID";
    case "held": return "HELD";
    case "disputed": return "DISPUTED";
    case "cancelled": return "CANCELLED";
  }
}
