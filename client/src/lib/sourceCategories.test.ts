import { describe, it, expect } from "vitest";
import { categoryCounts, isConnectedSourceDoc, CATEGORY_ORDER, type CategoryId } from "./sourceCategories";

/**
 * The "N connected" badges must reflect REAL tenant data. These pin the two ways that
 * previously went wrong: seeded/uploaded documents were invisible to every badge except
 * Tax, and the Documents badge double-counted every categorised document.
 */

const TOOL_CATEGORY: Record<string, CategoryId> = {
  metamask: "crypto",
  quickbooks: "accounting",
  gusto: "payroll",
  stripe: "payments",
};

const doc = (category: string | null, extractStatus = "extracted", rawId: string | null = "raw_1") => ({
  category,
  rawId,
  extractStatus,
});

describe("source category counts", () => {
  it("counts documents under their own category, not just Tax and Documents", () => {
    const counts = categoryCounts(
      [],
      [],
      [doc("bank"), doc("accounting"), doc("payroll"), doc("crypto"), doc("tax")],
      TOOL_CATEGORY,
    );
    expect(counts).toEqual({ bank: 1, crypto: 1, accounting: 1, payroll: 1, payments: 0, tax: 1, documents: 0 });
  });

  it("does not double-count categorised documents in the Documents bucket", () => {
    const counts = categoryCounts([], [], [doc("bank"), doc("tax")], TOOL_CATEGORY);
    expect(counts.documents).toBe(0);
  });

  it("falls back to Documents for missing or unrecognised categories", () => {
    const counts = categoryCounts([], [], [doc(null), doc("general"), doc("something-new")], TOOL_CATEGORY);
    expect(counts.documents).toBe(3);
  });

  it("adds bank items and tool connections on top of documents", () => {
    const counts = categoryCounts(
      [{ itemId: "item_1" }, { itemId: "item_2" }],
      [{ toolId: "quickbooks" }, { toolId: "unknown-tool" }],
      [doc("bank"), doc("accounting")],
      TOOL_CATEGORY,
    );
    expect(counts.bank).toBe(3);
    expect(counts.accounting).toBe(2);
  });

  it("counts a document as connected only once brain-core holds it", () => {
    expect(isConnectedSourceDoc(doc("bank", "extracted"))).toBe(true);
    expect(isConnectedSourceDoc(doc("bank", "extracting"))).toBe(true);
    expect(isConnectedSourceDoc(doc("bank", "unsupported"))).toBe(true);
    expect(isConnectedSourceDoc(doc("bank", "failed"))).toBe(false);
    expect(isConnectedSourceDoc(doc("bank", "pending", null))).toBe(false);
    expect(isConnectedSourceDoc(doc("bank", "extracted", null))).toBe(false);
  });

  it("never reports a count for a category with no live source", () => {
    const counts = categoryCounts([], [], [], TOOL_CATEGORY);
    for (const cat of CATEGORY_ORDER) expect(counts[cat]).toBe(0);
  });
});

/**
 * brain-core's connector registry (GET /v1/sources) is a fourth surface. It must add to
 * the badges without double-counting a connector we already know about locally.
 */
describe("source category counts - brain-core connector sources", () => {
  const SEEDED = [
    { type: "plaid", category: "bank" as CategoryId },
    { type: "alchemy", category: "crypto" as CategoryId },
    { type: "merge", category: "accounting" as CategoryId },
    { type: "finch", category: "payroll" as CategoryId },
    { type: "stripe", category: "payments" as CategoryId },
    { type: "email_inbound", category: "tax" as CategoryId },
  ];

  it("counts the six seeded connectors one per category", () => {
    const counts = categoryCounts([], [], [], TOOL_CATEGORY, SEEDED);
    expect(counts).toEqual({ bank: 1, crypto: 1, accounting: 1, payroll: 1, payments: 1, tax: 1, documents: 0 });
  });

  it("stays backward compatible - omitting the argument changes nothing", () => {
    expect(categoryCounts([], [{ toolId: "stripe" }], [doc("bank")], TOOL_CATEGORY)).toEqual(
      categoryCounts([], [{ toolId: "stripe" }], [doc("bank")], TOOL_CATEGORY, []),
    );
  });

  it("adds on top of local banks, tools and documents", () => {
    const counts = categoryCounts(
      [],
      [{ toolId: "quickbooks" }],
      [doc("tax")],
      TOOL_CATEGORY,
      [{ type: "finch", category: "payroll" }],
    );
    expect(counts.accounting).toBe(1);
    expect(counts.tax).toBe(1);
    expect(counts.payroll).toBe(1);
  });

  it("does not double-count a connector that is already a local tool connection", () => {
    const counts = categoryCounts([], [{ toolId: "stripe" }], [], TOOL_CATEGORY, [
      { type: "stripe", category: "payments" },
    ]);
    expect(counts.payments).toBe(1);
  });

  it("does not double-count an upstream plaid source when local bank items exist", () => {
    const counts = categoryCounts([{ itemId: "item_1" }], [], [], TOOL_CATEGORY, [
      { type: "plaid", category: "bank" },
    ]);
    expect(counts.bank).toBe(1);
  });

  it("still counts an upstream plaid source when there are no local bank items", () => {
    const counts = categoryCounts([], [], [], TOOL_CATEGORY, [{ type: "plaid", category: "bank" }]);
    expect(counts.bank).toBe(1);
  });
});
