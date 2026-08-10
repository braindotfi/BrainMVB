import { describe, it, expect } from "vitest";
import { concentrationView, CONCENTRATION_WARN_PCT } from "./cashConcentration";
import type { BrainAccountDTO } from "./brainAccounts";

function acct(over: Partial<BrainAccountDTO>): BrainAccountDTO {
  return {
    id: "acct_1",
    name: "Account",
    account_type: "bank_checking",
    currency: "USD",
    current_balance: "100.00",
    ...over,
  };
}

const ok = (accounts: BrainAccountDTO[]) => concentrationView({ failed: false, accounts });

describe("concentrationView — read states", () => {
  it("states nothing when the read failed or is still loading", () => {
    expect(concentrationView({ failed: true, accounts: null }).kind).toBe("failed");
    expect(concentrationView({ failed: false, accounts: null }).kind).toBe("loading");
    expect(concentrationView({ failed: true, accounts: null }).pct).toBeNull();
  });

  it("distinguishes 'no cash accounts' from 'balances not reported'", () => {
    expect(ok([acct({ account_type: "loan", current_balance: "500" })]).kind).toBe("none");
    expect(ok([acct({ current_balance: null })]).kind).toBe("unreadable");
  });
});

describe("concentrationView — what counts as cash", () => {
  it("excludes borrowings, which would otherwise understate concentration", () => {
    // The card is a risk signal. Counting a card/loan in the denominator makes
    // the largest bank look like a smaller share than it is.
    const v = ok([
      acct({ id: "a", institution: "Chase", current_balance: "1000" }),
      acct({ id: "b", account_type: "card", institution: "Amex", current_balance: "5000" }),
      acct({ id: "c", account_type: "loan", institution: "BigBank", current_balance: "9000" }),
      acct({ id: "d", account_type: "line_of_credit", institution: "LoC", current_balance: "9000" }),
    ]);
    expect(v.kind).toBe("value");
    expect(v.totalCash).toBe(1000);
    expect(v.pct).toBe(1);
  });

  it("counts savings, processor and on-chain balances as cash", () => {
    const v = ok([
      acct({ id: "a", account_type: "bank_savings", institution: "A", current_balance: "100" }),
      acct({ id: "b", account_type: "payment_processor", institution: "B", current_balance: "100" }),
      acct({ id: "c", account_type: "onchain", institution: "C", current_balance: "100" }),
    ]);
    expect(v.totalCash).toBe(300);
    expect(v.bucketCount).toBe(3);
  });
});

describe("concentrationView — grouping", () => {
  it("treats two accounts at the same institution as ONE risk", () => {
    const v = ok([
      acct({ id: "a", institution: "Chase", current_balance: "600" }),
      acct({ id: "b", institution: "Chase", current_balance: "200" }),
      acct({ id: "c", institution: "Mercury", current_balance: "200" }),
    ]);
    expect(v.bucketCount).toBe(2);
    expect(v.largestLabel).toBe("Chase");
    expect(v.largestBalance).toBe(800);
    expect(v.pct).toBeCloseTo(0.8, 10);
  });

  it("gives each unlabelled account its own bucket rather than inventing a shared one", () => {
    // Collapsing nulls into one "unknown" institution would report a
    // concentration that may not exist. Separate buckets can only understate.
    const v = ok([
      acct({ id: "a", name: "Acct A", institution: null, current_balance: "500" }),
      acct({ id: "b", name: "Acct B", institution: null, current_balance: "500" }),
    ]);
    expect(v.bucketCount).toBe(2);
    expect(v.pct).toBeCloseTo(0.5, 10);
  });
});

describe("concentrationView — refusals and clamps", () => {
  it("states no percentage when balances span more than one currency", () => {
    const v = ok([
      acct({ id: "a", currency: "USD", institution: "A", current_balance: "100" }),
      acct({ id: "b", currency: "EUR", institution: "B", current_balance: "100" }),
    ]);
    expect(v.kind).toBe("mixed_currency");
    expect(v.pct).toBeNull();
    expect(v.totalCash).toBeNull();
  });

  it("never lets an overdrawn account push a bucket over 100%", () => {
    const v = ok([
      acct({ id: "a", institution: "A", current_balance: "1000" }),
      acct({ id: "b", institution: "B", current_balance: "-400" }),
    ]);
    expect(v.pct).toBeLessThanOrEqual(1);
    expect(v.totalCash).toBe(1000);
  });

  it("keeps a null balance out of both sides of the ratio", () => {
    const v = ok([
      acct({ id: "a", institution: "A", current_balance: "300" }),
      acct({ id: "b", institution: "B", current_balance: null }),
    ]);
    expect(v.totalCash).toBe(300);
    expect(v.bucketCount).toBe(1);
  });
});

describe("concentrationView — the warning threshold", () => {
  it("warns at the threshold and stays calm just below it", () => {
    const at = ok([
      acct({ id: "a", institution: "A", current_balance: String(CONCENTRATION_WARN_PCT * 100) }),
      acct({ id: "b", institution: "B", current_balance: String(100 - CONCENTRATION_WARN_PCT * 100) }),
    ]);
    expect(at.warn).toBe(true);

    const below = ok([
      acct({ id: "a", institution: "A", current_balance: "50" }),
      acct({ id: "b", institution: "B", current_balance: "50" }),
    ]);
    expect(below.warn).toBe(false);
  });
});
