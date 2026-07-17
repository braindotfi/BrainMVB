import type { Proposal, AccountSummary, AutoRule } from "./proposalTypes";

/* One Proposal per scenario so every UI branch is exercised by real data.
   Brain PROPOSES only. Wording for money-movers is always
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
      "Your monthly electricity bill for headquarters. The amount lines up with the last six months, and the vendor, account, and due date all match past payments.",
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
      caveat: "Matches an established monthly pattern.",
    },
    whatHappensNext:
      "Once approved, this goes to the execution service. ACH starts Thursday afternoon and settles the next business day. You can cancel until 5 PM ET Thursday.",
    risk: "If this is a mistake, the office electricity could go past due and trigger a late reconnection fee.",
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
      { label: "Nearly identical amount", severity: "info" },
    ],
    rationale:
      "A nearly identical invoice from the same vendor was paid about 10 days ago. The amounts differ by a few dollars and the invoice numbers are sequential. That can happen with reissued bills, but it can also mean you are being asked to pay twice.",
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
        "Could be a legitimate re-issue or a second billing cycle. Worth a human glance before paying.",
    },
    whatHappensNext:
      "Once approved, this goes to the execution service and ACH starts the same day. If it is a duplicate, reject it and the vendor will be flagged for closer matching next time.",
    risk: "If this is a mistake, you pay Apex Cleaning twice and have to recover $1,450.",
    policy: {
      id: "ap.dedupe.v2",
      explanation: "second near-identical invoice within 14 days",
      autoClearedOtherwise: false,
    },
    actions: {
      approve: { label: "Approve anyway", sublabel: "not a duplicate" },
      reject: { label: "Reject", sublabel: "not a duplicate, already paid" },
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
    executionLabel: "ACH held, not initiated",
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
      "The April design retainer matches your usual contractor payment, but the destination bank account differs from every prior payment to this vendor and showed up for the first time today. Changed payout details are the most common way invoice fraud happens.",
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
        "We cannot confirm the new account is genuine. Verify with the vendor through a known contact before paying.",
    },
    whatHappensNext:
      "Nothing is scheduled yet. If you verify first, a confirmation draft goes to the vendor's on-file contact and the payment stays parked until you resolve it. No funds move. If you approve, the execution service pays the new account.",
    risk: "If this is a mistake, $3,200 goes to a fraudster's account and is basically unrecoverable.",
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
        sublabel: "draft a confirmation. No funds move",
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
      "This month's Comcast Business bill is 38% above the trailing 12 month average. It may be a one time equipment or overage charge, or a billing error. The vendor and account are the same as always.",
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
      caveat: "The extra charge looks like a one time equipment line, but we can't confirm it was authorized.",
    },
    whatHappensNext:
      "Once approved, this goes to the execution service and ACH starts the same day. If the overage is unexpected, reject it and a billing dispute will be drafted for your review.",
    risk: "If this is a mistake, you overpay $338 on a billing error that is a pain to recover.",
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
      "Your operating balance sits well above the 3-month buffer you set, even after covering everything pending. Sweeping the excess into short-term treasuries earns yield while leaving a comfortable cushion. The account is not drained.",
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
      "Once approved, the sweep goes to the execution service and the transfer starts the next business day. You can cancel until 4 PM ET. Funds stay in your name at Mercury Treasury.",
    risk: "If this is a mistake and a large bill lands unexpectedly, you may need to pull funds back from treasury, which can take one to two business days.",
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
      { label: "Reminder only, won't send", severity: "info" },
    ],
    rationale:
      "Northstar Design's invoice passed net-30 eighteen days ago with no payment and no reply to the last statement. A gentle reminder usually recovers these without escalation. This is money owed to you. Nothing leaves your account.",
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
      caveat: "A first reminder usually resolves overdue receivables of this size.",
    },
    whatHappensNext:
      "A reminder is drafted for your review and not sent automatically. You read it, edit if you like, and choose whether to send. No message goes out automatically.",
    risk: "If this is a mistake (for example, payment already arrived), the reminder could annoy a paying customer. That is why it stays a draft until you send it.",
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
      { label: "Draft entry, won't post", severity: "info" },
    ],
    rationale:
      "A bank transaction of $1,024.00 does not match the ledger entry of $1,208.00 recorded against the same vendor, a $184.00 gap outside your $5 close tolerance. It looks like a partial refund that was not booked. A correcting entry is proposed for your review.",
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
      caveat: "The $184 gap matches a likely partial refund, but the original credit memo is not attached.",
    },
    whatHappensNext:
      "The correcting journal entry is drafted for your review and not posted automatically. You approve it into the close, or reject it if the original figure was right.",
    risk: "If this is a mistake, posting an incorrect adjustment would misstate the June close and have to be reversed.",
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
      "Your monthly cloud infrastructure bill, in line with the trailing average and committed-use pricing. Vendor, account, and cadence all match past payments. It clears for batch approval with the rest of your routine AP.",
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
      "Once approved, this goes to the execution service and ACH starts Monday morning. You can cancel until 9 AM ET Monday, or batch-approve it with the rest of your routine AP.",
    risk: "If this is a mistake, an unpaid AWS bill could throttle or suspend production infrastructure.",
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
    policyThreshold: "Clears automatically under $2,500 · this is above your batch threshold",
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
  name: "Clear utility bills automatically",
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
  name: "Clear software subscriptions automatically",
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
  name: "Clear fixed rent and lease automatically",
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
  name: "Clear payroll and benefits automatically",
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
  name: "Sweep idle cash to treasury automatically",
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
  name: "Match deposits to invoices automatically",
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
  name: "Reconcile matched bank/ledger pairs automatically",
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
  bullets?: string[];
  recommendedAction?: string;
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
    bullets: p.bullets,
    recommendedAction: p.recommendedAction,
    evidence: [],
    confidence: { score: 0.99, band: "high", caveat: "Matched your standing rule." },
    whatHappensNext: "Already settled. Nothing further to do.",
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
    whatHappensNext: "Already settled. Nothing further to do.",
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
    "Your recurring Creative Cloud team subscription. Vendor and charge matched the prior month exactly, so your software-subscriptions rule cleared it automatically.",
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
    "A deposit from a known customer matched an open invoice amount, date, and reference number exactly. It was applied automatically.",
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
    "The Gusto payroll ACH on Jul 6 matched the ledger entry to the penny and within the same day. It was marked reconciled automatically.",
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
  title: "Payroll run, J. Smith (Engineering)",
  counterparty: "J. Smith (Engineering)",
  amount: 5600,
  pastTenseStatement: "Ran payroll for J. Smith (Engineering)",
  settledMeta: "ACH to Wells Fargo · you approved Jul 2, 9:55 AM · settled Jul 2, 10:02 AM ET",
  rowSubtitle: "J. Smith (Engineering) · settled 10:02 AM",
  rationale:
    "Scheduled engineering payroll run. It exceeded your auto-approval threshold, so it was escalated for your sign-off before the execution service sent the ACH.",
  facts: [
    { label: "employee", value: "J. Smith (Engineering)" },
    { label: "amount", value: "$5,600" },
    { label: "destination", value: "Wells Fargo" },
    { label: "approval", value: "above threshold · human", severity: "info" },
  ],
  timeline: [
    { label: "Invoice Agent proposed payroll run", timestamp: "Jul 2, 9:00 AM ET", done: true },
    { label: "Escalated to human, above threshold", timestamp: "Jul 2, 9:01 AM ET", done: true },
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
    "Your operating balance sat above the idle-cash threshold. The excess was proposed for AAVE v3 to earn yield. Because it was above your sweep limit, you were asked first.",
  facts: [
    { label: "protocol", value: "AAVE v3" },
    { label: "amount", value: "$3,500" },
    { label: "current APY", value: "4.5%" },
    { label: "approval", value: "above sweep limit · human", severity: "info" },
  ],
  timeline: [
    { label: "Cash Agent detected idle operating balance", timestamp: "Jul 4, 6:25 PM ET", done: true },
    { label: "Escalated to human, above sweep threshold", timestamp: "Jul 4, 6:25 PM ET", done: true },
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
    title: "Amazon Web Services, monthly cloud bill",
    counterparty: "Amazon Web Services",
    amount: 4150,
    pastTenseStatement: "Paid Amazon Web Services $4,150",
    settledMeta: "from Operating ••4821 · you approved Jul 7, 8:55 AM · settled Jul 7, 9:02 AM ET",
    rowSubtitle: "Amazon Web Services · settled 9:02 AM",
    rationale:
      "Your monthly cloud infrastructure bill. It exceeded the business-surface batch auto-approval limit, so it was escalated for your sign-off before the execution service sent the ACH.",
    facts: [
      { label: "vendor", value: "Amazon Web Services" },
      { label: "amount", value: "$4,150" },
      { label: "destination", value: "ACH ••9021" },
      { label: "approval", value: "above batch limit · human", severity: "info" },
    ],
    timeline: [
      { label: "Invoice Agent proposed payment", timestamp: "Jul 6, 3:14 PM ET", done: true },
      { label: "Escalated to human, above auto-pay limit", timestamp: "Jul 6, 3:14 PM ET", done: true },
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
  executionLabel: "charge held, not initiated",
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
    "Your Notion workspace renewed with more seats than last cycle, pushing the monthly charge above the threshold for new or changed subscriptions. The vendor and card on file are unchanged. Only the seat count, and therefore the amount, changed.",
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
      "The increase looks like normal team growth, but the seat jump crossed your review threshold. Confirm the new seats are intended.",
  },
  whatHappensNext:
    "Nothing is scheduled yet. If you approve, the execution service charges the card for the new seat count. If you reject, the renewal is held and the workspace owner is followed up with about the added seats.",
  risk: "If this is a mistake, you pay every month for seats nobody uses. A recurring overcharge until someone notices.",
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

/* ── Figma design demo proposals ──────────────────────────────────────────────
   One NR (Needs Review) and one Auto per agent type, matching the 22 Figma
   frames pixel-for-pixel. NOT in MOCK_PROPOSALS to preserve the AP-total
   invariant. Access by id via openProposalDetail or direct import.
   ─────────────────────────────────────────────────────────────────────────── */

