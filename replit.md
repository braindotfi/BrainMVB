# Brain Finance

Programmable neobank on Base L2.

## Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, `wouter` routing
- **Backend**: Express.js (same server/port via Vite)
- **Auth**: Custom username/email + password (scrypt) + Google OAuth 2.0, express-session
  cookie sessions (`server/auth.ts`). Login accepts a username OR email.
- **Web3**: wagmi v2, viem, RainbowKit (wallet connect; SIWE retained, not primary login)
- **AI**: Anthropic SDK (`ANTHROPIC_API_KEY`), model `claude-opus-4-5`
- **DB**: Drizzle ORM + PostgreSQL (DatabaseStorage, falls back to MemStorage if no DATABASE_URL)
- **Smart Contracts**: Hardhat + Base Sepolia (in `contracts/`)

## Key Files
- `shared/schema.ts` — Drizzle schema
- `server/routes.ts` — all API routes
- `server/storage.ts` — MemStorage + DatabaseStorage + `IStorage`; `server/db.ts` — Drizzle pool
- `server/auth.ts` — sessions, scrypt, Google OAuth, `requireAuth` middleware
- `server/policyEngine.ts` — off-chain policy eval + ECDSA proof signing (viem)
- `server/contractService.ts` — viem reads/writes to contracts (demo fallback)
- `server/plaid.ts` — lazy Plaid client (sandbox default)
- `client/src/App.tsx` — root app, routing, gates app on `isLoggedIn`
- `client/src/lib/authContext.tsx` — session-based auth context
- `client/src/lib/web3Provider.tsx` — provider tree (see Provider Order below)
- `client/src/pages/sections/BrainAssistant.tsx` — right-hand AI chat panel
- `client/src/components/AddSourceModal.tsx` — data-ingestion connector wizard
- `client/src/components/OnboardingFlow.tsx` — 8-step onboarding (step 1 = Plaid)
- `client/src/pages/SettingsPage.tsx`, `client/src/components/settings/figma/*` — settings

## Critical Gotchas
- **`tweetnacl` is a direct dependency** — `vite.config.ts` reads
  `node_modules/tweetnacl/nacl-fast.js` directly. It was originally a transitive dep of the
  (now removed) Crossmint SDK. Do NOT remove it or the dev server won't boot.
- **Provider order (critical)**: `WagmiProvider > QueryClientProvider > RainbowKitProvider`.
  The `QueryClientProvider` in `web3Provider.tsx` uses the shared `queryClient` from
  `@/lib/queryClient`.
- **Never use derived arrays as `useEffect` dependency arrays** — use primitive values.
- **Figma font syntax**: `font-['Gilroy:Medium',sans-serif]` is invalid (the colon breaks
  the family name → falls back to plain sans-serif). Use
  `font-['Gilroy',sans-serif] font-medium` instead. Gilroy is loaded via bunny.net at the
  top of `client/src/index.css` (weights 400/500/600/700/800).
- **Route ordering**: register specific routes before generic param routes (e.g.
  `/api/integrations/documents/:id/delete` before `/api/integrations/:toolId/disconnect`).
- **WireX credentials are broken** (`access_denied`) — demo fallback active in
  `/api/wirex/accounts`.

## Brain Assistant Panel
- `client/src/pages/sections/BrainAssistant.tsx` — right-hand chat panel (replaces the old
  account panel in `App.tsx`). Collapsed rail `w-[54px]` / expanded `w-[390px]`. Sessions
  with search + dropdown; per-row Active/Delete icons (delete on hover/focus, keyboard
  accessible). Built from Figma file `cC2lQwC3g9hv96o5Wgy8Ek`.
- **Live Claude chat**: `sendMessage` is async — optimistically appends the user bubble
  (creating a session if needed) + an empty assistant placeholder (animated typing
  indicator), then `fetch`es `POST /api/assistant/chat`. It reads the JSON body even on
  non-2xx (so backend error `reply` strings reach the UI) and falls back to `CANNED_REPLY`.
  A `sending` state disables the send button. The collapsed Expand button calls
  `expandToLastSession` (opens the most recent session, not a new one).
- Input has Attach (`Plus`) + Send (`ArrowUp`) only — the mic/voice button was removed.
- Timestamp divider uses the attached Time PNG (`@assets/Time_*.png`).
- The old Send/Exchange modals are still rendered in `App.tsx` but no longer openable
  (dead-but-harmless until a future cleanup).

