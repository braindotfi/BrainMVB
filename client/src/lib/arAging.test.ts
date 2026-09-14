import { describe, it, expect } from "vitest";
import { arAgingView, daysOverdue, AR_STALE_DAYS } from "./arAging";
import { calendarDaysToDue } from "./dueDates";
import type { RawInvoice } from "./receivables";

/** Minimal AR invoice. `metadata.scenario === "ar"` is what makes it a receivable. */
function inv(over: Partial<RawInvoice> & { due_date?: string | null }): RawInvoice {
  return {
    id: "inv_1",
    amount_due: "100.00",
    amount_paid: "0",
    currency: "USD",
    status: "open",
    metadata: { scenario: "ar" },
    ...over,
  };
}

/* Local noon, so "today" is 9 Aug 2026 in every timezone the suite might run in —
   including the ones where aging and the record's own popup used to disagree. */
const NOW = new Date("2026-08-09T12:00:00");
const DAY = 86_400_000;
/** The UTC calendar date N days before today, as a record carries it. */
const daysAgo = (n: number) =>
  new Date(Date.UTC(2026, 7, 9) - n * DAY).toISOString().slice(0, 10);

const complete = (rows: RawInvoice[]) => ({ failed: false, read: { rows, complete: true }, now: NOW });

describe("daysOverdue", () => {
  it("counts whole calendar days, so the answer doesn't depend on the time of day", () => {
    expect(daysOverdue("2026-08-01", new Date("2026-08-09T00:01:00"))).toBe(8);
    expect(daysOverdue("2026-08-01", new Date("2026-08-09T23:59:00"))).toBe(8);
  });

  it("is negative for a future due date and null for an absent or junk one", () => {
    expect(daysOverdue("2026-09-01", NOW)).toBeLessThan(0);
    expect(daysOverdue(null, NOW)).toBeNull();
    expect(daysOverdue("not-a-date", NOW)).toBeNull();
  });

  it("is the popup's day count with the sign flipped, for the same record", () => {
    /* Aging counts forward from the due date, the popup counts down to it. They
       must not also disagree about when "today" starts: west of Greenwich the old
       UTC-floored `now` put the same invoice a day either side of the boundary
       from what its own popup said about it. */
    for (const due of [daysAgo(91), daysAgo(90), daysAgo(1), "2026-08-09", "2026-09-01", "2026-08-09T23:30:00Z"]) {
      expect(daysOverdue(due, NOW), due).toBe(-(calendarDaysToDue(due, NOW) as number));
    }
  });
});

describe("arAgingView — read states", () => {
  it("states no figure when the read failed", () => {
    const v = arAgingView({ failed: true, read: null, now: NOW });
    expect(v.kind).toBe("failed");
    expect(v.staleAmount).toBeNull();
    expect(v.pctOfTotalAr).toBeNull();
  });

  it("states no figure while loading", () => {
    expect(arAgingView({ failed: false, read: null, now: NOW }).kind).toBe("loading");
  });

  it("refuses BOTH the amount and the percentage on a truncated cursor walk", () => {
    // The dangerous case: a ratio of two partial sums looks authoritative and
    // has no relationship to the real ratio.
    const rows = [inv({ id: "inv_old", due_date: "2026-01-01", amount_due: "500" })];
    const v = arAgingView({ failed: false, read: { rows, complete: false }, now: NOW });
    expect(v.kind).toBe("unreadable");
    expect(v.staleAmount).toBeNull();
    expect(v.totalAr).toBeNull();
    expect(v.pctOfTotalAr).toBeNull();
    expect(v.rows).toEqual([]);
  });

  it("only says 'none' on a complete read with nothing past the boundary", () => {
    const v = arAgingView(complete([inv({ due_date: "2026-08-01" })]));
    expect(v.kind).toBe("none");
    expect(v.staleAmount).toBe(0);
    expect(v.worst).toBeNull();
  });
});