const VENDOR_RISK_RULE: AutoRule = {
  id: "vendor-risk-bank-change",
  name: "Bank detail change review",
  summary: "holds any payment when the vendor's bank account changes until a human confirms",
  createdLabel: "Created Jun 1",
  policyId: "ap.vendor_risk.bank_change.v1",
  active: true,
  kind: "guardrail",
  agent: "vendor_risk",
  scopeSummary: "all vendor bank account changes",
};

const PAYMENT_BATCH_RULE: AutoRule = {
  id: "payment-batch-auto",
  name: "Routine batch auto-pay",
  summary: "auto-pays batches where all invoices match open POs with no exceptions",
  createdLabel: "Created May 15",
  policyId: "ap.payment.batch.v1",
  active: true,
  kind: "automation",
  agent: "payment",
  cap: 20000,
  scopeSummary: "clean-matched invoice batches under $20,000",
};

const SUBSCRIPTION_RULE: AutoRule = {
  id: "subscription-unchanged",
  name: "Unchanged subscription auto-renew",
  summary: "auto-renews software subscriptions where seat count and amount are unchanged",
  createdLabel: "Created Apr 10",
  policyId: "ap.subscription.unchanged.v1",
  active: true,
  kind: "automation",
  agent: "subscription",
  cap: 1000,
  scopeSummary: "recurring SaaS renewals with no seat or price change",
};

const REVENUE_INTEL_RULE: AutoRule = {
  id: "revenue-intel-auto",
  name: "Revenue pattern auto-tag",
  summary: "auto-tags and records revenue patterns with no action required",
  createdLabel: "Created Jun 20",
  policyId: "ap.revenue_intel.auto.v1",
  active: true,
  kind: "automation",
  agent: "revenue_intelligence",
  scopeSummary: "revenue pattern observations below alert threshold",
};

