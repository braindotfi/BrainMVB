// @vitest-environment jsdom
/**
 * End-to-end behavioral tests for the ?tx= deep-link in FinancesPage.
 *
 * The 'Find Transaction' button navigates to /ledger?tab=cash-flow&tx=<id>.
 * FinancesPage reads that param, sets openTxId, and renders the real
 * TransactionDetailPopup with that id.  The popup finds the matching
 * transaction in the query cache and renders its label.
 *
 * This test confirms the full chain:
 *   URL ?tx=<id>  →  FinancesPage useEffect  →  openTxId state  →
 *   TransactionDetailPopup txId prop  →  label rendered in the DOM
 *
 * Two fixtures with distinct labels are supplied so the assertion proves
 * the specific row was selected, not just that some popup appeared.
 * TransactionDetailPopup is NOT stubbed — the real component runs.
 *
 * Pattern: createRoot + act (matches MonthlyBreakdownCard.test.tsx /
 * accountSwitchIdentity.test.tsx in this codebase).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import React from "react";

// ── fixtures ──────────────────────────────────────────────────────────────────

const TX_TARGET = {
  id: "txn_target_end2end",
  amount: "2500",
  currency: "USD",
  direction: "inflow" as const,
  transaction_date: "2026-08-01T00:00:00.000Z",
  description_normalized: "Brightline Invoice Payment",
};

const TX_OTHER = {
  id: "txn_other_end2end",
  amount: "400",
  currency: "USD",
  direction: "outflow" as const,
  transaction_date: "2026-08-02T00:00:00.000Z",
  description_normalized: "Office Supplies Acme",
};

// ── mutable harness state ─────────────────────────────────────────────────────

let mockSearch = "";
const mockNavigate = vi.fn();

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  useLocation: () => ["/ledger", mockNavigate],
  useSearch: () => mockSearch,
}));

/**
 * queryKey-aware useQuery stub used by BOTH FinancesPage and
 * TransactionDetailPopup (which is NOT mocked — it runs for real).
 */
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({
    queryKey,
    enabled,
  }: {
    queryKey: unknown[];
    enabled?: boolean;
  }) => {
    if (enabled === false) return { data: undefined };
    const key = String(queryKey[0]);
    if (key === "/api/brain/ledger/transactions") {
      return { data: { transactions: [TX_TARGET, TX_OTHER] }, isLoading: false, isError: false };
    }
    if (key === "/api/brain/ledger/accounts") {
      return { data: { accounts: [] }, isLoading: false, isError: false };
    }
    if (key === "/api/brain/ledger/counterparties") {
      return { data: { counterparties: [] }, isLoading: false, isError: false };
    }
    return { data: undefined, isLoading: false, isError: false };
  },
}));

vi.mock("@/lib/useCurrency", () => ({
  useCurrency: () => ({ format: (n: unknown) => `$${Number(n).toFixed(2)}` }),
}));

// Heavy tab/panel components are stubs — their internal queries don't matter.
vi.mock("@/components/CashFlowTab",    () => ({ CashFlowTab:    () => null }));
vi.mock("@/components/PayablesTab",    () => ({ PayablesTab:    () => null }));
vi.mock("@/components/ReceivablesTab", () => ({ ReceivablesTab: () => null }));
vi.mock("@/pages/VendorsPanel",        () => ({ VendorsPanel:   () => null }));
vi.mock("@/pages/RulesPanel",          () => ({ RulesPanel:     () => null }));
vi.mock("@/components/LedgerWidgets",  () => ({
  WidgetCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/LedgerRecordRow",   () => ({ LedgerRecordRow: () => null }));
vi.mock("@/components/AccountDetailPopup",() => ({ AccountDetailPopup: () => null }));
vi.mock("@/components/Callout",           () => ({ UnavailableDataBox: () => null }));
vi.mock("@/lib/brainAccounts", () => ({
  ACCOUNT_KIND_LABEL: {},
  isCashAccount: () => false,
}));
vi.mock("@/assets/figma-icons", () => ({ ICONS: { activity_dot: "" } }));

// TransactionDetailPopup is NOT mocked — the real component is used.

// ── real imports ──────────────────────────────────────────────────────────────

import { FinancesPage } from "@/pages/FinancesPage";

// ── test infrastructure ───────────────────────────────────────────────────────

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<FinancesPage />); });
}

/** Flush all pending passive effects (useEffect). */
const flushEffects = () => act(() => {});

beforeEach(() => {
  mockSearch = "";
  mockNavigate.mockClear();
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  // Clear any Radix portals attached to body.
  document.body.querySelectorAll("[data-radix-portal]").forEach((el) => el.remove());
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** TransactionDetailPopup renders its label in a Radix portal on document.body. */
const labelEl = () =>
  document.body.querySelector<HTMLElement>('[data-testid="text-transaction-label"]');

// ── tests ─────────────────────────────────────────────────────────────────────

describe("FinancesPage — ?tx= deep-link opens the correct transaction row", () => {
  it("renders the target transaction's label when ?tx=txn_target_end2end", () => {
    mockSearch = "?tab=cash-flow&tx=txn_target_end2end";
    mount();
    flushEffects();

    const label = labelEl();
    expect(
      label,
      "[data-testid='text-transaction-label'] not found — popup did not open after ?tx= param",
    ).not.toBeNull();
    expect(label!.textContent).toBe("Brightline Invoice Payment");
    // The other record must NOT appear — selection is id-specific.
    expect(document.body.textContent).not.toContain("Office Supplies Acme");
  });

  it("renders the other transaction's label when ?tx=txn_other_end2end (not the first record)", () => {
    // Proves the wiring resolves by id, not by position in the list.
    mockSearch = "?tab=cash-flow&tx=txn_other_end2end";
    mount();
    flushEffects();

    const label = labelEl();
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("Office Supplies Acme");
    expect(document.body.textContent).not.toContain("Brightline Invoice Payment");
  });

  it("does not open the popup when ?tx= is absent from the URL", () => {
    mockSearch = "?tab=cash-flow";
    mount();
    flushEffects();

    expect(
      labelEl(),
      "popup appeared without a ?tx= param",
    ).toBeNull();
  });

  it("closes the popup and removes ?tx= from the URL when onClose fires", () => {
    mockSearch = "?tab=cash-flow&tx=txn_target_end2end";
    mount();
    flushEffects();

    // Popup is open.
    expect(labelEl()).not.toBeNull();

    // Dismiss via the real close button rendered by TransactionDetailPopup.
    const closeBtn = document.body.querySelector<HTMLElement>(
      '[data-testid="button-close-transaction-popup"]',
    );
    expect(closeBtn, "close button not found in popup").not.toBeNull();
    act(() => {
      closeBtn!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // closeTx must call navigate() without the tx param so the useEffect
    // cannot immediately reopen the popup.
    expect(mockNavigate).toHaveBeenCalled();
    const calledWith = String(mockNavigate.mock.calls[0][0]);
    expect(calledWith).not.toContain("tx=");
  });
});
