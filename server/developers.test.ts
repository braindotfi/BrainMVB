import { describe, it, expect } from "vitest";
import {
  API_KEY_SCOPES,
  isRawScopeEligible,
} from "./developers";

describe("developer API-key scope policy", () => {
  it("accepts the complete core key-scope vocabulary", () => {
    expect(API_KEY_SCOPES).toEqual([
      "ledger:read",
      "audit:read",
      "governance:read",
      "raw:read",
      "raw:write",
    ]);
  });

  it("offers Raw scopes only for the exact verified synthetic demo state", () => {
    expect(isRawScopeEligible({
      provisioningState: "ready_demo",
      dataProfile: "synthetic_brightline_v1",
      accessStage: "demo",
    })).toBe(true);

    for (const state of [
      { provisioningState: "provisioning", dataProfile: "synthetic_brightline_v1", accessStage: "demo" },
      { provisioningState: "ready_demo", dataProfile: "customer", accessStage: "demo" },
      { provisioningState: "ready_demo", dataProfile: "synthetic_brightline_v1", accessStage: "production" },
      {},
    ]) {
      expect(isRawScopeEligible(state)).toBe(false);
    }
  });
});
