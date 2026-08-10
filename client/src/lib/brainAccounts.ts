/**
 * brain-core Ledger account shapes, in one place.
 *
 * These types were declared twice — once in FinancesPage for the accounts table
 * and once in AccountDetailPopup for the drill-down — with the popup's copy
 * carrying extra fields the table never read. Global search needed them a third
 * time, which is the point at which duplication stops being harmless: three
 * hand-maintained copies of a wire shape drift, and the drift shows up as a
 * field silently reading `undefined` on one surface only.
 *
 * The DTO here is the superset (the popup's view). A caller that renders fewer
 * fields is unaffected; a caller that renders more no longer has to redeclare.
 */

export type AccountKind =
  | "bank_checking"
  | "bank_savings"
  | "card"
  | "loan"
  | "line_of_credit"
  | "onchain"
  | "payment_processor";

export interface BrainAccountDTO {
  id: string;
  /** Upstream raw/source records that produced this ledger account. */
  source_ids?: string[];
  name: string;
  account_type: AccountKind;
  currency: string;
  institution?: string | null;
  external_account_id?: string | null;
  current_balance?: string | null;
  available_balance?: string | null;
  status?: string | null;
  provenance?: string | null;
  confidence?: number | null;
  updated_at?: string | null;
}

export interface BrainAccountsResponse {
  accounts: BrainAccountDTO[];
  next_cursor?: string | null;
}

/**
 * "Money in all accounts", computed honestly.
 *
 * The old total added up `current_balance` across every account it was handed.
 * On a live demo tenant that meant summing two USD bank accounts and an ETH
 * smart account into one dollar figure — a number that was not wrong by a
 * rounding error, it was adding units of different things. There is no FX rate
 * anywhere in this app (see `formatAmounts`, which treats ETH as native units
 * precisely because it cannot convert it), so a cross-currency total cannot be
 * produced, only faked.
 *
 * So this reports the total for ONE currency — the one the app is displaying —
 * and hands back what it left out so the caption can say so. A labelled subtotal
 * is a complete answer to a narrower question, which is the honest trade.
 *
 * It refuses outright on an unfinished cursor walk: a partial sum of a paged
 * account list is indistinguishable from a smaller balance.
 *
 * (Concentration deliberately does NOT do this — it refuses a percentage across
 * mixed currencies instead. Dropping accounts from a RATIO changes what the
 * ratio means, because the excluded holding is still real cash at risk.)
 */
export type AccountsTotalKind =
  | "loading"
  | "failed"
  /** Cursor walk unfinished — a sum would understate the balance. */
  | "incomplete"
  /** No accounts at all. */
  | "none"
  /** Accounts exist, but none in the display currency. */
  | "no_matching_currency"
  /** Accounts exist in the display currency, but none reported a balance. */
  | "unreadable"
  | "value";

export interface AccountsTotalView {
  kind: AccountsTotalKind;
  total: number | null;
  currency: string | null;
  /** Accounts held in a currency this app cannot convert, and so left out. */
  excludedCount: number;
  /** Distinct currency codes of those accounts, for the caption. */
  excludedCurrencies: string[];
}

export function accountsTotalView(input: {
  failed: boolean;
  read: { rows: readonly BrainAccountDTO[]; complete: boolean } | null;
  displayCurrency: string;
}): AccountsTotalView {
  const { failed, read, displayCurrency } = input;
  const target = (displayCurrency || "").toUpperCase();
  const none: Omit<AccountsTotalView, "kind"> = {
    total: null,
    currency: null,
    excludedCount: 0,
    excludedCurrencies: [],
  };

  if (failed) return { kind: "failed", ...none };
  if (read == null) return { kind: "loading", ...none };
  if (!read.complete) return { kind: "incomplete", ...none };
  if (read.rows.length === 0) return { kind: "none", ...none };

  const matching: BrainAccountDTO[] = [];
  const excluded: string[] = [];
  for (const a of read.rows) {
    const code = (a.currency || "").toUpperCase();
    if (code && code === target) matching.push(a);
    /* A blank currency is not evidence of the display currency. Counting it in
       would put an unknown-denomination balance into a labelled total. */
    else excluded.push(code || "unspecified");
  }
  const excludedCurrencies = [...new Set(excluded)].sort();
  const withExclusions = { ...none, excludedCount: excluded.length, excludedCurrencies };

  if (matching.length === 0) return { kind: "no_matching_currency", ...withExclusions };

  // A null balance is "not reported", not zero — it must not deflate the total.
  const readable = matching
    .map((a) => (a.current_balance == null ? null : Number(a.current_balance)))
    .filter((n): n is number => n !== null && Number.isFinite(n));
  if (readable.length === 0) return { kind: "unreadable", ...withExclusions };

  return {
    kind: "value",
    total: readable.reduce((sum, n) => sum + n, 0),
    currency: target,
    excludedCount: excluded.length,
    excludedCurrencies,
  };
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank_checking: "Bank checking",
  bank_savings: "Savings",
  card: "Card",
  loan: "Loan",
  line_of_credit: "Line of credit",
  onchain: "On-chain balance",
  payment_processor: "Payment processor",
};
