import { describe, it, expect } from "vitest";
import {
  buildCashFlowRows,
  cashFlowTotals,
  cashFlowPeriodLabel,
  incompleteMessage,
  type CashFlowTxLike,
  type CashFlowInvoiceLike,
} from "./cashFlow";

/* Shaped after the reference tenant's real feeds: 10 inflows dated Feb–Jun 2026,
   no outflows at all, and 3 AP invoices among a majority of AR ones. */
const TX = (over: Partial<CashFlowTxLike> & { id: string }): CashFlowTxLike => ({
  amount: "1000.00",
  direction: "inflow",
  transaction_date: "2026-06-26T00:00:00Z",
  ...over,
});

const INV = (over: Partial<CashFlowInvoiceLike> & { id: string }): CashFlowInvoiceLike => ({
  invoice_number: "AP-001",
  counterparty_id: "cp_1",
  amount_due: "500.00",
  due_date: "2026-08-01",
  status: "sent",
  metadata: { scenario: "ap" },
  ...over,
});

describe("buildCashFlowRows", () => {
  it("maps direction onto kind and sign", () => {
    const rows = buildCashFlowRows({
      transactions: [
        TX({ id: "a", direction: "inflow", amount: "100" }),
        TX({ id: "b", direction: "outflow", amount: "40" }),
      ],
    });
    expect(rows.map((r) => [r.kind, r.sign, r.amount])).toEqual([
      ["income", "+", 100],
      ["expense", "-", 40],
    ]);
  });

  it("keeps transfers and adjustments as rows, with no sign", () => {
    /* The point of the collapse is that this page shows all money movement. A
       transfer is not income or expense, but dropping it would make it disappear
       from the only view that claims to be complete. */
    const rows = buildCashFlowRows({
      transactions: [TX({ id: "t", direction: "transfer" }), TX({ id: "j", direction: "adjustment" })],
    });
    expect(rows.map((r) => r.kind).sort()).toEqual(["adjustment", "transfer"]);
    expect(rows.every((r) => r.sign === "")).toBe(true);
  });

  it("keeps a transaction whose direction it does not recognise", () => {
    const rows = buildCashFlowRows({ transactions: [TX({ id: "weird", direction: "teleport" })] });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("adjustment");
    expect(rows[0].sign).toBe("");
  });

  it("includes unpaid AP invoices as bills and excludes AR entirely", () => {
    const rows = buildCashFlowRows({
      invoices: [
        INV({ id: "ap1", amount_due: "12000" }),
        INV({ id: "ar1", metadata: { scenario: null } }),
        INV({ id: "ar2", metadata: null }),
      ],
    });
    expect(rows.map((r) => r.key)).toEqual(["inv:ap1"]);
    expect(rows[0]).toMatchObject({ kind: "bill", sign: "-", amount: 12000 });
  });

  it("excludes an AP invoice that has been paid", () => {
    const rows = buildCashFlowRows({ invoices: [INV({ id: "ap1", status: "paid" })] });
    expect(rows).toEqual([]);
  });

  it("flags a bill carrying anomaly flags", () => {
    const rows = buildCashFlowRows({
      invoices: [INV({ id: "ap1", metadata: { scenario: "ap", flags: ["duplicate"] } })],
    });
    expect(rows[0].flagged).toBe(true);
  });

  it("names rows by counterparty and keeps the description as detail", () => {
    const rows = buildCashFlowRows({
      transactions: [TX({ id: "a", counterparty_id: "cp_1", description_normalized: "monthly payment" })],
      nameOf: (id) => (id === "cp_1" ? "BigCo Industries" : null),
    });
    expect(rows[0].label).toBe("BigCo Industries");
    expect(rows[0].sublabel).toBe("monthly payment");
  });

  it("falls back to the description when the counterparty is unknown", () => {
    const rows = buildCashFlowRows({
      transactions: [TX({ id: "a", counterparty_id: "cp_x", description_normalized: "monthly payment" })],
      nameOf: () => null,
    });
    expect(rows[0].label).toBe("monthly payment");
    expect(rows[0].sublabel).toBe("");
  });

  it("orders newest first and sinks undated rows to the bottom", () => {
    const rows = buildCashFlowRows({
      transactions: [
        TX({ id: "old", transaction_date: "2026-02-10T00:00:00Z" }),
        TX({ id: "undated", transaction_date: null }),
        TX({ id: "new", transaction_date: "2026-06-26T00:00:00Z" }),
      ],
    });
    expect(rows.map((r) => r.txId)).toEqual(["new", "old", "undated"]);
  });

  it("contributes no rows for a feed it could not read, without throwing", () => {
    expect(buildCashFlowRows({})).toEqual([]);
    expect(buildCashFlowRows({ transactions: null, invoices: null })).toEqual([]);
  });

  it("carries the ids each row needs to open its own detail popup", () => {
    const rows = buildCashFlowRows({
      transactions: [TX({ id: "tx_1" })],
      invoices: [INV({ id: "inv_1" })],
    });
    const tx = rows.find((r) => r.kind === "income");
    const bill = rows.find((r) => r.kind === "bill");
    expect(tx?.txId).toBe("tx_1");
    expect(tx?.invoiceId).toBeUndefined();
    expect(bill?.invoiceId).toBe("inv_1");
    expect(bill?.txId).toBeUndefined();
  });
});

