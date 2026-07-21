import { describe, it, expect } from "vitest";

/** Mirror the exact reduce both HomePage and FinancesPage use. */
export function computeAccountTotal(
  accounts: { current_balance?: string | null }[],
): number {
  return accounts.reduce(
    (sum, a) => sum + (a.current_balance != null ? Number(a.current_balance) || 0 : 0),
    0,
  );
}

/** Split a formatted currency string into whole (symbol+integers) and cents
 *  (decimal+2digits) so the UI can render them at different sizes/colors. */
export function splitFormattedCurrency(formatted: string): { whole: string; cents: string } {
  const m = formatted.match(/^(.+)\.(\d{2})$/);
  return m ? { whole: m[1], cents: `.${m[2]}` } : { whole: formatted, cents: "" };
}

describe("computeAccountTotal + splitFormattedCurrency", () => {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  it("Home and Finances produce identical totals for the same account data", () => {
    const accounts = [
      { current_balance: "1443600.0025" },
      { current_balance: "1443600.0025" },
    ];

    const total = computeAccountTotal(accounts);

    // Finances path: format(total) directly
    const finFormatted = fmt(total);

    // Home path: format(total) then split (the fixed approach)
    const { whole, cents } = splitFormattedCurrency(fmt(total));
    const homeFormatted = whole + cents;

    expect(homeFormatted).toBe(finFormatted);
    expect(homeFormatted).toBe("$2,887,200.01");
  });

  it("split helper does not duplicate decimals", () => {
    const { whole, cents } = splitFormattedCurrency(fmt(2887200));
    expect(whole).toBe("$2,887,200");
    expect(cents).toBe(".00");
    expect(whole + cents).toBe("$2,887,200.00");
  });

  it("handles integer totals (no cents) gracefully", () => {
    const { whole, cents } = splitFormattedCurrency("$2,887,200");
    expect(whole).toBe("$2,887,200");
    expect(cents).toBe("");
  });
});
