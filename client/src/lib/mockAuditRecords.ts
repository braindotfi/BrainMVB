import type { AuditRecord } from "./auditTypes";

/* ~14 records spanning every eventType and both anchor states.
   Recurring demo items are wired by proposalId so surfaces reconcile
   with the Review/Activity flows.

   ponytail: AuditLogPage itself moved to live brain-core events (Phase 1c,
   see client/src/lib/brainAudit.ts) and no longer reads this. This store is
   RETAINED only as the fixture ruleConsistencyCheck.ts's dev guards assert
   against - it cross-checks the still-mock document/vendor/rule stores for
   coherence. Delete once those stores also go live. (SettledRecordCard and
   AUTO_HANDLED_PROPOSALS were removed in the Phase 8 cleanup.) */

/* One fallback record per tab so AuditLogPage shows UI even when brain-core
   has no events for a category. Kept separate from the full MOCK_AUDIT_RECORDS
   so we can drop these once the live feed covers every tab. */
/** The 4 auto-approved mock proposals as audit records - merged into
 *  AuditLogPage and ActivityPage so they appear in "Auto-Approved" / "Brain Did"
 *  regardless of what brain-core returns. De-duped by id at merge time. */
export const AUTO_APPROVED_IDS = new Set(["AUD-4E2N", "AUD-1B3T", "AUD-2R1M", "AUD-7P9Q"]);

