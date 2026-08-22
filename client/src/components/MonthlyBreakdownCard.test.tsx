// @vitest-environment jsdom
/**
 * DOM-level rendering tests for the MonthlyBreakdownCard "Top expenses" panel.
 *
 * The source-scan suite in assistant-citation-routes.test.ts confirms the
 * null-safety fallback strings exist in the source file.  This suite
 * exercises the ACTUAL RENDERING PATH so that a future refactor that deletes
 * or rearranges the fallback branches fails here, even if the strings stay in
 * the file.
 *
 * Cases exercised:
 *   1. All counterparty IDs are null  →  every row renders "Unknown" + the
 *      aggregated amount (the panel's primary regression risk from the task).
 *   2. nameOf is undefined + non-null id  →  first 12 chars + "…"
 *   3. nameOf returns null + id is null   →  "Unknown"
 *   4. nameOf returns a resolved string   →  that string
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { MonthlyBreakdownCard } from "./MonthlyBreakdownCard";
import type { CashFlowTxLike } from "@/lib/cashFlow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Recharts mock ──────────────────────────────────────────────────────────────
//
// Recharts' ResponsiveContainer uses ResizeObserver and getBoundingClientRect
// to size itself; jsdom returns zero dimensions and the observer never fires.
// Mocking the chart pieces lets the rest of the component (the detail panel)
// render normally so we can assert on the counterparty names.
vi.mock("recharts", () => {
  const React = require("react");
  return {
    BarChart: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "mock-bar-chart" }, children),
    Bar: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    CartesianGrid: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});

// ── helpers ────────────────────────────────────────────────────────────────────

/** YYYY-MM for the current calendar month (mirrors the component's own logic). */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Bare-minimum currency formatter — keeps tests readable. */
const fmt = (v: string | number) => `$${Number(v).toFixed(0)}`;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = "";
});

// ── convenience ────────────────────────────────────────────────────────────────

function getPanel() {
  return container!.querySelector('[data-testid="panel-monthly-breakdown-detail"]');
}

// ── suite ──────────────────────────────────────────────────────────────────────

describe("MonthlyBreakdownCard — Top Expenses nameOf rendering", () => {
  /**
   * PRIMARY REGRESSION CASE (the task's stated regression risk).
   *
   * When every expense transaction in the selected month has a null
   * counterparty_id, buildMonthlyBreakdown groups them all into ONE bucket
   * keyed by null, with the summed amount.  The panel must:
   *   • render exactly one row (because all nulls collapse into one group)
   *   • label it "Unknown", NOT "null" or an empty string
   *   • show the correct aggregated amount
   */
  it("shows 'Unknown' + the aggregated amount when all counterparty IDs are null", () => {
    const date = `${currentMonthKey()}-15`;
    // Three separate outflow transactions, all with null counterparty_id.
    // buildMonthlyBreakdown groups them under the same null key → one entry.
    const transactions: readonly CashFlowTxLike[] = [
      { id: "tx-1", direction: "outflow", amount: "400", transaction_date: date, counterparty_id: null },
      { id: "tx-2", direction: "outflow", amount: "350", transaction_date: date, counterparty_id: null },
      { id: "tx-3", direction: "outflow", amount: "150", transaction_date: date, counterparty_id: null },
    ];
    // Total: $900

    act(() => {
      root!.render(
        <MonthlyBreakdownCard
          transactions={transactions}
          format={fmt}
          nameOf={() => null}
        />,
      );
    });

    const panel = getPanel();
    expect(panel, "detail panel must render when there are expense transactions").not.toBeNull();

    const text = panel!.textContent ?? "";

    // The label must be "Unknown", not "null" or an empty string.
    expect(text).toContain("Unknown");
    expect(text).not.toContain("null");

    // The aggregated amount ($400 + $350 + $150 = $900) must be displayed.
    expect(text).toContain(fmt(900)); // "$900"

    // Exactly one counterparty row rendered — all nulls collapse into one group.
    const rows = panel!.querySelectorAll('[data-testid^="row-monthly-breakdown-cp-"]');
    expect(rows).toHaveLength(1);
  });

  it("renders the first 12 chars + '…' when nameOf is undefined and id is non-null", () => {
    // nameOf prop is omitted.  The optional-call `nameOf?.(id)` evaluates to
    // undefined, so the ?? branch runs: id is a non-null string →
    // `${id.slice(0, 12)}…`.
    const ID_HAS_VALUE = "cp_unresolved_xyzabc"; // 21 chars — truncation kicks in
    const date = `${currentMonthKey()}-15`;

    act(() => {
      root!.render(
        <MonthlyBreakdownCard
          transactions={[
            { id: "tx-a", direction: "outflow", amount: "500", transaction_date: date, counterparty_id: ID_HAS_VALUE },
          ]}
          format={fmt}
          // nameOf intentionally omitted to test the undefined path
        />,
      );
    });

    const panel = getPanel();
    expect(panel, "detail panel must render when there are expense transactions").not.toBeNull();

    // "cp_unresolved_xyzabc".slice(0, 12) = "cp_unresolve"
    const expected = `${ID_HAS_VALUE.slice(0, 12)}\u2026`; // …
    expect(panel!.textContent).toContain(expected);
  });

  it('renders "Unknown" when nameOf returns null and the counterparty id is null', () => {
    // nameOf is provided but returns null, and id itself is null.
    // `nameOf?.(null)` → null; then `null ?? (null ? … : "Unknown")` → "Unknown".
    const date = `${currentMonthKey()}-15`;

    act(() => {
      root!.render(
        <MonthlyBreakdownCard
          transactions={[
            { id: "tx-b", direction: "outflow", amount: "300", transaction_date: date, counterparty_id: null },
          ]}
          format={fmt}
          nameOf={() => null}
        />,
      );
    });

    const panel = getPanel();
    expect(panel, "detail panel must render when there are expense transactions").not.toBeNull();
    expect(panel!.textContent).toContain("Unknown");
    expect(panel!.textContent).not.toContain("null");
  });

  it("renders the resolved display name when nameOf returns a string", () => {
    // nameOf returns a real display name for the id.
    // `nameOf?.(id)` → "Acme Corp"; the ?? branch is never reached.
    const ID_RESOLVED = "cp-resolved-99";
    const date = `${currentMonthKey()}-15`;

    act(() => {
      root!.render(
        <MonthlyBreakdownCard
          transactions={[
            { id: "tx-c", direction: "outflow", amount: "200", transaction_date: date, counterparty_id: ID_RESOLVED },
          ]}
          format={fmt}
          nameOf={(id) => (id === ID_RESOLVED ? "Acme Corp" : null)}
        />,
      );
    });

    const panel = getPanel();
    expect(panel, "detail panel must render when there are expense transactions").not.toBeNull();
    expect(panel!.textContent).toContain("Acme Corp");
  });
});
