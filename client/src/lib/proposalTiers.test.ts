import { describe, expect, it } from "vitest";
import {
  MATERIAL_URGENT_BAND,
  UNCONDITIONAL_URGENT_BAND,
  deriveProposalTier,
  isUnconditionallyUrgent,
  proposalAmountValue,
  ruleAgentForProposalType,
  thresholdsFromRules,
  tierForPaymentIntent,
  tierForReadOnlyInsight,
  type TierableProposal,
} from "./proposalTiers";
import type { ProposalDecisionOption } from "./brainProposals";

const decisions = (...ids: string[]): ProposalDecisionOption[] =>
  ids.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }));

const proposal = (p: Partial<TierableProposal>): TierableProposal => ({
  risk_band: null,
  available_decisions: null,
  ...p,
});

/** An actionable record of `type` at `band` carrying a structured amount. */
const actionable = (type: string, band: TierableProposal["risk_band"], amount?: number): TierableProposal =>
  proposal({
    type,
    risk_band: band,
    available_decisions: decisions("approve", "reject"),
    details: amount == null ? {} : { amount: { value: String(amount), currency: "USD" } },
  });

describe("deriveProposalTier — decidability (the governing rule)", () => {
  it("tiers acknowledge-only records as Insights whatever their type implies", () => {
    // fraud_anomaly and compliance both arrive acknowledge-only on live data.
    // Neither may reach an actionable tier on the strength of its name.
    expect(deriveProposalTier(proposal({ available_decisions: decisions("acknowledge") }))).toBe("insight");
  });

  it("keeps an acknowledge-only record in Insights even when its risk band is high", () => {
    /* Decidability outranks severity: a high-risk row with no approve/reject would
       otherwise render an Approve button the API rejects. */
    expect(
      deriveProposalTier(proposal({ risk_band: "high", available_decisions: decisions("acknowledge") })),
    ).toBe("insight");
  });

  it("excludes records offering no decision at all", () => {
    expect(deriveProposalTier(proposal({ available_decisions: [] }))).toBeNull();
    expect(deriveProposalTier(proposal({ available_decisions: null }))).toBeNull();
  });

  it("excludes records whose only decisions are outside the documented write set", () => {
    expect(deriveProposalTier(proposal({ available_decisions: decisions("hold_transaction") }))).toBeNull();
    expect(deriveProposalTier(proposal({ risk_band: "high", available_decisions: decisions("escalate") }))).toBeNull();
  });

  it("tiers on the writable decision when it arrives beside an unwritable one", () => {
    expect(
      deriveProposalTier(proposal({ risk_band: "high", available_decisions: decisions("hold_transaction", "approve") })),
    ).toBe("urgent");
  });

  it("treats an EMPTY available_decisions as authoritative, ignoring presentation.actions", () => {
    /* An empty list is core saying "no decision on this record" — a different fact
       from the field being absent. Falling back here would resurrect an Approve
       button on a record whose authoritative list was explicitly empty. */
    expect(
      deriveProposalTier(
        proposal({ risk_band: "high", available_decisions: [], presentation: { actions: decisions("approve", "reject") } }),
      ),
    ).toBeNull();
  });

  it("falls back to presentation.actions only when available_decisions is absent", () => {
    expect(
      deriveProposalTier(proposal({ risk_band: "low", presentation: { actions: decisions("approve", "reject") } })),
    ).toBe("waiting");
  });

  it("auto-promotes a record to an actionable tier when core starts offering approve/reject", () => {
    /* The pending brain-core policy change, simulated: the SAME fraud record,
       before and after. Tier follows the API response with no code change. */
    const before = proposal({ risk_band: "high", available_decisions: decisions("acknowledge") });
    const after = proposal({ risk_band: "high", available_decisions: decisions("approve", "reject") });
    expect(deriveProposalTier(before)).toBe("insight");
    expect(deriveProposalTier(after)).toBe("urgent");
  });
});