/* ── Vendor Risk ─────────────────────────────────────────────────────────── */

export const VENDOR_RISK_FLAGGED: Proposal = {
  id: "prop-vendor-risk-bank-change",
  auditId: "AUD-VR001",
  agent: "vendor_risk",
  surface: "business",
  title: "Bank details changed on a contractor invoice",
  rowSubtitle: "Bright Futures Studio · New Account Flagged",
  actionStatement: "Hold payment to Bright Futures Studio until verified",
  actionMeta: "from Operating ••4821 · payment held",
  executionLabel: "payment held until you decide",
  cancelDeadlineLabel: "nothing scheduled until you decide",
  amount: 3200,
  counterparty: "Bright Futures Studio",
  severity: "danger",
  reasonChips: [
    { label: "New bank account", severity: "danger" },
    { label: "First seen 2 days ago", severity: "danger" },
  ],
  rationale:
    "Bright Futures Studio submitted an invoice with a new bank account number Brain has never seen before. The timing and email domain shift match a pattern common in vendor impersonation fraud.",
  bullets: [
    "New account number first seen 2 days ago",
    "Vendor has no prior record of changing banking details",
    "Invoice was submitted from a new email domain variant",
  ],
  recommendedAction:
    "Hold payment and confirm new bank details directly with the vendor before paying.",
  facts: [
    { label: "vendor", value: "Bright Futures Studio" },
    { label: "invoice", value: "#BFS-2026-114 · $3,200" },
    { label: "prior account", value: "••7742 · on file 18 months" },
    { label: "new account", value: "••3301 · first seen Jul 13", severity: "danger" },
    { label: "email domain", value: "brightfutures-studio.co (new)", severity: "danger" },
  ],
  evidence: [
    { kind: "invoice", title: "Invoice #BFS-2026-114", subtitle: "Jul 13 · $3,200 · new bank" },
    { kind: "prior_payment", title: "Last payment", subtitle: "Jun 15 · $3,200 · account ••7742" },
  ],
  confidence: {
    score: 0.95,
    band: "high",
    caveat:
      "Strong signal. Both the new account and domain shift appeared within 48 hours of the invoice submission.",
  },
  whatHappensNext:
    "If you approve, payment routes to the new account. If you hold, Brain keeps the invoice in the queue and sends a verification request to your primary contact at Bright Futures Studio.",
  risk: "If this is fraud, approving sends $3,200 to an attacker. Recovery from misdirected wire transfers is rare.",
  policy: {
    id: "ap.vendor_risk.bank_change.v1",
    explanation: "vendor bank details changed within 48 hours of invoice submission",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Approve", sublabel: "pay to new account" },
    reject: { label: "Hold payment", sublabel: "keep in queue" },
    postpone: { label: "Verify first", sublabel: "ask vendor directly" },
  },
  status: "pending",
};

export const VENDOR_RISK_AUTO: Proposal = autoHandled({
  id: "settled-vendor-risk-verified",
  auditId: "AUD-VR002",
  agent: "vendor_risk",
  title: "Bank details verified with vendor",
  counterparty: "Bright Futures Studio",
  amount: 3200,
  pastTenseStatement: "Bank details verified with vendor",
  settledMeta: "Verification call logged · Jul 11, 8:40 PM · payment released",
  rowSubtitle: "Bright Futures Studio · Change Confirmed",
  rationale:
    "Vendor confirmed the new bank details via a verified phone call to their registered number. The account change was legitimate and the payment was released.",
  bullets: [
    "Vendor confirmed account change via registered phone number",
    "New account verified against business registration records",
    "No further risk signals detected after confirmation",
  ],
  clearedBecause: [
    { label: "vendor", value: "Bright Futures Studio · verified" },
    { label: "verification", value: "phone call · registered number", severity: "clean" },
    { label: "new account", value: "••3301 · confirmed legitimate" },
    { label: "payment", value: "$3,200 · released Jul 11" },
  ],
  rule: VENDOR_RISK_RULE,
  timeline: [
    { label: "Vendor risk agent flagged bank detail change", timestamp: "Jul 11, 8:00 PM ET", done: true },
    { label: "Verification request sent to vendor", timestamp: "Jul 11, 8:05 PM ET", done: true },
    { label: "Vendor confirmed via registered phone", timestamp: "Jul 11, 8:38 PM ET", done: true },
    { label: "Payment released to new account", timestamp: "Jul 11, 8:40 PM ET", note: "Brain never held the funds", done: true },
  ],
});

/* ── Payment ─────────────────────────────────────────────────────────────── */

