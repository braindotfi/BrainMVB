import { describe, it, expect } from "vitest";
import {
  eligibleSuggestedQuestions,
  resolveSuggestionChips,
  SUGGESTED_QUESTIONS_ENDPOINT,
  type EligibleQuestion,
} from "./brainSuggestedQuestions";

/**
 * Pins the route itself. Every other test here would still pass if the hook
 * were repointed at the legacy `/assistant/questions`: that route answers
 * `200 {"questions": []}`, the parser reads `suggestions` and finds nothing,
 * and the fallback renders a healthy-looking row. The path is the one part of
 * this contract that fails silently, so it gets its own assertion.
 */
describe("SUGGESTED_QUESTIONS_ENDPOINT", () => {
  it("points at the live wiki route", () => {
    expect(SUGGESTED_QUESTIONS_ENDPOINT).toBe("/api/brain/wiki/suggested-questions");
  });

  it("is not the always-empty legacy route", () => {
    expect(SUGGESTED_QUESTIONS_ENDPOINT).not.toContain("assistant/questions");
  });
});

/**
 * These pin the promise the tenant-aware suggestion chips make:
 *
 *   1. a chip is only ever text brain-core returned for THIS tenant, so a
 *      suggestion can never again offer a capability the backend lacks;
 *   2. the order brain-core returns is the order the buttons render — core has
 *      already ranked them, so re-sorting here would override its answer;
 *   3. a tenant with nothing eligible, and a read that failed outright, both
 *      land on the vetted fallback rather than an empty row that looks broken.
 *
 * Several tests exist specifically to catch a regression back to the legacy
 * `/assistant/questions` route (`questions` field, `question`/`status` keys),
 * which parses to nothing and hides behind the fallback. See the module header.
 *
 * `resolveSuggestionChips` is mapped 1:1 onto buttons by BrainAssistant, so
 * asserting on `chips` is asserting on button order. The suite is pure by
 * necessity as well as preference: the vitest project runs in a `node`
 * environment with no testing-library, and only picks up `*.test.ts`.
 */

/** One upstream row, matching the deployed `WikiSuggestedQuestion` schema. */
const row = (over: Record<string, unknown> = {}) => ({
  intent_id: "transaction_listing",
  display_text: "Show my last 10 transactions",
  usage_rank_score: 0,
  ...over,
});

const FALLBACK = ["Show recent cash flow", "What needs attention?"] as const;