## Onboarding & Plaid
- `OnboardingFlow.tsx` step 1 (`StepConnectBank`) + `AddSourceModal` use Plaid Link.
- `server/plaid.ts` — sandbox default (honors `PLAID_ENV`); products Auth + Transactions;
  countries US + CA. Sandbox login: `user_good` / `pass_good` against any institution.
- Storage: `bank_connections` PG table; `accessToken` is sensitive and stripped before being
  returned to the client.

## Add Source — Data Ingestion Wizard
- Sidebar "Add Source" button opens `AddSourceModal.tsx` — a source-agnostic connector
  wizard using a **screen stack** (push/back), not fixed steps.
- Screens: connected sources (removable), categories, bank (Plaid), providers (Stripe live
  via `/api/integrations/stripe/connect`; others "Coming soon"), documents (upload).
- Documents: `sourceDocuments` PG table — **only file metadata is persisted, no file bytes /
  object storage.**

## API Endpoints
- **Auth** (`server/auth.ts`): `POST /api/auth/register` `/login` `/logout` `/demo`,
  `GET /api/auth/user`, `GET /api/auth/google` + `/callback`. `GET /api/config` →
  `{ googleEnabled }`. SIWE: `POST /api/auth/siwe/nonce` `/verify` `/logout`.
- **Assistant**: `POST /api/assistant/chat` (`requireAuth`) — zod-validated `messages`,
  Claude with a Brain financial-assistant system prompt. Returns 503 `assistant_unconfigured`
  (no key), 402 `assistant_no_credit` (Anthropic credit too low), 500 `assistant_failed` —
  each with a user-facing `reply` string.
- **WireX** (all `requireAuth`, email derived from session — client `email`/`userId`
  ignored): `GET /api/wirex/accounts` `/transactions`, `POST /api/wirex/onboard`.
- **Account** (`requireAuth`, target from session): `DELETE /api/account` `/account/data`.
- **Contracts**: `GET /api/contracts/info`, `/account/:ownerAddress`,
  `/agent/:brainAccountAddress/:agentId`, `/registry/:agentId`;
  `POST /api/contracts/deploy-account`.
- **Policy**: `POST /api/policy/evaluate/payment` `/evaluate/trade` `/hash`.
- **Integrations**: `GET/POST /api/integrations/documents`,
  `POST /api/integrations/documents/:id/delete`, `/plaid/disconnect`, `/:toolId/disconnect`,
  `/stripe/connect`.

## Auth Notes
- `requireAuth` guards protected routes via `req.session.userId`.
- Register: `email` + `password` (+ optional `username`, `name`); username defaults to email.
  Login: `{ identifier, password }` (tries email lookup, then username).
- `POST /api/auth/demo` logs into a shared demo account (`demo@brain.finance`) with a real
  session. The SignupPage demo buttons call `loginDemo(fresh)` which toggles the
  `brain_onboarding_complete_<userId>` localStorage flag (Fresh shows onboarding, Existing
  skips it).
- Google OAuth: button only renders when both Google secrets set. Callback failures redirect
  to `/?auth_error=<code>`; `SignupPage.tsx` maps codes to friendly messages.

## Smart Contracts (contracts/)
- `BrainAccount.sol` (ERC-4337 smart account), `PolicyValidator.sol` (on-chain ECDSA proof
  verification), `AgentRegistry.sol` (ERC-8004 inspired), `BrainAccountFactory.sol` (CREATE2).
- **Modes**: `CONTRACT_MODE=demo` (default, mock data). Live chain needs
  `POLICY_SIGNER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, `ALCHEMY_API_KEY`,
  `POLICY_VALIDATOR_ADDRESS`, `AGENT_REGISTRY_ADDRESS`, `BRAIN_ACCOUNT_FACTORY_ADDRESS`.
- **Domain tags** (must match Solidity ↔ TypeScript): Payment
  `keccak256("BrainFinance:PaymentProof:v1")`, Trade `keccak256("BrainFinance:TradeProof:v1")`.
- Deploy: `cd contracts && npm install && npm run compile && npm run deploy:sepolia`.
  Test: `cd contracts && npm test`.

## Design Tokens
- Background: `#0d1017` / `#11141b`. Purple accent: `#7631ee`. Gold/orange: `#ff9500` /
  `#f59e0b`. Baby blue: `#a8b9f4` (60%), `#6c779d` (30%).
