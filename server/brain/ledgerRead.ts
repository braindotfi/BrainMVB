/**
 * Complete reads of brain-core's Ledger list endpoints, for answers that state a FIGURE.
 *
 * ## Why this exists
 *
 * Every `/ledger/*` list read caps its page size and hands back a `next_cursor`. A single
 * unpaged fetch therefore returns SOME of the rows, with HTTP 200 and no indication that
 * anything is missing. The assistant's grounding path reads `{ limit: 20 }` and hands the
 * result to an LLM as prose, where a short list merely makes the answer vague.
 *
 * A deterministic answer is different: it states an exact number in the tenant's own
 * currency, and a number computed from a truncated read is precise, plausible and wrong.
 * So these readers report whether the walk actually reached the end, and every caller
 * that sums rows MUST branch on `complete` rather than on `rows.length`.
 *
 * This mirrors `client/src/lib/brainPagination.ts` deliberately — same page size, same
 * repeated-cursor guard, same "shape we do not understand is a failure, not an empty
 * list" rule — so the two halves of the app cannot disagree about what a complete read is.
 * It is a separate implementation only because the server talks to brain-core directly
 * with a token rather than through the BFF with a cookie.
 */

import {
  listObligations,
  listLedgerInvoices,
  type BrainObligation,
  type BrainInvoice,
} from "./client";

/** The result of a cursor walk. `complete` is the part that matters. */
export interface PagedRead<T> {
  rows: T[];
  /** True only when the walk ran out of cursors, i.e. it saw every row. */
  complete: boolean;
}

/** Rows per request. Large enough that the common tenant is one round trip. */
const PAGE_SIZE = 100;

/**
 * Hard stop. A cursor that never terminates would otherwise spin forever and hold the
 * user's request open; bailing out reports `complete: false`, which suppresses the
 * figure rather than stating a partial one.
 */
const MAX_PAGES = 50;

/** Per-page timeout. A hung upstream socket must not hold the assistant response open. */
const PAGE_TIMEOUT_MS = 10_000;

/**
 * The smallest page cap brain-core has been measured to silently apply (20 rows, no
 * cursor field at all).
 *
 * This is the load-bearing constant for endpoints that never declare a cursor. For those
 * we cannot ask "was there a next page?", so we ask the only question the response can
 * answer: could this have been capped? A batch at or above the smallest known cap might
 * be a cap rather than the whole list, so it is reported incomplete. A batch below it
 * cannot be — a server capping at 20 does not hand back 7 when it has more.
 *
 * Deliberately conservative in one direction only. If the real cap is HIGHER than this,
 * a large-but-uncapped page is still called incomplete and the caller refuses to quote a
 * figure: annoying, not wrong. Lowering it to make more answers succeed would be the
 * dangerous edit, and would reintroduce exactly the silent truncation this guards.
 */
const SMALLEST_KNOWN_CAP = 20;

export interface ReadAllOptions {
  pageSize?: number;
  maxPages?: number;
  timeoutMs?: number;
}

/**
 * Walk one list endpoint to the end.
 *
 * `fetchPage` is injected so obligations and invoices — which have different response
 * envelopes and different normalizers — share the walking, the cursor-replay guard and
 * the page cap without this module having to know either shape.
 *
 * Throws on a transport failure rather than returning fewer rows, so a failed read
 * surfaces as an error the caller must handle instead of as a confident short list.
 */
async function walk<T>(
  fetchPage: (
    cursor: string | null,
    limit: number,
  ) => Promise<{ rows: T[]; next: string | null; cursorDeclared: boolean }>,
  opts: ReadAllOptions = {},
): Promise<PagedRead<T>> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;

  const rows: T[] = [];
  /* A server that keeps handing back the same cursor is not advancing. Tracking what we
     have already followed turns that into a terminating, honest partial read instead of
     an infinite loop. */
  const followed = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const { rows: batch, next, cursorDeclared } = await fetchPage(cursor, pageSize);

    /* Checked BEFORE the batch is taken. A cursor we have already followed means the
       server is replaying a page we have already counted, so appending it here would
       duplicate those rows — inflating the figure by one page on the way out. */
    if (next && followed.has(next)) return { rows, complete: false };

    rows.push(...batch);

    if (next) {
      followed.add(next);
      cursor = next;
      continue;
    }

    /* No next cursor. Whether that PROVES we reached the end depends entirely on whether
       this endpoint speaks the cursor contract at all.

       An explicit `next_cursor: null` is a statement: there is no further page.

       An endpoint that never mentions `next_cursor` has stated nothing, and brain-core's
       list endpoints are known to cap silently with HTTP 200. Reading that silence as
       "complete" is the precise bug this module exists to prevent, so fall back to the
       only evidence available — whether the batch is small enough that it cannot have
       been capped. */
    if (cursorDeclared) return { rows, complete: true };
    return { rows, complete: batch.length < SMALLEST_KNOWN_CAP };
  }

  return { rows, complete: false };
}

/** Every obligation for the tenant, with proof the walk finished. */
export function readAllObligations(
  token: string,
  opts: ReadAllOptions = {},
): Promise<PagedRead<BrainObligation>> {
  const timeoutMs = opts.timeoutMs ?? PAGE_TIMEOUT_MS;
  return walk<BrainObligation>(async (cursor, limit) => {
    const page = await listObligations(
      token,
      { limit, cursor: cursor ?? undefined },
      timeoutMs,
    );
    /* `listObligations` is deliberately tolerant for the prose-grounding path and coerces
       an unrecognised payload to zero rows. Here that would become "you owe nothing", so
       the tolerance has to be undone: a shape we cannot parse is a failed read. */
    if (!page.well_formed) {
      throw new Error('/ledger/obligations: response carried no "obligations" array');
    }
    return {
      rows: page.obligations,
      next: page.next_cursor ?? null,
      cursorDeclared: page.cursor_declared,
    };
  }, opts);
}

/** Every invoice for the tenant, with proof the walk finished. */
export function readAllInvoices(
  token: string,
  opts: ReadAllOptions = {},
): Promise<PagedRead<BrainInvoice>> {
  const timeoutMs = opts.timeoutMs ?? PAGE_TIMEOUT_MS;
  return walk<BrainInvoice>(async (cursor, limit) => {
    const page = await listLedgerInvoices(
      token,
      { limit, cursor: cursor ?? undefined },
      timeoutMs,
    );
    /* `listLedgerInvoices` returns the parsed envelope as-is. A payload with no
       `invoices` array is a shape we do not understand, not an empty ledger —
       treating it as [] here would render as "no invoices". */
    if (!Array.isArray(page?.invoices)) {
      throw new Error('/ledger/invoices: response carried no "invoices" array');
    }
    /* This endpoint does not publish `next_cursor` today, so the walk usually cannot
       prove it saw everything and falls back to the page-cap test. That is intentional:
       overdue AR refuses on a large ledger rather than under-reporting what is owed. If
       brain-core starts sending the field, the explicit contract takes over automatically. */
    return {
      rows: page.invoices,
      next: page.next_cursor ?? null,
      cursorDeclared: page != null && typeof page === "object" && "next_cursor" in page,
    };
  }, opts);
}
