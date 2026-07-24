---
name: Durable brain tenancy
description: Constraints learned building BRAIN_TENANCY_MODE=durable (auto-created persistent tenants + one-time seed)
---

- brain-core tenant creation is NOT idempotent AND founder email is unique upstream: a
  second create for the same email fails with an opaque 500 `internal_server_error`, not
  a clear conflict. So a lost `brain_identities` row permanently orphans the tenant —
  guard creation with a persisted `pending:create` tombstone written BEFORE the POST.
  **Why:** verified live 2026-07-24 by deleting the local row and re-logging-in.
  **How to apply:** never delete brain_identities rows; recover from server logs instead.
- The durable/production MEMBER token lacks the `raw:write` scope (403 on /raw/ingest);
  the AGENT token holds it (201 verified live). Despite the "agent token is propose-only"
  contract note, raw ingest/extract must use the agent token. In demo mode agentToken ===
  member token, so using agentToken everywhere for ingest is safe in both modes.
- brain-core does NOT project uploaded/extracted documents into ledger entities (extraction
  is advisory) — a freshly seeded tenant's ledger endpoints are legitimately empty; don't
  chase this as a bug.
- Suites in server/brain/*.test.ts read env at module-eval: any workspace-set
  BRAIN_TENANCY_MODE / BRAIN_PLATFORM_SERVICE_SECRET leaks into vitest and flips code
  paths — demo-path suites must explicitly `delete` those vars at the top.
