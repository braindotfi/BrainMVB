import { describe, expect, it } from "vitest";
import { transactionMatchesFilter } from "@/lib/accountsPanelFormat";

describe("transactionMatchesFilter", () => {
  it("keeps every direction under All", () => {
    for (const direction of ["inflow", "outflow", "transfer", "adjustment"] as const) {
      expect(transactionMatchesFilter(direction, "all")).toBe(true);
    }
  });

  it("maps the available ledger directions onto the Figma filters", () => {
    expect(transactionMatchesFilter("inflow", "deposits")).toBe(true);
    expect(transactionMatchesFilter("outflow", "withdrawals")).toBe(true);
    // The ledger has no authoritative trade/type field. Transfers and
    // adjustments must not be relabelled as trades.
    expect(transactionMatchesFilter("transfer", "trades")).toBe(false);
    expect(transactionMatchesFilter("adjustment", "trades")).toBe(false);

    expect(transactionMatchesFilter("outflow", "deposits")).toBe(false);
    expect(transactionMatchesFilter("inflow", "withdrawals")).toBe(false);
    expect(transactionMatchesFilter("inflow", "trades")).toBe(false);
  });
});