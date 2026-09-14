// @vitest-environment jsdom
/**
 * Payables on a MIXED-CURRENCY ledger: the row, the popup it opens, and the running
 * total have to agree — or abstain.
 *
 * The defect this pins: the row amount went through `useCurrency().format`, which
 * converts as if its input were USD. A EUR bill therefore rendered as a dollar figure
 * in the list while the popup behind that very row quoted euros, and the total beneath
 * added the two together. Today's demo tenant is USD-only, so nothing looked wrong —
 * it would have landed as a wrong number, silently, on the first tenant to record a
 * bill in another currency. That tenant is what this file is.
 *
 * Rendered rather than unit-tested because the agreement is between two SURFACES. A
 * test of the formatter alone passes happily while a component keeps calling the other
 * one, which is exactly the state this repo was in.
 *
 * Pattern: createRoot + act, with a queryKey-aware useQuery stub — the same harness as
 * FinancesPage.txParam.test.tsx.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import React from "react";
import type { RawObligation } from "@/lib/brainObligations";

// ── fixtures ──────────────────────────────────────────────────────────────────

/* Two dollar bills and one euro bill. The euro amount is deliberately large enough
   that a cross-currency total (13,894.63) could not be mistaken for the dollar
   subtotal (5,000.00), and large enough that converting it at the app's EUR rate
   (0.92) would also produce a distinct, plausible-looking number. */
const USD_A: RawObligation = {
  id: "ob_usd_a",
  type: "bill",
  amount_due: "4800.00000000",
  currency: "USD",
  status: "due",
  due_date: "2026-09-10",
  counterparty_id: "cp_usd",
};

const USD_B: RawObligation = {
  id: "ob_usd_b",
  type: "bill",
  amount_due: "200.00000000",
  currency: "USD",
  status: "due",
  due_date: "2026-09-11",
  counterparty_id: "cp_usd",
};

const EUR_BILL: RawObligation = {
  id: "ob_eur",
  type: "bill",
  amount_due: "8894.63000000",
  currency: "EUR",
  status: "due",
  due_date: "2026-09-12",
  counterparty_id: "cp_eur",
};

const COUNTERPARTIES = [
  { id: "cp_usd", name: "CloudOps Inc" },
  { id: "cp_eur", name: "Bergmann GmbH" },
];

// ── mutable harness state ─────────────────────────────────────────────────────

let obligations: RawObligation[] = [];
let invoices: unknown[] = [];
let readComplete = true;

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  useLocation: () => ["/ledger", vi.fn()],
  useSearch: () => "",
}));

/* The paged ledger read is stubbed; `ledgerFigureCaption` is NOT — the caption is
   half of what this file asserts. */
vi.mock("@/lib/ledgerRead", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ledgerRead")>()),
  usePagedLedgerRead: () => ({
    read: { rows: obligations, complete: readComplete },
    failed: false,
    ingesting: false,
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    if (enabled === false) return { data: undefined, isLoading: false, isError: false };
    const key = String(queryKey[0]);
    if (key === "/api/brain/ledger/counterparties") {
      return { data: { counterparties: COUNTERPARTIES }, isLoading: false, isError: false };
    }
    if (key === "/api/brain/ledger/invoices") {
      // Read, and empty by default: an unbacked payable opens the payable popup. The
      // invoice-backed case below fills this in, and gets the BILL popup instead —
      // a different component, which has to quote the same figure.
      return { data: { invoices }, isLoading: false, isError: false };
    }
    return { data: undefined, isLoading: false, isError: false };
  },
}));

// ── real imports ──────────────────────────────────────────────────────────────

import { PayablesTab } from "@/components/PayablesTab";
import { CurrencyProvider } from "@/lib/currencyContext";
import { IntentsProvider } from "@/lib/intentsStore";

// ── test infrastructure ───────────────────────────────────────────────────────

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/* Mounted inside a real CurrencyProvider with the DISPLAY currency set to euros (see
   `beforeEach`). Nothing on this surface may move because of that setting: a euro
   display turning a genuine dollar bill into "€4,416.00" is the same defect read from
   the other end. The provider is here because the popups below the tab need it, and
   keeping it real is what makes that assertion mean something. */
