---
name: Demo tenant TTL cleanup
description: How demo-fresh tenant expiry works in BrainMVB and why schema changes were avoided.
---

## Rule
Demo-fresh tenant cleanup uses email pattern matching (`demo-fresh-%@brain.fi`) + `createdAt` age — no schema migration required.

**Why:** Adding `isDemo`/`demoExpiresAt` columns to `users` would require an ALTER TABLE on the dev and prod Postgres instances (db:push hangs; must be done via psql). The email pattern is already the single source of truth in `isDemoEmail()` (`server/demoUsers.ts`), so reusing it avoids a schema change with identical semantics.

**How to apply:**
- `IStorage.deleteExpiredDemoUsers(ttlMs)` implements the purge in both MemStorage and DatabaseStorage.
- `server/index.ts` runs it at startup + every `DEMO_CLEANUP_INTERVAL_HOURS` (default 1h).
- TTL default is 24h, overridable via `DEMO_TENANT_TTL_HOURS`.
- `demo@brain.fi` (shared legacy account) is never deleted — excluded by the `demo-fresh-` prefix in the LIKE pattern.
- brain-core tenant deletion is NOT possible (no delete-tenant API endpoint); cleanup only removes BrainMVB local rows, preventing re-authentication as the expired tenant.
