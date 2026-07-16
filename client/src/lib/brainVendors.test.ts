import { describe, it, expect } from "vitest";
import { mapCounterpartyToVendor, type BrainCounterparty } from "./brainVendors";

/**
 * mapCounterpartyToVendor's only real branch is trust-status derivation from
 * brain-core's actual risk fields. This pins the honesty invariant: only
 * `risk_level` in {high, sanctioned} may produce "under_review" - everything
 * else (including a merely "unverified" counterparty) defaults "new", because
 * brain-core reports no payment history here to ever justify "known"/"trusted".
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
});