export const PAYMENT_BATCH_NR: Proposal = {
  id: "prop-payment-batch",
  auditId: "AUD-PAY001",
  agent: "payment",
  surface: "business",
  title: "3 vendor invoices ready to batch and pay",
  rowSubtitle: "Due within 5 days · No Exceptions Found",
  actionStatement: "Propose batching 3 vendor invoices for payment",
  actionMeta: "from Operating ••4821 · due within 5 days",
  executionLabel: "ACH batch initiates next business day",
  cancelDeadlineLabel: "cancel until 5:00 PM ET today",
  amount: 14850,
  counterparty: "Multiple vendors",
  severity: "clean",
  reasonChips: [
    { label: "All POs matched", severity: "clean" },
    { label: "No exceptions", severity: "clean" },
  ],
  rationale:
    "Three invoices are due within 5 days, all matched 1:1 to open purchase orders with no discrepancies. Batching them reduces ACH fees and keeps vendors on schedule.",
  bullets: [
    "All 3 invoices matched 1:1 to open purchase orders",
    "No amount, quantity, or vendor mismatches found",
    "Combined batch fits within this week's operating cash buffer",
  ],
  recommendedAction:
    "Approve to batch and schedule payment for all 3 invoices on their due dates.",
  facts: [
    { label: "invoice 1", value: "Apex Supplies · $1,450 · due Jul 17" },
    { label: "invoice 2", value: "Con Edison · $486 · due Jul 18" },
    { label: "invoice 3", value: "Comcast Biz · $1,228 · due Jul 19" },
    { label: "total batch", value: "$3,164" },
    { label: "PO match", value: "3 of 3 · exact match", severity: "clean" },
    { label: "cash buffer", value: "$42,000 available · safe", severity: "clean" },
  ],
  evidence: [
    { kind: "invoice", title: "Apex Supplies invoice", subtitle: "Jul 17 · $1,450 · PO matched" },
    { kind: "invoice", title: "Con Edison invoice", subtitle: "Jul 18 · $486 · PO matched" },
    { kind: "invoice", title: "Comcast invoice", subtitle: "Jul 19 · $1,228 · PO matched" },
  ],
  confidence: {
    score: 0.97,
    band: "high",
    caveat: "All invoices match purchase orders exactly. No manual review signals detected.",
  },
  whatHappensNext:
    "Approving schedules an ACH batch for the next business morning. Each vendor receives a payment notification. You can cancel until 5 PM today.",
  risk: "",
  policy: {
    id: "ap.payment.batch.v1",
    explanation: "all invoices matched open POs with no exceptions",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Approve batch", sublabel: "schedule all 3" },
    reject: { label: "Reject", sublabel: "hold all invoices" },
    postpone: { label: "Postpone", sublabel: "decide tomorrow" },
  },
  status: "pending",
  batchApprovable: true,
};

export const PAYMENT_BATCH_AUTO: Proposal = autoHandled({
  id: "settled-payment-batch",
  auditId: "AUD-PAY002",
  agent: "payment",
  title: "3 vendor invoices batched and paid",
  counterparty: "Multiple vendors",
  amount: 14850,
  pastTenseStatement: "Batched and paid 3 vendor invoices",
  settledMeta: "ACH batch · settled Jul 10, 9:15 AM ET · you set a rule that allows this",
  rowSubtitle: "Due within 5 days · No Exceptions Found",
  rationale:
    "All three invoices matched open purchase orders exactly. Under your routine batch auto-pay rule, the payment was scheduled and settled without escalation.",
  bullets: [
    "All 3 invoices matched 1:1 to open purchase orders",
    "Batch total within your auto-pay limit",
    "ACH settled next business morning as scheduled",
  ],
  clearedBecause: [
    { label: "invoices", value: "3 · all PO-matched", severity: "clean" },
    { label: "total", value: "$14,850" },
    { label: "under limit", value: "$14,850 / $20,000", severity: "clean" },
    { label: "exceptions", value: "none", severity: "clean" },
  ],
  rule: PAYMENT_BATCH_RULE,
  timeline: [
    { label: "Payment agent matched all invoices to POs", timestamp: "Jul 9, 5:00 PM ET", done: true },
    { label: "Approved automatically by routine batch rule", timestamp: "Jul 9, 5:01 PM ET", note: "no human step", done: true },
    { label: "ACH batch settled", timestamp: "Jul 10, 9:15 AM ET", note: "Brain never held the funds", done: true },
  ],
});

/* ── Collections ─────────────────────────────────────────────────────────── */

export const COLLECTIONS_OVERDUE_NR: Proposal = {
  id: "prop-collections-overdue",
  auditId: "AUD-COL001",
  agent: "collections",
  surface: "business",
  title: "Northstar Design invoice is 18 days overdue",
  rowSubtitle: "Receivable · Draft a Reminder",
  actionStatement: "Send a payment reminder to Northstar Design",
  actionMeta: "invoice #ND-2026-88 · due Jun 27 · $6,200",
  executionLabel: "reminder sent via email on approval",
  cancelDeadlineLabel: "nothing sent until you approve",
  amount: 6200,
  counterparty: "Northstar Design",
  severity: "warning",
  reasonChips: [
    { label: "18 days overdue", severity: "warning" },
    { label: "No response yet", severity: "warning" },
  ],
  rationale:
    "Invoice #ND-2026-88 for $6,200 was due June 27 and remains unpaid with no payment response from Northstar Design. A first reminder is overdue.",
  bullets: [
    "Invoice due Jun 27 · 18 days past due",
    "No payment or dispute response received",
    "Northstar Design has a clean payment history (avg 8 days to pay)",
  ],
  recommendedAction:
    "Send a first reminder referencing the invoice number and due date. Northstar's track record suggests this is likely an oversight.",
  facts: [
    { label: "customer", value: "Northstar Design" },
    { label: "invoice", value: "#ND-2026-88 · $6,200" },
    { label: "due date", value: "Jun 27, 2026", severity: "warning" },
    { label: "days overdue", value: "18 days", severity: "warning" },
    { label: "prior avg", value: "8 days to pay · clean history" },
  ],
  evidence: [
    { kind: "invoice", title: "Invoice #ND-2026-88", subtitle: "Jun 27 · $6,200 · unpaid" },
    { kind: "prior_payment", title: "Last payment", subtitle: "Apr 10 · $4,800 · paid in 6 days" },
  ],
  confidence: {
    score: 0.88,
    band: "high",
    caveat:
      "Clean payment history suggests oversight rather than dispute. A reminder is the appropriate first step.",
  },
  whatHappensNext:
    "Approving sends a professional reminder email to Northstar Design referencing the invoice and due date. No payment is initiated; this is a collections follow-up only.",
  risk: "",
  policy: {
    id: "ar.collections.overdue.v1",
    explanation: "receivable more than 15 days overdue with no response",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Send reminder", sublabel: "email Northstar Design" },
    reject: { label: "Skip", sublabel: "leave it for now" },
    postpone: { label: "Postpone", sublabel: "remind me tomorrow" },
  },
  status: "pending",
};

/* ── Treasury ────────────────────────────────────────────────────────────── */

