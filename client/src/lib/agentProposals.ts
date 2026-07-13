/* Agent proposal records for the "Your Review" surface — one per Brain agent
   (11 total, per the proposal-detail-modal spec). Brain is PROPOSE-ONLY:
   propose-mode records get Approve / Edit / Reject, notify-only records get a
   single Acknowledge, approved_automatically records get a disabled footer
   with an Undo link. */

import { useSyncExternalStore } from "react";

export type AgentKey =
  | "vendor_risk"
  | "payment"
  | "collections"
  | "treasury"
  | "cash_forecast"
  | "dispute"
  | "compliance"
  | "revenue_intel"
  | "reconciliation"
  | "subscription"
  | "fraud_anomaly";

export type AgentCategory = "business" | "agnostic";
export type ExecutionMode = "propose" | "notify_only";
export type RiskLevel = "low" | "standard" | "elevated" | "high";
export type AgentProposalStatus = "needs_review" | "approved_automatically";

export type LinkedSourceType =
  | "invoice"
  | "payment"
  | "counterparty"
  | "bank_feed"
  | "account"
  | "forecast"
  | "vendor_document"
  | "app_usage"
  | "subscription"
  | "receivable";

export interface LinkedSource {
  type: LinkedSourceType;
  id: string;
  deepLink: string; // brain://{type}/{id} — placeholder until real detail views exist
}

export interface EvidenceLine {
  text: string;
  linkedSource: LinkedSource;
}

/* ── Scenario module — the ONE slot that differs per agent ──────────────── */

export interface AccountCardData {
  label: string;
  fields: { label: string; value: string; differs?: boolean }[];
}

export type ScenarioModule =
  | { kind: "account_comparison"; old: AccountCardData; next: AccountCardData }
  | { kind: "entity_comparison"; entities: [AccountCardData, AccountCardData]; sharedNote: string }
  | { kind: "document_stack"; docs: { label: string; meta: string }[] }
  | { kind: "message_preview"; draft: string }
  | {
      kind: "account_flow";
      from: { name: string; before: number; after: number };
      to: { name: string; before: number; after: number };
      amount: number;
    }
  | { kind: "forecast_chart"; weeks: number[]; floor: number; note: string }
  | {
      kind: "line_diff";
      columns: [string, string];
      rows: { label: string; a: string; b: string; mismatch?: boolean }[];
    }
  | { kind: "usage_timeline"; lastActivityDaysAgo: number; renewalInDays: number; note: string }
  | { kind: "document_checklist"; items: { label: string; present: boolean }[] }
  | { kind: "trend_chart"; points: { label: string; value: number }[]; unit: string; note: string };

export interface AgentProposal {
  id: string;
  agentKey: AgentKey;
  agentDisplayName: string;
  category: AgentCategory;
  executionMode: ExecutionMode;
  riskLevel: RiskLevel;
  status: AgentProposalStatus;
  title: string;
  subtitle: string;
  amount: number | null;
  confidence: number; // 0..1
  whySuggested: {
    trigger: string;
    evidence: EvidenceLine[];
  };
  scenarioModule: ScenarioModule;
  recommendedAction: string;
  whatHappensNext: {
    ifApproved: string;
    ifEdited: string;
    ifRejected: string;
  };
  riskNote: string;
  source: string;
  createdAt: string; // ISO
}

/* ── Risk styling — pill + note + confidence-bar color track risk_level ─── */
export const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  low: { label: "Low risk", color: "#42bf23", bg: "rgba(66,191,35,0.12)" },
  standard: { label: "Standard", color: "#a8b9f4", bg: "#1d2132" },
  elevated: { label: "Elevated", color: "#ff9500", bg: "#3a2600" },
  high: { label: "High risk", color: "#d20344", bg: "#350011" },
};

const ls = (type: LinkedSourceType, id: string): LinkedSource => ({
  type,
  id,
  deepLink: `brain://${type}/${id}`,
});

/* ── The 11 records ─────────────────────────────────────────────────────── */

