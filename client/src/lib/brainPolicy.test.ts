import { describe, it, expect } from "vitest";
import { mapPolicyRuleToCard, mapPolicyToRuleCards, type ApprovalPolicyFacts } from "./brainPolicy";

/**
 * mapPolicyRuleToCard's job is an honest plain-English rendering of the DSL
 * fields brain-core actually sends (applies_to/when/execute/require) - never
 * inventing a name/vendor-list the way the mock rule catalogue does. This pins
 * the shape for the real default tenant policy (two rules, no amount caps -
 * see brain-core services/api/src/onboarding/provision.ts:85-104) plus the
 * always-locked, always-on invariant (Phase 2a is read-only).
 */

describe("mapPolicyRuleToCard", () => {
  it("renders the default money-requires-confirmation rule honestly (no invented amount cap)", () => {
    const card = mapPolicyRuleToCard({
      id: "default-money-requires-confirmation",
      applies_to: ["outbound_payment", "onchain_tx"],
      when: { "agent.confidence.gte": 0.6 },
      execute: "confirm",
      require: "single_signer",
    });
    expect(card.locked).toBe(true);
    expect(card.kind).toBe("always_on");
    expect(card.summary).toMatch(/waits for approval/);
    expect(card.summary).toMatch(/requires single signer/);
    expect(card.scopeSummary).toMatch(/outbound payments/);
    expect(card.scopeSummary).toMatch(/confidence ≥ 0\.6/);
    // No fabricated dollar amount - this rule carries no amount.gt/lte.
    expect(card.cap).toBeUndefined();
    expect(card.threshold).toBeUndefined();
  });

  it("renders an auto-execute rule without a require suffix", () => {
    const card = mapPolicyRuleToCard({
      id: "default-non-money-confidence-floor",
      applies_to: ["inbound_payment", "ledger_write"],
      when: { "agent.confidence.gte": 0.6 },
      execute: "auto",
    });
    expect(card.summary).toMatch(/runs automatically/);
    expect(card.summary).not.toMatch(/requires/);
  });

  it("renders an amount threshold when the policy actually carries one", () => {
    const card = mapPolicyRuleToCard({
      id: "large-payment-dual-control",
      applies_to: ["outbound_payment"],
      when: { "amount.gt": { value: "10000", currency: "USD" } },
      execute: "confirm",
      require: "owner_and_cfo",
    });
    expect(card.scopeSummary).toMatch(/over 10000 USD/);
  });

  it("falls back to 'any action' / 'no conditions' for an empty rule, never guessing", () => {
    const card = mapPolicyRuleToCard({ id: "catch-all", execute: "reject" });
    expect(card.scopeSummary).toMatch(/^any action · no conditions$/);
    expect(card.summary).toMatch(/is blocked/);
  });
});

describe("mapPolicyToRuleCards", () => {
  it("maps the full default-tenant policy in rule order (VM short-circuits on first match)", () => {
    const facts: ApprovalPolicyFacts = {
      selfApprovalBlocked: true,
      secondApprovalThreshold: null,
      version: 1,
      quorumRequired: 1,
      rules: [
        { id: "rule-a", execute: "confirm" },
        { id: "rule-b", execute: "auto" },
      ],
    };
    const cards = mapPolicyToRuleCards(facts);
    expect(cards.map((c) => c.policyId)).toEqual(["rule-a", "rule-b"]);
  });

  it("returns an empty list (not a fabricated default) when there's no policy yet", () => {
    expect(mapPolicyToRuleCards(undefined)).toEqual([]);
  });
});
