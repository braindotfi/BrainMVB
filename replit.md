# Brain. Your AI Brain, built to run finance for you.

An AI that runs your finances for you. Agents propose, humans approve, and a separate
protocol (brain-core) executes. Settlement is anchored on Base L2.

> **Companion doc:** `CLAUDE.md` holds the canonical, break-easily-silently contracts
> (rule/vendor/document reference resolution, the 9 dev coherence guards, actor↔payee
> convention). This file is the overview; it summarizes those contracts and points to
> CLAUDE.md for the full detail. Keep both current.

## Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, `wouter` routing
- **Backend**: Express.js (same server/port via Vite)
- **Auth**: Custom username/email + password (scrypt) + Google OAuth 2.0, express-session
  cookie sessions (`server/auth.ts`). Login accepts a username OR email.
- **Web3**: wagmi v2, viem, RainbowKit (wallet connect; SIWE retained, not primary login)
- **AI**: Anthropic SDK (`ANTHROPIC_API_KEY`), model `claude-opus-4-5`
- **DB**: Drizzle ORM + PostgreSQL (DatabaseStorage, falls back to MemStorage if no DATABASE_URL)
- **Smart Contracts**: Hardhat + Base Sepolia (in `contracts/`)
- **brain-core**: live protocol at `https://api.brain.fi/v1`, reached ONLY via the BFF proxy
  `/api/brain/*` (`server/brain/`). The browser never sees a brain-core JWT.

## Key Files
- `shared/schema.ts` — Drizzle schema
- `server/routes.ts` — all API routes; `server/storage.ts` — MemStorage + DatabaseStorage +
  `IStorage`; `server/db.ts` — Drizzle pool
- `server/auth.ts` — sessions, scrypt, Google OAuth, `requireAuth` middleware
- `server/policyEngine.ts` — off-chain policy eval + ECDSA proof signing (viem)
- `server/contractService.ts` — viem reads/writes to contracts (demo fallback)
- `server/plaid.ts` — lazy Plaid client (sandbox default)
- `server/brain/` — brain-core BFF (auth/token source, typed client, `/api/brain/*` proxy)
- `client/src/App.tsx` — root app, routing, gates app on `isLoggedIn`
- `client/src/lib/authContext.tsx` — session-based auth context
- `client/src/lib/web3Provider.tsx` — provider tree (see Provider Order below)
- `client/src/pages/sections/BrainAssistant.tsx` — right-hand AI chat panel
- `client/src/components/AddSourceModal.tsx` — data-ingestion connector wizard
- `client/src/components/OnboardingFlow.tsx` — 8-step onboarding (step 1 = Plaid)
- `client/src/pages/SettingsPage.tsx`, `client/src/components/settings/figma/*` — settings

## Critical Gotchas
- **`tweetnacl` is a direct dependency** — `vite.config.ts` reads
  `node_modules/tweetnacl/nacl-fast.js` directly (a leftover from the removed Crossmint SDK).
  Do NOT remove it or the dev server won't boot.
- **Provider order (critical)**: `WagmiProvider > QueryClientProvider > RainbowKitProvider`.
  The `QueryClientProvider` in `web3Provider.tsx` uses the shared `queryClient` from
  `@/lib/queryClient`.
- **Never use derived arrays as `useEffect` dependency arrays** — use primitive values.
- **Figma font syntax**: `font-['Gilroy:Medium',sans-serif]` is invalid (the colon breaks the
  family name). Use `font-['Gilroy',sans-serif] font-medium`. Gilroy loads via bunny.net at the
  top of `client/src/index.css` (weights 400/500/600/700/800).
- **Route ordering**: register specific routes before generic param routes — both on the server
  (`/api/integrations/documents/:id/delete` before `/api/integrations/:toolId/disconnect`) and
  in wouter (`/rules/:id` before `/rules`).
- **WireX credentials are broken** (`access_denied`) — demo fallback active in
  `/api/wirex/accounts`.

