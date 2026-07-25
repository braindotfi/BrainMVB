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
- brain-core does NOT project uploaded/extracted documents into ledger entities on the
  production deploy (extraction is advisory) — a freshly seeded tenant's ledger endpoints
  are legitimately empty; don't chase this as a bug from this repo. A ledger-projection fix
  exists upstream but has not been observed working from here (last verified broken
  2026-07-25); re-verify with a fresh demo-fresh tenant before building anything on it.
- `/health` on api.brain.fi only vouches for the `api` container's commit — the extract
  pipeline runs in a separate `worker` container that can lag the promote. **How to apply:**
  if a "deployed" pipeline fix shows the pre-fix fingerprint (extract returns parsed_id null,
  jobs batch-drain ~75s later, same confidence scores), suspect worker-container drift and
  ask ops to check the running worker image directly instead of re-probing end-to-end.
- Seed-side quirk to fix when unblocked: `seedTenantDocuments` persists the FIRST extract
  response, so an async upstream leaves parsed_id/confidence null in source_documents even
  when the job later succeeds — poll or re-fetch the job before finalizing.
- Suites in server/brain/*.test.ts read env at module-eval: any workspace-set
  BRAIN_TENANCY_MODE / BRAIN_PLATFORM_SERVICE_SECRET leaks into vitest and flips code
  paths — demo-path suites must explicitly `delete` those vars at the top.