export const AGENT_PROPOSALS: AgentProposal[] = [
  {
    id: "pr_001",
    agentKey: "vendor_risk",
    agentDisplayName: "Vendor Risk",
    category: "business",
    executionMode: "propose",
    riskLevel: "high",
    status: "needs_review",
    title: "Bank details changed on a contractor invoice",
    subtitle: "Bright Futures Studio · new account flagged",
    amount: 3200,
    confidence: 0.71,
    whySuggested: {
      trigger:
        "Payment bank account on this invoice differs from the account used on this vendor's last 6 payments.",
      evidence: [
        { text: "New account number first seen 2 days ago", linkedSource: ls("counterparty", "counterparty_pr_001_1") },
        { text: "Vendor has no prior record of changing banking details", linkedSource: ls("counterparty", "counterparty_pr_001_2") },
        { text: "Invoice was submitted from a new email domain variant", linkedSource: ls("counterparty", "counterparty_pr_001_3") },
      ],
    },
    scenarioModule: {
      kind: "account_comparison",
      old: {
        label: "Account on file (last 6 payments)",
        fields: [
          { label: "bank", value: "Chase" },
          { label: "account", value: "••7742" },
          { label: "routing", value: "021000021" },
          { label: "name", value: "Bright Futures Studio LLC" },
          { label: "email", value: "billing@brightfutures.studio" },
        ],
      },
      next: {
        label: "Account on this invoice",
        fields: [
          { label: "bank", value: "Regions", differs: true },
          { label: "account", value: "••9963", differs: true },
          { label: "routing", value: "062005690", differs: true },
          { label: "name", value: "Bright Futures Studio LLC" },
          { label: "email", value: "billing@brightfutures-studio.co", differs: true },
        ],
      },
    },
    recommendedAction:
      "Hold payment and confirm new bank details directly with the vendor before paying.",
    whatHappensNext: {
      ifApproved: "Payment is held; a verification request is logged for the vendor contact on file.",
      ifEdited: "You can mark the new account as verified if you've already confirmed it out of band.",
      ifRejected: "Flag is dismissed and the original scheduled payment proceeds as-is.",
    },
    riskNote: "Paying to an unverified new account is the most common way invoice fraud succeeds.",
    source: "ledger_payments, ledger_counterparties",
    createdAt: "2026-07-11T14:02:00Z",
  },
  {
    id: "pr_002",
    agentKey: "payment",
    agentDisplayName: "Payment",
    category: "business",
    executionMode: "propose",
    riskLevel: "standard",
    status: "needs_review",
    title: "3 vendor invoices ready to batch and pay",
    subtitle: "Due within 5 days · no exceptions found",
    amount: 14850,
    confidence: 0.93,
    whySuggested: {
      trigger: "Invoices matched to approved POs and within normal payment terms are due soon.",
      evidence: [
        { text: "All 3 invoices matched 1:1 to open purchase orders", linkedSource: ls("invoice", "invoice_pr_002_1") },
        { text: "No amount, quantity, or vendor mismatches found", linkedSource: ls("invoice", "invoice_pr_002_2") },
        { text: "Combined batch fits within this week's operating cash buffer", linkedSource: ls("invoice", "invoice_pr_002_3") },
      ],
    },
    scenarioModule: {
      kind: "document_stack",
      docs: [
        { label: "INV-8841 · Apex Manufacturing", meta: "$5,400 · matched PO-2210 · due Jul 15" },
        { label: "INV-0392 · Northwind Logistics", meta: "$6,250 · matched PO-2214 · due Jul 16" },
        { label: "INV-1177 · Corta Print Co.", meta: "$3,200 · matched PO-2217 · due Jul 17" },
      ],
    },
    recommendedAction: "Batch and schedule payment for all 3 invoices on their due dates.",
    whatHappensNext: {
      ifApproved: "Payment instructions are sent to the execution service and scheduled for each due date.",
      ifEdited: "You can remove individual invoices from the batch or change the pay date.",
      ifRejected: "No payments are scheduled; invoices remain open for manual handling.",
    },
    riskNote: "Low risk — this is a routine batch with no flagged exceptions.",
    source: "ledger_invoices, ledger_purchase_orders",
    createdAt: "2026-07-11T09:15:00Z",
  },
  {
    id: "pr_003",
    agentKey: "collections",
    agentDisplayName: "Collections",
    category: "business",
    executionMode: "propose",
    riskLevel: "standard",
    status: "needs_review",
    title: "Northstar Design invoice is 18 days overdue",
    subtitle: "Receivable · draft a reminder",
    amount: 6200,
    confidence: 0.88,
    whySuggested: {
      trigger: "Invoice passed its net-30 due date with no payment or dispute logged.",
      evidence: [
        { text: "No partial payment recorded", linkedSource: ls("receivable", "receivable_pr_003_1") },
        { text: "No dispute or credit memo on file", linkedSource: ls("receivable", "receivable_pr_003_2") },
        { text: "Customer's other invoices have historically paid within terms", linkedSource: ls("receivable", "receivable_pr_003_3") },
      ],
    },
    scenarioModule: {
      kind: "message_preview",
      draft:
        "Hi Northstar team,\n\nJust a friendly note that invoice INV-2026-041 for $6,200.00, due June 25, is now past due. Could you let us know when we can expect payment, or flag anything that's holding it up?\n\nThanks,\nAccounts Receivable",
    },
    recommendedAction: "Send a friendly first reminder referencing the invoice number and due date.",
    whatHappensNext: {
      ifApproved: "A reminder email is drafted and queued for your send, or sent automatically if auto-send is on.",
      ifEdited: "You can rewrite the reminder tone or push the send date back.",
      ifRejected: "No reminder is sent; the invoice stays in aging without action.",
    },
    riskNote: "Low risk — this only sends a message, no funds move.",
    source: "ledger_receivables",
    createdAt: "2026-07-10T18:40:00Z",
  },
  {
    id: "pr_004",
    agentKey: "treasury",
    agentDisplayName: "Treasury",
    category: "business",
    executionMode: "propose",
    riskLevel: "elevated",
    status: "needs_review",
    title: "Move idle cash into treasury yield?",
    subtitle: "Operating ••4821 → Treasury (T-Bills)",
    amount: 100000,
    confidence: 0.81,
    whySuggested: {
      trigger: "Operating balance has stayed above your working-capital floor for 21 straight days.",
      evidence: [
        { text: "Current balance exceeds 60-day average obligations by $118,000", linkedSource: ls("account", "account_pr_004_1") },
        { text: "No large payables or payroll runs scheduled in the next 10 days", linkedSource: ls("account", "account_pr_004_2") },
        { text: "Comparable balance is earning near-zero yield in the operating account", linkedSource: ls("account", "account_pr_004_3") },
      ],
    },
    scenarioModule: {
      kind: "account_flow",
      from: { name: "Operating ••4821", before: 292000, after: 192000 },
      to: { name: "Treasury (T-Bills)", before: 0, after: 100000 },
      amount: 100000,
    },
    recommendedAction:
      "Sweep $100,000 into short-duration T-Bills, leaving the working-capital floor untouched.",
    whatHappensNext: {
      ifApproved:
        "A transfer proposal is sent to your banking/execution partner for you to authorize the actual movement.",
      ifEdited: "You can change the amount or choose a different instrument/maturity.",
      ifRejected: "Cash stays in the operating account; Brain will re-check in the next cycle.",
    },
    riskNote:
      "Moving funds always needs a human to actually authorize the transfer — Brain only proposes the sweep.",
    source: "ledger_balances, wiki_cash_policy",
    createdAt: "2026-07-11T07:00:00Z",
  },
  {
    id: "pr_005",
    agentKey: "cash_forecast",
    agentDisplayName: "Cash Forecasting",
    category: "business",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "13-week cash forecast updated",
    subtitle: "No shortfall risk detected",
    amount: null,
    confidence: 0.9,
    whySuggested: {
      trigger: "Weekly forecast refresh ran on schedule using latest ledger and payroll data.",
      evidence: [
        { text: "Payroll and recurring vendor payments projected against current balance", linkedSource: ls("forecast", "forecast_pr_005_1") },
        { text: "No week in the 13-week window dips below the working-capital floor", linkedSource: ls("forecast", "forecast_pr_005_2") },
        { text: "Forecast variance from last week's actuals was under 4%", linkedSource: ls("forecast", "forecast_pr_005_3") },
      ],
    },
    scenarioModule: {
      kind: "forecast_chart",
      weeks: [292, 274, 268, 281, 259, 246, 252, 238, 249, 261, 243, 256, 268],
      floor: 174,
      note: "13-week projected balance ($k) · working-capital floor $174k",
    },
    recommendedAction: "No action needed — forecast is informational this cycle.",
    whatHappensNext: {
      ifApproved: "Forecast is published to your dashboard as the current view.",
      ifEdited: "You can adjust assumptions (e.g. add a known upcoming expense) and re-run.",
      ifRejected: "Not applicable — this is a read-only update, not a proposal requiring approval.",
    },
    riskNote: "None — this is an informational update with no funds movement.",
    source: "ledger_payroll, ledger_payments, ledger_receivables",
    createdAt: "2026-07-11T06:00:00Z",
  },
  {
    id: "pr_005b",
    agentKey: "cash_forecast",
    agentDisplayName: "Cash Forecasting",
    category: "business",
    executionMode: "propose",
    riskLevel: "elevated",
    status: "needs_review",
    title: "Cash shortfall projected in week 9",
    subtitle: "Forecast dips below working-capital floor",
    amount: null,
    confidence: 0.82,
    whySuggested: {
      trigger: "The 13-week forecast now shows a balance drop below the working-capital floor in week 9.",
      evidence: [
        { text: "Large receivable from BigCo is projected 7 days later than originally scheduled", linkedSource: ls("forecast", "forecast_pr_005b_1") },
        { text: "Two vendor payments moved earlier due to renegotiated terms", linkedSource: ls("forecast", "forecast_pr_005b_2") },
        { text: "Week 9 projected balance: $142k vs. $174k floor", linkedSource: ls("forecast", "forecast_pr_005b_3") },
      ],
    },
    scenarioModule: {
      kind: "forecast_chart",
      weeks: [292, 274, 268, 281, 259, 246, 252, 238, 142, 261, 243, 256, 268],
      floor: 174,
      note: "13-week projected balance ($k) · week 9 drops below $174k floor",
    },
    recommendedAction: "Review the BigCo receivable timing or move a vendor payment to avoid the shortfall.",
    whatHappensNext: {
      ifApproved: "Brain will draft a receivable acceleration request or propose moving one vendor payment.",
      ifEdited: "You can adjust assumptions (e.g. add a confirmed inflow date) and re-run the forecast.",
      ifRejected: "Forecast stays as-is; Brain will re-check in the next cycle and alert again if the shortfall persists.",
    },
    riskNote: "A forecast shortfall is not a crisis — it gives you 9 weeks to adjust before it materializes.",
    source: "ledger_payroll, ledger_payments, ledger_receivables",
    createdAt: "2026-07-11T06:05:00Z",
  },
  {
    id: "pr_006",
    agentKey: "dispute",
    agentDisplayName: "Dispute",
    category: "business",
    executionMode: "propose",
    riskLevel: "standard",
    status: "needs_review",
    title: "Card charge disputed by customer, evidence ready",
    subtitle: "Chargeback · $840 · response due in 6 days",
    amount: 840,
    confidence: 0.76,
    whySuggested: {
      trigger: "A chargeback notification was ingested with a response deadline.",
      evidence: [
        { text: "Matching invoice and delivery confirmation found in the ledger", linkedSource: ls("payment", "payment_pr_006_1") },
        { text: "No prior dispute history from this customer", linkedSource: ls("payment", "payment_pr_006_2") },
        { text: "Response window closes in 6 days", linkedSource: ls("payment", "payment_pr_006_3") },
      ],
    },
    scenarioModule: {
      kind: "document_stack",
      docs: [
        { label: "INV-7719 · matched invoice", meta: "$840.00 · issued Jun 2" },
        { label: "Delivery confirmation", meta: "signed · Jun 6 · tracking 1Z999AA1" },
        { label: "Chargeback notice", meta: "reason: 'item not received' · respond by Jul 19" },
      ],
    },
    recommendedAction: "Submit the matched invoice and delivery confirmation as dispute evidence.",
    whatHappensNext: {
      ifApproved: "Evidence package is submitted to the payment processor's dispute portal.",
      ifEdited: "You can add or remove supporting documents before submission.",
      ifRejected:
        "No evidence is submitted; the chargeback will likely resolve in the customer's favor by default.",
    },
    riskNote: "Missing the response window means an automatic loss regardless of merits.",
    source: "ledger_payments, wiki_fulfillment_records",
    createdAt: "2026-07-09T11:20:00Z",
  },
  {
    id: "pr_007",
    agentKey: "compliance",
    agentDisplayName: "Compliance",
    category: "business",
    executionMode: "notify_only",
    riskLevel: "elevated",
    status: "needs_review",
    title: "New vendor missing a signed W-9",
    subtitle: "Onboarded 3 days ago · no tax form on file",
    amount: null,
    confidence: 0.95,
    whySuggested: {
      trigger: "A vendor was added and paid without a W-9 or equivalent tax form on record.",
      evidence: [
        { text: "No document tagged 'W-9' in this vendor's file", linkedSource: ls("vendor_document", "vendor_document_pr_007_1") },
        { text: "First payment already issued", linkedSource: ls("vendor_document", "vendor_document_pr_007_2") },
        { text: "Vendor classified as a US-based contractor", linkedSource: ls("vendor_document", "vendor_document_pr_007_3") },
      ],
    },
    scenarioModule: {
      kind: "document_checklist",
      items: [
        { label: "Contractor agreement", present: true },
        { label: "ACH authorization", present: true },
        { label: "W-9 (tax form)", present: false },
        { label: "Certificate of insurance", present: true },
      ],
    },
    recommendedAction: "Request a signed W-9 from the vendor before year-end 1099 filing.",
    whatHappensNext: {
      ifApproved: "Not applicable — this is a flag, not an action Brain can take on its own.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote:
      "Missing tax forms create year-end filing and penalty exposure, not immediate financial risk.",
    source: "wiki_vendor_documents, ledger_payments",
    createdAt: "2026-07-08T16:00:00Z",
  },
  {
    id: "pr_008",
    agentKey: "revenue_intel",
    agentDisplayName: "Revenue Intelligence",
    category: "business",
    executionMode: "notify_only",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Enterprise segment revenue up 12% month over month",
    subtitle: "Driven by 2 upsells, no churn this month",
    amount: null,
    confidence: 0.87,
    whySuggested: {
      trigger: "Monthly revenue rollup flagged a notable segment-level change.",
      evidence: [
        { text: "Two existing accounts upgraded tier this month", linkedSource: ls("subscription", "subscription_pr_008_1") },
        { text: "No cancellations recorded in the enterprise segment", linkedSource: ls("subscription", "subscription_pr_008_2") },
        { text: "Change exceeds the 10% month-over-month notification threshold", linkedSource: ls("subscription", "subscription_pr_008_3") },
      ],
    },
    scenarioModule: {
      kind: "trend_chart",
      points: [
        { label: "Feb", value: 68 },
        { label: "Mar", value: 71 },
        { label: "Apr", value: 69 },
        { label: "May", value: 73 },
        { label: "Jun", value: 74 },
        { label: "Jul", value: 83 },
      ],
      unit: "$k",
      note: "Enterprise segment monthly revenue ($k) · +12% MoM",
    },
    recommendedAction: "No action needed — informational insight only.",
    whatHappensNext: {
      ifApproved: "Not applicable — surfaced on the dashboard automatically.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — informational only.",
    source: "ledger_receivables, wiki_subscriptions",
    createdAt: "2026-07-11T05:00:00Z",
  },
  {
    id: "pr_008b",
    agentKey: "revenue_intel",
    agentDisplayName: "Revenue Intelligence",
    category: "business",
    executionMode: "notify_only",
    riskLevel: "elevated",
    status: "needs_review",
    title: "Enterprise segment revenue down 8% month over month",
    subtitle: "1 churn, no upsells · below notification threshold",
    amount: null,
    confidence: 0.85,
    whySuggested: {
      trigger: "Monthly revenue rollup flagged a decline in the enterprise segment that crossed the negative threshold.",
      evidence: [
        { text: "One enterprise account cancelled effective Jul 1", linkedSource: ls("subscription", "subscription_pr_008b_1") },
        { text: "No new upsells or expansions in the segment this month", linkedSource: ls("subscription", "subscription_pr_008b_2") },
        { text: "Decline exceeds the 5% month-over-month alert threshold", linkedSource: ls("subscription", "subscription_pr_008b_3") },
      ],
    },
    scenarioModule: {
      kind: "trend_chart",
      points: [
        { label: "Feb", value: 68 },
        { label: "Mar", value: 71 },
        { label: "Apr", value: 69 },
        { label: "May", value: 73 },
        { label: "Jun", value: 74 },
        { label: "Jul", value: 68 },
      ],
      unit: "$k",
      note: "Enterprise segment monthly revenue ($k) · -8% MoM · 1 churn",
    },
    recommendedAction: "Review the churn reason and check if the account is salvageable before the end of the grace period.",
    whatHappensNext: {
      ifApproved: "Brain will surface the churn account details and suggest a retention outreach sequence.",
      ifEdited: "Not applicable.",
      ifRejected: "Flag is dismissed; Brain will re-alert if the decline accelerates next month.",
    },
    riskNote: "Early churn signals are easiest to address within the first 14 days of cancellation.",
    source: "ledger_receivables, wiki_subscriptions",
    createdAt: "2026-07-11T05:05:00Z",
  },
  {
    id: "pr_009",
    agentKey: "reconciliation",
    agentDisplayName: "Reconciliation",
    category: "agnostic",
    executionMode: "propose",
    riskLevel: "low",
    status: "needs_review",
    title: "A bank line doesn't match the ledger",
    subtitle: "Reconciliation · propose a correcting entry",
    amount: 184,
    confidence: 0.84,
    whySuggested: {
      trigger:
        "One bank statement line has no matching ledger entry within the normal 3-day matching window.",
      evidence: [
        { text: "Amount and date closely match a merchant fee pattern seen in prior months", linkedSource: ls("bank_feed", "bank_feed_pr_009_1") },
        { text: "No existing ledger entry for this transaction ID", linkedSource: ls("bank_feed", "bank_feed_pr_009_2") },
        { text: "All other lines this period matched cleanly", linkedSource: ls("bank_feed", "bank_feed_pr_009_3") },
      ],
    },
    scenarioModule: {
      kind: "line_diff",
      columns: ["Bank statement", "Ledger"],
      rows: [
        { label: "date", a: "Jul 8", b: "—", mismatch: true },
        { label: "amount", a: "$184.00", b: "—", mismatch: true },
        { label: "description", a: "MERCH FEE 7741", b: "no matching entry", mismatch: true },
        { label: "category", a: "—", b: "merchant fees (proposed)" },
      ],
    },
    recommendedAction: "Post a correcting entry for the unmatched $184 merchant fee.",
    whatHappensNext: {
      ifApproved: "The correcting entry is posted to the ledger and the period is marked reconciled.",
      ifEdited: "You can change the entry's category or amount before posting.",
      ifRejected: "The line stays unmatched and the period remains open.",
    },
    riskNote: "Very low risk — small amount, clear pattern match to a recurring known fee type.",
    source: "ledger_bank_feed, ledger_gl",
    createdAt: "2026-07-11T12:10:00Z",
  },
  {
    id: "pr_010",
    agentKey: "subscription",
    agentDisplayName: "Subscription",
    category: "agnostic",
    executionMode: "propose",
    riskLevel: "standard",
    status: "needs_review",
    title: "Unused software seat renewing in 4 days",
    subtitle: "Figma · 1 of 8 seats inactive 60+ days",
    amount: 180,
    confidence: 0.79,
    whySuggested: {
      trigger: "A paid seat has shown no login activity for over 60 days and renews soon.",
      evidence: [
        { text: "Seat assigned to a user with no login in 63 days", linkedSource: ls("app_usage", "app_usage_pr_010_1") },
        { text: "Renewal charge scheduled in 4 days", linkedSource: ls("app_usage", "app_usage_pr_010_2") },
        { text: "7 other seats on the same plan show regular weekly use", linkedSource: ls("app_usage", "app_usage_pr_010_3") },
      ],
    },
    scenarioModule: {
      kind: "usage_timeline",
      lastActivityDaysAgo: 63,
      renewalInDays: 4,
      note: "Last login May 11 · renewal charge Jul 17",
    },
    recommendedAction: "Cancel the unused seat before renewal to avoid the charge.",
    whatHappensNext: {
      ifApproved: "A cancellation request is sent to the vendor's billing portal before the renewal date.",
      ifEdited: "You can reassign the seat to someone else instead of cancelling it.",
      ifRejected: "The seat renews as normal at full price.",
    },
    riskNote: "Low risk — worst case is simply re-adding the seat later if it turns out to be needed.",
    source: "wiki_subscriptions, wiki_app_usage",
    createdAt: "2026-07-10T09:30:00Z",
  },
  {
    id: "pr_011",
    agentKey: "fraud_anomaly",
    agentDisplayName: "Fraud & Anomaly",
    category: "agnostic",
    executionMode: "notify_only",
    riskLevel: "high",
    status: "needs_review",
    title: "Two invoices from different vendors share a phone number",
    subtitle: "Cross-vendor pattern · possible shell entities",
    amount: null,
    confidence: 0.68,
    whySuggested: {
      trigger: "Contact details on two supposedly unrelated vendors overlap.",
      evidence: [
        { text: "Same phone number listed on both vendor records", linkedSource: ls("counterparty", "counterparty_pr_011_1") },
        { text: "Both vendors added within the same 10-day window", linkedSource: ls("counterparty", "counterparty_pr_011_2") },
        { text: "Combined billing to date across both vendors: $9,400", linkedSource: ls("counterparty", "counterparty_pr_011_3") },
      ],
    },
    scenarioModule: {
      kind: "entity_comparison",
      sharedNote: "Shared field highlighted in both records",
      entities: [
        {
          label: "Halton Creative Co.",
          fields: [
            { label: "added", value: "Jun 28" },
            { label: "phone", value: "(415) 555-0182", differs: true },
            { label: "billed to date", value: "$5,600" },
            { label: "email", value: "ap@haltoncreative.co" },
          ],
        },
        {
          label: "Meridian Studio Labs",
          fields: [
            { label: "added", value: "Jul 6" },
            { label: "phone", value: "(415) 555-0182", differs: true },
            { label: "billed to date", value: "$3,800" },
            { label: "email", value: "billing@meridianstudiolabs.com" },
          ],
        },
      ],
    },
    recommendedAction:
      "Manually verify both vendors are legitimate, separate businesses before further payments.",
    whatHappensNext: {
      ifApproved: "Not applicable — this is a flag, not an action Brain can take on its own.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote:
      "Shared contact details across vendors is a common shell-vendor fraud pattern; confidence is moderate, so this needs human judgment, not automatic action.",
    source: "ledger_counterparties",
    createdAt: "2026-07-09T20:45:00Z",
  },
  /* ── Auto-approved twins — one per agent so the Approved Automatically tab
     shows every agent's UX (11 total, per user request). These are historical
     records Brain cleared on its own; titles reflect the past-tense outcome. */
  {
    id: "pr_a001",
    agentKey: "vendor_risk",
    agentDisplayName: "Vendor Risk",
    category: "business",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Bank details verified with vendor",
    subtitle: "Bright Futures Studio · change confirmed",
    amount: 3200,
    confidence: 0.94,
    whySuggested: {
      trigger: "Vendor confirmed the new account via a signed change-of-details form.",
      evidence: [
        { text: "Signed form received and matched to vendor contact", linkedSource: ls("counterparty", "counterparty_pr_a001_1") },
        { text: "New account details now on file as primary", linkedSource: ls("counterparty", "counterparty_pr_a001_2") },
        { text: "No fraud indicators on the new routing number", linkedSource: ls("counterparty", "counterparty_pr_a001_3") },
      ],
    },
    scenarioModule: {
      kind: "account_comparison",
      old: {
        label: "Previous account",
        fields: [
          { label: "bank", value: "Chase" },
          { label: "account", value: "••7742" },
          { label: "routing", value: "021000021" },
        ],
      },
      next: {
        label: "Verified new account",
        fields: [
          { label: "bank", value: "Regions" },
          { label: "account", value: "••9963" },
          { label: "routing", value: "062005690" },
          { label: "verified on", value: "Jul 9" },
        ],
      },
    },
    recommendedAction: "No action needed — Brain auto-approved after vendor verification.",
    whatHappensNext: {
      ifApproved: "Not applicable — already approved.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — verification form reduced risk to low.",
    source: "ledger_counterparties",
    createdAt: "2026-07-09T10:00:00Z",
  },
  {
    id: "pr_a002",
    agentKey: "payment",
    agentDisplayName: "Payment",
    category: "business",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "3 vendor invoices batched and scheduled",
    subtitle: "Due within 5 days · no exceptions found",
    amount: 14850,
    confidence: 0.96,
    whySuggested: {
      trigger: "Invoices matched to approved POs and within normal payment terms are due soon.",
      evidence: [
        { text: "All 3 invoices matched 1:1 to open purchase orders", linkedSource: ls("invoice", "invoice_pr_a002_1") },
        { text: "Combined batch fits within this week's operating cash buffer", linkedSource: ls("invoice", "invoice_pr_a002_2") },
        { text: "No vendor or amount anomalies detected", linkedSource: ls("invoice", "invoice_pr_a002_3") },
      ],
    },
    scenarioModule: {
      kind: "document_stack",
      docs: [
        { label: "INV-8841 · Apex Manufacturing", meta: "$5,400 · matched PO-2210 · paid Jul 15" },
        { label: "INV-0392 · Northwind Logistics", meta: "$6,250 · matched PO-2214 · paid Jul 16" },
        { label: "INV-1177 · Corta Print Co.", meta: "$3,200 · matched PO-2217 · paid Jul 17" },
      ],
    },
    recommendedAction: "No action needed — payments were auto-scheduled on their due dates.",
    whatHappensNext: {
      ifApproved: "Not applicable — already approved and scheduled.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — routine batch with no flagged exceptions.",
    source: "ledger_invoices, ledger_purchase_orders",
    createdAt: "2026-07-08T09:00:00Z",
  },
  {
    id: "pr_a003",
    agentKey: "collections",
    agentDisplayName: "Collections",
    category: "business",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Overdue invoice reminder sent",
    subtitle: "Northstar Design · reminder delivered",
    amount: 6200,
    confidence: 0.91,
    whySuggested: {
      trigger: "Invoice passed its net-30 due date; a friendly reminder was auto-sent.",
      evidence: [
        { text: "Reminder email delivered and opened by customer", linkedSource: ls("receivable", "receivable_pr_a003_1") },
        { text: "No dispute or credit memo on file", linkedSource: ls("receivable", "receivable_pr_a003_2") },
        { text: "Customer has historically paid within 5 days of reminder", linkedSource: ls("receivable", "receivable_pr_a003_3") },
      ],
    },
    scenarioModule: {
      kind: "message_preview",
      draft:
        "Hi Northstar team,\n\nJust a friendly note that invoice INV-2026-041 for $6,200.00, due June 25, is now past due. Could you let us know when we can expect payment, or flag anything that's holding it up?\n\nThanks,\nAccounts Receivable",
    },
    recommendedAction: "No action needed — reminder was auto-sent and customer opened it.",
    whatHappensNext: {
      ifApproved: "Not applicable — already sent.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — low-risk reminder with no funds movement.",
    source: "ledger_receivables",
    createdAt: "2026-07-07T18:00:00Z",
  },
  {
    id: "pr_a004",
    agentKey: "treasury",
    agentDisplayName: "Treasury",
    category: "business",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Idle cash swept to treasury yield",
    subtitle: "Operating ••4821 → Treasury (T-Bills)",
    amount: 100000,
    confidence: 0.92,
    whySuggested: {
      trigger: "Operating balance stayed above the working-capital floor for 21 days; Brain proposed a sweep.",
      evidence: [
        { text: "Sweep executed after 48-hour hold with no override", linkedSource: ls("account", "account_pr_a004_1") },
        { text: "T-Bill maturity aligns with next payroll cycle", linkedSource: ls("account", "account_pr_a004_2") },
        { text: "Working-capital floor left untouched", linkedSource: ls("account", "account_pr_a004_3") },
      ],
    },
    scenarioModule: {
      kind: "account_flow",
      from: { name: "Operating ••4821", before: 292000, after: 192000 },
      to: { name: "Treasury (T-Bills)", before: 0, after: 100000 },
      amount: 100000,
    },
    recommendedAction: "No action needed — sweep completed and yield is accruing.",
    whatHappensNext: {
      ifApproved: "Not applicable — already executed.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — funds remain inside the same custodian; maturity matches payroll.",
    source: "ledger_balances, wiki_cash_policy",
    createdAt: "2026-07-06T07:00:00Z",
  },
  {
    id: "pr_a005",
    agentKey: "cash_forecast",
    agentDisplayName: "Cash Forecasting",
    category: "business",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "13-week cash forecast refreshed",
    subtitle: "No shortfall risk · variance under 4%",
    amount: null,
    confidence: 0.93,
    whySuggested: {
      trigger: "Weekly forecast refresh ran on schedule using latest ledger and payroll data.",
      evidence: [
        { text: "Payroll and recurring vendor payments projected against current balance", linkedSource: ls("forecast", "forecast_pr_a005_1") },
        { text: "No week in the 13-week window dips below the working-capital floor", linkedSource: ls("forecast", "forecast_pr_a005_2") },
        { text: "Forecast variance from last week's actuals was under 4%", linkedSource: ls("forecast", "forecast_pr_a005_3") },
      ],
    },
    scenarioModule: {
      kind: "forecast_chart",
      weeks: [292, 274, 268, 281, 259, 246, 252, 238, 249, 261, 243, 256, 268],
      floor: 174,
      note: "13-week projected balance ($k) · working-capital floor $174k",
    },
    recommendedAction: "No action needed — forecast published to the dashboard.",
    whatHappensNext: {
      ifApproved: "Not applicable — already published.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — informational update with no funds movement.",
    source: "ledger_payroll, ledger_payments, ledger_receivables",
    createdAt: "2026-07-05T06:00:00Z",
  },
  {
    id: "pr_a006",
    agentKey: "dispute",
    agentDisplayName: "Dispute",
    category: "business",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Chargeback evidence submitted",
    subtitle: "Response filed · $840 · deadline met",
    amount: 840,
    confidence: 0.89,
    whySuggested: {
      trigger: "Chargeback response deadline was met with a matched evidence package.",
      evidence: [
        { text: "Invoice and delivery confirmation submitted to processor", linkedSource: ls("payment", "payment_pr_a006_1") },
        { text: "No prior dispute history from this customer", linkedSource: ls("payment", "payment_pr_a006_2") },
        { text: "Response filed 3 days before deadline", linkedSource: ls("payment", "payment_pr_a006_3") },
      ],
    },
    scenarioModule: {
      kind: "document_stack",
      docs: [
        { label: "INV-7719 · matched invoice", meta: "$840.00 · issued Jun 2" },
        { label: "Delivery confirmation", meta: "signed · Jun 6 · tracking 1Z999AA1" },
        { label: "Chargeback response", meta: "submitted Jul 13 · awaiting ruling" },
      ],
    },
    recommendedAction: "No action needed — evidence was auto-submitted before the deadline.",
    whatHappensNext: {
      ifApproved: "Not applicable — already submitted.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — processor is reviewing; response was complete and on time.",
    source: "ledger_payments, wiki_fulfillment_records",
    createdAt: "2026-07-04T11:00:00Z",
  },
  {
    id: "pr_a007",
    agentKey: "compliance",
    agentDisplayName: "Compliance",
    category: "business",
    executionMode: "notify_only",
    riskLevel: "low",
    status: "approved_automatically",
    title: "W-9 received and filed",
    subtitle: "Vendor now compliant · tax form on file",
    amount: null,
    confidence: 0.97,
    whySuggested: {
      trigger: "A signed W-9 was uploaded and matched to the vendor record.",
      evidence: [
        { text: "W-9 document tagged and stored in vendor file", linkedSource: ls("vendor_document", "vendor_document_pr_a007_1") },
        { text: "TIN and name match the vendor's contract on file", linkedSource: ls("vendor_document", "vendor_document_pr_a007_2") },
        { text: "Year-end 1099 filing requirement now satisfied", linkedSource: ls("vendor_document", "vendor_document_pr_a007_3") },
      ],
    },
    scenarioModule: {
      kind: "document_checklist",
      items: [
        { label: "Contractor agreement", present: true },
        { label: "ACH authorization", present: true },
        { label: "W-9 (tax form)", present: true },
        { label: "Certificate of insurance", present: true },
      ],
    },
    recommendedAction: "No action needed — vendor is now fully compliant.",
    whatHappensNext: {
      ifApproved: "Not applicable — already filed.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — all required documents are present and verified.",
    source: "wiki_vendor_documents, ledger_payments",
    createdAt: "2026-07-03T16:00:00Z",
  },
  {
    id: "pr_a008",
    agentKey: "revenue_intel",
    agentDisplayName: "Revenue Intelligence",
    category: "business",
    executionMode: "notify_only",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Revenue segment analysis published",
    subtitle: "Enterprise +12% MoM · 2 upsells, no churn",
    amount: null,
    confidence: 0.9,
    whySuggested: {
      trigger: "Monthly revenue rollup flagged a notable segment-level change.",
      evidence: [
        { text: "Two existing accounts upgraded tier this month", linkedSource: ls("subscription", "subscription_pr_a008_1") },
        { text: "No cancellations recorded in the enterprise segment", linkedSource: ls("subscription", "subscription_pr_a008_2") },
        { text: "Change exceeds the 10% month-over-month notification threshold", linkedSource: ls("subscription", "subscription_pr_a008_3") },
      ],
    },
    scenarioModule: {
      kind: "trend_chart",
      points: [
        { label: "Feb", value: 68 },
        { label: "Mar", value: 71 },
        { label: "Apr", value: 69 },
        { label: "May", value: 73 },
        { label: "Jun", value: 74 },
        { label: "Jul", value: 83 },
      ],
      unit: "$k",
      note: "Enterprise segment monthly revenue ($k) · +12% MoM",
    },
    recommendedAction: "No action needed — insight surfaced on the dashboard automatically.",
    whatHappensNext: {
      ifApproved: "Not applicable — already published.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — informational only.",
    source: "ledger_receivables, wiki_subscriptions",
    createdAt: "2026-07-02T05:00:00Z",
  },
  {
    id: "pr_a009",
    agentKey: "reconciliation",
    agentDisplayName: "Reconciliation",
    category: "agnostic",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Unmatched line reconciled",
    subtitle: "$184 merchant fee · correcting entry posted",
    amount: 184,
    confidence: 0.93,
    whySuggested: {
      trigger: "The unmatched bank line was matched to a recurring merchant fee pattern and posted.",
      evidence: [
        { text: "Amount and date closely match prior-month merchant fees", linkedSource: ls("bank_feed", "bank_feed_pr_a009_1") },
        { text: "Correcting entry posted to the ledger under merchant fees", linkedSource: ls("bank_feed", "bank_feed_pr_a009_2") },
        { text: "Period now marked reconciled", linkedSource: ls("bank_feed", "bank_feed_pr_a009_3") },
      ],
    },
    scenarioModule: {
      kind: "line_diff",
      columns: ["Bank statement", "Ledger"],
      rows: [
        { label: "date", a: "Jul 8", b: "Jul 8" },
        { label: "amount", a: "$184.00", b: "$184.00" },
        { label: "description", a: "MERCH FEE 7741", b: "merchant fees" },
        { label: "category", a: "—", b: "merchant fees (posted)" },
      ],
    },
    recommendedAction: "No action needed — entry was auto-posted and period is reconciled.",
    whatHappensNext: {
      ifApproved: "Not applicable — already posted.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — small amount, clear pattern, period closed cleanly.",
    source: "ledger_bank_feed, ledger_gl",
    createdAt: "2026-07-01T12:00:00Z",
  },
  {
    id: "pr_a010",
    agentKey: "subscription",
    agentDisplayName: "Subscription",
    category: "agnostic",
    executionMode: "propose",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Unused seat cancelled before renewal",
    subtitle: "Figma · 1 of 8 seats removed · $180 saved",
    amount: 180,
    confidence: 0.91,
    whySuggested: {
      trigger: "An inactive seat was flagged and cancelled before the renewal charge.",
      evidence: [
        { text: "Seat showed no login in 63 days", linkedSource: ls("app_usage", "app_usage_pr_a010_1") },
        { text: "Cancellation executed 2 days before renewal", linkedSource: ls("app_usage", "app_usage_pr_a010_2") },
        { text: "$180 annual charge avoided", linkedSource: ls("app_usage", "app_usage_pr_a010_3") },
      ],
    },
    scenarioModule: {
      kind: "usage_timeline",
      lastActivityDaysAgo: 63,
      renewalInDays: 0,
      note: "Seat cancelled Jul 13 · $180 saved",
    },
    recommendedAction: "No action needed — seat was auto-cancelled and charge was avoided.",
    whatHappensNext: {
      ifApproved: "Not applicable — already cancelled.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — seat can be re-added later if needed.",
    source: "wiki_subscriptions, wiki_app_usage",
    createdAt: "2026-07-01T09:30:00Z",
  },
  {
    id: "pr_a011",
    agentKey: "fraud_anomaly",
    agentDisplayName: "Fraud & Anomaly",
    category: "agnostic",
    executionMode: "notify_only",
    riskLevel: "low",
    status: "approved_automatically",
    title: "Vendor phone number verified",
    subtitle: "Halton & Meridian · shared line is a branch office",
    amount: null,
    confidence: 0.95,
    whySuggested: {
      trigger: "Contact overlap was investigated and resolved as a shared branch-office line.",
      evidence: [
        { text: "Both vendors confirmed the same front-desk number at a shared coworking space", linkedSource: ls("counterparty", "counterparty_pr_a011_1") },
        { text: "Separate tax IDs, contracts, and banking details verified", linkedSource: ls("counterparty", "counterparty_pr_a011_2") },
        { text: "No further payments flagged", linkedSource: ls("counterparty", "counterparty_pr_a011_3") },
      ],
    },
    scenarioModule: {
      kind: "entity_comparison",
      sharedNote: "Shared line explained: both vendors use the same coworking front desk",
      entities: [
        {
          label: "Halton Creative Co.",
          fields: [
            { label: "tax id", value: "XX-XXXXXXX" },
            { label: "phone", value: "(415) 555-0182" },
            { label: "billed to date", value: "$5,600" },
            { label: "verified", value: "Jul 10" },
          ],
        },
        {
          label: "Meridian Studio Labs",
          fields: [
            { label: "tax id", value: "YY-YYYYYYY" },
            { label: "phone", value: "(415) 555-0182" },
            { label: "billed to date", value: "$3,800" },
            { label: "verified", value: "Jul 10" },
          ],
        },
      ],
    },
    recommendedAction: "No action needed — vendors are legitimate; anomaly cleared.",
    whatHappensNext: {
      ifApproved: "Not applicable — already cleared.",
      ifEdited: "Not applicable.",
      ifRejected: "Not applicable.",
    },
    riskNote: "None — investigation reduced risk to low; both vendors are separate, verified businesses.",
    source: "ledger_counterparties",
    createdAt: "2026-06-30T20:45:00Z",
  },
];

/* ── Decision store — user-driven status overrides, shared app-wide ──────
   approved / rejected / acknowledged records drop out of Needs Review;
   an auto-approved record's Undo moves it back into Needs Review. */

export type AgentDecision = "approved" | "rejected" | "acknowledged" | "undone_to_review";

let decisions: Record<string, AgentDecision> = {};
const listeners = new Set<() => void>();

function emit() {
  decisions = { ...decisions };
  listeners.forEach((l) => l());
}

export function decideAgentProposal(id: string, decision: AgentDecision) {
  decisions[id] = decision;
  emit();
}

export function clearAgentDecision(id: string) {
  delete decisions[id];
  emit();
}

export function useAgentDecisions(): Record<string, AgentDecision> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => decisions,
  );
}

/* List helpers — apply decisions on top of the seeded status. */
export function needsReviewList(d: Record<string, AgentDecision>): AgentProposal[] {
  return AGENT_PROPOSALS.filter((p) => {
    const dec = d[p.id];
    if (p.status === "needs_review") return dec === undefined;
    return dec === "undone_to_review";
  });
}

export function autoApprovedList(d: Record<string, AgentDecision>): AgentProposal[] {
  return AGENT_PROPOSALS.filter(
    (p) => p.status === "approved_automatically" && d[p.id] === undefined,
  );
}
