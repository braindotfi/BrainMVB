/**
 * Liabilities — "what we owe" — derived from the live Ledger's OBLIGATIONS feed.
 *
 * ## Why this reads obligations, not invoices
 *
 * This module used to sum `/ledger/invoices` filtered to `metadata.scenario === "ap"`.
 * That was never a deliberate accounting decision to exclude payroll — the invoices
 * endpoint carries no payroll records at all (and no `type` field), so accrued payroll
 * was invisible to the figure purely as a side effect of the source chosen. Accrued
 * payroll is a genuine current liability, so the invoice-derived number understated
 * what the tenant owed: on the reference tenant, $211,200.00 against a true $278,328.76.
 *
 * `/ledger/obligations` carries both bills and payroll, so it is the honest source.
 * Three surfaces quote this number — the Overview metric card, the Cash Flow metric,
 * and the Ledger's Payables tab — and a metric that disagreed with the list it
 * links to reads as a bug in the data, not in the UI. One module owns it so they
 * cannot drift.
 *
 * ## The null-vs-zero contract (load-bearing — do not "simplify")
 *
 * `null` (not `0`) when no obligation data is reachable. Zero is a claim that the
 * tenant owes nothing; absence of data is not that claim, and the callers render the
 * two differently ("—" vs a real zero). A false all-clear on money owed is the single
 * worst thing this module can produce.
 *
 * ## Two ways the feed is short WITHOUT saying so (both measured live)
 *
 * 1. **Truncation.** The list endpoint pages behind a cursor, so an unpaged read
 *    returns some rows with HTTP 200 and no hint that more exist. `liabilitiesTotal`
 *    therefore takes the read STATE, not just the rows, and refuses to state a figure
 *    it cannot prove it summed in full — same contract as `receivablesTotal`.
 *
 * 2. **Rows that have not landed yet.** brain-core projects each ingested document
 *    into the ledger asynchronously, so a tenant's obligations arrive in waves. On a
 *    fresh demo tenant, timed: 3 bills at 1s ($211,200.00), 2 payroll at 26s
 *    ($278,328.76), 1 tax at 56s ($287,223.39). Every intermediate read is complete,
 *    internally consistent and wrong, and no property of the response distinguishes
 *    it from the final one. What DOES distinguish it is out of band: documents are
 *    still being read (`documentsInProgress` in lib/brainRefresh). That is why the
 *    view below takes an `ingesting` flag — the total keeps rendering, because it is
 *    a true floor, but it is captioned as one instead of as a settled figure.
 */

import { normalizeObligation, isReceivable, type Obligation, type RawObligation } from "./brainObligations";

/* ── invoices: still the source for the Cash Flow dated list's bill ROWS ──────
   Unchanged and deliberately kept. The cash-flow list is a record of money that
   moved or is invoiced; it is a different question from "what do we owe in total",
   which is what the obligations feed above answers. */

/** The invoice fields this module reads. Structural so it stays testable and so
 *  callers keep owning their own fuller response types. */
export interface ApInvoiceLike {
  status?: string | null;
  amount_due?: string | number | null;
  due_date?: string | null;
  counterparty_id?: string;
  /** The currency the invoice is denominated in — part of the debt's identity. */
  currency?: string | null;
  metadata?: { scenario?: string | null } | null;
}

/** Unpaid accounts-payable invoices, i.e. billed money the tenant still owes.
 *
 *  AP is the COMPLEMENT of AR, never a marker of its own: `metadata.scenario === "ap"`
 *  is written only by the demo seeder (`services/api/src/demo/brainsaas-seed.ts` in
 *  brain-core) — no real tenant's invoice is ever marked "ap". AR, by contrast, IS
 *  positively and reliably marked `"ar"` on every tenant (real or demo) by brain-core's
 *  production write path (`projectionMetadata()`). So "is this a payable" is answered by
 *  "is this NOT a receivable" — `scenario !== "ar"` — which is true for a demo-seeded
 *  `"ap"` row and equally true for a real tenant's unmarked row. Testing for `"ap"`
 *  literally, as this used to, silently returned nothing for every real tenant. */
export function unpaidApInvoices<T extends ApInvoiceLike>(invoices: readonly T[] | null | undefined): T[] {
  return (invoices ?? []).filter(
    (i) => i?.metadata?.scenario !== "ar" && !SETTLED_STATUSES.has((i.status ?? "").trim().toLowerCase()),
  );
}

