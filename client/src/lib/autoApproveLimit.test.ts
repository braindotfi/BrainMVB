import { describe, it, expect } from "vitest";
import {
  autoApproveLimitFromPolicy,
  groupPolicyAmount,
  type ApprovalPolicyFacts,
  type PolicyContentRule,
} from "./brainPolicy";

function facts(rules: PolicyContentRule[]): ApprovalPolicyFacts {
  return {
    selfApprovalBlocked: true,
    secondApprovalThreshold: null,
    version: 1,
    quorumRequired: 1,
    rules,
  };
}

describe("autoApproveLimitFromPolicy", () => {
  it("returns null when the policy is not known, so callers cannot mistake it for 'nothing is automated'", () => {
    expect(autoApproveLimitFromPolicy(undefined)).toBeNull();
  });

  it("reports 'none' when no rule executes automatically", () => {
    const result = autoApproveLimitFromPolicy(
      facts([{ id: "r1", execute: "confirm", when: { "amount.lte": { value: "500.00", currency: "USD" } } }]),
    );
    expect(result).toEqual({ kind: "none" });
  });

  it("reads an unconditional amount cap as the limit", () => {
    const result = autoApproveLimitFromPolicy(
      facts([{ id: "r1", execute: "auto", when: { "amount.lte": { value: "5000.00", currency: "USD" } } }]),
    );
    expect(result).toEqual({ kind: "limit", value: "5000.00", currency: "USD" });
  });

  it("does NOT present a conditional auto rule as a blanket limit", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        {
          id: "r1",
          execute: "auto",
          when: {
            "amount.lte": { value: "5000.00", currency: "USD" },
            "counterparty.in": "trusted_vendors",
          },
        },
      ]),
    );
    expect(result).toEqual({ kind: "conditional" });
  });

  it("treats an auto rule with no amount cap as conditional, not unlimited", () => {
    const result = autoApproveLimitFromPolicy(
      facts([{ id: "r1", execute: "auto", when: { "agent.confidence.gte": 0.9 } }]),
    );
    expect(result).toEqual({ kind: "conditional" });
  });

  it("prefers the unconditional rule when both kinds are present", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        { id: "conditional", execute: "auto", when: { "agent.confidence.gte": 0.9 } },
        { id: "flat", execute: "auto", when: { "amount.lte": { value: "250.00", currency: "EUR" } } },
      ]),
    );
    expect(result).toEqual({ kind: "limit", value: "250.00", currency: "EUR" });
  });
});

describe("groupPolicyAmount", () => {
  it("groups digits without rounding through a float", () => {
    expect(groupPolicyAmount("50000.00")).toBe("50,000.00");
    expect(groupPolicyAmount("1234567.89")).toBe("1,234,567.89");
    expect(groupPolicyAmount("999")).toBe("999");
  });

  it("preserves precision a float would lose", () => {
    expect(groupPolicyAmount("9007199254740993.15")).toBe("9,007,199,254,740,993.15");
  });
});
