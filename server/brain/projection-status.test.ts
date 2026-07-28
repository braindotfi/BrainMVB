import { describe, expect, it } from "vitest";
import { projectionStatusFrom, isTerminalProjectionStatus } from "./projectionStatus";

/**
 * These pin the capability gate. The BFF ships this code against a brain-core that does
 * not expose `projection_status` yet, so "we didn't get a value" has to stay clearly
 * distinct from every real state - in both directions:
 *
 *   - absent must not become a status (it would be a fabricated one), and
 *   - absent must not count as terminal (that would claim a projection finished when we
 *     never heard about it at all).
 */
describe("projectionStatusFrom", () => {
  it.each(["pending", "projecting", "projected", "projection_timed_out", "projection_failed"])(
    "accepts the known status %s",
    (status) => {
      expect(projectionStatusFrom(status)).toBe(status);
    },
  );

  it("returns null for a missing field, which is what every current deployment sends", () => {
    expect(projectionStatusFrom(undefined)).toBeNull();
    expect(projectionStatusFrom(null)).toBeNull();
  });

  it("returns null for a status brain-core might add later rather than guessing at it", () => {
    // Forward compatibility: an unrecognised value degrades to "no signal", which falls
    // back to the timing heuristic instead of gating on something we can't interpret.
    expect(projectionStatusFrom("projection_superseded")).toBeNull();
    expect(projectionStatusFrom("PROJECTED")).toBeNull();
  });

  it("returns null for non-string values instead of coercing them", () => {
    expect(projectionStatusFrom(0)).toBeNull();
    expect(projectionStatusFrom(true)).toBeNull();
    expect(projectionStatusFrom({ status: "projected" })).toBeNull();
    expect(projectionStatusFrom([])).toBeNull();
  });
});

describe("isTerminalProjectionStatus", () => {
  it.each(["projected", "projection_timed_out", "projection_failed"] as const)(
    "treats %s as terminal",
    (status) => {
      expect(isTerminalProjectionStatus(status)).toBe(true);
    },
  );

  it.each(["pending", "projecting"] as const)("treats %s as still running", (status) => {
    expect(isTerminalProjectionStatus(status)).toBe(false);
  });

  it("does NOT treat null as terminal", () => {
    // null means "no information". Calling it terminal would stop the BFF from ever
    // chasing the real status once brain-core starts sending one.
    expect(isTerminalProjectionStatus(null)).toBe(false);
  });
});
