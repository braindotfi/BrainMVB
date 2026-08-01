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
  NO_POLICY_ELEVATION,
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

const policyOf = (...rules: ApprovalPolicyFacts["rules"]): ApprovalPolicyFacts => ({ ...LIVE_POLICY, rules });

describe("elevatedThresholdsFromPolicy", () => {
  it("reads the real per-category second-approver lines out of the live policy", () => {
    const e = elevatedThresholdsFromPolicy(LIVE_POLICY);
    expect(e.limits).toEqual({ outbound_payment: 50_000, onchain_tx: 250_000, agent_action: 500_000 });
    expect([...e.unconditional]).toEqual([]);
  });

  it("ignores the auto-approve clause entirely", () => {
    /* The whole point: `ap-auto-approved-within` is `execute: auto` at $50k, and an
       under-$50k payment in the queue failed its counterparty check. It must never
       become a bulk threshold. Here the only outbound number comes from the
       `confirm` clause — same figure, entirely different meaning. */
    const e = elevatedThresholdsFromPolicy(policyOf(...LIVE_POLICY.rules.filter((r) => r.execute === "auto")));
    expect(e.limits).toEqual({});
    expect([...e.unconditional]).toEqual([]);
  });

  it("ignores confirm clauses that only need a single signer", () => {
    const e = elevatedThresholdsFromPolicy(policyOf(
      { id: "x", execute: "confirm", require: "single_signer", when: { "amount.gt": { value: "10.00", currency: "USD" } }, applies_to: ["agent_action"] },
    ));
    expect(e.limits).toEqual({});
    expect([...e.unconditional]).toEqual([]);
  });

  it("treats an unrecognised requirement as elevated, not as harmless", () => {
    const e = elevatedThresholdsFromPolicy(policyOf(
      { id: "x", execute: "confirm", require: "board_vote", when: { "amount.gt": 900 }, applies_to: ["agent_action"] },
    ));
    expect(e.limits).toEqual({ agent_action: 900 });
  });

  it("takes the lowest line when several clauses cover one category", () => {
    const e = elevatedThresholdsFromPolicy(policyOf(
      { id: "a", execute: "confirm", require: "owner_approval", when: { "amount.gt": 90_000 }, applies_to: ["agent_action"] },
      { id: "b", execute: "confirm", require: "owner_approval", when: { "amount.gt": 20_000 }, applies_to: ["agent_action"] },
    ));
    expect(e.limits).toEqual({ agent_action: 20_000 });
  });

  it("marks a category unconditional when it needs two signers with no amount condition", () => {
    /* "outbound payments require owner and CFO", full stop. Every one of them needs
       two signers, so none may be batched — the absence of a number is the STRICTEST
       reading, not a missing one. */
    const e = elevatedThresholdsFromPolicy(policyOf(
      { id: "x", execute: "confirm", require: "owner_and_cfo", applies_to: ["outbound_payment"] },
    ));
    expect(e.limits).toEqual({});
    expect([...e.unconditional]).toEqual(["outbound_payment"]);
  });

  it("marks a category unconditional when the amount uses a comparator it cannot parse", () => {
    const e = elevatedThresholdsFromPolicy(policyOf(
      { id: "x", execute: "confirm", require: "owner_approval", when: { "amount.gte": 1_000 }, applies_to: ["agent_action"] },
    ));
    expect([...e.unconditional]).toEqual(["agent_action"]);
  });

  it("lets an unconditional clause override a sibling clause's number", () => {
    /* The dangerous shape: one clause says "over $20k needs two signers", another
       says "these always need two signers". Reading only the first would authorise
       batches the second forbids outright. */
    const e = elevatedThresholdsFromPolicy(policyOf(
      { id: "a", execute: "confirm", require: "owner_approval", when: { "amount.gt": 20_000 }, applies_to: ["agent_action"] },
      { id: "b", execute: "confirm", require: "owner_approval", applies_to: ["agent_action"] },
    ));
    expect(e.limits).toEqual({ agent_action: 20_000 });
    expect([...e.unconditional]).toEqual(["agent_action"]);
    /* and the gate must refuse despite the number being present */
    expect(bulkLimitFor("collections", "agent_action", e, {})).toBeNull();
  });

  it("is empty for a missing or unreadable policy", () => {
    for (const empty of [undefined, null, policyOf()]) {
      const e = elevatedThresholdsFromPolicy(empty);
      expect(e.limits).toEqual({});
      expect([...e.unconditional]).toEqual([]);
    }
  });
});

