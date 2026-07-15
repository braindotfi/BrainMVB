import type { Proposal, AccountSummary, AutoRule } from "./proposalTypes";

/* One Proposal per scenario so every UI branch is exercised by real data.
   Brain PROPOSES only - wording for money-movers is always
   "propose / recommend / draft", never "I paid" / "I will pay". */

// ponytail: ReviewPage/HomePage no longer read MOCK_PROPOSALS for the pending
// "Needs Review" queue (Phase 1a - replaced by a live brain-core read, see
// client/src/lib/brainQueue.ts). Kept here because mockAuditRecords.ts,
// mockDocuments.ts, and openProposalDetail.ts's allProposals() still resolve
// these ids for the Audit Log / document-viewer / dev consistency guards.
// Remove once Phase 1c (Audit Log ← live /audit/events) migrates those refs.
export const MOCK_PROPOSALS: Proposal[] = [
  /* 1 - invoice / clean routine ─────────────────────────────────────────── */
  {
    id: "prop-utilities",
    auditId: "AUD-7F3A21",
    agent: "invoice",
    surface: "individual",
    title: "Pay the office electricity bill?",
    rowSubtitle: "Con Edison Business · due Fri Jul 3",
    actionStatement: "Propose paying Con Edison Business $486",
    actionMeta: "from Operating ••4821 · due Fri Jul 3",
    executionLabel: "ACH initiates Thu PM",
    cancelDeadlineLabel: "cancel until 5:00 PM ET Thu",
    amount: 486,
    counterparty: "Con Edison Business",
    dueLabel: "Due Fri Jul 3",
    severity: "clean",
    reasonChips: [],
    rationale:
      "This is your usual monthly electricity bill for the headquarters. The amount is in line with the last six months and the vendor, account, and due cadence all match prior payments.",
    facts: [
      { label: "vendor", value: "Con Edison Business" },
      { label: "trailing avg (6mo)", value: "$472" },
      { label: "this invoice", value: "$486" },
      { label: "variance", value: "+3.0%" },
    ],
    evidence: [
      {
        kind: "invoice",
        title: "Invoice #CE-2026-0702",
        subtitle: "Billing period Jun 1 – Jun 30 · $486.00",
        documentId: "CE-2026-0631",
      },
      {
        kind: "prior_payment",
        title: "Last payment",
        subtitle: "Jun 2 · $471.20 · Operating ••4821",
      },
    ],
    confidence: {
      score: 0.97,
      band: "high",
      caveat: "Matches an established monthly pattern with no anomalies.",
    },
    whatHappensNext:
      "On approval, Brain sends this to the execution service. ACH initiates Thursday PM and settles next business day. You can cancel until 5:00 PM ET Thursday from this queue.",
    risk: "If this is wrong, the office electricity account could go past due and incur a late reconnection fee.",
    policy: {
      id: "ap.routine.v3",
      explanation: "recurring vendor under your auto-pay threshold",
      autoClearedOtherwise: true,
    },
    actions: {
      approve: { label: "Approve", sublabel: "send to execution" },
      reject: { label: "Reject", sublabel: "don't pay" },
      postpone: { label: "Postpone", sublabel: "decide tomorrow" },
    },
    status: "pending",
  },

  /* 2 - invoice / DUPLICATE ─────────────────────────────────────────────── */
  {
    id: "prop-duplicate",
    auditId: "AUD-91C0E4",
    agent: "invoice",
    surface: "individual",
    title: "Possible duplicate invoice from Apex Cleaning",
    rowSubtitle: "Apex Cleaning Co · flagged duplicate",
    actionStatement: "Propose paying Apex Cleaning Co $1,450",
    actionMeta: "from Operating ••4821 · due Wed Jul 8",
    executionLabel: "ACH initiates on approval",
    cancelDeadlineLabel: "cancel until 5:00 PM ET same day",
    amount: 1450,
    counterparty: "Apex Cleaning Co",
    dueLabel: "Due Wed Jul 8",
    severity: "warning",
    reasonChips: [
      { label: "Possible duplicate", severity: "warning" },
      { label: "Near-identical amount", severity: "info" },
    ],
    rationale:
      "A near-identical invoice from the same vendor was paid about 10 days ago. The amounts differ by a few dollars and the invoice numbers are sequential, which can happen with re-issued bills - but it can also mean you're being asked to pay twice.",
    facts: [
      { label: "this invoice", value: "$1,450.00 · #APX-3391" },
      { label: "paid Jun 19", value: "$1,448.00 · #APX-3382", severity: "warning" },
      { label: "days apart", value: "10 days", severity: "warning" },
      { label: "amount delta", value: "$2.00" },
    ],
    evidence: [
      {
        kind: "invoice",
        title: "Invoice #APX-3391 (new)",
        subtitle: "Issued Jun 29 · $1,450.00",
        documentId: "APX-3391",
      },
      {
        kind: "invoice",
        title: "Invoice #APX-3382 (paid)",
        subtitle: "Issued Jun 17 · $1,448.00 · paid Jun 19",
        documentId: "APX-3382",
      },
    ],
    confidence: {
      score: 0.58,
      band: "medium",
      caveat:
        "Could be a legitimate re-issue or a second billing cycle - worth a human glance before paying.",
    },
    whatHappensNext:
      "On approval, Brain sends this to the execution service and ACH initiates the same day. If it is a duplicate, reject it and Brain will note the vendor for closer matching next time.",
    risk: "If this is wrong, you pay Apex Cleaning twice for the same service and have to claw back $1,450.",
    policy: {
      id: "ap.dedupe.v2",
      explanation: "second near-identical invoice within 14 days",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve anyway", sublabel: "not a duplicate" },
      reject: { label: "Reject", sublabel: "not a duplicate - already paid" },
      postpone: { label: "Postpone", sublabel: "check with vendor" },
    },
    status: "pending",
  },

  /* 3 - invoice / BANK DETAILS CHANGED (fraud_anomaly) ──────────────────── */
  {
    id: "prop-bankchange",
    auditId: "AUD-7K2M",
    invoiceId: "BFS-0426",
    agent: "invoice",
    surface: "individual",
    title: "Bank details changed on a contractor invoice",
    rowSubtitle: "Bright Futures Studio · new account flagged",
    actionStatement: "Propose paying Bright Futures Studio $3,200",
    actionMeta: "from Operating ••4821 · due Mon Jul 6",
    executionLabel: "ACH held - not initiated",
    cancelDeadlineLabel: "nothing scheduled until you decide",
    amount: 3200,
    counterparty: "Bright Futures Studio",
    dueLabel: "Due Mon Jul 6",
    severity: "danger",
    reasonChips: [
      { label: "Bank details changed", severity: "danger" },
      { label: "New account first seen today", severity: "danger" },
      { label: "Fraud check", severity: "warning" },
    ],
    rationale:
      "The April design retainer matches your usual contractor payment, but the destination bank account is different from every prior payment to this vendor and was first seen on the invoice today. Changed payout details are the most common vector for invoice-redirect fraud.",
    facts: [
      { label: "vendor", value: "Bright Futures Studio" },
      { label: "prior account", value: "Wells Fargo ••6610" },
      { label: "new account", value: "Chase ••2087", severity: "danger" },
      { label: "first seen", value: "today", severity: "danger" },
      { label: "prior payments to ••6610", value: "11" },
    ],
    evidence: [
      {
        kind: "invoice",
        title: "Invoice #BFS-0426",
        subtitle: "April retainer · $3,200.00 · new payout ••2087",
        documentId: "BFS-0426",
      },
      {
        kind: "prior_payment",
        title: "Established payout history",
        subtitle: "11 payments to Wells Fargo ••6610",
        documentId: "BFS-PRIOR-0326",
      },
      {
        kind: "contract",
        title: "Master services agreement",
        subtitle: "Signed Jul 2025 · remittance to ••6610",
      },
    ],
    confidence: {
      score: 0.34,
      band: "low",
      caveat:
        "Brain cannot confirm the new account is genuine - verify with the vendor through a known contact before paying.",
    },
    whatHappensNext:
      "Nothing is scheduled. If you verify first, Brain drafts a confirmation to the vendor's on-file contact and parks the payment until you resolve it - no funds move. If you approve, the execution service pays the NEW account.",
    risk: "If this is wrong, $3,200 goes to a fraudster's account and is effectively unrecoverable.",
    policy: {
      id: "ap.fraud.v2",
      explanation: "payout bank details changed since last payment",
      autoClearedOtherwise: true,
    },
    actions: {
      approve: { label: "Approve to new account", sublabel: "I confirmed it's real" },
      reject: { label: "Reject", sublabel: "looks fraudulent" },
      postpone: { label: "Postpone", sublabel: "decide tomorrow" },
      verifyFirst: {
        label: "Verify with vendor first",
        sublabel: "draft a confirmation - no funds move",
      },
    },
    status: "pending",
  },

  /* 4 - invoice / AMOUNT ANOMALY ────────────────────────────────────────── */
  {
    id: "prop-amount",
    auditId: "AUD-2B7710",
    agent: "invoice",
    surface: "individual",
    title: "Comcast bill is higher than usual",
    rowSubtitle: "Comcast Business · +38% vs average",
    actionStatement: "Propose paying Comcast Business $1,228",
    actionMeta: "from Operating ••4821 · due Thu Jul 9",
    executionLabel: "ACH initiates on approval",
    cancelDeadlineLabel: "cancel until 5:00 PM ET same day",
    amount: 1228,
    counterparty: "Comcast Business",
    dueLabel: "Due Thu Jul 9",
    severity: "warning",
    reasonChips: [
      { label: "Amount anomaly", severity: "warning" },
      { label: "+38% vs trailing avg", severity: "warning" },
    ],
    rationale:
      "This month's Comcast Business bill is 38% above the trailing 12-month average. It may be a one-time equipment or overage charge, or a billing error. The vendor and account are unchanged.",
    facts: [
      { label: "trailing avg (12mo)", value: "$890" },
      { label: "this invoice", value: "$1,228", severity: "warning" },
      { label: "variance", value: "+38.0%", severity: "warning" },
      { label: "vendor / account", value: "unchanged" },
    ],
    evidence: [
      {
        kind: "invoice",
        title: "Invoice #CMB-118827",
        subtitle: "Jun service + $338 equipment line · $1,228.00",
      },
      {
        kind: "forecast",
        title: "Expected range",
        subtitle: "$840 – $940 based on trailing 12 months",
      },
    ],
    confidence: {
      score: 0.71,
      band: "medium",
      caveat: "The extra charge looks like a one-time equipment line, but Brain can't confirm it was authorized.",
    },
    whatHappensNext:
      "On approval, Brain sends this to the execution service and ACH initiates the same day. If the overage is unexpected, reject it and Brain will draft a billing dispute for your review.",
    risk: "If this is wrong, you overpay $338 on a billing error that's tedious to recover.",
    policy: {
      id: "ap.variance.v1",
      explanation: "amount exceeds 25% above trailing average",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve", sublabel: "the charge is expected" },
      reject: { label: "Reject", sublabel: "dispute the overage" },
      postpone: { label: "Postpone", sublabel: "ask the provider" },
    },
    status: "pending",
  },

  /* 5 - cash / TREASURY SWEEP ───────────────────────────────────────────── */
  {
    id: "prop-sweep",
    auditId: "AUD-5E0C93",
    agent: "cash",
    surface: "individual",
    title: "Move idle cash into treasury yield?",
    rowSubtitle: "Operating ••4821 → Treasury (T-Bills)",
    actionStatement: "Recommend sweeping $100,000 into treasury yield",
    actionMeta: "from Operating ••4821 → Mercury Treasury · earns ~4.9%",
    executionLabel: "transfer initiates next business day",
    cancelDeadlineLabel: "cancel until 4:00 PM ET",
    amount: 100000,
    counterparty: "Mercury Treasury (T-Bills)",
    dueLabel: "When you confirm",
    severity: "info",
    reasonChips: [{ label: "Idle cash above target", severity: "info" }],
    rationale:
      "Your operating balance is well above the 3-month buffer you set, even after covering everything currently pending. Sweeping the excess into short-term treasuries earns yield while leaving a comfortable cushion. The account is not drained.",
    facts: [
      { label: "total cash", value: "$192,000" },
      { label: "3-month buffer", value: "$72,000" },
      { label: "pending AP", value: "$10,514" },
      { label: "sweepable", value: "$109,486" },
    ],
    evidence: [
      {
        kind: "forecast",
        title: "90-day cash forecast",
        subtitle: "Operating stays above buffer in every week",
      },
      {
        kind: "ledger_entry",
        title: "Operating ••4821 balance",
        subtitle: "$192,000.00 available today",
      },
    ],
    confidence: {
      score: 0.88,
      band: "high",
      caveat: "Forecast assumes no large unplanned outflow in the next 90 days.",
    },
    whatHappensNext:
      "On approval, Brain sends the sweep to the execution service; the transfer initiates next business day. You can cancel until 4:00 PM ET. Funds remain in your name at Mercury Treasury.",
    risk: "If this is wrong and a large bill lands unexpectedly, you may need to pull funds back from treasury, which can take 1–2 business days.",
    policy: {
      id: "cash.sweep.v4",
      explanation: "discretionary cash movement always needs sign-off",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve sweep", sublabel: "move $100,000 to treasury" },
      reject: { label: "Reject", sublabel: "keep cash in operating" },
      postpone: { label: "Postpone", sublabel: "revisit next week" },
    },
    status: "pending",
    sweepMath: {
      totalCash: 192000,
      pendingAP: 10514,
      bufferMonths: 3,
      bufferAmount: 72000,
      sweepAmount: 100000,
      operatingAfter: 92000,
      runwayAfterMonths: 3.8,
    },
  },

  /* 6 - collections / OVERDUE RECEIVABLE ────────────────────────────────── */
  {
    id: "prop-collections",
    auditId: "AUD-A1F230",
    agent: "collections",
    surface: "individual",
    title: "Northstar Design invoice is 18 days overdue",
    rowSubtitle: "Receivable · draft a reminder",
    actionStatement: "Draft a payment reminder for Northstar Design ($6,200)",
    actionMeta: "Invoice #INV-2026-041 · 18 days past due",
    executionLabel: "reminder saved as a draft for your review",
    cancelDeadlineLabel: "nothing sends without you",
    amount: 6200,
    counterparty: "Northstar Design",
    dueLabel: "Was due Jun 11",
    severity: "warning",
    reasonChips: [
      { label: "18 days overdue", severity: "warning" },
      { label: "Reminder only - won't send", severity: "info" },
    ],
    rationale:
      "Northstar Design's invoice passed net-30 eighteen days ago with no payment and no reply to the last statement. A gentle reminder usually recovers these without escalation. This is money owed TO you - nothing leaves your account.",
    facts: [
      { label: "invoice", value: "#INV-2026-041 · $6,200" },
      { label: "terms", value: "Net 30" },
      { label: "days overdue", value: "18", severity: "warning" },
      { label: "prior reminders", value: "1 (statement, Jun 25)" },
    ],
    evidence: [
      {
        kind: "invoice",
        title: "Invoice #INV-2026-041",
        subtitle: "Issued May 12 · $6,200.00 · net 30",
      },
      {
        kind: "transaction",
        title: "No matching deposit",
        subtitle: "No payment received against this invoice",
      },
    ],
    confidence: {
      score: 0.8,
      band: "high",
      caveat: "A first reminder typically resolves overdue receivables of this size.",
    },
    whatHappensNext:
      "Brain drafts a reminder for your review and does not send it. You read it, edit if you like, and choose whether to send - no message goes out automatically.",
    risk: "If this is wrong (e.g. payment already arrived), the reminder could annoy a paying customer - which is why it stays a draft until you send it.",
    policy: {
      id: "ar.dunning.v1",
      explanation: "outbound customer messages always need review",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve draft", sublabel: "ready it to send" },
      reject: { label: "Reject", sublabel: "don't chase yet" },
      postpone: { label: "Postpone", sublabel: "wait a few more days" },
    },
    status: "pending",
  },

  /* 7 - close / RECONCILIATION DISCREPANCY ──────────────────────────────── */
  {
    id: "prop-recon",
    auditId: "AUD-6C9D17",
    agent: "close",
    surface: "individual",
    title: "A bank line doesn't match the ledger",
    rowSubtitle: "Reconciliation · propose a correcting entry",
    actionStatement: "Propose a correcting entry of $184.00",
    actionMeta: "Operating ••4821 · close period Jun",
    executionLabel: "draft journal entry for your review",
    cancelDeadlineLabel: "nothing posts without you",
    amount: 184,
    counterparty: "General Ledger",
    dueLabel: "June close",
    severity: "warning",
    reasonChips: [
      { label: "Out of tolerance", severity: "warning" },
      { label: "Draft entry - won't post", severity: "info" },
    ],
    rationale:
      "A bank transaction of $1,024.00 doesn't match the ledger entry of $1,208.00 recorded against the same vendor, a $184.00 gap that's outside your $5 close tolerance. It looks like a partial refund that wasn't booked. Brain proposes a correcting entry for your review.",
    facts: [
      { label: "bank line", value: "$1,024.00 · Jun 21" },
      { label: "ledger entry", value: "$1,208.00 · Jun 20" },
      { label: "discrepancy", value: "$184.00", severity: "warning" },
      { label: "tolerance", value: "$5.00" },
    ],
    evidence: [
      {
        kind: "transaction",
        title: "Bank transaction",
        subtitle: "Jun 21 · $1,024.00 · Operating ••4821",
        documentId: "TXN-2026-0621",
      },
      {
        kind: "ledger_entry",
        title: "Ledger entry #JE-2026-0612",
        subtitle: "Jun 20 · $1,208.00 · same vendor",
      },
    ],
    confidence: {
      score: 0.66,
      band: "medium",
      caveat: "The $184 gap matches a likely partial refund, but the original credit memo isn't attached.",
    },
    whatHappensNext:
      "Brain drafts the correcting journal entry for your review and does not post it. You approve it into the close, or reject it if the original figure was right.",
    risk: "If this is wrong, posting an incorrect adjustment would misstate the June close and have to be reversed.",
    policy: {
      id: "close.recon.v2",
      explanation: "ledger adjustments always need sign-off",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve entry", sublabel: "post into June close" },
      reject: { label: "Reject", sublabel: "ledger was correct" },
      postpone: { label: "Postpone", sublabel: "investigate first" },
    },
    status: "pending",
  },

  /* 8 - invoice / BUSINESS SURFACE (batchApprovable) ────────────────────── */
  {
    id: "prop-aws",
    auditId: "AUD-9E22B4",
    agent: "invoice",
    surface: "business",
    title: "Approve the monthly AWS bill?",
    rowSubtitle: "Amazon Web Services · cloud infrastructure",
    actionStatement: "Propose paying Amazon Web Services $4,150",
    actionMeta: "from Operating ••4821 · due Fri Aug 7",
    executionLabel: "ACH initiates Mon AM",
    cancelDeadlineLabel: "cancel until 9:00 AM ET Mon",
    amount: 4150,
    counterparty: "Amazon Web Services",
    dueLabel: "Due Fri Aug 7",
    severity: "clean",
    reasonChips: [],
    rationale:
      "Your monthly cloud infrastructure bill, in line with the trailing average and committed-use pricing. Vendor, account, and cadence all match prior payments. It clears for batch approval with the rest of your routine AP.",
    facts: [
      { label: "vendor", value: "Amazon Web Services" },
      { label: "trailing avg (6mo)", value: "$4,090" },
      { label: "this invoice", value: "$4,150" },
      { label: "variance", value: "+1.5%" },
    ],
    evidence: [
      {
        kind: "invoice",
        title: "Invoice #AWS-2026-08",
        subtitle: "Jul usage · $4,150.00 · committed-use discount applied",
        documentId: "AWS-2026-07",
      },
      {
        kind: "prior_payment",
        title: "Last payment",
        subtitle: "Jul 7 · $4,150.00 · Operating ••4821",
      },
    ],
    confidence: {
      score: 0.95,
      band: "high",
      caveat: "Routine cloud spend within your committed-use envelope.",
    },
    whatHappensNext:
      "On approval, Brain sends this to the execution service and ACH initiates Monday AM. You can cancel until 9:00 AM ET Monday, or batch-approve it with your other routine AP.",
    risk: "If this is wrong, an unpaid AWS bill could throttle or suspend production infrastructure.",
    policy: {
      id: "ap.routine.v3",
      explanation: "recurring vendor above your batch threshold",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve", sublabel: "send to execution" },
      reject: { label: "Reject", sublabel: "don't pay" },
      postpone: { label: "Postpone", sublabel: "decide tomorrow" },
    },
    status: "pending",
    batchApprovable: true,
    policyThreshold: "Auto-clears under $2,500 · this is above your batch threshold",
  },
];

