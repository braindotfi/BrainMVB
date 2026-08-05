/**
 * Receivables — "what we are owed" — read from the INVOICES feed and selected by
 * brain-core's positive `metadata.scenario === "ar"` marker.
 *
 * ## Why this reads invoices and NOT the obligations feed
 *
 * Its mirror surface, Payables, deliberately reads `/ledger/obligations`, because
 * payroll and tax are owed without an invoice ever existing (see `liabilities.ts`).
 * Receivables is the opposite case, and the correct source is the opposite feed.
 * Measured against a live tenant:
 *
 *     /ledger/obligations?direction=receivable   →   8 rows
 *     /ledger/invoices    scenario === "ar"      →  12 rows
 *
 * The 8 obligations are a strict SUBSET of the 12 invoices — the AR-aging fixture
 * rows, which brain-core projects into both feeds. The four rows that exist only as
 * invoices are the largest on the tenant. So:
 *
 *   - reading obligations here would drop the majority of the money owed and show a
 *     confident, wrong total;
 *   - summing BOTH feeds would double-count the eight shared rows.
 *
 * One feed, positively marked. Never both. `receivables.test.ts` pins this, because
 * the two row shapes are similar enough that TypeScript cannot.
 *
 * ## Why the AR filter is a positive match
 *
 * There was previously no way to say "this IS a receivable" — only "this is not
 * `ap`". A negation silently absorbs every scenario value brain-core has not
 * invented yet: the day a third kind of invoice appears, a `!== "ap"` filter counts
 * it as money owed to the tenant. `scenario === "ar"` cannot make that mistake, and
 * an unmarked row is simply not a receivable.
 *
 * ## Why the total is gated on a completed read
 *
 * The invoice list pages behind a cursor. `receivablesTotal` refuses to return a
 * number unless the caller proves it walked every page, so a truncated read renders
 * as "unknown" rather than as a smaller total that looks authoritative.
 */

import { SETTLED_STATUSES } from "./liabilities";

/** brain-core's positive marker for an accounts-receivable invoice. */
export const AR_SCENARIO = "ar";

/**
 * The wire shape. `/api/brain/ledger/invoices` is served by the generic GET
 * passthrough, so the raw brain-core payload reaches the browser unnormalized and
 * nothing on it is guaranteed.
 */
export interface RawInvoice {
  id?: unknown;
  invoice_number?: unknown;
  counterparty_id?: unknown;
  amount_due?: unknown;
  amount_paid?: unknown;
  currency?: unknown;
  due_date?: unknown;
  status?: unknown;
  metadata?: unknown;
}

