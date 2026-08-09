import { describe, it, expect } from "vitest";
import { cashProjectionView, PROJECTION_DAYS } from "./cashProjection";
import type { RawObligation } from "./brainObligations";
import type { RawInvoice } from "./receivables";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const DAY = 86_400_000;
/** ISO date N days from NOW. */
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString().slice(0, 10);

function obl(over: Partial<RawObligation>): RawObligation {
  return { id: "obl_1", amount_due: "100.00", currency: "USD", status: "open", kind: "bill", ...over };
}
function inv(over: Partial<RawInvoice>): RawInvoice {
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

function view(args: {
  startingBalance?: number | null;
  obligations?: RawObligation[];
  invoices?: RawInvoice[];
  complete?: boolean;
  failed?: boolean;
}) {
  const complete = args.complete ?? true;
  return cashProjectionView({
    failed: args.failed ?? false,
    startingBalance: args.startingBalance === undefined ? 1000 : args.startingBalance,
    obligations: { rows: args.obligations ?? [], complete },
    invoices: { rows: args.invoices ?? [], complete },
    now: NOW,
  });
}

describe("cashProjectionView — when it refuses to draw", () => {
  it("draws nothing when a feed failed", () => {
    expect(view({ failed: true }).kind).toBe("failed");
  });

  it("draws nothing while a feed is still loading", () => {
    const v = cashProjectionView({
      failed: false,
      startingBalance: 1000,
      obligations: null,
      invoices: { rows: [], complete: true },
      now: NOW,
    });
    expect(v.kind).toBe("loading");
  });

  it("draws nothing when EITHER cursor walk was cut short", () => {
    // A missing outflow doesn't shift the line a little — it deletes a dip, and
    // the 'lowest point' callout then names a comfortable, wrong figure.
    const rows = [obl({ due_date: inDays(3), amount_due: "500" })];
    expect(cashProjectionView({
      failed: false, startingBalance: 1000,
      obligations: { rows, complete: false },
      invoices: { rows: [], complete: true },
      now: NOW,
    }).kind).toBe("unreadable");
    expect(cashProjectionView({
      failed: false, startingBalance: 1000,
      obligations: { rows, complete: true },
      invoices: { rows: [], complete: false },
      now: NOW,
    }).kind).toBe("unreadable");
  });

  it("draws nothing when there is no balance to run from", () => {
    const v = view({ startingBalance: null, obligations: [obl({ due_date: inDays(2) })] });
    expect(v.kind).toBe("no_balance");
    expect(v.events).toEqual([]);
  });

  it("reports an empty window separately from an unreadable one", () => {
    expect(view({}).kind).toBe("empty");
  });
});

describe("cashProjectionView — the window", () => {
  it("excludes events already in the past and beyond the horizon", () => {
    const v = view({
      obligations: [
        obl({ id: "obl_past", due_date: inDays(-1) }),
        obl({ id: "obl_far", due_date: inDays(PROJECTION_DAYS + 1) }),
        obl({ id: "obl_in", due_date: inDays(2) }),
      ],
    });
    expect(v.events.map((e) => e.id)).toEqual(["obl:obl_in"]);
  });

  it("includes an event landing exactly on the horizon", () => {
    const v = view({ obligations: [obl({ id: "obl_edge", due_date: inDays(PROJECTION_DAYS) })] });
    expect(v.events).toHaveLength(1);
  });

  it("drops undated records rather than pinning them to today", () => {
    // Defaulting an undated obligation to 'now' invents a dip that isn't real.
    expect(view({ obligations: [obl({ due_date: null })] }).kind).toBe("empty");
  });
});

describe("cashProjectionView — signs, ordering and the running balance", () => {
  it("makes obligations Confirmed outflows and invoices Projected inflows", () => {
    const v = view({
      obligations: [obl({ id: "o", due_date: inDays(1), amount_due: "300" })],
      invoices: [inv({ id: "i", due_date: inDays(2), amount_due: "500" })],
    });
    const byId = Object.fromEntries(v.events.map((e) => [e.id, e]));
    expect(byId["obl:o"].amount).toBe(-300);
    expect(byId["obl:o"].certainty).toBe("confirmed");
    expect(byId["inv:i"].amount).toBe(500);
    expect(byId["inv:i"].certainty).toBe("projected");
  });

  it("negates an amount that already arrived signed, rather than double-negating", () => {
    const v = view({ obligations: [obl({ due_date: inDays(1), amount_due: "-300" })] });
    expect(v.events[0].amount).toBe(-300);
  });

  it("runs the balance forward in date order", () => {
    const v = view({
      startingBalance: 1000,
      obligations: [obl({ id: "o", due_date: inDays(2), amount_due: "300" })],
      invoices: [inv({ id: "i", due_date: inDays(1), amount_due: "500" })],
    });
    expect(v.events.map((e) => e.balanceAfter)).toEqual([1500, 1200]);
  });

  it("settles same-day outflows before inflows, so the real trough is visible", () => {
    const v = view({
      startingBalance: 1000,
      obligations: [obl({ id: "o", due_date: inDays(1), amount_due: "900" })],
      invoices: [inv({ id: "i", due_date: inDays(1), amount_due: "900" })],
    });
    expect(v.events.map((e) => e.id)).toEqual(["obl:o", "inv:i"]);
    expect(v.lowest?.amount).toBe(100);
  });

  it("uses only what is still outstanding on a part-paid invoice", () => {
    const v = view({ invoices: [inv({ due_date: inDays(1), amount_due: "500", amount_paid: "200" })] });
    expect(v.events[0].amount).toBe(300);
  });
});

describe("cashProjectionView — the confirmed-only floor", () => {
  it("tracks a second balance that ignores every projected inflow", () => {
    // The gap between the two tracks IS the uncertainty. A single blended line
    // reports one number for two very different kinds of fact.
    const v = view({
      startingBalance: 1000,
      obligations: [obl({ id: "o", due_date: inDays(1), amount_due: "800" })],
      invoices: [inv({ id: "i", due_date: inDays(2), amount_due: "5000" })],
    });
    expect(v.events.map((e) => e.balanceAfter)).toEqual([200, 5200]);
    expect(v.events.map((e) => e.confirmedOnlyBalanceAfter)).toEqual([200, 200]);
  });

  it("reports the floor as the figure that decides whether payroll clears", () => {
    const v = view({
      startingBalance: 1000,
      obligations: [obl({ id: "o", due_date: inDays(3), amount_due: "1500" })],
      invoices: [inv({ id: "i", due_date: inDays(1), amount_due: "9000" })],
    });
    // Blended, the tenant looks fine. Confirmed-only, they are short.
    expect(v.lowest?.amount).toBeGreaterThan(0);
    expect(v.lowestConfirmedOnly?.amount).toBe(-500);
    expect(v.lowestConfirmedOnly?.date).toBe(inDays(3));
  });

  it("collapses the two tracks when nothing is merely projected", () => {
    const v = view({ obligations: [obl({ due_date: inDays(1), amount_due: "100" })] });
    expect(v.hasProjectedInflow).toBe(false);
    expect(v.lowest?.amount).toBe(v.lowestConfirmedOnly?.amount);
  });

  it("flags that the tracks differ as soon as one projected inflow lands", () => {
    expect(view({ invoices: [inv({ due_date: inDays(1) })] }).hasProjectedInflow).toBe(true);
  });
});

describe("cashProjectionView — the lowest point", () => {
  it("reports the trough of the running balance, not the biggest single event", () => {
    const v = view({
      startingBalance: 1000,
      obligations: [
        obl({ id: "o1", due_date: inDays(1), amount_due: "400" }),
        obl({ id: "o2", due_date: inDays(2), amount_due: "400" }),
      ],
      invoices: [inv({ id: "i", due_date: inDays(3), amount_due: "5000" })],
    });
    expect(v.lowest?.amount).toBe(200);
    expect(v.lowest?.date).toBe(inDays(2));
  });

  it("can report a negative trough", () => {
    const v = view({ startingBalance: 100, obligations: [obl({ due_date: inDays(1), amount_due: "500" })] });
    expect(v.lowest?.amount).toBe(-400);
  });
});
