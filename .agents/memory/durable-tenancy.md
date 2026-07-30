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
- **"Continue with Demo" never touches `/demo/provision-run`.** Durable mode is checked BEFORE
  the token-mode strategies in createSession, so even with the demo-provision secret still set,
  the button provisions a *production* tenant (POST /v1/tenants + /tenants/{id}/agent-token).
  Core-side demo seeding is requested via a `demo_seed: true` flag on tenant create, which
  seeds while keeping `kind='production'` — that flag is the ONLY way seeded demo data can
  reach this app. Gate it on the demo-email predicate, the same one guarding the local seed,
  and omit the key entirely (never `false`) for real signups.
  **Why:** provision-run always mints a *fresh* tenant and cannot re-attach, and the platform
  agent-token route rejects demo tenants, so persistence across logins was impossible on the
  demo fence; durable mode was the deliberate trade, and the flag is what un-breaks seeding
  without giving that up. Between 2026-07-24 (durable mode) and the flag landing, the demo
  button was silently unseeded — treat any walkthrough-based verification from that window as
  never having exercised the seed path.
  **How to apply:** before verifying any brain-core demo-seeded feature from this app, confirm
  which path a login takes (workflow log `durable tenant ... created`, or the
  `auth.production_agent_token.minted` audit event) AND that the create response carried a
  `demo_seed` summary — its absence means the core predates the flag, not that the UI is broken.
  Note the app's own `seedTenantDocuments` also runs for demo accounts; once core-side seeding
  is live, check whether the two overlap before assuming duplicated data is a bug.
- **The public demo entry point must mint a FRESH identity per visitor, never a shared one.**
  A shared demo account backed by durable tenancy means every visitor lands in one persistent
  tenant and inherits whatever the last person did. The subtler failure: because that tenant
  already exists, login re-attaches instead of creating, so it **silently never picks up any
  fix that only takes effect at tenant-creation time** — a create-time seed flag can be
  correct, deployed, and provably working, and the shared button still shows the old state.
  **Why:** this exact combination made a verified-working seed fix look like it had changed
  nothing. Re-attach is the default path for any returning identity; only creation runs
  creation-time logic.
  **How to apply:** when a create-time flag "doesn't work", first ask whether the account
  under test is creating a tenant or re-attaching to an existing one. For demo surfaces,
  prefer a per-visitor identity and keep the shared account for internal/debug only. Budget
  for the cost: each fresh tenant provisions upstream AND emits an on-chain audit anchor, so
  a public unauthenticated create path needs its own tight rate limit (separate from ordinary
  auth limits) and a TTL/expiry story, or demo traffic quietly spends real funds.
- **Tenancy `mode` is global env-derived, never a per-user/per-session classification.**
  It comes from BRAIN_TENANCY_MODE + the platform secret alone — not from user records,
  email patterns, or brain-core tenant metadata. `isDemoEmail()` (which drives `user.isDemo`
  and demo seeding) is a SEPARATE axis. **How to apply:** a report that "signups are being
  misclassified as demo" is not a classification bug — every user in the deployment gets the
  same mode. Check the env var before hunting for per-session logic.
- Durable now reports its own mode string `"durable"` (was `"demo"`), and /tenancy returns
  the real tenantId/companyName. **Why:** durable tenants are genuine brain-core PRODUCTION
  tenants (kind=production, sandbox=false) that persist forever; labeling them "demo" told
  clients their real data was throwaway session scratch and made UI copy claim a fake ~30min
  expiry. **How to apply:** the company-setup gate keys on `mode === "production"` ONLY, so a
  third value is safe there — but audit anything doing `!== "production"` and inferring "demo",
  and any `mode === "demo"` branch that now falls through to an else meant for production.
- Suites in server/brain/*.test.ts read env at module-eval: any workspace-set
  BRAIN_TENANCY_MODE / BRAIN_PLATFORM_SERVICE_SECRET leaks into vitest and flips code
  paths — demo-path suites must explicitly `delete` those vars at the top.
