/* Vendor trust model - the spine of the allowlist picker and automation eligibility.
   Trust is a status granted by the user, informed by Brain, and it gates auto-clear. */

export type TrustStatus = "new" | "known" | "trusted" | "under_review";

/** brain-core's forthcoming review state, read from the counterparty's
 *  `trust_status` field. This is the CANONICAL, audited answer to "has a human
 *  dealt with this row?" — distinct from `TrustStatus` above, which this app
 *  derives from risk + payment history to decide which tier a row displays in.
 *
 *  Not yet emitted upstream: every read is optional and falls back to today's
 *  derivation. See brainVendors.ts for the predicate and the mapping rules.
 *    unreviewed   — nobody has acted on it (default)
 *    trusted      — user granted trust ("Confirmed" on the Customers segment)
 *    paused       — user flagged it
 *    acknowledged — user dismissed it without granting or flagging */
export type TrustState = "unreviewed" | "trusted" | "paused" | "acknowledged";

/** Which segment of the Counterparties screen a row belongs to. brain-core's
 *  counterparty `type` enum mixes people we pay with people who pay us; the
 *  screen splits them so "the people and businesses you pay" stays true. */
export type CounterpartySegment = "vendor" | "customer";

/** The chip a row is filed under. Named by meaning, not by label: the Customers
 *  segment renders "trusted" as "Confirmed", and the label is the only thing
 *  that differs — same state, same endpoint. */
export type VendorTier = "needsReview" | "flagged" | "trusted" | "suggested" | "informational";

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
  /** Set when the row is a placeholder brain-core keeps for a source document
   *  rather than a party anyone transacts with — today only the payroll
   *  register (`type: "other"` + `metadata.source_kind === "payroll_register"`).
   *  Such a row is informational: it renders read-only and carries no trust
   *  controls, because no trust transition is meaningful on it. `undefined` is
   *  the normal case and means the row behaves like any other counterparty. */
  informationalSource?: "payroll_register";
  /** brain-core's canonical review state, when it reports one. `undefined`
   *  means the field was absent from the read — NOT "unreviewed". The two are
   *  kept apart on purpose: absent means we fall back to deriving the tier from
   *  risk + history, whereas "unreviewed" is a fact brain-core asserted. */
  trustState?: TrustState;
}

/* FactRow - local definition so vendorTypes has no external dep. */
export interface FactRow {
  label: string;
  value: string;
  severity?: "warning" | "danger" | "info";
}