describe("arAgingView — the 90-day boundary", () => {
  it("treats exactly 90 days as not yet stale, and 91 as stale", () => {
    const at90 = new Date(NOW.getTime());
    const dueExactly90 = daysAgo(AR_STALE_DAYS);
    const due91 = daysAgo(AR_STALE_DAYS + 1);

    expect(arAgingView({ failed: false, read: { rows: [inv({ due_date: dueExactly90 })], complete: true }, now: at90 }).kind).toBe("none");
    expect(arAgingView({ failed: false, read: { rows: [inv({ due_date: due91 })], complete: true }, now: at90 }).kind).toBe("rows");
  });

  it("crosses the boundary on the day the record's own popup says it does", () => {
    /* The boundary is reached when the popup would read "91 days overdue" —
       not a day earlier or later because the reader happens to be west of UTC. */
    const due = daysAgo(AR_STALE_DAYS + 1);
    expect(calendarDaysToDue(due, NOW)).toBe(-(AR_STALE_DAYS + 1));
    const v = arAgingView({ failed: false, read: { rows: [inv({ due_date: due })], complete: true }, now: NOW });
    expect(v.kind).toBe("rows");
    expect(v.worst?.days).toBe(AR_STALE_DAYS + 1);
  });

  it("holds the same verdict all day, morning and evening", () => {
    const rows = [inv({ due_date: daysAgo(AR_STALE_DAYS) })];
    for (const t of ["2026-08-09T00:01:00", "2026-08-09T23:59:00"]) {
      expect(arAgingView({ failed: false, read: { rows, complete: true }, now: new Date(t) }).kind, t).toBe("none");
    }
  });
});

describe("arAgingView — figures and the row it names", () => {
  const rows = [
    inv({ id: "inv_recent", due_date: "2026-08-01", amount_due: "400" }),          // current
    inv({ id: "inv_stale_small", due_date: "2026-01-01", amount_due: "100" }),     // very old, small
    inv({ id: "inv_stale_big", due_date: "2026-02-01", amount_due: "500" }),       // old, big
  ];

  it("sums only the stale rows but divides by ALL outstanding AR", () => {
    const v = arAgingView(complete(rows));
    expect(v.kind).toBe("rows");
    expect(v.staleAmount).toBe(600);
    expect(v.totalAr).toBe(1000);
    expect(v.pctOfTotalAr).toBeCloseTo(0.6, 10);
  });

  it("names the OLDEST stale row, not the largest", () => {
    // inv_stale_big is worth more, but inv_stale_small has been outstanding longer.
    expect(arAgingView(complete(rows)).worst?.id).toBe("inv_stale_small");
  });

  it("breaks an age tie with the larger balance", () => {
    const tied = [
      inv({ id: "inv_a", due_date: "2026-01-01", amount_due: "100" }),
      inv({ id: "inv_b", due_date: "2026-01-01", amount_due: "900" }),
    ];
    expect(arAgingView(complete(tied)).worst?.id).toBe("inv_b");
  });

  it("subtracts payments already received", () => {
    const part = [inv({ id: "inv_part", due_date: "2026-01-01", amount_due: "500", amount_paid: "300" })];
    expect(arAgingView(complete(part)).staleAmount).toBe(200);
  });
});

describe("arAgingView — records that can't be aged", () => {
  it("keeps an undated invoice out of the stale bucket but still in the denominator", () => {
    // An unknown age must not be filed as 'fine' — that is the one error that hides money.
    const v = arAgingView(complete([
      inv({ id: "inv_undated", due_date: null, amount_due: "1000" }),
      inv({ id: "inv_stale", due_date: "2026-01-01", amount_due: "1000" }),
    ]));
    expect(v.rows.map((r) => r.id)).toEqual(["inv_stale"]);
    expect(v.staleAmount).toBe(1000);
    expect(v.totalAr).toBe(2000);
    expect(v.pctOfTotalAr).toBeCloseTo(0.5, 10);
  });

  it("ignores non-AR invoices entirely", () => {
    const v = arAgingView(complete([
      { id: "inv_ap", amount_due: "999", due_date: "2026-01-01", metadata: { scenario: "ap" } },
      inv({ id: "inv_ar", due_date: "2026-01-01", amount_due: "100" }),
    ]));
    expect(v.totalAr).toBe(100);
  });

  it("never returns Infinity when everything nets to zero outstanding", () => {
    const v = arAgingView(complete([inv({ due_date: "2026-01-01", amount_due: "100", amount_paid: "100" })]));
    expect(v.pctOfTotalAr === null || Number.isFinite(v.pctOfTotalAr)).toBe(true);
  });
});
