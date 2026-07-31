import { describe, it, expect, vi } from "vitest";
import {
  elevatedThresholdsFromPolicy,
  policyCategoryOf,
  bulkLimitFor,
  bulkCandidateFrom,
  isBulkEligible,
  resolveBulkSelection,
  isBlockedByType,
  runBulkApprove,
  type BulkCandidate,
  type BulkLimit,
} from "./bulkApprove";
import type { ApprovalPolicyFacts } from "./brainPolicy";

/* The reference tenant's actual signed policy, trimmed to the clauses that matter.
   Copied from a live GET /api/brain/approval-policy response, not invented. */
const LIVE_POLICY: ApprovalPolicyFacts = {
  selfApprovalBlocked: true,
  secondApprovalThreshold: { value: "50000.00", currency: "USD" },
  version: 1,
  quorumRequired: 1,
  rules: [
    {
      id: "ap-auto-approved-within",
      when: { "amount.lte": { value: "50000.00", currency: "USD" }, "counterparty.in": "vendors.approved" },
      execute: "auto",
      applies_to: ["outbound_payment"],
    },
    {
      id: "ap-confirm-approved-large",
      when: { "amount.gt": { value: "50000.00", currency: "USD" }, "counterparty.in": "vendors.approved" },
      execute: "confirm",
      require: "owner_and_cfo",
      applies_to: ["outbound_payment"],
    },
    {
      id: "ap-reject-unapproved",
      when: { "counterparty.not_in": "vendors.approved" },
      execute: "reject",
      applies_to: ["outbound_payment"],
    },
    {
      id: "treasury-confirm-large-deploy",
      when: { "amount.gt": { value: "250000.00", currency: "USD" } },
      execute: "confirm",
      require: "owner_approval",
      applies_to: ["onchain_tx"],
    },
    {
      id: "ar-confirm-above-500k",
      when: { "amount.gt": { value: "500000.00", currency: "USD" } },
      execute: "confirm",
      require: "owner_approval",
      applies_to: ["agent_action"],
    },
    {
      id: "ar-agent-action-requires-review",
      when: { "agent.confidence.gte": 0.6 },
      execute: "confirm",
      require: "single_signer",
      applies_to: ["agent_action"],
    },
  ],
};

const candidate = (over: Partial<BulkCandidate> = {}): BulkCandidate => ({
  id: "c1",
  type: "collections",
  category: "agent_action",
  amount: 12_600,
  approvable: true,
  ...over,
});

describe("elevatedThresholdsFromPolicy", () => {
  it("reads the real per-category second-approver lines out of the live policy", () => {
    expect(elevatedThresholdsFromPolicy(LIVE_POLICY)).toEqual({
      outbound_payment: 50_000,
      onchain_tx: 250_000,
      agent_action: 500_000,
    });
  });

  it("ignores the auto-approve clause entirely", () => {
    /* The whole point: `ap-auto-approved-within` is `execute: auto` at $50k, and an
       under-$50k payment in the queue failed its counterparty check. It must never
       become a bulk threshold. Here the only outbound number comes from the
       `confirm` clause — same figure, entirely different meaning. */
    const autoOnly: ApprovalPolicyFacts = {
      ...LIVE_POLICY,
      rules: LIVE_POLICY.rules.filter((r) => r.execute === "auto"),
    };
    expect(elevatedThresholdsFromPolicy(autoOnly)).toEqual({});
  });

  it("ignores confirm clauses that only need a single signer", () => {
    const singleOnly: ApprovalPolicyFacts = {
      ...LIVE_POLICY,
      rules: [
        { id: "x", execute: "confirm", require: "single_signer", when: { "amount.gt": { value: "10.00", currency: "USD" } }, applies_to: ["agent_action"] },
      ],
    };
    expect(elevatedThresholdsFromPolicy(singleOnly)).toEqual({});
  });

  it("treats an unrecognised requirement as elevated, not as harmless", () => {
    const future: ApprovalPolicyFacts = {
      ...LIVE_POLICY,
      rules: [
        { id: "x", execute: "confirm", require: "board_vote", when: { "amount.gt": 900 }, applies_to: ["agent_action"] },
      ],
    };
    expect(elevatedThresholdsFromPolicy(future)).toEqual({ agent_action: 900 });
  });

  it("takes the lowest line when several clauses cover one category", () => {
    const many: ApprovalPolicyFacts = {
      ...LIVE_POLICY,
      rules: [
        { id: "a", execute: "confirm", require: "owner_approval", when: { "amount.gt": 90_000 }, applies_to: ["agent_action"] },
        { id: "b", execute: "confirm", require: "owner_approval", when: { "amount.gt": 20_000 }, applies_to: ["agent_action"] },
      ],
    };
    expect(elevatedThresholdsFromPolicy(many)).toEqual({ agent_action: 20_000 });
  });

  it("is empty for a missing or unreadable policy", () => {
    expect(elevatedThresholdsFromPolicy(undefined)).toEqual({});
    expect(elevatedThresholdsFromPolicy(null)).toEqual({});
    expect(elevatedThresholdsFromPolicy({ ...LIVE_POLICY, rules: [] })).toEqual({});
  });
});

