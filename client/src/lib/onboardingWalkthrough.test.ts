import { describe, it, expect } from "vitest";
import { buildWalkthrough, readPolicyState, type PolicyRead } from "./onboardingWalkthrough";

const REAL_RULE = { name: "Auto-approve utilities", detail: "Outbound payments · runs automatically" };

/* Phrases that assert the tenant has no automation. Saying any of these because
   a read FAILED is the bug this screen must never ship: it tells a finance lead
   nothing is automated when something may well be. */
const CLAIMS_NOTHING_AUTOMATED = /nothing runs automatically|no rules are active|haven't set any/i;

const allCopy = (read: PolicyRead) =>
  buildWalkthrough(read, REAL_RULE)
    .flatMap((s) => [s.headline, s.subhead, s.row?.title ?? "", s.row?.sub ?? ""])
    .join(" ");

describe("readPolicyState", () => {
  it("reports pending while the policy is loading, even if no limit is known", () => {
    expect(readPolicyState({ isLoading: true, isError: false, limit: null })).toEqual({ state: "pending" });
  });

  it("reports failed on a real read error rather than falling through to noPolicy", () => {
    expect(readPolicyState({ isLoading: false, isError: true, limit: null })).toEqual({ state: "failed" });
  });

  it("treats a null limit with no error as an honest empty policy", () => {
    expect(readPolicyState({ isLoading: false, isError: false, limit: null })).toEqual({ state: "noPolicy" });
  });

  it("passes a known limit straight through", () => {
    const limit = { kind: "limit", value: "5000.00", currency: "USD" } as const;
    expect(readPolicyState({ isLoading: false, isError: false, limit })).toEqual({ state: "known", limit });
  });
});

describe("walkthrough copy", () => {
  it("quotes the tenant's real limit exactly, without rounding it", () => {
    const copy = allCopy({ state: "known", limit: { kind: "limit", value: "12500.50", currency: "USD" } });
    expect(copy).toContain("12,500.50 USD");
  });

  it("shows the tenant's own rule as theirs, not as an example", () => {
    const [first] = buildWalkthrough({ state: "known", limit: { kind: "limit", value: "5000.00", currency: "USD" } }, REAL_RULE);
    expect(first.row?.title).toBe(REAL_RULE.name);
    expect(first.row?.isExample).toBe(false);
  });

  it("falls back to a marked example when the tenant has no rule to show", () => {
    const [first] = buildWalkthrough({ state: "noPolicy" }, null);
    expect(first.row?.isExample).toBe(true);
    expect(first.subhead).toMatch(/haven't set any yet/i);
  });

  it("never presents an example as the tenant's own rule while the read is unresolved", () => {
    for (const read of [{ state: "pending" }, { state: "failed" }] as PolicyRead[]) {
      const [first] = buildWalkthrough(read, REAL_RULE);
      expect(first.row?.isExample).toBe(true);
    }
  });

  it("claims nothing about this tenant's automation when the read failed", () => {
    expect(allCopy({ state: "failed" })).not.toMatch(CLAIMS_NOTHING_AUTOMATED);
  });

  it("claims nothing about this tenant's automation while the read is pending", () => {
    expect(allCopy({ state: "pending" })).not.toMatch(CLAIMS_NOTHING_AUTOMATED);
  });

  it("quotes no amount at all unless one was actually read", () => {
    for (const read of [{ state: "pending" }, { state: "failed" }, { state: "noPolicy" }] as PolicyRead[]) {
      expect(allCopy(read)).not.toMatch(/\d/);
    }
  });

  it("says 'nothing runs automatically' only for a policy that was read and automates nothing", () => {
    expect(allCopy({ state: "known", limit: { kind: "none" } })).toMatch(/nothing runs automatically/i);
    expect(buildWalkthrough({ state: "known", limit: { kind: "none" } }, REAL_RULE)[1].row).toBeNull();
  });

  it("stays vague rather than wrong when automation is conditional", () => {
    const copy = allCopy({ state: "known", limit: { kind: "conditional" } });
    expect(copy).toMatch(/only under the specific conditions/i);
    expect(copy).not.toMatch(CLAIMS_NOTHING_AUTOMATED);
  });

  it("keeps the propose-only promise on the last step in every state", () => {
    for (const read of [
      { state: "pending" },
      { state: "failed" },
      { state: "noPolicy" },
      { state: "known", limit: { kind: "limit", value: "5000.00", currency: "USD" } },
    ] as PolicyRead[]) {
      const steps = buildWalkthrough(read, REAL_RULE);
      expect(steps).toHaveLength(3);
      expect(steps[2].subhead).toMatch(/never executes outside your rules/i);
      expect(steps[2].row?.showDecisionButtons).toBe(true);
    }
  });
});
