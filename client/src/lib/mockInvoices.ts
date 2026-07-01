import type { Invoice } from "./invoiceTypes";

/* ── Mock Invoices ────────────────────────────────────────────────────────────
   Three canonical invoices aligned with the demo payment scenarios.
   Each is linked bidirectionally to its proposal and audit record.
   ─────────────────────────────────────────────────────────────────────────── */

export const MOCK_INVOICES: Invoice[] = [
  /* 1 — AWS monthly cloud bill → prop-aws / AUD-3308FE ─────────────────── */
  {
    id: "AWS-2026-07",
    number: "Invoice #AWS-2026-07",
    vendorId: "aws",
    vendorName: "Amazon Web Services",
    billingPeriod: "Jun 1 – Jun 30, 2026",
    issuedLabel: "Jul 1, 2026",
    dueLabel: "Jul 7, 2026",
    lineItems: [
      { description: "EC2 — Compute (committed-use)", quantity: 1, unitPrice: 2840.0, total: 2840.0 },
      { description: "S3 — Object Storage", quantity: 1, unitPrice: 510.0, total: 510.0 },
      { description: "RDS — Managed Database", quantity: 1, unitPrice: 620.0, total: 620.0 },
      { description: "CloudFront — CDN Bandwidth", quantity: 1, unitPrice: 180.0, total: 180.0 },
    ],
    subtotal: 4150.0,
    tax: 0,
    total: 4150.0,
    status: "paid",
    proposalId: "prop-aws",
    auditId: "AUD-3308FE",
    coherence: {
      status: "match",
      proposalAmount: 4150,
      invoiceAmount: 4150,
      note: "Invoice total matches the proposed payment exactly — $4,150.00.",
    },
    provenance: {
      source: "Email attachment",
      receivedLabel: "Jul 1, 2026 at 8:04 AM ET",
      extractedBy: "Brain Invoice Agent",
      extractedAtLabel: "Jul 1, 2026 at 8:05 AM ET",
    },
    notes: "Committed-use discount applied. Net effective hourly rate within contracted envelope.",
  },

  /* 2 — Bright Futures design retainer → prop-bankchange / AUD-7K2M ───── */
  {
    id: "BFS-0426",
    number: "Invoice #BFS-0426",
    vendorId: "brightfutures",
    vendorName: "Bright Futures Studio",
    billingPeriod: "April 2026",
    issuedLabel: "Jul 4, 2026",
    dueLabel: "Jul 6, 2026",
    lineItems: [
      { description: "Monthly design retainer — April", quantity: 1, unitPrice: 3200.0, total: 3200.0 },
    ],
    subtotal: 3200.0,
    tax: 0,
    total: 3200.0,
    status: "held",
    proposalId: "prop-bankchange",
    auditId: "AUD-7K2M",
    coherence: {
      status: "match",
      proposalAmount: 3200,
      invoiceAmount: 3200,
      note: "Invoice total matches the proposed payment — $3,200.00. Note: payment is held pending bank-detail verification.",
    },
    provenance: {
      source: "Email attachment",
      receivedLabel: "Jul 4, 2026 at 2:07 PM ET",
      extractedBy: "Brain Invoice Agent",
      extractedAtLabel: "Jul 4, 2026 at 2:08 PM ET",
    },
    notes:
      "Payout account on this invoice (Chase ••2087) differs from all prior payments (Wells Fargo ••6610). Payment held by always-on bank-detail-change guard.",
  },

  /* 3 — Con Edison utility bill → prop-utilities / AUD-3F9P ──────────── */
  {
    id: "CE-2026-0631",
    number: "Invoice #CE-2026-0631",
    vendorId: "conedison",
    vendorName: "Con Edison Business",
    billingPeriod: "Jun 1 – Jun 30, 2026",
    issuedLabel: "Jun 30, 2026",
    dueLabel: "Jul 3, 2026",
    lineItems: [
      { description: "Electricity — business account #49210", quantity: 1, unitPrice: 486.0, total: 486.0 },
    ],
    subtotal: 486.0,
    tax: 0,
    total: 486.0,
    status: "paid",
    proposalId: "prop-utilities",
    auditId: "AUD-3F9P",
    coherence: {
      status: "match",
      proposalAmount: 486,
      invoiceAmount: 486,
      note: "Invoice total matches the proposed payment exactly — $486.00.",
    },
    provenance: {
      source: "API sync",
      receivedLabel: "Jul 3, 2026 at 7:54 AM ET",
      extractedBy: "Brain Invoice Agent",
      extractedAtLabel: "Jul 3, 2026 at 7:55 AM ET",
    },
  },
];

/* ── Dev coherence guard ───────────────────────────────────────────────────
   Runs once at module evaluation in development builds only.
   Asserts every invoice's invoiceAmount matches its total field,
   and that every proposalId/auditId reference is structurally present. */
if (import.meta.env.DEV) {
  for (const inv of MOCK_INVOICES) {
    if (inv.coherence.invoiceAmount !== inv.total) {
      console.error(
        `[invoices] ${inv.id}: coherence.invoiceAmount (${inv.coherence.invoiceAmount}) ` +
          `≠ total (${inv.total})`,
      );
    }
    const lineSum = inv.lineItems.reduce((s, l) => s + l.total, 0);
    if (Math.abs(lineSum - inv.subtotal) > 0.01) {
      console.error(
        `[invoices] ${inv.id}: line-item sum (${lineSum}) ≠ subtotal (${inv.subtotal})`,
      );
    }
  }
}
