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
];
