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

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank_checking: "Bank checking",
  bank_savings: "Savings",
  card: "Card",
  loan: "Loan",
  line_of_credit: "Line of credit",
  onchain: "On-chain balance",
  payment_processor: "Payment processor",
};