/* pendingAPTotal MUST equal the sum of the money-mover (AP) proposals shown:
   Con Edison 486 + Apex 1,450 + Bright Futures 3,200 + Comcast 1,228 + AWS 4,150
   = 10,514. The sweep, collections, and reconciliation items are not AP outflows. */
export const ACCOUNT_SUMMARY: AccountSummary = {
  totalCash: 192000,
  runwayMonths: 8,
  pendingAPTotal: 10514,
};

/* ─────────────────────────────────────────────────────────────────────────────
   AUTO-HANDLED - payments Brain ALREADY auto-approved + settled under a standing
   rule the user created. Tapping one opens a RECEIPT (a record), not a decision.
   Past-tense money-mover wording ("Paid …") is correct ONLY here. The review
   page derives the banner count + total from THIS array - never hardcode them.
   ───────────────────────────────────────────────────────────────────────────── */
export const UTILITY_RULE: AutoRule = {
  id: "utility",
  kind: "automation",
  name: "Auto-clear utility bills",
  summary: "Trusted vendors · utilities · under $1,000 · no bank-detail change",
  createdLabel: "You created this Jun 12 · cleared 7 payments since",
  policyId: "policy/ap.tolerance.v3",
  active: true,
  agent: "invoice",
  category: "utilities",
  cap: 1000,
  allowlist: ["Con Edison Business", "NYC DEP", "National Grid"],
  scopeSummary: "trusted utility vendors under $1,000",
};