function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <CurrencyProvider>
        <IntentsProvider>
          <PayablesTab />
        </IntentsProvider>
      </CurrencyProvider>,
    );
  });
}

const byTestId = (id: string) =>
  document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const textOf = (id: string) => byTestId(id)?.textContent ?? "";

const click = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

beforeEach(() => {
  obligations = [USD_A, USD_B, EUR_BILL];
  invoices = [];
  readComplete = true;
  // The user is browsing in euros. Every figure below must ignore that.
  localStorage.setItem("brain_default_currency", "EUR");
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  document.body.querySelectorAll("[data-radix-portal]").forEach((el) => el.remove());
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Payables on a mixed-currency ledger", () => {
  it("quotes each row in the currency its record is denominated in", () => {
    mount();
    // Sorted by due date, so: USD 4,800 · USD 200 · EUR 8,894.63.
    expect(textOf("text-obligation-amount-0")).toBe("-$4,800.00");
    expect(textOf("text-obligation-amount-1")).toBe("-$200.00");
    // The defect: this row read "-$8,894.63" — a euro figure wearing a dollar sign.
    expect(textOf("text-obligation-amount-2")).toBe("-€8,894.63 EUR");
  });

  it("shows the euro row the same amount its popup does", () => {
    mount();
    const rowAmount = textOf("text-obligation-amount-2").replace(/^-/, "");

    const row = byTestId("row-obligation-2");
    expect(row, "the euro row did not render").not.toBeNull();
    click(row!);

    const summary = textOf("text-payable-summary");
    expect(summary, "the payable popup did not open").not.toBe("");
    // The popup's glance line leads with the amount; it must be the row's, character
    // for character. Two surfaces, one record, one figure.
    expect(summary.startsWith(rowAmount)).toBe(true);
    expect(summary).toContain("€8,894.63 EUR");
    expect(textOf("text-payable-counterparty")).toBe("Bergmann GmbH");
  });

  it("totals one currency only, and names the one it left out", () => {
    mount();
    // 4,800 + 200. NOT 13,894.63, which is dollars and euros added together, and not
    // 13,382.06 either, which is that sum run through the display converter.
    expect(textOf("text-obligation-total")).toBe("$5,000.00");
    const caption = textOf("text-obligation-total-caption");
    /* The heading and the caption both name the currency once the figure is narrower
       than the list above it: "Across everything you still owe" is a false sentence
       about a subtotal, and a disclosure in the next breath does not repair the
       claim in this one. */
    expect(textOf("text-obligation-total-label")).toBe("Payable Totals (USD)");
    expect(caption).toContain("Across everything you still owe in USD");
    expect(caption).toContain("Excludes 1 payable in EUR");
  });

  it("keeps the excluded bill VISIBLE in the list it was dropped from", () => {
    /* Narrowing the total must not narrow the list: a payable missing from both would
       be a debt the tenant has no way to see. The count in the panel header covers
       all three. */
    mount();
    expect(byTestId("row-obligation-2")).not.toBeNull();
    expect(document.body.textContent).toContain("Bergmann GmbH");
  });

  it("shows the euro row the same amount its BILL popup does, when an invoice backs it", () => {
    /* Two popups sit behind this list. A payable with no invoice opens the payable
       popup; one matched to an unpaid AP invoice opens the bill popup instead — a
       different component, with its own header, which was still converting. Same row,
       same record, different file: the agreement has to hold for both, and the match
       is inferred from counterparty + amount + due date, so this fixture mirrors the
       obligation exactly. */
    invoices = [
      {
        id: "inv_eur",
        invoice_number: "BG-2026-114",
        counterparty_id: "cp_eur",
        amount_due: "8894.63000000",
        currency: "EUR",
        due_date: "2026-09-12",
        status: "open",
      },
    ];
    mount();

    const rowAmount = textOf("text-obligation-amount-2").replace(/^-/, "");
    expect(rowAmount).toBe("€8,894.63 EUR");

    const row = byTestId("row-obligation-2");
    expect(row, "the euro row did not render").not.toBeNull();
    click(row!);

    const headline = textOf("text-bill-amount");
    expect(headline, "the bill popup did not open").not.toBe("");
    /* The header states the code in a pill of its own, so the figure omits it — but it
       is the row's figure, not a converted one. The old code read
       format(Number(amount_due)), which with the display currency on EUR quoted
       roughly €8,183 beside a "EUR" pill: a discount nobody granted. */
    expect(headline).toBe("€8,894.63");
    expect(rowAmount).toBe(`${headline} EUR`);
    // And the Amount row in the detail table, where the record is read rather than
    // scanned, spells the code out.
    expect(document.body.textContent).toContain("€8,894.63 EUR");
  });

  it("agrees with the bill popup when the invoice states no currency at all", () => {
    /* Neither feed states the code on every record, which is why the join reads an
       absent one as this ledger's default rather than as its own currency. The popup
       has to read it the same way: reading it raw put a bare "100.00" and an empty
       currency pill under a row quoting "$4,800.00" for the one debt. */
    invoices = [
      {
        id: "inv_no_currency",
        invoice_number: "CO-2026-007",
        counterparty_id: "cp_usd",
        amount_due: "4800.00000000",
        due_date: "2026-09-10",
        status: "open",
      },
    ];
    mount();

    const rowAmount = textOf("text-obligation-amount-0").replace(/^-/, "");
    expect(rowAmount).toBe("$4,800.00");

    click(byTestId("row-obligation-0")!);

    const headline = textOf("text-bill-amount");
    expect(headline, "the bill popup did not open").not.toBe("");
    expect(headline).toBe(rowAmount);
    // The pill names the currency rather than sitting empty …
    expect(textOf("text-bill-currency")).toBe("USD");
    // … and the Amount row spells it out, as it does for a stated code.
    expect(document.body.textContent).toContain("$4,800.00 USD");
  });

  it("does not open a dollar invoice from a euro row of the same size", () => {
    /* The obligation and the invoice are joined on the debt they describe, because
       brain-core exposes no reference between them. An amount with no currency beside
       it is not a debt: 8,894.63 owed to Bergmann on Sep 12 is a different obligation
       in euros than in dollars, and matching the two would open a popup for an invoice
       this tenant does not owe — with its number, its PO and its document. */
    invoices = [
      {
        id: "inv_usd_lookalike",
        invoice_number: "US-2026-001",
        counterparty_id: "cp_eur",
        amount_due: "8894.63000000",
        currency: "USD",
        due_date: "2026-09-12",
        status: "open",
      },
    ];
    mount();

    click(byTestId("row-obligation-2")!);

    // The payable popup, not the bill popup: no invoice on file for this debt.
    expect(textOf("text-payable-summary")).toContain("€8,894.63 EUR");
    expect(textOf("text-bill-amount")).toBe("");
    expect(document.body.textContent).not.toContain("US-2026-001");
  });

  it("says nothing about exclusions on a single-currency ledger", () => {
    // Every tenant today. The figure and its caption must be untouched for them.
    obligations = [USD_A, USD_B];
    mount();
    expect(textOf("text-obligation-total")).toBe("$5,000.00");
    expect(textOf("text-obligation-total-caption")).toBe("Across everything you still owe");
    // Nothing was left out, so nothing is qualified: no "(USD)" implying a distinction.
    expect(textOf("text-obligation-total-label")).toBe("Payable Totals");
  });

  it("withholds the total on a half-read ledger without hiding the rows", () => {
    /* The older contract, still standing: a cut-short read states no figure at all,
       so there is no subtotal for a currency caption to qualify. */
    readComplete = false;
    mount();
    expect(textOf("text-obligation-total")).toBe("-");
    expect(textOf("text-obligation-total-caption")).toContain("couldn't be read");
    expect(textOf("text-obligation-amount-2")).toBe("-€8,894.63 EUR");
  });
});
