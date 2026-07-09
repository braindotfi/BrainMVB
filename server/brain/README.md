# server/brain — brain-core integration (BFF)

Turns the BrainMVB Express server into a thin Backend-for-Frontend over the **brain-core**
protocol (live target: `https://api.brain.fi/v1`). The browser only ever calls same-origin
`/api/brain/*`; brain-core tokens are obtained and held **server-side** and never reach the client.

```
browser (session cookie) ──▶ /api/brain/ledger/accounts ──▶ BFF
                                                              │ getBrainSession(userId)  (auth.ts)
                                                              │   demo-provision: POST /v1/demo/provision-run
                                                              │   (X-Demo-Provision-Auth) → per-tenant token
                                                              ▼
                                            https://api.brain.fi/v1/ledger/accounts (client.ts)
```

## How it gets a token (auth.ts → `getBrainSession`)
- **staging-demo-token (staging only):** when `BRAIN_API_BASE_URL` points at
  `https://staging-api.brain.fi/v1`, the BFF calls the key-free `POST /v1/demo/token` (empty JSON
  body, no auth header) per the Brain staging integration guide. Staging hands back ONE 24h token
  (no member/agent split) which is used for every call. **Known issue (2026-07-09):** the live
  staging box currently returns `401 auth_token_missing` on this exact route even with no body/
  headers — i.e. the guide's own curl example 401s against the real staging server. The BFF code
  matches the documented contract exactly; this needs to be fixed staging-side before it will work.
- **demo-provision (preferred against the live/prod box, key-free):** when
  `BRAIN_DEMO_PROVISION_SECRET` is set (and `BRAIN_API_BASE_URL` is not staging), the BFF calls the
  already-live, fenced `POST /v1/demo/provision-run` with the `X-Demo-Provision-Auth` header.
  brain-core creates a fresh seeded tenant and returns a scoped per-tenant token (reads + propose,
  ~30 min). Cached per app-user. The signing key never leaves the box. This is the same path the
  BrainSaaS playground uses.
- **local-key (dev fallback only):** mint a JWT in-process with `BRAIN_AUTH_SIGN_KEY` (a private
  JWK) for `BRAIN_DEV_TENANT_ID`. Use only against a brain-core you control (e.g. `dev-up.sh`);
  never copy the prod key here.

## Files
- `config.ts` — reads all `BRAIN_*` env; `brainTokenMode()` picks the strategy.
- `ids.ts` — deterministic `user_<ULID>` subject (local-key mode only).
- `auth.ts` — `getBrainSession(appUserId)` → `{ token, tenantId }`, cached.
- `client.ts` — `brainRequest()` + typed helpers (`listLedgerAccounts`, `getWikiSchema`).
- `proxy.ts` — `/api/brain/*` router (GET-only passthrough; mounted in `server/routes.ts`).

## Secrets (Replit / env)

| Var | Required | What |
| --- | --- | --- |
| `BRAIN_DEMO_PROVISION_SECRET` | **yes** (demo-provision) | Shared secret for `POST /v1/demo/provision-run` (`X-Demo-Provision-Auth`). Key-free token source. |
| `BRAIN_API_BASE_URL` | no | Defaults to `https://api.brain.fi/v1`. |
| `BRAIN_AUTH_SIGN_KEY` | no | local-key dev fallback only — a private JWK to mint against a local brain-core. |
| `BRAIN_DEV_TENANT_ID` | no | Tenant for local-key mode (a `tnt_…` with a valid ULID). |
| `BRAIN_AUTH_ISSUER` / `BRAIN_AUTH_AUDIENCE` / `BRAIN_JWT_TTL_SECONDS` / `BRAIN_DEFAULT_SCOPES` | no | local-key tuning. |

> Without any token source, `/api/brain/*` returns `503 brain_unconfigured` and the UI falls back
> to its static data — the app still runs.

## Smoke test
```
BRAIN_DEMO_PROVISION_SECRET='<secret>' npm run brain:smoke
```
Provisions a tenant, reads `/wiki/schema` + `/ledger/accounts`. Verified PASS against api.brain.fi
(3 real accounts: Operating, Reserve, Brain Smart Account).

## Scope of this slice
GET reads only. Write paths (raw ingest, policy sign, payment-intent propose/approve/execute) are
added per-endpoint in later migration phases so an arbitrary session POST can't reach the money path.
Note: each `provision-run` call creates a fresh seeded demo tenant — a production per-user (non-demo)
tenant path is a later phase (would need a proper brain-core auth route landed via PR).
