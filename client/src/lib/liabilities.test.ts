import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  unpaidApInvoices,
  payableObligations,
  liabilitiesTotal,
  payablesView,
  type ApInvoiceLike,
} from "./liabilities";
import type { RawObligation } from "./brainObligations";

/** A read that walked the cursor to the end — the only state that may produce a total. */
const DONE = { complete: true } as const;

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
    expect(liabilitiesTotal(null, DONE)).toBeNull();
    expect(liabilitiesTotal(undefined, DONE)).toBeNull();
  });

  it("returns 0 — a real claim that nothing is owed — for an empty but present list", () => {
    expect(liabilitiesTotal([], DONE)).toBe(0);
  });

  it("distinguishes the two cases, which is the whole point", () => {
    expect(liabilitiesTotal(null, DONE)).not.toBe(liabilitiesTotal([], DONE));
  });
});

/* ── what counts ──────────────────────────────────────────────────────────── */

describe("payableObligations — money-out only", () => {
  it("counts payroll, the whole reason this moved off the invoice feed", () => {
    const rows = [ob({ type: "bill", amount_due: "211200.00" }), ob({ type: "payroll", amount_due: "67128.76" })];
    expect(payableObligations(rows)).toHaveLength(2);
    expect(liabilitiesTotal(rows, DONE)).toBeCloseTo(278328.76, 2);
  });

  it("excludes receivables, or liabilities would be inflated by what customers owe us", () => {
    const rows = [ob({ amount_due: "1000" }), ob({ direction: "receivable", amount_due: "9000000" })];
    expect(payableObligations(rows)).toHaveLength(1);
    expect(liabilitiesTotal(rows, DONE)).toBe(1000);
  });

  it("reads the receivable flag off `type` too, which is where brain-core actually puts it", () => {
    // `direction` is null on every row the live API returns; the hint rides on `type`.
    expect(liabilitiesTotal([ob({ direction: undefined, type: "receivable", amount_due: "500" })], DONE)).toBe(0);
  });

  it("excludes settled obligations", () => {
    const rows = [ob({ amount_due: "100" }), ob({ amount_due: "100", status: "paid" }), ob({ amount_due: "100", status: "VOID" })];
    expect(payableObligations(rows)).toHaveLength(1);
    expect(liabilitiesTotal(rows, DONE)).toBe(100);
  });

  it("counts an UNRECOGNISED status as still owed, erring toward showing the debt", () => {
    // An unknown status inflating the total is visible and checkable; one silently
    // discharging a debt hides money the tenant actually owes.
    expect(liabilitiesTotal([ob({ amount_due: "100", status: "in_dispute" })], DONE)).toBe(100);
  });
});

/* ── amount handling ──────────────────────────────────────────────────────── */

