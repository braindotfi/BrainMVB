/* Vendor trust model - the spine of the allowlist picker and automation eligibility.
   Trust is a status granted by the user, informed by Brain, and it gates auto-clear. */

export type TrustStatus = "new" | "known" | "trusted" | "under_review";

/** Which segment of the Counterparties screen a row belongs to. brain-core's
 *  counterparty `type` enum mixes people we pay with people who pay us; the
 *  screen splits them so "the people and businesses you pay" stays true. */
export type CounterpartySegment = "vendor" | "customer";

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
  /** Vendors/Customers segment. Optional: mock fixtures predate the split and
   *  are treated as "vendor" by the segment helper. */
  segment?: CounterpartySegment;
  /** brain-core `risk_level`, kept only when it is review-worthy. Drives the
   *  short reason chip; absent on fixtures that carry hand-written flags. */
  riskLevel?: "high" | "sanctioned" | null;
}

/* FactRow - local definition so vendorTypes has no external dep. */
export interface FactRow {
  label: string;
  value: string;
  severity?: "warning" | "danger" | "info";
}