/* ── obligations: the authoritative "what we owe" ─────────────────────────── */

/**
 * Statuses that mean the obligation is discharged and must NOT be counted.
 *
 * Anything not in this set counts as still owed. That direction is deliberate: an
 * unrecognised status inflating the total is a visible, checkable error, whereas one
 * silently discharging a debt hides money the tenant actually owes. brain-core
 * currently emits `upcoming` / `due` / `overdue` on the reference tenant, none of
 * which are settled, so this set exists to be defensive about statuses we have not
 * seen rather than to describe ones we have.
 *
 * Exported because Receivables applies the identical test to AR invoices. "This
 * debt is discharged" must mean the same thing in both directions of the ledger;
 * two copies of this set would drift the first time one of them learned a new
 * status.
 */
export const SETTLED_STATUSES = new Set(["paid", "settled", "cancelled", "canceled", "void", "voided", "written_off"]);

/**
 * Payable (AP) obligations the tenant still owes, normalized and sorted by due date.
 *
 * ## Why the AP filter is client-side
 *
 * `GET /ledger/obligations` accepts `?direction=payable`, and it does filter correctly.
 * We deliberately do not use it. A bogus or renamed value (`?direction=zzz`) returns
 * `{"obligations":[]}` with **HTTP 200** — no error, no signal. If brain-core ever
 * renames that param, a server-side filter would turn this surface into a confident
 * "you owe nothing" instead of failing loudly. Filtering here with the already-tested
 * `isReceivable` keeps the failure mode honest, and picks up a real `direction` field
 * automatically if brain-core starts sending one (today it is null on every row and
 * the payable/receivable hint rides on `type`).
 */
