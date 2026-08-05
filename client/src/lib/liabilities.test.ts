import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  unpaidApInvoices,
  payableObligations,
  liabilitiesTotal,
  type ApInvoiceLike,
} from "./liabilities";
import type { RawObligation } from "./brainObligations";

/**
 * The defect these tests exist for: an unreachable read rendered as
 * "No outstanding liabilities. You are all caught up." A false all-clear on money
 * owed is worse than a blank card, so the null-vs-zero distinction is a contract,
 * not an implementation detail — all three surfaces branch on it.
 *
 * The second defect: liabilities were derived from `/ledger/invoices`, which carries
 * no payroll records, so accrued payroll was invisible to the figure. That was never
 * an accounting decision — it was a consequence of the source. See lib/liabilities.ts.
 */

const ob = (over: Partial<Record<string, unknown>> = {}): RawObligation => ({
  id: `ob${Math.random()}`,
  type: "bill",
  amount_due: "100.00",
  status: "due",
  due_date: "2026-09-01",
  counterparty_id: "cp_1",
  ...over,
});

/* ── null vs zero ─────────────────────────────────────────────────────────── */

describe("liabilitiesTotal — absence of data is not a zero balance", () => {
  it("returns null when obligations are unreachable, so callers cannot render a false all-clear", () => {
    expect(liabilitiesTotal(null)).toBeNull();
    expect(liabilitiesTotal(undefined)).toBeNull();
  });

  it("returns 0 — a real claim that nothing is owed — for an empty but present list", () => {
    expect(liabilitiesTotal([])).toBe(0);
  });

  it("distinguishes the two cases, which is the whole point", () => {
    expect(liabilitiesTotal(null)).not.toBe(liabilitiesTotal([]));
  });
});

/* ── what counts ──────────────────────────────────────────────────────────── */

describe("payableObligations — money-out only", () => {
  it("counts payroll, the whole reason this moved off the invoice feed", () => {
    const rows = [ob({ type: "bill", amount_due: "211200.00" }), ob({ type: "payroll", amount_due: "67128.76" })];
    expect(payableObligations(rows)).toHaveLength(2);
    expect(liabilitiesTotal(rows)).toBeCloseTo(278328.76, 2);
  });

  it("excludes receivables, or liabilities would be inflated by what customers owe us", () => {
    const rows = [ob({ amount_due: "1000" }), ob({ direction: "receivable", amount_due: "9000000" })];
    expect(payableObligations(rows)).toHaveLength(1);
    expect(liabilitiesTotal(rows)).toBe(1000);
  });

  it("reads the receivable flag off `type` too, which is where brain-core actually puts it", () => {
    // `direction` is null on every row the live API returns; the hint rides on `type`.
    expect(liabilitiesTotal([ob({ direction: undefined, type: "receivable", amount_due: "500" })])).toBe(0);
  });

  it("excludes settled obligations", () => {
    const rows = [ob({ amount_due: "100" }), ob({ amount_due: "100", status: "paid" }), ob({ amount_due: "100", status: "VOID" })];
    expect(payableObligations(rows)).toHaveLength(1);
    expect(liabilitiesTotal(rows)).toBe(100);
  });

  it("counts an UNRECOGNISED status as still owed, erring toward showing the debt", () => {
    // An unknown status inflating the total is visible and checkable; one silently
    // discharging a debt hides money the tenant actually owes.
    expect(liabilitiesTotal([ob({ amount_due: "100", status: "in_dispute" })])).toBe(100);
  });
});

/* ── amount handling ──────────────────────────────────────────────────────── */

describe("amount parsing", () => {
  it("sums decimal strings as the API returns them", () => {
    expect(liabilitiesTotal([ob({ amount_due: "4800.00000000" }), ob({ amount_due: "200.00" })])).toBe(5000);
  });

  it("does not discard a numeric amount, which would silently zero a real debt", () => {
    expect(liabilitiesTotal([ob({ amount_due: 300 })])).toBe(300);
  });

  it("lets one unparseable row understate the total instead of blanking the card", () => {
    expect(liabilitiesTotal([ob({ amount_due: "not-a-number" }), ob({ amount_due: "300" })])).toBe(300);
    expect(liabilitiesTotal([ob({ amount_due: null }), ob({ amount_due: "300" })])).toBe(300);
  });
});

/* ── ordering ─────────────────────────────────────────────────────────────── */

