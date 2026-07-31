import { describe, it, expect } from "vitest";
import { unpaidApInvoices, liabilitiesTotal, type ApInvoiceLike } from "./liabilities";

/**
 * The defect these tests exist for: an unreachable invoice read rendered as
 * "No outstanding liabilities. You are all caught up." A false all-clear on money
 * owed is worse than a blank card, so the null-vs-zero distinction is a contract,
 * not an implementation detail — both surfaces branch on it.
 */

const ap = (amount: string | number, status = "open"): ApInvoiceLike => ({
  status,
  amount_due: amount,
  metadata: { scenario: "ap" },
});

const ar = (amount: string | number, status = "open"): ApInvoiceLike => ({
  status,
  amount_due: amount,
  metadata: { scenario: "ar" },
});

describe("liabilitiesTotal — absence of data is not a zero balance", () => {
  it("returns null when invoices are unreachable, so callers cannot render a false all-clear", () => {
    expect(liabilitiesTotal(null)).toBeNull();
    expect(liabilitiesTotal(undefined)).toBeNull();
  });

  it("returns 0 — a real claim that nothing is owed — for an empty but present list", () => {
    expect(liabilitiesTotal([])).toBe(0);
  });

  it("distinguishes the two cases, which is the whole point", () => {
    expect(liabilitiesTotal(null)).not.toBe(liabilitiesTotal([]));
  });

  it("returns 0 when every AP invoice is paid", () => {
    expect(liabilitiesTotal([ap(500, "paid"), ap(250, "paid")])).toBe(0);
  });
});

describe("unpaidApInvoices — money-out only", () => {
  it("excludes AR, or liabilities would be inflated by what customers owe us", () => {
    const rows = [ap(1000), ar(9_000_000), ap(200)];
    expect(unpaidApInvoices(rows)).toHaveLength(2);
    expect(liabilitiesTotal(rows)).toBe(1200);
  });

  it("excludes paid bills", () => {
    expect(unpaidApInvoices([ap(100), ap(100, "paid")])).toHaveLength(1);
  });

  it("treats a missing scenario as not-AP rather than guessing", () => {
    const rows: ApInvoiceLike[] = [{ status: "open", amount_due: 500 }, { status: "open", amount_due: 500, metadata: null }];
    expect(unpaidApInvoices(rows)).toHaveLength(0);
    expect(liabilitiesTotal(rows)).toBe(0);
  });

  it("tolerates a null/undefined list without throwing", () => {
    expect(unpaidApInvoices(null)).toEqual([]);
    expect(unpaidApInvoices(undefined)).toEqual([]);
  });
});

describe("amount parsing", () => {
  it("sums string amounts as the API returns them", () => {
    expect(liabilitiesTotal([ap("211000.00"), ap("200.00")])).toBe(211200);
  });

  it("lets one unparseable row understate the total instead of blanking the card", () => {
    expect(liabilitiesTotal([ap("not-a-number"), ap(300)])).toBe(300);
    expect(liabilitiesTotal([ap(null as unknown as number), ap(300)])).toBe(300);
  });
});

describe("Overview and Ledger agree", () => {
  it("the metric card total matches the sum of the rows the Ledger lists", () => {
    const rows = [ap("211000.00"), ap("200.00"), ar("50000.00"), ap("99.99", "paid")];

    // Overview: liabilitiesTotal(...)
    const metric = liabilitiesTotal(rows);
    // Ledger: renders unpaidApInvoices(...) and sums them
    const listed = unpaidApInvoices(rows).reduce((s, i) => s + Number(i.amount_due), 0);

    expect(metric).toBe(listed);
    expect(metric).toBe(211200);
  });
});
