/* ── Unified record pager ─────────────────────────────────────────────────────
   Overview and the Inbox both show ONE list built from several different
   sources — session payment intents, the live review queue, read-only ledger
   insights and brain-core agent proposals — and each source opens a different
   modal. Each of those modals used to page only within its own source array, so
   Previous/Next silently stopped at the edge of whichever queue the record
   happened to belong to: opening the third of four insights and pressing Next
   twice hit a dead end while a dozen proposals sat further down the same list.

   The pager therefore walks the RENDERED list, not a source array. An entry is
   any on-screen row that can open a detail surface, in display order, so
   "Next" always means "the next row you can see" regardless of which modal that
   row happens to open. Stepping closes whatever is open and opens the neighbour.

   Paging is linear rather than wrapping: with a position readout ("4 of 17") a
   wrap-around makes the count a lie about what Next does, and the ends
   are where a user checks whether they have seen everything. */

export interface PagerEntry {
  /** Row id — must match the id the page records when it opens the surface. */
  id: string;
  /** Opens this row's detail surface. Called after the open one is closed. */
  open: () => void;
}

export interface PagerState {
  /** Position of the open record in the rendered list, or -1 when none is. */
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** True when there is somewhere to page to in either direction. */
  canPage: boolean;
  /** "4 of 17", or null when nothing pageable is open. */
  position: string | null;
}

export function pagerState(entries: PagerEntry[], openId: string | null): PagerState {
  const index = openId == null ? -1 : entries.findIndex((entry) => entry.id === openId);
  const total = entries.length;
  /* An open record the list no longer contains (it was just decided, or a filter
     moved it off screen) reports index -1: no position, no arrows. Guessing a
     neighbour from a stale index would step onto a row the user cannot see. */
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < total - 1;
  return {
    index,
    total,
    hasPrev,
    hasNext,
    canPage: hasPrev || hasNext,
    position: index >= 0 ? `${index + 1} of ${total}` : null,
  };
}

/** Steps `delta` places through `entries`, closing the open surface first.
 *  A step that would leave the list is a no-op rather than a wrap. */
export function stepPager(
  entries: PagerEntry[],
  openId: string | null,
  delta: 1 | -1,
  closeOpenSurface: () => void,
): void {
  const { index } = pagerState(entries, openId);
  if (index < 0) return;
  const next = entries[index + delta];
  if (!next) return;
  closeOpenSurface();
  next.open();
}