export const SAAS_RULE: AutoRule = {
  id: "saas",
  kind: "automation",
  name: "Auto-clear software subscriptions",
  summary: "Known SaaS vendors · recurring · under $500 · matched prior charge",
  createdLabel: "You created this May 3 · cleared 19 payments since",
  policyId: "policy/ap.saas.v2",
  active: true,
  agent: "invoice",
  category: "software subscriptions",
  cap: 500,
  allowlist: ["Notion", "GitHub", "Slack", "Figma", "1Password"],
  scopeSummary: "known SaaS vendors under $500",
};

export const LEASE_RULE: AutoRule = {
  id: "lease",
  kind: "automation",
  name: "Auto-clear fixed rent and lease",
  summary: "Contracted amount · same payee · same account · monthly cadence",
  createdLabel: "You created this Feb 1 · cleared 5 payments since",
  policyId: "policy/ap.fixed.v1",
  active: true,
  agent: "invoice",
  category: "rent and lease",
  cap: 10000,
  allowlist: ["Hudson Yards Property"],
  scopeSummary: "the contracted lease payee on a monthly cadence",
};

export const PAYROLL_RULE: AutoRule = {
  id: "payroll",
  kind: "automation",
  name: "Auto-clear payroll and benefits",
  summary: "Approved provider · scheduled run · matched headcount · under cap",
  createdLabel: "You created this Jan 8 · cleared 12 payments since",
  policyId: "policy/ap.payroll.v4",
  active: true,
  agent: "invoice",
  category: "payroll and benefits",
  cap: 5000,
  allowlist: ["Gusto"],
  scopeSummary: "the approved payroll provider on scheduled runs under $5,000",
};

