import { useQuery } from "@tanstack/react-query";
import type { Vendor, TrustStatus } from "./vendorTypes";

/* ── Live brain-core counterparties → Vendor cards ────────────────────────────
   Replaces MOCK_VENDORS as the VendorsPage/VendorDetailPopup data source with
   `GET /ledger/counterparties` (proxied verbatim by the BFF's generic GET
   passthrough — no new route needed; see server/brain/proxy.ts).

   Shape verified against brain-core source, not docs:
   - services/ledger/src/repository/counterparties.ts (CounterpartyRow) and
     services/ledger/migrations/0002_ledger_counterparties.sql (enum values).
   `/ledger/counterparties` returns the FULL row (id, name, type, risk_level,
   verified_status, aliases, ...), not the {id, name} "lite" slice FinancesPage
   destructures — so this hook declares its own fuller local type, same
   pattern as every other brain page (each declares the DTO slice it needs).

   Honesty: brain-core has NO payment-history aggregates, NO fraud-flag
   catalogue, and no "trusted/known/new" tiering on a counterparty — those are
   this app's OWN allowlist concept (mockVendors.ts), not a brain-core fact.
   We do NOT fabricate them. `trustStatus` is derived ONLY from the two real
   risk signals brain-core does carry (`risk_level`, `verified_status`); a
   counterparty with neither signal reads as "new" (Brain has no history on
   them yet — literally true, since this list carries no payment counts).
   payment-count/totalPaid/flags are always the neutral zero/empty default. */

const CATEGORY_LABEL: Record<string, string> = {
  merchant: "Merchant",
  vendor: "Vendor",
  customer: "Customer",
  employer: "Employer",
  bank: "Bank",
  wallet: "Wallet",
  exchange: "Exchange",
  tax_authority: "Tax authority",
  other: "Other",
};

export interface BrainCounterparty {
  id: string;
  name: string;
  type: string;
  risk_level: "low" | "medium" | "high" | "sanctioned" | null;
  verified_status: "unverified" | "self_attested" | "document_verified" | "sanctions_cleared" | null;
}
interface ListCounterpartiesResponse {
  counterparties: BrainCounterparty[];
}

/** Real signal only: sanctioned/high risk is genuinely "under review"; nothing
 *  else in the row supports "known" or "trusted" (those require payment
 *  history brain-core doesn't expose here), so everything else defaults "new". */
function deriveTrustStatus(cp: BrainCounterparty): TrustStatus {
  if (cp.risk_level === "sanctioned" || cp.risk_level === "high") return "under_review";
  return "new";
}

/** Map a live brain-core counterparty to the app's Vendor card shape. Neutral,
 *  honest defaults for everything brain-core doesn't report — no invented
 *  payment history, no fabricated flags. */
export function mapCounterpartyToVendor(cp: BrainCounterparty): Vendor {
  const trustStatus = deriveTrustStatus(cp);
  return {
    id: cp.id,
    name: cp.name,
    category: CATEGORY_LABEL[cp.type] ?? cp.type,
    trustStatus,
    // ponytail: brain-core's counterparty row carries no payout account
    // reference (that lives on payment rails, not the counterparty). "----"
    // reads as honestly unknown rather than a fabricated last4.
    payeeAccountLast4: "----",
    history: {
      paymentCount: 0,
      totalPaid: 0,
      firstPaidLabel: "No payments recorded",
      lastPaidLabel: "No payments recorded",
      avgAmount: 0,
      flagCount: 0,
    },
    flags:
      trustStatus === "under_review"
        ? [
            {
              kind: "reported_problem",
              label:
                cp.risk_level === "sanctioned"
                  ? "Sanctioned counterparty — payments blocked by policy"
                  : "High risk counterparty",
              raisedAtLabel: "brain-core risk assessment",
            },
          ]
        : [],
    eligibleForTrust: false,
    ruleIds: [],
  };
}

export function useBrainVendors() {
  const query = useQuery<ListCounterpartiesResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    vendors: (query.data?.counterparties ?? []).map(mapCounterpartyToVendor),
  };
}
