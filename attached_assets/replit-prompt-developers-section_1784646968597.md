# Build brief: Developers section for BrainMVB

## Objective
Add a "Developers" section to BrainMVB (github.com/braindotfi/BrainMVB) that lets a developer, without leaving the platform: create a tenant, issue an API key, view and rotate that key, see what it's been doing, and make their first `brain.ask()` call — using real brain-core endpoints, not mocked data.

## Design system — reuse, don't rebuild
Pull all visual tokens and components directly from the existing BrainMVB codebase rather than introducing new ones:
- Reuse the existing sidebar `Menu` component, its icon set, and its active/hover states exactly as implemented for Home/Finances/Review/Vendors/Rules/Activity. But place this under the Other section above settings.
- Reuse the **Settings page's two-column pattern** (main menu → secondary submenu column → content pane) as the structural template for Developers. Settings already proves this layout; Developers should be implemented with the same components, not a parallel implementation.
- Reuse the existing list-row-with-divider component used in the "Brain Detected" / "Brain Did" cards on Home for every list of items (keys, tenants, activity, usage-by-method).
- Reuse the existing metric-card component used for "Money in All Accounts" / "Net Cash Flow" on Home for the two summary numbers on Overview and Usage & Limits.
- Reuse the existing badge component (see "Active" on the Billing plan card, "Paid" on invoice rows) for key status (active/revoked) and environment (sandbox/live).
- Reuse the existing primary CTA button style ("+ Add Source") for "+ Create key" and "+ Create tenant".
- Do not touch the right-hand chat panel's structure — only add two developer-flavored quick-prompt chips to it when a Developers subpage is active (see "First call" below). It is otherwise unchanged.
- If a component library / design tokens file exists in the repo, import from it directly; don't hardcode colors or spacing that duplicate existing tokens.

## Information architecture
Add **Developers** to the main menu, positioned after Activity and before the "Other" group, using the same chevron-expand affordance Settings uses. Submenu (second column):

1. **Overview**
2. **API Keys**
3. **Tenants**
4. **Usage & Limits**
5. **Docs** — not a content pane. This is an external link (opens `https://docs.brain.fi/introduction/quickstart` in a new tab), styled like a nav item but visually distinguished (e.g. an external-link icon) since it leaves the app.

**Webhooks was considered and deliberately excluded from this build.** It isn't needed for any of the five core jobs and adds real scope (event delivery, retries, signing secrets) with no immediate user. Leave a code comment / ticket noting it as a natural v2 addition once tenants have outbound integrations to notify.

## Page specs

### Overview
- Sandbox/Live toggle in the page header (top right, next to the H1). This is the **global environment state for the whole Developers section** — persist it (e.g. `localStorage` or user preference in the session store) and read it on API Keys, Tenants, and Usage & Limits too, so switching once affects all four pages consistently.
- First-run only: a 3-step "get started" strip (Create tenant → Issue a key → Make your first call), each step showing complete/current state read from real data (does a tenant exist? does an active key exist? has any request been logged for this tenant?). Hide this strip permanently once all three are true — don't gate it on a dismiss button, derive it from state so it reappears correctly if, say, all keys get revoked.
- Two metric cards: requests today, active key count — both environment-scoped to the toggle.
- Recent activity list: last ~10 calls for the active tenant + environment, each row showing method, a short human-readable description, and relative time.