export const CASH_SWEEP_RULE: AutoRule = {
  id: "cash-sweep",
  kind: "automation",
  name: "Auto-sweep idle cash to treasury",
  summary: "Idle cash above 3-month buffer · under $50,000 · next-day settle",
  createdLabel: "You created this Mar 15 · swept 4 times since",
  policyId: "policy/cash.sweep.v4",
  active: true,
  agent: "cash",
  category: "treasury sweep",
  cap: 50000,
  allowlist: ["Mercury Treasury (T-Bills)"],
  scopeSummary: "idle operating cash above buffer under $50,000",
};

export const COLLECTIONS_RULE: AutoRule = {
  id: "collections-match",
  kind: "automation",
  name: "Auto-match deposits to invoices",
  summary: "Known customer · matched amount · open invoice · no dispute flag",
  createdLabel: "You created this Apr 1 · matched 8 deposits since",
  policyId: "policy/ar.match.v2",
  active: true,
  agent: "collections",
  category: "receivables matching",
  cap: 10000,
  allowlist: ["Northstar Design", "Meridian Partners"],
  scopeSummary: "matched customer deposits to open invoices under $10,000",
};

export const CLOSE_RULE: AutoRule = {
  id: "close-recon",
  kind: "automation",
  name: "Auto-reconcile matched bank/ledger pairs",
  summary: "Same vendor · same date · within $1 tolerance · no manual flag",
  createdLabel: "You created this May 10 · reconciled 23 lines since",
  policyId: "policy/close.recon.v2",
  active: true,
  agent: "close",
  category: "bank reconciliation",
  cap: 1000,
  allowlist: ["Gusto", "Con Edison Business", "Mercury Treasury (T-Bills)"],
  scopeSummary: "matched bank/ledger pairs within tolerance",
};

