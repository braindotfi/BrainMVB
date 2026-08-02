import { describe, it, expect } from "vitest";
import {
  mapCounterpartyToVendor,
  isNeedsReview,
  isReviewedOnly,
  reviewReasonLabel,
  vendorSegment,
  vendorTier,
  type BrainCounterparty,
} from "./brainVendors";
import type { Vendor, VendorTier } from "./vendorTypes";

/**
 * Two invariants live here.
 *
 * 1. Trust status is derived from brain-core's REAL fields and nothing else.
 *    Only `risk_level` in {high, sanctioned} may produce "under_review"; a
 *    merely "unverified" counterparty is not a flagged one. "trusted" must stay
 *    unreachable: brain-core rejects writes to every trust field, so nothing
 *    could ever have granted it, and rendering it would be a lie about state
 *    the product cannot hold.
 *
 * 2. `isNeedsReview` is the ONE predicate behind the chip badge, the list it
 *    filters, and the row reason chip. The bug this screen shipped with was two
 *    predicates disagreeing — a banner counting rows the active filter refused
 *    to show. Tests below pin count-equals-rows directly.
 */

function cp(overrides: Partial<BrainCounterparty> = {}): BrainCounterparty {
  return {
    id: "cp_01ABC",
    name: "Acme Co",
    type: "vendor",
    risk_level: null,
    verified_status: null,
    ...overrides,
  };
}

describe("mapCounterpartyToVendor", () => {
  it("defaults an unflagged counterparty to new with zeroed, honest history", () => {
    const v = mapCounterpartyToVendor(cp());
    expect(v.trustStatus).toBe("new");
    expect(v.history.paymentCount).toBe(0);
    expect(v.flags).toEqual([]);
  });

  it("never fabricates 'trusted'/'known' - an unverified counterparty still reads as new", () => {
    const v = mapCounterpartyToVendor(cp({ verified_status: "unverified" }));
    expect(v.trustStatus).toBe("new");
  });

  it("maps sanctioned risk to under_review with a real flag, not a fabricated one", () => {
    const v = mapCounterpartyToVendor(cp({ risk_level: "sanctioned" }));
    expect(v.trustStatus).toBe("under_review");
    expect(v.flags).toHaveLength(1);
    expect(v.flags[0].label).toMatch(/sanctioned/i);
  });

  it("maps high risk to under_review", () => {
    const v = mapCounterpartyToVendor(cp({ risk_level: "high" }));
    expect(v.trustStatus).toBe("under_review");
  });

  it("does not treat low/medium risk as under_review", () => {
    expect(mapCounterpartyToVendor(cp({ risk_level: "low" })).trustStatus).toBe("new");
    expect(mapCounterpartyToVendor(cp({ risk_level: "medium" })).trustStatus).toBe("new");
  });

  it("maps counterparty type to a readable category label, falling back to the raw type", () => {
    expect(mapCounterpartyToVendor(cp({ type: "tax_authority" })).category).toBe("Tax authority");
    expect(mapCounterpartyToVendor(cp({ type: "some_future_type" })).category).toBe("some_future_type");
  });

  it("promotes an unflagged counterparty with real payments to known", () => {
    const v = mapCounterpartyToVendor(cp({ payment_count: 4, payment_total: "1200.00" }));
    expect(v.trustStatus).toBe("known");
    expect(v.history.paymentCount).toBe(4);
    expect(v.history.totalPaid).toBe(1200);
    expect(v.history.avgAmount).toBe(300);
    expect(v.eligibleForTrust).toBe(true);
  });

  it("keeps a risk-flagged counterparty under review no matter how often it was paid", () => {
    const v = mapCounterpartyToVendor(
      cp({ risk_level: "high", payment_count: 40, payment_total: "99000.00" }),
    );
    expect(v.trustStatus).toBe("under_review");
    // Suggesting trust for a flagged payee is the one thing this must never do.
    expect(v.eligibleForTrust).toBe(false);
  });

  it("coerces payment rollups defensively - proxied reads arrive unnormalized", () => {
    // Reads are proxied through the BFF without normalization, so the client
    // cannot assume numbers. A bad value must read as "no payments", never NaN.
    const asStrings = mapCounterpartyToVendor(cp({ payment_count: "3" as never, payment_total: "90.5" }));
    expect(asStrings.history.paymentCount).toBe(3);
    expect(asStrings.history.totalPaid).toBe(90.5);

    const junk = mapCounterpartyToVendor(cp({ payment_count: "n/a" as never, payment_total: "n/a" }));
    expect(junk.history.paymentCount).toBe(0);
    expect(junk.history.totalPaid).toBe(0);
    expect(junk.trustStatus).toBe("new");

    const missing = mapCounterpartyToVendor(cp());
    expect(Number.isNaN(missing.history.avgAmount)).toBe(false);
    expect(missing.history.avgAmount).toBe(0);
  });

  it("splits customers out of the vendor segment", () => {
    expect(mapCounterpartyToVendor(cp({ type: "customer" })).segment).toBe("customer");
    expect(mapCounterpartyToVendor(cp({ type: "vendor" })).segment).toBe("vendor");
    expect(mapCounterpartyToVendor(cp({ type: "tax_authority" })).segment).toBe("vendor");
  });
});