## Design Tokens & Color Discipline
- Background: `#0d1017` / `#11141b`. Purple accent (interactive/affirmative): `#7631ee`.
  Gold/orange: `#ff9500` / `#f59e0b`. Baby blue: `#a8b9f4` (60%), `#6c779d` (30%).
- **`#d20344` is ONLY for danger/alerts/reject/destructive** — never for affirmative actions.
  Orange is reserved for active tabs (e.g. the "Due today" bill chip uses baby blue, not orange).
- Fonts: Gilroy (headings), JetBrains Mono (numbers/code/amounts/ids/dates).
- Panel: `rounded-[16px] bg-[#11141b] border-[#1d2132]`. Cards: `bg-[#0a0c10]` (no border).

## Data Sources — core-backed vs mock
A surface is **CORE-BACKED** only when it consumes the real brain-core API (and any mock layer
is deleted). Current state:

| Surface | Source |
|---|---|
| Finances tab (accounts, transactions, counterparties, invoices) | CORE-BACKED via `/api/brain/ledger/*`; mock only as fallback |
| HomePage "Brain's take" / Brain Assistant chat | CORE-BACKED (Claude, ledger-grounded); static/canned fallback |
| Bills inbox + Review live PaymentIntents (`useIntents`) | CORE-BACKED (read + propose/reject only) |
| Review "Needs Review" queue (`useBrainReviewQueue`) | CORE-BACKED read via `/api/brain/actions`; mock (`MOCK_PROPOSALS[0]`) fallback only when the live queue is empty — it drives the demo propose → executing → settled flow |
| Vendors (Counterparties tab) | CORE-BACKED read via `/api/brain/ledger/counterparties`; mock (`MOCK_VENDORS`) fallback |
| Rules, Documents (viewer/resolution), Audit Log (`/audit-log`) | MOCK-ONLY (`client/src/lib/mock*.ts` via `rulesStore`/`documentsStore`/`mockAuditRecords`). NOTE: document *ingestion* (AddSource) is CORE-BACKED — see "Document Ingestion" below — but the document *viewer/resolution* store is mock. |
| Members & approval authority (Settings → Team) | CORE-BACKED via `/api/brain/members` + `/approval-policy` (member/user-principal token); no mock fallback (see `.agents/memory/members-authority-integration.md`) |

## Production tenancy (Phase 2, `BRAIN_TENANCY_MODE=production`)
Demo mode (default) is byte-identical to before (`/api/brain/tenancy` → `{mode:"demo",
linked:true}`). Production: `brain_identities` table maps app userId → tenantId/userPrincipalId
(`external_ref` = app userId, never email); platform-service calls (`server/brain/tenancy.ts`,
`X-Platform-Service-Auth: BRAIN_PLATFORM_SERVICE_SECRET`) do createTenant/exchangeSession/
refreshSession/consumeInvite; `createProductionSession` in `auth.ts` (no identity → 403
`no_tenant`, never auto-provision; refresh-then-reauth; member token also backs propose).
Tenant creation is NOT idempotent — never auto-retry. Client: `TenancyGate` in `App.tsx` →
`CompanySetupPage` (create company / join with invite, `/invite/:token`); SignupPage adds a
Company name field when `/api/config.tenancyProduction`; Team UI gets invite pill +
Resend/Revoke. Full contract in CLAUDE.md "Production tenancy".

## brain-core BFF (`server/brain/`)
- Token source: **demo-provision** (preferred, key-free) — the BFF POSTs
  `/demo/provision-run` with `BRAIN_DEMO_PROVISION_SECRET` and uses the per-tenant token it
  returns (reads + propose, no execute, ~30 min, cached per app user). Fallback: **local-key**
  (in-process JWT mint for a brain-core you control).
- **staging-demo-token** (added 2026-07-09, staging target only): when `BRAIN_API_BASE_URL` is
  set to `https://staging-api.brain.fi/v1`, `getBrainSession` instead POSTs the key-free
  `/demo/token` (empty body, no header) per Brain's staging integration guide and uses the single
  24h token for everything (no member/agent split there). Code-complete and matches the guide's
  own curl examples exactly, but as of 2026-07-09 the live staging box 401s
  (`auth_token_missing`) on that exact route — a staging-side issue, not a client bug. Left
  unset/disabled (defaults back to demo-provision against the live box) until staging is fixed;
  flip `BRAIN_API_BASE_URL` to the staging URL to re-enable once confirmed working.