describe("policyCategoryOf", () => {
  it("reads details.kind", () => {
    expect(policyCategoryOf({ details: { kind: "agent_action" } })).toBe("agent_action");
  });
  it("is null when absent, blank or not a string", () => {
    expect(policyCategoryOf({ details: {} })).toBeNull();
    expect(policyCategoryOf({ details: { kind: "  " } })).toBeNull();
    expect(policyCategoryOf({ details: { kind: 7 } })).toBeNull();
    expect(policyCategoryOf({ details: null })).toBeNull();
  });
});

describe("bulkLimitFor", () => {
  const policy = elevatedThresholdsFromPolicy(LIVE_POLICY);

  it("uses the policy line when the tenant has authored no rules", () => {
    expect(bulkLimitFor("collections", "agent_action", policy, {})).toEqual({ value: 500_000, source: "policy" });
  });

  it("lets a tighter user rule win", () => {
    expect(bulkLimitFor("collections", "agent_action", policy, { collections: 25_000 }))
      .toEqual({ value: 25_000, source: "rule" });
  });

  it("keeps the policy line when the user rule is looser — a rule may only tighten", () => {
    expect(bulkLimitFor("collections", "agent_action", policy, { collections: 900_000 }))
      .toEqual({ value: 500_000, source: "policy" });
  });

  it("still works from a user rule alone when the category has no policy line", () => {
    expect(bulkLimitFor("collections", "ledger_write", policy, { collections: 25_000 }))
      .toEqual({ value: 25_000, source: "rule" });
  });

  it("honours the revenue_intel ⟷ revenue_intelligence alias", () => {
    expect(bulkLimitFor("revenue_intel", "ledger_write", policy, { revenue_intelligence: 4_000 }))
      .toEqual({ value: 4_000, source: "rule" });
  });

  it("is null when neither source has a number", () => {
    expect(bulkLimitFor("collections", "ledger_write", policy, {})).toBeNull();
    expect(bulkLimitFor("collections", null, policy, {})).toBeNull();
    expect(bulkLimitFor(null, "agent_action", {}, {})).toBeNull();
  });
});

describe("isBulkEligible", () => {
  const limit: BulkLimit = { value: 500_000, source: "policy" };

  it("accepts an approvable row under the line", () => {
    expect(isBulkEligible(candidate(), limit)).toBe(true);
  });

  it("refuses a row with no readable amount — absent is not small", () => {
    expect(isBulkEligible(candidate({ amount: null }), limit)).toBe(false);
    expect(isBulkEligible(candidate({ amount: Number.NaN }), limit)).toBe(false);
  });

  it("refuses a row with no limit to measure against", () => {
    expect(isBulkEligible(candidate(), null)).toBe(false);
  });

  it("refuses a row core will not accept an approve for", () => {
    /* Acknowledge-only findings. Firing approve at one is a write brain-core
       rejects, so it must never get a checkbox. */
    expect(isBulkEligible(candidate({ approvable: false }), limit)).toBe(false);
  });

  it("refuses at and above the line", () => {
    expect(isBulkEligible(candidate({ amount: 500_000 }), limit)).toBe(false);
    expect(isBulkEligible(candidate({ amount: 500_001 }), limit)).toBe(false);
  });

  it("refuses a row with no type to group by", () => {
    expect(isBulkEligible(candidate({ type: null }), limit)).toBe(false);
  });
});

