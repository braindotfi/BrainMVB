import { describe, it, expect } from "vitest";
import {
  buildCashFlowRows,
  buildMonthlyBreakdown,
  buildMonthlyWindow,
  monthSeriesDesc,
  cashFlowTotals,
  cashFlowPeriodLabel,
  detailLine,
  incompleteMessage,
  showYtdChip,
  ytdWindowKeys,
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
        INV({ id: "ar1", metadata: { scenario: "ar" } }),
      ],
    });
    expect(rows.map((r) => r.key)).toEqual(["inv:ap1"]);
    expect(rows[0]).toMatchObject({ kind: "bill", sign: "-", amount: 12000 });
  });

  it("treats an unmarked invoice as AP (the real-tenant shape), never as AR by default", () => {
    // AP is never positively marked on a real tenant — only the demo seeder writes
    // "ap". A row with no scenario at all, or an explicit null, is still a bill.
    const rows = buildCashFlowRows({
      invoices: [
        INV({ id: "unmarked", amount_due: "500", metadata: { scenario: null } }),
        INV({ id: "nometa", amount_due: "300", metadata: null }),
      ],
    });
    expect(rows.map((r) => r.key).sort()).toEqual(["inv:nometa", "inv:unmarked"]);
    expect(rows.every((r) => r.kind === "bill")).toBe(true);
  });

  /* ── obligations supply the rows invoices cannot ──────────────────────────
     The Liabilities figure above this list sums obligations, so the list has to be
     able to reach the same set or it can never add up to its own headline. */
  const OBL = (over: Record<string, unknown> & { id: string }) => ({
    counterparty_id: "cp_9",
    amount_due: "500.00",
    due_date: "2026-08-01",
    status: "upcoming",
    type: "payroll",
    ...over,
  });

  it("adds payroll and tax rows, which the invoice feed does not carry at all", () => {
    const rows = buildCashFlowRows({
      obligations: [
        OBL({ id: "o1", type: "payroll", amount_due: "33564.38" }),
        OBL({ id: "o2", type: "tax", amount_due: "8894.63", due_date: "2026-04-15" }),
      ],
    });
    expect(rows.map((r) => r.key).sort()).toEqual(["obl:o1", "obl:o2"]);
    // Bill treatment (owed money, negative), but badged as what they actually are.
    expect(rows.every((r) => r.kind === "bill" && r.sign === "-")).toBe(true);
    expect(rows.map((r) => r.badgeLabel).sort()).toEqual(["Payroll", "Tax"]);
  });

  it("lists a debt once when the same bill arrives as both an invoice and an obligation", () => {
    /* The two feeds carry the same three bills. Appending obligations blindly would
       double every bill and make the list overstate what is owed — the exact failure
       this list is meant to cure. */
    const rows = buildCashFlowRows({
      invoices: [INV({ id: "ap1", counterparty_id: "cp_1", amount_due: "4800.00", due_date: "2026-08-01T00:14:08.226Z" })],
      obligations: [
        OBL({ id: "twin", type: "bill", counterparty_id: "cp_1", amount_due: "4800.00000000", due_date: "2026-08-01T00:14:08.226Z" }),
        OBL({ id: "pay", type: "payroll", amount_due: "6000" }),
      ],
    });
    expect(rows.map((r) => r.key).sort()).toEqual(["inv:ap1", "obl:pay"]);
    // The surviving bill row is the invoice one, so it keeps its click-through.
    expect(rows.find((r) => r.key === "inv:ap1")?.invoiceId).toBe("ap1");
  });

  it("uses the obligation status on the invoice projection for a matched debt", () => {
    /* CloudOps is the live example: the obligation and invoice have different IDs,
       but the same counterparty, amount and due day. Cash Flow renders the invoice
       because it has bill detail, while the Payables row renders the obligation. The
       status pill must still describe the same debt, not whichever feed happened to
       render the row. */
    const rows = buildCashFlowRows({
      invoices: [
        INV({
          id: "cloudops-invoice",
          counterparty_id: "cp_cloudops",
          amount_due: "19400.00",
          due_date: "2026-08-12T11:30:05.422Z",
          status: "sent",
        }),
      ],
      obligations: [
        OBL({
          id: "cloudops-obligation",
          counterparty_id: "cp_cloudops",
          amount_due: "19400.00000000",
          due_date: "2026-08-12T11:30:05.422Z",
          status: "upcoming",
          type: "bill",
        }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "inv:cloudops-invoice",
      status: "upcoming",
      sign: "-",
      amount: 19400,
    });
  });

  it("suppresses only ONE obligation per matching invoice, never a whole identity", () => {
    /* A presence check would let a single invoice cancel every obligation sharing its
       identity, so a tenant that genuinely owes the same counterparty the same amount
       on the same day twice — one invoiced, one not — would lose the second debt from
       the list entirely. Under-reporting money owed is the worst failure here. */
    const same = { counterparty_id: "cp_1", amount_due: "4800.00", due_date: "2026-08-01" };
    const rows = buildCashFlowRows({
      invoices: [INV({ id: "ap1", ...same })],
      obligations: [OBL({ id: "twin", type: "bill", ...same }), OBL({ id: "second", type: "bill", ...same })],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key).sort()).toEqual(["inv:ap1", "obl:second"]);
  });

  it("cancels twins one-for-one when several invoices share an identity", () => {
    const same = { counterparty_id: "cp_1", amount_due: "4800.00", due_date: "2026-08-01" };
    const rows = buildCashFlowRows({
      invoices: [INV({ id: "ap1", ...same }), INV({ id: "ap2", ...same })],
      obligations: [OBL({ id: "t1", type: "bill", ...same }), OBL({ id: "t2", type: "bill", ...same })],
    });
    // Two invoices cancel exactly two obligations — no rows left over, none lost.
    expect(rows.map((r) => r.key).sort()).toEqual(["inv:ap1", "inv:ap2"]);
  });

  it("keeps two distinct obligations that share an identity when no invoice matches", () => {
    const same = { counterparty_id: "cp_9", amount_due: "33564.38", due_date: "2026-08-05" };
    const rows = buildCashFlowRows({
      obligations: [OBL({ id: "p1", ...same }), OBL({ id: "p2", ...same })],
    });
    expect(rows.map((r) => r.key).sort()).toEqual(["obl:p1", "obl:p2"]);
  });

  it("keeps a bill obligation that has no invoice behind it", () => {
    /* Deduping by identity rather than by excluding type==="bill": a bill obligation
       with no matching invoice is a real debt, and filtering it out by its name would
       hide money owed. */
    const rows = buildCashFlowRows({
      invoices: [INV({ id: "ap1", counterparty_id: "cp_1", amount_due: "4800", due_date: "2026-08-01" })],
      obligations: [OBL({ id: "lonely", type: "bill", counterparty_id: "cp_other", amount_due: "777", due_date: "2026-09-09" })],
    });
    expect(rows.map((r) => r.key).sort()).toEqual(["inv:ap1", "obl:lonely"]);
  });

  it("never counts a receivable obligation as money owed", () => {
    const rows = buildCashFlowRows({
      obligations: [OBL({ id: "ar", type: "receivable", amount_due: "999999" })],
    });
    expect(rows).toEqual([]);
  });

  it("excludes a settled obligation", () => {
    const rows = buildCashFlowRows({ obligations: [OBL({ id: "done", status: "paid" })] });
    expect(rows).toEqual([]);
  });

  it("survives an obligation with no kind rather than crashing on it", () => {
    // `kind` is nullable: `type` is dropped when it only encodes a direction.
    const rows = buildCashFlowRows({ obligations: [OBL({ id: "bare", type: null })] });
    expect(rows).toHaveLength(1);
    expect(rows[0].badgeLabel).toBe("Owed");
  });

  it("contributes no obligation rows when that feed could not be read", () => {
    // null = unreadable. It must not be confused with "nothing owed".
    expect(buildCashFlowRows({ obligations: null })).toEqual([]);
  });

  it("does not print the due date twice on an owed row", () => {
    /* The row renders sublabel and date together. Owed rows already state the day as
       "due X", so appending it again produced "due 2026-08-12 · 2026-08-12". */
    expect(detailLine("INV-CLOUDOPS-001 · due 2026-08-12", "2026-08-12")).toBe(
      "INV-CLOUDOPS-001 · due 2026-08-12",
    );
    expect(detailLine("due 2026-08-05", "2026-08-05")).toBe("due 2026-08-05");
    // A transaction's date is not in its sublabel, so it must still be shown.
    expect(detailLine("monthly payment", "2026-06-26")).toBe("monthly payment · 2026-06-26");
    expect(detailLine("", "2026-06-26")).toBe("2026-06-26");
    expect(detailLine("", "")).toBe("");
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
    expect(cashFlowTotals({ transactions: [], obligations: { rows: [], complete: true } }).liabilities).toBe(0);
  });

  it("sums liabilities from payable obligations, payroll included", () => {
    const t = cashFlowTotals({
      transactions: [],
      obligations: {
        rows: [
          { id: "ob1", type: "bill", amount_due: "12000", status: "due" },
          { id: "ob2", type: "payroll", amount_due: "6000", status: "upcoming" },
          { id: "ob3", type: "receivable", amount_due: "999999", status: "due" },
        ],
        complete: true,
      },
    });
    expect(t.liabilities).toBe(18000);
  });

  it("states no liabilities figure when the obligations read was cut short", () => {
    /* The obligations list pages behind a cursor, so a partial walk yields a real,
       plausible, SMALLER number with nothing on screen to mark it as partial. A metric
       card that quotes it is confidently wrong about what the tenant owes; "-" is not.
       The rows from that partial read are still listed — a debt that came back is real
       — so only the total is withheld. */
    const t = cashFlowTotals({
      transactions: [],
      obligations: {
        rows: [{ id: "ob1", type: "bill", amount_due: "12000", status: "due" }],
        complete: false,
      },
    });
    expect(t.liabilities).toBeNull();
  });

  it("names every feed that failed, so the user knows which figure to distrust", () => {
    const all = incompleteMessage({ tx: true, inv: true, ob: true });
    expect(all).toContain("Liabilities and some of the rows below, income and expenses and the bills listed below");

    /* A failed obligations read now costs rows as well as the figure — payroll and
       tax reach the list from nowhere else — so the notice has to admit the list is
       short, not just that one number is missing. */
    const obOnly = incompleteMessage({ tx: false, inv: false, ob: true });
    expect(obOnly).toContain("Liabilities and some of the rows below couldn't be loaded");
    expect(obOnly).not.toContain("income");
    expect(obOnly).not.toContain("bills listed below");

    const txOnly = incompleteMessage({ tx: true, inv: false, ob: false });
    expect(txOnly).toContain("Income and expenses couldn't be loaded");
    expect(txOnly).not.toContain("iabilities");

    const invOnly = incompleteMessage({ tx: false, inv: true, ob: false });
    expect(invOnly).toContain("The bills listed below couldn't be loaded");
    expect(invOnly).not.toContain("iabilities");
  });

  it("names a truncated (not failed) invoice read too, so a short bill list is never silent", () => {
    /* The invoice list caps silently — a cut-short walk still leaves real bills
       unlisted, exactly like a failed read, just without the failure flag. */
    const truncated = incompleteMessage({ tx: false, inv: false, ob: false, invTruncated: true });
    expect(truncated).toContain("Some of the bills listed below");

    // A failed read already says enough; it must not ALSO claim a truncation.
    const failed = incompleteMessage({ tx: false, inv: true, ob: false, invTruncated: true });
    expect(failed).toContain("The bills listed below couldn't be loaded");
    expect(failed).not.toContain("some of the bills listed below");
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
       it and made the metric disagree with the Payables tab beside it. */
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

// ─── buildMonthlyBreakdown ────────────────────────────────────────────────────

describe("buildMonthlyBreakdown", () => {
  it("groups inflows and outflows into separate month buckets", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "inflow", amount: "1000", transaction_date: "2026-06-01" }),
      TX({ id: "b", direction: "outflow", amount: "400", transaction_date: "2026-06-15" }),
      TX({ id: "c", direction: "inflow", amount: "2000", transaction_date: "2026-07-10" }),
    ]);
    expect(entries).toHaveLength(2);
    // newest first
    const [jul, jun] = entries;
    expect(jul.monthKey).toBe("2026-07");
    expect(jul.income).toBe(2000);
    expect(jul.expenses).toBe(0);
    expect(jun.monthKey).toBe("2026-06");
    expect(jun.income).toBe(1000);
    expect(jun.expenses).toBe(400);
  });

  it("excludes transfers and adjustments from both income and expenses", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "transfer", amount: "5000", transaction_date: "2026-06-01" }),
      TX({ id: "b", direction: "adjustment", amount: "200", transaction_date: "2026-06-05" }),
      TX({ id: "c", direction: "inflow", amount: "1000", transaction_date: "2026-06-10" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].income).toBe(1000);
    expect(entries[0].expenses).toBe(0);
  });

  it("returns an empty array when there are no inflow or outflow transactions", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "transfer", amount: "5000", transaction_date: "2026-06-01" }),
    ]);
    expect(entries).toHaveLength(0);
  });

  it("returns entries newest-first", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "b", direction: "inflow", amount: "100", transaction_date: "2026-08-01" }),
      TX({ id: "a", direction: "inflow", amount: "100", transaction_date: "2026-05-01" }),
      TX({ id: "c", direction: "inflow", amount: "100", transaction_date: "2026-11-01" }),
    ]);
    const keys = entries.map((e) => e.monthKey);
    expect(keys).toEqual(["2026-11", "2026-08", "2026-05"]);
  });

  it("ranks top expense counterparties by total spend descending", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "outflow", amount: "100", transaction_date: "2026-06-01", counterparty_id: "cp_small" }),
      TX({ id: "b", direction: "outflow", amount: "900", transaction_date: "2026-06-10", counterparty_id: "cp_big" }),
      TX({ id: "c", direction: "outflow", amount: "500", transaction_date: "2026-06-20", counterparty_id: "cp_mid" }),
    ]);
    expect(entries).toHaveLength(1);
    const top = entries[0].topExpenseCounterpartyIds;
    expect(top[0]).toEqual({ id: "cp_big", amount: 900 });
    expect(top[1]).toEqual({ id: "cp_mid", amount: 500 });
    expect(top[2]).toEqual({ id: "cp_small", amount: 100 });
  });

  it("aggregates multiple transactions from the same counterparty in a month", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "outflow", amount: "300", transaction_date: "2026-06-01", counterparty_id: "cp_1" }),
      TX({ id: "b", direction: "outflow", amount: "200", transaction_date: "2026-06-15", counterparty_id: "cp_1" }),
    ]);
    expect(entries[0].expenses).toBe(500);
    expect(entries[0].topExpenseCounterpartyIds[0]).toEqual({ id: "cp_1", amount: 500 });
  });

  it("uses a human-readable label derived from the month key", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "inflow", amount: "1", transaction_date: "2026-08-15" }),
    ]);
    expect(entries[0].label).toBe("Aug 2026");
  });

  it("handles a null counterparty_id as a separate bucket", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "outflow", amount: "100", transaction_date: "2026-06-01", counterparty_id: null }),
      TX({ id: "b", direction: "outflow", amount: "200", transaction_date: "2026-06-10", counterparty_id: null }),
    ]);
    expect(entries[0].expenses).toBe(300);
    expect(entries[0].topExpenseCounterpartyIds[0]).toEqual({ id: null, amount: 300 });
  });

  it("skips transactions with no date", () => {
    const entries = buildMonthlyBreakdown([
      TX({ id: "a", direction: "inflow", amount: "1000", transaction_date: null }),
      TX({ id: "b", direction: "inflow", amount: "500", transaction_date: "2026-06-01" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].income).toBe(500);
  });
});

