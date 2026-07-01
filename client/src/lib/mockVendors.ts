import type { Vendor } from "./vendorTypes";

/* ── Mock vendor catalogue ──────────────────────────────────────────────────
   Covers all four trustStatus variants:
   - trusted: Con Edison, Notion — wired to real rules via ruleIds
   - known + eligible: Apex Cleaning — Brain suggests trust
   - new: Northstar Design — sparse history, no suggestion
   - under_review: Bright Futures — bank-detail-change flag, was trusted before

   Every vendor tells ONE story across surfaces. Bright Futures is
   under_review everywhere — never auto_approved.
   ────────────────────────────────────────────────────────────────────────── */

export const MOCK_VENDORS: Vendor[] = [
  /* ── Trusted ────────────────────────────────────────────────── */
  {
    id: "conedison",
    name: "Con Edison Business",
    category: "Utilities",
    trustStatus: "trusted",
    payeeAccountLast4: "4821",
    history: {
      paymentCount: 14,
      totalPaid: 6792,
      firstPaidLabel: "May 2025",
      lastPaidLabel: "Jul 3, 2026",
      avgAmount: 486,
      flagCount: 0,
    },
    flags: [],
    trustGrantedLabel:
      "You trusted this vendor May 12 · 14 payments since, none flagged",
    ruleIds: ["utility"],
    eligibleForTrust: false,
  },
  {
    id: "notion",
    name: "Notion Labs",
    category: "Software",
    trustStatus: "trusted",
    payeeAccountLast4: "4821",
    history: {
      paymentCount: 19,
      totalPaid: 4560,
      firstPaidLabel: "May 2025",
      lastPaidLabel: "Jul 6, 2026",
      avgAmount: 240,
      flagCount: 0,
    },
    flags: [],
    trustGrantedLabel:
      "You trusted this vendor May 3 · 19 payments since, none flagged",
    ruleIds: ["saas"],
    eligibleForTrust: false,
  },

  /* ── Known ───────────────────────────────────────────────────── */
  {
    id: "apex",
    name: "Apex Cleaning Co",
    category: "Facilities",
    trustStatus: "known",
    payeeAccountLast4: "6610",
    history: {
      paymentCount: 6,
      totalPaid: 8640,
      firstPaidLabel: "Jan 2026",
      lastPaidLabel: "Jun 17, 2026",
      avgAmount: 1440,
      flagCount: 1,
    },
    flags: [
      {
        kind: "possible_duplicate",
        label: "Possible duplicate invoice",
        raisedAtLabel: "Jul 4, 2026",
      },
    ],
    eligibleForTrust: true,
    eligibilityEvidence: [
      { label: "payments", value: "6 of 6 on time" },
      { label: "amount range", value: "$1,440 – $1,450" },
      {
        label: "flags raised",
        value: "1 (duplicate, resolved)",
        severity: "warning",
      },
      { label: "bank details", value: "unchanged since Jan 2026" },
    ],
    ruleIds: [],
  },

  /* ── New ───────────────────────────────────────────────────── */
  {
    id: "northstar",
    name: "Northstar Design",
    category: "Creative",
    trustStatus: "new",
    payeeAccountLast4: "1133",
    history: {
      paymentCount: 1,
      totalPaid: 6200,
      firstPaidLabel: "May 12, 2026",
      lastPaidLabel: "May 12, 2026",
      avgAmount: 6200,
      flagCount: 0,
    },
    flags: [],
    eligibleForTrust: false,
    ruleIds: [],
  },

  /* ── Under review ───────────────────────────────────────────── */
  {
    id: "brightfutures",
    name: "Bright Futures Tuition",
    category: "Education",
    trustStatus: "under_review",
    payeeAccountLast4: "3392",
    history: {
      paymentCount: 4,
      totalPaid: 12800,
      firstPaidLabel: "Feb 2026",
      lastPaidLabel: "Jun 28, 2026",
      avgAmount: 3200,
      flagCount: 1,
    },
    flags: [
      {
        kind: "bank_detail_change",
        label: "Bank account detail changed",
        raisedAtLabel: "Jun 28, 2026",
        priorAccountLast4: "5521",
        newAccountLast4: "3392",
      },
    ],
    wasTrustedLabel: "Was trusted since Mar 3",
    eligibleForTrust: false,
    ruleIds: [],
  },

  /* ── Referenced by audit records / invoices / proposals ──────────────────
     Each history below is reconciled with the record(s) that reference it —
     amounts, dates, tier, and rule membership all match how those records
     actually behaved. NOT stubs.
     ──────────────────────────────────────────────────────────────────────── */

  /* aws — one human-approved payment above the auto-pay limit (AUD-3308FE,
     $4,150, settled Jul 7; invoice AWS-2026-07). Single recent payment ⇒ "new"
     tier; it required human approval precisely because it is not yet trusted. */
  {
    id: "aws",
    name: "Amazon Web Services",
    category: "Cloud Infrastructure",
    trustStatus: "new",
    payeeAccountLast4: "9021",
    history: {
      paymentCount: 1,
      totalPaid: 4150,
      firstPaidLabel: "Jul 7, 2026",
      lastPaidLabel: "Jul 7, 2026",
      avgAmount: 4150,
      flagCount: 0,
    },
    flags: [],
    eligibleForTrust: false,
    ruleIds: [],
  },

  /* adobe — auto-cleared SaaS subscription (AUD-4E2N, $540, Jul 5) by the
     "SaaS Subscriptions" rule ⇒ trusted + on the saas allowlist. Recurring
     monthly history at the referenced $540. */
  {
    id: "adobe",
    name: "Adobe",
    category: "Software",
    trustStatus: "trusted",
    payeeAccountLast4: "7745",
    history: {
      paymentCount: 7,
      totalPaid: 3780,
      firstPaidLabel: "Jan 2026",
      lastPaidLabel: "Jul 5, 2026",
      avgAmount: 540,
      flagCount: 0,
    },
    flags: [],
    trustGrantedLabel:
      "You trusted this vendor Jan 8 · 7 payments since, none flagged",
    ruleIds: ["saas"],
    eligibleForTrust: false,
  },

  /* comcast — auto-cleared utility bill (AUD-1B3T, $240, Jul 5) by the
     "Utility Bills" rule ⇒ trusted + on the utility allowlist. Recurring
     monthly history at the referenced $240. */
  {
    id: "comcast",
    name: "Comcast Business",
    category: "Utilities",
    trustStatus: "trusted",
    payeeAccountLast4: "3120",
    history: {
      paymentCount: 6,
      totalPaid: 1440,
      firstPaidLabel: "Feb 2026",
      lastPaidLabel: "Jul 5, 2026",
      avgAmount: 240,
      flagCount: 0,
    },
    flags: [],
    trustGrantedLabel:
      "You trusted this vendor Feb 14 · 6 payments since, none flagged",
    ruleIds: ["utility"],
    eligibleForTrust: false,
  },

  /* brookside — recurring office lease, human-approved above the auto-pay
     limit each cycle (AUD-8A1R, $8,400, Jul 1). Established but not auto-clear
     ⇒ "known" tier (large amounts always escalate to human review). */
  {
    id: "brookside",
    name: "Brookside Commercial Properties",
    category: "Real Estate",
    trustStatus: "known",
    payeeAccountLast4: "5540",
    history: {
      paymentCount: 5,
      totalPaid: 42000,
      firstPaidLabel: "Mar 2026",
      lastPaidLabel: "Jul 1, 2026",
      avgAmount: 8400,
      flagCount: 0,
    },
    flags: [],
    eligibleForTrust: false,
    ruleIds: [],
  },

  /* meridian — trust just granted after identity + bank-detail verification
     (AUD-6G3W, Jun 28). No payments have run yet, so history is empty by
     design; the record carries no amount. */
  {
    id: "meridian",
    name: "Meridian LLC",
    category: "Professional Services",
    trustStatus: "trusted",
    payeeAccountLast4: "6208",
    history: {
      paymentCount: 0,
      totalPaid: 0,
      firstPaidLabel: "—",
      lastPaidLabel: "—",
      avgAmount: 0,
      flagCount: 0,
    },
    flags: [],
    trustGrantedLabel:
      "You trusted this vendor Jun 28 · identity + bank details verified",
    ruleIds: [],
    eligibleForTrust: false,
  },
];
