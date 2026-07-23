/**
 * askWikiQuestion answer normalization.
 *
 * A null/absent/degenerate wiki answer must yield raw === "" — never the
 * stringified response envelope (which always contains meaningful scalars
 * like usage tokens and the question echo, and would trick the summarizer
 * into asking the user to paste JSON). Evidence extraction from the envelope
 * must still work even when the answer is empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { askWikiQuestion } from "./client";

function mockWikiResponse(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    })),
  );
}

describe("askWikiQuestion raw answer normalization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answer === null → raw is empty (never the stringified envelope)", async () => {
    mockWikiResponse({
      answer: null,
      model: "claude-x",
      usage: { input_tokens: 120, output_tokens: 0 },
      question: "how many transactions?",
    });
    const out = await askWikiQuestion("tok", "how many transactions?");
    expect(out.raw).toBe("");
  });

  it("answer absent → raw is empty", async () => {
    mockWikiResponse({ model: "claude-x", usage: { input_tokens: 5 } });
    const out = await askWikiQuestion("tok", "q");
    expect(out.raw).toBe("");
  });

  it('answer = {"summary": null} (degenerate object) → raw is empty', async () => {
    mockWikiResponse({ answer: { summary: null }, model: "claude-x" });
    const out = await askWikiQuestion("tok", "q");
    expect(out.raw).toBe("");
  });

  it("meaningful string answer passes through", async () => {
    mockWikiResponse({ answer: "You have 19 transactions", model: "claude-x" });
    const out = await askWikiQuestion("tok", "q");
    expect(out.raw).toBe("You have 19 transactions");
  });

  it("meaningful object answer is stringified and passes through", async () => {
    mockWikiResponse({ answer: { count: 19 }, model: "claude-x" });
    const out = await askWikiQuestion("tok", "q");
    expect(out.raw).toBe(JSON.stringify({ count: 19 }));
  });

  it("envelope evidence is still extracted when the answer is empty", async () => {
    mockWikiResponse({
      answer: null,
      evidence: [{ entityType: "transaction", entityId: "txn_1", excerpt: "coffee" }],
      evidence_ids: ["txn_2"],
      confidence: 0.9,
    });
    const out = await askWikiQuestion("tok", "q");
    expect(out.raw).toBe("");
    expect(out.evidenceIds).toEqual(["txn_1", "txn_2"]);
    expect(out.evidence[0]).toEqual({ entityType: "transaction", entityId: "txn_1", excerpt: "coffee" });
    expect(out.confidence).toBe(0.9);
  });
});
