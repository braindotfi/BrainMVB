/* Invoice / document data model for the Invoice Viewer feature.
   Invoices are source-of-truth documents Brain ingests and parses to create
   proposals. They are always READ-ONLY here — no mutation surface. */

export interface InvoiceLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total: number;
}

export type InvoiceStatus = "unpaid" | "paid" | "held" | "disputed";
export type InvoiceCoherenceStatus = "match" | "mismatch" | "unverified";

export interface InvoiceProvenance {
  source: string; // e.g. "Email attachment", "API sync", "Manual upload"
  receivedLabel: string;
  extractedBy: string; // "Brain Invoice Agent" | "OCR pipeline"
  extractedAtLabel: string;
}

export interface Invoice {
  id: string; // URL-safe slug, e.g. "AWS-2026-07"
  number: string; // display label, e.g. "Invoice #AWS-2026-07"
  vendorId: string;
  vendorName: string;
  billingPeriod?: string;
  issuedLabel: string;
  dueLabel: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax?: number;
  total: number;
  status: InvoiceStatus;
  proposalId?: string; // the proposal this invoice generated
  auditId?: string; // the audit record that closed this invoice
  /* Amount coherence: does the extracted total match what Brain proposed? */
  coherence: {
    status: InvoiceCoherenceStatus;
    proposalAmount?: number;
    invoiceAmount: number;
    note: string;
  };
  provenance: InvoiceProvenance;
  notes?: string;
}
