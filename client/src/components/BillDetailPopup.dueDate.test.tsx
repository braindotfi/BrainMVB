// @vitest-environment jsdom
/**
 * What the bill popup actually SHOWS for a due date.
 *
 * lib/dueDates.test.ts pins the arithmetic, and its source scan proves the popups
 * import the shared helper. Neither reads the screen: a change that hands the helper
 * the wrong field (created_at instead of due_date), or drops the chip out of the
 * header, leaves every one of those assertions green while the user sees a different
 * date — or no date at all.
 *
 * So this suite renders the real BillDetailPopup and reads the two places a due date
 * appears: the chip beside the vendor name, and the "Due" row in the Details table.
 *
 * Harness follows MonthlyBreakdownCard.test.tsx / TransactionDetailPopup.txlookup.test.tsx
 * (jsdom + createRoot). The popup's image imports resolve through the `@assets` alias
 * in vitest.config.ts, so they need no stubbing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";

// The popup reads both through hooks that require providers it does not own.
vi.mock("@/lib/useCurrency", () => ({
  useCurrency: () => ({ format: (n: unknown) => `$${Number(n).toFixed(2)}` }),
}));
vi.mock("@/lib/intentsStore", () => ({
  useIntents: () => ({ intents: [] }),
}));

import { BillDetailPopup, type BrainInvoiceDTO } from "./BillDetailPopup";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── fixtures ──────────────────────────────────────────────────────────────────

/**
 * `created_at` is deliberately a DIFFERENT day from `due_date`, and its rendering is
 * asserted absent below: that is what catches the popup reading the wrong field.
 */
const DUE_TODAY: BrainInvoiceDTO = {
  id: "inv_due_today",
  invoice_number: "INV-2026-0914",
  counterparty_id: "cp_acme",
  amount_due: "1200.00",
  currency: "USD",
  due_date: "2026-09-14",
  status: "open",
  created_at: "2026-08-02T00:00:00.000Z",
};

const NO_DUE_DATE: BrainInvoiceDTO = {
  ...DUE_TODAY,
  id: "inv_undated",
  invoice_number: "INV-2026-NODATE",
  due_date: null,
};

const CREATED_AT_RENDERED = "August 2, 2026";

const MORNING = "2026-09-14T09:00:00";
const EVENING = "2026-09-14T21:00:00";

// ── harness ───────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;

/**
 * Only `Date` is faked. React's scheduler and Radix's dialog both run on real
 * timers; replacing those makes a render that never flushes look like a failing
 * assertion.
 */
function freezeClockAt(localTime: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(localTime));
}

function openPopup(bill: BrainInvoiceDTO) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <BillDetailPopup bill={bill} vendorName="Acme Supply Co" amountBasis="source" onClose={() => {}} hidePager />,
    );
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

// ── reading the screen ────────────────────────────────────────────────────────

/** The chip beside the vendor name — absent (null) when the record has no date. */
const chip = () => document.body.querySelector<HTMLElement>('[data-testid="bill-due-chip"]');

/**
 * The value cell of the Details row labelled "Due".
 *
 * The rows carry no test id, so the row is found by its label — which is also the
 * thing a reader scans for. `null` means the row itself is gone.
 */
function dueRowValue(): string | null {
  const body = document.body.querySelector('[data-testid="bill-detail-popup-content"]');
  if (!body) return null;
  for (const row of Array.from(body.querySelectorAll("div"))) {
    const cells = row.children;
    if (cells.length !== 2) continue;
    if (cells[0].textContent?.trim() !== "Due") continue;
    return cells[1].textContent?.trim() ?? "";
  }
  return null;
}

const popupText = () => document.body.textContent ?? "";

// ── suite ─────────────────────────────────────────────────────────────────────

describe("BillDetailPopup — the due date as it is read on screen", () => {
  it("shows the chip and the Due row for a record due today", () => {
    freezeClockAt(MORNING);
    openPopup(DUE_TODAY);

    expect(chip(), "the due chip must render beside the vendor name").not.toBeNull();
    expect(chip()!.textContent).toBe("Due today");
    expect(dueRowValue(), "the Details table must carry a Due row").toBe("September 14, 2026");

    // The record's own due date, not another date it happens to carry.
    expect(popupText(), "the popup is reading created_at, not due_date").not.toContain(
      CREATED_AT_RENDERED,
    );
  });

  it("reads the same at 09:00 and at 21:00 on that same record", () => {
    freezeClockAt(MORNING);
    openPopup(DUE_TODAY);
    const morning = { chip: chip()?.textContent, due: dueRowValue() };

    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";

    freezeClockAt(EVENING);
    openPopup(DUE_TODAY);
    const evening = { chip: chip()?.textContent, due: dueRowValue() };

    // The bug: the chip flipped to "Overdue" after midday with no data change.
    expect(evening.chip, "the clock moving is not a data change").toBe(morning.chip);
    expect(evening.due).toBe(morning.due);
    expect(evening.chip).toBe("Due today");
    expect(evening.due).toBe("September 14, 2026");
  });

  it("invents no date for a record that has none", () => {
    freezeClockAt(EVENING);
    openPopup(NO_DUE_DATE);

    expect(chip(), "an undated record must get no chip at all").toBeNull();
    expect(dueRowValue(), "the Due row must say nothing rather than guess").toBe("-");

    // Neither a relative phrase nor any other date the record carries.
    for (const invented of ["Due today", "Overdue", "Due in", "September 14, 2026", CREATED_AT_RENDERED]) {
      expect(popupText(), `undated record shows "${invented}"`).not.toContain(invented);
    }
  });
});
