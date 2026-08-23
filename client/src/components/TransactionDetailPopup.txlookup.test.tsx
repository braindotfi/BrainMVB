// @vitest-environment jsdom
/**
 * Behavioral tests for TransactionDetailPopup — "opens the correct row".
 *
 * The 'Find Transaction' deep-link hands a raw entity-ref to the popup as
 * `txId`. The popup must find and show THAT specific transaction from the
 * list — not another record that happens to be in the feed, and not the
 * "isn't in your recent transactions" fallback. These tests supply two
 * records with distinct labels and assert that deep-linking to one shows
 * ONLY that record's label, proving the id→row resolution is correct.
 *
 * Pattern follows MonthlyBreakdownCard.test.tsx (same jsdom + createRoot harness).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import React from "react";

// ── fixtures ──────────────────────────────────────────────────────────────────

const TX_TARGET = {
  id: "txn_target_001",
  amount: "1500",
  currency: "USD",
  direction: "inflow" as const,
  transaction_date: "2026-08-01T00:00:00.000Z",
  description_normalized: "Target Payment from Brightline",
};

const TX_OTHER = {
  id: "txn_other_002",
  amount: "300",
  currency: "USD",
  direction: "outflow" as const,
  transaction_date: "2026-08-02T00:00:00.000Z",
  description_normalized: "Other Vendor Payment",
};

// ── mocks ─────────────────────────────────────────────────────────────────────

/**
 * queryKey-aware useQuery stub.
 * Returns both transactions for the transactions query; empty lists elsewhere.
 * Respects `enabled: false` so the popup doesn't query when txId is null.
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
      return { data: { transactions: [TX_TARGET, TX_OTHER] } };
    }
    if (key === "/api/brain/ledger/accounts") {
      return { data: { accounts: [] } };
    }
    if (key === "/api/brain/ledger/counterparties") {
      return { data: { counterparties: [] } };
    }
    return { data: undefined };
  },
}));

vi.mock("@/lib/useCurrency", () => ({
  useCurrency: () => ({ format: (n: unknown) => `$${Number(n).toFixed(2)}` }),
}));

// ── test harness ──────────────────────────────────────────────────────────────

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { TransactionDetailPopup } from "@/components/TransactionDetailPopup";

let container: HTMLDivElement;
let root: Root;

function mount(ui: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<>{ui}</>); });
}

const flushEffects = () => act(() => {});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  // Clear any Radix portals left in body.
  document.body.querySelectorAll("[data-radix-portal]").forEach((el) => el.remove());
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** The label element rendered by TransactionDetailPopup when a tx is found. */
const labelEl = () =>
  document.body.querySelector<HTMLElement>('[data-testid="text-transaction-label"]');

// ── tests ─────────────────────────────────────────────────────────────────────

describe("TransactionDetailPopup — id→row selection", () => {
  it("renders the target transaction's label when deep-linked to txn_target_001", () => {
    mount(
      <TransactionDetailPopup
        txId="txn_target_001"
        onClose={() => {}}
        onSelectTransaction={() => {}}
      />,
    );
    flushEffects();

    const label = labelEl();
    expect(label, "[data-testid='text-transaction-label'] not found — popup did not open").not.toBeNull();
    expect(label!.textContent).toBe("Target Payment from Brightline");
    // Must not contain the OTHER transaction's label — selection must be exact.
    expect(document.body.textContent).not.toContain("Other Vendor Payment");
  });

  it("renders the other transaction's label when deep-linked to txn_other_002 (not the target)", () => {
    mount(
      <TransactionDetailPopup
        txId="txn_other_002"
        onClose={() => {}}
        onSelectTransaction={() => {}}
      />,
    );
    flushEffects();

    const label = labelEl();
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("Other Vendor Payment");
    // Confirms selection is id-driven: it must never show the target row.
    expect(document.body.textContent).not.toContain("Target Payment from Brightline");
  });

  it("shows the fallback when the id does not match any transaction in the feed", () => {
    mount(
      <TransactionDetailPopup
        txId="txn_not_in_feed"
        onClose={() => {}}
        onSelectTransaction={() => {}}
      />,
    );
    flushEffects();

    // The fallback is a "not in your recent transactions" message.
    expect(document.body.textContent).toContain("isn't in your recent transactions");
    // The label element is only rendered when a matching tx is found.
    expect(labelEl()).toBeNull();
  });

  it("does not render any transaction content when txId is null (popup is closed)", () => {
    mount(
      <TransactionDetailPopup
        txId={null}
        onClose={() => {}}
        onSelectTransaction={() => {}}
      />,
    );
    flushEffects();

    expect(labelEl()).toBeNull();
    // The closed popup must not show either transaction's label.
    expect(document.body.textContent).not.toContain("Target Payment from Brightline");
    expect(document.body.textContent).not.toContain("Other Vendor Payment");
  });
});
