import { describe, expect, it } from "vitest";
import {
  formatTransactionAmount,
  shortenIdentifier,
  transactionFlow,
  transactionMeta,
} from "./accountsPanelFormat";

describe("transactionFlow", () => {
  it("classifies the two directions the feed actually states", () => {
    expect(transactionFlow("outflow")).toBe("out");
    expect(transactionFlow("inflow")).toBe("in");
  });

  it("refuses to call a transfer or an adjustment incoming", () => {
    // The feed carries magnitude in `amount` and polarity in `direction`, so an
    // unsigned transfer is not evidence of money arriving.
    expect(transactionFlow("transfer")).toBe("neutral");
    expect(transactionFlow("adjustment")).toBe("neutral");
  });
});

describe("formatTransactionAmount", () => {
  it("matches the Figma row format", () => {
    expect(formatTransactionAmount("240", "usd", "out")).toBe("-$240");
    expect(formatTransactionAmount("1000", "USD", "in")).toBe("+$1,000");
    expect(formatTransactionAmount("514.45", "USD", "out")).toBe("-$514.45");
  });

  it("keeps the direction's sign even when the amount arrives unsigned or already signed", () => {
    expect(formatTransactionAmount("-240", "USD", "out")).toBe("-$240");
    expect(formatTransactionAmount("240", "USD", "out")).toBe("-$240");
  });

  it("drops trailing zeros but never rounds a real digit away", () => {
    expect(formatTransactionAmount("240.00", "USD", "out")).toBe("-$240");
    expect(formatTransactionAmount("0.123456789", "USD", "in")).toBe("+$0.123456789");
    expect(formatTransactionAmount("514.456", "USD", "out")).toBe("-$514.456");
  });

  it("keeps precision that Number would destroy", () => {
    expect(formatTransactionAmount("9007199254740993", "USD", "in")).toBe("+$9,007,199,254,740,993");
    expect(formatTransactionAmount("0.000000000001", "ETH", "in")).toBe("+0.000000000001 ETH");
  });

  it("states a non-USD amount in its own currency, because no FX source exists", () => {
    expect(formatTransactionAmount("1000", "usdt", "in")).toBe("+1,000 USDT");
    expect(formatTransactionAmount("3.25", "ETH", "out")).toBe("-3.25 ETH");
  });

  it("gives a transfer no invented sign, but keeps one the value carries", () => {
    expect(formatTransactionAmount("1000", "USD", "neutral")).toBe("$1,000");
    expect(formatTransactionAmount("-1000", "USD", "neutral")).toBe("-$1,000");
  });

  it("never signs a zero", () => {
    expect(formatTransactionAmount("0", "USD", "out")).toBe("$0");
    expect(formatTransactionAmount("0.00", "USD", "in")).toBe("$0");
  });

  it("shows an unreadable amount verbatim instead of turning it into a figure", () => {
    expect(formatTransactionAmount("", "USD", "out")).toBe("Amount unavailable");
    expect(formatTransactionAmount("   ", "USD", "out")).toBe("Amount unavailable");
    expect(formatTransactionAmount("1.2e5", "USD", "out")).toBe("1.2e5 USD");
    expect(formatTransactionAmount("unknown", "ETH", "in")).toBe("unknown ETH");
  });
});

describe("transactionMeta", () => {
  it("reads a date-only value as a calendar date, whatever the viewer's timezone", () => {
    // new Date("2026-07-05") is UTC midnight, which is the 4th in every western
    // timezone. The feed said the 5th.
    expect(transactionMeta("2026-07-05")).toEqual(["5 Sun"]);
    expect(transactionMeta("2026-01-01")).toEqual(["1 Thu"]);
  });

  it("does not invent a clock time for a date-only value", () => {
    expect(transactionMeta("2026-09-17")).toHaveLength(1);
  });

  it("renders time and day for a real instant", () => {
    const parts = transactionMeta("2026-09-20T20:49:00Z");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^\d{1,2}:\d{2}[ap]m$/);
    expect(parts[1]).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
  });

  it("leaves an impossible or unreadable date exactly as it arrived", () => {
    // Date.UTC rolls this forward to 2 March; that is not what the feed said.
    expect(transactionMeta("2026-02-31")).toEqual(["2026-02-31"]);
    expect(transactionMeta("not a date")).toEqual(["not a date"]);
    expect(transactionMeta("")).toEqual([]);
  });
});

describe("shortenIdentifier", () => {
  it("uses the Figma truncation for a wallet address", () => {
    expect(shortenIdentifier("0x7cB57B5A98BaA1eE1F4C1D1A0F0b6b0C0d0486A8")).toBe("0x7cB5.....486A8");
  });

  it("leaves anything that would not get shorter alone", () => {
    expect(shortenIdentifier("4419")).toBe("4419");
    // 16 chars: the shortened form is also 16, so truncating would only lose data.
    expect(shortenIdentifier("0123456789abcdef")).toBe("0123456789abcdef");
    expect(shortenIdentifier("0123456789abcdefg")).toBe("012345.....cdefg");
  });
});