describe("cashFlowTotals", () => {
  it("sums income and expenses separately", () => {
    const t = cashFlowTotals({
      transactions: [
        TX({ id: "a", direction: "inflow", amount: "100" }),
        TX({ id: "b", direction: "inflow", amount: "50" }),
        TX({ id: "c", direction: "outflow", amount: "30" }),
      ],
    });
    expect(t.income).toBe(150);
    expect(t.expenses).toBe(30);
  });

  it("counts transfers toward neither total", () => {
    const t = cashFlowTotals({
      transactions: [TX({ id: "a", direction: "transfer", amount: "9999" })],
    });
    expect(t.income).toBe(0);
    expect(t.expenses).toBe(0);
  });

  it("returns null — not zero — when the transaction feed is unreachable", () => {
    /* The distinction the whole module exists for. Zero income is a statement
       about the business; a failed read is not, and rendering them alike is how
       an outage becomes a reassuring dashboard. */
    const t = cashFlowTotals({ transactions: null, invoices: [] });
    expect(t.income).toBeNull();
    expect(t.expenses).toBeNull();
  });

  it("returns zero — not null — when the feed read fine and was empty", () => {
    const t = cashFlowTotals({ transactions: [], invoices: [] });
    expect(t.income).toBe(0);
    expect(t.expenses).toBe(0);
  });

  it("returns null liabilities when the obligations feed is unreachable", () => {
    expect(cashFlowTotals({ transactions: [] }).liabilities).toBeNull();
    expect(cashFlowTotals({ transactions: [], obligations: [] }).liabilities).toBe(0);
  });

  it("sums liabilities from payable obligations, payroll included", () => {
    const t = cashFlowTotals({
      transactions: [],
      obligations: [
        { id: "ob1", type: "bill", amount_due: "12000", status: "due" },
        { id: "ob2", type: "payroll", amount_due: "6000", status: "upcoming" },
        { id: "ob3", type: "receivable", amount_due: "999999", status: "due" },
      ],
    });
    expect(t.liabilities).toBe(18000);
  });

  it("names every feed that failed, so the user knows which figure to distrust", () => {
    const all = incompleteMessage({ tx: true, inv: true, ob: true });
    expect(all).toContain("Liabilities, income and expenses and the bills listed below");

    // One feed down must not claim the others are unreliable.
    const obOnly = incompleteMessage({ tx: false, inv: false, ob: true });
    expect(obOnly).toContain("Liabilities couldn't be loaded");
    expect(obOnly).not.toContain("income");
    expect(obOnly).not.toContain("bills listed below");

    const txOnly = incompleteMessage({ tx: true, inv: false, ob: false });
    expect(txOnly).toContain("Income and expenses couldn't be loaded");
    expect(txOnly).not.toContain("iabilities");

    const invOnly = incompleteMessage({ tx: false, inv: true, ob: false });
    expect(invOnly).toContain("The bills listed below couldn't be loaded");
    expect(invOnly).not.toContain("iabilities");
  });

  it("refuses to read as an all-clear, whichever feed is down", () => {
    for (const f of [
      { tx: true, inv: false, ob: false },
      { tx: false, inv: true, ob: false },
      { tx: false, inv: false, ob: true },
      { tx: true, inv: true, ob: true },
    ]) {
      expect(incompleteMessage(f)).toContain("not a statement");
    }
  });

  it("says nothing when nothing failed, so the banner cannot render empty", () => {
    expect(incompleteMessage({ tx: false, inv: false, ob: false })).toBe("");
  });

  it("never derives liabilities from the invoice feed, which carries no payroll", () => {
    /* Invoices still feed the dated bill ROWS below the metrics — that is a different
       question from "what do we owe in total". Deriving the total from them understated
       it and made the metric disagree with the Obligations tab beside it. */
    const t = cashFlowTotals({ transactions: [], invoices: [INV({ id: "ap1", amount_due: "12000" })] });
    expect(t.liabilities).toBeNull();
  });

  it("bounds the period by the transactions that actually fed the totals", () => {
    const t = cashFlowTotals({
      transactions: [
        TX({ id: "a", transaction_date: "2026-06-26T00:00:00Z" }),
        TX({ id: "b", transaction_date: "2026-02-10T00:00:00Z" }),
        /* a much later transfer must not stretch a label that sits under the
           income and expense figures it contributed nothing to */
        TX({ id: "t", direction: "transfer", transaction_date: "2026-12-31T00:00:00Z" }),
      ],
    });
    expect([t.periodStart, t.periodEnd]).toEqual(["2026-02-10", "2026-06-26"]);
  });

  it("has no period when nothing counted toward either total", () => {
    const t = cashFlowTotals({ transactions: [TX({ id: "t", direction: "transfer" })] });
    expect([t.periodStart, t.periodEnd]).toEqual([null, null]);
  });
});