- Fonts: Gilroy (headings), JetBrains Mono (numbers/code).
- Panel: `rounded-[16px] bg-[#11141b] border-[#1d2132]`. Cards: `bg-[#0a0c10]` (no border).

## Settings UI (Figma rebuilds)
- Subpages in `client/src/components/settings/figma/`: Security, Notifications, Payments,
  Agents, Legal, Account. Shared primitives in `FigmaPrimitives.tsx`. `ProfileSection` is
  inline in `SettingsPage.tsx`.
- Figma icons: SVGs in `attached_assets/figma_icons/` (subfolders `sub/`, `nav/`,
  `add-money/`, `exchange/`) with typed registries in `client/src/assets/*-icons.ts`
  (`SUB`, `NAV_ACTIVE`, `ADD_MONEY_ICONS`, `EXCHANGE_ICONS`).
- To add a Figma icon: download URL hash → `attached_assets/figma_icons/<subdir>/<name>.svg`,
  then add the import + map entry to the matching registry file.

## Other Notable UI
- Sidebar "Rules" nav shows a notification counter badge (`client/src/lib/rule-suggestions.ts`,
  `useSyncExternalStore`-backed) when Brain has new rule suggestions.
- HomePage "Needs Review" rows open a centered Radix-dialog popup (`@radix-ui/react-dialog`
  primitives for focus trap / scroll lock); Confirm/Reject just close (no backend wiring yet).

## Needs Review (`/review`) — propose → approve → execute surface
- Data-driven approval queue. Model in `client/src/lib/proposalTypes.ts`; 8 mock scenarios +
  `ACCOUNT_SUMMARY` in `client/src/lib/mockProposals.ts`. ONE `ProposalDetail.tsx` renders all
  scenarios via conditional sections (chips, facts mono block, evidence grid, confidence bar,
  sweepMath, policy chip, verifyFirst, surface hint, JSON trace) — never per-agent JSX.
- `ReviewPage.tsx` holds a `statuses` override map (keyed by proposal id). Handoff is fully
  user-driven — NO setTimeout/auto-advance: approve→`executing` (held row with manual Cancel→
  pending and Mark settled→executed), reject→`rejected`, postpone→`postponed`, verifyFirst→
  `verifying` (parked, still tappable). Settled items collapse into a "Settled today" card.
- Color discipline: `#d20344` ONLY for danger/alerts/reject; Approve uses purple `#7631ee`.
- `ACCOUNT_SUMMARY.pendingAPTotal` (10,514) MUST equal the sum of the money-mover (AP)
  proposals (Con Edison 486 + Apex 1,450 + Bright Futures 3,200 + Comcast 1,228 + AWS 4,150).
  sweepMath must keep `operatingAfter > 0` after a ≥3-month buffer + pending AP.
- Live brain-core PaymentIntents (`useIntents`) + legacy static `NEEDS_REVIEW` items still
  render via the older `ReviewModal` ("Needs your approval" / "Routine approvals" cards).
- Naming conventions applied platform-wide: "Crypto Account" (not "Your Wallet" /
  "Stablecoin Account"), "Agent Account" (generic label; proper agent names unchanged).

## Secrets Needed
- `ANTHROPIC_API_KEY` — Claude API (powers the assistant, insights, goal recommendations).
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Google OAuth (optional). Redirect URI must be
  `<app-origin>/api/auth/google/callback`.
- `SESSION_SECRET` — express-session signing (dev default if unset).
- `PLAID_CLIENT_ID` + `PLAID_SECRET` (configured); optional `PLAID_ENV`.
- `WIREX_CLIENT_ID` + `WIREX_CLIENT_SECRET` (auth broken, demo active).
- `ALCHEMY_API_KEY` (RPC + deploy, falls back to public RPC), `DEPLOYER_PRIVATE_KEY`,
  `POLICY_SIGNER_PRIVATE_KEY`, `BASESCAN_API_KEY`.

## Removed Features
- Agents pages, Marketplace, agent wallet/debit cards, `/api/agents` + `/api/marketplace`.
- Crossmint (June 2026): all `@crossmint/*` code, `/api/crossmint/wallet`,
  `.crossmint-form-wrapper` CSS (see `tweetnacl` gotcha above).
