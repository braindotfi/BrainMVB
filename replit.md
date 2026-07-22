# Brain. Your AI Brain, built to run finance for you.

An AI that runs your finances for you. Agents propose, humans approve, and a separate
protocol (brain-core) executes. Settlement is anchored on Base L2.

> **Companion doc:** `CLAUDE.md` holds the canonical, break-easily-silently contracts
> (production tenancy, reference resolution, the 9 dev coherence guards, actor↔payee
> convention). This file is the short overview; when in doubt, CLAUDE.md wins.

## Stack
- **Frontend**: React + Vite + TypeScript, Tailwind, shadcn/ui, `wouter`
- **Backend**: Express (same server/port via Vite)
- **Auth**: username/email + scrypt password + Google OAuth, express-session (`server/auth.ts`)
- **Web3**: wagmi v2, viem, RainbowKit (SIWE retained, not primary login)
- **AI**: Anthropic SDK (`ANTHROPIC_API_KEY`), model from `ANTHROPIC_MODEL` (defaults to `claude-opus-4-8`)
- **DB**: Drizzle + PostgreSQL (DatabaseStorage; MemStorage fallback if no DATABASE_URL)
- **Contracts**: Hardhat + Base Sepolia in `contracts/` (`CONTRACT_MODE=demo` default; domain
  tags must match Solidity↔TS: `BrainFinance:PaymentProof:v1` / `TradeProof:v1`)
- **brain-core**: `https://api.brain.fi/v1`, reached ONLY via the BFF proxy `/api/brain/*`
  (`server/brain/`). The browser never sees a brain-core JWT.

## Key Files
- `shared/schema.ts` — Drizzle schema; `server/storage.ts` — `IStorage` + Mem/DB impls
- `server/routes.ts` — all API routes; `server/auth.ts` — sessions + `requireAuth`
- `server/brain/` — brain-core BFF (auth/token source, typed client, proxy, tenancy)
- `server/policyEngine.ts`, `server/contractService.ts`, `server/plaid.ts`
- `client/src/App.tsx` — routing, auth gate, `TenancyGate`
- `client/src/pages/sections/BrainAssistant.tsx` — right-hand AI chat panel
- `client/src/components/AddSourceModal.tsx` — connector wizard (screen stack, not fixed steps)
- `client/src/pages/SettingsPage.tsx` + `client/src/components/settings/figma/*` — settings

## Critical Gotchas
- **`tweetnacl` is a direct dependency** — `vite.config.ts` reads
  `node_modules/tweetnacl/nacl-fast.js` directly. Do NOT remove it or the dev server won't boot.
- **Provider order**: `WagmiProvider > QueryClientProvider > RainbowKitProvider`
  (`web3Provider.tsx` uses the shared `queryClient` from `@/lib/queryClient`).
- **Never use derived arrays as `useEffect` deps** — use primitive values.
- **Figma font syntax**: `font-['Gilroy:Medium',...]` is invalid — use
  `font-['Gilroy',sans-serif] font-medium`. Gilroy loads via bunny.net in `index.css`.
- **Route ordering**: specific routes before generic param routes, on the server AND in wouter
  (`/rules/:id` before `/rules`).
- The old Crossmint/WireX architecture is gone. Do not use the April migration DOCX files as an
  implementation guide for cards, bank accounts, or stablecoin balances.
- Account/rule/invoice ids from demo provisioning are ephemeral — never hardcode.

## Design Tokens & Color Discipline
- Background `#0d1017` / `#11141b`. Purple accent (interactive/affirmative) `#7631ee`.
  Orange `#ff9500`/`#f59e0b` (active tabs only). Baby blue `#a8b9f4` (60%), `#6c779d` (30%).
- **`#d20344` is ONLY danger/reject/destructive** — never affirmative.
- Fonts: Gilroy (headings), JetBrains Mono (numbers/amounts/ids/dates).
- Panel: `rounded-[16px] bg-[#11141b] border-[#1d2132]`. Cards: `bg-[#0a0c10]` (no border).

## Data Sources — core-backed vs mock
CORE-BACKED (live `/api/brain/*`, mock only as fallback unless noted): Finances tab ledger
surfaces; Brain's take / Assistant chat (Claude, ledger-grounded); Bills inbox read path;
PaymentIntents (`useIntents`, session-scoped local overlay); Review queue (`useBrainReviewQueue`,
mock `MOCK_PROPOSALS[0]` only when live queue empty); Vendors read; Members & approval
authority (Settings → Team, NO mock fallback); Audit Log (`useBrainAuditRecords`, live
`/audit/events` + latest anchor, NO demo-record fallback); document ingestion (AddSource).
MOCK-ONLY: Rules and document viewer/resolution stores (`client/src/lib/mock*.ts`).

