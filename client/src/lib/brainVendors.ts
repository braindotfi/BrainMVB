import { useQuery } from "@tanstack/react-query";
import type { Vendor, TrustStatus, TrustState, VendorTier } from "./vendorTypes";

/* ── Live brain-core counterparties → Vendor cards ────────────────────────────
   Replaces MOCK_VENDORS as the VendorsPage/VendorDetailPopup data source with
   `GET /ledger/counterparties` (proxied verbatim by the BFF's generic GET
   passthrough - no new route needed; see server/brain/proxy.ts).

   Shape verified against brain-core source, not docs:
   - services/ledger/src/repository/counterparties.ts (CounterpartyRow) and
     services/ledger/migrations/0002_ledger_counterparties.sql (enum values).
   `/ledger/counterparties` returns the FULL row (id, name, type, risk_level,
   verified_status, aliases, ...), not the {id, name} "lite" slice FinancesPage
   destructures - so this hook declares its own fuller local type, same
   pattern as every other brain page (each declares the DTO slice it needs).

   Honesty: brain-core carries NO fraud-flag catalogue and no user-granted
   "trusted" tier. That last one is this app's OWN allowlist concept
   (mockVendors.ts) and brain-core exposes no way to grant it: its ledger routes
   actively REJECT `provenance`, `confidence`, `verified_status` and
   `risk_level` in any write body (rejectTrustFields in
   services/ledger/src/routes/index.ts), and there is no grant/revoke/pause
   transition on a counterparty in the deployed OpenAPI. We do NOT fabricate it.

   What IS real, and now mapped:
   - `risk_level` / `verified_status` — brain-core's own risk signals.
   - `payment_count` / `payment_total` — read-side rollups over posted or
     cleared OUTFLOW transactions linked to this counterparty (brain-core PRs
     #224/#225, live in the deployed spec). These make "has Brain seen us pay
     them?" answerable, so a counterparty with real history no longer has to
     read as "new".

   Trust tiers therefore derive as:
     high|sanctioned risk            → "under_review" (needs review: risk)
     no risk signal, no payments yet → "new"          (needs review: new)
     no risk signal, has payments    → "known"        (Brain suggests trust)
     "trusted"                       → never derived. Only a user grant could
                                       produce it, and no such endpoint exists. */

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
  /** Read-side rollups. Optional because the BFF forwards brain-core verbatim:
   *  a client type for a proxied read describes what we hope arrives, not what
   *  does. Both are coerced defensively below rather than dereferenced. */
  payment_count?: number | null;
  payment_total?: string | number | null;
  /** Forthcoming. Absent on every deployed brain-core today, hence optional and
   *  validated against the known set rather than cast — an unrecognised value
   *  is treated as "field not reported", never coerced into a review state. */
  trust_status?: string | null;
}

const TRUST_STATES: readonly TrustState[] = ["unreviewed", "trusted", "paused", "acknowledged"];

/** Read brain-core's review state without trusting it blindly. Returns
 *  undefined when the field is missing or carries a value we don't know, which
 *  keeps "brain-core said nothing" distinguishable from "brain-core said
 *  unreviewed" — the tier derivation below depends on that difference. */
function readTrustState(value: unknown): TrustState | undefined {
  return typeof value === "string" && (TRUST_STATES as readonly string[]).includes(value)
    ? (value as TrustState)
    : undefined;
}
interface ListCounterpartiesResponse {
  counterparties: BrainCounterparty[];
}

/** brain-core sends payment_total as a decimal STRING. Coerce defensively: an
 *  absent or unparseable value is 0 payments, never NaN on screen. */