describe("deriveProposalTier — severity and materiality", () => {
  it("escalates `high` on the band alone", () => {
    expect(UNCONDITIONAL_URGENT_BAND).toBe("high");
    expect(deriveProposalTier(actionable("collections", "high"))).toBe("urgent");
  });

  it("leaves `elevated` in Action-needed when no threshold is configured", () => {
    /* The reference tenant's GET /api/rules returns [] — no type has a limit, so
       nothing promotes. This is the state the app ships in today. */
    expect(MATERIAL_URGENT_BAND).toBe("elevated");
    expect(deriveProposalTier(actionable("collections", "elevated", 42000))).toBe("waiting");
    expect(deriveProposalTier(actionable("collections", "elevated", 42000), { thresholds: {} })).toBe("waiting");
  });

  it("promotes `elevated` to Urgent once the amount clears the tenant's own limit", () => {
    const thresholds = { collections: 25000 };
    expect(deriveProposalTier(actionable("collections", "elevated", 42000), { thresholds })).toBe("urgent");
    expect(deriveProposalTier(actionable("collections", "elevated", 8000), { thresholds })).toBe("waiting");
  });

  it("treats an amount exactly ON the limit as not material", () => {
    /* The limit reads as "over $25,000 needs you", so $25,000 itself does not. */
    expect(deriveProposalTier(actionable("collections", "elevated", 25000), { thresholds: { collections: 25000 } })).toBe(
      "waiting",
    );
  });

  it("applies each type's own limit, not a shared one", () => {
    const thresholds = { collections: 25000, treasury: 50000 };
    // $42k clears collections' limit but not treasury's.
    expect(deriveProposalTier(actionable("collections", "elevated", 42000), { thresholds })).toBe("urgent");
    expect(deriveProposalTier(actionable("treasury", "elevated", 42000), { thresholds })).toBe("waiting");
    expect(deriveProposalTier(actionable("treasury", "elevated", 60000), { thresholds })).toBe("urgent");
  });

  it("does not promote `elevated` when the record carries no amount", () => {
    expect(deriveProposalTier(actionable("collections", "elevated"), { thresholds: { collections: 25000 } })).toBe(
      "waiting",
    );
  });

  it("never escalates `standard`, `low`, or a missing band, however large the amount", () => {
    const thresholds = { collections: 25000 };
    for (const band of ["standard", "low", null] as const) {
      expect(deriveProposalTier(actionable("collections", band, 999999), { thresholds })).toBe("waiting");
    }
  });

  it("reads the amount from `amount_due` on raw collections records", () => {
    /* Live rows come in two shapes; the raw ones have no `details.amount`. */
    const raw = proposal({
      type: "collections",
      risk_band: "elevated",
      available_decisions: decisions("approve", "reject"),
      details: { amount_due: "42000.00000000", currency: "USD" },
    });
    expect(deriveProposalTier(raw, { thresholds: { collections: 25000 } })).toBe("urgent");
  });
});

describe("deriveProposalTier — reconciliation is stricter, not looser", () => {
  const recon = (band: TierableProposal["risk_band"], details: Record<string, unknown>): TierableProposal =>
    proposal({ type: "reconciliation", risk_band: band, available_decisions: decisions("approve", "reject"), details });

  const thresholds = { reconciliation: 10000 };

  it("needs unresolved AND material AND elevated/high together", () => {
    expect(
      deriveProposalTier(recon("high", { match_type: "no_match", amount: { value: "25000", currency: "USD" } }), {
        thresholds,
      }),
    ).toBe("urgent");
  });

  it("does NOT escalate a high-band reconciliation that is already matched", () => {
    /* The one case that separates this from the general rule: `high` alone is not
       enough here, because a resolved match needs no urgent attention. */
    expect(
      deriveProposalTier(recon("high", { match_type: "exact", amount: { value: "25000", currency: "USD" } }), {
        thresholds,
      }),
    ).toBe("waiting");
  });

  it("does NOT escalate an unresolved but immaterial match", () => {
    expect(
      deriveProposalTier(recon("high", { match_type: "no_match", amount: { value: "12.40", currency: "USD" } }), {
        thresholds,
      }),
    ).toBe("waiting");
  });

  it("accepts an unresolved status as the alternate signal", () => {
    expect(
      deriveProposalTier(recon("elevated", { status: "unresolved", amount: { value: "25000", currency: "USD" } }), {
        thresholds,
      }),
    ).toBe("urgent");
  });

  it("fails closed on an unrecognised match shape", () => {
    /* These field names are unverified — the reference tenant has no reconciliation
       rows at all — so anything unfamiliar must stay out of the red tier. */
    expect(
      deriveProposalTier(recon("high", { amount: { value: "25000", currency: "USD" } }), { thresholds }),
    ).toBe("waiting");
  });
});

