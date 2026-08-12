import { describe, expect, it } from "vitest";
import { isAssistantBulletLine, stripAssistantBullet } from "./assistantFormatting";

describe("assistant bullet formatting", () => {
  it("recognizes Unicode bullets emitted by deterministic Brain answers", () => {
    expect(isAssistantBulletLine("  • $1,200 due Friday")).toBe(true);
    expect(stripAssistantBullet("  • $1,200 due Friday")).toBe("$1,200 due Friday");
  });

  it("keeps markdown bullets supported", () => {
    expect(isAssistantBulletLine("- First item")).toBe(true);
    expect(isAssistantBulletLine("* Second item")).toBe(true);
  });

  it("does not split an inline bullet separator into a list", () => {
    expect(isAssistantBulletLine("Revenue • expenses")).toBe(false);
  });
});