### API Keys
- List grouped by environment (Sandbox section, Live section), each row: masked key (`brain_sk_test_••••••4f2a` style — only prefix + last 4 ever rendered outside of the one-time creation moment), name, scopes, last-used, status badge, and actions (reveal — disabled after first view, rotate, revoke).
- "+ Create key" opens a form: name, scope checkboxes (map directly to real scopes the API enforces — don't invent scope names that don't exist in brain-core's policy layer), environment. On submit, show the plaintext key exactly once with a persistent "copy now, this won't be shown again" warning, then never return it again from any endpoint.
- Live section: if the tenant doesn't have live access yet (per the existing readiness/pilot-gating logic), show that state explicitly with a "request access" action instead of a disabled Create button — don't just hide the section.
- Rotate = atomically revoke the old key and issue a new one with the same name/scopes; show the new plaintext once, same as creation.

### Tenants
- List of tenants under the current org, each row: tenant id, which environments it has access to, created date, and a "Manage" action.
- "+ Create tenant" — name + id (slug), environment(s) to enable. The org's first/default tenant is created automatically at signup elsewhere in the platform; this page is for additional tenants only (e.g. per business unit, per client) — don't duplicate that automatic creation flow here.

### Usage & Limits
- Two metric cards: requests this month (with trend vs. prior month), current rate-limit tier (pulled from the same plan/billing record already shown in Settings > Billing — don't create a second source of truth for plan tier).
- Breakdown-by-method list (`brain.ask`, `brain.pay`, `accounts.list`, etc.) with call counts for the selected environment and window.

### First `brain.ask()` call
No new UI. Add two quick-prompt chips to the existing chat panel, visible only while a Developers subpage is active: "Run a test brain.ask() call" and "Show my usage this month." Both should populate and submit a real prompt through the chat panel's existing `brain.ask` pipe, scoped to the currently active tenant + environment from the Developers section — this is the actual completion of that job, not a separate sandboxed widget.

## Backend / data architecture — this must be real, not mocked

**Tenants**
- Source of truth: brain-core's existing tenant records (the same ones that populate the org context already visible on Home, e.g. "ACME Inc."). Do not create a parallel tenant store.
- If brain-core doesn't yet expose a scoped list/create endpoint for this UI, add:
  - `GET /v1/orgs/:orgId/tenants`
  - `POST /v1/orgs/:orgId/tenants`

**API Keys** — new resource in brain-core if it doesn't already exist:
- Table: `api_keys (id, tenant_id, name, environment, scopes[], key_prefix, key_last4, hashed_secret, created_at, last_used_at, revoked_at, rotated_from_id)`
- Never store the plaintext key. Hash the secret portion (SHA-256 or bcrypt) before persisting; the plaintext is returned exactly once in the creation/rotation response body and never again.
- Endpoints:
  - `POST /v1/tenants/:id/keys` — issue (returns plaintext once)
  - `GET /v1/tenants/:id/keys` — list (masked)
  - `POST /v1/keys/:id/rotate` — revoke + issue atomically, same name/scopes
  - `DELETE /v1/keys/:id` — revoke
- Auth middleware on `staging-api.brain.fi` / `api.brain.fi` hashes the incoming key on each request and matches against `hashed_secret`; update `last_used_at` asynchronously so it doesn't add latency to the request path.
- Reuse the existing error registry (`auth_invalid_key`, `tenant_not_found`, `rate_limited`) for every failure state in this UI rather than inventing new error copy.

**Usage & Limits / Activity feed**
- Source directly from the existing Layer 6 audit/metering log — every call is already logged there per brain-core's architecture. Don't stand up a separate analytics pipeline.
- Add a read aggregation endpoint: `GET /v1/tenants/:id/usage?window=30d&environment=sandbox` returning counts grouped by method and by day.
- The Overview "Recent activity" list is just the latest N rows from that same audit log, filtered by tenant + environment (and optionally by key, if a key-scoped view is wanted later).
- Rate-limit tier displayed on Usage & Limits comes from the tenant's existing plan record (same one Settings > Billing already reads) — one source of truth.

**Sandbox/Live gating**
- Reuse the existing readiness-summary fencing logic that already prevents mainnet execution against the unaudited escrow contracts. Live key issuance and Live usage should reflect that same gate — if a tenant isn't cleared for the pilot, API Keys > Live shows the "request access" state described above rather than a functioning create flow.

## Explicit non-goals for this build
- No Webhooks page or event-delivery system.
- No new design components — everything above should be assembled from what Home and Settings already demonstrate.
- No mock/static data anywhere in the four pages — every number, list, and status shown must come from a real endpoint, even if that endpoint is thin (e.g. a one-line aggregation query) rather than fully productionized.