export const DEMO_AUDIT_RECORDS: AuditRecord[] = [
  {
    id: "AUD-DEMO-1",
    eventType: "approved",
    summary: "Amazon Web Services payment approved and sent",
    counterparty: "Amazon Web Services",
    amount: 4150,
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 7, 9:02 AM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 2,
    rowSubtitle: "$4,150 · sarah@meridian · AUD-DEMO-1",
    lifecycle: [
      { label: "Invoice Agent proposed payment", timestamp: "Jul 6, 3:14 PM ET", kind: "ok" },
      { label: "Escalated to human. Above auto-pay limit", timestamp: "Jul 6, 3:14 PM ET", note: "policy/ap.routine.v3", kind: "alert" },
      { label: "sarah@meridian approved", timestamp: "Jul 7, 8:55 AM ET", kind: "ok", actor: "sarah@meridian" },
      { label: "ACH settled", timestamp: "Jul 7, 9:02 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Amazon Web Services", refId: "aws" },
      { kind: "proposal", label: "AWS payment · Jul 7", refId: "settled-aws" },
      { kind: "invoice", label: "#AWS-2026-07", refId: "AWS-2026-07" },
    ],
    invoiceId: "AWS-2026-07",
    anchor: { status: "anchored", auditId: "AUD-DEMO-1", merkleRoot: "0x9f3a…c41e", baseTx: "0x72b1…8e2d", block: 21_847_932, anchoredAtLabel: "Jul 7, 9:04 AM ET", verifyHref: "https://basescan.org/tx/0x72b1…8e2d" },
    proposalId: "settled-aws",
  },
  {
    id: "AUD-DEMO-2",
    eventType: "auto_approved",
    summary: "Con Edison Business cleared automatically by standing rule",
    counterparty: "Con Edison Business",
    amount: 486,
    actor: "system",
    occurredAtLabel: "Jul 3, 8:02 AM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 4,
    rowSubtitle: "$486 · system · AUD-DEMO-2",
    lifecycle: [
      { label: "Invoice Agent detected monthly utility invoice", timestamp: "Jul 3, 7:55 AM ET", kind: "ok" },
      { label: "Matched standing rule ‘Utility Bills’", timestamp: "Jul 3, 7:56 AM ET", note: "amount within cap ($1,000), vendor on allowlist", kind: "ok" },
      { label: "Auto-approved by system", timestamp: "Jul 3, 7:56 AM ET", kind: "ok" },
      { label: "ACH settled", timestamp: "Jul 3, 8:02 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Con Edison Business", refId: "conedison" },
      { kind: "rule", label: "Utility Bills", refId: "utility" },
      { kind: "invoice", label: "#CE-2026-0631", refId: "CE-2026-0631" },
    ],
    invoiceId: "CE-2026-0631",
    anchor: { status: "anchored", auditId: "AUD-DEMO-2", merkleRoot: "0x7c2e…b18a", baseTx: "0x44d9…f7c1", block: 21_847_830, anchoredAtLabel: "Jul 3, 8:04 AM ET", verifyHref: "https://basescan.org/tx/0x44d9…f7c1" },
  },
  {
    id: "AUD-DEMO-3",
    eventType: "rule_change",
    summary: "Threshold lowered on ‘SaaS Subscriptions’ rule",
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 2, 4:22 PM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 5,
    rowSubtitle: "sarah@meridian · AUD-DEMO-3",
    lifecycle: [
      { label: "sarah@meridian edited rule threshold", timestamp: "Jul 2, 4:22 PM ET", note: "$500 → $600", kind: "ok" },
      { label: "Policy validator signed new config hash", timestamp: "Jul 2, 4:22 PM ET", kind: "ok" },
    ],
    linked: [{ kind: "rule", label: "SaaS Subscriptions", refId: "saas" }],
    anchor: { status: "anchored", auditId: "AUD-DEMO-3", merkleRoot: "0x1e8a…f4b9", baseTx: "0x09c3…a7e5", block: 21_847_805, anchoredAtLabel: "Jul 2, 4:24 PM ET", verifyHref: "https://basescan.org/tx/0x09c3…a7e5" },
  },
  {
    id: "AUD-DEMO-4",
    eventType: "trust_granted",
    summary: "Trust granted to Meridian LLC",
    counterparty: "Meridian LLC",
    actor: "sarah@meridian",
    occurredAtLabel: "Jun 28, 11:47 AM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 9,
    rowSubtitle: "sarah@meridian · AUD-DEMO-4",
    lifecycle: [
      { label: "Meridian LLC flagged as new vendor", timestamp: "Jun 28, 10:15 AM ET", kind: "alert" },
      { label: "sarah@meridian verified identity and bank details", timestamp: "Jun 28, 11:30 AM ET", kind: "ok" },
      { label: "Trust granted. Vendor added to allowlist", timestamp: "Jun 28, 11:47 AM ET", kind: "ok" },
    ],
    linked: [{ kind: "vendor", label: "Meridian LLC", refId: "meridian" }],
    anchor: { status: "anchored", auditId: "AUD-DEMO-4", merkleRoot: "0x4f7d…c2a6", baseTx: "0x33b8…d1f7", block: 21_847_620, anchoredAtLabel: "Jun 28, 11:49 AM ET", verifyHref: "https://basescan.org/tx/0x33b8…d1f7" },
  },
  {
    id: "AUD-DEMO-5",
    eventType: "flagged",
    summary: "Payment held. Bank details changed",
    counterparty: "Bright Futures Studio",
    amount: 3200,
    actor: "system",
    occurredAtLabel: "Jul 5, 2:11 PM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 1,
    rowSubtitle: "$3,200 · system · AUD-DEMO-5",
    lifecycle: [
      { label: "Invoice Agent proposed payment", timestamp: "Jul 5, 2:08 PM ET", kind: "ok" },
      { label: "Escalated to human. Routing number changed", timestamp: "Jul 5, 2:11 PM ET", note: "policy/ap.fraud.v2", kind: "alert" },
      { label: "Payment held pending verification", timestamp: "Jul 5, 2:11 PM ET", kind: "alert" },
    ],
    linked: [
      { kind: "vendor", label: "Bright Futures Studio", refId: "brightfutures" },
      { kind: "proposal", label: "Bright Futures payment · Jul 5", refId: "prop-bankchange" },
      { kind: "invoice", label: "#BFS-0426", refId: "BFS-0426" },
    ],
    invoiceId: "BFS-0426",
    anchor: { status: "anchored", auditId: "AUD-DEMO-5", merkleRoot: "0x3a8b…e5f2", baseTx: "0x21c7…9d4e", block: 21_847_902, anchoredAtLabel: "Jul 5, 2:15 PM ET", verifyHref: "https://basescan.org/tx/0x21c7…9d4e" },
  },
  {
    id: "AUD-DEMO-6",
    eventType: "rejected",
    summary: "Payment rejected. Apex Cleaning Co",
    counterparty: "Apex Cleaning Co",
    amount: 1450,
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 4, 1:18 PM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 2,
    rowSubtitle: "$1,450 · sarah@meridian · AUD-DEMO-6",
    lifecycle: [
      { label: "sarah@meridian rejected payment", timestamp: "Jul 4, 1:18 PM ET", kind: "alert", actor: "sarah@meridian" },
      { label: "Duplicate invoice detected earlier", timestamp: "Jul 4, 1:10 PM ET", kind: "alert" },
    ],
    linked: [{ kind: "vendor", label: "Apex Cleaning Co", refId: "apex" }],
    anchor: { status: "anchored", auditId: "AUD-DEMO-6", merkleRoot: "0x5c2a…e8d3", baseTx: "0x41f7…b4c9", block: 21_847_881, anchoredAtLabel: "Jul 4, 1:20 PM ET", verifyHref: "https://basescan.org/tx/0x41f7…b4c9" },
  },
  {
    id: "AUD-DEMO-7",
    eventType: "postponed",
    summary: "Payment postponed. Comcast Business",
    counterparty: "Comcast Business",
    amount: 228,
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 3, 9:30 AM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 3,
    rowSubtitle: "$228 · sarah@meridian · AUD-DEMO-7",
    lifecycle: [
      { label: "sarah@meridian postponed payment to tomorrow", timestamp: "Jul 3, 9:30 AM ET", kind: "ok", actor: "sarah@meridian" },
    ],
    linked: [{ kind: "vendor", label: "Comcast Business", refId: "comcast" }],
    anchor: { status: "pending_next_batch", auditId: "AUD-DEMO-7" },
  },
];

