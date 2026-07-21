/**
 * Developers section — pure helpers (usage aggregation + scope constants).
 *
 * Kept free of Express/storage imports so vitest can hit them directly.
 *
 * API keys themselves are brain-core-issued (PR #309) and proxied through
 * server/routes.ts — no key material is minted, hashed, or stored here.
 */

/** The only scopes brain-core recognizes for tenant API keys. */
export const API_KEY_SCOPES = ["ledger:read", "audit:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// ─── Usage aggregation over brain-core audit events ───

export interface UsageAuditEvent {
  id: string;
  layer: string;
  action: string;
  created_at: string;
}

export interface UsageDay {
  /** ISO date (UTC), e.g. "2026-07-21" */
  date: string;
  count: number;
}

export interface UsageSummary {
  totalEvents: number;
  /** action → count, descending; daily = zero-filled per-day series for that
   *  action across the window (oldest first), for in-place trend expansion */
  byAction: Array<{ action: string; count: number; daily: UsageDay[] }>;
  /** layer → count, descending */
  byLayer: Array<{ layer: string; count: number }>;
  /** one entry per day in the window, oldest first, zero-filled */
  daily: UsageDay[];
  windowDays: number;
}

/**
 * Aggregate audit events into the Usage page shape. Window is the last
 * `windowDays` UTC days ending at `now` (inclusive); events outside it are
 * dropped; days with no events are zero-filled so charts stay honest.
 */
export function aggregateUsage(
  events: UsageAuditEvent[],
  windowDays: number,
  now: Date = new Date(),
): UsageSummary {
  const dayMs = 24 * 60 * 60 * 1000;
  const endDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startDay = endDay - (windowDays - 1) * dayMs;

  const dailyCounts = new Map<string, number>();
  for (let t = startDay; t <= endDay; t += dayMs) {
    dailyCounts.set(new Date(t).toISOString().slice(0, 10), 0);
  }

  const byAction = new Map<string, number>();
  const byActionDaily = new Map<string, Map<string, number>>();
  const byLayer = new Map<string, number>();
  let totalEvents = 0;

  for (const ev of events) {
    const ts = Date.parse(ev.created_at);
    if (Number.isNaN(ts)) continue;
    const day = new Date(ts).toISOString().slice(0, 10);
    if (!dailyCounts.has(day)) continue; // outside window
    totalEvents += 1;
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
    byAction.set(ev.action, (byAction.get(ev.action) ?? 0) + 1);
    let actionDays = byActionDaily.get(ev.action);
    if (!actionDays) {
      actionDays = new Map<string, number>();
      byActionDaily.set(ev.action, actionDays);
    }
    actionDays.set(day, (actionDays.get(day) ?? 0) + 1);
    byLayer.set(ev.layer, (byLayer.get(ev.layer) ?? 0) + 1);
  }

  const sortDesc = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  /** Zero-filled per-action daily series across the SAME window as `daily`. */
  const actionDaily = (action: string): UsageDay[] => {
    const days = byActionDaily.get(action);
    return Array.from(dailyCounts.keys()).map((date) => ({ date, count: days?.get(date) ?? 0 }));
  };

  return {
    totalEvents,
    byAction: sortDesc(byAction).map(([action, count]) => ({ action, count, daily: actionDaily(action) })),
    byLayer: sortDesc(byLayer).map(([layer, count]) => ({ layer, count })),
    daily: Array.from(dailyCounts.entries()).map(([date, count]) => ({ date, count })),
    windowDays,
  };
}
