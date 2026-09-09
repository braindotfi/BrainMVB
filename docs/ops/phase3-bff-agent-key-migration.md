# Phase 3 — BFF agent API key migration

Migrating each production tenant's stored BFF credential from a long-lived agent
JWT to an exchange-only agent API key (`brain_ak_live_…`), verified at boot before
the server accepts traffic.

Code: `server/brain/agentApiKeyMigration.ts`, manifest and constants in
`server/brain/agentApiKeyMigrationBatch.ts`, structure pins in
`server/brain/agent-api-key-migration-structure.test.ts`.

## Current state

**Batch 1 is empty. Nothing migrates on boot.** The manifest ships empty on
purpose; `migrateConfiguredAgentApiKeyBatch()` returns immediately. Two upstream
answers (below) are required before any tenant can be added.

## Verification is read-only

The verifier proves four things and mutates nothing:

| Receipt field | What is actually observed |
| --- | --- |
| `exchange_verified` | The raw key returns 401 when used directly as a bearer token, and the exchanged access token re-validates against the expected tenant, audience, subject, scope set, credential id, and lifetime. |
| `scope_denial_verified` | `POST /payment-intents/pi_0000…/approve` (an all-zero, unassigned ULID) returns 403. |
| `key_lifecycle_verified` | brain-core's own agent-key record is live, unrevoked, `bff_service_v1`, `live`, bound to the same agent and tenant, and carries exactly the BFF scope set. |
| `runtime_binding_verified` | The stored runtime credential row the app reads holds the migrated API key. |

Each boolean is assigned from its check's result, and each check throws when it
does not hold — a receipt exists only for a tenant where all four were observed.

**Why the denial probe targets a nonexistent intent.** The earlier revision proved
denial by selecting a real payable invoice and proposing a real payment against it.
That works, but it creates a PaymentIntent, a policy decision, and audit evidence in
a production tenant, and there is no delete path for any of it — reject or cancel
still leaves the record. An unassigned intent id is routed and authorized normally
but addresses nothing, so the request cannot mutate state whatever the answer is.

**If the probe returns 404 instead of 403**, brain-core resolved the intent before
authorizing it, and scope denial is unproven. The verifier fails and says so. Do not
restore a mutating probe: raise the ordering with brain-core, or add a read-only
denial surface.

The retired receipt also carried `lifecycle: "completed"` and
`rollback_marker: false` as hardcoded constants. They asserted success rather than
observing it and are gone.

## Gate: no demo or synthetic tenant may be migrated

`assertTenantIsNotDemoSeeded()` runs before any credential is issued and reads
brain-core's own provenance record, not a local id list — a hardcoded exclusion
list only knows the demo tenants somebody remembered. It refuses on
`demo_seed:true`, on a `data_profile` starting `synthetic`, on
`access_stage=demo`, **and on every unknown answer**: read unavailable, field
absent, field not a boolean. "We could not tell" and "it is a real tenant" must
never produce the same outcome.

> **BLOCKED — needs brain-core.** `GET /v1/tenants/{id}` is not documented in
> `docs/contracts` and has not been exercised against production from this repo.
> Until brain-core owners confirm it, or supply another read-only provenance
> endpoint, this gate refuses every tenant. That is the intended failure mode, but
> it also means no batch can run until the contract is settled.

`PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS` (Northstar, golden demo, the shared
"Continue with Demo" tenant, the RFC 0008 acceptance tenant) remains a second,
independent refusal enforced in `validateBatch()`.

## Legacy JWT rollback deadline — 2026-09-16T23:59:59Z

Rollback for a legacy-JWT tenant means restoring the tenant's previous agent JWT
and revoking the freshly issued API key. That only works while the legacy JWT is
still valid, so the window has a fixed end.

Enforcement is split, and neither half substitutes for the other:

1. **brain-core revokes the legacy agent JWTs at the deadline.** This is the only
   mechanism that actually invalidates them; nothing in this BFF can revoke a
   credential brain-core issued. *Owner: brain-core. Not yet confirmed scheduled.*
2. **This BFF refuses to start a legacy-path migration at or after the deadline**
   (`assertLegacyRollbackWindowOpen`), because a rollback past that point would
   restore a revoked credential — a recovery that looks like it worked and does
   not. The same function refuses when the stored legacy JWT has *already*
   expired, which is a rollback that does not exist regardless of the deadline.

## Withdrawn from batch 1

`tnt_01M1MDWXR5K5NBQYF089D4ZKCN` was the sole remaining candidate and is removed:

- `access_stage=demo`, `data_profile=synthetic_brightline_v1` — a demo tenant on
  synthetic fixture data, exactly what the gate above exists to exclude. It is
  absent from `demo_tenant_lifecycles`, which is why the earlier ephemeral-demo
  screens did not catch it.
- Its stored credential expired **2026-09-03T21:03:25Z**, five days before review.
  Migrating it would have had no working rollback from the start.

## Before adding any tenant to a batch

1. **Production scenario counts — OUTSTANDING.** The retired invoice predicate
   (`scenario !== "ar"` and not settled) was fail-open: absent, null, and unknown
   future markers all read as payable. Real tenants routinely return
   `metadata: {}`, so an absent marker means *unknown*, not *payable*. The
   verifier no longer selects an invoice at all, so nothing in this file depends
   on the predicate any more — but the same fail-open shape exists in product code
   that classifies AP/AR, and correcting it needs authoritative counts of
   `metadata.scenario` values across production invoices. That read requires
   brain-core database access this environment does not have. *Owner: brain-core /
   Codex. Report the counts here before any allowlist is written.*
2. **Vendor-payable allowlist — deferred, depends on (1).** Not written into the
   verifier: with invoice selection removed there is no predicate left here to
   replace. An `"ap"`-only allowlist would reinstate the original bug for real
   tenants whose invoices carry no marker.
3. **Provenance contract — see the gate above.** Blocked on brain-core.
4. Confirm the candidate's stored legacy JWT is still valid, and that the whole
   migration window closes before 2026-09-16T23:59:59Z.
