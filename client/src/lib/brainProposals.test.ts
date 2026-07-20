import { describe, it, expect } from "vitest";
import {
  agentKeyForProposalType,
  isNeedsReview,
  selectNonFinancialProposals,
  type BrainProposal,
  type ProposalStatus,
  type ProposalType,
} from "./brainProposals";
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

describe("selectNonFinancialProposals", () => {
  const moneyPathProposal: BrainProposal = {
    id: "prop_1",
    type: "payment",
    created_at: "2026-07-20T00:00:00Z",
    status: "pending_approval",
    risk_band: null,
    confidence: null,
    mode: "propose",
    narrative: null,
    evidence: [],
    agent: null,
    payment_intent_id: "pi_1",
    action_type: null,
  };
  const nonFinancialProposal: BrainProposal = {
    id: "prop_2",
    type: "vendor_risk",
    created_at: "2026-07-20T00:00:00Z",
    status: "pending",
    risk_band: "elevated",
    confidence: 0.8,
    mode: "propose",
    narrative: "Vendor risk flagged",
    evidence: [],
    agent: { id: "agent_1", kind: "vendor_risk", display_name: "Vendor Risk Agent" },
    payment_intent_id: null,
    action_type: null,
  };

  it("excludes payment-intent-sourced (money-path) rows", () => {
    expect(selectNonFinancialProposals([moneyPathProposal])).toEqual([]);
  });
  it("includes rows with no payment_intent_id", () => {
    expect(selectNonFinancialProposals([nonFinancialProposal])).toEqual([nonFinancialProposal]);
  });
  it("filters a mixed list down to only the non-financial row", () => {
    expect(selectNonFinancialProposals([moneyPathProposal, nonFinancialProposal])).toEqual([nonFinancialProposal]);
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