function autoHandled(p: {
  id: string;
  auditId: string;
  agent: Proposal["agent"];
  surface?: Proposal["surface"];
  title: string;
  counterparty: string;
  amount: number;
  pastTenseStatement: string;
  settledMeta: string;
  rowSubtitle: string;
  rationale: string;
  clearedBecause: Proposal["clearedBecause"];
  rule: Proposal["rule"];
  timeline: Proposal["handoffTimeline"];
}): Proposal {
  return {
    id: p.id,
    auditId: p.auditId,
    agent: p.agent,
    surface: p.surface ?? "business",
    title: p.title,
    rowSubtitle: p.rowSubtitle,
    actionStatement: p.pastTenseStatement,
    actionMeta: p.settledMeta,
    executionLabel: "settled by execution service",
    cancelDeadlineLabel: "already settled",
    amount: p.amount,
    counterparty: p.counterparty,
    severity: "clean",
    reasonChips: [],
    rationale: p.rationale,
    evidence: [],
    confidence: { score: 0.99, band: "high", caveat: "Matched your standing rule with no anomalies." },
    whatHappensNext: "Already settled - nothing further to do.",
    risk: "",
    policy: {
      id: p.rule!.policyId,
      explanation: p.rule!.summary,
      autoClearedOtherwise: true,
    },
    actions: {
      approve: { label: "Approve" },
      reject: { label: "Reject" },
      postpone: { label: "Postpone" },
    },
    status: "auto_handled",
    pastTenseStatement: p.pastTenseStatement,
    settledMeta: p.settledMeta,
    handoffTimeline: p.timeline,
    clearedBecause: p.clearedBecause,
    rule: p.rule,
  };
}

