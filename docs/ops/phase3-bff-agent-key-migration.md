# Phase 3 — BFF agent API key migration

Migrating each production tenant's stored BFF credential from a long-lived agent
JWT to an exchange-only agent API key (`brain_ak_live_…`), verified at boot before
the server accepts traffic.

Code: `server/brain/agentApiKeyMigration.ts`, manifest and constants in
`server/brain/agentApiKeyMigrationBatch.ts`, behavioural tests in
`server/brain/agent-api-key-migration.test.ts`, structure pins in
`server/brain/agent-api-key-migration-structure.test.ts`.

## Current state

**Batch 1 is empty. Nothing migrates on boot.** The manifest ships empty on
purpose; `migrateConfiguredAgentApiKeyBatch()` returns immediately. Three upstream
answers (below) are required before any tenant can be added.

## Verification makes no writes it expects to succeed

The verifier proves four things. It issues exactly three HTTP requests: two GETs
and one POST that is expected to be *refused* (see the denial-probe caveat below —
that POST is safe by convention, not by contract). No successful write is part of
verification, and `agent-api-key-migration.test.ts` asserts the full request
inventory, so a mutating call added later fails the suite rather than passing
unnoticed.

| Receipt field | What is actually observed |
| --- | --- |
| `exchange_verified` | The raw key returns 401 when used directly as a bearer token; the exchanged access token re-validates against the expected tenant, audience, subject, scope set, credential id, and lifetime; **and** an in-scope `GET /ledger/accounts` with it returns 200. Re-decoding a token only proves what it says about itself, so the read has to succeed too. |
| `scope_denial_verified` | `POST /payment-intents/pi_0000…/approve` (an all-zero, unassigned ULID) returns 403 **and the reason is one of a known allowlist of insufficient-scope codes**. A bare 403 is not enough — a policy or tenant refusal is also a 403 — and a substring match is not enough either, since `tenant_scope_denied` contains "scope" while proving nothing about the credential's scopes. An unrecognised reason fails the check and is printed. |
| `key_lifecycle_verified` | brain-core's own agent-key record is `bff_service_v1`, `live`, bound to the same agent and tenant, carries exactly the BFF scope set, reports `revoked_at` **present and null**, an `expires_at` in the future, and a `last_used_at` that parses as a timestamp. An omitted `revoked_at` is an unknown, and an unknown revocation state is not an unrevoked key; `""` is not a timestamp. |
| `runtime_binding_verified` | The stored runtime credential row the app reads holds **this exact key**, not merely a string shaped like one. |

Each boolean is assigned from its check's result, and each check throws when it
does not hold — a receipt exists only for a tenant where all four were observed.
`server/brain/agent-api-key-migration.test.ts` drives each refusal against mocked
brain-core; every guard there has been checked to fail when its guard is removed.

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

> **UNPROVEN BY CONTRACT — needs brain-core.** The all-zero ULID is safe in
> practice, not by guarantee: brain-core has not committed to a reserved id space,
> nor to authorizing before resolving, so a production mutation endpoint is still
> being called. Ask brain-core for a guaranteed side-effect-free authorization
> surface (a scope-introspection read, or a documented reserved probe id). Until
> that exists, treat this probe as unproven rather than safe — which is another
> reason the manifest stays empty.

The retired receipt also carried `lifecycle: "completed"` and
`rollback_marker: false` as hardcoded constants. They asserted success rather than
observing it and are gone.

## Gate: no demo or synthetic tenant may be migrated

`assertTenantIsNotDemoSeeded()` runs before any credential is issued and reads
brain-core's own provenance record, not a local id list — a hardcoded exclusion
list only knows the demo tenants somebody remembered. It refuses on
`demo_seed:true`, on a `data_profile` starting `synthetic`, on
`access_stage=demo`, **and on every unknown answer**: read unavailable, response
naming a different tenant, field absent, field of the wrong type, field empty.
Malformed is as unknown as absent — a numeric `data_profile` rules out nothing.
"We could not tell" and "it is a real tenant" must never produce the same outcome.

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
2. **This BFF refuses to start a legacy-path migration whose rollback is close to
   expiring** (`assertLegacyRollbackWindowOpen`). Both the deadline and the stored
   JWT's own expiry must be at least 15 minutes away. This is a margin, not a
   timeout: nothing aborts a migration that overruns it, it only keeps an
   already-doomed one from starting.
3. **Rollback re-checks the window instead of trusting that pre-flight decision**,
   and branches on what actually happened:
   - the runtime row was never repointed (issuance succeeded, exchange failed) —
     nothing to restore, and the key is unreferenced, so it is revoked;
   - the row was repointed and the window is still open — restore the legacy JWT
     first, then revoke;
   - the row was repointed and the window has closed — the legacy JWT is dead, so
     restoring it would swap a working credential for a broken one. The issued key
     stays in place *unrevoked* and the tenant is escalated.

Every failure after issuance runs this cleanup. It is not a guarantee against
orphaning: if restoring the legacy credential fails, or the revoke call itself
fails, a live key can remain. Those states are not silent — grep the logs for
`MANUAL REPAIR REQUIRED` (row still points at the issued key) and
`ORPHANED CREDENTIAL` (unreferenced key that could not be revoked). Both need a
human.

## Withdrawn from batch 1

`tnt_01M1MDWXR5K5NBQYF089D4ZKCN` was the sole remaining candidate and is removed:

- `access_stage=demo`, `data_profile=synthetic_brightline_v1` — a demo tenant on
  synthetic fixture data, exactly what the gate above exists to exclude. It is
  absent from `demo_tenant_lifecycles`, which is why the earlier ephemeral-demo
  screens did not catch it.
- Its stored credential expired **2026-09-03T21:03:25Z**, five days before review.
  Migrating it would have had no working rollback from the start.

## Before adding any tenant to a batch

0. **Side-effect-free authorization surface — OUTSTANDING.** See the denial-probe
   note above. Without a guaranteed one, the verifier still calls a production
   mutation endpoint, safe only by convention. *Owner: brain-core.*
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
