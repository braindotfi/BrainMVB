---
name: Key API null-guard pattern
description: How to guard against null upstream responses in issue/rotate handlers without breaking existing fixed-window source-scan tests.
---

# Key API null-guard pattern

## The rule
When `issuedPlaintext(r)` is made null-safe (returns null for null input), protect the `issued.key` access by swapping operand order: `if (!plaintext || !issued.key)` instead of `if (!issued.key || !plaintext)`.

**Why:** The rotate handler has `res.json({` at ~690 chars from its route registration. The test window for that check is 700 chars — there is no room to add any null-guard lines before `res.json`. But `!plaintext` short-circuits on null (since `issuedPlaintext(null) === null`), so `issued.key` is never reached, preventing TypeError with zero added code.

**How to apply:**
- Keep `issuedPlaintext` signature as `(r: IssuedTenantKeyResponse | null | undefined): string | null` with `if (!r) return null` at the top.
- In any handler that calls `issuedPlaintext(issued)` and then checks the result alongside `issued.key`, put `!plaintext` first.
- Existing tests check for the string `!issued.key` in source — keeping it as the second operand satisfies those checks.
- Do NOT add a separate null guard block before `issuedPlaintext` — the fixed-window tests for `res.json({`, `sendKeyApiError`, `console.error`, and `res.status(201)` leave no margin for extra lines.