describe("payableObligations — ordering", () => {
  it("sorts soonest-due first, so the list opens on what needs paying next", () => {
    const rows = [ob({ id: "c", due_date: "2026-12-01" }), ob({ id: "a", due_date: "2026-08-01" }), ob({ id: "b", due_date: "2026-10-01" })];
    expect(payableObligations(rows).map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts undated obligations last rather than to the top", () => {
    const rows = [ob({ id: "undated", due_date: null }), ob({ id: "dated", due_date: "2026-08-01" })];
    expect(payableObligations(rows).map((o) => o.id)).toEqual(["dated", "undated"]);
  });

  it("tolerates a null list and null rows without throwing", () => {
    expect(payableObligations(null)).toEqual([]);
    expect(payableObligations([null as unknown as RawObligation, ob({ amount_due: "5" })])).toHaveLength(1);
  });
});

/* ── the invoice helper that stayed behind ────────────────────────────────── */

describe("unpaidApInvoices — still the source for the Cash Flow bill ROWS", () => {
  const ap = (amount: string | number, status = "open"): ApInvoiceLike => ({
    status,
    amount_due: amount,
    metadata: { scenario: "ap" },
  });
  const ar = (amount: string | number, status = "open"): ApInvoiceLike => ({
    status,
    amount_due: amount,
    metadata: { scenario: "ar" },
  });

  it("excludes AR and paid bills", () => {
    expect(unpaidApInvoices([ap(1000), ar(9_000_000), ap(200), ap(100, "paid")])).toHaveLength(2);
  });

  it("treats a missing scenario as not-AP rather than guessing", () => {
    expect(unpaidApInvoices([{ status: "open", amount_due: 500 }, { status: "open", amount_due: 500, metadata: null }])).toHaveLength(0);
  });

  it("tolerates a null/undefined list without throwing", () => {
    expect(unpaidApInvoices(null)).toEqual([]);
    expect(unpaidApInvoices(undefined)).toEqual([]);
  });
});

/* ── cross-surface guard ──────────────────────────────────────────────────────
   `RawObligation` is `{ [K in keyof Obligation]?: unknown }` — every field optional
   and `unknown`. Invoice rows therefore satisfy it structurally, so `liabilitiesTotal(invoices)`
   still TYPE-CHECKS. TypeScript cannot catch a surface being repointed back at the
   invoice feed; only this can. */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

const LIABILITY_SURFACES = [
  "../pages/HomePage.tsx",
  "../components/CashFlowTab.tsx",
  "../components/ObligationsTab.tsx",
];

describe("the three liabilities surfaces agree by construction", () => {
  it("Overview, Cash Flow and the Obligations tab all read /ledger/obligations", () => {
    for (const f of LIABILITY_SURFACES) {
      expect(read(f), `${f} must read the obligations feed`).toContain("/api/brain/ledger/obligations");
    }
  });

  it("no surface derives a liabilities figure from the invoice feed", () => {
    for (const f of [...LIABILITY_SURFACES, "./cashFlow.ts"]) {
      const calls = read(f).match(/liabilitiesTotal\(([^)]*)\)/g) ?? [];
      for (const call of calls) {
        expect(call, `${f}: liabilities must come from obligations, not invoices`).not.toMatch(/invoice/i);
      }
    }
  });

  it("Overview links to the itemized list that backs its number", () => {
    // A metric that drills into a DIFFERENT figure is the exact bug this change fixed.
    expect(read("../pages/HomePage.tsx")).toContain("/ledger?tab=obligations");
  });

  it("no surface coerces an unreachable liabilities figure into a zero", () => {
    /* The null-vs-zero contract is only worth anything if it survives the call site.
       `liabilitiesTotal(...) ?? 0` or `|| 0` would quietly turn "we could not find out"
       back into "you owe nothing" — the precise false all-clear the contract prevents,
       and invisible to a unit test of the function itself. */
    for (const f of [...LIABILITY_SURFACES, "./cashFlow.ts"]) {
      const src = read(f);
      expect(src, `${f}: an unreachable total must stay null`).not.toMatch(/liabilitiesTotal\([^)]*\)\s*(\?\?|\|\|)\s*0/);
      expect(src, `${f}: an unreachable total must stay null`).not.toMatch(/liabilities\s*(\?\?|\|\|)\s*0/);
    }
  });
});