describe("cashFlowPeriodLabel", () => {
  it("names a span inside one year once", () => {
    expect(cashFlowPeriodLabel("2026-02-10", "2026-06-26")).toBe("Feb to Jun 2026");
  });

  it("names both years when the span crosses one", () => {
    expect(cashFlowPeriodLabel("2025-11-01", "2026-06-26")).toBe("Nov 2025 to Jun 2026");
  });

  it("collapses a single month to one label", () => {
    expect(cashFlowPeriodLabel("2026-06-01", "2026-06-26")).toBe("Jun 2026");
  });

  it("is null when there is no period to name", () => {
    expect(cashFlowPeriodLabel(null, null)).toBeNull();
    expect(cashFlowPeriodLabel("2026-06-01", null)).toBeNull();
    expect(cashFlowPeriodLabel("nonsense", "2026-06-01")).toBeNull();
  });

  it("matches the reference tenant's actual range rather than a fixed window", () => {
    /* Guards the deviation from the mock: its "(30d)" label would read $0 here,
       because every recorded transaction predates that window. */
    const t = cashFlowTotals({
      transactions: [
        TX({ id: "a", transaction_date: "2026-02-10T00:00:00Z", amount: "48000" }),
        TX({ id: "b", transaction_date: "2026-06-26T00:00:00Z", amount: "96000" }),
      ],
    });
    expect(cashFlowPeriodLabel(t.periodStart, t.periodEnd)).toBe("Feb to Jun 2026");
    expect(t.income).toBe(144000);
  });
});
