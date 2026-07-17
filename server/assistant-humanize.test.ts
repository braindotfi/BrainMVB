import { describe, it, expect } from "vitest";
import { looksLikeStructuredJson } from "./routes";

/**
 * Guards the /api/assistant/chat JSON-leak bug: brain-core's wiki/question
 * sometimes answers with structured JSON (e.g. a cash-flow forecast) instead
 * of prose. This detector decides when that JSON needs to be humanized
 * before it reaches the chat UI.
 */
describe("looksLikeStructuredJson", () => {
  it("detects the confirmed forecast JSON blob", () => {
    const raw = JSON.stringify({
      answer: {
        forecasted_cash_flow: [{ date: "2026-02-10", amount: 48000 }],
        total_forecasted_cash_flow: 624000,
      },
      evidence_ids: ["tx_1", "tx_2"],
    });
    expect(looksLikeStructuredJson(raw)).toBe(true);
  });

  it("returns false for plain prose", () => {
    expect(looksLikeStructuredJson("Your operating cash balance is $42,000.")).toBe(false);
  });

  it("returns false for a bare number string", () => {
    expect(looksLikeStructuredJson("624000")).toBe(false);
  });
});