export const TREASURY_SWEEP_NR: Proposal = {
  id: "prop-treasury-sweep",
  auditId: "AUD-TRE001",
  agent: "treasury",
  surface: "business",
  title: "Idle operating cash above sweep threshold",
  rowSubtitle: "Operating ••4821 · $18,500 sweepable",
  actionStatement: "Move idle cash to T-Bill money market fund",
  actionMeta: "from Operating ••4821 · Mercury Treasury (T-Bills)",
  executionLabel: "transfer initiates next business morning",
  cancelDeadlineLabel: "cancel until 5:00 PM ET today",
  amount: 18500,
  counterparty: "Mercury Treasury (T-Bills)",
  severity: "clean",
  reasonChips: [
    { label: "Cash above threshold", severity: "clean" },
    { label: "3-month runway safe", severity: "clean" },
  ],
  rationale:
    "Your operating balance has stayed $18,500 above the 3-month runway buffer for 4 consecutive days. Moving the excess to your T-Bill money market fund earns yield with same-day liquidity.",
  bullets: [
    "Operating balance $18,500 above your 3-month buffer",
    "Cash idle for 4 consecutive days above threshold",
    "T-Bill fund offers 5.1% APY with same-day redemption",
  ],
  recommendedAction:
    "Approve to move the idle balance. Funds remain liquid and can be recalled same-day if needed.",
  facts: [
    { label: "operating balance", value: "$62,014" },
    { label: "3-month buffer", value: "$43,514 · 3 months burn" },
    { label: "sweepable", value: "$18,500", severity: "clean" },
    { label: "destination", value: "Mercury Treasury (T-Bills)" },
    { label: "current APY", value: "5.1% · same-day liquidity" },
  ],
  evidence: [
    { kind: "ledger_entry", title: "Operating balance trend", subtitle: "4 days above threshold · $62,014" },
    { kind: "forecast", title: "Cash forecast", subtitle: "3-month burn · $43,514" },
  ],
  confidence: {
    score: 0.94,
    band: "high",
    caveat: "Runway is safe post-sweep. Funds remain liquid if an urgent need arises.",
  },
  whatHappensNext:
    "Approving initiates a transfer of $18,500 to your Mercury Treasury fund next business morning. You keep $43,514 in operating for 3 months of runway. The transfer is reversible same-day.",
  risk: "",
  policy: {
    id: "treasury.idle_cash.v1",
    explanation: "operating balance exceeded 3-month buffer for 4 consecutive days",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Approve sweep", sublabel: "move $18,500 to T-Bills" },
    reject: { label: "Keep in operating", sublabel: "no sweep" },
    postpone: { label: "Postpone", sublabel: "ask me tomorrow" },
  },
  status: "pending",
  sweepMath: {
    totalCash: 62014,
    pendingAP: 10514,
    bufferMonths: 3,
    bufferAmount: 33000,
    sweepAmount: 18500,
    operatingAfter: 43514,
    runwayAfterMonths: 3.9,
  },
};

/* ── Cash Forecast ───────────────────────────────────────────────────────── */

export const CASH_FORECAST_NR: Proposal = {
  id: "prop-cash-forecast",
  auditId: "AUD-CF001",
  agent: "cash_forecast",
  surface: "business",
  title: "Cash runway drops below 2 months in 18 days",
  rowSubtitle: "Forecast Alert · Payroll due Jul 30",
  actionStatement: "Review projected cash shortfall before payroll",
  actionMeta: "forecast horizon: 18 days · payroll $38,000 due Jul 30",
  executionLabel: "no payment initiated · review only",
  cancelDeadlineLabel: "no action until you decide",
  severity: "warning",
  reasonChips: [
    { label: "Runway below 2 months", severity: "warning" },
    { label: "Large payroll upcoming", severity: "warning" },
  ],
  rationale:
    "Based on current burn rate and confirmed AP obligations, your operating cash drops below a 2-month runway buffer 18 days from now. Payroll on July 30 is the largest single trigger.",
  bullets: [
    "Current operating balance: $62,014",
    "Confirmed AP due in next 18 days: $24,300",
    "Payroll Jul 30: $38,000 · brings balance to $-286 before inflows",
  ],
  recommendedAction:
    "Accelerate a receivable collection or draw on your credit line before July 30 to maintain the runway buffer.",
  facts: [
    { label: "current balance", value: "$62,014" },
    { label: "AP due 18 days", value: "$24,300" },
    { label: "payroll Jul 30", value: "$38,000", severity: "warning" },
    { label: "projected balance", value: "$-286 before inflows", severity: "danger" },
    { label: "expected inflows", value: "$48,000 · BigCo (unconfirmed)" },
  ],
  evidence: [
    { kind: "forecast", title: "18-day cash forecast", subtitle: "runway drops to 1.9 months" },
    { kind: "ledger_entry", title: "Payroll obligation", subtitle: "Jul 30 · $38,000 · confirmed" },
  ],
  confidence: {
    score: 0.81,
    band: "medium",
    caveat:
      "BigCo inflow is expected but unconfirmed. If it arrives on schedule the shortfall clears automatically.",
  },
  whatHappensNext:
    "This is a forecast alert, not a payment proposal. No funds move until you take action. Brain will resurface this if the BigCo inflow does not clear by July 25.",
  risk: "If payroll cannot clear on July 30, employees receive a delayed payment. This carries legal and reputational risk.",
  policy: {
    id: "forecast.runway.below_2mo.v1",
    explanation: "projected runway drops below 2-month buffer within 18 days",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Acknowledge", sublabel: "I will take action" },
    reject: { label: "Dismiss", sublabel: "not a concern now" },
    postpone: { label: "Remind me", sublabel: "resurface Jul 25" },
  },
  status: "pending",
};

/* ── Dispute ─────────────────────────────────────────────────────────────── */