/** A normalized receivable. Every field is guaranteed by `normalize`. */
export interface Receivable {
  id: string;
  invoice_number: string | null;
  counterparty_id: string | null;
  /** Billed amount, as sent. */
  amount_due: number;
  /** Already collected. */
  amount_paid: number;
  /** What is still owed: `amount_due - amount_paid`. This is what gets summed. */
  outstanding: number;
  currency: string;
  due_date: string | null;
  status: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * brain-core's own record handles: a short prefix plus a 26-character ULID, e.g.
 * `raw_01KZ7VPJ4R66HEQG66P6Z30NB2`.
 */
const INTERNAL_ID = /^(?:raw|inv|doc|obl)_[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The invoice number, or null when brain-core sent one of its own ids instead.
 *
 * When extraction cannot find a number on an uploaded document, brain-core falls back
 * to echoing the raw document's id into `invoice_number`. Printing that verbatim states
 * a customer's invoice is numbered `raw_01KZ…`, which is not true and is not something
 * the tenant could quote to anyone. Treating it as absent lets the row and the popup
 * take the path they already have for a genuinely missing number — omit the field.
 *
 * The pattern is deliberately exact (known prefix AND a full ULID) so a real invoice
 * number that merely starts with "inv" is never swallowed. Nothing is lost either way:
 * the popup shows the record's true handle on its own "Source" line.
 */
function invoiceNumber(v: unknown): string | null {
  const s = str(v);
  return s && INTERNAL_ID.test(s.trim()) ? null : s;
}

/**
 * Money off the wire. brain-core sends decimal STRINGS ("21150.00000000"), but a
 * number is accepted too — discarding one for having the wrong type would understate
 * what the tenant is owed.
 */
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** The positive AR test. An absent or unreadable `metadata` is not a receivable. */
export function isArInvoice(raw: RawInvoice | null | undefined): boolean {
  const meta = raw?.metadata;
  if (!meta || typeof meta !== "object") return false;
  return (meta as { scenario?: unknown }).scenario === AR_SCENARIO;
}

function normalize(raw: RawInvoice): Receivable {
  const amount_due = num(raw.amount_due);
  const amount_paid = num(raw.amount_paid);
  return {
    id: str(raw.id) ?? "",
    invoice_number: invoiceNumber(raw.invoice_number),
    counterparty_id: str(raw.counterparty_id),
    amount_due,
    amount_paid,
    outstanding: amount_due - amount_paid,
    currency: str(raw.currency) ?? "USD",
    due_date: str(raw.due_date),
    status: str(raw.status) ?? "",
  };
}

/**
 * Outstanding AR invoices, normalized and sorted by due date.
 *
 * Settled statuses are dropped using the same set Payables uses, so "discharged"
 * means one thing across both directions of the ledger. As there, anything
 * unrecognised counts as still outstanding: a status that wrongly inflates the list
 * is visible and checkable, whereas one that silently writes off money owed is not.
 */
export function arReceivables(raw: readonly RawInvoice[] | null | undefined): Receivable[] {
  return (raw ?? [])
    .filter((i): i is RawInvoice => !!i)
    .filter(isArInvoice)
    .map(normalize)
    .filter((r) => !SETTLED_STATUSES.has(r.status.trim().toLowerCase()))
    .sort((a, b) => {
      // Undated rows sort last rather than to the top, where "" would put them.
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
}

/**
 * Total outstanding AR, or `null` when no figure can honestly be stated.
 *
 * `null` covers BOTH "there was nothing to read" and "the read was truncated". The
 * second is the reason this takes the read state rather than just the rows: a
 * partial cursor walk produces a real, plausible, smaller number, and that is worse
 * than no number at all on a screen whose whole job is what the tenant is owed.
 */
export function receivablesTotal(
  raw: readonly RawInvoice[] | null | undefined,
  read: { complete: boolean },
): number | null {
  if (raw == null) return null;
  if (!read.complete) return null;
  return arReceivables(raw).reduce((sum, r) => sum + r.outstanding, 0);
}

/* ── what the tab should show ─────────────────────────────────────────────── */

export type ReceivablesViewKind =
  | "failed"
  /** No answer yet. */
  | "loading"
  /**
   * Zero AR rows, but the read did not finish — so "nothing outstanding" is an
   * unknown, not a fact. This kind exists because it is the one state that is easy
   * to get wrong and impossible to notice: the tab looks calm and says the tenant is
   * owed nothing, when really it only saw part of the invoice history.
   */
  | "unreadable"
  /**
   * Zero AR rows on a complete read, while documents are still being projected into
   * the ledger. brain-core lands invoices in waves, so this is "not yet", not "none".
   */
  | "arriving"
  /** Zero AR rows on a COMPLETE, settled read. The only state that may say "nothing
   *  owed". */
  | "empty"
  | "rows";

export interface ReceivablesView {
  kind: ReceivablesViewKind;
  rows: Receivable[];
  /** Null whenever no honest figure exists — see `receivablesTotal`. */
  total: number | null;
  /** True when rows are shown but the read was cut short, so the list is partial. */
  truncated: boolean;
  /**
   * True while documents are still being read into the ledger, so more invoices are
   * expected and the figure on screen is a floor. Mirrors `payablesView`.
   */
  mayGrow: boolean;
}

/**
 * Decide what the Receivables tab renders.
 *
 * Pure, and separate from the component, because the interesting cases here are
 * exactly the ones a component test in this repo cannot reach (vitest runs in `node`
 * with no DOM). Keeping the branch order as data means the "zero rows but incomplete
 * read" case can be pinned by a real assertion instead of a source-text grep.
 */
export function receivablesView(input: {
  failed: boolean;
  read: { rows: readonly RawInvoice[]; complete: boolean } | null;
  /** From `useIngestInProgress` — documents still being read into the ledger. */
  ingesting: boolean;
}): ReceivablesView {
  const { failed, read, ingesting } = input;
  const none = { rows: [] as Receivable[], total: null, truncated: false, mayGrow: ingesting };
  if (failed) return { kind: "failed", ...none };
  if (read == null) return { kind: "loading", ...none };

  const rows = arReceivables(read.rows);
  const total = receivablesTotal(read.rows, read);
  const truncated = !read.complete;

  if (rows.length === 0) {
    // Order matters: a cut-short read outranks an unfinished ingest, and both outrank
    // "empty". Only the last of the three may claim nobody owes the tenant anything.
    const kind: ReceivablesViewKind = truncated ? "unreadable" : ingesting ? "arriving" : "empty";
    return { kind, rows, total, truncated, mayGrow: ingesting };
  }
  return { kind: "rows", rows, total, truncated, mayGrow: ingesting };
}