describe("eligibleSuggestedQuestions", () => {
  it("reads the real payload shape returned by the live tenant", () => {
    /* Captured verbatim from GET /api/brain/wiki/suggested-questions. */
    const out = eligibleSuggestedQuestions({
      suggestions: [
        { intent_id: "transaction_listing", display_text: "Show my last 10 transactions", usage_rank_score: 0 },
        { intent_id: "cash_flow_listing", display_text: "Show recent cash flow", usage_rank_score: 0 },
      ],
    });

    expect(out).toEqual<EligibleQuestion[]>([
      { id: "transaction_listing", question: "Show my last 10 transactions" },
      { id: "cash_flow_listing", question: "Show recent cash flow" },
    ]);
  });

  it("ignores the legacy route's payload entirely", () => {
    /* /assistant/questions returns {questions:[{question,status,...}]}. If the
       hook is ever repointed back at it, this must yield nothing rather than
       quietly half-working. */
    const out = eligibleSuggestedQuestions({
      questions: [
        { id: "aq_1", question: "Legacy row", status: "suggested" },
        { id: "aq_2", question: "Another legacy row", status: "suggested" },
      ],
    });

    expect(out).toEqual([]);
  });

  it("preserves upstream order verbatim — core already ranked them", () => {
    /* Deliberately reverse-alphabetical, so any stray .sort() on the text
       reorders this and fails. */
    const out = eligibleSuggestedQuestions({
      suggestions: [
        row({ intent_id: "transaction_count", display_text: "Zulu ranked first" }),
        row({ intent_id: "transaction_sum", display_text: "Alpha ranked second" }),
        row({ intent_id: "invoice_listing", display_text: "Mike ranked third" }),
      ],
    });

    expect(out.map((q) => q.question)).toEqual([
      "Zulu ranked first",
      "Alpha ranked second",
      "Mike ranked third",
    ]);
  });

  it("never reorders by usage_rank_score", () => {
    /* usage_rank_score is core's INPUT to a ranking it has already applied, not
       the rank itself. Scores here ascend against the returned order: a client
       sort (either direction) would move something. */
    const out = eligibleSuggestedQuestions({
      suggestions: [
        row({ intent_id: "transaction_count", display_text: "First despite lowest count", usage_rank_score: 0 }),
        row({ intent_id: "transaction_sum", display_text: "Second", usage_rank_score: 7 }),
        row({ intent_id: "invoice_listing", display_text: "Third despite highest count", usage_rank_score: 99 }),
      ],
    });

    expect(out.map((q) => q.question)).toEqual([
      "First despite lowest count",
      "Second",
      "Third despite highest count",
    ]);
  });

  it("does not apply a client-side eligibility rule — core pre-filters", () => {
    /* There is no status field in this schema. A row carrying an unrelated
       status-looking value must still render; suppressing it here would
       re-hide a suggestion core explicitly cleared. */
    const out = eligibleSuggestedQuestions({
      suggestions: [
        row({ intent_id: "transaction_count", display_text: "Eligible per core", status: "dismissed" }),
      ],
    });

    expect(out.map((q) => q.question)).toEqual(["Eligible per core"]);
  });

  it("keys on intent_id so React keys survive a reorder", () => {
    const out = eligibleSuggestedQuestions({
      suggestions: [
        row({ intent_id: "cash_flow_listing", display_text: "One" }),
        row({ intent_id: "invoice_listing", display_text: "Two" }),
      ],
    });

    expect(out.map((q) => q.id)).toEqual(["cash_flow_listing", "invoice_listing"]);
  });

  it("falls back to a positional key when intent_id is missing or blank", () => {
    const out = eligibleSuggestedQuestions({
      suggestions: [
        row({ intent_id: undefined, display_text: "No id" }),
        row({ intent_id: "   ", display_text: "Blank id" }),
      ],
    });

    expect(out.map((q) => q.id)).toEqual(["suggestion-0", "suggestion-1"]);
  });

  it("drops duplicate text, keeping the first (highest-ranked) copy", () => {
    const out = eligibleSuggestedQuestions({
      suggestions: [
        row({ intent_id: "first", display_text: "Show recent cash flow" }),
        row({ intent_id: "second", display_text: "  show recent CASH FLOW  " }),
      ],
    });

    expect(out).toEqual<EligibleQuestion[]>([
      { id: "first", question: "Show recent cash flow" },
    ]);
  });

  it("drops rows without usable display_text", () => {
    const out = eligibleSuggestedQuestions({
      suggestions: [
        row({ display_text: "   " }),
        row({ display_text: 42 }),
        row({ display_text: null }),
        row({ display_text: undefined }),
        row({ intent_id: "kept", display_text: "  Real question  " }),
      ],
    });

    expect(out).toEqual<EligibleQuestion[]>([{ id: "kept", question: "Real question" }]);
  });

  it("survives malformed payloads without throwing", () => {
    for (const bad of [
      undefined,
      null,
      {},
      { suggestions: null },
      { suggestions: "nope" },
      { suggestions: [null, 7, "x", []] },
      [],
      "string",
    ]) {
      expect(eligibleSuggestedQuestions(bad)).toEqual([]);
    }
  });
});

describe("resolveSuggestionChips", () => {
  const tenant: EligibleQuestion[] = [
    { id: "transaction_listing", question: "Show my last 10 transactions" },
    { id: "cash_flow_listing", question: "Show recent cash flow" },
  ];

  it("renders tenant questions in order when any are eligible", () => {
    const out = resolveSuggestionChips({
      questions: tenant,
      isLoading: false,
      isError: false,
      fallback: FALLBACK,
    });

    expect(out.source).toBe("tenant");
    expect(out.chips).toEqual(["Show my last 10 transactions", "Show recent cash flow"]);
  });

  it("falls back when the tenant has nothing eligible", () => {
    const out = resolveSuggestionChips({
      questions: [],
      isLoading: false,
      isError: false,
      fallback: FALLBACK,
    });

    expect(out.source).toBe("fallback");
    expect(out.chips).toEqual([...FALLBACK]);
  });

  it("falls back when the read failed outright", () => {
    const out = resolveSuggestionChips({
      questions: [],
      isLoading: false,
      isError: true,
      fallback: FALLBACK,
    });

    expect(out.source).toBe("fallback");
    expect(out.chips).toEqual([...FALLBACK]);
  });

  it("falls back while the read is still in flight, never an empty row", () => {
    const out = resolveSuggestionChips({
      questions: [],
      isLoading: true,
      isError: false,
      fallback: FALLBACK,
    });

    expect(out.source).toBe("fallback");
    expect(out.chips).toEqual([...FALLBACK]);
  });

  it("returns a copy, so a caller cannot mutate the shared fallback", () => {
    const out = resolveSuggestionChips({
      questions: [],
      isLoading: false,
      isError: false,
      fallback: FALLBACK,
    });
    out.chips.push("injected");

    expect(FALLBACK).toEqual(["Show recent cash flow", "What needs attention?"]);
  });
});