describe("bulkCandidateFrom", () => {
  it("reads type, category and amount off a live collections proposal", () => {
    /* Field shape taken from a real /api/brain/proposals/:id response. */
    expect(
      bulkCandidateFrom(
        "prop_1",
        { type: "collections", details: { kind: "agent_action", amount_due: "12600.00000000", currency: "USD" } },
        true,
      ),
    ).toEqual({ id: "prop_1", type: "collections", category: "agent_action", amount: 12_600, approvable: true });
  });

  it("carries nulls through rather than guessing", () => {
    expect(bulkCandidateFrom("p", { type: null, details: null }, false)).toEqual({
      id: "p",
      type: null,
      category: null,
      amount: null,
      approvable: false,
    });
  });
});

describe("resolveBulkSelection", () => {
  const limitOf = () => ({ value: 500_000, source: "policy" }) as BulkLimit;
  const rows = [candidate({ id: "a" }), candidate({ id: "b" }), candidate({ id: "c", type: "treasury" })];

  it("is empty with nothing selected", () => {
    expect(resolveBulkSelection(rows, new Set(), limitOf)).toEqual({ ids: [], count: 0, type: null, limit: null });
  });

  it("counts the selection and reports its shared type", () => {
    const sel = resolveBulkSelection(rows, new Set(["a", "b"]), limitOf);
    expect(sel.count).toBe(2);
    expect(sel.ids).toEqual(["a", "b"]);
    expect(sel.type).toBe("collections");
  });

  it("drops ids that are no longer on screen", () => {
    /* A row approved elsewhere or filtered away must leave the selection, or
       "approve selected" would fire at something the user can no longer see. */
    const sel = resolveBulkSelection(rows, new Set(["a", "vanished"]), limitOf);
    expect(sel.ids).toEqual(["a"]);
    expect(sel.count).toBe(1);
  });

  it("quotes the lowest limit across the selection", () => {
    const mixed = resolveBulkSelection(
      [candidate({ id: "a" }), candidate({ id: "b" })],
      new Set(["a", "b"]),
      (c) => (c.id === "b" ? { value: 25_000, source: "rule" } : { value: 500_000, source: "policy" }),
    );
    expect(mixed.limit).toEqual({ value: 25_000, source: "rule" });
  });
});

describe("isBlockedByType", () => {
  it("blocks nothing before anything is selected", () => {
    expect(isBlockedByType(candidate(), null)).toBe(false);
  });
  it("blocks a different type once a batch has started", () => {
    expect(isBlockedByType(candidate({ type: "treasury" }), "collections")).toBe(true);
    expect(isBlockedByType(candidate({ type: "collections" }), "collections")).toBe(false);
  });
});

describe("runBulkApprove", () => {
  it("loops the single-item approve in order", async () => {
    const seen: string[] = [];
    const out = await runBulkApprove(["a", "b", "c"], async (id) => { seen.push(id); });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(out).toEqual({ approved: ["a", "b", "c"], failed: [] });
  });

  it("runs sequentially, never overlapping two money-path writes", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runBulkApprove(["a", "b", "c"], async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    expect(maxInFlight).toBe(1);
  });

  it("keeps going after a failure and reports both sides honestly", async () => {
    const out = await runBulkApprove(["a", "b", "c"], async (id) => {
      if (id === "b") throw new Error("core said no");
    });
    expect(out.approved).toEqual(["a", "c"]);
    expect(out.failed).toEqual([{ id: "b", message: "core said no" }]);
  });

  it("reports a non-Error rejection rather than dropping it", async () => {
    const out = await runBulkApprove(["a"], async () => { throw "boom"; });
    expect(out.approved).toEqual([]);
    expect(out.failed).toEqual([{ id: "a", message: "Unknown error" }]);
  });

  it("does nothing for an empty selection", async () => {
    const approveOne = vi.fn();
    expect(await runBulkApprove([], approveOne)).toEqual({ approved: [], failed: [] });
    expect(approveOne).not.toHaveBeenCalled();
  });
});