function settledTimeline(proposedAt: string, approvedAt: string, settledAt: string): Proposal["handoffTimeline"] {
  return [
    { label: "Brain proposed the payment", timestamp: proposedAt, done: true },
    {
      label: "Approved automatically by your rule",
      timestamp: approvedAt,
      note: "no human step",
      done: true,
    },
    {
      label: "Execution service settled it",
      timestamp: settledAt,
      note: "Brain never held the funds",
      done: true,
    },
  ];
}

/* A human-approved, executed proposal - the settled counterpart of an item that
   was escalated above threshold and signed off by a person (not a standing
   rule). Retained as a resolution target for openProposalDetail (SettledRecordCard
   was removed in the Phase 8 cleanup). */
function settledApproved(p: {
  id: string;
  auditId: string;
  agent: Proposal["agent"];
  title: string;
  counterparty: string;
  amount: number;
  pastTenseStatement: string;
  settledMeta: string;
  rowSubtitle: string;
  rationale: string;
  facts: Proposal["facts"];
  timeline: Proposal["handoffTimeline"];
}): Proposal {
  return {
    id: p.id,
    auditId: p.auditId,
    agent: p.agent,
    surface: "business",
    title: p.title,
    rowSubtitle: p.rowSubtitle,
    actionStatement: p.pastTenseStatement,
    actionMeta: p.settledMeta,
    executionLabel: "settled by execution service",
    cancelDeadlineLabel: "already settled",
    amount: p.amount,
    counterparty: p.counterparty,
    severity: "clean",
    reasonChips: [],
    rationale: p.rationale,
    facts: p.facts,
    evidence: [],
    confidence: { score: 1, band: "high", caveat: "You reviewed and approved this before it settled." },
    whatHappensNext: "Already settled - nothing further to do.",
    risk: "",
    policy: {
      id: "manual.human_approval",
      explanation: "Escalated above threshold and approved by a human before the execution service settled it.",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve" },
      reject: { label: "Reject" },
      postpone: { label: "Postpone" },
    },
    status: "executed",
    pastTenseStatement: p.pastTenseStatement,
    settledMeta: p.settledMeta,
    handoffTimeline: p.timeline,
  };
}

/* ── Settled record twins ──────────────────────────────────────────────────────
   The Adobe / Comcast / payroll / USDC settled proposals. No longer opened via a
   UI row (Activity is live via useBrainAuditRecords; SettledRecordCard removed in
   Phase 8) - RETAINED as resolution targets for openProposalDetail's allProposals()
   so the document viewer's coherence chain and the mock audit-record proposal links
   still resolve. Reconciled by auditId with their twins in mockAuditRecords.ts
   (AUD-4E2N / AUD-1B3T / AUD-5J7Y / AUD-4M6Z / AUD-2R1M / AUD-7P9Q). */

export const ADOBE_SETTLED: Proposal = autoHandled({
  id: "settled-adobe",
  auditId: "AUD-4E2N",
  agent: "invoice",
  title: "Adobe Creative Cloud (team plan)",
  counterparty: "Adobe",
  amount: 540,
  pastTenseStatement: "Paid Adobe $540",
  settledMeta: "on card ••4821 · settled Jul 5, 9:14 AM ET · you set a rule that allows this",
  rowSubtitle: "Adobe · settled 9:14 AM",
  rationale:
    "Your recurring Creative Cloud team subscription. Vendor and charge matched the prior month exactly, so your software-subscriptions rule cleared it without asking.",
  clearedBecause: [
    { label: "vendor", value: "Adobe · known SaaS" },
    { label: "this charge", value: "$540" },
    { label: "prior charge", value: "$540 · matched" },
    { label: "under limit", value: "$540 / $600", severity: "clean" },
    { label: "card on file", value: "unchanged" },
  ],
  rule: SAAS_RULE,
  timeline: settledTimeline("Jul 5, 9:12 AM ET", "Jul 5, 9:13 AM ET", "Jul 5, 9:14 AM ET"),
});

export const MERIDIAN_RECEIVABLE_SETTLED: Proposal = autoHandled({
  id: "settled-meridian",
  auditId: "AUD-2R1M",
  agent: "collections",
  title: "Matched deposit to Meridian Partners",
  counterparty: "Meridian Partners",
  amount: 8200,
  pastTenseStatement: "Matched Meridian Partners deposit to invoice",
  settledMeta: "Wiring Transfer ••9921 · settled Jul 6, 10:45 AM ET · you set a rule that allows this",
  rowSubtitle: "Meridian Partners · matched 10:45 AM",
  rationale:
    "A deposit from a known customer matched an open invoice amount, date, and reference number exactly. Brain applied it without asking.",
  clearedBecause: [
    { label: "customer", value: "Meridian Partners · known" },
    { label: "deposit", value: "$8,200" },
    { label: "open invoice", value: "#MP-2026-Q3 · $8,200 · matched" },
    { label: "under limit", value: "$8,200 / $10,000", severity: "clean" },
    { label: "no dispute flag", value: "unchanged" },
  ],
  rule: COLLECTIONS_RULE,
  timeline: settledTimeline("Jul 6, 10:42 AM ET", "Jul 6, 10:43 AM ET", "Jul 6, 10:45 AM ET"),
});

