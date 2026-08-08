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

  it("reads a payment-scoped flat cap as the limit", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        {
          id: "r1",
          applies_to: ["outbound_payment"],
          execute: "auto",
          when: { "amount.lte": { value: "250.00", currency: "EUR" } },
        },
      ]),
    );
    expect(result).toEqual({ kind: "limit", value: "250.00", currency: "EUR" });
  });

  /* The VM evaluates in order and stops at the first match, so a flat auto rule
     sitting behind another payment rule is not what actually happens to a
     payment. Reporting its number would be a false assurance. */
  it("does not report a flat cap that an earlier payment rule can pre-empt", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        {
          id: "big-ones-need-a-human",
          applies_to: ["outbound_payment"],
          execute: "confirm",
          when: { "amount.gt": { value: "50000.00", currency: "USD" } },
        },
        {
          id: "small-ones-auto",
          applies_to: ["outbound_payment"],
          execute: "auto",
          when: { "amount.lte": { value: "5000.00", currency: "USD" } },
        },
      ]),
    );
    expect(result).toEqual({ kind: "conditional" });
  });

  it("does not let an earlier conditional auto rule be reported as the flat line", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        { id: "conditional", execute: "auto", when: { "agent.confidence.gte": 0.9 } },
        { id: "flat", execute: "auto", when: { "amount.lte": { value: "250.00", currency: "EUR" } } },
      ]),
    );
    expect(result).toEqual({ kind: "conditional" });
  });

  it("does not present a ledger-write auto rule as a payment limit", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        {
          id: "ledger",
          applies_to: ["ledger_write"],
          execute: "auto",
          when: { "amount.lte": { value: "5000.00", currency: "USD" } },
        },
      ]),
    );
    expect(result).toEqual({ kind: "none" });
  });

  it("is not blocked by an earlier rule that cannot match a payment", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        { id: "inbound", applies_to: ["inbound_payment"], execute: "confirm", when: {} },
        {
          id: "flat",
          applies_to: ["outbound_payment"],
          execute: "auto",
          when: { "amount.lte": { value: "5000.00", currency: "USD" } },
        },
      ]),
    );
    expect(result).toEqual({ kind: "limit", value: "5000.00", currency: "USD" });
  });

  it("treats an `any` rule as covering payments", () => {
    const result = autoApproveLimitFromPolicy(
      facts([
        { id: "catch-all", applies_to: ["any"], execute: "reject", when: {} },
        {
          id: "flat",
          applies_to: ["outbound_payment"],
          execute: "auto",
          when: { "amount.lte": { value: "5000.00", currency: "USD" } },
        },
      ]),
    );
    expect(result).toEqual({ kind: "conditional" });
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

/* The declared ApprovalPolicyFacts type is not a runtime guarantee — these
   objects come off the BFF. The hazard is specific: `facts.rules ?? []` used to
   turn a payload with no readable rule set into a confident `{kind:"none"}`,
   which Settings renders as "Nothing runs automatically" next to a money
   figure. Not knowing must never present as knowing there is no automation. */
describe("autoApproveLimitFromPolicy — payloads that do not match the declared type", () => {
  const malformed: Array<[string, unknown]> = [
    ["rules missing entirely", undefined],
    ["rules null", null],
    ["rules an object rather than a list", { r1: { execute: "auto" } }],
    ["rules a string", "auto"],
    ["rules a number", 3],
    ["a null entry in the list", [null]],
    ["a string entry in the list", ["r1"]],
  ];

  function withRules(rules: unknown): ApprovalPolicyFacts {
    return {
      selfApprovalBlocked: true,
      secondApprovalThreshold: null,
      version: 1,
      quorumRequired: 1,
      rules,
    } as unknown as ApprovalPolicyFacts;
  }

  for (const [label, rules] of malformed) {
    it(`reports 'unknown' with ${label}`, () => {
      expect(autoApproveLimitFromPolicy(withRules(rules))).toEqual({ kind: "unknown" });
    });
  }

  it("never claims 'none' for an unreadable rule set", () => {
    for (const [, rules] of malformed) {
      expect(autoApproveLimitFromPolicy(withRules(rules))).not.toEqual({ kind: "none" });
    }
  });

  it("does not throw on a rule entry it cannot read", () => {
    expect(() => autoApproveLimitFromPolicy(withRules([null, { execute: "auto" }]))).not.toThrow();
  });

  it("still reads a well-formed policy, so the guard has not swallowed the happy path", () => {
    expect(
      autoApproveLimitFromPolicy(
        facts([{ id: "r1", execute: "auto", when: { "amount.lte": { value: "250.00", currency: "EUR" } } }]),
      ),
    ).toEqual({ kind: "limit", value: "250.00", currency: "EUR" });
  });
});