## Production tenancy (`BRAIN_TENANCY_MODE=production`; full contract in CLAUDE.md)
- Demo mode (default) is byte-identical to before (`/api/brain/tenancy` → demo/linked).
- `brain_identities` maps app userId → tenantId/userPrincipalId (`external_ref` = userId, never
  email). Platform-service calls (`server/brain/tenancy.ts`, `X-Platform-Service-Auth`) do
  createTenant/exchangeSession/refreshSession/consumeInvite/mintAgentToken.
- `createProductionSession` in `auth.ts`: no identity → 403 `no_tenant`, never auto-provision;
  refresh-then-reauth. **Tenant creation is NOT idempotent — never auto-retry.**
- **Production AGENT token**: per-tenant, stored in `brain_agent_tokens`, captured at tenant
  creation, refreshed/backfilled idempotently via `POST /tenants/{id}/agent-token`. Verified
  evidence on 2026-07-17: brain-core PR #250 merged as `0821e60`, that SHA has prod deploy tag
  `deploy/prod/20260714T123355Z-0821e60`, and unauthenticated probes to
  `POST https://api.brain.fi/v1/tenants` and
  `/v1/tenants/tnt_probe/agent-token` returned 401 rather than 404, so the routes are deployed
  and auth-gated. I did **not** have `BRAIN_PLATFORM_SERVICE_SECRET`, so successful production
  tenant creation and agent-token minting still need maintainer confirmation with a credentialed
  post-deploy probe. If minting fails (outage/rollback), sessions degrade to the member token
  (reads work, propose 403s honestly, loud warning).
- Client: `TenancyGate` → `CompanySetupPage` (create company / `/invite/:token`); SignupPage
  adds Company name when `/api/config.tenancyProduction`; Team UI has invite pill + Resend/Revoke.

## brain-core BFF (`server/brain/`)
- Token source: **demo-provision** (preferred, key-free) — POST `/demo/provision-run` with
  `BRAIN_DEMO_PROVISION_SECRET`, per-tenant token cached ~30 min per app user. Fallback:
  local-key JWT mint. (A staging-demo-token path exists for `staging-api.brain.fi` but the
  staging box 401s as of 2026-07-09 — left disabled.)
- **Two principals**: the MEMBER token backs ALL non-propose calls (reads, member/approval,
  policy); the AGENT token is propose-ONLY (403 `actor_unresolved` elsewhere). `auth.ts` THROWS
  if no member token — no silent agent-token fallback.
- Proxy: session-gated, generic GET pass-through; explicit writes are `POST /api/brain/propose`
  (agent token), `POST /api/brain/reject`, member writes for members, invites, vendor
  counterparties, and `POST /payment-intents/:id/approve`, plus platform-service writes for
  tenant creation and invite consume. The current Bills UI does **not** call the propose route;
  re-wire it before documenting the end-user propose flow as working.

## API Endpoints (details in `server/routes.ts` / `server/auth.ts`)
- Auth: `POST /api/auth/register|login|logout|demo`, `GET /api/auth/user`, Google OAuth +
  `/callback`, SIWE `GET /api/auth/nonce` (CSPRNG, pinned by `server/nonce.test.ts`) +
  `POST /api/auth/verify`. `GET /api/config`. Login accepts `{identifier, password}`.
  `POST /api/auth/demo` = shared demo account; the single "Continue with Demo" button always
  sets the `brain_onboarding_complete_<userId>` localStorage flag (skips onboarding).
- Assistant: `POST /api/assistant/chat` — zod-validated, Claude; 503/402/500 errors each carry
  a user-facing `reply`.
- Brain proxy: see BFF above; also `GET /api/brain/recommendation`, `/approval-policy`.
- Developers API keys are brain-core-backed (PR #309): `/api/developers/keys` (+rotate/
  DELETE-revoke/key-usage) proxy `/v1/tenants/:id/keys` etc. via the member session; upstream
  flag-off 404 → honest 503 `keys_api_unavailable`, NO local fallback or key storage. Masking
  is client-side from `keyPrefix`+`keyLast4`. Key-authed platform API: `GET /api/v1/ping`
  (Authorization: Bearer `brain_sk_...`) validates the key against brain-core directly.
- Account delete, Contracts read/deploy, Policy evaluate/hash, Integrations
  (documents CRUD + ingest, plaid/stripe/tool connect-disconnect).

## Testing & CI
- `npm test` = vitest (`vitest.config.ts`, dedicated — does NOT extend `vite.config.ts`).
  Suites: `server/brain/bff-invariants.test.ts`, `server/brain/production-agent-token.test.ts`,
  `server/nonce.test.ts`, `client/src/lib/*.test.ts`.