describe("amount parsing", () => {
  it("sums decimal strings as the API returns them", () => {
    expect(liabilitiesTotal([ob({ amount_due: "4800.00000000" }), ob({ amount_due: "200.00" })], DONE)).toBe(5000);
  });

  it("does not discard a numeric amount, which would silently zero a real debt", () => {
    expect(liabilitiesTotal([ob({ amount_due: 300 })], DONE)).toBe(300);
  });

  it("lets one unparseable row understate the total instead of blanking the card", () => {
    expect(liabilitiesTotal([ob({ amount_due: "not-a-number" }), ob({ amount_due: "300" })], DONE)).toBe(300);
    expect(liabilitiesTotal([ob({ amount_due: null }), ob({ amount_due: "300" })], DONE)).toBe(300);
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

/* ── an incomplete read is not a zero balance ─────────────────────────────────
   Two ways the obligations feed comes back short without saying so, both measured on
   a live tenant: the list pages behind a cursor, and the rows behind an ingested
   document land in waves. Every intermediate answer is complete, self-consistent and
   wrong, so neither can be detected from the response itself. */

describe("liabilitiesTotal — a partial read states no figure", () => {
  it("returns null when the cursor walk did not finish, even though it has rows to sum", () => {
    /* The tempting behaviour is to sum what came back: it produces a real number, and
       nothing on screen says it is a fraction of the ledger. On "what you owe", a
       confident understatement is worse than a dash. */
    const rows = [ob({ amount_due: "211200.00" })];
    expect(liabilitiesTotal(rows, { complete: false })).toBeNull();
    expect(liabilitiesTotal(rows, DONE)).toBe(211200);
  });
});

describe("payablesView — the branch order that stops a false all-clear", () => {
  const rows = [ob({ amount_due: "100" })];

  it("distinguishes failed from loading, and lets neither borrow a stale read", () => {
    expect(payablesView({ failed: true, read: null, ingesting: false }).kind).toBe("failed");
    expect(payablesView({ failed: false, read: null, ingesting: false }).kind).toBe("loading");
    expect(payablesView({ failed: true, read: { rows, complete: true }, ingesting: false }).rows).toHaveLength(0);
  });

  it("zero rows on an UNFINISHED read is unreadable, not empty", () => {
    const v = payablesView({ failed: false, read: { rows: [], complete: false }, ingesting: false });
    expect(v.kind).toBe("unreadable");
    expect(v.total).toBeNull();
  });

  it("zero rows while documents are still being read is \"arriving\", not empty", () => {
    /* Timed on a fresh tenant: payables read $211,200.00 at 1s, $278,328.76 at 26s and
       $287,223.39 at 56s. A tab that mounts before the first wave has landed sees a
       clean, complete, empty read — and "you owe nothing" is a conclusion drawn from
       an import that has not finished. */
    expect(payablesView({ failed: false, read: { rows: [], complete: true }, ingesting: true }).kind).toBe("arriving");
  });

  it("a cut-short read outranks an unfinished import — the stronger caveat wins", () => {
    expect(payablesView({ failed: false, read: { rows: [], complete: false }, ingesting: true }).kind).toBe("unreadable");
  });

  it("only a complete, settled, empty read may claim nothing is owed", () => {
    const v = payablesView({ failed: false, read: { rows: [], complete: true }, ingesting: false });
    expect(v).toMatchObject({ kind: "empty", total: 0, truncated: false, mayGrow: false });
  });

  it("lists rows from a truncated read but withholds the total", () => {
    const v = payablesView({ failed: false, read: { rows, complete: false }, ingesting: false });
    expect(v).toMatchObject({ kind: "rows", truncated: true, total: null });
    expect(v.rows).toHaveLength(1);
  });

  it("keeps the figure during an import and marks it as a floor", () => {
    /* Not blanked: the number is true as of now, and hiding a real total every time a
       document is being read would be its own kind of lying. `mayGrow` is what the
       caption hangs off. */
    const v = payablesView({ failed: false, read: { rows, complete: true }, ingesting: true });
    expect(v).toMatchObject({ kind: "rows", total: 100, mayGrow: true });
  });

  it("excludes receivables from the rows it hands the tab", () => {
    const mixed = [ob({ amount_due: "100" }), ob({ type: "receivable", amount_due: "999999" })];
    const v = payablesView({ failed: false, read: { rows: mixed, complete: true }, ingesting: false });
    expect(v.rows).toHaveLength(1);
    expect(v.total).toBe(100);
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
  "../components/PayablesTab.tsx",
];

describe("the three liabilities surfaces agree by construction", () => {
  it("Overview, Cash Flow and the Payables tab all read /ledger/obligations", () => {
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
    expect(read("../pages/HomePage.tsx")).toContain("/ledger?tab=payables");
  });

  it("keeps every URL that has ever pointed at this tab working", () => {
    /* The tab shipped as "Obligations" and was renamed to "Payables" to pair with
       Receivables. Wouter has no 404 for an unknown ?tab= value — it falls back to
       Accounts — so a dropped alias does not error, it silently lands the user on a
       list of bank balances. `liabilities` predates both names. */
    const src = read("../pages/FinancesPage.tsx");
    for (const slug of ["payables", "obligations", "liabilities"]) {
      expect(src, `?tab=${slug} must still resolve to the Payables tab`).toMatch(
        new RegExp(`\\b${slug}:\\s*"Payables"`),
      );
    }
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
