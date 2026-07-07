import type { DocumentRecord } from "./documentTypes";

/* ── Seeded evidence documents ────────────────────────────────────────────────
   Every record here is tied to an EXISTING demo item (a proposal, audit record,
   vendor, or settled receipt) — no invented ids. This is the canonical catalogue
   the documentsStore serves and the viewer renders from. Coherence with the
   referencing records (amounts, vendors, dates, status) is asserted at dev-boot
   by ruleConsistencyCheck. */

export const MOCK_DOCUMENTS: DocumentRecord[] = [
  /* ── invoice: AWS June usage (executed prior cycle) ─────────────────────────
     Backs the settled twin `settled-aws` (AUD-3308FE). Vendor "aws", paid. */
  {
    id: "AWS-2026-07",
    kind: "invoice",
    title: "AWS — June usage",
    vendorId: "aws",
    vendorName: "Amazon Web Services",
    amount: 4150,
    dateLabel: "Issued Jul 1, 2026",
    dateCaption: "Issued",
    status: "paid",
    payeeAccountLast4: "9021",
    billingPeriod: "Jun 1 – Jun 30, 2026",
    lineItems: [
      { label: "EC2 compute", amount: 2480 },
      { label: "S3 storage and transfer", amount: 910 },
      { label: "RDS (Postgres)", amount: 520 },
      { label: "CloudWatch and support", amount: 240 },
    ],
    provenance: {
      source: "QuickBooks Online",
      ingestedAtLabel: "Ingested Jul 1, 2026 · 6:12 AM ET",
      enum: "CONNECTOR_SYNC",
      ledgerRef: "qbo:bill:AWS-2026-07",
    },
    proposalId: "settled-aws",
    documentHref: "#",
  },

  /* ── invoice: Con Edison electricity (auto-cleared) ─────────────────────────
     Backs the auto-handled receipt `auto-conedison` (AUD-3F9P). Vendor paid. */
  {
    id: "CE-2026-0631",
    kind: "invoice",
    title: "Con Edison — electricity",
    vendorId: "conedison",
    vendorName: "Con Edison Business",
    amount: 486,
    dateLabel: "Issued Jun 27, 2026",
    dateCaption: "Issued",
    status: "paid",
    payeeAccountLast4: "1180",
    billingPeriod: "May 26 – Jun 25, 2026",
    lineItems: [
      { label: "Delivery charges", amount: 214 },
      { label: "Supply charges", amount: 248 },
      { label: "Taxes and surcharges", amount: 24 },
    ],
    provenance: {
      source: "Email attachment · billing@coned.com",
      ingestedAtLabel: "Ingested Jun 27, 2026 · 7:41 AM ET",
      enum: "EMAIL_INGEST",
      ledgerRef: "email:coned:CE-2026-0631",
    },
    proposalId: "auto-conedison",
    documentHref: "#",
  },

  /* ── invoice: Bright Futures retainer (bank details CHANGED, held) ──────────
     Backs the pending `prop-bankchange` (AUD-7K2M, flagged). New payout account
     ••2087 vs the established ••6610 — compare against the prior payment below. */
  {
    id: "BFS-0426",
    kind: "invoice",
    title: "Bright Futures — April design retainer",
    vendorId: "brightfutures",
    vendorName: "Bright Futures Studio",
    amount: 3200,
    dateLabel: "Due Jul 6, 2026",
    dateCaption: "Due",
    status: "held",
    payeeAccountLast4: "2087",
    billingPeriod: "Design retainer · April",
    lineItems: [{ label: "Monthly design retainer", amount: 3200 }],
    compareToId: "BFS-PRIOR-0326",
    provenance: {
      source: "Email attachment · ap@brightfutures.studio",
      ingestedAtLabel: "Ingested Jul 5, 2026 · 9:02 AM ET",
      enum: "EMAIL_INGEST",
      ledgerRef: "email:bfs:BFS-0426",
    },
    proposalId: "prop-bankchange",
    documentHref: "#",
  },

  /* ── prior_payment: established Bright Futures payment on the OLD account ────
     The historical twin BFS-0426 is compared against — same vendor, same amount,
     DIFFERENT payout account (••6610). Not tied to a proposal (it's history). */
  {
    id: "BFS-PRIOR-0326",
    kind: "prior_payment",
    title: "Bright Futures — March retainer (paid)",
    vendorId: "brightfutures",
    vendorName: "Bright Futures Studio",
    amount: 3200,
    dateLabel: "Paid Jun 6, 2026",
    dateCaption: "Paid",
    status: "paid",
    payeeAccountLast4: "6610",
    provenance: {
      source: "Execution service · ACH",
      ingestedAtLabel: "Recorded Jun 6, 2026 · 2:14 PM ET",
      enum: "PAYMENT_RAIL",
      ledgerRef: "rail:ach:BFS-PRIOR-0326",
    },
  },

  /* ── invoice: Apex Cleaning — the NEW (possible-duplicate) invoice ──────────
     Backs the pending `prop-duplicate`. Unpaid. Compare against the near-
     identical paid invoice APX-3382 below. */
  {
    id: "APX-3391",
    kind: "invoice",
    title: "Apex Cleaning — July service",
    vendorId: "apex",
    vendorName: "Apex Cleaning Co",
    amount: 1450,
    dateLabel: "Due Jul 8, 2026",
    dateCaption: "Due",
    status: "unpaid",
    payeeAccountLast4: "6610",
    billingPeriod: "Facilities cleaning · July",
    lineItems: [{ label: "Monthly facilities cleaning", amount: 1450 }],
    compareToId: "APX-3382",
    provenance: {
      source: "Email attachment · billing@apexclean.co",
      ingestedAtLabel: "Ingested Jun 29, 2026 · 8:04 AM ET",
      enum: "EMAIL_INGEST",
      ledgerRef: "email:apex:APX-3391",
    },
    proposalId: "prop-duplicate",
    documentHref: "#",
  },

  /* ── prior_payment: Apex Cleaning — the near-identical PAID invoice ─────────
     Paid Jun 19 at $1,448 (delta $2 vs APX-3391) — the duplicate signal. */
  {
    id: "APX-3382",
    kind: "prior_payment",
    title: "Apex Cleaning — June service (paid)",
    vendorId: "apex",
    vendorName: "Apex Cleaning Co",
    amount: 1448,
    dateLabel: "Paid Jun 19, 2026",
    dateCaption: "Paid",
    status: "paid",
    payeeAccountLast4: "6610",
    provenance: {
      source: "Execution service · ACH",
      ingestedAtLabel: "Recorded Jun 19, 2026 · 11:38 AM ET",
      enum: "PAYMENT_RAIL",
      ledgerRef: "rail:ach:APX-3382",
    },
  },

  /* ── bank_transaction: Plaid line that doesn't match the ledger ─────────────
     Backs the reconciliation gap in `prop-recon`. NO proposal amount tie (the
     proposal's $184 is the correcting entry, not the line) — the evidence is the
     bank-vs-ledger reconciliation itself. */
  {
    id: "TXN-2026-0621",
    kind: "bank_transaction",
    title: "Operating account debit",
    counterparty: "Unreconciled vendor debit",
    amount: 1024,
    dateLabel: "Posted Jun 21, 2026",
    dateCaption: "Posted",
    direction: "debit",
    payeeAccountLast4: "4821",
    reconciliation: {
      ledgerRef: "JE-2026-0612",
      ledgerAmount: 1208,
      ledgerDateLabel: "Jun 20, 2026",
      bankAmount: 1024,
      bankDateLabel: "Jun 21, 2026",
      direction: "debit",
    },
    provenance: {
      source: "Plaid · Mercury Operating",
      ingestedAtLabel: "Synced Jun 21, 2026 · 6:00 PM ET",
      enum: "BANK_FEED",
      ledgerRef: "plaid:txn:TXN-2026-0621",
    },
  },

  /* ── contract: office lease (justifies the recurring lease payment) ─────────
     Backs the auto-handled `auto-lease`. Hudson Yards Property LLC is NOT in the
     vendor catalogue — a landlord, not an AP vendor — so it renders as plain
     counterparty text with no vendor link. */
  {
    id: "CTR-LEASE-24",
    kind: "contract",
    title: "Office Lease Agreement",
    counterparty: "Hudson Yards Property LLC",
    amount: 7800,
    dateLabel: "Effective Aug 1, 2024",
    dateCaption: "Effective",
    cadence: "Monthly",
    effectiveFromLabel: "Aug 1, 2024",
    effectiveToLabel: "Jul 31, 2027",
    provenance: {
      source: "Uploaded · lease_hudsonyards_2024.pdf",
      ingestedAtLabel: "Ingested Aug 3, 2024 · 4:22 PM ET",
      enum: "DOCUMENT_UPLOAD",
      ledgerRef: "upload:CTR-LEASE-24",
    },
    proposalId: "auto-lease",
    documentHref: "#",
  },
];

/* Dev-only: a document's line items (when present) must sum to its amount. */
if (import.meta.env.DEV) {
  for (const d of MOCK_DOCUMENTS) {
    if (d.lineItems && d.lineItems.length > 0 && typeof d.amount === "number") {
      const sum = d.lineItems.reduce((t, li) => t + li.amount, 0);
      if (Math.round(sum) !== Math.round(d.amount)) {
        console.warn(
          `mockDocuments: line items for '${d.id}' sum to ${sum}, expected amount ${d.amount}`,
        );
      }
    }
  }
}
