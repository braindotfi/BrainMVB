import { describe, expect, it } from "vitest";
import { capitalCase } from "./displayLabels";

describe("capitalCase", () => {
  it("normalizes status, agent, and hyphenated pill labels", () => {
    expect(capitalCase("cash flow")).toBe("Cash Flow");
    expect(capitalCase("auto-approved")).toBe("Auto-Approved");
    expect(capitalCase("high risk")).toBe("High Risk");
    expect(capitalCase("API")).toBe("API");
  });
});