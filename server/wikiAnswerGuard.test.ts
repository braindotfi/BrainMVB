import { describe, it, expect } from "vitest";
import { isDegenerateWikiPayload, hasMeaningfulScalar } from "./wikiAnswerGuard";

describe("isDegenerateWikiPayload", () => {
  it("treats structurally empty payloads as degenerate", () => {
    expect(isDegenerateWikiPayload("null")).toBe(true);
    expect(isDegenerateWikiPayload("")).toBe(true);
    expect(isDegenerateWikiPayload('""')).toBe(true);
    expect(isDegenerateWikiPayload("{}")).toBe(true);
    expect(isDegenerateWikiPayload("[]")).toBe(true);
    expect(isDegenerateWikiPayload('{"text":""}')).toBe(true);
    expect(isDegenerateWikiPayload('[null, ""]')).toBe(true);
    expect(isDegenerateWikiPayload('{"a":{"b":null}}')).toBe(true);
    expect(isDegenerateWikiPayload('{"answer":{"text":""}}')).toBe(true);
    expect(isDegenerateWikiPayload('{"answer":[null]}')).toBe(true);
    expect(isDegenerateWikiPayload('"   "')).toBe(true);
  });

  it("keeps payloads with meaningful scalars", () => {
    expect(isDegenerateWikiPayload('{"count":0}')).toBe(false);
    expect(isDegenerateWikiPayload('{"note":"none"}')).toBe(false);
    expect(isDegenerateWikiPayload('{"flag":false}')).toBe(false);
    expect(isDegenerateWikiPayload('[0]')).toBe(false);
    expect(isDegenerateWikiPayload('{"a":{"b":{"c":42}}}')).toBe(false);
  });

  it("does not treat non-JSON prose as degenerate", () => {
    expect(isDegenerateWikiPayload("plain prose answer")).toBe(false);
  });
});

describe("hasMeaningfulScalar", () => {
  it("counts numbers (including 0), booleans, and non-empty strings", () => {
    expect(hasMeaningfulScalar(0)).toBe(true);
    expect(hasMeaningfulScalar(false)).toBe(true);
    expect(hasMeaningfulScalar("x")).toBe(true);
    expect(hasMeaningfulScalar("   ")).toBe(false);
    expect(hasMeaningfulScalar(null)).toBe(false);
    expect(hasMeaningfulScalar(undefined)).toBe(false);
    expect(hasMeaningfulScalar([{ a: [null, ""] }])).toBe(false);
    expect(hasMeaningfulScalar([{ a: [null, "hi"] }])).toBe(true);
  });
});
