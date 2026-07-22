# Developers section — wire to live brain-core endpoints (addendum)

This replaces the placeholder/local-storage behavior from the earlier prompts with the real endpoints merged in brain-core PR #309 (`feat(api): add tenant api keys`). Confirm `BRAIN_API_KEY_AUTH_ENABLED=true` and `BRAIN_API_KEY_PEPPER` are set on the environment BrainMVB points at before shipping this — until then these endpoints exist but won't actually authenticate anything.

## Endpoints to call (replace any local/mocked key storage with these)

- **Issue**: `POST /v1/tenants/:tenantId/keys` — body `{ name, environment, scopes }`. `environment` is `"sandbox"` or `"live"`. `scopes` must be a non-empty array drawn from `ledger:read`, `audit:read` — these are the only two real scopes; drop any scope checkboxes in the create-key form that don't map to one of these. Response includes the plaintext secret **once** — this is the value to show in the "shown once" box, nothing else.
- **List**: `GET /v1/tenants/:tenantId/keys` → `{ keys: [...] }`, each masked to `key_prefix` + `key_last4` (e.g. `brain_sk_test_` + `4f2a`). Build the masked display string client-side from these two fields rather than expecting a pre-formatted string from the API.
- **Rotate**: `POST /v1/keys/:id/rotate` — no body. Atomically revokes the old key and returns a newly issued one (same name/scopes/environment) with the plaintext secret shown once, same UI treatment as issuance. Wire this to the Rotate button in the key detail modal.
- **Revoke**: `DELETE /v1/keys/:id` → `204` on success. Wire to the Revoke button (keep the confirm step before calling this — it's destructive and immediate).
- **Usage**: `GET /v1/tenants/:tenantId/usage?window=30d&environment=sandbox&key_id=...` — `key_id` is optional; omit it for the tenant-wide Usage & Limits page, include it when showing usage inside a specific key's detail modal (this is the per-key attribution that wasn't available before — add a small usage summary to the key detail modal now that it's real). Response shape: `{ tenant_id, window, total_events, keys: [{ key_id, environment, event_count, first_event_at, last_event_at }] }`.
- **Production tenant creation**: `POST /v1/orgs/:orgId/tenants` — only call this once the platform is actually in production tenancy mode. In demo tenancy mode, the "+ Create tenant" button should keep showing the existing demo-mode explanation rather than calling this endpoint.

## Error handling
Map these directly from brain-core's error envelope rather than inventing new UI copy:
- `auth_invalid_key` — invalid or revoked key attempted a call. Surface this if a user tries to use a key you know is revoked (e.g. testing from the "try it" panel).
- `rate_limited` — per-key rate limit hit (600 requests / 60s by default). Show the existing rate-limited state rather than a generic error.
- `api_key_not_found` — 404 on rotate/revoke for a key id that doesn't exist or was already revoked (rotate/revoke are idempotent-unsafe here — a double-click could hit this, so handle it gracefully, not as a crash).

## Copy changes now that enforcement is real
Remove or rewrite anything implying keys are cosmetic:
- API Keys page footnote: drop "Enforcement inside brain-core's API gateway is rolling out — until then, keys authenticate against platform endpoints only." Replace with nothing, or a short confirmation that keys are live if you want a positive statement.
- Usage & Limits footnote: drop "Per-key attribution arrives once brain-core enforces platform-issued keys" — it's arrived. Update to describe the real behavior: usage is attributed per-key going forward; calls made before enforcement was enabled (or made without a key) remain attributed at the tenant/environment level only, not retroactively assigned.
- Overview's enforcement-gap status line (added in the earlier round) can be removed entirely.

## What NOT to build yet
Two items are explicitly still pending product sign-off (see brain-core's CLAUDE.md) and should not be assumed or built around:
- What happens to demo-mode tenants/keys when an org transitions to production (archive/delete/migrate) — don't build any auto-migration behavior.
- What happens to in-flight requests when a demo tenant's ~30-minute session expires (immediate rejection vs. grace period) — the expiry countdown UI can display time remaining, but don't build specific handling for the expiry moment itself until this is decided.

## Sequencing
This is a full-pass update, not incremental — wire all of the above together (rotate, revoke, per-key usage, error states, copy cleanup) in one PR rather than shipping the endpoint calls ahead of the copy cleanup or vice versa, since a half-updated page (real rotate button, stale "not enforced" text) would be more confusing than the current honestly-incomplete state.
