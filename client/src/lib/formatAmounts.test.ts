import { describe, it, expect } from "vitest";
import { formatAmountsInText } from "./formatAmounts";

/* The USD-display case: format() is the identity-rate reformatter. */
const usd = {
  symbol: "$",
  format: (a: string | number) => {
    const n = Number(String(a).replace(/[$€,]/g, ""));
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
};

/* The EUR-display case: a 0.92 rate, mirroring currencyContext. */
const eur = {
  symbol: "€",
  format: (a: string | number) => {
    const n = Number(String(a).replace(/[$€,]/g, "")) * 0.92;
    return `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
};

describe("formatAmountsInText", () => {
  it("groups a bare symbol-prefixed amount (the reported regression)", () => {
    expect(formatAmountsInText("Total is $42000.00 due now.", usd)).toBe("Total is $42,000.00 due now.");
  });

  it("handles the code-PREFIX ledger excerpt shape", () => {
    // The old HomePage copy missed this one entirely.
    expect(formatAmountsInText("Invoice #A1 - USD 18600.00000000", usd)).toBe("Invoice #A1 - $18,600.00");
  });

  it("handles the code-SUFFIX summary shape", () => {
    // The old BrainAssistant copy missed this one entirely.
    expect(formatAmountsInText("Spend was 48000.00 USD last month.", usd)).toBe("Spend was $48,000.00 last month.");
  });

  it("applies the FX rate, which the assistant's old copy never did", () => {
    expect(formatAmountsInText("Balance USD 1000.00", eur)).toBe("Balance €920.00");
  });

  it("does not convert an amount already denominated in the active currency", () => {
    // Guards double-conversion: €500 is already EUR, so it must stay 500.
    expect(formatAmountsInText("Paid €500", eur)).toBe("Paid €500.00");
  });

  it("preserves a negative sign", () => {
    expect(formatAmountsInText("Net -$2400", usd)).toBe("Net -$2,400.00");
  });

  it("leaves ETH in native units without a fiat symbol", () => {
    expect(formatAmountsInText("Sent ETH 1.50000000", usd)).toBe("Sent ETH 1.50");
  });

  it("leaves already-grouped amounts stable (idempotent)", () => {
    const once = formatAmountsInText("Due $1,234.56", usd);
    expect(once).toBe("Due $1,234.56");
    expect(formatAmountsInText(once, usd)).toBe(once);
  });

  it("never touches numbers that are not amounts", () => {
    // Dates, percentages, counts and ULIDs share the text with real amounts;
    // guessing at bare numbers would corrupt all four.
    const text = "On 2026-07-17, 3 of 12 invoices were 85% matched (ref cp_01KYSF0Q).";
    expect(formatAmountsInText(text, usd)).toBe(text);
  });

  it("returns empty input unchanged", () => {
    expect(formatAmountsInText("", usd)).toBe("");
  });
});
