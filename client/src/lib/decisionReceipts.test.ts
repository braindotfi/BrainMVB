import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordDecisionReceipt,
  clearDecisionReceipt,
  decisionReceipts,
  resetDecisionReceipts,
  setDecisionReceiptScope,
  receiptSupersededByAudit,
  RECEIPT_MAX_AGE_MS,
  type DecisionReceipt,
} from "./decisionReceipts";

/**
 * Decision receipts are the only thing standing between "brain-core confirmed
 * your approval" and "the audit feed has published it". While that gap is open
 * the receipt IS the Resolved row, so the invariants pinned here are the ones
 * that decide whether an operator can trust what the Inbox shows: a receipt is
 * never written for an unconfirmed decision, never leaks into another account,
 * never outlives an undo, and always yields to the real audit record.
 */

function store(): Record<string, string> {
  return (globalThis as unknown as { __session: Record<string, string> }).__session;
}

beforeEach(() => {
  const backing: Record<string, string> = {};
  (globalThis as unknown as { __session: Record<string, string> }).__session = backing;
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => { backing[k] = v; },
    removeItem: (k: string) => { delete backing[k]; },
  });
  setDecisionReceiptScope(null);
});

afterEach(() => {
  setDecisionReceiptScope(null);
  vi.unstubAllGlobals();
});

function receipt(overrides: Partial<DecisionReceipt> = {}): DecisionReceipt {
  return {
    proposalId: "prop_01ABC",
    decision: "approve",
    status: "approved",
    auditId: "aud_01",
    paymentIntentId: null,
    decidedAtMs: Date.now(),
    title: "Pay Brightline Systems invoice",
    ...overrides,
  };
}

describe("decision receipt scoping", () => {
  it("keeps one account's decisions out of another's, across an in-place switch", () => {
    /* The app is a single page: switching accounts does not remount modules, so
       a store that is merely "cleared on logout" replays the previous
       operator's approvals into the next one's Resolved list. Scoping by user
       id is what actually prevents that. */
    setDecisionReceiptScope("user-a");
    recordDecisionReceipt(receipt({ proposalId: "prop_a", title: "A's approval" }));
    expect(decisionReceipts().map((r) => r.proposalId)).toEqual(["prop_a"]);

    setDecisionReceiptScope("user-b");
    expect(decisionReceipts()).toEqual([]);

    setDecisionReceiptScope("user-a");
    expect(decisionReceipts().map((r) => r.proposalId)).toEqual(["prop_a"]);
  });

  it("survives a session bootstrap that re-points the store at the same user", () => {
    /* The reset funnel runs on every page load. Clearing there (rather than
       re-pointing) would drop exactly the receipts whose audit events have not
       landed yet — the ones the store exists for. */
    setDecisionReceiptScope("user-a");
    recordDecisionReceipt(receipt({ proposalId: "prop_a" }));
    setDecisionReceiptScope("user-a");
    expect(decisionReceipts().map((r) => r.proposalId)).toEqual(["prop_a"]);
  });

  it("writes nothing at all when no account is signed in", () => {
    recordDecisionReceipt(receipt());
    expect(decisionReceipts()).toEqual([]);
    expect(Object.keys(store())).toEqual([]);
  });
});

describe("recording and retiring receipts", () => {
  beforeEach(() => setDecisionReceiptScope("user-a"));

  it("replaces an earlier receipt for the same proposal instead of stacking a second one", () => {
    recordDecisionReceipt(receipt({ decision: "approve", decidedAtMs: 1_000 }));
    recordDecisionReceipt(receipt({ decision: "reject", status: "rejected", decidedAtMs: 2_000 }));

    const all = decisionReceipts();
    expect(all).toHaveLength(1);
    expect(all[0].decision).toBe("reject");
  });

  it("drops the receipt when a decision is undone", () => {
    /* Undo reopens the proposal. A receipt left behind would put the same
       record in Unresolved and Resolved at the same time. */
    recordDecisionReceipt(receipt({ proposalId: "prop_a" }));
    clearDecisionReceipt("prop_a");
    expect(decisionReceipts()).toEqual([]);
  });

  it("ignores an undo for a proposal it never receipted", () => {
    recordDecisionReceipt(receipt({ proposalId: "prop_a" }));
    clearDecisionReceipt("prop_other");
    expect(decisionReceipts().map((r) => r.proposalId)).toEqual(["prop_a"]);
  });

  it("expires a receipt the audit trail never caught up with", () => {
    /* Past this age the receipt is the only thing asserting the outcome, and
       nothing can confirm it. Showing it indefinitely would be a claim the page
       cannot back. */
    recordDecisionReceipt(receipt({ decidedAtMs: Date.now() - RECEIPT_MAX_AGE_MS - 1 }));
    setDecisionReceiptScope(null);
    setDecisionReceiptScope("user-a");
    expect(decisionReceipts()).toEqual([]);
  });

  it("discards persisted entries that are not shaped like receipts", () => {
    store()["brain_decision_receipts_user-a"] = JSON.stringify([{ nope: true }, receipt()]);
    setDecisionReceiptScope(null);
    setDecisionReceiptScope("user-a");
    expect(decisionReceipts()).toHaveLength(1);
  });

  it("clears everything, including the persisted copy, on reset", () => {
    recordDecisionReceipt(receipt());
    resetDecisionReceipts();
    expect(decisionReceipts()).toEqual([]);
    expect(store()["brain_decision_receipts_user-a"]).toBeUndefined();
  });

  it("keeps working when sessionStorage refuses to write", () => {
    /* Private mode / quota. The receipt still has to hold for this session —
       that is its entire lifetime anyway. */
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
      removeItem: () => {},
    });
    setDecisionReceiptScope("user-c");
    recordDecisionReceipt(receipt({ proposalId: "prop_c" }));
    expect(decisionReceipts().map((r) => r.proposalId)).toEqual(["prop_c"]);
  });
});

describe("receiptSupersededByAudit", () => {
  const none = { auditIdentity: new Set<string>(), decidedProposalRefs: new Set<string>() };

  it("yields to the audit record with the same audit id", () => {
    expect(
      receiptSupersededByAudit(receipt({ auditId: "aud_01" }), {
        auditIdentity: new Set(["aud_01"]),
        decidedProposalRefs: new Set(),
      }),
    ).toBe(true);
  });

  it("yields to a decided audit record for the same proposal when no audit id was returned", () => {
    expect(
      receiptSupersededByAudit(receipt({ auditId: null }), {
        auditIdentity: new Set(),
        decidedProposalRefs: new Set(["prop_01ABC"]),
      }),
    ).toBe(true);
  });

  it("stays visible while the audit feed knows nothing about the decision", () => {
    /* This is the whole point: between confirmation and publication the receipt
       is the only record of the decision anywhere on the page. */
    expect(receiptSupersededByAudit(receipt(), none)).toBe(false);
  });

  it("is not retired by an unrelated proposal's decision", () => {
    expect(
      receiptSupersededByAudit(receipt({ auditId: null }), {
        auditIdentity: new Set(["aud_other"]),
        decidedProposalRefs: new Set(["prop_other"]),
      }),
    ).toBe(false);
  });
});
