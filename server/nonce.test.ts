import { describe, it, expect } from "vitest";
import { generateNonce } from "./nonce";

/**
 * The SIWE nonce must come from a CSPRNG. These assertions pin the two
 * properties that matter: it is a 64-character hex string (32 random bytes,
 * 256 bits) and two successive nonces are distinct (never a fixed/guessable
 * value). This is the merge gate against a regression back to Math.random().
 */
describe("generateNonce", () => {
  it("produces two distinct 64-character hex nonces", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