export const GUSTO_RECON_SETTLED: Proposal = autoHandled({
  id: "settled-gusto-recon",
  auditId: "AUD-7P9Q",
  agent: "close",
  title: "Bank/ledger pair matched for Gusto",
  counterparty: "Gusto",
  amount: 4200,
  pastTenseStatement: "Reconciled Gusto payroll line",
  settledMeta: "ACH ••4821 · settled Jul 6, 2:10 PM ET · you set a rule that allows this",
  rowSubtitle: "Gusto · reconciled 2:10 PM",
  rationale:
    "The Gusto payroll ACH on Jul 6 matched the ledger entry to the penny and within the same day. Brain marked it reconciled without asking.",
  clearedBecause: [
    { label: "vendor", value: "Gusto · approved payroll provider" },
    { label: "bank line", value: "$4,200.00 · Jul 6" },
    { label: "ledger entry", value: "$4,200.00 · Jul 6 · matched" },
    { label: "tolerance", value: "$0.00 / $1.00", severity: "clean" },
    { label: "no manual flag", value: "unchanged" },
  ],
  rule: CLOSE_RULE,
  timeline: settledTimeline("Jul 6, 2:00 PM ET", "Jul 6, 2:05 PM ET", "Jul 6, 2:10 PM ET"),
});

export const COMCAST_SETTLED: Proposal = autoHandled({
  id: "settled-comcast",
  auditId: "AUD-1B3T",
  agent: "invoice",
  title: "Comcast Business Fiber",
  counterparty: "Comcast Business",
  amount: 240,
  pastTenseStatement: "Paid Comcast $240",
  settledMeta: "from Operating ••4821 · settled Jul 5, 6:46 AM ET · you set a rule that allows this",
  rowSubtitle: "Comcast Business · settled 6:46 AM",
  rationale:
    "Your monthly business internet, flat-rate plan matching every prior month. Cleared under your utility-bills rule.",
  clearedBecause: [
    { label: "vendor", value: "Comcast Business · trusted" },
    { label: "this invoice", value: "$240" },
    { label: "plan rate", value: "$240 · matched" },
    { label: "under limit", value: "$240 / $1,000", severity: "clean" },
    { label: "bank details", value: "unchanged" },
  ],
  rule: UTILITY_RULE,
  timeline: settledTimeline("Jul 5, 6:45 AM ET", "Jul 5, 6:45 AM ET", "Jul 5, 6:46 AM ET"),
});

export const PAYROLL_SETTLED: Proposal = settledApproved({
  id: "settled-payroll",
  auditId: "AUD-5J7Y",
  agent: "invoice",
  title: "Payroll run - J. Smith (Engineering)",
  counterparty: "J. Smith (Engineering)",
  amount: 5600,
  pastTenseStatement: "Ran payroll for J. Smith (Engineering)",
  settledMeta: "ACH to Wells Fargo · you approved Jul 2, 9:55 AM · settled Jul 2, 10:02 AM ET",
  rowSubtitle: "J. Smith (Engineering) · settled 10:02 AM",
  rationale:
    "Scheduled engineering payroll run. It exceeded your auto-approval threshold, so Brain escalated it for your sign-off before the execution service sent the ACH.",
  facts: [
    { label: "employee", value: "J. Smith (Engineering)" },
    { label: "amount", value: "$5,600" },
    { label: "destination", value: "Wells Fargo" },
    { label: "approval", value: "above threshold · human", severity: "info" },
  ],
  timeline: [
    { label: "Invoice Agent proposed payroll run", timestamp: "Jul 2, 9:00 AM ET", done: true },
    { label: "Escalated to human - above threshold", timestamp: "Jul 2, 9:01 AM ET", done: true },
    { label: "You approved", timestamp: "Jul 2, 9:55 AM ET", done: true },
    { label: "ACH sent to employee account", timestamp: "Jul 2, 10:02 AM ET", note: "Brain never held the funds", done: true },
  ],
});

export const USDC_SWEEP_SETTLED: Proposal = settledApproved({
  id: "settled-usdc",
  auditId: "AUD-4M6Z",
  agent: "cash",
  title: "USDC moved to AAVE yield protocol",
  counterparty: "AAVE v3",
  amount: 3500,
  pastTenseStatement: "Moved $3,500 USDC to AAVE v3",
  settledMeta: "from Operating ••4821 · you approved Jul 4, 6:27 PM · settled Jul 4, 6:28 PM ET",
  rowSubtitle: "AAVE v3 · settled 6:28 PM",
  rationale:
    "Your operating balance sat above the idle-cash threshold. Brain proposed moving the excess into AAVE v3 to earn yield; because it was above your sweep limit, it asked you first.",
  facts: [
    { label: "protocol", value: "AAVE v3" },
    { label: "amount", value: "$3,500" },
    { label: "current APY", value: "4.5%" },
    { label: "approval", value: "above sweep limit · human", severity: "info" },
  ],
  timeline: [
    { label: "Cash Agent detected idle operating balance", timestamp: "Jul 4, 6:25 PM ET", done: true },
    { label: "Escalated to human - above sweep threshold", timestamp: "Jul 4, 6:25 PM ET", done: true },
    { label: "You approved yield move", timestamp: "Jul 4, 6:27 PM ET", done: true },
    { label: "Funds deposited to AAVE v3", timestamp: "Jul 4, 6:28 PM ET", note: "Brain never held the funds", done: true },
  ],
});