export const DISPUTE_NR: Proposal = {
  id: "prop-dispute",
  auditId: "AUD-DIS001",
  agent: "dispute",
  surface: "business",
  title: "AWS billed $620 more than the contract rate",
  rowSubtitle: "AWS Invoice · $4,770 billed vs $4,150 contracted",
  actionStatement: "File a billing dispute with Amazon Web Services",
  actionMeta: "invoice AWS-2026-08 · overbilled by $620",
  executionLabel: "dispute filed on approval · payment held",
  cancelDeadlineLabel: "payment held until dispute resolves",
  amount: 620,
  counterparty: "Amazon Web Services",
  severity: "warning",
  reasonChips: [
    { label: "Overbilled $620", severity: "warning" },
    { label: "Exceeds contract rate", severity: "warning" },
  ],
  rationale:
    "AWS invoice AWS-2026-08 charges $4,770 for cloud infrastructure. Your contract locks the rate at $4,150 for the current tier. The $620 overage has no corresponding usage event or tier change.",
  bullets: [
    "Contract rate: $4,150 for current usage tier",
    "Billed amount: $4,770 · $620 above contract",
    "No tier upgrade, new service, or usage spike to explain the difference",
  ],
  recommendedAction:
    "File a billing dispute with AWS referencing the contract rate and invoice number. Hold payment until the dispute resolves.",
  facts: [
    { label: "vendor", value: "Amazon Web Services" },
    { label: "invoice", value: "AWS-2026-08 · $4,770" },
    { label: "contract rate", value: "$4,150 · current tier" },
    { label: "overage", value: "$620 · unexplained", severity: "warning" },
    { label: "usage change", value: "none detected", severity: "clean" },
  ],
  evidence: [
    { kind: "invoice", title: "Invoice AWS-2026-08", subtitle: "Jul 1 · $4,770 billed" },
    { kind: "contract", title: "AWS contract rate", subtitle: "$4,150 / mo · current tier" },
  ],
  confidence: {
    score: 0.93,
    band: "high",
    caveat:
      "No usage event or tier change found. The overage is not explainable from available data.",
  },
  whatHappensNext:
    "Approving files a formal billing dispute with AWS via their API and holds the invoice. Brain tracks the dispute and resurfaces when AWS responds. If the dispute resolves in your favor, the corrected invoice clears automatically.",
  risk: "Paying without disputing waives your right to recover the $620 overage.",
  policy: {
    id: "dispute.overbilling.v1",
    explanation: "invoice amount exceeds contract rate with no usage event to explain the delta",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "File dispute", sublabel: "hold payment" },
    reject: { label: "Pay anyway", sublabel: "waive the overage" },
    postpone: { label: "Postpone", sublabel: "review contract first" },
  },
  status: "pending",
};

/* ── Compliance ──────────────────────────────────────────────────────────── */

export const COMPLIANCE_NR: Proposal = {
  id: "prop-compliance",
  auditId: "AUD-CMP001",
  agent: "compliance",
  surface: "business",
  title: "Payment to new vendor missing W-9 on file",
  rowSubtitle: "IRS 1099 compliance · Apex Consulting",
  actionStatement: "Collect W-9 before paying Apex Consulting",
  actionMeta: "invoice #AC-2026-07 · $8,500 · W-9 required",
  executionLabel: "payment held until W-9 received",
  cancelDeadlineLabel: "nothing sent until you decide",
  amount: 8500,
  counterparty: "Apex Consulting",
  severity: "warning",
  reasonChips: [
    { label: "No W-9 on file", severity: "warning" },
    { label: "1099 threshold exceeded", severity: "warning" },
  ],
  rationale:
    "Apex Consulting is a new vendor with cumulative payments this year of $8,500, exceeding the $600 IRS 1099 threshold. No W-9 is on file. Paying without it creates a compliance gap.",
  bullets: [
    "New vendor added Jun 30 · no W-9 collected at onboarding",
    "Cumulative payments YTD: $8,500 · exceeds $600 1099 threshold",
    "IRS requires W-9 before issuing 1099-NEC at year end",
  ],
  recommendedAction:
    "Request a W-9 from Apex Consulting before releasing payment. Brain can send the request automatically on approval.",
  facts: [
    { label: "vendor", value: "Apex Consulting" },
    { label: "invoice", value: "#AC-2026-07 · $8,500" },
    { label: "W-9 on file", value: "none", severity: "warning" },
    { label: "YTD payments", value: "$8,500 · above $600 threshold", severity: "warning" },
    { label: "1099 required", value: "yes · NEC form", severity: "warning" },
  ],
  evidence: [
    { kind: "invoice", title: "Invoice #AC-2026-07", subtitle: "Jul 15 · $8,500 · pending" },
    { kind: "ledger_entry", title: "YTD payment total", subtitle: "$8,500 · first payment this year" },
  ],
  confidence: {
    score: 0.98,
    band: "high",
    caveat: "IRS rule is deterministic. Above $600 and no W-9 is a clear compliance gap.",
  },
  whatHappensNext:
    "Approving sends a W-9 request to Apex Consulting via email and holds the invoice. Once they return the completed form, the invoice auto-clears for payment. Dismissing logs a compliance waiver.",
  risk: "Paying without a W-9 on file may result in a penalty of up to $310 per missing form at year end.",
  policy: {
    id: "compliance.1099.w9_required.v1",
    explanation: "new vendor payment exceeds IRS 1099 threshold with no W-9 on file",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Request W-9", sublabel: "hold invoice" },
    reject: { label: "Pay anyway", sublabel: "log compliance waiver" },
    postpone: { label: "Postpone", sublabel: "follow up manually" },
  },
  status: "pending",
};

/* ── Revenue Intelligence ─────────────────────────────────────────────────── */

