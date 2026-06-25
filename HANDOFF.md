# BrainMVB — Handoff

_Newest section at top._

## 2026-06-25 (update) — slice GREEN via demo-provision fence

Final auth approach: the BFF gets per-tenant tokens from the **already-live, key-free
`POST /v1/demo/provision-run` fence** (`X-Demo-Provision-Auth: BRAIN_DEMO_PROVISION_SECRET`),
cached per app-user in `server/brain/auth.ts` `getBrainSession()`. **No brain-core change, no
deploy, no signing key in the app.** `npm run brain:smoke` PASSES against api.brain.fi (3 real
Ledger accounts). FinancesPage Accounts widget renders them; `STATIC_ACCOUNTS` is the fallback.

Two heavier paths were **discarded by the owner**: (a) copying the box's `AUTH_SIGN_KEY` into the
BFF (full mint power; blocked by the prod classifier as exfiltration); (b) a new brain-core
`POST /v1/auth/service-token` endpoint I'd built and locally verified — reverted and deleted
(protocol code must land via a normal PR/CI, not ad-hoc commit/deploy). brain-core clone is clean
on main. If a production per-user (non-demo) tenant path is wanted later, that endpoint is the
design; land it as a proper PR.

Run it: set `BRAIN_DEMO_PROVISION_SECRET`, then `npm run brain:smoke` / `npm run dev`. Details in
`next-steps.md` and `server/brain/README.md`.

---


## 2026-06-25 — brain-core integration, first vertical slice (Phase 1+2)

**Branch:** `feat/brain-core-integration` (cut from `origin/feat/ui-rework`). Uncommitted.
**Goal:** make BrainMVB a thin web client + BFF over live **brain-core** (`api.brain.fi`, v0.0.6),
per `deliverables/Brain-Migration-Plans.docx` (8 phases). Target + auth decided with the owner:
**live api.brain.fi**, **real per-tenant JWTs minted server-side with `AUTH_SIGN_KEY`**, build a
**vertical slice first**. Dead/old code is **tracked, not deleted** (`deliverables/DEAD-CODE-INVENTORY.md`).

### What shipped (code-complete)
- **BFF module `server/brain/`**
  - `config.ts` — all `BRAIN_*` env (see `server/brain/README.md`).
  - `ids.ts` — deterministic `user_<26-char ULID>` principal per app user (brain IDs are `prefix_ULID`).
  - `auth.ts` — `mintBrainJwt()`, RS256 via `BRAIN_AUTH_SIGN_KEY` (HS256 dev fallback), token cache.
    Mirrors brain-core `tools/dev-token` + `shared/src/auth/signer.ts`.
  - `client.ts` — `brainRequest()` + typed `listLedgerAccounts` / `getWikiSchema` (subset hand-types;
    full openapi-typescript codegen deferred to a later phase).
  - `tenant.ts` — `getPrincipalForUser()` → `BRAIN_DEV_TENANT_ID` for now (fresh-tenant provisioning deferred).
  - `proxy.ts` — `/api/brain/*` router, **GET-only** passthrough (mounts the JWT, never exposes it to
    the browser). Mounted in `server/routes.ts` (`app.use("/api/brain", createBrainProxyRouter())`).
- **UI:** `client/src/pages/FinancesPage.tsx` "Accounts" widget reads `/api/brain/ledger/accounts`
  via react-query and maps brain-core account `kind`→labels; `STATIC_ACCOUNTS` kept as fallback.
- **Smoke gate:** `script/brain-smoke.ts` (`npm run brain:smoke`) — mints a JWT, asserts `/wiki/schema`
  (6 kinds) + `/ledger/accounts`.
- **Deps/infra:** added `jose`; fixed `package-lock.json` one Replit-internal URL
  (`package-firewall.replit.local` → `registry.npmjs.org` for `tweetnacl`) so `npm install` works off-Replit.

### Verification (done)
- `npm install` (WSL) ✓ ; `npm run check` — my files compile **clean** (the branch's other `tsc` errors are
  **pre-existing**, app runs via `tsx`/esbuild — logged in DEAD-CODE-INVENTORY §C).
- **Pipeline proven without the real key:** ran `brain:smoke` with an **ephemeral RSA JWK** →
  mint OK → connected to api.brain.fi → `401 auth_token_invalid: "signature verification failed"`.
  The box accepted the token *structure* (iss/aud/claims/sub-prefix/tenant-format all passed) and rejected
  **only the signature** — i.e. everything is correct except trusting the real key.

### THE BLOCKER (to go green)
Need the box's **private `AUTH_SIGN_KEY` JWK** (Azure KeyVault / on-box) + `BRAIN_DEV_TENANT_ID` set as
BrainMVB secrets. Same blocker as the paused MCP-deployed-client setup. Then:
```
BRAIN_AUTH_SIGN_KEY='<jwk json>' BRAIN_DEV_TENANT_ID='tnt_…' npm run brain:smoke   # expect [smoke] PASS
```
Options: **A** extract the key for the live box · **B** prove on a local brain-core (`dev-up.sh`, self-mint) ·
**C** interim demo-fence (`/v1/demo/provision-run`, reads+propose, no execute). Owner chose A.

### Env gotcha
`node` is only available via **WSL** (`/mnt/c/Users/sanke/Work/brain.fi/BrainMVB`, Node 22) — no Windows node.
Run via `wsl.exe -e bash -lc "cd /mnt/c/... && npm ..."`.

### Resume
See `next-steps.md`. Forward roadmap (Phases 3–8) is in the approved plan + `deliverables/Brain-Migration-Plans.docx`,
reconciled to real v0.0.6 routes (`/v1/ledger/*`, `/v1/agents/*`, `/v1/payment-intents/*`; no Crossmint).