- Proxy (`proxy.ts`): requires a session, mints/attaches the token, forwards `/api/brain/<path>`
  → `${baseUrl}/<path>` (baseUrl already includes `/v1`). Generic GET is proxied; the explicit
  writes exposed are `POST /api/brain/propose` `/reject` (propose uses the AGENT token) and the
  member/approval writes `POST /members`, `PATCH/DELETE /members/:id`,
  `POST /payment-intents/:id/approve` (all MEMBER token). `GET /approval-policy` too.
- **Two principals (token rule)**: demo provisioning returns a MEMBER token (user-principal,
  bootstrap admin) AND an AGENT token (propose-only). The **MEMBER token backs ALL non-propose
  calls** — reads, member/approval/admin, policy; the **AGENT token is propose-ONLY** and
  correctly 403s `actor_unresolved` on member/approval endpoints (agents propose, humans approve).
  `auth.ts` reads `member_token`/`tokens.member.token` + `agent_token`/`tokens.agent.token` (legacy
  single `token` = agent); it THROWS if no member token (no silent agent-token fallback). See the
  members memory note.

## API Endpoints
- **Auth** (`server/auth.ts`): `POST /api/auth/register` `/login` `/logout` `/demo`,
  `GET /api/auth/user`, `GET /api/auth/google` + `/callback`. `GET /api/config` →
  `{ googleEnabled }`. SIWE: `GET /api/auth/nonce`, `POST /api/auth/verify` (general
  `POST /api/auth/logout` clears the session).
- **Assistant**: `POST /api/assistant/chat` (`requireAuth`) — zod-validated `messages`, Claude
  with a Brain system prompt. 503 `assistant_unconfigured`, 402 `assistant_no_credit`, 500
  `assistant_failed` — each with a user-facing `reply` string.
- **Brain proxy**: `GET /api/brain/*` (reads incl. `/members`, `/approval-policy`),
  `POST /api/brain/propose` `/reject` (agent token); member/approval writes (member token):
  `POST /api/brain/members`, `PATCH/DELETE /api/brain/members/:id`,
  `POST /api/brain/payment-intents/:id/approve`; `GET /api/brain/recommendation`.
- **WireX** (all `requireAuth`, email from session): `GET /api/wirex/accounts` `/transactions`,
  `POST /api/wirex/onboard`.
- **Account** (`requireAuth`): `DELETE /api/account` `/account/data`.
- **Contracts**: `GET /api/contracts/info`, `/account/:ownerAddress`,
  `/agent/:brainAccountAddress/:agentId`, `/registry/:agentId`; `POST /api/contracts/deploy-account`.
- **Policy**: `POST /api/policy/evaluate/payment` `/evaluate/trade` `/hash`.
- **Integrations**: `GET/POST /api/integrations/documents`,
  `POST /api/integrations/documents/:id/delete`, `/plaid/disconnect`, `/:toolId/disconnect`,
  `/stripe/connect`.

## Auth Notes
- `requireAuth` guards protected routes via `req.session.userId`.
- Register: `email` + `password` (+ optional `username`, `name`); username defaults to email.
  Login: `{ identifier, password }` (email lookup, then username).
- `POST /api/auth/demo` logs into a shared demo account (`demo@brain.finance`). SignupPage demo
  buttons call `loginDemo(fresh)`, toggling `brain_onboarding_complete_<userId>` localStorage
  (Fresh shows onboarding, Existing skips it).
- Google OAuth: button renders only when both Google secrets are set. Callback failures redirect
  to `/?auth_error=<code>`; `SignupPage.tsx` maps codes to friendly messages.
