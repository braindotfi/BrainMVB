import { describe, it, expect } from "vitest";
import {
  eligibleAssistantQuestions,
  resolveSuggestionChips,
  type EligibleQuestion,
} from "./brainAssistantQuestions";

/**
 * These pin the promise the tenant-aware suggestion chips make:
 *
 *   1. a chip is only ever text brain-core returned for THIS tenant, so a
 *      suggestion can never again offer a capability the backend lacks;
 *   2. the order brain-core returns is the order the buttons render, because
 *      the payload carries no rank field and re-sorting here would mean we
 *      invented the ranking;
 *   3. a tenant with nothing eligible, and a read that failed outright, both
 *      land on the vetted fallback rather than an empty row that looks broken.
 *
 * `resolveSuggestionChips` is mapped 1:1 onto buttons by BrainAssistant, so
 * asserting on `chips` is asserting on button order. The suite is pure by
 * necessity as well as preference: the vitest project runs in a `node`
 * environment with no testing-library, and only picks up `*.test.ts`.
 */

/** Shape of one upstream row, matching the deployed AssistantQuestion schema. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "aq_1",
  question: "What changed overnight?",
  answer: null,
  status: "suggested",
  source: null,
  evidence_ids: [],
  metadata: {},
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  ...over,
});

const FALLBACK = ["Show recent cash flow", "What needs attention?"] as const;

describe("eligibleAssistantQuestions", () => {
  it("keeps only status 'suggested' — answered and dismissed are spent", () => {
    const out = eligibleAssistantQuestions({
      questions: [
        row({ id: "a", question: "Still worth asking", status: "suggested" }),
        row({ id: "b", question: "Already answered", status: "answered" }),
        row({ id: "c", question: "Explicitly rejected", status: "dismissed" }),
      ],
    });

    expect(out.map((q) => q.question)).toEqual(["Still worth asking"]);
  });

  it("preserves upstream order verbatim — that IS the ranking", () => {
    const out = eligibleAssistantQuestions({
      questions: [
        row({ id: "1", question: "Zulu ranked first" }),
        row({ id: "2", question: "Alpha ranked second" }),
        row({ id: "3", question: "Mike ranked third" }),
      ],
    });

    // Deliberately reverse-alphabetical: any accidental .sort() fails here.
    expect(out.map((q) => q.question)).toEqual([
      "Zulu ranked first",
      "Alpha ranked second",
      "Mike ranked third",
    ]);
  });

  it("fails closed when status is missing or unrecognised", () => {
    const out = eligibleAssistantQuestions({
      questions: [
        row({ id: "a", question: "No status at all", status: undefined }),
        row({ id: "b", question: "Novel status", status: "queued" }),
        row({ id: "c", question: "Confirmed suggested" }),
      ],
    });

    expect(out.map((q) => q.question)).toEqual(["Confirmed suggested"]);
  });

  it("drops blank text and de-dupes, keeping the highest-ranked copy", () => {
    const out = eligibleAssistantQuestions({
      questions: [
        row({ id: "a", question: "   " }),
        row({ id: "b", question: "Show recent cash flow" }),
        row({ id: "c", question: "show RECENT cash flow" }),
        row({ id: "d", question: 42 }),
      ],
    });

    expect(out.map((q) => q.question)).toEqual(["Show recent cash flow"]);
    expect(out[0].id).toBe("b");
  });

  it("survives whatever the verbatim GET passthrough relays", () => {
    expect(eligibleAssistantQuestions(undefined)).toEqual([]);
    expect(eligibleAssistantQuestions(null)).toEqual([]);
    expect(eligibleAssistantQuestions({})).toEqual([]);
    expect(eligibleAssistantQuestions({ questions: null })).toEqual([]);
    expect(eligibleAssistantQuestions({ questions: "nope" })).toEqual([]);
    expect(eligibleAssistantQuestions({ questions: [null, 7, "x"] })).toEqual([]);
  });

  it("still yields a usable React key when upstream omits the id", () => {
    const out = eligibleAssistantQuestions({
      questions: [row({ id: undefined, question: "Keyless" })],
    });

    expect(out).toHaveLength(1);
    expect(out[0].id.length).toBeGreaterThan(0);
  });
});

describe("resolveSuggestionChips", () => {
  const q = (question: string, id: string): EligibleQuestion => ({ id, question });

  it("renders tenant questions in upstream rank order", () => {
    const state = resolveSuggestionChips({
      questions: [q("Zulu", "1"), q("Alpha", "2"), q("Mike", "3")],
      isLoading: false,
      isError: false,
      fallback: FALLBACK,
    });

    expect(state.source).toBe("tenant");
    expect(state.chips).toEqual(["Zulu", "Alpha", "Mike"]);
  });

  it("empty eligibility falls back instead of rendering an empty row", () => {
    // The live demo tenant genuinely returns {"questions": []} today, so this
    // is the common path, not a defensive edge case.
    const state = resolveSuggestionChips({
      questions: [],
      isLoading: false,
      isError: false,
      fallback: FALLBACK,
    });

    expect(state.source).toBe("fallback");
    expect(state.chips).toEqual([...FALLBACK]);
  });

  it("endpoint failure falls back to the vetted set", () => {
    const state = resolveSuggestionChips({
      questions: [],
      isLoading: false,
      isError: true,
      fallback: FALLBACK,
    });

    expect(state.source).toBe("fallback");
    expect(state.chips).toEqual([...FALLBACK]);
  });

  it("shows the fallback while the read is still in flight, never a bare row", () => {
    const state = resolveSuggestionChips({
      questions: [],
      isLoading: true,
      isError: false,
      fallback: FALLBACK,
    });

    expect(state.source).toBe("fallback");
    expect(state.chips).toEqual([...FALLBACK]);
  });

  it("prefers real tenant questions even if a stale error flag is set", () => {
    const state = resolveSuggestionChips({
      questions: [q("Real tenant question", "1")],
      isLoading: false,
      isError: true,
      fallback: FALLBACK,
    });

    expect(state.source).toBe("tenant");
    expect(state.chips).toEqual(["Real tenant question"]);
  });

  it("never emits an empty chip row, whatever the inputs", () => {
    const state = resolveSuggestionChips({
      questions: [],
      isLoading: false,
      isError: false,
      fallback: FALLBACK,
    });

    expect(state.chips.length).toBeGreaterThan(0);
  });
});
