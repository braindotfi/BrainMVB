import { describe, expect, it } from "vitest";
import {
  URGENT_RISK_BANDS,
  deriveProposalTier,
  isUrgentRiskBand,
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

describe("deriveProposalTier", () => {
  /* The rule the whole module exists to enforce. */
  it("tiers acknowledge-only records as Insights whatever their type implies", () => {
    // fraud_anomaly and compliance both arrive acknowledge-only on live data.
    // Neither may reach an actionable tier on the strength of its name.
    expect(deriveProposalTier(proposal({ available_decisions: decisions("acknowledge") }))).toBe("insight");
  });

  it("keeps an acknowledge-only record in Insights even when its risk band is high", () => {
    /* The severity cut must not be able to overrule decidability: a high-risk
       row with no approve/reject would render an Approve button the API rejects. */
    expect(
      deriveProposalTier(proposal({ risk_band: "high", available_decisions: decisions("acknowledge") })),
    ).toBe("insight");
  });

  it("splits approve/reject records by risk band", () => {
    for (const band of ["high", "elevated"] as const) {
      expect(deriveProposalTier(proposal({ risk_band: band, available_decisions: decisions("approve", "reject") }))).toBe("urgent");
    }
    for (const band of ["standard", "low"] as const) {
      expect(deriveProposalTier(proposal({ risk_band: band, available_decisions: decisions("approve", "reject") }))).toBe("waiting");
    }
  });

  it("never escalates a record whose risk band is missing", () => {
    /* risk_band coverage across types is unconfirmed upstream; absent severity
       must read as "no signal", not "assume the worst". */
    expect(deriveProposalTier(proposal({ risk_band: null, available_decisions: decisions("approve", "reject") }))).toBe("waiting");
    expect(deriveProposalTier(proposal({ available_decisions: decisions("approve") }))).toBe("waiting");
  });

  it("treats a reject-only record as actionable", () => {
    expect(deriveProposalTier(proposal({ risk_band: "high", available_decisions: decisions("reject") }))).toBe("urgent");
  });

  it("excludes records offering no decision at all", () => {
    expect(deriveProposalTier(proposal({ available_decisions: [] }))).toBeNull();
    expect(deriveProposalTier(proposal({ available_decisions: null }))).toBeNull();
  });

  it("excludes records whose only decisions are outside the documented write set", () => {
    /* `hold_transaction` renders disabled on the card; a tier would promise an
       action Overview cannot submit. */
    expect(deriveProposalTier(proposal({ available_decisions: decisions("hold_transaction") }))).toBeNull();
    expect(deriveProposalTier(proposal({ risk_band: "high", available_decisions: decisions("escalate") }))).toBeNull();
  });

  it("tiers on the writable decision when it arrives beside an unwritable one", () => {
    expect(
      deriveProposalTier(proposal({ risk_band: "high", available_decisions: decisions("hold_transaction", "approve") })),
    ).toBe("urgent");
  });

  it("falls back to presentation.actions only when available_decisions is absent", () => {
    expect(
      deriveProposalTier(proposal({ risk_band: "low", presentation: { actions: decisions("approve", "reject") } })),
    ).toBe("waiting");
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

  it("auto-promotes a record to an actionable tier when core starts offering approve/reject", () => {
    /* The pending brain-core policy change, simulated: the SAME fraud record,
       before and after. Tier follows the API response with no code change. */
    const before = proposal({ risk_band: "high", available_decisions: decisions("acknowledge") });
    const after = proposal({ risk_band: "high", available_decisions: decisions("approve", "reject") });
    expect(deriveProposalTier(before)).toBe("insight");
    expect(deriveProposalTier(after)).toBe("urgent");
  });
});

describe("isUrgentRiskBand", () => {
  it("matches exactly the bands in URGENT_RISK_BANDS", () => {
    expect(URGENT_RISK_BANDS).toEqual(new Set(["high", "elevated"]));
    expect(isUrgentRiskBand("high")).toBe(true);
    expect(isUrgentRiskBand("elevated")).toBe(true);
    expect(isUrgentRiskBand("standard")).toBe(false);
    expect(isUrgentRiskBand("low")).toBe(false);
  });

  it("treats null and undefined as not urgent", () => {
    expect(isUrgentRiskBand(null)).toBe(false);
    expect(isUrgentRiskBand(undefined)).toBe(false);
  });
});

describe("non-proposal records", () => {
  it("never puts a payment intent in the red tier", () => {
    /* Every mapped intent carries a hardcoded severity: "info" — there is no
       real signal to escalate on. */
    expect(tierForPaymentIntent()).toBe("waiting");
  });

  it("puts read-only ledger facts in Insights", () => {
    expect(tierForReadOnlyInsight()).toBe("insight");
  });
});