- SIWE nonce: `/api/auth/nonce` uses a CSPRNG (`generateNonce()` in `server/nonce.ts`,
  `crypto.randomBytes(32).toString("hex")`), never `Math.random()`. Consume-before-validate,
  expiry, and address binding are unchanged. Pinned by `server/nonce.test.ts`.

## Testing & CI
- `npm test` runs the vitest suite (`vitest.config.ts`, dedicated — does not extend
  `vite.config.ts`). Suites: `server/brain/bff-invariants.test.ts`, `server/nonce.test.ts`,
  and the `client/src/lib/*.test.ts` brain suites.
- `.github/workflows/test.yml` runs `npm test` on every pull request and on push to `main`
  (Node 20, npm cache). It is a MERGE GATE: any change to `server/brain/*` must keep the
  invariant suite green or the PR cannot land. Once this line lands on `main` via the
  platform merge flow, `main` is the source of truth.

## Onboarding, Plaid & Add Source
- `OnboardingFlow.tsx` step 1 (`StepConnectBank`) + `AddSourceModal` use Plaid Link.
- `server/plaid.ts` — sandbox default (honors `PLAID_ENV`); products Auth + Transactions;
  countries US + CA. Sandbox login: `user_good` / `pass_good`. Storage: `bank_connections` PG
  table; `accessToken` is stripped before returning to the client.
- `AddSourceModal.tsx` — source-agnostic connector wizard using a **screen stack** (push/back),
  not fixed steps: connected sources, categories, bank (Plaid), providers (Stripe live via
  `/api/integrations/stripe/connect`; others "Coming soon"), documents (upload). Documents:
  `sourceDocuments` PG table — **only metadata + ingestion state persisted locally, no file bytes /
  object storage.** File bytes stream to brain-core (see Document Ingestion below).

## Document Ingestion — thin client over brain-core (CORE-BACKED)
- Upload (`AddSourceModal` DocumentUpload) POSTs raw bytes to `POST /api/integrations/documents/ingest`
  (auth-gated, `express.raw` octet-stream ≤52mb, metadata in query). Server → brain-core `/raw/ingest`
  (multipart, `source_type` = `pdf_upload|csv_upload`) → stores `raw_id`/`sha256` → triggers
  `/raw/{raw_id}/extract`. Extract **404 → `unavailable`** ("coming soon"), **422 → `unsupported`**.
  Doc `extractStatus`: pending→ingested→extracting→extracted (or unsupported/unavailable/failed).
- **All document routes are `requireAuth` + session-scoped** (`req.session.userId`), NOT the app-wide
  `DEMO_USER` used by bank/tool connections — obligations/wiki are brain-core tenant-scoped by session.
- `ReadingScreen` reads live doc `extractStatus` (polls 15s while in progress); `FoundScreen` reads
  live `/api/brain/ledger/obligations` (tolerant: 404/empty → [], polls 15s while empty, no infinite
  spinner) + resolves counterparties via `/ledger/counterparties`; `WikiQuestionBox` → `POST
  /api/brain/wiki/question`. All via MEMBER token.
- **Extracted data is ADVISORY (conf ≤0.5)** — always shows a "needs confirmation" pill + advisory
  banner; there is **NO document → payment path**. brain-core methods: `ingestRawDocument`,
  `extractRawDocument`, `listObligations`, `askWikiQuestion` in `server/brain/client.ts`.

## Brain Assistant Panel
- `client/src/pages/sections/BrainAssistant.tsx` — right-hand chat panel. Collapsed rail
  `w-[54px]` / expanded `w-[390px]`. Sessions with search + dropdown; per-row Active/Delete icons.
- **Live Claude chat**: `sendMessage` optimistically appends the user bubble (creating a session
  if needed) + an animated assistant placeholder, then `fetch`es `POST /api/assistant/chat`. It
  reads the JSON body even on non-2xx (so backend error `reply` strings surface) and falls back to
  `CANNED_REPLY`; a `sending` state disables send. Collapsed Expand → `expandToLastSession`.
