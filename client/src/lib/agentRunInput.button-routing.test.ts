/**
 * Source-scan guard for missing-evidence button labels and navigation paths.
 *
 * #178 — Confirm the 'Add Banking Info' and 'Find Transaction' buttons actually
 *   land users on the right page. Every missing-evidence field type maps to a
 *   human-readable label and a navigation path. This test pins both so a rename
 *   or path change fails here instead of landing users on NotFound or the wrong
 *   section.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inputRowActionLabel, inputRowFixPath } from "./agentRunInput";

const AGENT_RUN_INPUT = "client/src/lib/agentRunInput.ts";

// ─── Label contract ───────────────────────────────────────────────────────────

describe("inputRowActionLabel button labels (#178)", () => {
  it("bank_account → 'Add Banking Info'", () => {
    expect(inputRowActionLabel("bank_account")).toBe("Add Banking Info");
  });

  it("transaction_record → 'Find Transaction'", () => {
    expect(inputRowActionLabel("transaction_record")).toBe("Find Transaction");
  });

  it("transaction → 'Find Transaction' (alias)", () => {
    expect(inputRowActionLabel("transaction")).toBe("Find Transaction");
  });

  it("payment_method → 'Add Payment Method'", () => {
    expect(inputRowActionLabel("payment_method")).toBe("Add Payment Method");
  });

  it("payment_destination → 'Add Payment Info'", () => {
    expect(inputRowActionLabel("payment_destination")).toBe("Add Payment Info");
  });

  it("unknown field → 'Resolve' (safe fallback, never crashes)", () => {
    expect(inputRowActionLabel("completely_unknown_field_xyz")).toBe("Resolve");
    expect(inputRowActionLabel(undefined)).toBe("Resolve");
  });
});

// ─── Path contract ────────────────────────────────────────────────────────────

describe("inputRowFixPath navigation paths (#178)", () => {
  const item = (
    missingField: string,
    entityRefs: string[] = [],
  ) => ({
    id: "evt_test",
    runId: null,
    attemptedAction: null,
    agentKey: null,
    agentName: null,
    triggerEvent: null,
    missingFields: [missingField],
    entityRefs,
    createdAt: "2026-01-01T00:00:00Z",
  });

  it("bank_account → /settings?section=sources (add/link a bank account)", () => {
    const path = inputRowFixPath(item("bank_account"));
    expect(path).toBe("/settings?section=sources");
  });

  it("payment_method → /settings?section=billing (add a card)", () => {
    const path = inputRowFixPath(item("payment_method"));
    expect(path).toBe("/settings?section=billing");
  });

  it("transaction_record with no entityRefs → /ledger?tab=cash-flow (tab only)", () => {
    const path = inputRowFixPath(item("transaction_record", []));
    expect(path).toBe("/ledger?tab=cash-flow");
  });

  it("transaction_record with a txn_ ref → appends &tx= so popup opens on the right row", () => {
    const path = inputRowFixPath(item("transaction_record", ["txn_01MNOPQR"]));
    expect(path).toContain("tab=cash-flow");
    expect(path).toContain("tx=txn_01MNOPQR");
  });

  it("transaction with a non-txn_ ref → falls back to the first entityRef", () => {
    const path = inputRowFixPath(item("transaction", ["acct_ABC"]));
    expect(path).toContain("tab=cash-flow");
    expect(path).toContain("tx=acct_ABC");
  });

  it("invoice → /ledger?tab=payables", () => {
    expect(inputRowFixPath(item("invoice"))).toBe("/ledger?tab=payables");
  });

  it("balance / account_balance → /ledger?tab=accounts", () => {
    expect(inputRowFixPath(item("balance"))).toBe("/ledger?tab=accounts");
    expect(inputRowFixPath(item("account_balance"))).toBe("/ledger?tab=accounts");
  });

  it("counterparty with a cp_ ref → counterparty panel with vendor param", () => {
    const path = inputRowFixPath(item("counterparty", ["cp_ABC123"]));
    expect(path).toContain("tab=counterparties");
    expect(path).toContain("vendor=cp_ABC123");
  });

  it("unknown field → /settings?section=audit (safe catch-all, never /404)", () => {
    const path = inputRowFixPath(item("completely_unknown"));
    expect(path).toBe("/settings?section=audit");
  });
});

// ─── Source integrity ─────────────────────────────────────────────────────────

describe("inputRowFixPath source integrity (#178)", () => {
  it("bank_account path target (/settings?section=sources) is in the source", () => {
    const src = readFileSync(AGENT_RUN_INPUT, "utf8");
    expect(src).toMatch(/settings.*section=sources/);
  });

  it("transaction path target (/ledger?tab=cash-flow) is in the source", () => {
    const src = readFileSync(AGENT_RUN_INPUT, "utf8");
    expect(src).toMatch(/ledger.*tab=cash-flow/);
  });

  it("&tx= param is appended to the transaction path when a ref is available", () => {
    const src = readFileSync(AGENT_RUN_INPUT, "utf8");
    expect(src).toMatch(/tx=.*encodeURIComponent|encodeURIComponent.*tx=/);
  });
});
