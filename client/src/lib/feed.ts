/**
 * Feed reads that cannot silently fail open.
 *
 * This app has rediscovered the same defect on four consecutive surfaces: a
 * remote read done with `retry: false`, consumed as `data?.things ?? []`, and
 * then branched on `.length`. The `?? []` is the whole bug — it collapses "we
 * could not ask" and "we asked and there are none" into the same value one line
 * before the branch that needed to tell them apart. What renders is a calm empty
 * state: "No connected accounts yet", "$0.00", or, worst of all, a warning banner
 * that simply does not appear.
 *
 * On a surface that reports money owed and approvals pending, that is not a
 * cosmetic bug. It actively tells the operator not to act, and it fails in
 * exactly the conditions where acting matters most.
 *
 * `useFeed` makes the honest path the default by making the dishonest one not
 * compile. It returns a discriminated union whose `rows` are `null` until the
 * caller has narrowed past `unavailable` and `pending`, so `feed.rows.map(...)`
 * is a type error until both states are handled.
 *
 * There is deliberately NO `rowsOrEmpty()` / `unwrapOr([])` helper. Such a helper
 * is the bug with a nicer name, and the moment it exists it becomes the path of
 * least resistance. If a caller genuinely wants to treat unavailable as empty it
 * must write that out in full, where a reviewer can see it and ask why.
 *
 * See `feed-guard.test.ts`, which fails the build if a new raw `useQuery` read
 * reintroduces the pattern.
 */

import { useQuery, type QueryKey } from "@tanstack/react-query";

/**
 * A remote list read in exactly three states.
 *
 * `rows` is only non-null in `ready`, so TypeScript forces both other states to
 * be handled before the data can be touched.
 */
export type Feed<T> =
  | { status: "pending"; rows: null; pending: true; unavailable: false }
  | { status: "unavailable"; rows: null; pending: false; unavailable: true }
  | { status: "ready"; rows: T; pending: false; unavailable: false };

const PENDING = { status: "pending", rows: null, pending: true, unavailable: false } as const;
const UNAVAILABLE = { status: "unavailable", rows: null, pending: false, unavailable: true } as const;

/**
 * Read a feed and project it into the shape the caller needs.
 *
 * `select` runs on every render, so keep it a cheap pure mapping (filter, map,
 * sort). Anything expensive belongs in a `useMemo` around the returned rows.
 *
 * `enabled: false` reports `pending` — a read that was never made is not a read
 * that came back empty, and it is certainly not one that failed.
 */
export function useFeed<TData, TRows>(
  queryKey: QueryKey,
  select: (data: TData) => TRows,
  options?: { enabled?: boolean },
): Feed<TRows> {
  const query = useQuery<TData>({
    queryKey,
    /* Deliberate and load-bearing: these reads hit brain-core, which is routinely
       unreachable or unprovisioned, and retrying just delays the honest answer.
       It is also precisely why the error channel below is not optional. */
    retry: false,
    enabled: options?.enabled ?? true,
  });

  if (query.isError) return UNAVAILABLE;
  if (query.data === undefined) return PENDING;
  return { status: "ready", rows: select(query.data), pending: false, unavailable: false };
}

/**
 * True if ANY of these feeds failed.
 *
 * For surfaces built from several reads, where one failure means the totals on
 * screen are understated. A row count implies completeness, so a partial list
 * needs saying out loud — the empty state by definition never fires for it.
 */
export function anyUnavailable(...feeds: readonly Feed<unknown>[]): boolean {
  return feeds.some((f) => f.unavailable);
}

/** True while any of these feeds is still in flight and none has failed. */
export function anyPending(...feeds: readonly Feed<unknown>[]): boolean {
  return feeds.some((f) => f.pending);
}