// ─── monthSeriesDesc ──────────────────────────────────────────────────────────

describe("monthSeriesDesc", () => {
  it("returns count keys ending at endMonthKey, newest first", () => {
    expect(monthSeriesDesc("2026-08", 3)).toEqual(["2026-08", "2026-07", "2026-06"]);
  });

  it("wraps correctly across year boundaries", () => {
    expect(monthSeriesDesc("2026-02", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });

  it("returns a single-element array for count=1", () => {
    expect(monthSeriesDesc("2026-05", 1)).toEqual(["2026-05"]);
  });

  it("handles 12-month windows spanning a year boundary", () => {
    const series = monthSeriesDesc("2026-06", 12);
    expect(series).toHaveLength(12);
    expect(series[0]).toBe("2026-06");
    expect(series[11]).toBe("2025-07");
  });
});

// ─── buildMonthlyWindow ───────────────────────────────────────────────────────

describe("buildMonthlyWindow", () => {
  it("returns exactly the requested months in order, including gaps as zeros", () => {
    const keys = ["2026-04", "2026-05", "2026-06"];
    const window = buildMonthlyWindow(
      [
        TX({ id: "a", direction: "inflow", amount: "1000", transaction_date: "2026-04-10" }),
        // May has no transactions — should appear as zero
        TX({ id: "b", direction: "inflow", amount: "2000", transaction_date: "2026-06-05" }),
      ],
      keys,
    );
    expect(window).toHaveLength(3);
    expect(window[0]).toMatchObject({ monthKey: "2026-04", income: 1000, expenses: 0 });
    expect(window[1]).toMatchObject({ monthKey: "2026-05", income: 0, expenses: 0 });
    expect(window[2]).toMatchObject({ monthKey: "2026-06", income: 2000, expenses: 0 });
  });

  it("excludes transactions outside the requested window", () => {
    const keys = ["2026-06", "2026-07"];
    const window = buildMonthlyWindow(
      [
        TX({ id: "old", direction: "inflow", amount: "9000", transaction_date: "2025-01-15" }),
        TX({ id: "a", direction: "inflow", amount: "1000", transaction_date: "2026-06-01" }),
        TX({ id: "future", direction: "inflow", amount: "5000", transaction_date: "2027-03-01" }),
      ],
      keys,
    );
    expect(window).toHaveLength(2);
    expect(window[0]).toMatchObject({ monthKey: "2026-06", income: 1000 });
    expect(window[1]).toMatchObject({ monthKey: "2026-07", income: 0 });
  });

  it("returns all zeros when transactions array is empty", () => {
    const keys = ["2026-04", "2026-05", "2026-06"];
    const window = buildMonthlyWindow([], keys);
    expect(window).toHaveLength(3);
    expect(window.every((e) => e.income === 0 && e.expenses === 0)).toBe(true);
  });

  it("fills human-readable labels for zero-fill months", () => {
    const window = buildMonthlyWindow([], ["2026-08"]);
    expect(window[0].label).toBe("Aug 2026");
  });

  it("correctly separates income and expenses within the window", () => {
    const window = buildMonthlyWindow(
      [
        TX({ id: "a", direction: "inflow", amount: "3000", transaction_date: "2026-05-01" }),
        TX({ id: "b", direction: "outflow", amount: "1200", transaction_date: "2026-05-15" }),
        TX({ id: "c", direction: "transfer", amount: "500", transaction_date: "2026-05-20" }),
      ],
      ["2026-05"],
    );
    expect(window[0]).toMatchObject({ income: 3000, expenses: 1200 });
  });

  it("handles a large window efficiently — all 12 months present without duplication", () => {
    const keys = monthSeriesDesc("2026-12", 12).reverse();
    const txs = keys.map((mk, i) =>
      TX({ id: `t${i}`, direction: "inflow", amount: "100", transaction_date: `${mk}-01` }),
    );
    const window = buildMonthlyWindow(txs, keys);
    expect(window).toHaveLength(12);
    expect(window.every((e) => e.income === 100)).toBe(true);
  });

  // ── Dec / Jan year-boundary bucketing ─────────────────────────────────────

  it("keeps Dec 2025 transactions in 2025-12 and Jan 2026 transactions in 2026-01", () => {
    /* This is the primary guard for the year-boundary bucketing bug: a transaction
       dated 2025-12-xx must never land in 2025-11 or 2026-01. */
    const keys = ["2025-11", "2025-12", "2026-01", "2026-02"];
    const window = buildMonthlyWindow(
      [
        TX({ id: "nov", direction: "inflow",  amount: "100",  transaction_date: "2025-11-15" }),
        TX({ id: "dec", direction: "outflow", amount: "500",  transaction_date: "2025-12-31" }),
        TX({ id: "jan", direction: "inflow",  amount: "2000", transaction_date: "2026-01-01" }),
        TX({ id: "feb", direction: "outflow", amount: "300",  transaction_date: "2026-02-14" }),
      ],
      keys,
    );

    expect(window).toHaveLength(4);
    expect(window[0]).toMatchObject({ monthKey: "2025-11", income: 100,  expenses: 0   });
    expect(window[1]).toMatchObject({ monthKey: "2025-12", income: 0,    expenses: 500 });
    expect(window[2]).toMatchObject({ monthKey: "2026-01", income: 2000, expenses: 0   });
    expect(window[3]).toMatchObject({ monthKey: "2026-02", income: 0,    expenses: 300 });
  });

  it("does not bleed a Dec transaction into Jan even on the last day of the year", () => {
    /* 2025-12-31 is the edge most likely to trip an off-by-one that increments the
       month past 12 and wraps into the new year. */
    const window = buildMonthlyWindow(
      [TX({ id: "last", direction: "outflow", amount: "999", transaction_date: "2025-12-31" })],
      ["2025-12", "2026-01"],
    );
    expect(window[0]).toMatchObject({ monthKey: "2025-12", expenses: 999 });
    expect(window[1]).toMatchObject({ monthKey: "2026-01", income: 0, expenses: 0 });
  });

  it("does not bleed a Jan transaction into Dec even on the first day of the year", () => {
    /* 2026-01-01 is the other edge: a bucketing error that subtracts one from month 1
       would produce "2025-12" and steal the transaction from January. */
    const window = buildMonthlyWindow(
      [TX({ id: "first", direction: "inflow", amount: "750", transaction_date: "2026-01-01" })],
      ["2025-12", "2026-01"],
    );
    expect(window[0]).toMatchObject({ monthKey: "2025-12", income: 0, expenses: 0 });
    expect(window[1]).toMatchObject({ monthKey: "2026-01", income: 750 });
  });

  it("accumulates multiple Dec and multiple Jan transactions independently", () => {
    /* Two inflows in Dec and two outflows in Jan: totals must not bleed across the
       boundary even when the same counterparty appears on both sides. */
    const window = buildMonthlyWindow(
      [
        TX({ id: "d1", direction: "inflow",  amount: "1000", transaction_date: "2025-12-01", counterparty_id: "cp_x" }),
        TX({ id: "d2", direction: "inflow",  amount: "2000", transaction_date: "2025-12-20", counterparty_id: "cp_x" }),
        TX({ id: "j1", direction: "outflow", amount: "400",  transaction_date: "2026-01-10", counterparty_id: "cp_x" }),
        TX({ id: "j2", direction: "outflow", amount: "600",  transaction_date: "2026-01-25", counterparty_id: "cp_x" }),
      ],
      ["2025-12", "2026-01"],
    );
    expect(window[0]).toMatchObject({ monthKey: "2025-12", income: 3000, expenses: 0    });
    expect(window[1]).toMatchObject({ monthKey: "2026-01", income: 0,    expenses: 1000 });
  });

  it("silently drops transactions that fall outside the Dec-to-Jan window, not into a boundary month", () => {
    /* Transactions from Oct 2025 and Mar 2026 must vanish entirely, not overflow
       into November or February. */
    const window = buildMonthlyWindow(
      [
        TX({ id: "before", direction: "inflow",  amount: "9000", transaction_date: "2025-10-01" }),
        TX({ id: "dec",    direction: "outflow", amount: "500",  transaction_date: "2025-12-15" }),
        TX({ id: "jan",    direction: "inflow",  amount: "800",  transaction_date: "2026-01-20" }),
        TX({ id: "after",  direction: "outflow", amount: "9999", transaction_date: "2026-03-01" }),
      ],
      ["2025-11", "2025-12", "2026-01", "2026-02"],
    );
    expect(window[0]).toMatchObject({ monthKey: "2025-11", income: 0,   expenses: 0   });
    expect(window[1]).toMatchObject({ monthKey: "2025-12", income: 0,   expenses: 500 });
    expect(window[2]).toMatchObject({ monthKey: "2026-01", income: 800, expenses: 0   });
    expect(window[3]).toMatchObject({ monthKey: "2026-02", income: 0,   expenses: 0   });
  });

  // ── topExpenseCounterpartyIds is month-local at the Dec / Jan boundary ───────

  it("ranks topExpenseCounterpartyIds using only that month's outflows — Dec and Jan are separate", () => {
    /* cp_big spends more in Jan than in Dec. If bucketing bleeds across the year
       boundary, cp_big would rank #1 in Dec as well. It must not: the Dec list is
       determined solely by December outflows. */
    const window = buildMonthlyWindow(
      [
        // December 2025 outflows — cp_small spends most in Dec
        TX({ id: "d1", direction: "outflow", amount: "900",  transaction_date: "2025-12-05", counterparty_id: "cp_small" }),
        TX({ id: "d2", direction: "outflow", amount: "200",  transaction_date: "2025-12-20", counterparty_id: "cp_big"   }),
        // January 2026 outflows — cp_big spends most in Jan
        TX({ id: "j1", direction: "outflow", amount: "300",  transaction_date: "2026-01-10", counterparty_id: "cp_small" }),
        TX({ id: "j2", direction: "outflow", amount: "1500", transaction_date: "2026-01-25", counterparty_id: "cp_big"   }),
      ],
      ["2025-12", "2026-01"],
    );

    const dec = window[0];
    const jan = window[1];

    // Dec: cp_small is rank #1 (900 > 200), cp_big is rank #2
    expect(dec.monthKey).toBe("2025-12");
    expect(dec.topExpenseCounterpartyIds[0]).toEqual({ id: "cp_small", amount: 900 });
    expect(dec.topExpenseCounterpartyIds[1]).toEqual({ id: "cp_big",   amount: 200 });

    // Jan: cp_big is rank #1 (1500 > 300), cp_small is rank #2
    expect(jan.monthKey).toBe("2026-01");
    expect(jan.topExpenseCounterpartyIds[0]).toEqual({ id: "cp_big",   amount: 1500 });
    expect(jan.topExpenseCounterpartyIds[1]).toEqual({ id: "cp_small", amount: 300  });
  });

  it("topExpenseCounterpartyIds for Dec is empty when Dec has no outflows, even if Jan does", () => {
    /* A zero-fill month must produce an empty top-expenses list, not inherit
       entries from a neighbouring month that does have outflows. */
    const window = buildMonthlyWindow(
      [
        TX({ id: "j1", direction: "outflow", amount: "800", transaction_date: "2026-01-15", counterparty_id: "cp_1" }),
      ],
      ["2025-12", "2026-01"],
    );

    expect(window[0]).toMatchObject({ monthKey: "2025-12", expenses: 0 });
    expect(window[0].topExpenseCounterpartyIds).toEqual([]);

    expect(window[1].monthKey).toBe("2026-01");
    expect(window[1].topExpenseCounterpartyIds[0]).toEqual({ id: "cp_1", amount: 800 });
  });

  it("aggregates Dec outflows per counterparty independently of Jan outflows from the same counterparty", () => {
    /* The same counterparty appears in both months. Its Dec total must be the sum
       of Dec transactions only; its Jan total the sum of Jan transactions only. */
    const window = buildMonthlyWindow(
      [
        TX({ id: "d1", direction: "outflow", amount: "400",  transaction_date: "2025-12-10", counterparty_id: "cp_shared" }),
        TX({ id: "d2", direction: "outflow", amount: "600",  transaction_date: "2025-12-28", counterparty_id: "cp_shared" }),
        TX({ id: "j1", direction: "outflow", amount: "1200", transaction_date: "2026-01-05", counterparty_id: "cp_shared" }),
        TX({ id: "j2", direction: "outflow", amount: "800",  transaction_date: "2026-01-30", counterparty_id: "cp_shared" }),
      ],
      ["2025-12", "2026-01"],
    );

    // Dec: 400 + 600 = 1000
    expect(window[0].topExpenseCounterpartyIds).toEqual([{ id: "cp_shared", amount: 1000 }]);

    // Jan: 1200 + 800 = 2000
    expect(window[1].topExpenseCounterpartyIds).toEqual([{ id: "cp_shared", amount: 2000 }]);
  });
});

// ─── YTD window (MonthlyBreakdownCard arithmetic) ─────────────────────────────
//
// MonthlyBreakdownCard computes the YTD window as:
//   monthSeriesDesc(thisMonth, thisMonthNumber).reverse()
// and guards the chip with:
//   const showYtd = thisMonthNumber >= 2 && thisMonthNumber <= 11;
//
// These tests pin both predicates for every month 1–12 so an off-by-one in
// either cannot slip through undetected.

// ─── YTD window (MonthlyBreakdownCard arithmetic) ─────────────────────────────
//
// MonthlyBreakdownCard delegates its YTD logic to two exported helpers in
// cashFlow.ts: showYtdChip (the chip-visibility guard) and ytdWindowKeys (the
// ordered key list).  These tests exercise the real exported code so that any
// change to the component's behaviour must first break a test here.

describe("showYtdChip", () => {
  it("returns false for January — a 1-month window is not a meaningful YTD", () => {
    expect(showYtdChip(1)).toBe(false);
  });

  it("returns false for December — same span as 'Last 12 months'", () => {
    expect(showYtdChip(12)).toBe(false);
  });

  it("returns true for every month from February through November", () => {
    for (let m = 2; m <= 11; m++) {
      expect(showYtdChip(m), `showYtdChip should be true for month ${m}`).toBe(true);
    }
  });
});

describe("ytdWindowKeys", () => {
  it("produces exactly thisMonthNumber keys for every month of the year", () => {
    for (let m = 1; m <= 12; m++) {
      const thisMonth = `2026-${String(m).padStart(2, "0")}`;
      const keys = ytdWindowKeys(thisMonth);
      expect(keys, `month ${m} should produce ${m} keys`).toHaveLength(m);
    }
  });

  it("always starts with YYYY-01 — the window anchors to January of the current year", () => {
    for (let m = 1; m <= 12; m++) {
      const thisMonth = `2026-${String(m).padStart(2, "0")}`;
      const keys = ytdWindowKeys(thisMonth);
      expect(keys[0], `month ${m} should start at 2026-01`).toBe("2026-01");
    }
  });

  it("always ends with the current month — the window is Jan → now, inclusive", () => {
    for (let m = 1; m <= 12; m++) {
      const thisMonth = `2026-${String(m).padStart(2, "0")}`;
      const keys = ytdWindowKeys(thisMonth);
      expect(keys[keys.length - 1], `month ${m} should end at ${thisMonth}`).toBe(thisMonth);
    }
  });

  it("the key list is contiguous — each entry steps exactly one calendar month forward", () => {
    for (let m = 2; m <= 12; m++) {
      const thisMonth = `2026-${String(m).padStart(2, "0")}`;
      const keys = ytdWindowKeys(thisMonth);
      for (let i = 1; i < keys.length; i++) {
        const prev = new Date(`${keys[i - 1]}-01`);
        prev.setMonth(prev.getMonth() + 1);
        const expected = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
        expect(keys[i], `gap at index ${i} of month-${m} series`).toBe(expected);
      }
    }
  });
});
