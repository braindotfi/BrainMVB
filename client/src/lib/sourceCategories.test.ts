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
