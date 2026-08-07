/**
 * The shared way to read a brain-core Ledger list: every page, and kept fresh.
 *
 * Two failure modes killed the money figures on top of these feeds, and both are
 * invisible in a single response:
 *
 *   1. **Truncation.** Every `/ledger/*` list caps its page and hands back a cursor,
 *      so one fetch returns SOME rows with HTTP 200. `fetchAllPages` walks to the end
 *      and reports whether it got there; the callers refuse to total an unfinished
 *      walk.
 *
 *   2. **Rows that have not landed yet.** brain-core projects ingested documents into
 *      the ledger asynchronously, in waves. Measured on a fresh demo tenant: payables
 *      read $211,200.00 at 1s, $278,328.76 at 26s and $287,223.39 at 56s, each one a
 *      complete, self-consistent, wrong answer. Under this app's query defaults
 *      (`staleTime: Infinity`, no refetch) the first of those numbers then stayed on
 *      screen until the user reloaded the page by hand.
 *
 * So these reads poll. Faster while documents are still being read into the ledger —
 * the one out-of-band signal that more rows are expected — and slowly the rest of the
 * time, because a wave can also follow an upload made in another tab or by an agent.
 * Polling pauses when the window is not focused (React Query's default), so an idle
 * background tab does not sit and hammer the BFF.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchAllPages, type PagedRead } from "./brainPagination";
import { useIngestInProgress } from "./brainRefresh";

/** While documents are still being projected: often enough that a wave landing mid-read
 *  corrects itself within seconds rather than lasting until the user reloads. */
export const ACTIVE_POLL_MS = 8_000;

/** Otherwise. Slow enough to be free, frequent enough that a figure is never more than
 *  a minute stale — and, unlike the old behaviour, never permanently stale. */
export const IDLE_POLL_MS = 60_000;

/** Exported for the test: the interval is a decision, not a magic number in a hook. */
export function ledgerPollMs(ingesting: boolean): number {
  return ingesting ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}

/**
 * The caption under a figure derived from one of these reads.
 *
 * In one place, and deliberately direction-neutral, because "this number is not final"
 * has to read the same at the foot of the Payables list, at the foot of Receivables,
 * and on the two metric cards. `whenSettled` is each surface's own wording for the
 * ordinary case; the two qualified cases are shared.
 *
 * Neither caveat states a number. A figure mid-import is a floor and we do not know
 * how far off it is, so the caption says what is true — the import is unfinished —
 * rather than inventing a size for what is missing.
 */
export function ledgerFigureCaption(
  state: { truncated: boolean; mayGrow: boolean },
  whenSettled: string,
): string {
  if (state.truncated) return "Part of your ledger couldn't be read, so a total would understate this.";
  if (state.mayGrow) return "Still reading your documents — this may not be everything yet.";
  return whenSettled;
}

export interface LedgerRead<T> {
  /** The full cursor walk, or null while loading / after a failure. */
  read: PagedRead<T> | null;
  failed: boolean;
  /** True while documents are still being read into the ledger, so more rows are
   *  expected. Surfaces use it to caption a figure as a floor rather than a total. */
  ingesting: boolean;
}

/**
 * Read every page of a Ledger list endpoint, refreshed on its own.
 *
 * The query key is `[path, "all-pages"]`, so all three payables surfaces share ONE
 * fetch and one poll no matter how many of them are mounted, and the existing
 * post-upload invalidation (which matches on the `/api/brain/` key prefix) still
 * refreshes it.
 */
export function usePagedLedgerRead<T>(path: string, field: string): LedgerRead<T> {
  const ingesting = useIngestInProgress();
  const q = useQuery({
    queryKey: [path, "all-pages"],
    queryFn: ({ signal }) => fetchAllPages<T>(path, field, { signal }),
    retry: false,
    refetchInterval: ledgerPollMs(ingesting),
    // Coming back to the tab is the moment a stale figure is most likely to be read.
    refetchOnWindowFocus: true,
  });
  return { read: q.data ?? null, failed: q.isError, ingesting };
}