export const REVENUE_INTEL_AUTO: Proposal = autoHandled({
  id: "settled-revenue-intel",
  auditId: "AUD-REV001",
  agent: "revenue_intelligence",
  title: "BigCo revenue pattern tagged and recorded",
  counterparty: "BigCo Industries",
  amount: 48000,
  pastTenseStatement: "BigCo revenue pattern tagged and recorded",
  settledMeta: "No action required · tagged Jul 14, 9:00 AM",
  rowSubtitle: "Monthly Inflow · Pattern Confirmed",
  rationale:
    "BigCo Industries has paid $48,000 on the 26th of each month for 5 consecutive months. The pattern is statistically significant and has been tagged as a confirmed recurring revenue stream.",
  bullets: [
    "5 consecutive monthly payments of $48,000",
    "Payment date variance: 0 days (always the 26th)",
    "Pattern confidence: 99% · tagged as recurring revenue",
  ],
  clearedBecause: [
    { label: "customer", value: "BigCo Industries" },
    { label: "pattern", value: "$48,000 / month · 5 months", severity: "clean" },
    { label: "date variance", value: "0 days · always 26th", severity: "clean" },
    { label: "confidence", value: "99% · confirmed recurring" },
  ],
  rule: REVENUE_INTEL_RULE,
  timeline: [
    { label: "Revenue pattern detected over 5 months", timestamp: "Jul 14, 9:00 AM ET", done: true },
    { label: "Pattern tagged as confirmed recurring revenue", timestamp: "Jul 14, 9:01 AM ET", note: "no human step", done: true },
  ],
});

/* ── Reconciliation ──────────────────────────────────────────────────────── */

export const RECONCILIATION_NR: Proposal = {
  id: "prop-reconciliation-mismatch",
  auditId: "AUD-REC001",
  agent: "reconciliation",
  surface: "business",
  title: "Bank line and ledger entry differ by $14",
  rowSubtitle: "Chase ••4821 · Jul 12 · Gusto payroll",
  actionStatement: "Resolve a $14 discrepancy between bank and ledger",
  actionMeta: "Chase ••4821 · Jul 12 · Gusto payroll ACH",
  executionLabel: "reconciliation logged on approval",
  cancelDeadlineLabel: "no action until you decide",
  amount: 14,
  counterparty: "Gusto",
  severity: "info",
  reasonChips: [
    { label: "$14 discrepancy", severity: "info" },
    { label: "Outside tolerance", severity: "info" },
  ],
  rationale:
    "The Gusto payroll ACH on July 12 appears as $4,214.00 in the Chase bank feed but $4,200.00 in your ledger. The $14 difference exceeds your $1.00 reconciliation tolerance.",
  bullets: [
    "Bank line: $4,214.00 · Chase ••4821 · Jul 12",
    "Ledger entry: $4,200.00 · Gusto payroll · Jul 12",
    "Difference: $14.00 · exceeds $1.00 tolerance",
  ],
  recommendedAction:
    "Check if a payroll adjustment or tax withholding change accounts for the $14 difference. Approve to accept the bank amount as correct and update the ledger.",
  facts: [
    { label: "bank line", value: "$4,214.00 · Chase ••4821 · Jul 12" },
    { label: "ledger entry", value: "$4,200.00 · Gusto payroll · Jul 12" },
    { label: "difference", value: "$14.00", severity: "info" },
    { label: "tolerance", value: "$14.00 / $1.00 · exceeds", severity: "warning" },
    { label: "payroll run", value: "Gusto · 14 employees · Jul 12" },
  ],
  evidence: [
    { kind: "transaction", title: "Chase bank line", subtitle: "Jul 12 · $4,214.00 · Gusto ACH" },
    { kind: "ledger_entry", title: "Ledger entry", subtitle: "Jul 12 · $4,200.00 · Gusto payroll" },
  ],
  confidence: {
    score: 0.87,
    band: "high",
    caveat:
      "The discrepancy is small but outside tolerance. Most likely a payroll tax adjustment. Check Gusto payroll detail to confirm.",
  },
  whatHappensNext:
    "Approving accepts the bank amount as the authoritative figure and updates the ledger with a $14 adjustment note. Rejecting holds it open for manual review.",
  risk: "",
  policy: {
    id: "recon.tolerance.v1",
    explanation: "bank/ledger discrepancy exceeds the $1.00 auto-reconciliation tolerance",
    autoClearedOtherwise: true,
  },
  actions: {
    approve: { label: "Accept bank figure", sublabel: "update ledger +$14" },
    reject: { label: "Hold open", sublabel: "manual review" },
    postpone: { label: "Postpone", sublabel: "check Gusto first" },
  },
  status: "pending",
};

/* ── Subscription ────────────────────────────────────────────────────────── */

export const SUBSCRIPTION_UNUSED_NR: Proposal = {
  id: "prop-subscription-unused",
  auditId: "AUD-SUB001",
  agent: "subscription",
  surface: "business",
  title: "Unused software seat renewing in 4 days",
  rowSubtitle: "Figma · 1 of 8 seats inactive 60+ days",
  actionStatement: "Cancel 1 inactive Figma seat before renewal",
  actionMeta: "Figma Pro · renews Jul 19 · $180 / seat",
  executionLabel: "cancellation sent on approval",
  cancelDeadlineLabel: "must cancel before Jul 19 to avoid charge",
  amount: 180,
  counterparty: "Figma",
  severity: "clean",
  reasonChips: [
    { label: "Seat inactive 60+ days", severity: "info" },
    { label: "Renewal in 4 days", severity: "warning" },
  ],
  rationale:
    "One of your 8 Figma Pro seats has had no activity in over 60 days. The plan renews in 4 days. Canceling the inactive seat saves $180 per month with no impact on active users.",
  bullets: [
    "Seat assigned to a user with no login in 63 days",
    "Renewed charge scheduled in 4 days",
    "7 other seats on the same plan show regular weekly use",
  ],
  recommendedAction:
    "Cancel the unused seat before renewal to avoid the charge. The seat can be reassigned to a new hire at any time.",
  facts: [
    { label: "vendor", value: "Figma" },
    { label: "plan", value: "Figma Pro · 8 seats" },
    { label: "inactive seat", value: "1 seat · last login May 13", severity: "info" },
    { label: "renewal date", value: "Jul 19, 2026", severity: "warning" },
    { label: "monthly savings", value: "$180 / month if cancelled" },
  ],
  evidence: [
    { kind: "invoice", title: "Upcoming renewal", subtitle: "Jul 19 · $180 / inactive seat" },
    { kind: "ledger_entry", title: "Last 3 renewals", subtitle: "8 seats · $1,440 / month" },
  ],
  confidence: {
    score: 0.92,
    band: "high",
    caveat:
      "63 days of inactivity is well above the 30-day threshold. The seat is functionally unused.",
  },
  whatHappensNext:
    "Approving sends a cancellation request to Figma for the inactive seat before the Jul 19 renewal. The other 7 seats are unaffected. You can add a new seat at any time.",
  risk: "",
  policy: {
    id: "subscription.unused_seat.v1",
    explanation: "seat inactive for 60+ days with a renewal due within 7 days",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Cancel seat", sublabel: "save $180 / mo" },
    reject: { label: "Keep seat", sublabel: "renew as usual" },
    postpone: { label: "Postpone", sublabel: "decide tomorrow" },
  },
  status: "pending",
};

