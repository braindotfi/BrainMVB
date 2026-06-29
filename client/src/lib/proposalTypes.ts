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
  | "verifying";

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
}

export interface AccountSummary {
  totalCash: number;
  runwayMonths: number;
  pendingAPTotal: number;
  autoHandledCount: number;
  autoHandledTotal: number;
}
