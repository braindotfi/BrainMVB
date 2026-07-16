# server/brain - brain-core integration (BFF)

Turns the BrainMVB Express server into a thin Backend-for-Frontend over the **brain-core**
protocol (live target: `https://api.brain.fi/v1`). The browser only ever calls same-origin
`/api/brain/*`; brain-core tokens are obtained and held **server-side** and never reach the client.

```
browser (session cookie) ──▶ /api/brain/ledger/accounts ──▶ BFF
                                                              │ getBrainSession(userId)  (auth.ts)
                                                              │   demo-provision or production session
                                                              │   member token + propose-only agent token
                                                              ▼
                                            https://api.brain.fi/v1/ledger/accounts (client.ts)
```

## How it gets a token (auth.ts → `getBrainSession`)
- **staging-demo-token (staging only):** when `BRAIN_API_BASE_URL` points at
  `https://staging-api.brain.fi/v1`, the BFF calls the key-free `POST /v1/demo/token` (empty JSON
  body, no auth header) per the Brain staging integration guide. Staging hands back ONE 24h token
  (no member/agent split) which is used for every call. **Known issue (2026-07-09):** the live
  staging box currently returns `401 auth_token_missing` on this exact route even with no body/
  headers - i.e. the guide's own curl example 401s against the real staging server. The BFF code
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
- `config.ts` - reads all `BRAIN_*` env; `brainTokenMode()` picks the strategy.
- `ids.ts` - deterministic `user_<ULID>` subject (local-key mode only).
- `auth.ts` - `getBrainSession(appUserId)` → `{ token, agentToken, tenantId }`, cached.
- `client.ts` - `brainRequest()` + typed helpers for ledger, policy, members, PaymentIntents,
  tenancy, and wiki calls.
- `proxy.ts` - `/api/brain/*` router mounted in `server/routes.ts`. It has a generic GET
  passthrough plus explicit POST/PATCH/DELETE routes listed below.

## Secrets (Replit / env)

| Var | Required | What |
| --- | --- | --- |
| `BRAIN_DEMO_PROVISION_SECRET` | **yes** (demo-provision) | Shared secret for `POST /v1/demo/provision-run` (`X-Demo-Provision-Auth`). Key-free token source. |
| `BRAIN_API_BASE_URL` | no | Defaults to `https://api.brain.fi/v1`. |
| `BRAIN_AUTH_SIGN_KEY` | no | local-key dev fallback only - a private JWK to mint against a local brain-core. |
| `BRAIN_DEV_TENANT_ID` | no | Tenant for local-key mode (a `tnt_…` with a valid ULID). |
| `BRAIN_AUTH_ISSUER` / `BRAIN_AUTH_AUDIENCE` / `BRAIN_JWT_TTL_SECONDS` / `BRAIN_DEFAULT_SCOPES` | no | local-key tuning. |

> Without any token source, `/api/brain/*` returns `503 brain_unconfigured` and the UI falls back
> to its static data - the app still runs.

## Smoke test
```
BRAIN_DEMO_PROVISION_SECRET='<secret>' npm run brain:smoke
```
Provisions a tenant, reads `/wiki/schema` + `/ledger/accounts`. Verified PASS against api.brain.fi
(3 real accounts: Operating, Reserve, Brain Smart Account).

## Scope and auth model
Every `/api/brain/*` route first requires a BrainMVB session via `requireAuth`. The browser never
receives a brain-core token. The generic catch-all remains **GET-only**; non-GET requests that do
not match an explicit route return 405.

### Generic read passthrough
- `GET /api/brain/*` forwards to the matching brain-core path with the member/session token.
- Examples include `/ledger/accounts`, `/ledger/transactions`, `/ledger/invoices`,
  `/ledger/counterparties`, `/members`, `/policy/:tenant`, and `/audit/events`.

### Explicit read-like POSTs
- `POST /api/brain/wiki/question` uses the member token. It is read-only despite POST because it
  asks the tenant wiki a question and returns grounded evidence.
- `GET /api/brain/recommendation` uses the member token through the same wiki question path.
- `GET /api/brain/approval-policy` uses the member token and tenant id to derive approval facts.

### Explicit agent-token writes
- `POST /api/brain/propose` uses the **agent token** only. The member token reads the invoice and
  evaluates policy for the trace; the agent token creates the PaymentIntent. The route proposes
  only and does not expose execution.

### Explicit member-token writes
- `POST /api/brain/reject` uses the member token to reject a proposed or pending PaymentIntent.
- `POST /api/brain/payment-intents/:id/approve` uses member tokens. When brain-core returns
  `awaiting_second_approval` and a second approver token is available, the BFF applies that second
  member signature. The agent token is never used for approval.
- `POST /api/brain/members`, `PATCH /api/brain/members/:id`, and
  `DELETE /api/brain/members/:id` use the member token; brain-core enforces admin authority.
- `POST /api/brain/members/:id/invites` and `DELETE /api/brain/members/:id/invites` use the
  member token; brain-core gates invite issue, reissue, and revoke.
- `POST /api/brain/ledger/counterparties` uses the member token to add a vendor counterparty. The
  BFF forwards identity fields only and never accepts payment, bank, trust, or actor fields from
  the client.

### Explicit platform-service writes
- `POST /api/brain/tenants` uses `BRAIN_PLATFORM_SERVICE_SECRET` through
  `X-Platform-Service-Auth` to create a production tenant for the current app user. It is explicit
  user action only and is not idempotent.
- `POST /api/brain/invites/consume` uses the same platform-service credential to bind an invite to
  the current app user after explicit confirmation.

### Not exposed
- No execute route is proxied.
- Raw document ingestion is handled outside this router by `/api/integrations/documents/ingest` in
  `server/routes.ts`; it streams bytes to brain-core after local source-document registration.
- Policy signing and on-chain money movement are not generic proxy capabilities.

In demo mode, each `provision-run` call creates a fresh seeded tenant. In production tenancy mode,
the app user must be linked through `brain_identities`; unlinked users receive `403 no_tenant` and
are routed to company setup.
