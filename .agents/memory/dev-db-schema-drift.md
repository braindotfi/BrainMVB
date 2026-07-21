---
name: Dev DB schema drift
description: The dev Postgres can silently lag shared/schema.ts; drizzle db:push hangs interactively, so drift accumulates.
---
The rule: when a DB query fails with "column does not exist" or "no unique or exclusion constraint matching the ON CONFLICT specification", suspect drift between `shared/schema.ts` and the live dev database, not the new code.

**Why:** `npm run db:push` prompts interactively and hangs under the agent, so tables are sometimes created/edited via direct psql and later schema.ts additions (new columns, unique indexes) never reach the DB. Seen: `brain_identities.company_name` missing, and `bank_connections` upsert using ON CONFLICT (user_id, item_id) while the index was declared with `index()` instead of `uniqueIndex()` — the upsert requires a UNIQUE index.

**How to apply:** compare `\d <table>` against schema.ts and fix with targeted `ALTER TABLE` / `CREATE UNIQUE INDEX` via psql; keep schema.ts as the source of truth (use `uniqueIndex()` for any ON CONFLICT target).
