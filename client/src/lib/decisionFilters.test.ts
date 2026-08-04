import { describe, it, expect } from "vitest";
import {
  applyDecisionFilters,
  buildSearchText,
  decisionTypeLabel,
  hasActiveFilter,
  matchesFilters,
  matchesQuery,
  typeOptions,
  EMPTY_FILTERS,
  ROW_TIER_ORDER,
  type DecisionFacets,
} from "./decisionFilters";

const row = (over: Partial<DecisionFacets> = {}): DecisionFacets => ({
  tier: "waiting",
  status: "pending",
  type: "collections",
  search: "",
  ...over,
});

describe("filter facets are independent", () => {
  const rows = [
    row({ tier: "urgent", status: "pending", type: "fraud_anomaly", search: "quick pay duplicate" }),
    row({ tier: "waiting", status: "pending", type: "collections", search: "midmarket solutions" }),
    row({ tier: "decided", status: "approved", type: "collections", search: "riverside co" }),
    row({ tier: "insight", status: "informational", type: "cash_flow", search: "forecast dip" }),
  ];

  it("no filter keeps everything", () => {
    expect(applyDecisionFilters(rows, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("combines facets with AND", () => {
    const out = applyDecisionFilters(rows, { ...EMPTY_FILTERS, status: "approved", type: "collections" });
    expect(out).toHaveLength(1);
    expect(out[0].search).toBe("riverside co");
  });

  it("reaches a combination the old tabs could not — approved collections", () => {
    // Under tabs, "Approved" and a type were mutually exclusive views.
    const out = applyDecisionFilters(rows, { ...EMPTY_FILTERS, type: "collections" });
    expect(out.map((r) => r.status)).toEqual(["pending", "approved"]);
  });

  it("an empty result is empty, not unfiltered", () => {
    expect(applyDecisionFilters(rows, { ...EMPTY_FILTERS, type: "treasury" })).toHaveLength(0);
  });
});

describe("ordering", () => {
  it("orders by tier: urgent, waiting, insight, then decided history", () => {
    const scrambled = [
      row({ tier: "decided", search: "d" }),
      row({ tier: "insight", search: "i" }),
      row({ tier: "urgent", search: "u" }),
      row({ tier: "waiting", search: "w" }),
    ];
    expect(applyDecisionFilters(scrambled, EMPTY_FILTERS).map((r) => r.search)).toEqual(["u", "w", "i", "d"]);
  });

  it("preserves each source's own order within a tier", () => {
    const rows = [
      row({ tier: "waiting", search: "first" }),
      row({ tier: "waiting", search: "second" }),
      row({ tier: "waiting", search: "third" }),
    ];
    expect(applyDecisionFilters(rows, EMPTY_FILTERS).map((r) => r.search)).toEqual(["first", "second", "third"]);
  });

  it("urgent leads the order", () => {
    expect(ROW_TIER_ORDER[0]).toBe("urgent");
  });
});

describe("search", () => {
  it("requires every term, so more words narrow the list", () => {
    expect(matchesQuery("collections outreach for midmarket solutions", "midmarket outreach")).toBe(true);
    expect(matchesQuery("collections outreach for midmarket solutions", "midmarket treasury")).toBe(false);
  });

  it("is case-insensitive and ignores stray whitespace", () => {
    expect(matchesQuery("acme supplies", "  ACME   ")).toBe(true);
  });

  it("a blank query matches everything rather than nothing", () => {
    expect(matchesQuery("anything", "")).toBe(true);
    expect(matchesQuery("anything", "   ")).toBe(true);
  });

  it("searches the amount text the row displays", () => {
    const haystack = buildSearchText("Collections outreach", "Midmarket Solutions", "$42,000.00");
    expect(matchesQuery(haystack, "42,000")).toBe(true);
  });

  it("buildSearchText drops empty parts and lowercases", () => {
    expect(buildSearchText("Acme", null, undefined, "", "Supplies")).toBe("acme supplies");
  });
});

describe("type options come from the data, not a hardcoded list", () => {
  it("only offers types that are present", () => {
    const opts = typeOptions([row({ type: "collections" }), row({ type: "treasury" }), row({ type: "collections" })]);
    expect(opts.map((o) => o.value).sort()).toEqual(["collections", "treasury"]);
  });

  it("labels an unknown type as itself rather than hiding or mislabelling it", () => {
    expect(decisionTypeLabel("some_new_core_type")).toBe("Some new core type");
    expect(typeOptions([row({ type: "some_new_core_type" })])).toHaveLength(1);
  });

  it("uses friendly names for the types we know", () => {
    expect(decisionTypeLabel("fraud_anomaly")).toBe("Fraud and Anomaly");
    expect(decisionTypeLabel("cash_forecast")).toBe("Cash Forecasting");
    expect(decisionTypeLabel("revenue_intel")).toBe("Revenue Intelligence");
  });

  it("normalizes internal insight kinds to the owning agent category", () => {
    const opts = typeOptions([
      row({ type: "cashflow" }),
      row({ type: "cash_flow" }),
      row({ type: "cash_forecast" }),
      row({ type: "fraud" }),
    ]);
    expect(opts).toEqual([
      { value: "cash_forecast", label: "Cash Forecasting" },
      { value: "fraud_anomaly", label: "Fraud and Anomaly" },
    ]);
  });

  it("is stable under reordering of the input", () => {
    const a = typeOptions([row({ type: "treasury" }), row({ type: "collections" })]);
    const b = typeOptions([row({ type: "collections" }), row({ type: "treasury" })]);
    expect(a).toEqual(b);
  });
});

describe("hasActiveFilter drives the empty-state wording", () => {
  it("is false for the default state", () => {
    expect(hasActiveFilter(EMPTY_FILTERS)).toBe(false);
  });

  it("is false for a whitespace-only query", () => {
    expect(hasActiveFilter({ ...EMPTY_FILTERS, query: "   " })).toBe(false);
  });

  it("is true once any facet is set", () => {
    expect(hasActiveFilter({ ...EMPTY_FILTERS, priority: "urgent" })).toBe(true);
    expect(hasActiveFilter({ ...EMPTY_FILTERS, query: "acme" })).toBe(true);
  });
});

describe("matchesFilters", () => {
  it("matches on tier alone", () => {
    expect(matchesFilters(row({ tier: "urgent" }), { ...EMPTY_FILTERS, priority: "urgent" })).toBe(true);
    expect(matchesFilters(row({ tier: "waiting" }), { ...EMPTY_FILTERS, priority: "urgent" })).toBe(false);
  });
});
