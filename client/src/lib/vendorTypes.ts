/* Vendor trust model - the spine of the allowlist picker and automation eligibility.
   Trust is a status granted by the user, informed by Brain, and it gates auto-clear. */

export type TrustStatus = "new" | "known" | "trusted" | "under_review";

export type VendorFlagKind =
  | "bank_detail_change"
  | "amount_anomaly"
  | "reported_problem"
  | "possible_duplicate";

export interface VendorFlag {
  kind: VendorFlagKind;
  label: string;
  raisedAtLabel: string;
  priorAccountLast4?: string;
  newAccountLast4?: string;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  trustStatus: TrustStatus;
  payeeAccountLast4: string;
  history: {
    paymentCount: number;
    totalPaid: number;
    firstPaidLabel: string;
    lastPaidLabel: string;
    avgAmount: number;
    flagCount: number;
  };
  flags: VendorFlag[];
  trustGrantedLabel?: string; // e.g. "You trusted this vendor Jun 12 · 7 payments since"
  wasTrustedLabel?: string; // for under_review: "was trusted since May 2"
  eligibleForTrust: boolean; // Brain's signal → drives suggestion (known only)
  eligibilityEvidence?: FactRow[];
  ruleIds: string[]; // rules whose allowlist includes this vendor
}

/* FactRow - local definition so vendorTypes has no external dep. */
export interface FactRow {
  label: string;
  value: string;
  severity?: "warning" | "danger" | "info";
}
