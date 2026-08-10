/**
 * Bank concentration — "how much of the cash sits in one place".
 *
 * ## Why only cash-bearing accounts are counted
 *
 * `/ledger/accounts` returns cards, loans and lines of credit alongside bank
 * and processor balances. Those are borrowings, not cash: including a card in
 * the denominator makes the largest bank look like a smaller share of "cash"
 * than it really is, which is the wrong direction for a risk indicator — it
 * reports safety that isn't there. Only the account kinds that actually hold
 * spendable money are summed, and the list is explicit rather than a negation
 * so a new liability-shaped `account_type` cannot silently join the pool.
 *
 * ## Why mixed currencies produce no percentage
 *
 * Balances arrive per-account in that account's own currency and there is no FX
 * rate anywhere in this codebase. Summing 100 EUR and 100 USD into "200" and
 * dividing by it yields a number that is not a percentage of anything. Rather
 * than pick a fake rate or silently assume USD, a multi-currency pool returns
 * `kind: "mixed_currency"` and states no figure. (The Overview total card sums
 * naively today — that is a known, separate simplification; it is not a licence
 * to compound it into a ratio here, where the error is invisible.)
 *
 * ## Why grouping is by institution, falling back to account
 *
 * Concentration risk is about the institution that could fail or freeze, not
 * the account number — two checking accounts at the same bank are one risk. But
 * `institution` is optional on the DTO, and collapsing every unlabelled account
 * into a single "unknown" bucket would invent a concentration that may not
 * exist. Unlabelled accounts are therefore each treated as their own bucket,
 * which can only ever understate concentration — the safe direction for a
 * warning to be wrong in.
 */

import type { AccountKind, BrainAccountDTO } from "./brainAccounts";

/** Account kinds that hold spendable cash. Deliberately explicit — see header. */
export const CASH_ACCOUNT_KINDS: ReadonlySet<AccountKind> = new Set<AccountKind>([
  "bank_checking",
  "bank_savings",
  "payment_processor",
  "onchain",
]);

/**
 * Share of cash in one place at or above which the card switches to a warning
 * treatment. A presentation threshold chosen for this card — it is NOT read
 * from tenant policy, and nothing downstream treats it as a rule.
 */
export const CONCENTRATION_WARN_PCT = 0.75;

export type ConcentrationKind =
  | "failed"
  | "loading"
  /** No cash-bearing accounts at all — nothing to concentrate. */
  | "none"
  /** Balances span more than one currency, so no ratio can be stated. */
  | "mixed_currency"
  /** Every cash account reported a null balance: present, but unreadable. */
  | "unreadable"
  | "value";

export interface ConcentrationView {
  kind: ConcentrationKind;
  /** 0..1 share of total cash held by the largest bucket. Null unless `kind === "value"`. */
  pct: number | null;
  /** Display name of the largest bucket (institution, else the account's own name). */
  largestLabel: string | null;
  largestBalance: number | null;
  totalCash: number | null;
  /** Number of distinct institutions/accounts the cash is spread across. */
  bucketCount: number;
  /** True when `pct` is at or above CONCENTRATION_WARN_PCT. */
  warn: boolean;
}

/** brain-core sends decimal strings; a number is accepted too. Null stays null. */
function balance(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decide what the concentration card shows.
 *
 * Pure, so the cases that matter — one bank holding everything, two currencies,
 * all-null balances — are assertable without a live tenant.
 */
export function concentrationView(input: {
  failed: boolean;
  accounts: readonly BrainAccountDTO[] | null;
}): ConcentrationView {
  const { failed, accounts } = input;
  const none: Omit<ConcentrationView, "kind"> = {
    pct: null,
    largestLabel: null,
    largestBalance: null,
    totalCash: null,
    bucketCount: 0,
    warn: false,
  };
  if (failed) return { kind: "failed", ...none };
  if (accounts == null) return { kind: "loading", ...none };

  const cash = accounts.filter((a) => CASH_ACCOUNT_KINDS.has(a.account_type));
  if (cash.length === 0) return { kind: "none", ...none };

  // A null balance is "not reported", not zero. Dropping those rows keeps them
  // out of BOTH sides of the ratio rather than deflating the denominator.
  const readable = cash
    .map((a) => ({ account: a, amount: balance(a.current_balance) }))
    .filter((r): r is { account: BrainAccountDTO; amount: number } => r.amount !== null);
  if (readable.length === 0) return { kind: "unreadable", ...none };

  const currencies = new Set(readable.map((r) => (r.account.currency || "").toUpperCase()).filter(Boolean));
  if (currencies.size > 1) return { kind: "mixed_currency", ...none };

  /* Negative cash (an overdrawn checking account) would let a bucket exceed
     100% of a shrunken total. Clamp at zero: an overdrawn account contributes
     no cash, and the largest positive holding is still the real risk. */
  const buckets = new Map<string, number>();
  let totalCash = 0;
  for (const { account, amount } of readable) {
    if (amount <= 0) continue;
    const label = account.institution?.trim() || account.name?.trim() || account.id;
    buckets.set(label, (buckets.get(label) ?? 0) + amount);
    totalCash += amount;
  }
  if (totalCash <= 0 || buckets.size === 0) return { kind: "none", ...none };

  let largestLabel = "";
  let largestBalance = 0;
  for (const [label, amount] of buckets) {
    if (amount > largestBalance) {
      largestBalance = amount;
      largestLabel = label;
    }
  }
  const pct = largestBalance / totalCash;
  return {
    kind: "value",
    pct,
    largestLabel,
    largestBalance,
    totalCash,
    bucketCount: buckets.size,
    warn: pct >= CONCENTRATION_WARN_PCT,
  };
}
