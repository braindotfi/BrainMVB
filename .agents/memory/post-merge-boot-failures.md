---
name: Post-merge boot failures
description: Task-agent merges can leave the dev server unbootable for several distinct reasons; check all three.
---

When the dev server fails to boot right after a task merge, check in order:

1. **Unresolved conflict markers** (`<<<<<<<`) left in source — esbuild fails with `Unexpected "<<"`. Grep the whole repo; usually both sides of an import conflict should be kept.
2. **Missing node_modules** for deps added by the merged branch (package.json updated, install not run). Install via the packager, not bash npm.
3. **New hard-required env vars** asserted at startup (e.g. a 32-byte `ENCRYPTION_KEY` for Plaid token crypto). Self-generated symmetric keys can be created with `randomBytes(32).toString('hex')` and set as a shared env var; third-party secrets must be requested from the user.

**Why:** all three occurred together after one merge (2026-07-22); fixing only the first still leaves the server down.

Also: `server/auth-security.test.ts` legacy-Plaid-token test reaches into MemStorage internals (`bankConns`) and fails whenever `DATABASE_URL` is set (storage = DatabaseStorage). Environment-dependent, not a regression signal.
