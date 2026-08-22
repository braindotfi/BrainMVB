/* ── Captions for the Settings → Sources rows ─────────────────────────────────
   Every string built here is a claim about how current Brain's picture of a
   source is, so the rules are deliberately conservative:

   1. "Last synced" is only ever printed from a real sync timestamp. brain-core
      sources carry `last_synced_at`; BrainMVB's own bank and tool connections
      carry only `connectedAt`, which says when the user linked the account and
      nothing at all about when it was last read. Captioning the second as the
      first would tell someone their bank feed is current when it may not have
      been read since the day they linked it.

   2. A source that upstream says never syncs (seeded fixtures set
      `sync_disabled`) is stale by arithmetic forever. Reporting that staleness
      would be crying wolf about a fixture, so it is suppressed.

   3. The count above the lists is a claim too. A feed that is still loading is
      neither "connected nothing" nor "broken" - it is a third state, and it is
      captioned as one. */

export type ReadState = "done" | "failed" | "pending";

/** Collapse a react-query result into the three states that matter here. A query
    that has neither errored nor produced data has not answered yet, whatever its
    internal flags say. */
export function readState(q: { isError: boolean; isLoading: boolean; data: unknown }): ReadState {
  if (q.isError) return "failed";
  if (q.isLoading || q.data === undefined) return "pending";
  return "done";
}

/** "4 min ago" / "3 hours ago" / "12 Jun". Returns null for an absent or
    unparseable timestamp so callers can omit the phrase rather than print a
    placeholder date. A timestamp in the future is clock skew, not a prediction:
    it reads as "just now". */
export function formatRelativeTime(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;

  const diffMs = nowMs - t;
  if (diffMs < 60_000) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  const then = new Date(t);
  const sameYear = then.getFullYear() === new Date(nowMs).getFullYear();
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export interface SyncCaptionInput {
  /** What the source is, e.g. "Bank account", "Accounting", "Payments". */
  kind: string;
  /** A real last-successful-sync timestamp, if the feed publishes one. */
  lastSyncedAt?: string | null;
  /** When the connection was established. Used only as a fallback, and labelled
      as what it is. */
  connectedAt?: string | null;
  /** Upstream's verdict on the sync timestamp, lowercased ("stale" | "fresh" | …). */
  freshness?: string | null;
  /** Upstream says this connection never syncs. */
  syncDisabled?: boolean;
}

/** Row subtitle for a connected account. */
export function syncCaption(input: SyncCaptionInput, nowMs: number): string {
  const synced = formatRelativeTime(input.lastSyncedAt, nowMs);
  if (synced) {
    const overdue = input.freshness === "stale" && !input.syncDisabled;
    return `${input.kind} · last synced ${synced}${overdue ? " · sync overdue" : ""}`;
  }
  const connected = formatRelativeTime(input.connectedAt, nowMs);
  if (connected) return `${input.kind} · connected ${connected}`;
  return input.kind;
}

/** The line above the lists. `shown` counts live, historical, and document rows
    actually rendered, so it can only ever under-report. */
export function sourceCountCaption(shown: number, states: ReadState[]): string {
  const failed = states.filter((s) => s === "failed").length;
  const pending = states.filter((s) => s === "pending").length;

  if (states.length > 0 && pending === states.length) return "Checking your sources…";

  const noun = `${shown} source${shown === 1 ? "" : "s"}`;
  if (failed > 0) {
    return `${noun} shown · ${failed} list${failed === 1 ? "" : "s"} couldn't be loaded`;
  }
  if (pending > 0) return `${noun} so far · still checking`;
  return noun;
}

/** "7.0 KB". Bytes are exact, so this needs no hedging. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
