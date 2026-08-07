/**
 * Cursor pagination for brain-core's Ledger list endpoints.
 *
 * Every `/ledger/*` list read caps its page size and hands back a `next_cursor`.
 * A single unpaged fetch therefore returns SOME of the rows, with HTTP 200 and no
 * indication that anything is missing. That is exactly how a running total goes
 * quietly wrong: the list looks complete because nothing said otherwise.
 *
 * This walks the cursor to the end and reports whether it actually got there.
 * Callers that add rows up MUST branch on `complete` — a partial page set may be
 * listed, but it must never be summed into a figure presented as a total.
 */

/** The result of a cursor walk. `complete` is the part that matters. */
export interface PagedRead<T> {
  rows: T[];
  /** True only when the walk ran out of cursors, i.e. it saw every row. */
  complete: boolean;
}

/** Rows per request. Large enough that the common tenant is one round trip. */
const PAGE_SIZE = 100;

/**
 * The smallest page cap brain-core has been measured to silently apply (20 rows, no
 * `next_cursor` field at all). Mirrors `SMALLEST_KNOWN_CAP` in `server/brain/ledgerRead.ts`
 * — see that file's comment for the full reasoning. Duplicated rather than imported: this
 * is client code and must not import the server module.
 *
 * Used only when the response never declared a cursor at all (absent, not explicit null) —
 * an endpoint that has made no promise about pagination cannot be trusted to mean "done"
 * just because it stopped.
 */
const SMALLEST_KNOWN_CAP = 20;

/**
 * Hard stop. A cursor that never terminates would otherwise spin forever and hang
 * the tab; bailing out reports `complete: false`, which suppresses the total rather
 * than showing a partial one.
 */
const MAX_PAGES = 50;

export interface FetchAllOptions {
  pageSize?: number;
  maxPages?: number;
  signal?: AbortSignal;
  /** Injectable for tests; defaults to the browser's fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Read every page of a brain-core list endpoint.
 *
 * @param path  BFF path, e.g. `/api/brain/ledger/invoices`
 * @param field the array property on the response, e.g. `invoices`
 *
 * Throws on a transport or shape failure rather than returning fewer rows, so a
 * failed read surfaces as an error state instead of a confident short list.
 */
export async function fetchAllPages<T>(
  path: string,
  field: string,
  opts: FetchAllOptions = {},
): Promise<PagedRead<T>> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const doFetch = opts.fetchImpl ?? fetch;

  const rows: T[] = [];
  /* A server that keeps handing back the same cursor is not advancing. Tracking
     what we have already followed turns that into a terminating, honest partial
     read instead of an infinite loop. */
  const followed = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) qs.set("cursor", cursor);

    const res = await doFetch(`${path}?${qs.toString()}`, {
      credentials: "include",
      signal: opts.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${detail}`);
    }

    const body: unknown = await res.json();
    const batch = (body as Record<string, unknown> | null)?.[field];
    /* A 200 whose payload carries no rows array is not an empty list — it is a
       response shape we do not understand. Treating it as a failure keeps it from
       rendering as "there is nothing here". */
    if (!Array.isArray(batch)) {
      throw new Error(`${path}: response carried no "${field}" array`);
    }
    const raw = (body as Record<string, unknown> | null)?.next_cursor;
    const next = typeof raw === "string" && raw.trim() ? raw : null;
    /* Distinguishes "the server said null" from "the server never mentioned a cursor at
       all" — see SMALLEST_KNOWN_CAP above. */
    const cursorDeclared = !!body && typeof body === "object" && "next_cursor" in body;

    /* Checked BEFORE the batch is taken. A cursor we have already followed means the
       server is replaying a page we have already counted, so appending it here would
       duplicate those rows — inflating the list by one page on the way out. */
    if (next && followed.has(next)) return { rows, complete: false };

    rows.push(...(batch as T[]));

    if (!next) {
      /* An explicit `next_cursor: null` is proof there is no further page. Silence is
         not: brain-core's list endpoints are known to cap without ever mentioning a
         cursor, so fall back to the only evidence available — whether the batch was
         small enough that it cannot have been capped. */
      return { rows, complete: cursorDeclared ? true : batch.length < SMALLEST_KNOWN_CAP };
    }
    followed.add(next);
    cursor = next;
  }

  return { rows, complete: false };
}