/* ── Human-approved, executed AWS bill (audit twin AUD-3308FE, invoice AWS-2026-07)
   The PRIOR month's cloud bill. It exceeded the business-surface batch
   auto-approval limit, so Brain escalated it and sarah@meridian signed off before
   the execution service settled the ACH. This is the SETTLED counterpart the
   AUD-3308FE audit record + AWS-2026-07 paid invoice point at - distinct from the
   still-pending current-cycle prop-aws in the review queue. Reachable by id from
   the Audit Log's linked-evidence deep-link, not rendered in the live queue. */
export const AWS_SETTLED: Proposal = {
  ...settledApproved({
    id: "settled-aws",
    auditId: "AUD-3308FE",
    agent: "invoice",
    title: "Amazon Web Services - monthly cloud bill",
    counterparty: "Amazon Web Services",
    amount: 4150,
    pastTenseStatement: "Paid Amazon Web Services $4,150",
    settledMeta: "from Operating ••4821 · you approved Jul 7, 8:55 AM · settled Jul 7, 9:02 AM ET",
    rowSubtitle: "Amazon Web Services · settled 9:02 AM",
    rationale:
      "Your monthly cloud infrastructure bill. It exceeded the business-surface batch auto-approval limit, so Brain escalated it for your sign-off before the execution service sent the ACH.",
    facts: [
      { label: "vendor", value: "Amazon Web Services" },
      { label: "amount", value: "$4,150" },
      { label: "destination", value: "ACH ••9021" },
      { label: "approval", value: "above batch limit · human", severity: "info" },
    ],
    timeline: [
      { label: "Invoice Agent proposed payment", timestamp: "Jul 6, 3:14 PM ET", done: true },
      { label: "Escalated to human - above auto-pay limit", timestamp: "Jul 6, 3:14 PM ET", done: true },
      { label: "You approved", timestamp: "Jul 7, 8:55 AM ET", done: true },
      { label: "Execution service settled the ACH", timestamp: "Jul 7, 9:02 AM ET", note: "Brain never held the funds", done: true },
    ],
  }),
  invoiceId: "AWS-2026-07",
};

/* ── Flagged SaaS renewal held for review (audit twin AUD-3K8Q) ────────────────
   The Jun 30 Notion renewal Brain HELD because a higher seat count pushed the
   monthly charge above the threshold it holds new/changed subscriptions at. It's
   the "proposal" linked ref (prop-notion) on the flagged audit record. Kept out
   of the live "today" review queue (it's a past, already-surfaced item) but
   resolvable by id so the Audit Log's linked-evidence entry deep-links to this
   exact record instead of a generic /review. */
export const NOTION_RENEWAL_FLAGGED: Proposal = {
  id: "prop-notion",
  auditId: "AUD-3K8Q",
  agent: "invoice",
  surface: "business",
  title: "Subscription renewal above the new-vendor threshold",
  rowSubtitle: "Notion Team · higher seat count flagged",
  actionStatement: "Propose paying Notion Team $240",
  actionMeta: "on card ••4821 · renewal due Mon Jun 30",
  executionLabel: "charge held - not initiated",
  cancelDeadlineLabel: "nothing scheduled until you decide",
  amount: 240,
  counterparty: "Notion Team",
  dueLabel: "Due Mon Jun 30",
  severity: "warning",
  reasonChips: [
    { label: "New seat count", severity: "warning" },
    { label: "Above monthly threshold", severity: "warning" },
  ],
  rationale:
    "Your Notion workspace renewed with more seats than last cycle, pushing the monthly charge above the threshold Brain holds new or changed subscriptions at. The vendor and card on file are unchanged - only the seat count, and therefore the amount, moved.",
  facts: [
    { label: "vendor", value: "Notion Team" },
    { label: "prior charge", value: "$180 · 12 seats" },
    { label: "this charge", value: "$240 · 16 seats", severity: "warning" },
    { label: "change", value: "+$60 · +4 seats", severity: "warning" },
    { label: "card on file", value: "unchanged" },
  ],
  evidence: [
    {
      kind: "invoice",
      title: "Renewal invoice",
      subtitle: "Jun 30 · $240.00 · 16 seats",
    },
    {
      kind: "prior_payment",
      title: "Last renewal",
      subtitle: "May 30 · $180.00 · 12 seats",
    },
  ],
  confidence: {
    score: 0.72,
    band: "medium",
    caveat:
      "The increase looks like normal team growth, but the seat jump crossed your review threshold - confirm the new seats are intended.",
  },
  whatHappensNext:
    "Nothing is scheduled. If you approve, the execution service charges the card for the new seat count. If you reject, the renewal is held and Brain follows up with the workspace owner about the added seats.",
  risk: "If this is wrong, you pay every month for seats nobody uses - a recurring overcharge until someone notices.",
  policy: {
    id: "ap.threshold.v2",
    explanation: "recurring charge rose above the new/changed-subscription threshold",
    autoClearedOtherwise: true,
  },
  actions: {
    approve: { label: "Approve renewal", sublabel: "charge the new amount" },
    reject: { label: "Reject", sublabel: "keep the prior plan" },
    postpone: { label: "Postpone", sublabel: "decide tomorrow" },
  },
  status: "pending",
};
