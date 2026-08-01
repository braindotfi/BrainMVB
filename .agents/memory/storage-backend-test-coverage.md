---
name: Storage-backend-dependent test coverage
description: Why a test that only runs on one storage backend can silently mean zero coverage in production, and the two habits that prevent it.
---

## The trap

`storage` is selected **at module load** from whether `DATABASE_URL` is set:
set → the Postgres implementation, unset → the in-memory one. They are separate
classes implementing the same interface, so a test can pass against one and
never execute against the other.

A test that seeds by reaching into implementation internals (a private Map, a
field that only one class has) therefore does not merely "fail in some
environments" — against the other backend it throws **while seeding, before any
assertion runs**. If that test is the only place an important behaviour is
asserted, the real coverage in the deployed configuration is **zero**, and the
suite still looks like it has a test for it.

**Why this is worse than a plain missing test:** a red test in one environment
gets filed as environment-dependent flake and muted or ignored, while the
behaviour it names stays on the list of things believed to be covered.

## Two habits

1. **Before dismissing an environment-dependent failure, count the assertions
   it guards.** Grep for the mock or the behaviour across the whole suite. If it
   appears only inside the failing test, the failure is a coverage hole, not a
   flake. Never "fix" it by skipping when the env var is set — that converts a
   visible hole into an invisible one.
2. **Seed through a path that exists on every backend.** Where a test genuinely
   needs a shape the public write path won't produce (e.g. a pre-encryption
   plaintext credential), write it via the public path and then overwrite the
   stored value for *each* backend explicitly. Branching on the backend to seed
   is fine; branching on it to decide whether to assert is not.

## Related rule: never let a credential revocation fail quietly

Revocation-on-delete has a property that makes silent failure especially bad:
the local row is deleted regardless, so a swallowed failure leaves a live
credential at the third party with **nothing left to retry from**. Deletion
should still not be blocked on the third party being up — but the outcome must
be returned to the caller (counts of revoked vs failed), not just logged.

**How to apply:** when a delete path calls out to revoke something, assert both
that the call happened *and* that it was made with the usable value (a decrypted
token, not the stored ciphertext — ciphertext is a well-formed string, so the
call still "succeeds" and nothing looks wrong). Verify such a test by mutating
the source to reintroduce the bug and confirming it fails.
