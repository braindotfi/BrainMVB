import { describe, expect, it } from "vitest";
import { buildScenario } from "./scenario";

describe("demo wallet activity", () => {
  it("includes clear incoming and outgoing examples without replacing invoice settlements", () => {
    const scenario = buildScenario(new Date("2026-09-11T12:00:00Z"));

    expect(scenario.wallet).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Receive",
        qty: 1000,
        memo: "Deposited 1,000 USDC",
      }),
      expect.objectContaining({
        type: "Send",
        qty: -240,
        memo: "Sent 240 USDC",
      }),
      expect.objectContaining({
        counterparty: "Vertex Robotics",
        qty: 18500,
        memo: "INV-1043 settled in USDC",
      }),
    ]));
  });
});