describe("elevatedThresholdsFromPolicy: clauses that name no category", () => {
  /* No live tenant policy reaches any of these: every rule in the reference
     document names exactly one category. They are synthetic deliberately, and the
     two halves below are NOT interchangeable.

     An explicit "any" is the DSL's wildcard, which brain-core's policy VM matches
     against every action.kind. The gate mirrors the VM rather than inventing a
     stricter rule, so that clause binds every category — including one the policy
     never names.

     Absent, empty or unreadable scope is a different animal: brain-core's schema
     does not accept it as a valid clause at all. Reading it as a wildcard would
     invent coverage nobody signed. Dropping it would be worse — a blanket
     two-approver line would vanish while a laxer named clause still set a limit —
     so it fails closed instead. With no production rule of either shape, these
     cases are the only thing holding the distinction in place. */
  const twoSigners = { execute: "confirm", require: "owner_and_cfo" } as const;
  const over = (v: number) => ({ "amount.gt": { value: `${v}.00`, currency: "USD" } });
  /* The live agent_action line, kept alongside to show which one wins. */
  const AGENT_500K = LIVE_POLICY.rules.find((r) => r.id === "ar-confirm-above-500k")!;
  const wide = (applies_to?: string[]) =>
    policyOf({ id: "wide", ...twoSigners, when: over(10_000), ...(applies_to ? { applies_to } : {}) });

  it("binds a category it never names, on the explicit \"any\" wildcard", () => {
    const e = elevatedThresholdsFromPolicy(wide(["any"]));
    expect(e.universal).toBe(10_000);
    expect(e.invalidScope).toBe(false);
    /* never filed under a literal key, which no record's details.kind can match */
    expect(e.limits).toEqual({});
    expect(bulkLimitFor("collections", "agent_action", e, {}))
      .toEqual({ value: 10_000, source: "policy" });
  });

  const invalidShapes: Array<[string, string[] | undefined]> = [
    ["absent applies_to", undefined],
    ["empty applies_to", []],
    ["a scope it cannot read", ["", "   "]],
  ];
  for (const [label, applies_to] of invalidShapes) {
    it(`is not a wildcard, and fails closed instead: ${label}`, () => {
      const e = elevatedThresholdsFromPolicy(wide(applies_to));
      expect(e.invalidScope).toBe(true);
      /* grants nothing: no universal line, no named line */
      expect(e.universal).toBeNull();
      expect(e.limits).toEqual({});
      expect(bulkLimitFor("collections", "agent_action", e, {})).toBeNull();
    });
  }

  /* `applies_to` is typed string[], but the policy arrives as JSON off the wire and
     the type is a claim, not a guarantee. The bare string "any" is the tempting
     one: it reads like the wildcard, and granting it blanket coverage would mean
     honouring a shape brain-core's schema rejects. */
  const malformedShapes: Array<[string, unknown]> = [
    ["the bare string \"any\" rather than a list", "any"],
    ["an object rather than a list", { any: true }],
    ["null", null],
  ];
  for (const [label, applies_to] of malformedShapes) {
    it(`fails closed when the scope is not a list at all: ${label}`, () => {
      const e = elevatedThresholdsFromPolicy(policyOf(
        AGENT_500K,
        { id: "wide", ...twoSigners, when: over(10_000), applies_to } as unknown as ApprovalPolicyFacts["rules"][number],
      ));
      expect(e.invalidScope).toBe(true);
      expect(e.universal).toBeNull();
      expect(bulkLimitFor("collections", "agent_action", e, {})).toBeNull();
    });
  }

  it("only lets the real wildcard reach a category the policy never names", () => {
    /* The correction in one pair. Same clause, same amount; one names the DSL
       wildcard, one names nothing. Only the first may make an unnamed category
       bulk-eligible — the second must not expand eligibility at all. */
    const wildcard = elevatedThresholdsFromPolicy(wide(["any"]));
    const unreadable = elevatedThresholdsFromPolicy(wide(undefined));
    expect(bulkLimitFor("collections", "future_kind", wildcard, {}))
      .toEqual({ value: 10_000, source: "policy" });
    expect(bulkLimitFor("collections", "future_kind", unreadable, {})).toBeNull();
  });

  it("takes the gate down rather than dropping an unreadable clause", () => {
    /* The over-permissive failure this must never regress to: the $10k line goes
       missing and a $42,000 agent_action is offered under the $500k line. */
    const e = elevatedThresholdsFromPolicy(policyOf(
      AGENT_500K,
      { id: "wide", ...twoSigners, when: over(10_000) },
    ));
    expect(e.limits).toEqual({ agent_action: 500_000 });
    expect(e.invalidScope).toBe(true);
    expect(bulkLimitFor("collections", "agent_action", e, {})).toBeNull();
  });

  it("ignores an unscoped clause that only needs a single signer", () => {
    /* Not an elevated clause at all, so it neither binds nor suppresses. A policy
       carrying ordinary single-signer lines must not disable bulk approval. */
    const e = elevatedThresholdsFromPolicy(policyOf(
      AGENT_500K,
      { id: "wide", execute: "confirm", require: "single_signer", when: over(10_000) },
    ));
    expect(e.invalidScope).toBe(false);
    expect(bulkLimitFor("collections", "agent_action", e, {}))
      .toEqual({ value: 500_000, source: "policy" });
  });

  it("takes the wildcard line when it is lower than the named one", () => {
    /* The gap, end to end: before this, the $10k line was dropped and a $42,000
       record was offered for bulk approval under the $500,000 agent_action line. */
    const e = elevatedThresholdsFromPolicy(policyOf(
      AGENT_500K,
      { id: "wide", ...twoSigners, when: over(10_000), applies_to: ["any"] },
    ));
    expect(e.limits).toEqual({ agent_action: 500_000 });
    expect(e.universal).toBe(10_000);
    const limit = bulkLimitFor("collections", "agent_action", e, {});
    expect(limit).toEqual({ value: 10_000, source: "policy" });
    expect(isBulkEligible(candidate({ amount: 42_000 }), limit)).toBe(false);
    expect(isBulkEligible(candidate({ amount: 4_300 }), limit)).toBe(true);
  });

  it("keeps the named line when it is the lower of the two", () => {
    const e = elevatedThresholdsFromPolicy(policyOf(
      { id: "narrow", ...twoSigners, when: over(20_000), applies_to: ["agent_action"] },
      { id: "wide", ...twoSigners, when: over(900_000), applies_to: ["any"] },
    ));
    expect(bulkLimitFor("collections", "agent_action", e, {}))
      .toEqual({ value: 20_000, source: "policy" });
  });

  it("suppresses every category when a wildcard clause has no evaluable amount", () => {
    const e = elevatedThresholdsFromPolicy(policyOf(
      AGENT_500K,
      { id: "wide", ...twoSigners, applies_to: ["any"] },
    ));
    expect(e.universalUnconditional).toBe(true);
    expect(e.limits).toEqual({ agent_action: 500_000 });
    expect(bulkLimitFor("collections", "agent_action", e, {})).toBeNull();
    expect(bulkLimitFor("collections", "outbound_payment", e, {})).toBeNull();
  });

  it("suppresses every category for an unscoped clause with no amount either", () => {
    /* Same outcome as the wildcard above, reached by the other route: this one is
       an invalid clause rather than a blanket one, and both fail closed. */
    const e = elevatedThresholdsFromPolicy(policyOf(AGENT_500K, { id: "wide", ...twoSigners }));
    expect(e.invalidScope).toBe(true);
    expect(e.universalUnconditional).toBe(false);
    expect(bulkLimitFor("collections", "agent_action", e, {})).toBeNull();
    expect(bulkLimitFor("collections", "outbound_payment", e, {})).toBeNull();
  });

  it("covers a category the policy never names at all", () => {
    /* brain-core adding a new details.kind must not walk out from under the
       tenant's blanket line. */
    const e = elevatedThresholdsFromPolicy(wide(["any"]));
    expect(bulkLimitFor("collections", "future_kind", e, {}))
      .toEqual({ value: 10_000, source: "policy" });
  });

  it("ignores a category-less clause that only needs a single signer", () => {
    const e = elevatedThresholdsFromPolicy(policyOf(
      AGENT_500K,
      { id: "wide", execute: "confirm", require: "single_signer", when: over(10_000), applies_to: ["any"] },
    ));
    expect(e.universal).toBeNull();
    expect(e.universalUnconditional).toBe(false);
    expect(bulkLimitFor("collections", "agent_action", e, {}))
      .toEqual({ value: 500_000, source: "policy" });
  });

  it("still lets a user rule tighten below a wildcard line", () => {
    const e = elevatedThresholdsFromPolicy(wide(["any"]));
    expect(bulkLimitFor("collections", "agent_action", e, { collections: 5_000 }))
      .toEqual({ value: 5_000, source: "rule" });
  });

  it("changes nothing for the live policy, whose clauses all name a category", () => {
    const e = elevatedThresholdsFromPolicy(LIVE_POLICY);
    expect(e.universal).toBeNull();
    expect(e.universalUnconditional).toBe(false);
    expect(e.invalidScope).toBe(false);
    expect(e.limits).toEqual({ outbound_payment: 50_000, onchain_tx: 250_000, agent_action: 500_000 });
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

  it("keeps the policy line when the two are equal, reporting it as the policy's", () => {
    expect(bulkLimitFor("collections", "agent_action", policy, { collections: 500_000 }))
      .toEqual({ value: 500_000, source: "policy" });
  });

  it("REFUSES on a user rule alone when the category has no policy line", () => {
    /* A rule `cap` is an auto-clear ceiling. It says nothing about how many people
       must sign, so it cannot establish that one approver suffices — it can only
       pull an established line lower. Letting it stand alone would reintroduce the
       auto-approve semantics this module exists to reject. */
    expect(bulkLimitFor("collections", "ledger_write", policy, { collections: 25_000 })).toBeNull();
  });

  it("REFUSES everything when the policy could not be read, rules or not", () => {
    /* The failure that matters. An unreachable policy must not leave a
       user-authored cap as the only thing standing between a click and a batch. */
    expect(bulkLimitFor("collections", "agent_action", NO_POLICY_ELEVATION, { collections: 25_000 })).toBeNull();
    expect(bulkLimitFor("collections", "agent_action", NO_POLICY_ELEVATION, {})).toBeNull();
  });

  it("honours the revenue_intel ⟷ revenue_intelligence alias to tighten", () => {
    expect(bulkLimitFor("revenue_intel", "agent_action", policy, { revenue_intelligence: 4_000 }))
      .toEqual({ value: 4_000, source: "rule" });
  });

  it("is null without a category to look the policy line up by", () => {
    expect(bulkLimitFor("collections", null, policy, {})).toBeNull();
    expect(bulkLimitFor("collections", "ledger_write", policy, {})).toBeNull();
  });

  it("still returns the policy line when the record has no type for a rule to scope to", () => {
    expect(bulkLimitFor(null, "agent_action", policy, { collections: 10 }))
      .toEqual({ value: 500_000, source: "policy" });
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

  /* The page disables other-type checkboxes, but that attribute is presentation and
     survives exactly until someone opens devtools. The batch itself has to be
     single-type, because the bar reads `type` and announces it over every id in
     `ids` — and then approves them. */
  it("keeps a mixed selection to the first selected type", () => {
    const sel = resolveBulkSelection(rows, new Set(["a", "c"]), limitOf);
    expect(sel.ids).toEqual(["a"]);
    expect(sel.count).toBe(1);
    expect(sel.type).toBe("collections");
  });

  it("lets the earliest selected row set the type, not the topmost row on screen", () => {
    /* "c" sits last in `rows` but was selected first, so it governs and the
       higher-placed collections rows drop out — the user's first pick keeps the
       batch it started. */
    const sel = resolveBulkSelection(rows, new Set(["c", "a"]), limitOf);
    expect(sel.type).toBe("treasury");
    expect(sel.ids).toEqual(["c"]);
  });

  it("never quotes a limit belonging to a dropped foreign-type row", () => {
    /* Otherwise the bar could announce a treasury row's tighter limit over a batch
       of collections rows that were never held to it. */
    const sel = resolveBulkSelection(
      rows,
      new Set(["a", "b", "c"]),
      (c) => (c.type === "treasury" ? { value: 1_000, source: "rule" } : { value: 500_000, source: "policy" }),
    );
    expect(sel.ids).toEqual(["a", "b"]);
    expect(sel.type).toBe("collections");
    expect(sel.limit).toEqual({ value: 500_000, source: "policy" });
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
