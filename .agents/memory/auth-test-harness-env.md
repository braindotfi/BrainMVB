---
name: Auth test harnesses and environment-derived wiring
description: Why OAuth/session HTTP tests fail intermittently under Postgres, and the load-time env reads that force dynamic imports.
---

# Two traps when HTTP-testing the auth routes

## 1. The Postgres session store loses a race against an immediate follow-up request

Any test that walks a two-request flow — issue a redirect that stores something on the
session, then immediately call back with the cookie — is racing the session store. With
`DATABASE_URL` set, sessions live in Postgres, and the second request can arrive before
the first request's session row is readable. The server then creates a fresh session, the
stored value is `undefined`, and the failure surfaces as whatever the handler does with a
missing value (for the OAuth callback: a state-mismatch redirect).

It is intermittent and order-dependent: a test that happens to do a DB round-trip before
the callback passes, and its neighbours fail. That looks like flaky test isolation, so the
temptation is to chase mocks and `restoreAllMocks`. It is neither.

**Fix:** `delete process.env.DATABASE_URL` before importing the server modules, which puts
both the session store and `storage` in memory. Legitimate when the logic under test is
storage-independent — say so in the file, because otherwise it reads as hiding a failure.
Snapshot and restore the env in `afterAll`.

**Bonus:** it also stops the test writing real rows to the dev database. A fixed email
address in a DB-backed auth test passes once and then fails on every later run with a
uniqueness violation.

## 2. Some auth config is read at module load, not per request

`googleEnabled` (and anything else derived from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)
is a module-level `const`. Static `import`s are hoisted above top-level assignments, so
setting those variables at the top of a test file happens too late — the route answers 503.

**How to apply:** set the env inside `beforeAll`, then `await import("./routes")` there.
Contrast with the brain config, which reads through an `env()` helper at call time and can
be set from anywhere. Check which style a value uses before assuming a test can configure it.
