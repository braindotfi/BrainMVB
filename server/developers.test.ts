import { describe, it, expect } from "vitest";
import { aggregateUsage, readUsageAuditEvents, type UsageAuditEvent } from "./developers";

describe("aggregateUsage", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");
  const ev = (daysAgo: number, action = "ledger.read", layer = "ledger"): UsageAuditEvent => ({
    id: `ev_${daysAgo}_${action}`,
    layer,
    action,
    created_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  });

  it("zero-fills every day of the window, oldest first", () => {
    const out = aggregateUsage([], 7, now);
    expect(out.daily).toHaveLength(7);
    expect(out.daily[0].date).toBe("2026-07-15");
    expect(out.daily[6].date).toBe("2026-07-21");
    expect(out.daily.every((d) => d.count === 0)).toBe(true);
    expect(out.totalEvents).toBe(0);
    expect(out.byAction).toEqual([]);
  });

  it("counts in-window events and drops out-of-window / unparsable ones", () => {
    const events = [
      ev(0), ev(0, "audit.read", "audit"), ev(2),
      ev(30), // outside a 7-day window
      { id: "bad", layer: "x", action: "y", created_at: "not-a-date" },
    ];
    const out = aggregateUsage(events, 7, now);
    expect(out.totalEvents).toBe(3);
    expect(out.daily.find((d) => d.date === "2026-07-21")?.count).toBe(2);
    expect(out.daily.find((d) => d.date === "2026-07-19")?.count).toBe(1);
    expect(out.byAction.map(({ action, count }) => ({ action, count }))).toEqual([
      { action: "ledger.read", count: 2 },
      { action: "audit.read", count: 1 },
    ]);
    // Per-action daily series: zero-filled across the SAME window, oldest first.
    const ledger = out.byAction.find((a) => a.action === "ledger.read")!;
    expect(ledger.daily).toHaveLength(7);
    expect(ledger.daily.map((d) => d.date)).toEqual(out.daily.map((d) => d.date));
    expect(ledger.daily.find((d) => d.date === "2026-07-21")?.count).toBe(1);
    expect(ledger.daily.find((d) => d.date === "2026-07-19")?.count).toBe(1);
    expect(ledger.daily.reduce((s, d) => s + d.count, 0)).toBe(2);
    const audit = out.byAction.find((a) => a.action === "audit.read")!;
    expect(audit.daily.find((d) => d.date === "2026-07-21")?.count).toBe(1);
    expect(audit.daily.reduce((s, d) => s + d.count, 0)).toBe(1);
    expect(out.byLayer).toEqual([
      { layer: "ledger", count: 2 },
      { layer: "audit", count: 1 },
    ]);
  });

  it("sorts byAction descending with alphabetical tie-break", () => {
    const out = aggregateUsage([ev(0, "b.act"), ev(0, "a.act")], 3, now);
    expect(out.byAction.map((a) => a.action)).toEqual(["a.act", "b.act"]);
  });
});

describe("readUsageAuditEvents", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");
  const event = (index: number): UsageAuditEvent => ({
    id: `evt_${index}`,
    layer: "ledger",
    action: "ledger.read",
    created_at: now.toISOString(),
  });

  it("marks a high-volume window as incomplete instead of understating its total", () => {
    /* The authoritative audit contract exposes no cursor. A high-volume
       window that would have needed six 200-event pages can only return the
       first full page, so that lower bound must never look like a total. */
    const read = readUsageAuditEvents(
      Array.from({ length: 200 }, (_, index) => event(index)),
    );

    expect(read.complete).toBe(false);
    expect(read.events).toHaveLength(200);
    expect(aggregateUsage(read.events, 1, now).totalEvents).toBe(200);
  });

  it("reports repeated events as incomplete without counting either event twice", () => {
    const first = event(0);
    const read = readUsageAuditEvents([first, first]);

    expect(read.complete).toBe(false);
    expect(read.events).toEqual([first]);
  });
});