export const SUBSCRIPTION_AUTO: Proposal = autoHandled({
  id: "settled-subscription-auto",
  auditId: "AUD-SUB002",
  agent: "subscription",
  title: "Slack Pro renewal cleared automatically",
  counterparty: "Slack Technologies",
  amount: 624,
  pastTenseStatement: "Slack Pro renewed automatically",
  settledMeta: "on card ••4821 · settled Jul 7, 8:00 AM ET · you set a rule that allows this",
  rowSubtitle: "Slack Pro · 12 seats · Amount Unchanged",
  rationale:
    "Your Slack Pro subscription renewed with the same seat count and monthly price as the prior month. Under your unchanged-subscription auto-renew rule, it cleared without escalation.",
  bullets: [
    "Same 12 seats as prior month",
    "Same $52/seat price · total $624 unchanged",
    "Within auto-renew cap · no human step needed",
  ],
  clearedBecause: [
    { label: "vendor", value: "Slack Technologies · trusted" },
    { label: "seats", value: "12 · unchanged", severity: "clean" },
    { label: "this charge", value: "$624", severity: "clean" },
    { label: "prior charge", value: "$624 · matched" },
    { label: "under cap", value: "$624 / $1,000", severity: "clean" },
  ],
  rule: SUBSCRIPTION_RULE,
  timeline: [
    { label: "Subscription agent detected Slack renewal", timestamp: "Jul 7, 7:58 AM ET", done: true },
    { label: "Approved automatically by unchanged-subscription rule", timestamp: "Jul 7, 7:59 AM ET", note: "no human step", done: true },
    { label: "Execution service charged card ••4821", timestamp: "Jul 7, 8:00 AM ET", note: "Brain never held the funds", done: true },
  ],
});

/* ── Fraud and Anomaly ───────────────────────────────────────────────────── */

export const FRAUD_ANOMALY_NR: Proposal = {
  id: "prop-fraud-anomaly-shared-phone",
  auditId: "AUD-FRD001",
  agent: "fraud_anomaly",
  surface: "business",
  title: "Two invoices from different vendors share a phone number",
  rowSubtitle: "Cross-Vendor Pattern · Possible Shell Company",
  actionStatement: "Hold both invoices pending fraud review",
  actionMeta: "Apex Supplies · $1,450 and BlueSky Freight · $7,950 · both held",
  executionLabel: "both payments held until you decide",
  cancelDeadlineLabel: "nothing sent until you decide",
  severity: "danger",
  reasonChips: [
    { label: "Shared phone number", severity: "danger" },
    { label: "Both added 10 days apart", severity: "danger" },
  ],
  rationale:
    "Brain detected that Apex Supplies and BlueSky Freight, two vendors added in the same 10-day window, share an identical phone number on their invoices. This is a known pattern in shell-company fraud.",
  bullets: [
    "Same phone number listed on both vendor records",
    "Both vendors added within the same 10-day window",
    "Combined billing to date across both vendors: $9,400",
  ],
  recommendedAction:
    "Hold both invoices and verify independently that Apex Supplies and BlueSky Freight are distinct, legitimate companies with separate ownership before paying either.",
  facts: [
    { label: "vendor 1", value: "Apex Supplies · added Jul 3" },
    { label: "vendor 2", value: "BlueSky Freight · added Jul 12" },
    { label: "shared phone", value: "+1 (555) 204-7731 · identical", severity: "danger" },
    { label: "invoices held", value: "$1,450 + $7,950 · $9,400 total", severity: "danger" },
    { label: "prior payments", value: "$0 to either vendor", severity: "info" },
  ],
  evidence: [
    { kind: "invoice", title: "Apex Supplies #AS-001", subtitle: "Jul 14 · $1,450 · held" },
    { kind: "invoice", title: "BlueSky Freight #BF-007", subtitle: "Jul 15 · $7,950 · held" },
  ],
  confidence: {
    score: 0.91,
    band: "high",
    caveat:
      "Shared contact details between vendors are a high-specificity fraud signal. Both vendors are new with no payment history to establish trust.",
  },
  whatHappensNext:
    "Both invoices are held. Approving flags them for your accounts-payable team to verify independently. Rejecting cancels both invoices and blocks both vendors from future auto-approval. Postponing keeps them held for 48 hours.",
  risk: "If this is a shell-company scheme, approving either invoice sends money to the same fraudulent entity. Combined exposure: $9,400.",
  policy: {
    id: "fraud.cross_vendor.shared_contact.v1",
    explanation: "two vendor records share identical contact details and were added within the same short window",
    autoClearedOtherwise: false,
  },
  actions: {
    approve: { label: "Flag for AP review", sublabel: "hold both invoices" },
    reject: { label: "Block both vendors", sublabel: "cancel invoices" },
    postpone: { label: "Hold 48 hours", sublabel: "investigate first" },
  },
  status: "pending",
};