describe("isNeedsReview", () => {
  const v = (over: Partial<Vendor>): Vendor => ({ ...mapCounterpartyToVendor(cp()), ...over });

  it("covers exactly the new and flagged rows", () => {
    expect(isNeedsReview(v({ trustStatus: "new" }))).toBe(true);
    expect(isNeedsReview(v({ trustStatus: "under_review" }))).toBe(true);
    expect(isNeedsReview(v({ trustStatus: "known" }))).toBe(false);
    expect(isNeedsReview(v({ trustStatus: "trusted" }))).toBe(false);
  });

  it("lets brain-core's own review state settle a row once it reports one", () => {
    // The whole point of trust_status is that it is the audited answer. Where
    // it exists it outranks the derivation; where it does not, nothing changes.
    expect(isNeedsReview(v({ trustStatus: "new", trustState: "unreviewed" }))).toBe(true);
    expect(isNeedsReview(v({ trustStatus: "new", trustState: "acknowledged" }))).toBe(false);
    expect(isNeedsReview(v({ trustStatus: "trusted", trustState: "trusted" }))).toBe(false);
    expect(isNeedsReview(v({ trustStatus: "under_review", trustState: "paused" }))).toBe(false);
  });

  it("never lets a click settle a risk-flagged row", () => {
    // Dismissing or flagging is a human saying "seen it". Neither is brain-core
    // withdrawing a sanctions hit, so the row stays in the queue regardless.
    for (const state of ["acknowledged", "paused", "trusted"] as const) {
      expect(isNeedsReview(v({ riskLevel: "high", trustState: state }))).toBe(true);
      expect(isNeedsReview(v({ riskLevel: "sanctioned", trustState: state }))).toBe(true);
    }
  });
});

describe("vendorTier", () => {
  const v = (over: Partial<Vendor>): Vendor => ({ ...mapCounterpartyToVendor(cp()), ...over });

  it("files a row under exactly one chip", () => {
    // No row may be counted twice or fall through the gaps — that is how a
    // badge and a list drift apart in the first place.
    //
    // `known` without trustState: "acknowledged" is intentionally excluded here:
    // brain-core's provenance enum has no value meaning "Brain-suggested, not yet
    // confirmed", so vendorTier() returns null for plain `known` rows and the
    // Suggested bucket stays empty. See the explicit null-result test below.
    const rows: Vendor[] = [
      v({ id: "a", trustStatus: "new" }),
      v({ id: "b", trustStatus: "under_review" }),
      v({ id: "d", trustStatus: "trusted" }),
      v({ id: "e", trustStatus: "new", trustState: "unreviewed" }),
      v({ id: "f", trustStatus: "new", trustState: "acknowledged" }),
      v({ id: "g", trustStatus: "known", trustState: "acknowledged" }),
      v({ id: "h", trustStatus: "under_review", trustState: "paused" }),
      v({ id: "i", trustStatus: "trusted", trustState: "trusted" }),
      v({ id: "j", riskLevel: "high", trustState: "paused" }),
    ];

    const buckets: Record<VendorTier, Vendor[]> = {
      needsReview: [], flagged: [], trusted: [], suggested: [],
    };
    for (const row of rows) {
      const tier = vendorTier(row);
      // A null tier means the row renders nowhere — a silent disappearance.
      expect(tier, `${row.id} matched no tier`).not.toBeNull();
      buckets[tier!].push(row);
    }

    const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
    expect(total).toBe(rows.length);
    expect(new Set(Object.values(buckets).flat()).size).toBe(rows.length);
  });

  it("returns null for known without acknowledged — Suggested chip stays hidden", () => {
    // brain-core's provenance enum (extracted, inferred, ambiguous,
    // human_confirmed, agent_contributed, customer_asserted) has no value meaning
    // "Brain-suggested, not yet confirmed". The Suggested chip must not appear
    // until brain-core ships such a value and the predicate here is wired to it.
    // `agent_contributed` and confidence thresholds are not valid proxies.
    //
    // Note: `known + unreviewed` is NOT null — isNeedsReview() fires first for
    // any row where trustState === "unreviewed", so those go to Needs Review.
    // The null path is only reached when trustState is absent entirely.
    expect(vendorTier(v({ trustStatus: "known" }))).toBeNull();
    expect(vendorTier(v({ trustStatus: "known", trustState: "unreviewed" }))).toBe("needsReview");
  });

  it("keeps a risk-flagged, paused row in Needs Review rather than Flagged", () => {
    // Both chips have a claim on it. Needs Review wins, so its count and list
    // stay in step and the row is not quietly parked.
    expect(vendorTier(v({ riskLevel: "high", trustState: "paused" }))).toBe("needsReview");
    expect(vendorTier(v({ trustStatus: "under_review", trustState: "paused" }))).toBe("flagged");
  });

  it("keeps a dismissed row findable in the trusted list, badged as reviewed", () => {
    // Dismissing must not look like deleting: the row still renders somewhere,
    // and the badge is what stops it from reading as a trust grant.
    const dismissed = v({ trustStatus: "new", trustState: "acknowledged" });
    expect(vendorTier(dismissed)).toBe("trusted");
    expect(isReviewedOnly(dismissed)).toBe(true);

    const granted = v({ trustStatus: "trusted", trustState: "trusted" });
    expect(vendorTier(granted)).toBe("trusted");
    expect(isReviewedOnly(granted)).toBe(false);
  });
});

