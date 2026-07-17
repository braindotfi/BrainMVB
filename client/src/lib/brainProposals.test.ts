import { describe, it, expect } from "vitest";
import {
  agentKeyForProposalType,
  isNeedsReview,
  isAutoApproved,
  canUndo,
  type ProposalStatus,
  type ProposalType,
} from "./brainProposals";
import type { AgentKey } from "./agentProposals";

/**
 * Pure queue-membership helpers (isNeedsReview / isAutoApproved / canUndo) and the
 * wire-type -> AgentKey display mapping. No network - see server/brain/bff-invariants.test.ts
 * for the BFF decide-route invariants (token routing, actor stripping, error relay).
 */

function proposal(overrides: {
  status: ProposalStatus;
  decided_by?: string | null;
  reversible?: boolean;
}) {
  return { reversible: false, decided_by: null, ...overrides };
}

describe("isNeedsReview", () => {
  it("is true for needs_review", () => {
    expect(isNeedsReview(proposal({ status: "needs_review" }))).toBe(true);
  });
  it("is true for undone_to_review (sent back via Undo)", () => {
    expect(isNeedsReview(proposal({ status: "undone_to_review" }))).toBe(true);
  });
  it("is false for every other status", () => {
    expect(isNeedsReview(proposal({ status: "acknowledged" }))).toBe(false);
    expect(isNeedsReview(proposal({ status: "approved" }))).toBe(false);
    expect(isNeedsReview(proposal({ status: "rejected" }))).toBe(false);
  });
});

describe("isAutoApproved", () => {
  it("is true only when status is approved AND decided_by is an agent principal", () => {
    expect(isAutoApproved(proposal({ status: "approved", decided_by: "agent_123" }))).toBe(true);
  });
  it("is false when a human member decided it, even if approved", () => {
    expect(isAutoApproved(proposal({ status: "approved", decided_by: "member_123" }))).toBe(false);
  });
  it("is false when decided_by is missing (list summary carries no decided_by)", () => {
    expect(isAutoApproved(proposal({ status: "approved" }))).toBe(false);
  });
  it("is false for a non-approved status even with an agent decided_by", () => {
    expect(isAutoApproved(proposal({ status: "needs_review", decided_by: "agent_123" }))).toBe(false);
  });
});

describe("canUndo", () => {
  it("is true only for a reversible auto-approved record", () => {
    expect(canUndo(proposal({ status: "approved", decided_by: "agent_123", reversible: true }))).toBe(true);
  });
  it("is false when the auto-approved record is not reversible", () => {
    expect(canUndo(proposal({ status: "approved", decided_by: "agent_123", reversible: false }))).toBe(false);
  });
  it("is false for a human-approved record even when reversible", () => {
    expect(canUndo(proposal({ status: "approved", decided_by: "member_123", reversible: true }))).toBe(false);
  });
});

describe("agentKeyForProposalType", () => {
  it("maps payment_batch to the client's 'payment' AgentKey", () => {
    expect(agentKeyForProposalType("payment_batch")).toBe("payment");
  });
  it("maps every other wire type to the identical AgentKey string", () => {
    const identical: Exclude<ProposalType, "payment_batch">[] = [
      "vendor_risk",
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
    for (const type of identical) {
      expect(agentKeyForProposalType(type)).toBe(type as unknown as AgentKey);
    }
  });
});