export function payableObligations(raw: readonly RawObligation[] | null | undefined): Obligation[] {
  return (raw ?? [])
    .filter((o): o is RawObligation => !!o)
    .map(normalizeObligation)
    .filter((o) => !isReceivable(o))
    .filter((o) => !SETTLED_STATUSES.has(o.status.trim().toLowerCase()))
    .sort((a, b) => {
      // Undated obligations sort last rather than to the top, where "" would put them.
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
}

/**
 * Total outstanding AP, or `null` when no figure can honestly be stated.
 *
 * `null` covers BOTH "there was nothing to read" and "the read was truncated". The
 * second is why this takes the read state rather than just the rows: a partial cursor
 * walk produces a real, plausible, smaller number, and on a figure that says what the
 * tenant owes that is worse than no number at all.
 *
 * An unparseable `amount_due` contributes 0 rather than aborting the sum: one bad
 * row should understate the total, not blank the whole figure.
 *
 * ## It sums ACROSS currencies, so it is not what the Payables list quotes
 *
 * This adds every row's `amount_due` together whatever currency the row is in, so the
 * result is not safe to quote in any currency. The Payables tab states a subtotal in
 * one currency instead (`payablesCurrencyTotal`) and captions what it left out,
 * because the list beneath it quotes each row in its own currency.
 *
 * The surfaces that still call this — the Overview card, the Cash Flow metric — have
 * one caption line each, already spent on the state of the read, and no room to say
 * what a subtotal excluded. Narrowing their figure without that disclosure would
 * silently drop a bill from "everything you still owe", which is worse than a sum
 * whose only flaw shows up on a mixed-currency ledger. They keep the figure that
 * covers every row until they get a currency treatment of their own.
 */
export function liabilitiesTotal(
  raw: readonly RawObligation[] | null | undefined,
  read: { complete: boolean },
): number | null {
  if (raw == null) return null;
  if (!read.complete) return null;
  return payableObligations(raw).reduce((sum, o) => sum + (Number(o.amount_due) || 0), 0);
}

/* ── one figure, one currency ─────────────────────────────────────────────── */

/**
 * A ledger record's currency code, normalized — obligation or invoice, whichever feed
 * it came off.
 *
 * `normalizeObligation` already defaults an absent code to USD; this is that same
 * fallback applied to a raw or odd-cased value, in one place so the figure, the row
 * quoting it, the detail popup it opens and the join between the two feeds cannot
 * each answer differently. An invoice that omits the code and an obligation stating
 * "usd" are the same currency, and both must render as one.
 */
export function recordCurrency(r: { currency?: string | null }): string {
  return (r.currency ?? "").trim().toUpperCase() || "USD";
}

export interface CurrencySubtotal {
  /** The subtotal, or `null` when no figure can honestly be stated — see `liabilitiesTotal`. */
  total: number | null;
  /** The currency `total` is denominated in. `null` when there is no figure, and when
   *  there are no rows at all (a zero owed is not owed in any particular currency). */
  currency: string | null;
  /** The currencies deliberately LEFT OUT of `total`, with how many rows each covers.
   *  Never empty without reason: whatever is in here has to be disclosed by the caller. */
  excluded: Array<{ currency: string; count: number }>;
}

/**
 * Outstanding AP as a subtotal in ONE currency, plus what that leaves out.
 *
 * `liabilitiesTotal` adds every row's `amount_due` together regardless of the currency
 * the row is denominated in. On a USD-only tenant that is the same number; on a tenant
 * with one EUR bill it is units of different things added up, stated as a single
 * figure, with nothing on screen saying so. There is no FX table in this app for
 * arbitrary currency codes (`currencyContext` knows two, for re-expressing the app's
 * own USD figures), so converting is not available and guessing is not acceptable.
 *
 * So the figure narrows instead of lying: it totals the currency most of the rows are
 * in and reports the rest as excluded, for the caller to name in its caption. A
 * subtotal is a complete answer to a narrower question; a cross-currency sum is not an
 * answer to any question. (A ratio would have to refuse outright — dropping rows from
 * a denominator changes what the ratio means. This is a total, so excluding is enough.
 * See .agents/memory/cross-currency-totals.md.)
 *
 * Which currency wins: the one with the most rows, ties broken alphabetically so the
 * choice is deterministic rather than dependent on the order the ledger paged in.
 */
export function payablesCurrencyTotal(
  raw: readonly RawObligation[] | null | undefined,
  read: { complete: boolean },
): CurrencySubtotal {
  const none: CurrencySubtotal = { total: null, currency: null, excluded: [] };
  // Same two refusals as `liabilitiesTotal`, and for the same reason: an unread or
  // half-read ledger produces a plausible smaller number, which on money owed is
  // worse than no number.
  if (raw == null) return none;
  if (!read.complete) return none;

  const rows = payableObligations(raw);
  if (rows.length === 0) return { total: 0, currency: null, excluded: [] };

  const byCurrency = new Map<string, { count: number; sum: number }>();
  for (const o of rows) {
    const code = recordCurrency(o);
    const acc = byCurrency.get(code) ?? { count: 0, sum: 0 };
    acc.count += 1;
    // An unparseable amount contributes 0 rather than aborting the sum — one bad row
    // should understate the total, not blank the whole figure.
    acc.sum += Number(o.amount_due) || 0;
    byCurrency.set(code, acc);
  }

  const codes = [...byCurrency.keys()].sort();
  const chosen = codes.reduce((best, c) =>
    byCurrency.get(c)!.count > byCurrency.get(best)!.count ? c : best,
  );
  return {
    total: byCurrency.get(chosen)!.sum,
    currency: chosen,
    excluded: codes
      .filter((c) => c !== chosen)
      .map((c) => ({ currency: c, count: byCurrency.get(c)!.count })),
  };
}

/**
 * The sentence that discloses what a subtotal left out. Empty when it left nothing out.
 *
 * Stated as a count and the currency codes, never as an amount: an amount would invite
 * the reader to add it to the figure above, which is precisely the operation that has
 * no defined answer here.
 */
export function excludedCurrencyNote(
  excluded: readonly { currency: string; count: number }[],
): string {
  if (excluded.length === 0) return "";
  const n = excluded.reduce((sum, e) => sum + e.count, 0);
  const codes = excluded.map((e) => e.currency);
  const list =
    codes.length === 1 ? codes[0] : `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
  return `Excludes ${n} ${n === 1 ? "payable" : "payables"} in ${list} — there's no exchange rate here to add ${n === 1 ? "it" : "them"} to this figure.`;
}

/* ── what the payables surfaces should show ───────────────────────────────── */

export type PayablesViewKind =
  | "failed"
  /** No answer yet. */
  | "loading"
  /**
   * Zero payables, but the read did not finish — so "nothing outstanding" is an
   * unknown, not a fact. The easiest state to get wrong and the hardest to notice:
   * the surface looks calm and says the tenant owes nothing, having seen only part
   * of the ledger.
   */
  | "unreadable"
  /**
   * Zero payables on a complete read, while documents are still being read into the
   * ledger. Also not "nothing outstanding" — just "not yet".
   */
  | "arriving"
  /** Zero payables, complete read, nothing still landing. The only state that may
   *  say the tenant owes nothing. */
  | "empty"
  | "rows";

/* Two figures, deliberately named apart.
 *
 * There used to be one, called `total`, and both surfaces read it. Narrowing it to a
 * single currency for the Payables list therefore also narrowed the Overview card —
 * which has no disclosure of what a subtotal left out, and hands the figure to the
 * display-currency converter, so a mostly-EUR ledger would have rendered its euro
 * subtotal as dollars. A shared field cannot mean two things, so it does not: a
 * surface now has to name which figure it is quoting, and take the obligations that
 * come with it. */
export interface PayablesView {
  kind: PayablesViewKind;
  rows: Obligation[];
  /**
   * Every payable added together, whatever currency each is in — `liabilitiesTotal`.
   *
   * Only for a surface that has no way to caption an exclusion and would rather state
   * a figure covering every row. It is NOT safe to quote in a currency: on a ledger
   * spanning currencies it is units of different things summed, which is why the
   * Payables list quotes `subtotal` instead. The Overview card still reads this one
   * pending its own currency treatment.
   */
  crossCurrencyTotal: number | null;
  /**
   * Outstanding AP in ONE currency — `payablesCurrencyTotal`. Null whenever no honest
   * figure exists. A surface quoting this MUST disclose `excludedCurrencies`.
   */
  subtotal: number | null;
  /** The currency `subtotal` is in. Null when there is no figure to denominate. */
  subtotalCurrency: string | null;
  /** Currencies `subtotal` leaves out. Say so — `excludedCurrencyNote`. */
  excludedCurrencies: Array<{ currency: string; count: number }>;
  /** True when rows are shown but the read was cut short, so the list is partial. */
  truncated: boolean;
  /**
   * True while brain-core is still projecting documents into the ledger. The figure
   * on screen is then a floor, not a settled total, and must be captioned as one.
   */
  mayGrow: boolean;
}

/**
 * Decide what a payables surface renders.
 *
 * Pure, and separate from the components, because all three surfaces that quote this
 * figure have to agree — and because the interesting cases are exactly the ones a
 * component test in this repo cannot reach (vitest runs in `node`, with no DOM).
 * Keeping the branch order as data means "zero rows because the read was cut short"
 * and "zero rows because nothing has landed yet" are pinned by real assertions
 * instead of by a grep over JSX.
 */
export function payablesView(input: {
  failed: boolean;
  read: { rows: readonly RawObligation[]; complete: boolean } | null;
  /** From `useIngestInProgress` — documents still being read into the ledger. */
  ingesting: boolean;
}): PayablesView {
  const { failed, read, ingesting } = input;
  const none = {
    rows: [] as Obligation[],
    crossCurrencyTotal: null,
    subtotal: null,
    subtotalCurrency: null,
    excludedCurrencies: [] as Array<{ currency: string; count: number }>,
    truncated: false,
    mayGrow: ingesting,
  };
  if (failed) return { kind: "failed", ...none };
  if (read == null) return { kind: "loading", ...none };

  const rows = payableObligations(read.rows);
  /* Both figures, computed here so the two callers differ only in which one they
     quote — and so neither can quietly recompute its own. They agree on every
     single-currency ledger, which is every tenant today. */
  const { total, currency, excluded } = payablesCurrencyTotal(read.rows, read);
  const truncated = !read.complete;
  const figure = {
    crossCurrencyTotal: liabilitiesTotal(read.rows, read),
    subtotal: total,
    subtotalCurrency: currency,
    excludedCurrencies: excluded,
  };

  if (rows.length === 0) {
    // Order matters: a cut-short read outranks an unfinished ingest, and both
    // outrank "empty". Only the last of the three may claim nothing is owed.
    const kind: PayablesViewKind = truncated ? "unreadable" : ingesting ? "arriving" : "empty";
    return { kind, rows, ...figure, truncated, mayGrow: ingesting };
  }
  return { kind: "rows", rows, ...figure, truncated, mayGrow: ingesting };
}

/* The caption under a payables figure lives in `lib/ledgerRead.ts` as
   `ledgerFigureCaption` — the caveats it states are about the READ, not about
   liabilities, and Receivables states them in the same words. */
