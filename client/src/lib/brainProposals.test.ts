import { describe, it, expect } from "vitest";
import { agentKeyForProposalType, isNeedsReview, type ProposalStatus, type ProposalType } from "./brainProposals";
import type { AgentKey } from "./agentProposals";

/**
 * Pure queue-membership helper (isNeedsReview) and the wire-type -> AgentKey
 * identity mapping. No network - see server/brain/bff-invariants.test.ts for
 * the BFF decide-route invariants (token routing, actor stripping, error relay).
 */

function proposal(status: ProposalStatus) {
  return { status };
}

describe("isNeedsReview", () => {
  it("is true for pending and its long-form aliases", () => {
    expect(isNeedsReview(proposal("pending"))).toBe(true);
    expect(isNeedsReview(proposal("pending_approval"))).toBe(true);
    expect(isNeedsReview(proposal("awaiting_second_approval"))).toBe(true);
  });
  it("is false for every decided status", () => {
    expect(isNeedsReview(proposal("approved"))).toBe(false);
    expect(isNeedsReview(proposal("rejected"))).toBe(false);
    expect(isNeedsReview(proposal("acknowledged"))).toBe(false);
    expect(isNeedsReview(proposal("undone"))).toBe(false);
  });
});

describe("agentKeyForProposalType", () => {
  it("maps every one of the 11 wire types to the identical AgentKey string", () => {
    const types: ProposalType[] = [
      "vendor_risk",
      "payment",
      "collections",
      "treasury",
      "cash_forecast",
      "dispute",
      "compliance",
      "revenue_intel",
      "reconciliation",
      "subscription",
      "fraud_anomaly",
    ];
    for (const type of types) {
      expect(agentKeyForProposalType(type)).toBe(type as unknown as AgentKey);
    }
  });
});