- Input = Attach (`Plus`) + Send (`ArrowUp`) only. Timestamp divider uses `@assets/Time_*.png`.
- The old Send/Exchange modals in `App.tsx` are dead-but-harmless (no longer openable).

## Settings UI (Figma rebuilds)
- Subpages in `client/src/components/settings/figma/`: Security, Notifications, Payments, Agents,
  Team, Legal, Account. Shared primitives in `FigmaPrimitives.tsx`; `ProfileSection` inline in
  `SettingsPage.tsx`.
- **Team** (`TeamSection.tsx`) — Members & approval authority, CORE-ONLY (no mock fallback, no
  client-side enforcement). Reads `/api/brain/members` + `/approval-policy` (react-query), primes
  `membersStore`; rows open `MemberDetailPopup.tsx` via `openMemberDetail(id)` (`MemberDetailHost`
  mounted once in `App.tsx`). Add-member form POSTs verbatim `{displayName,email,role,approval:{
  domains,perItemLimit,requiresSecondApproverAbove}}`; core refusals surface inline (#d20344) via
  `mapApprovalRejection`. Locked "Enforced by Brain core" rows (self-approval blocked, tenant
  second-approver threshold) are READ from `/approval-policy`, never hardcoded. `membersApi.ts`
  formatters: int64-max `perItemLimit` (~9.2e18, `UNLIMITED_FLOOR=1e15`) renders "No per-item
  limit". Second approval in `/review`: `ReviewPage.handleLiveApprove` POSTs
  `/payment-intents/:id/approve`, maps all rejection reasons (`self_approval_blocked` has TWO cases
  split by `detail.payee_unresolved`), and on `awaiting_second` toasts + keeps the item in queue.
- Figma icons: SVGs in `attached_assets/figma_icons/` (subfolders `sub/`, `nav/`, `add-money/`,
  `exchange/`) with typed registries in `client/src/assets/*-icons.ts`. To add one: download the
  URL hash → `attached_assets/figma_icons/<subdir>/<name>.svg`, then add the import + map entry to
  the matching registry.

## Finances Tab — popup detail cards (live brain-core)
- `client/src/pages/FinancesPage.tsx` drives the FINANCES tabs. Detail cards pull from LIVE
  brain-core Ledger via `/api/brain/ledger/*`; mock only as fallback. Read-only, data-derived,
  NO setTimeout.
- **Accounts**: rows clickable ONLY when the account has an `id` (`clickable = !!acc.id`); the
  mixed "Account Totals" row is not. Click → `AccountDetailSheet.tsx` (provenance/confidence/
  status/synced + recent activity filtered by `account_id`, top 5 → `TransactionDetailSheet`).
  **Currency honesty**: render fiat (USD) through `useCurrency().format`, but a non-fiat token
  (ETH, `currency !== "USD"`) in NATIVE units — never run a token amount through the USD→display
  converter. Account ids are ephemeral per demo provisioning — never hardcode.
- **Bills** (`BrainBillsInbox.tsx`): bill info tappable (`open-bill-<n>`) → `BillDetailSheet.tsx`.
  3-state bridge via `useIntents`: flagged→`#d20344`, proposed→purple "Review proposal"→`/review`,
  else muted info.
- **Recent / Income**: rows open the shared `TransactionDetailSheet.tsx` (enriched From/To,
  Account, Reconciliation). `IncomeTxList` renders inflows inline; the demo seed is all inflows so
  **Expenses honestly renders empty** (never faked). **Liabilities**: "View bills to pay →"
  switches to the Bills tab.
- **Deviations**: (1) Recent/activity rows open the LIVE `TransactionDetailSheet`, not the
  mock-only `openDocumentDetail` bank_transaction path. (2) `ruleConsistencyCheck.ts` guards mock
  stores and is N/A to live brain-core data.

## Needs Review (`/review`) — propose → approve → execute
- Data-driven approval queue. Model in `client/src/lib/proposalTypes.ts`; 8 mock scenarios +
  `ACCOUNT_SUMMARY` in `client/src/lib/mockProposals.ts`. ONE `ProposalDetail.tsx` renders all
  scenarios via conditional sections — never per-agent JSX.
- Status overrides live in the shared `client/src/lib/reviewStatusStore.ts` (`useSyncExternalStore`,
  SSOT shared with HomePage's "Brain Detected" widget). Fully user-driven, NO setTimeout:
  approve→`executing` (held; manual Cancel→pending / Mark settled→executed), reject→`rejected`,
  postpone→`postponed`, verifyFirst→`verifying`. Settled items collapse into "Settled today".
  Module-global (not reset on logout).
- **Invariant**: `ACCOUNT_SUMMARY.pendingAPTotal` (10,514) MUST equal the sum of the money-mover
  AP proposals (Con Edison 486 + Apex 1,450 + Bright Futures 3,200 + Comcast 1,228 + AWS 4,150).
  `sweepMath` must keep `operatingAfter > 0` after a ≥3-month buffer + pending AP.
- Live brain-core PaymentIntents (`useIntents`) + legacy static `NEEDS_REVIEW` still render via
  the older `ReviewModal`.

## Rules store & Report-a-Problem (`/rules/:id`)
- `client/src/lib/rulesStore.ts` — `useSyncExternalStore` SSOT for the standing rules (active
  state, scope cap/allowlist, `ProblemReport[]`), seeded from `mockRules.ts`. Receipts,
  `ReviewPage`, and `RuleDetail` all read/write it. Rule ids are URL-safe slugs (route `/rules/<id>`,
  NOT policyId). Threshold/amount editing lives on `RuleDetail`, not the list rows.
- Receipt report flow (`ProposalDetail` auto-handled branch): preset chips + optional note →
  confirm ("Pause rule and review" purple / "Just send feedback") — pausing is NEVER silent.
- `RuleDetail.tsx`: paused-from-report banner (#D20344 only) with linked payment, Active/Paused
  toggle (resume needs confirm + resolves open reports), remediations, reported-problems trail.
  Linked payment → `/review?receipt=<id>` (ReviewPage auto-opens via `useSearch()`).
- Related pending-item flag (ReviewPage `relatedRuleFor`): NON-BLOCKING note, never changes status.
- `ActivityPage.tsx` surfaces `AUTO_HANDLED_PROPOSALS` receipts as `paid` items ("Brain Did" tab);
  only rows with `linkTo` are clickable and navigate to the receipt.
- Naming conventions platform-wide: "Crypto Account" (not "Your Wallet"/"Stablecoin Account"),
  "Agent Account" (generic; proper agent names unchanged).

## Reference contracts — resolution + coherence (summary; full detail in CLAUDE.md)
Every "Linked" reference (audit log, receipts, settled cards) is referenced **BY ID** and resolved
through ONE helper against ONE canonical store, with a resolve-or-plain-text fallback:
- **Rules** → `openRuleDetail`/`getRule` (`rulesStore`) → `/rules/:id`.
- **Vendors** → `openVendorDetail`/`resolveVendor` (`mockVendors.ts`) → `/vendors?vendor=<id>`.
- **Documents** → `openDocumentDetail`/`resolveDocument` (`mockDocuments.ts`/`documentsStore.ts`)
  → opens `DocumentViewerPopup`. `document.vendorId` + `proposal.invoiceId` must also be canonical.

Key rules (see CLAUDE.md for the exhaustive version):
- **ONE generalized evidence viewer**: `DocumentViewerPopup.tsx` renders every `DocKind`
  (`invoice`|`prior_payment`|`bank_transaction`|`contract`|`purchase_order`) from ONE
  `DocumentRecord` (`documentTypes.ts`) — no per-kind type/component. Always shows provenance + a
  "viewer, not the system of record" caption. It replaced the invoice-only viewer.
- **Non-vendor counterparties** (payroll employees, DeFi protocols, internal ledgers) are NOT
  vendors — use `linked[]` kinds `employee`/`protocol`/`ledger` and render as plain, non-tappable
  text. Never label them `kind:"vendor"`.
- **Lifecycle coherence** (proposal→document→audit→anchor): a settled/anchored record must not link
  a still-pending proposal (settled events point at their OWN settled twin, e.g. `AWS_SETTLED` vs
  `prop-aws`); a proposal's `invoiceId` must match its status; a flagged record MAY link a pending
  proposal and MAY be anchored (a hold is auditable). Standalone settled/held twins must be
  registered in `openProposalDetail.ts` `allProposals()`.
- **Vendor `history` must reconcile** with its referenced documents/payments (amounts, dates, tier,
  trustStatus) — a human-approved-above-limit payment is NOT "trusted".
- **Actor vs payee**: ACTOR = who decided (human-approval steps carry `actor`; UI resolves a muted
  role suffix from `client/src/lib/actors.ts`). PAYEE = who was paid (derived centrally by
  `linkedRelationship(record, link)` in `auditTypes.ts`). One convention, data-driven.
- **Unified dev guard**: `client/src/lib/ruleConsistencyCheck.ts` (dev-boot in `main.tsx`, never
  throws) runs ALL resolution + coherence checks for every entity type (rule/vendor/document/
  proposal/anchor-UI/agent-domain/actor-payee/member-actor). Extend this module; don't fork it. All
  shipped mock refs must resolve. Full breakdown of the 9 guards is in CLAUDE.md.

## Other Notable UI
- Sidebar "Rules" nav shows a suggestion-count badge (`client/src/lib/rule-suggestions.ts`).
- HomePage "Needs Review" rows open a centered Radix-dialog popup (focus trap / scroll lock).

## Smart Contracts (contracts/)
- `BrainAccount.sol` (ERC-4337 smart account), `PolicyValidator.sol` (on-chain ECDSA proof
  verification), `AgentRegistry.sol` (ERC-8004 inspired), `BrainAccountFactory.sol` (CREATE2).
- **Modes**: `CONTRACT_MODE=demo` (default, mock). Live chain needs `POLICY_SIGNER_PRIVATE_KEY`,
  `DEPLOYER_PRIVATE_KEY`, `ALCHEMY_API_KEY`, `POLICY_VALIDATOR_ADDRESS`, `AGENT_REGISTRY_ADDRESS`,
  `BRAIN_ACCOUNT_FACTORY_ADDRESS`.
- **Domain tags** (must match Solidity ↔ TypeScript): Payment
  `keccak256("BrainFinance:PaymentProof:v1")`, Trade `keccak256("BrainFinance:TradeProof:v1")`.
- Deploy: `cd contracts && npm install && npm run compile && npm run deploy:sepolia`. Test:
  `cd contracts && npm test`.

## Secrets Needed
- `ANTHROPIC_API_KEY` — Claude (assistant, insights, goal recommendations).
- `BRAIN_DEMO_PROVISION_SECRET` — brain-core demo-provision token source (preferred). Local-key
  fallback: `BRAIN_AUTH_SIGN_KEY` / `BRAIN_AUTH_JWT_SECRET` + `BRAIN_DEV_TENANT_ID`. Optional
  `BRAIN_API_BASE_URL` (defaults to `https://api.brain.fi/v1`).
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Google OAuth (optional). Redirect URI:
  `<app-origin>/api/auth/google/callback`.
- `SESSION_SECRET` — express-session signing (dev default if unset).
- `PLAID_CLIENT_ID` + `PLAID_SECRET` (configured); optional `PLAID_ENV`.
- `WIREX_CLIENT_ID` + `WIREX_CLIENT_SECRET` (auth broken, demo active).
- `ALCHEMY_API_KEY` (RPC + deploy, public RPC fallback), `DEPLOYER_PRIVATE_KEY`,
  `POLICY_SIGNER_PRIVATE_KEY`, `BASESCAN_API_KEY`.

## Removed Features
- Agents pages, Marketplace, agent wallet/debit cards, `/api/agents` + `/api/marketplace`.
- Crossmint (June 2026): all `@crossmint/*` code, `/api/crossmint/wallet`,
  `.crossmint-form-wrapper` CSS (see the `tweetnacl` gotcha above).
