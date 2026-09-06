---
name: Demo tenant TTL cleanup
description: Remote-first deletion, durable lifecycle state, and cross-worker safety for expired demo tenants.
---

## Rule
Keep local-only expiry as the default. Remote brain-core deletion is opt-in and
must complete before local account cleanup. Persist demo tenant lifecycle state
separately from production identity mappings and serialize every remote-delete
claim in PostgreSQL.

**Why:** Demo identities were previously only in memory, so a restart could
orphan the remote tenant. Process-local throttles also let multiple app workers
exceed both per-tenant daily retries and the global per-minute cap. A dedicated
lifecycle row survives local deletion, while a transaction-scoped advisory lock
makes the claim and both limits atomic across workers.

**How to apply:**
- Continue selecting expiry by the established demo-fresh email pattern and user creation age.
- Never put ephemeral demo mappings into the production identity table.
- Claim before POSTing; the claim must durably record the attempt and enforce both limits in one serialized transaction.
- A protected tenant is a terminal skip, not a retryable failure.
- A remote failure or timeout remains locally visible for operators and may not be attempted again for 24 hours.
- Only a completed remote job permits the existing local account cleanup.