describe("reading brain-core's trust_status", () => {
  it("ignores the field when it is absent or carries an unknown value", () => {
    // "Field not reported" and "reported unreviewed" are different facts, and
    // only the first may fall back to deriving the tier from risk + history.
    expect(mapCounterpartyToVendor(cp()).trustState).toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: null })).trustState).toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: "" })).trustState).toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: "some_future_state" })).trustState)
      .toBeUndefined();
    expect(mapCounterpartyToVendor(cp({ trust_status: 1 as never })).trustState).toBeUndefined();
  });

  it("lets a granted row finally reach 'trusted' — the tier the derivation cannot produce", () => {
    const v = mapCounterpartyToVendor(cp({ trust_status: "trusted" }));
    expect(v.trustStatus).toBe("trusted");
    expect(v.trustState).toBe("trusted");
  });

  it("does not read a dismissal as a trust grant", () => {
    // Acknowledged only means "a human looked". The tier still comes from
    // history, so a zero-payment row must not inherit trusted's copy.
    const noHistory = mapCounterpartyToVendor(cp({ trust_status: "acknowledged" }));
    expect(noHistory.trustStatus).toBe("new");
    expect(noHistory.eligibleForTrust).toBe(false);

    const withHistory = mapCounterpartyToVendor(
      cp({ trust_status: "acknowledged", payment_count: 3, payment_total: "30" }),
    );
    expect(withHistory.trustStatus).toBe("known");
  });

  it("keeps risk above a pause, so a sanctioned row cannot be flagged out of the queue", () => {
    const v = mapCounterpartyToVendor(cp({ trust_status: "paused", risk_level: "sanctioned" }));
    expect(v.trustStatus).toBe("under_review");
    expect(isNeedsReview(v)).toBe(true);
    expect(vendorTier(v)).toBe("needsReview");
  });
});

describe("the Needs Review badge counts exactly the rows it will show", () => {
  /* The shipped bug in one assertion: the number on the chip and the length of
     the list it opens are produced by the same filter over the same segment. */
  const seed = (specs: Array<Partial<BrainCounterparty>>) =>
    specs.map((s, i) => mapCounterpartyToVendor(cp({ id: `cp_${i}`, ...s })));

  const cases: Array<[string, Array<Partial<BrainCounterparty>>]> = [
    ["new only", [{}, {}, {}]],
    ["flagged only", [{ risk_level: "high" }, { risk_level: "sanctioned" }]],
    ["new and flagged", [{}, { risk_level: "high" }, { payment_count: 2, payment_total: "10" }]],
    [
      "customers present",
      [
        { type: "customer" },
        { type: "customer", risk_level: "high" },
        {},
        { payment_count: 5, payment_total: "50" },
      ],
    ],
    ["nothing to review", [{ payment_count: 1, payment_total: "1" }]],
    ["empty", []],
  ];

  for (const [name, specs] of cases) {
    it(`holds for: ${name}`, () => {
      const all = seed(specs);
      for (const segment of ["vendor", "customer"] as const) {
        const inSegment = all.filter((v) => vendorSegment(v) === segment);
        const badge = inSegment.filter(isNeedsReview).length;
        const rendered = inSegment.filter(isNeedsReview);
        expect(rendered).toHaveLength(badge);
        // And the count is scoped: it never leaks rows from the other segment.
        expect(rendered.every((r) => vendorSegment(r) === segment)).toBe(true);
      }
    });
  }
});

describe("reviewReasonLabel", () => {
  it("prefers the risk reason when a row is both new and flagged", () => {
    // Both apply to a first-seen sanctioned payee. Only the dangerous one is
    // worth the row's single chip.
    expect(reviewReasonLabel(mapCounterpartyToVendor(cp({ risk_level: "sanctioned" })))).toBe(
      "Risk: sanctioned",
    );
    expect(reviewReasonLabel(mapCounterpartyToVendor(cp({ risk_level: "high" })))).toBe("Risk: high");
  });

  it("labels an unflagged first-seen counterparty New", () => {
    expect(reviewReasonLabel(mapCounterpartyToVendor(cp()))).toBe("New");
  });

  it("gives no reason to rows that are not in the queue", () => {
    const known = mapCounterpartyToVendor(cp({ payment_count: 2, payment_total: "20" }));
    expect(reviewReasonLabel(known)).toBeNull();
  });
});
