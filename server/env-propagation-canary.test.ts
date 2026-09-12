import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ENV_PROPAGATION_CANARY_NAME,
  envPropagationCanaryWitness,
} from "./envPropagationCanary";

describe("environment propagation canary witness", () => {
  it("reports an absent value without a fingerprint", () => {
    expect(envPropagationCanaryWitness(undefined)).toBe(
      `[env-propagation-canary] name=${ENV_PROPAGATION_CANARY_NAME} present=false fingerprint=none`,
    );
  });

  it("reports a short fingerprint without disclosing the value", () => {
    const value = "workspace-only-test-value";
    const fingerprint = createHash("sha256").update(value).digest("hex").slice(0, 12);
    const witness = envPropagationCanaryWitness(value);

    expect(witness).toContain("present=true");
    expect(witness).toContain(`fingerprint=sha256:${fingerprint}`);
    expect(witness).not.toContain(value);
  });
});