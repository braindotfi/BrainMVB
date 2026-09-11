# Phase 3 — BFF agent API key migration

Migrating each production tenant's stored BFF credential from a long-lived agent
JWT to an exchange-only agent API key (`brain_ak_live_…`), verified at boot before
the server accepts traffic.

Code: `server/brain/agentApiKeyMigration.ts`, manifest and constants in
`server/brain/agentApiKeyMigrationBatch.ts`, behavioural tests in
`server/brain/agent-api-key-migration.test.ts`, structure pins in
`server/brain/agent-api-key-migration-structure.test.ts`.

## Current state

**Batch 1 is empty. Nothing migrates on boot by default.** The manifest ships empty on
purpose; `migrateConfiguredAgentApiKeyBatch()` returns immediately. Northstar also
stays dormant unless every control in the individually authorized path below is
present and exact. All three
brain-core prerequisites are wired: the provenance endpoint (**verified live from
this repo**, 2026-09-09) and the authorization probe plus the enforced legacy-JWT
boundary (**on brain-core's report — neither can be exercised from here without
minting an agent credential**). No tenant currently clears the gate — see [Batch composition](#batch-composition--read-live-2026-09-09).

## Verification makes no writes it expects to succeed

The verifier proves four things, and **every request it makes is a GET**. Scope
denial is proved against brain-core's own authorization probe rather than by
attempting a write, so there is no request in the sequence that could change
anything whatever the answer is.

`agent-api-key-migration.test.ts` pins this two ways, because neither alone is
enough: it asserts the complete inventory of direct HTTP requests, and separately
pins the call counts of the mocked brain-core helpers — a second
`issueBffAgentApiKey` would create an extra live production credential without
changing a single recorded request.

| Receipt field | What is actually observed |
| --- | --- |
| `exchange_verified` | The raw key returns 401 when used directly as a bearer token; the exchanged access token re-validates against the expected tenant, audience, subject, scope set, credential id, and lifetime; **and** an in-scope `GET /ledger/accounts` with it returns 200. Re-decoding a token only proves what it says about itself, so the read has to succeed too. |
| `scope_denial_verified` | `GET /authz/probes/payment-intent-approve` returns 403 **and the reason is one of a known allowlist of insufficient-scope codes**, `auth_scope_insufficient` among them. A `204 No Content` is the probe's "you hold this scope" answer and is a hard failure here, not a pass: it means the migrated BFF key can approve payments. A bare 403 is not enough — a policy or tenant refusal is also a 403 — and a substring match is not enough either, since `tenant_scope_denied` contains "scope" while proving nothing about the credential's scopes. An unrecognised reason fails the check and is printed. |
| `key_lifecycle_verified` | brain-core's own agent-key record is `bff_service_v1`, `live`, bound to the same agent and tenant, carries exactly the BFF scope set, reports `revoked_at` **present and null**, an `expires_at` in the future, and a `last_used_at` that parses as a timestamp. An omitted `revoked_at` is an unknown, and an unknown revocation state is not an unrevoked key; `""` is not a timestamp. |
| `runtime_binding_verified` | The stored runtime credential row the app reads holds **this exact key**, not merely a string shaped like one. |

Each boolean is assigned from its check's result, and each check throws when it
does not hold — a receipt exists only for a tenant where all four were observed.
`server/brain/agent-api-key-migration.test.ts` drives each refusal against mocked
brain-core; every guard there has been checked to fail when its guard is removed.

**How the denial probe got here.** Two earlier revisions are worth knowing about,
because both looked safe. The first selected a real payable invoice and proposed a
real payment against it — that creates a PaymentIntent, a policy decision and audit
evidence in a production tenant, and there is no delete path for any of it. The
second approved an all-zero, unassigned PaymentIntent id: still a POST to a
mutation route, safe only for as long as brain-core authorized before it resolved,
which it never promised to do. `GET /authz/probes/payment-intent-approve` needs
neither assumption — it reaches no domain service and answers the authorization
question directly.

**If the probe returns 404**, the probe surface is not deployed on the target and
scope denial is unproven. The verifier fails and says so, naming the 404. Do not
restore a mutating probe.

> **NOT VERIFIED FROM THIS REPO.** The probe's behaviour is taken from brain-core's
> description, not from an observed call. It cannot be exercised here without
> minting an agent credential, which this work is not permitted to do — and an
> unauthenticated probe proves nothing about it, because brain-core's auth
> middleware runs before routing: `/authz/probes/payment-intent-approve` and
> `/definitely-not-a-real-route` return the byte-identical 401
> `auth_token_missing`. The first real migration is therefore also the first test
> of this endpoint. Both wrong answers fail closed (404 → unproven, 204 →
> over-scoped credential), so a wrong assumption stops the migration rather than
> passing it.

The retired receipt also carried `lifecycle: "completed"` and
`rollback_marker: false` as hardcoded constants. They asserted success rather than
observing it and are gone.

## Gate: no demo or synthetic tenant may be migrated

`assertTenantIsNotDemoSeeded()` runs before any credential is issued and reads
`GET /v1/tenants/{id}/provenance` — brain-core's own record, not a local id list,
because a hardcoded exclusion list only knows the demo tenants somebody
remembered. Confirmed live against production under platform-service auth on
2026-09-09. (The older `GET /v1/tenants/{id}` is a *bearer*-auth route and answers
401 to the same credential; it is not the provenance surface.)

The live response is:

```json
{"tenant_id":"tnt_…","kind":"production","provisioning_state":null,
 "data_profile":null,"access_stage":null}
```

It refuses on `kind` other than `production`, on a demo `provisioning_state`, on a
`data_profile` carrying a fixture marker, on an `access_stage` outside the
recognised production set, on a legacy `demo_seed` that is anything but an
explicit `false`, **and on every unknown answer**: read unavailable, response
naming a different tenant, field absent, field of the wrong type, field empty,
field whitespace-only — and, decisively, field `null`. Every classification field
goes through one normaliser, so no field treats an unknown as an answer.

**`null` is the field that decides most tenants today, and it is a refusal.**
Production returns `null` classification for every tenant provisioned before
classification existed, including real customer tenants. `null` means *nobody
established what is in this tenant*, which is not the same as *confirmed not a
demo*. "We could not tell" and "it is a real tenant" must never produce the same
outcome.

**Not every field is decided the same way, and the difference is the limit of
this gate:**

- `access_stage` is an **allowlist** (`production`) because its values are
  enumerable. Acceptance is exact — `" production"` and `"Production"` are
  malformed, and malformed is unknown — so a value can only be widened
  deliberately, on evidence. Only `demo` has been observed live besides `null`,
  so the set may be too narrow; that errs toward holding tenants back.
- `data_profile` and `provisioning_state` are **denylists**, because their
  production vocabularies are open-ended and nothing published enumerates them.
  Refusal matching is normalised (trimmed, lower-cased, substring) so padding or
  casing cannot walk a value past the list: `"  Synthetic_Brightline "` and
  `"acme_demo_copy"` both refuse. But a value that is present, well-formed and
  carries no marker **passes even if nobody here has seen it before.**

So clearing the gate proves a tenant is *not obviously* a demo — not that it is a
confirmed production tenant. On the way out, the record that cleared is logged
verbatim:

```
[brain-agent-migration] provenance cleared tenant_id=… kind=… provisioning_state=… data_profile=… access_stage=…
```

**Whoever adds a tenant to the manifest must paste that line into the change that
adds it**, so the reviewer sees the classification the gate could not decide.
Nothing else in this repo retains it.

Get that record with a read — `GET /v1/tenants/{id}/provenance` under
platform-service auth returns exactly the fields the line reports. Do **not** run
the migration against a candidate to produce the log: by the time the line is
printed the run is already past the gate and on its way to issuing a live
credential.

`demo_seed` is no longer required, because the live contract does not publish it.
Requiring it would refuse every tenant for a reason that stopped being true. A
record that still carries it is still honoured, and anything other than an
explicit `false` is an unknown.

`PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS` (Northstar, golden demo, the shared
"Continue with Demo" tenant, the RFC 0008 acceptance tenant) remains a second,
independent refusal enforced in `validateAgentApiKeyMigrationBatch()`.

## Individually authorized Northstar migration

Northstar remains in `PROTECTED_AGENT_API_KEY_MIGRATION_TENANT_IDS` and can never
enter an ordinary batch. Its legacy BFF JWT expired on 2026-08-29, and its live
provenance is the exact pre-classification shape below:

```json
{"tenant_id":"tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ","kind":"production",
 "provisioning_state":null,"data_profile":null,"access_stage":null}
```

The separate `migrateAuthorizedNorthstarAgentApiKey()` entrypoint is dormant when
none of its controls are configured. If any control is present, all must be
present and exact or production boot fails before issuance:

- `NORTHSTAR_AGENT_API_KEY_MIGRATION_TENANT_ID` must be
  `tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ`.
- `NORTHSTAR_AGENT_API_KEY_MIGRATION_APPROVED_SHA` must be a full, lowercase
  40-character commit SHA and must exactly equal the commit embedded in the
  production build.
- `NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_START` must be
  `2026-09-12T08:00:00Z`.
- `NORTHSTAR_AGENT_API_KEY_MIGRATION_WINDOW_END` must be
  `2026-09-12T11:00:00Z`.
- `NORTHSTAR_AGENT_API_KEY_MIGRATION_AUTHORIZATION` must be
  `APPROVE_NORTHSTAR_2026_09_12_NO_LEGACY_ROLLBACK`.
- The process must be production and the current time must be in the half-open
  interval from the start through, but not including, the end.

This is an exact named exception, not an `allow_null_provenance` option. It reads
brain-core immediately before issuance and accepts only Northstar's exact tenant
id, `kind=production`, and three explicit null classification fields. A demo
marker, `demo_seed` other than absent or false, a response naming another tenant,
or any provenance drift fails before issuance. It never writes provenance.

The exception is also an explicit no-legacy-rollback mode. It validates that the
stored JWT is structurally bound to Northstar's tenant and agent, but its expiry
does not block issuance. On failure:

- If issuance fails ambiguously, the pre-issuance and post-failure key inventories
  are compared and any newly observed, unreferenced Northstar BFF key is revoked.
- If exchange or verification fails before the runtime row is changed, the unused
  issued key is revoked and the already-dead JWT row is left unchanged.
- If the runtime row holds the new key, or its state cannot be proved, that key is
  not revoked. The process emits `MANUAL REPAIR REQUIRED` and halts.
- No Northstar failure path writes the expired JWT back as a fallback.

Deploy the reviewed SHA before the window with this path dormant. Immediately
before cutover, repeat the calendar conflict check. Arm all five controls only
after that check clears, then deploy the exact same SHA. After a successful
receipt and external demo smoke test, remove all five one-time controls so a later
restart cannot attempt or block on the expired window.

## Legacy JWT rollback deadline — 2026-09-16T23:59:59Z (`LEGACY_AGENT_JWT_NOT_AFTER`)

Rollback for a legacy-JWT tenant means restoring the tenant's previous agent JWT
and revoking the freshly issued API key. That only works while the legacy JWT is
still valid, so the window has a fixed end.

Enforcement is split, and neither half substitutes for the other:

1. **brain-core enforces `LEGACY_AGENT_JWT_NOT_AFTER=2026-09-16T23:59:59Z` in
   production.** This is the real mechanism, not a date this repo chose; nothing
   in this BFF can invalidate a credential brain-core issued. At and after the
   boundary brain-core rejects any agent JWT carrying no `credential_id` — which
   is every legacy agent JWT, `credential_id` being what the exchange-only API
   keys introduced — and answers **410 Gone** on
   `POST /v1/tenants/{id}/agent-token`, so a replacement cannot be minted either.
   Both halves matter: rollback restores exactly such a JWT, and re-minting is not
   an escape hatch.
2. **This BFF refuses to start a legacy-path migration whose rollback is close to
   expiring** (`assertLegacyRollbackWindowOpen`). Both the deadline and the stored
   JWT's own expiry must be at least 15 minutes away. This is a margin, not a
   timeout: nothing aborts a migration that overruns it, it only keeps an
   already-doomed one from starting.
3. **Rollback re-checks the window instead of trusting that pre-flight decision**,
   and branches on **what the runtime row actually holds**, which is read back
   rather than inferred. A database write can commit and then fail to
   acknowledge, so a rejected `upsert` does not mean the row is unchanged, and
   guessing breaks the tenant either way: revoking a referenced key takes it
   offline, leaving an unreferenced one orphans a live credential.
   - row holds the legacy JWT (the repoint never happened, e.g. the exchange
     failed) — nothing to restore, the key is unreferenced, so it is revoked;
   - row holds the issued key and the window is still open — restore the legacy
     JWT first, then revoke. The restore is subject to the same ambiguity, so the
     row is read back again before anything is revoked;
   - row holds the issued key and the window has closed — the legacy JWT is dead,
     so restoring it would swap a working credential for a broken one. The issued
     key stays in place *unrevoked* and the tenant is escalated;
   - row state cannot be determined — nothing is revoked, and a human is asked.

Every failure after issuance runs this cleanup. It is not a guarantee against
orphaning: if restoring the legacy credential fails, if the row cannot be read, or
if the revoke call itself fails, a live key can remain. Those states are not
silent — grep the logs for `MANUAL REPAIR REQUIRED` (the row may still point at
the issued key, so it was deliberately left alone) and `ORPHANED CREDENTIAL`
(unreferenced key that could not be revoked). Both need a human.

## Withdrawn from batch 1

`tnt_01M1MDWXR5K5NBQYF089D4ZKCN` was the sole remaining candidate and is removed:

- `access_stage=demo`, `data_profile=synthetic_brightline_v1` — a demo tenant on
  synthetic fixture data, exactly what the gate above exists to exclude. It is
  absent from `demo_tenant_lifecycles`, which is why the earlier ephemeral-demo
  screens did not catch it.
- Its stored credential expired **2026-09-03T21:03:25Z**, five days before review.
  Migrating it would have had no working rollback from the start.

## Batch composition — read live 2026-09-09

Every tenant this repo knows of, against the live gate. `PROTECTED_…_TENANT_IDS`
is an independent refusal in `validateBatch()`, so the protected four cannot be
added even if their provenance later clears.

| Tenant | Live provenance | Gate | Why |
| --- | --- | --- | --- |
| `tnt_01M0KHRVY3RT3EXN7WT2SPDFMZ` (Northstar) | `kind=production`, `provisioning_state=null`, `data_profile=null`, `access_stage=null` | **HELD** | Unclassified. All three classification fields are `null`, so synthetic content cannot be ruled out. Also protected. |
| `tnt_00000000010000000000000000` (golden demo) | `kind=demo`, rest `null` | **HELD** | brain-core classifies it as a demo tenant. Also protected. |
| `tnt_01KYAT7A1QRKHTYW9H4RAR2SEX` ("Continue with Demo" shared) | `kind=production`, rest `null` | **HELD** | Unclassified — and note it reports `kind=production` despite being a known demo tenant, which is precisely why `null` must not clear a tenant. Also protected. |
| `tnt_01M1GTBQN8R8PB6X6PN73YB6NP` (RFC 0008 acceptance) | `provisioning_state=ready_demo`, `data_profile=synthetic_brightline_v1`, `access_stage=demo` | **HELD** | Explicit demo on synthetic fixture data. Also protected. |
| `tnt_01M1MDWXR5K5NBQYF089D4ZKCN` (withdrawn candidate) | `provisioning_state=ready_demo`, `data_profile=synthetic_brightline_v1`, `access_stage=demo` | **HELD** | Same, and its stored legacy JWT expired 2026-09-03. |

**Passing: none. The manifest stays empty.** No tenant known to this repo has a
classified provenance record, so there is nothing the gate can clear. Adding one
requires brain-core to classify a real production tenant — populate
`data_profile` and `access_stage` — after which its record can be read back here
and reviewed.

`GET /v1/tenants` is not available to platform-service auth (401), so this repo
cannot enumerate tenants; the list above is every id it holds. If brain-core has
production tenants not listed here, their provenance must be read before any of
them is proposed.

## Before adding any tenant to a batch

0. **Authorization probe — UNVERIFIED, see above.** `GET
   /authz/probes/payment-intent-approve` cannot be exercised from this repo
   without minting an agent credential. Both wrong answers fail closed.
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
3. **Provenance classification — OUTSTANDING.** The endpoint is live and the gate
   works; what is missing is data. Every tenant this repo knows of reports `null`
   classification or an explicit demo marker. *Owner: brain-core — classify the
   intended production tenants.*
4. Confirm the candidate's stored legacy JWT is still valid, and that the whole
   migration window closes before 2026-09-16T23:59:59Z.