- `.github/workflows/test.yml` is a MERGE GATE: any `server/brain/*` change must keep the
  invariant suite green.

## Onboarding, Plaid, Add Source & Document Ingestion
- `OnboardingFlow.tsx` step 1 + `AddSourceModal` use Plaid Link (sandbox default,
  `user_good`/`pass_good`; `accessToken` stripped before returning to the client).
- Documents: `sourceDocuments` PG table stores metadata + ingestion state ONLY — no file bytes.
  Bytes stream to brain-core: `POST /api/integrations/documents/ingest` (raw octet-stream
  ≤52mb) → core `/raw/ingest` → `/raw/{id}/extract` (404→`unavailable`, 422→`unsupported`).
  `extractStatus`: pending→ingested→extracting→extracted (or unsupported/unavailable/failed).
- **All document routes are `requireAuth` + session-scoped** (NOT the app-wide `DEMO_USER`).
- Extracted data is ADVISORY (conf ≤0.5) — "needs confirmation" pill + banner; **NO
  document → payment path**. `FoundScreen` reads live `/ledger/obligations` (tolerant,
  404/empty→[]); `WikiQuestionBox` → `/api/brain/wiki/question`. All via MEMBER token.

## Notable UI conventions
- **Brain Assistant**: live Claude chat, optimistic bubbles, reads JSON body even on non-2xx
  (backend error `reply` surfaces), `CANNED_REPLY` fallback. Collapsed rail 54px / 390px open.
- **Settings → Team** (`TeamSection.tsx`): CORE-ONLY members & approval authority; locked
  "Enforced by Brain core" rows READ from `/approval-policy`, never hardcoded; int64-max
  `perItemLimit` renders "No per-item limit". Second approval in `/review` maps all rejection
  reasons; `awaiting_second` toasts and stays queued.
- **Finances tab**: detail sheets are read-only, data-derived, NO setTimeout. Currency honesty:
  fiat via `useCurrency().format`; non-USD tokens in NATIVE units (never USD-converted).
  Demo seed is all inflows so Expenses honestly renders empty.
- **Needs Review** (`/review`): data-driven queue; ONE `ProposalDetail.tsx` for all scenarios;
  status overrides in `reviewStatusStore.ts` (SSOT, user-driven, no setTimeout). Invariant:
  `ACCOUNT_SUMMARY.pendingAPTotal` must equal the sum of money-mover AP proposals; `sweepMath`
  keeps `operatingAfter > 0`.
- **Rules** (`rulesStore.ts` SSOT, slug ids): receipt report flow — pausing is NEVER silent;
  `RuleDetail` paused-banner (#d20344), resume needs confirm. Sidebar Rules badge from
  `rule-suggestions.ts`.
- **Reference contracts** (full detail in CLAUDE.md): every linked reference resolves BY ID via
  ONE helper against ONE canonical store, with plain-text fallback; ONE generalized
  `DocumentViewerPopup` for all DocKinds; non-vendor counterparties (employee/protocol/ledger)
  are never `kind:"vendor"`; actor=who decided, payee=who was paid; the unified dev guard is
  `client/src/lib/ruleConsistencyCheck.ts` — extend it, don't fork it.
- Naming: "Crypto Account" (not "Your Wallet"), "Agent Account" (generic).
- Figma icons: SVGs in `attached_assets/figma_icons/<subdir>/` + typed registries in
  `client/src/assets/*-icons.ts`.

## Secrets
- `ANTHROPIC_API_KEY`; optional `ANTHROPIC_MODEL`; `ENCRYPTION_KEY` for Plaid token encryption;
  `BRAIN_DEMO_PROVISION_SECRET` (+ optional `BRAIN_API_BASE_URL`;
  local-key fallback `BRAIN_AUTH_SIGN_KEY`/`BRAIN_AUTH_JWT_SECRET` + `BRAIN_DEV_TENANT_ID`);
  `BRAIN_PLATFORM_SERVICE_SECRET` (production tenancy); `SESSION_SECRET`;
  `GOOGLE_CLIENT_ID`+`GOOGLE_CLIENT_SECRET` (optional; redirect `/api/auth/google/callback`);
  `PLAID_CLIENT_ID`+`PLAID_SECRET` (+`PLAID_ENV`).
- Contracts live mode: `POLICY_SIGNER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, `ALCHEMY_API_KEY`,
  deployed addresses; `BASESCAN_API_KEY`.

## Removed Features
- Agents pages/Marketplace, agent wallets/cards, `/api/agents` + `/api/marketplace`.
- Crossmint and WireX architecture (removed; see the stale banner in the April migration DOCX
  files).
