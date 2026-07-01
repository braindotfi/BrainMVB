/* Data model for the "Needs Review" approval surface.
   Brain is PROPOSE-ONLY: it analyses and proposes, a human approves, then a
   SEPARATE execution service settles. Nothing here moves money. */

export type Agent = "invoice" | "collections" | "cash" | "close";
export type Surface = "business" | "individual";
export type Severity = "clean" | "info" | "warning" | "danger";
export type ProposalStatus =
  | "pending"
  | "executing"
  | "executed"
  | "rejected"
  | "postponed"
  | "verifying"
  | "auto_handled";

export interface ReasonChip {
  label: string;
  severity: Severity;
}

export interface EvidenceItem {
  kind:
    | "invoice"
    | "transaction"
    | "prior_payment"
    | "contract"
    | "ledger_entry"
    | "forecast";
  title: string;
  subtitle: string;
  href?: string;
}

export interface FactRow {
  label: string;
  value: string;
  severity?: Severity;
}

export interface ConfidenceInfo {
  score: number; // 0..1
  band: "low" | "medium" | "high";
  caveat: string;
}

export interface PolicyRef {
  id: string;
  explanation: string;
  autoClearedOtherwise: boolean;
}

export interface ActionConfig {
  approve: { label: string; sublabel?: string };
  reject: { label: string; sublabel?: string };
  postpone: { label: string; sublabel?: string };
  verifyFirst?: { label: string; sublabel?: string };
}

export interface HandoffStep {
  label: string;
  timestamp: string;
  note?: string;
  done: boolean;
}

export interface ProblemReport {
  id: string;
  ruleId: string; // the AutoRule.id this was filed against
  proposalId: string; // the receipt that triggered the report
  reason: string;
  note?: string;
  reportedAtLabel: string;
  resolved: boolean;
}

/* What a rule DOES, used to group the Rules page into typed sections:
   - automation: acts for you (auto-clears matching payments)
   - guardrail:  pulls you back in above a threshold (asks before acting)
   - always_on:  a protection that can't be turned off (locked) */
export type RuleKind = "automation" | "guardrail" | "always_on";

export interface AutoRule {
  id: string; // URL-safe slug, e.g. "utility" — used by the /rules/:id route
  name: string;
  summary: string;
  createdLabel: string;
  policyId: string;
  active: boolean;
  kind?: RuleKind; // section the rule belongs to (defaults to "automation")
  locked?: boolean; // always_on rules — no pause/delete toggle
  /* Scope — drives remediations + "related pending item" flagging. */
  agent?: Agent;
  category?: string; // e.g. "utility", "software subscription"
  cap?: number; // amount ceiling this rule auto-clears under
  threshold?: number; // guardrail trip point / sweep amount (inline-editable)
  thresholdEditable?: boolean; // whether the threshold pill is editable inline
  allowlist?: string[]; // trusted vendor names
  scopeSummary?: string; // plain-language scope, e.g. "trusted utility vendors under $1,000"
  problemReports?: ProblemReport[];
  userCreated?: boolean; // authored via the "New rule" creator (persisted per tenant); the "Your Rules" tab shows only these
}

/* Evidence-backed AI suggestion: a proposed rule Brain noticed a pattern for,
   shown with the facts behind it. Default OFF/unaccepted — the user must
   explicitly accept (which runs the create-rule flow). */
export interface RuleSuggestion {
  id: string;
  title: string;
  description: string;
  proposedRule: Partial<AutoRule>;
  evidence: FactRow[];
  confidence: "low" | "medium" | "high";
  dismissed: boolean;
}

export interface SweepMath {
  totalCash: number;
  pendingAP: number;
  bufferMonths: number;
  bufferAmount: number;
  sweepAmount: number;
  operatingAfter: number;
  runwayAfterMonths: number;
}

export interface Proposal {
  id: string;
  auditId: string;
  agent: Agent;
  surface: Surface;
  title: string;
  rowSubtitle: string;
  actionStatement: string; // "Propose paying Bright Futures Studio $3,200"
  actionMeta: string; // "from Operating ••4821 · due Mon Jul 6"
  executionLabel: string; // post-approve mechanic, e.g. "ACH initiates Mon AM"
  cancelDeadlineLabel: string; // e.g. "cancel until 5:00 PM ET"
  amount?: number;
  amountDisplay?: string;
  counterparty?: string;
  dueLabel?: string;
  severity: Severity;
  reasonChips: ReasonChip[];
  rationale: string;
  facts?: FactRow[];
  evidence: EvidenceItem[];
  confidence: ConfidenceInfo;
  whatHappensNext: string;
  risk: string;
  policy: PolicyRef;
  actions: ActionConfig;
  status: ProposalStatus;
  sweepMath?: SweepMath;
  batchApprovable?: boolean;
  policyThreshold?: string;
  /* Present only for status === "auto_handled" — a settled receipt, not a decision. */
  pastTenseStatement?: string; // "Paid Con Edison $486"
  settledMeta?: string; // "from Operating ••4821 · settled today 8:02 AM ET · you set a rule that allows this"
  handoffTimeline?: HandoffStep[]; // proposed → approved automatically by rule → execution settled
  clearedBecause?: FactRow[]; // positive evidence: why it qualified
  rule?: AutoRule; // the standing rule that authorized it
  /* Link to the source invoice document (if this proposal was generated from one). */
  invoiceId?: string;
}

export interface AccountSummary {
  totalCash: number;
  runwayMonths: number;
  pendingAPTotal: number;
}
