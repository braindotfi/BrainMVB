import { randomBytes } from "node:crypto";

/**
 * Generate a SIWE login nonce using a cryptographically secure RNG.
 *
 * 32 random bytes rendered as hex give a 64-character, 256-bit nonce that is
 * unpredictable — unlike Math.random(), which is not a CSPRNG and must never be
 * used for anything security-sensitive. The consume-before-validate flow, the
 * expiry, and the address binding in the verify handler are unchanged.
 */
export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}
