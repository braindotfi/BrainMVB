import { describe, it, expect, beforeEach } from "vitest";
import {
  acknowledgeInsight,
  acknowledgedInsightIds,
  acknowledgedRecordsSnapshot,
  resetAcknowledgedStore,
  subscribeToAcknowledgedRecords,
} from "./acknowledgedStore";
import { applyUserScopedResets } from "./authContext";
import { isDemoDataEnabled } from "./demoMode";
import type { LiveInsight } from "./brainAgentSurfaces";
import type { AuthUser } from "./authContext";

function insight(id: string, title: string): LiveInsight {
  return { id, kind: "cashflow", itemKind: "detection", badge: "Detected", title };
}

const DEMO_USER: AuthUser = { id: "u-demo", email: "demo@brain.fi", isDemo: true };
const FRESH_USER: AuthUser = { id: "u-fresh", email: "demo-fresh-abc@brain.fi", isDemo: true };
const REAL_USER: AuthUser = { id: "u-real", email: "someone@example.com" };

beforeEach(() => {
  resetAcknowledgedStore();
});

describe("acknowledgedStore", () => {
  it("records an acknowledged insight", () => {
    acknowledgeInsight(insight("cashflow-usd", "Trailing cash flow (USD)"));

    expect(acknowledgedInsightIds().has("cashflow-usd")).toBe(true);
    expect(acknowledgedRecordsSnapshot().map((r) => r.summary)).toEqual([
      "Acknowledged: Trailing cash flow (USD)",
    ]);
  });

  it("clears every record on reset", () => {
    acknowledgeInsight(insight("cashflow-usd", "Trailing cash flow (USD)"));
    acknowledgeInsight(insight("recon-1", "Unmatched payment"));

    resetAcknowledgedStore();

    expect(acknowledgedRecordsSnapshot()).toEqual([]);
    expect(acknowledgedInsightIds().size).toBe(0);
  });

  it("notifies subscribers on reset so a mounted Audit Log re-renders empty", () => {
    acknowledgeInsight(insight("cashflow-usd", "Trailing cash flow (USD)"));
    let notified = 0;
    const unsubscribe = subscribeToAcknowledgedRecords(() => {
      notified += 1;
    });

    resetAcknowledgedStore();

    expect(notified).toBe(1);
    // What the hook would hand the Audit Log on that re-render.
    expect(acknowledgedRecordsSnapshot()).toEqual([]);
    unsubscribe();
  });

  it("does not notify subscribers when already empty", () => {
    let notified = 0;
    const unsubscribe = subscribeToAcknowledgedRecords(() => {
      notified += 1;
    });

    resetAcknowledgedStore();

    expect(notified).toBe(0);
    unsubscribe();
  });
});

/* The actual bug: this is a single-page app, so switching accounts never
   remounts acknowledgedStore. A record acknowledged by one account used to
   render in the next account's Audit Log as activity it never had. */
describe("acknowledgedStore does not leak across auth transitions", () => {
  it("is empty after switching from one account to a different account", () => {
    applyUserScopedResets(DEMO_USER);
    acknowledgeInsight(insight("cashflow-usd", "Trailing cash flow (USD)"));
    expect(acknowledgedInsightIds().size).toBe(1);

    // Account → account, without a hard reload. Note this path never calls
    // logout(), which is why wiring the reset there alone missed it.
    applyUserScopedResets(FRESH_USER);

    expect(acknowledgedRecordsSnapshot()).toEqual([]);
    expect(acknowledgedInsightIds().size).toBe(0);
  });

  it("is empty after logout", () => {
    applyUserScopedResets(DEMO_USER);
    acknowledgeInsight(insight("cashflow-usd", "Trailing cash flow (USD)"));

    applyUserScopedResets(null);

    expect(acknowledgedRecordsSnapshot()).toEqual([]);
    expect(acknowledgedInsightIds().size).toBe(0);
  });

  it("is empty when a demo account is followed by a real account", () => {
    applyUserScopedResets(DEMO_USER);
    acknowledgeInsight(insight("cashflow-usd", "Trailing cash flow (USD)"));

    applyUserScopedResets(REAL_USER);

    expect(acknowledgedRecordsSnapshot()).toEqual([]);
  });

  it("still points the demo-data gate at the signed-in user", () => {
    // Both resets must stay in the one funnel: a future edit that drops either
    // effect should fail here rather than silently re-open one of the leaks.
    applyUserScopedResets(DEMO_USER);
    expect(isDemoDataEnabled()).toBe(true);

    applyUserScopedResets(REAL_USER);
    expect(isDemoDataEnabled()).toBe(false);

    applyUserScopedResets(null);
    expect(isDemoDataEnabled()).toBe(false);
  });
});
