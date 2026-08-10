import { describe, it, expect } from "vitest";
import { accountsTotalView, type BrainAccountDTO } from "./brainAccounts";

function acct(over: Partial<BrainAccountDTO> = {}): BrainAccountDTO {
  return {
    id: "acct_1",
    name: "Operating",
    account_type: "bank_checking",
    currency: "USD",
    current_balance: "100.00",
    ...over,
  };
}

const complete = (rows: BrainAccountDTO[]) => ({ rows, complete: true });

describe("accountsTotalView", () => {
  it("totals accounts that share the display currency", () => {
    const v = accountsTotalView({
      failed: false,
      read: complete([acct({ current_balance: "100.50" }), acct({ id: "a2", current_balance: "9.50" })]),
      displayCurrency: "USD",
    });
    expect(v.kind).toBe("value");
    expect(v.total).toBe(110);
    expect(v.excludedCount).toBe(0);
  });

  /* The bug this function exists for: a live demo tenant holds two USD banks and
     an ETH smart account, and the old total added the ETH figure to the dollars. */
  it("never adds a foreign-currency balance into the total", () => {
    const v = accountsTotalView({
      failed: false,
      read: complete([
        acct({ current_balance: "2000.00" }),
        acct({ id: "a2", current_balance: "700.00" }),
        acct({ id: "a3", currency: "ETH", account_type: "onchain", current_balance: "1500.00" }),
      ]),
      displayCurrency: "USD",
    });
    expect(v.total).toBe(2700);
    expect(v.excludedCount).toBe(1);
    expect(v.excludedCurrencies).toEqual(["ETH"]);
  });

  it("refuses a total on an unfinished cursor walk", () => {
    const v = accountsTotalView({
      failed: false,
      read: { rows: [acct()], complete: false },
      displayCurrency: "USD",
    });
    expect(v.kind).toBe("incomplete");
    expect(v.total).toBeNull();
  });

  it("does not treat a blank currency as the display currency", () => {
    const v = accountsTotalView({
      failed: false,
      read: complete([acct({ currency: "", current_balance: "5000.00" })]),
      displayCurrency: "USD",
    });
    expect(v.kind).toBe("no_matching_currency");
    expect(v.total).toBeNull();
    expect(v.excludedCurrencies).toEqual(["unspecified"]);
  });

  it("treats a null balance as unreported rather than zero", () => {
    const v = accountsTotalView({
      failed: false,
      read: complete([acct({ current_balance: null }), acct({ id: "a2", current_balance: "40.00" })]),
      displayCurrency: "USD",
    });
    expect(v.kind).toBe("value");
    expect(v.total).toBe(40);
  });

  it("reports unreadable when no matching account states a balance", () => {
    const v = accountsTotalView({
      failed: false,
      read: complete([acct({ current_balance: null })]),
      displayCurrency: "USD",
    });
    expect(v.kind).toBe("unreadable");
  });

  it("distinguishes a failed read from an empty one", () => {
    expect(accountsTotalView({ failed: true, read: null, displayCurrency: "USD" }).kind).toBe("failed");
    expect(accountsTotalView({ failed: false, read: null, displayCurrency: "USD" }).kind).toBe("loading");
    expect(accountsTotalView({ failed: false, read: complete([]), displayCurrency: "USD" }).kind).toBe("none");
  });

  it("follows the display currency rather than assuming dollars", () => {
    const v = accountsTotalView({
      failed: false,
      read: complete([acct({ currency: "EUR", current_balance: "80.00" }), acct({ id: "a2", current_balance: "999.00" })]),
      displayCurrency: "EUR",
    });
    expect(v.total).toBe(80);
    expect(v.currency).toBe("EUR");
    expect(v.excludedCurrencies).toEqual(["USD"]);
  });
});
