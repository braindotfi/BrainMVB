/**
 * brain-core ID helpers.
 *
 * brain-core IDs are `prefix_<26-char Crockford-Base32 ULID>` (shared/src/ids.ts).
 * The JWT verifier (shared/src/auth/jwt.ts) rejects a `sub` that isn't a valid
 * brain ID whose prefix matches `principal_type`. So when we mint a token for a
 * BrainMVB user we must hand it a well-formed `user_<ULID>` subject.
 *
 * We derive that subject deterministically from the BrainMVB user id so the same
 * app user always maps to the same brain-core principal (stable audit trail),
 * without needing a ULID dependency.
 */

import { createHash } from "node:crypto";

/** Crockford's Base32 alphabet (no I, L, O, U) - matches brain-core's ULID regex. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Encode bytes as Crockford Base32, returning exactly `length` chars. */
function crockford(bytes: Buffer, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CROCKFORD[bytes[i % bytes.length]! % 32];
  }
  return out;
}

/** Deterministic `user_<ULID>` brain principal id for a BrainMVB user id. */
export function brainUserSubject(appUserId: string): string {
  const digest = createHash("sha256").update(`brainmvb:user:${appUserId}`).digest();
  return `user_${crockford(digest, 26)}`;
}