function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function toAmount(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** Real signals only. Risk outranks history: a flagged counterparty we have
 *  paid many times is still under review.
 *
 *  When brain-core reports `trust_status` it is the canonical answer and wins
 *  over the derivation — that is the whole point of the field. Until then
 *  "trusted" stays unreachable; see the module header. */
function deriveTrustStatus(
  cp: BrainCounterparty,
  paymentCount: number,
  trustState: TrustState | undefined,
): TrustStatus {
  if (trustState === "trusted") return "trusted";
  if (trustState === "paused") return "under_review";
  if (cp.risk_level === "sanctioned" || cp.risk_level === "high") return "under_review";
  /* "acknowledged" means a human dismissed the row without granting trust. It
     leaves the review queue (see isNeedsReview) but it is not a trust grant, so
     the tier still comes from history. */
  return paymentCount > 0 ? "known" : "new";
}

/** Map a live brain-core counterparty to the app's Vendor card shape. Neutral,
 *  honest defaults for everything brain-core doesn't report - no invented
 *  payment history, no fabricated flags. */
export function mapCounterpartyToVendor(cp: BrainCounterparty): Vendor {
  const paymentCount = toCount(cp.payment_count);
  const totalPaid = toAmount(cp.payment_total);
  const trustState = readTrustState(cp.trust_status);
  const trustStatus = deriveTrustStatus(cp, paymentCount, trustState);
  const riskLevel =
    cp.risk_level === "sanctioned" || cp.risk_level === "high" ? cp.risk_level : null;

  return {
    id: cp.id,
    name: cp.name,
    category: CATEGORY_LABEL[cp.type] ?? cp.type,
    trustStatus,
    trustState,
    segment: cp.type === "customer" ? "customer" : "vendor",
    riskLevel,
    // ponytail: brain-core's counterparty row carries no payout account
    // reference (that lives on payment rails, not the counterparty). "----"
    // reads as honestly unknown rather than a fabricated last4.
    payeeAccountLast4: "----",
    history: {
      paymentCount,
      totalPaid,
      // The LIST rollups are counts and sums only — no dates. The detail popup
      // fills these in from /ledger/transactions, which does carry them.
      firstPaidLabel: "No payments recorded",
      lastPaidLabel: "No payments recorded",
      avgAmount: paymentCount > 0 ? totalPaid / paymentCount : 0,
      flagCount: riskLevel ? 1 : 0,
    },
    flags: riskLevel
      ? [
          {
            kind: "reported_problem",
            label:
              riskLevel === "sanctioned"
                ? "Sanctioned counterparty. Payments blocked by policy"
                : "High risk counterparty",
            raisedAtLabel: "brain-core risk assessment",
          },
        ]
      : [],
    // Brain "suggests" trust from real payment history — the same signal that
    // makes a counterparty "known". Never true for a risk-flagged row.
    eligibleForTrust: trustStatus === "known",
    ruleIds: [],
  };
}

/* ── THE needs-review predicate ───────────────────────────────────────────────
   One definition, used by the chip badge, the chip's list, and the row reason
   chip, so a count can never reference rows the list won't render.

   Two shapes, because the ground truth is moving:

   1. brain-core reports `trust_status` → (trust_status = unreviewed) OR
      riskFlagged. That is the canonical, audited answer, and acting on a row
      (grant / pause / acknowledge) is what removes it from the queue.
   2. brain-core reports nothing → derive it: new, known, OR risk-flagged.
      "known" is a locally-derived status (paymentCount > 0, no risk/trust
      override) that means "Brain has seen us pay this counterparty but no
      human has confirmed trust". It is NOT a value brain-core sends — its
      trust_status field can only be unreviewed/trusted/paused/acknowledged.
      These rows belong in the review queue until a user acts on them.
      There is no local "reviewed" bit and that is deliberate, not a shortcut:
      marking a counterparty reviewed would be a trust-field write, which
      brain-core rejects outright. There is nowhere to persist it.

   Risk always wins. A row someone flagged or dismissed is still risk-flagged,
   and a risk-flagged row is never quietly settled by a click. */
export function isNeedsReview(v: Vendor): boolean {
  if (v.riskLevel === "high" || v.riskLevel === "sanctioned") return true;
  if (v.trustState !== undefined) return v.trustState === "unreviewed";
  /* "known" is included here: a counterparty with payment history but no
     explicit trust grant has not been reviewed — they need confirmation.
     Excluding them from this predicate silently drops real live rows. */
  return v.trustStatus === "under_review" || v.trustStatus === "new" || v.trustStatus === "known";
}

/* ── Tier assignment ──────────────────────────────────────────────────────────
   Exactly one tier per row, first match wins. This is the same invariant the
   needs-review predicate exists to protect, extended to the whole chip row: a
   row shown under two chips would let two counts disagree about the same work.
   Needs Review therefore outranks Flagged — a risk-flagged row that someone
   also paused is unfinished business, not parked business.

   Returns null when no tier fits. Every combination that is reachable from
   real brain-core data must land in a named tier — a null today means a row
   a user can never find or act on. A console.warn fires unconditionally on
   null so that a future regression is detectable in production telemetry
   rather than silently losing rows. */
export function vendorTier(v: Vendor): VendorTier | null {
  /* Suggested slots in HERE, first, once brain-core confirms which provenance
     values (if any) mean "Brain inferred this, nobody has confirmed it". Order
     is the whole decision: a suggested row is also unreviewed, so whichever
     check runs first owns it. Ahead of the unreviewed check, suggestions read
     as an opportunity; behind it, they vanish into the review queue.

     If brain-core reports that no suggestion-shaped provenance value exists,
     leave this alone — the chip stays hidden while its bucket is empty. Do not
     substitute a locally-invented predicate; a tier the user can act on has to
     mean something upstream can vouch for. */
  if (isNeedsReview(v)) return "needsReview";
  if (v.trustState === "paused") return "flagged";
  /* Dismissed rows live here too, badged "Reviewed". They are not a trust grant,
     but they have been dealt with, and a row a user acted on must stay findable
     somewhere — otherwise dismissing looks like deleting. */
  if (v.trustStatus === "trusted" || v.trustState === "acknowledged") return "trusted";
  /* Nothing matched. This path should be unreachable for any combination
     derivable from real brain-core data — if it fires, a row is silently
     invisible and the bug needs a new branch above, not a suppression here. */
  console.warn(
    "[vendorTier] unclassifiable row — no tier matched; row will not render.",
    { id: v.id, trustStatus: v.trustStatus, trustState: v.trustState, riskLevel: v.riskLevel },
  );
  return null;
}

/** Dismissed-but-not-trusted rows, which share the Trusted/Confirmed list and
 *  need a badge to explain why they are sitting in it. */
export function isReviewedOnly(v: Vendor): boolean {
  return v.trustState === "acknowledged" && v.trustStatus !== "trusted";
}

/** Why a row sits in Needs Review. Risk outranks newness when both apply. */
export function reviewReasonLabel(v: Vendor): string | null {
  if (!isNeedsReview(v)) return null;
  if (v.riskLevel === "sanctioned") return "Risk: sanctioned";
  if (v.riskLevel === "high") return "Risk: high";
  if (v.trustStatus === "under_review") return "Flagged for review";
  return "New";
}

/** Mock fixtures predate the Vendors/Customers split; treat them as vendors. */
export function vendorSegment(v: Vendor): "vendor" | "customer" {
  return v.segment ?? "vendor";
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

/* ── Live vendor DETAIL enrichment ────────────────────────────────────────────
   The list mapper above has no payment history (the /counterparties LIST carries
   none). When the detail popup opens, this fills it in from the one read that DOES
   carry it: `/ledger/transactions?counterparty_id=` (real payments), reachable via
   the BFF's generic GET passthrough. Honest: "payments" counts ONLY outflows to
   this counterparty (money we actually paid them) - a counterparty with only
   inflows or no transactions reads "No payments recorded" (literally true).

   Trust is deliberately NOT refined here. brain-core exposes no payment-history-
   based trust signal, and its KYC `verified_status` is a different concept from
   this app's user-granted trust tiers ("known" = Brain suggests trust FROM payment
   history) - overloading a tier with a verification signal would make the "known"
   copy ("based on consistent payment history") lie for a zero-payment vendor. So
   trust stays exactly as the list mapper derived it (risk-only). Surfacing KYC
   verification honestly is a separate future element, not this increment. */

interface BrainTxLite {
  amount: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
}
interface TxByCounterpartyResponse {
  transactions: BrainTxLite[];
}

function fmtVendorDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Unknown date"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Enrich a list Vendor with live payment history for the detail popup. Returns the
 *  base vendor while loading or when there are no outflows (honest zeros stay
 *  zeros). Safe to call with null - the query disables. */
export function useBrainVendorDetail(base: Vendor | null): Vendor | null {
  const id = base?.id ?? "";
  const txQuery = useQuery<TxByCounterpartyResponse>({
    queryKey: [`/api/brain/ledger/transactions?counterparty_id=${id}&limit=100`],
    enabled: id.length > 0,
    retry: false,
  });

  if (!base) return null;

  // Only OUTFLOWS are "payments to this vendor" - inflows are money they paid us.
  const paid = (txQuery.data?.transactions ?? [])
    .filter((t) => t.direction === "outflow")
    .map((t) => ({ amount: Number(t.amount), date: t.transaction_date }))
    .filter((p) => Number.isFinite(p.amount));

  if (paid.length === 0) return base;

  const totalPaid = paid.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const dates = paid.map((p) => p.date).filter(Boolean).sort();

  return {
    ...base,
    history: {
      ...base.history,
      paymentCount: paid.length,
      totalPaid,
      avgAmount: totalPaid / paid.length,
      firstPaidLabel: dates.length > 0 ? fmtVendorDate(dates[0]) : base.history.firstPaidLabel,
      lastPaidLabel: dates.length > 0 ? fmtVendorDate(dates[dates.length - 1]) : base.history.lastPaidLabel,
    },
  };
}