describe("thresholdsFromRules", () => {
  it("is empty for a tenant with no rules — today's real state", () => {
    expect(thresholdsFromRules([])).toEqual({});
    expect(thresholdsFromRules(null)).toEqual({});
  });

  it("reads the configured limit per agent, preferring threshold over cap", () => {
    expect(
      thresholdsFromRules([
        { active: true, agent: "collections", threshold: 25000 },
        { active: true, agent: "treasury", cap: 50000 },
        { active: true, agent: "payment", threshold: 15000, cap: 99999 },
      ]),
    ).toEqual({ collections: 25000, treasury: 50000, payment: 15000 });
  });

  it("ignores paused rules — a switched-off limit must not escalate anything", () => {
    expect(thresholdsFromRules([{ active: false, agent: "collections", threshold: 25000 }])).toEqual({});
  });

  it("takes the LOWEST limit when several rules cover one type", () => {
    expect(
      thresholdsFromRules([
        { active: true, agent: "collections", threshold: 25000 },
        { active: true, agent: "collections", threshold: 5000 },
      ]),
    ).toEqual({ collections: 5000 });
  });

  it("skips rules with no agent or no usable limit", () => {
    expect(
      thresholdsFromRules([
        { active: true, agent: null, threshold: 25000 },
        { active: true, agent: "collections" },
        { active: true, agent: "treasury", threshold: 0 },
      ]),
    ).toEqual({});
  });
});

describe("rule-scope join (ProposalType ⟷ Agent drift)", () => {
  it("aliases revenue_intel onto the revenue_intelligence rule scope", () => {
    /* The two unions have already drifted on this one name. Unaliased, the rule's
       limit silently never applies — no error, just a record that never escalates. */
    expect(ruleAgentForProposalType("revenue_intel")).toBe("revenue_intelligence");
    const p = proposal({
      type: "revenue_intel",
      risk_band: "elevated",
      available_decisions: decisions("approve", "reject"),
      details: { amount: { value: "80000", currency: "USD" } },
    });
    expect(deriveProposalTier(p, { thresholds: { revenue_intelligence: 50000 } })).toBe("urgent");
  });

  it("passes every other type through unchanged", () => {
    for (const t of ["collections", "treasury", "reconciliation", "vendor_risk", "fraud_anomaly"]) {
      expect(ruleAgentForProposalType(t)).toBe(t);
    }
  });

  it("gives no threshold to types that cannot have a rule scoped to them", () => {
    /* bill_management / tax_prep / the personal-finance set exist as ProposalTypes
       but have no Agent, so no rule can target them and none may promote. */
    const p = proposal({
      type: "tax_prep",
      risk_band: "elevated",
      available_decisions: decisions("approve", "reject"),
      details: { amount: { value: "999999", currency: "USD" } },
    });
    expect(deriveProposalTier(p, { thresholds: { collections: 25000 } })).toBe("waiting");
  });
});

describe("proposalAmountValue", () => {
  it("reads both live shapes and refuses anything else", () => {
    expect(proposalAmountValue(proposal({ details: { amount: { value: "42000.00", currency: "USD" } } }))).toBe(42000);
    expect(proposalAmountValue(proposal({ details: { amount_due: "8000.00000000" } }))).toBe(8000);
    expect(proposalAmountValue(proposal({ details: {} }))).toBeNull();
    expect(proposalAmountValue(proposal({ details: null }))).toBeNull();
    expect(proposalAmountValue(proposal({ details: { amount_due: "not-a-number" } }))).toBeNull();
  });
});

describe("isUnconditionallyUrgent", () => {
  it("is true for high only", () => {
    expect(isUnconditionallyUrgent("high")).toBe(true);
    for (const band of ["elevated", "standard", "low", null, undefined] as const) {
      expect(isUnconditionallyUrgent(band)).toBe(false);
    }
  });
});

describe("non-proposal records", () => {
  it("never puts a payment intent in the red tier", () => {
    /* Every mapped intent carries a hardcoded severity: "info", and the PaymentIntent
       record has no risk_band and no priority_score — nothing real to escalate on. */
    expect(tierForPaymentIntent()).toBe("waiting");
  });

  it("puts read-only ledger facts in Insights", () => {
    expect(tierForReadOnlyInsight()).toBe("insight");
  });
});