export const MOCK_AUDIT_RECORDS: AuditRecord[] = [
  /* 1 ─ Approved payment (AWS) ─ linked via proposalId ─────────────── */
  {
    id: "AUD-3308FE",
    eventType: "approved",
    summary: "Amazon Web Services payment approved and sent",
    counterparty: "Amazon Web Services",
    amount: 4150,
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 7, 9:02 AM ET",
    occurredAtMs: Date.now() - 1000 * 60 * 60 * 24 * 2,
    rowSubtitle: "$4,150 · sarah@meridian · AUD-3308FE",
    lifecycle: [
      { label: "Invoice Agent proposed payment", timestamp: "Jul 6, 3:14 PM ET", kind: "ok" },
      { label: "Escalated to human. Above auto-pay limit", timestamp: "Jul 6, 3:14 PM ET", note: "policy/ap.routine.v3", kind: "alert" },
      { label: "sarah@meridian approved", timestamp: "Jul 7, 8:55 AM ET", kind: "ok", actor: "sarah@meridian" },
      { label: "ACH settled", timestamp: "Jul 7, 9:02 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Amazon Web Services", refId: "aws" },
      { kind: "proposal", label: "AWS payment · Jul 7", refId: "settled-aws" },
      { kind: "invoice", label: "#AWS-2026-07", refId: "AWS-2026-07" },
    ],
    invoiceId: "AWS-2026-07",
    anchor: {
      status: "anchored",
      auditId: "AUD-3308FE",
      merkleRoot: "0x9f3a…c41e",
      baseTx: "0x72b1…8e2d",
      block: 21_847_932,
      anchoredAtLabel: "Jul 7, 9:04 AM ET",
      verifyHref: "https://basescan.org/tx/0x72b1…8e2d",
    },
    proposalId: "settled-aws",
  },

  /* 2 ─ Auto-approved by standing rule (Con Edison) ─────────────── */
  {
    id: "AUD-3F9P",
    eventType: "auto_approved",
    summary: "Con Edison Business cleared automatically by standing rule",
    counterparty: "Con Edison Business",
    amount: 486,
    actor: "system",
    occurredAtLabel: "Jul 3, 8:02 AM ET",
    occurredAtMs: 1782730067451,
    rowSubtitle: "$486 · system · AUD-3F9P",
    lifecycle: [
      { label: "Invoice Agent detected monthly utility invoice", timestamp: "Jul 3, 7:55 AM ET", kind: "ok" },
      { label: "Matched standing rule ‘Utility Bills’", timestamp: "Jul 3, 7:56 AM ET", note: "amount within cap ($1,000), vendor on allowlist", kind: "ok" },
      { label: "Auto-approved by system", timestamp: "Jul 3, 7:56 AM ET", kind: "ok" },
      { label: "ACH settled", timestamp: "Jul 3, 8:02 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Con Edison Business", refId: "conedison" },
      { kind: "rule", label: "Utility Bills", refId: "utility" },
      { kind: "invoice", label: "#CE-2026-0631", refId: "CE-2026-0631" },
    ],
    invoiceId: "CE-2026-0631",
    anchor: {
      status: "anchored",
      auditId: "AUD-3F9P",
      merkleRoot: "0x7c2e…b18a",
      baseTx: "0x44d9…f7c1",
      block: 21_847_830,
      anchoredAtLabel: "Jul 3, 8:04 AM ET",
      verifyHref: "https://basescan.org/tx/0x44d9…f7c1",
    },
  },

  /* 3 ─ Flagged ─ Bright Futures bank-detail change ─────────────── */
  {
    id: "AUD-7K2M",
    eventType: "flagged",
    summary: "Payment held. Bank details changed",
    counterparty: "Bright Futures Studio",
    amount: 3200,
    actor: "system",
    occurredAtLabel: "Jul 5, 2:11 PM ET",
    occurredAtMs: 1782816467451,
    rowSubtitle: "$3,200 · system · AUD-7K2M",
    lifecycle: [
      { label: "Invoice Agent proposed payment", timestamp: "Jul 5, 2:08 PM ET", kind: "ok" },
      { label: "Escalated to human. Routing number changed", timestamp: "Jul 5, 2:11 PM ET", note: "policy/ap.fraud.v2", kind: "alert" },
      { label: "Payment held pending verification", timestamp: "Jul 5, 2:11 PM ET", kind: "alert" },
    ],
    linked: [
      { kind: "vendor", label: "Bright Futures Studio", refId: "brightfutures" },
      { kind: "proposal", label: "Bright Futures payment · Jul 5", refId: "prop-bankchange" },
      { kind: "invoice", label: "#BFS-0426", refId: "BFS-0426" },
    ],
    invoiceId: "BFS-0426",
    anchor: {
      status: "anchored",
      auditId: "AUD-7K2M",
      merkleRoot: "0x3a8b…e5f2",
      baseTx: "0x21c7…9d4e",
      block: 21_847_902,
      anchoredAtLabel: "Jul 5, 2:15 PM ET",
      verifyHref: "https://basescan.org/tx/0x21c7…9d4e",
    },
  },

  /* 4 ─ Approved ─ Office lease ─────────────── */
  {
    id: "AUD-8A1R",
    eventType: "approved",
    summary: "Office lease payment approved",
    counterparty: "Brookside Commercial Properties",
    amount: 8400,
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 1, 9:00 AM ET",
    occurredAtMs: 1782384467451,
    rowSubtitle: "$8,400 · sarah@meridian · AUD-8A1R",
    lifecycle: [
      { label: "Invoice Agent proposed payment", timestamp: "Jun 30, 6:00 PM ET", kind: "ok" },
      { label: "Escalated to human. Above auto-pay limit", timestamp: "Jun 30, 6:01 PM ET", kind: "alert" },
      { label: "sarah@meridian approved", timestamp: "Jul 1, 8:55 AM ET", kind: "ok", actor: "sarah@meridian" },
      { label: "ACH settled", timestamp: "Jul 1, 9:00 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Brookside Commercial Properties", refId: "brookside" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-8A1R",
      merkleRoot: "0x6d1f…a3c8",
      baseTx: "0x55e2…b9f3",
      block: 21_847_712,
      anchoredAtLabel: "Jul 1, 9:02 AM ET",
      verifyHref: "https://basescan.org/tx/0x55e2…b9f3",
    },
  },

  /* 5 ─ Auto-approved ─ Adobe Creative Cloud ─────────────── */
  {
    id: "AUD-4E2N",
    eventType: "auto_approved",
    summary: "Adobe Creative Cloud (team plan) cleared automatically",
    counterparty: "Adobe",
    amount: 540,
    actor: "system",
    occurredAtLabel: "Jul 5, 9:14 AM ET",
    occurredAtMs: 1782816467451,
    rowSubtitle: "$540 · system · AUD-4E2N",
    lifecycle: [
      { label: "Invoice Agent detected recurring subscription", timestamp: "Jul 5, 9:12 AM ET", kind: "ok" },
      { label: "Auto-approved by standing rule", timestamp: "Jul 5, 9:13 AM ET", kind: "ok" },
      { label: "Card charged", timestamp: "Jul 5, 9:14 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Adobe", refId: "adobe" },
      { kind: "rule", label: "SaaS Subscriptions", refId: "saas" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-4E2N",
      merkleRoot: "0x2b5c…d7a1",
      baseTx: "0x18f4…e6c3",
      block: 21_847_901,
      anchoredAtLabel: "Jul 5, 9:16 AM ET",
      verifyHref: "https://basescan.org/tx/0x18f4…e6c3",
    },
  },

  /* 6 ─ Rule change ─ Threshold lowered ─────────────── */
  {
    id: "AUD-2D5V",
    eventType: "rule_change",
    summary: "Threshold lowered on ‘SaaS Subscriptions’ rule",
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 2, 4:22 PM ET",
    occurredAtMs: 1782557267451,
    rowSubtitle: "sarah@meridian · AUD-2D5V",
    lifecycle: [
      { label: "sarah@meridian edited rule threshold", timestamp: "Jul 2, 4:22 PM ET", note: "$500 → $600", kind: "ok" },
      { label: "Policy validator signed new config hash", timestamp: "Jul 2, 4:22 PM ET", kind: "ok" },
    ],
    linked: [
      { kind: "rule", label: "SaaS Subscriptions", refId: "saas" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-2D5V",
      merkleRoot: "0x1e8a…f4b9",
      baseTx: "0x09c3…a7e5",
      block: 21_847_805,
      anchoredAtLabel: "Jul 2, 4:24 PM ET",
      verifyHref: "https://basescan.org/tx/0x09c3…a7e5",
    },
  },

  /* 7 ─ Trust granted ─ New vendor verified ─────────────── */
  {
    id: "AUD-6G3W",
    eventType: "trust_granted",
    summary: "Trust granted to Meridian LLC",
    counterparty: "Meridian LLC",
    actor: "sarah@meridian",
    occurredAtLabel: "Jun 28, 11:47 AM ET",
    occurredAtMs: 1782038867451,
    rowSubtitle: "sarah@meridian · AUD-6G3W",
    lifecycle: [
      { label: "Meridian LLC flagged as new vendor", timestamp: "Jun 28, 10:15 AM ET", kind: "alert" },
      { label: "sarah@meridian verified identity and bank details", timestamp: "Jun 28, 11:30 AM ET", kind: "ok" },
      { label: "Trust granted. Vendor added to allowlist", timestamp: "Jun 28, 11:47 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Meridian LLC", refId: "meridian" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-6G3W",
      merkleRoot: "0x4f7d…c2a6",
      baseTx: "0x33b8…d1f7",
      block: 21_847_620,
      anchoredAtLabel: "Jun 28, 11:49 AM ET",
      verifyHref: "https://basescan.org/tx/0x33b8…d1f7",
    },
  },

  /* 8 ─ Trust revoked ─ Vendor removed ─────────────── */
  {
    id: "AUD-9H4X",
    eventType: "trust_revoked",
    summary: "Trust revoked from Apex Cleaning Co",
    counterparty: "Apex Cleaning Co",
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 4, 1:15 PM ET",
    occurredAtMs: 1782643667451,
    rowSubtitle: "sarah@meridian · AUD-9H4X",
    lifecycle: [
      { label: "Duplicate invoice detected", timestamp: "Jul 4, 1:10 PM ET", kind: "alert" },
      { label: "sarah@meridian paused rule and reviewed", timestamp: "Jul 4, 1:12 PM ET", kind: "ok" },
      { label: "Trust revoked. Vendor removed from allowlist", timestamp: "Jul 4, 1:15 PM ET", kind: "alert" },
    ],
    linked: [
      { kind: "vendor", label: "Apex Cleaning Co", refId: "apex" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-9H4X",
      merkleRoot: "0x5c2a…e8d3",
      baseTx: "0x41f7…b4c9",
      block: 21_847_880,
      anchoredAtLabel: "Jul 4, 1:17 PM ET",
      verifyHref: "https://basescan.org/tx/0x41f7…b4c9",
    },
  },

  /* 9 ─ Approved ─ Payroll ─────────────── */
  {
    id: "AUD-5J7Y",
    eventType: "approved",
    summary: "Payroll run for Engineering approved",
    counterparty: "J. Smith (Engineering)",
    amount: 5600,
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 2, 10:02 AM ET",
    occurredAtMs: 1782470867451,
    rowSubtitle: "$5,600 · sarah@meridian · AUD-5J7Y",
    lifecycle: [
      { label: "Invoice Agent proposed payroll run", timestamp: "Jul 2, 9:00 AM ET", kind: "ok" },
      { label: "Escalated to human. Above threshold", timestamp: "Jul 2, 9:01 AM ET", kind: "alert" },
      { label: "sarah@meridian approved", timestamp: "Jul 2, 9:55 AM ET", kind: "ok", actor: "sarah@meridian" },
      { label: "ACH sent to employee account", timestamp: "Jul 2, 10:02 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "employee", label: "J. Smith (Engineering)", refId: "j-smith" },
    ],
    anchor: {
      status: "pending_next_batch",
      auditId: "AUD-5J7Y",
    },
  },

  /* 10 ─ Auto-approved ─ Comcast Business ─────────────── */
  {
    id: "AUD-1B3T",
    eventType: "auto_approved",
    summary: "Comcast Business Fiber cleared automatically",
    counterparty: "Comcast Business",
    amount: 240,
    actor: "system",
    occurredAtLabel: "Jul 5, 6:46 AM ET",
    occurredAtMs: 1782816467451,
    rowSubtitle: "$240 · system · AUD-1B3T",
    lifecycle: [
      { label: "Invoice Agent detected monthly invoice", timestamp: "Jul 5, 6:45 AM ET", kind: "ok" },
      { label: "Auto-approved by standing rule", timestamp: "Jul 5, 6:45 AM ET", kind: "ok" },
      { label: "ACH settled", timestamp: "Jul 5, 6:46 AM ET", kind: "ok" },
    ],
    linked: [
      { kind: "vendor", label: "Comcast Business", refId: "comcast" },
      { kind: "rule", label: "Utility Bills", refId: "utility" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-1B3T",
      merkleRoot: "0x8d4e…b1a7",
      baseTx: "0x6a2c…f5d8",
      block: 21_847_891,
      anchoredAtLabel: "Jul 5, 6:48 AM ET",
      verifyHref: "https://basescan.org/tx/0x6a2c…f5d8",
    },
  },

  /* 11 ─ Rule change ─ New rule created ─────────────── */
  {
    id: "AUD-0C4U",
    eventType: "rule_change",
    summary: "New rule created: ‘Move extra cash to savings’",
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 6, 3:30 PM ET",
    occurredAtMs: 1782902867451,
    rowSubtitle: "sarah@meridian · AUD-0C4U",
    lifecycle: [
      { label: "sarah@meridian created rule from suggestion", timestamp: "Jul 6, 3:30 PM ET", kind: "ok" },
      { label: "Policy validator signed rule hash", timestamp: "Jul 6, 3:30 PM ET", kind: "ok" },
      { label: "Rule active", timestamp: "Jul 6, 3:30 PM ET", kind: "ok" },
    ],
    linked: [
      { kind: "rule", label: "Move extra cash to savings", refId: "sweep" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-0C4U",
      merkleRoot: "0x7e1b…a4f8",
      baseTx: "0x5c9d…e2b1",
      block: 21_847_950,
      anchoredAtLabel: "Jul 6, 3:32 PM ET",
      verifyHref: "https://basescan.org/tx/0x5c9d…e2b1",
    },
  },

  /* 12 ─ Flagged ─ New vendor threshold exceeded ─────────────── */
  {
    id: "AUD-3K8Q",
    eventType: "flagged",
    summary: "Payment held. New vendor exceeds threshold",
    counterparty: "Notion Team",
    amount: 240,
    actor: "system",
    occurredAtLabel: "Jun 30, 1:00 PM ET",
    occurredAtMs: 1782470867451,
    rowSubtitle: "$240 · system · AUD-3K8Q",
    lifecycle: [
      { label: "Invoice Agent detected renewal", timestamp: "Jun 30, 12:55 PM ET", kind: "ok" },
      { label: "Escalated to human. New seat count raised monthly cost", timestamp: "Jun 30, 1:00 PM ET", note: "policy/ap.threshold.v2", kind: "alert" },
      { label: "Payment held pending review", timestamp: "Jun 30, 1:00 PM ET", kind: "alert" },
    ],
    linked: [
      { kind: "vendor", label: "Notion Team", refId: "notion" },
      { kind: "proposal", label: "Subscription Renewal", refId: "prop-notion" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-3K8Q",
      merkleRoot: "0x6b3d…c7e1",
      baseTx: "0x48a2…f9b4",
      block: 21_847_710,
      anchoredAtLabel: "Jun 30, 1:02 PM ET",
      verifyHref: "https://basescan.org/tx/0x48a2…f9b4",
    },
  },

  /* 13 ─ Approved ─ USDC yield move ─────────────── */
  {
    id: "AUD-4M6Z",
    eventType: "approved",
    summary: "USDC moved to AAVE yield protocol",
    counterparty: "AAVE v3",
    amount: 3500,
    actor: "sarah@meridian",
    occurredAtLabel: "Jul 4, 6:28 PM ET",
    occurredAtMs: 1782643667451,
    rowSubtitle: "$3,500 · sarah@meridian · AUD-4M6Z",
    lifecycle: [
      { label: "Cash Agent detected idle operating balance", timestamp: "Jul 4, 6:25 PM ET", kind: "ok" },
      { label: "Escalated to human, above sweep threshold", timestamp: "Jul 4, 6:25 PM ET", kind: "alert" },
      { label: "sarah@meridian approved yield move", timestamp: "Jul 4, 6:27 PM ET", kind: "ok", actor: "sarah@meridian" },
      { label: "Funds deposited to AAVE v3", timestamp: "Jul 4, 6:28 PM ET", kind: "ok" },
    ],
    linked: [
      { kind: "protocol", label: "AAVE v3", refId: "aave" },
    ],
    anchor: {
      status: "anchored",
      auditId: "AUD-4M6Z",
      merkleRoot: "0x2e9c…d5a3",
      baseTx: "0x1b7f…c8e4",
      block: 21_847_875,
      anchoredAtLabel: "Jul 4, 6:30 PM ET",
      verifyHref: "https://basescan.org/tx/0x1b7f…c8e4",
    },
  },

  /* 11 - Collections Agent: auto-matched receivable -──────── */
  {
    id: "AUD-2R1M",
    eventType: "auto_approved",
    summary: "Meridian Partners deposit matched to open invoice",
    counterparty: "Meridian Partners",
    actor: "system",
    occurredAtLabel: "Jul 6, 10:45 AM ET",
    occurredAtMs: 1782902767451,
    rowSubtitle: "$8,200 \u00b7 system \u00b7 AUD-2R1M",
    lifecycle: [
      { label: "Collections Agent detected incoming deposit", timestamp: "Jul 6, 10:42 AM ET", kind: "ok" },
      { label: "Matched to open invoice #MP-2026-Q3", timestamp: "Jul 6, 10:43 AM ET", note: "$8,200", kind: "ok" },
      { label: "Auto-approved by standing rule", timestamp: "Jul 6, 10:45 AM ET", kind: "ok" },
    ],
    linked: [],
    proposalId: "settled-meridian",
    anchor: {
      status: "anchored",
      auditId: "AUD-2R1M",
      merkleRoot: "0x7a3f…e2b1",
      baseTx: "0x9c4d…a8f7",
      block: 21_847_915,
      anchoredAtLabel: "Jul 6, 10:47 AM ET",
      verifyHref: "https://basescan.org/tx/0x9c4d…a8f7",
    },
  },

  /* 12 - Close Agent: auto-reconciled bank/ledger pair -─────── */
  {
    id: "AUD-7P9Q",
    eventType: "auto_approved",
    summary: "Gusto payroll line auto-reconciled",
    counterparty: "Gusto",
    actor: "system",
    occurredAtLabel: "Jul 6, 2:10 PM ET",
    occurredAtMs: 1782913567451,
    rowSubtitle: "$4,200 \u00b7 system \u00b7 AUD-7P9Q",
    lifecycle: [
      { label: "Close Agent detected matched bank/ledger pair", timestamp: "Jul 6, 2:00 PM ET", kind: "ok" },
      { label: "Tolerance check passed", timestamp: "Jul 6, 2:05 PM ET", note: "$0.00 / $1.00", kind: "ok" },
      { label: "Auto-approved by standing rule", timestamp: "Jul 6, 2:10 PM ET", kind: "ok" },
    ],
    linked: [],
    proposalId: "settled-gusto-recon",
    anchor: {
      status: "anchored",
      auditId: "AUD-7P9Q",
      merkleRoot: "0x4e8b…c3d2",
      baseTx: "0x2f1a…b6e9",
      block: 21_847_920,
      anchoredAtLabel: "Jul 6, 2:12 PM ET",
      verifyHref: "https://basescan.org/tx/0x2f1a…b6e9",
    },
  },
];

/** The 4 auto-approved mock records (Adobe, Comcast, Meridian, Gusto) extracted
 *  from MOCK_AUDIT_RECORDS. These are always merged into AuditLogPage and used
 *  to derive Activity "Brain Did" items so they appear in both surfaces
 *  regardless of what brain-core returns. */
export const AUTO_APPROVED_AUDIT_RECORDS: AuditRecord[] = MOCK_AUDIT_RECORDS.filter(
  (r) => AUTO_APPROVED_IDS.has(r.id),
);
