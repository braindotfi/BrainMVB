# Brain Finance

Programmable neobank on Base L2.

## Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js (same server via Vite proxy)
- **Auth**: Custom email+password (scrypt-hashed) + Google OAuth 2.0, express-session cookie sessions (`server/auth.ts`)
- **Web3**: wagmi v2, viem, RainbowKit (wallet connection; SIWE retained but no longer the primary login)
- **AI**: Claude ReAct agent runtime via Anthropic SDK (`ANTHROPIC_API_KEY`) — retained for future use
- **DB**: Drizzle ORM + PostgreSQL (DatabaseStorage, falls back to MemStorage if no DATABASE_URL)
- **Smart Contracts**: Hardhat + Base Sepolia (in `contracts/`)

## Key Files
- `shared/schema.ts` — Drizzle schema (notifications, etc.)
- `server/routes.ts` — All API routes (agents + marketplace sections removed)
- `server/storage.ts` — MemStorage + DatabaseStorage (Drizzle/PG) + IStorage interface; `server/db.ts` — Drizzle pool
- `server/policyEngine.ts` — Off-chain policy evaluation + ECDSA proof signing (viem)
- `server/contractService.ts` — viem reads/writes to deployed contracts (demo fallback)
- `client/src/lib/web3.ts` — wagmi config (Base + BaseSepolia)
- `client/src/lib/web3Provider.tsx` — WagmiProvider > QueryClientProvider > RainbowKitProvider
- `client/src/App.tsx` — Root app, routing, NavContext (only /settings route)
- `client/src/components/WalletButton.tsx` — Wallet connect + SIWE auth
- `client/src/pages/SettingsPage.tsx` — Only remaining page

## Removed Features
- Agents pages (AgentsActivityPage, AgentManagePage, CreateAgentModal, AgentPerfChart)
- Marketplace (Marketplace.tsx, FeaturedCarousel, MainContentSection, PerksPage)
- Agent wallet/debit cards from AccountOverviewSection
- `/api/agents` and `/api/marketplace` server routes
- **Crossmint (removed June 2026)**: all `@crossmint/client-sdk-react-ui` code, the
  `/api/crossmint/wallet` route, `.crossmint-form-wrapper` CSS, and the right-hand
  `AccountOverviewSection` panel (replaced by Brain Assistant). NOTE: uninstalling
  `@crossmint` dropped its transitive `tweetnacl` dep, which `vite.config.ts` reads
  directly (`node_modules/tweetnacl/nacl-fast.js`) — `tweetnacl` is now a **direct**
  dependency so the dev server boots. Do not remove it.

## Brain Assistant Panel (June 2026)
- `client/src/pages/sections/BrainAssistant.tsx` replaces the old right-hand account
  panel in `App.tsx`. UI-only chat (no real LLM): collapsed rail (`w-[56px]`) /
  expanded (`w-[390px]`); empty greeting state, user/assistant bubbles, suggested
  chips, input (Plus/Mic/ArrowUp), and a session dropdown with search + status badges.
  Built from Figma file `cC2lQwC3g9hv96o5Wgy8Ek` (Default 4658-61281, Conversation
  4952-63232, Dropdown 4948-62054, Dropdown Search 4952-64034).
- The old Send/Exchange modals remain rendered in `App.tsx` but are no longer
  openable (their only trigger was the removed account panel) — left in place as
  dead-but-harmless until a future cleanup.

## Onboarding & Plaid
- `client/src/components/OnboardingFlow.tsx` — 8-step onboarding modal; step 1 (`StepConnectBank`) uses Plaid Link to connect real bank accounts (sandbox by default).
- `server/plaid.ts` — Lazy Plaid client (defaults to sandbox; honors `PLAID_ENV`). Products: Auth + Transactions. Countries: US + CA.
- Required secrets: `PLAID_CLIENT_ID`, `PLAID_SECRET` (already configured). Optional: `PLAID_ENV` (`sandbox` | `development` | `production`).
- Storage: `bank_connections` PG table (Drizzle, `shared/schema.ts`); `accessToken` is sensitive and never returned to the client (stripped in routes).
- Sandbox test login: `user_good` / `pass_good` against any institution.

## API Endpoints
- `POST /api/auth/siwe/nonce` / `/verify` / `/logout` — SIWE auth
- `GET /api/wirex/accounts` — WireX neobank accounts (demo fallback active)
- `GET /api/contracts/info` — Contract addresses + chain config
- `GET /api/contracts/account/:ownerAddress` — BrainAccount address (deployed or counterfactual)
- `POST /api/contracts/deploy-account` — Deploy BrainAccount via factory (CREATE2)
- `GET /api/contracts/agent/:brainAccountAddress/:agentId` — On-chain agent config + balance
- `GET /api/contracts/registry/:agentId` — AgentRegistry record
- `POST /api/policy/evaluate/payment` — Evaluate + sign PaymentIntent (step 16 in x402 flow)
- `POST /api/policy/evaluate/trade` — Evaluate + sign TradeIntent (trading flow)
- `POST /api/policy/hash` — Compute keccak256 policy hash for setPolicy()

## Smart Contracts (contracts/)
- `BrainAccount.sol` — ERC-4337 smart account (ReentrancyGuard, spend windows, trading caps)
- `PolicyValidator.sol` — On-chain ECDSA proof verification (single-use, domain-tagged)
- `AgentRegistry.sol` — ERC-8004 inspired agent registry (volume tracking, validation history)
- `BrainAccountFactory.sol` — CREATE2 deterministic deployment factory

### Contract Modes
- `CONTRACT_MODE=demo` (default) — returns mock data, no chain interaction
- Set env vars to enable live chain: `POLICY_SIGNER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, `ALCHEMY_API_KEY`, `POLICY_VALIDATOR_ADDRESS`, `AGENT_REGISTRY_ADDRESS`, `BRAIN_ACCOUNT_FACTORY_ADDRESS`

### Domain Tags (must match between Solidity + TypeScript)
- Payment: `keccak256("BrainFinance:PaymentProof:v1")`
- Trade: `keccak256("BrainFinance:TradeProof:v1")`

Deploy: `cd contracts && npm install && npm run compile && npm run deploy:sepolia`
Test: `cd contracts && npm test`

## Design Tokens
- Background: `#0d1017` / `#11141b`
- Purple accent: `#7631ee`
- Gold/orange: `#ff9500` / `#f59e0b`
- Baby blue: `#a8b9f4` (60%), `#6c779d` (30%)
- Fonts: Gilroy (headings), JetBrains Mono (numbers/code)
- Panel: `rounded-[16px]`, `bg-[#11141b]`, `border-[#1d2132]`
- Cards: `bg-[#0a0c10]`

## Provider Order (critical)
```
WagmiProvider > QueryClientProvider > RainbowKitProvider
```
The `QueryClientProvider` in `web3Provider.tsx` uses the shared `queryClient` instance from `@/lib/queryClient`.

## Secrets Needed
- `ANTHROPIC_API_KEY` — Claude API (already configured)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Google OAuth 2.0 login (optional;
  when unset, `/api/config` returns `googleEnabled:false` and the Google button is
  hidden — email/password login still works). Authorized redirect URI must be
  `<app-origin>/api/auth/google/callback`.
- `SESSION_SECRET` — express-session signing secret (falls back to a dev default if unset).
- `WIREX_CLIENT_ID` + `WIREX_CLIENT_SECRET` — WireX neobank (auth broken, demo active)
- `ALCHEMY_API_KEY` — For RPC + contract deployment (optional, falls back to public RPC)
- `DEPLOYER_PRIVATE_KEY` — For Base Sepolia contract deploy
- `POLICY_SIGNER_PRIVATE_KEY` — Brain backend policy engine signing key
- `BASESCAN_API_KEY` — For contract verification on BaseScan

## Auth Context (rebuilt June 2026 — custom login)
- Backend: `server/auth.ts` — express-session (cookie), scrypt password hashing,
  manual Google OAuth 2.0 (no passport). `setupAuth(app)` wires session + routes.
  `requireAuth` middleware guards protected routes via `req.session.userId`.
- Routes: `POST /api/auth/register` `/login` `/logout`, `GET /api/auth/user`,
  `GET /api/auth/google` (redirect) + `/api/auth/google/callback`.
  `GET /api/config` returns `{ googleEnabled }` (true only when both Google
  secrets are set).
- Google OAuth callback redirects failures to `/?auth_error=<code>`
  (`google_unconfigured|google_state|google_token|google_profile|google_failed`);
  `SignupPage.tsx` maps these to friendly messages and strips the param from the URL.
- Frontend: `client/src/lib/authContext.tsx` — session-based context
  (`loginWithPassword`, `register`, `loginWithGoogle`, `logout`, `AuthUser`, `isLoading`),
  bootstraps from `/api/auth/user`. `App.tsx` gates the whole app on `isLoggedIn`
  and shows `SignupPage` otherwise.
- `client/src/pages/SignupPage.tsx` — dark-theme login/register tabs; Google button
  only renders when `googleEnabled` (uses `react-icons/si` `SiGoogle`).
- Destructive routes `DELETE /api/account` + `/api/account/data` now require
  `requireAuth` and derive the target user from the session — body identifiers are ignored.
- SIWE routes (`/api/auth/siwe/*`) remain but are no longer the primary login.

## Critical Bug Patterns
- NEVER use derived arrays as `useEffect` dependency arrays — use primitive values
- WireX credentials broken (`access_denied`) — demo fallback active in `/api/wirex/accounts`
- viem already installed in root project — backend services use it directly

## Settings Subpages (Figma rebuild — April 2026)
Five subpages (Security, Notifications, Payments, Agent Permissions, Legal, Account) are
pixel-perfect Figma rebuilds living in `client/src/components/settings/figma/`:
- `SecuritySection.tsx`, `NotificationsSection.tsx`, `PaymentsSectionFigma.tsx`,
  `AgentsSection.tsx`, `LegalSection.tsx`, `AccountSection.tsx`
- Shared primitives: `FigmaPrimitives.tsx` (Switch, Icons/ChevronDown)
- Icons stored locally in `attached_assets/figma_icons/sub/<8charhash>.svg` (89 files)
- Registry: `client/src/assets/sub-icons.ts` (`SUB[hash]` map)
- Cards have NO border (`bg-[#0a0c10] rounded-[16px]`)
- Each subpage starts with the Figma section group label (Authentication, Channels, Your Data, etc.)
  — the global `<h1>` SECTION_TITLES header was removed.
- `ProfileSection` remains inline in `SettingsPage.tsx` using shared helpers (Card, SettingRow, Divider).
  - Layout matches Figma node 3957:43974: header card (Avatar + name + email + amber Edit pill),
    Identity card (Account, KYC Verification, Phone Number), Misc card (Billing, Add Business Account).
  - Wallet Address row was removed (no longer in design).
  - Helpers `ProfileRowCircle` (single-svg circle icon at explicit w/h), `BriefcaseRowCircle`
    (4-layer briefcase composite), and `ChevronActionButton` (40px circle + chevron-right) live
    alongside the older `RowCircleIcon`.
- Inactive `ProfileNavIcon` uses dedicated Figma "Subtract" mark (node 3957:44016) →
  `attached_assets/figma_icons/settings_profile_inactive.svg`. Active branch keeps the
  layered head + body composition.

To re-export new Figma icons: download URL hash → `attached_assets/figma_icons/sub/<hash>.svg`
and add the import + map entry to `client/src/assets/sub-icons.ts`.

## Settings Nav Icon Active States (April 2026)
Each settings nav item has an "active" variant pulled from Figma:
- Security 3697:40137, Notifications 3704:37874, Payments 3706:38466,
  Agents 3709:39289, Legal 3709:39914, Account 3716:40613
- Active SVG layers stored in `attached_assets/figma_icons/nav/` (11 files)
- Typed registry: `client/src/assets/nav-active-icons.ts` (`NAV_ACTIVE`)
- Each `XxxNavIcon` in `SettingsPage.tsx` accepts `active: boolean` and renders
  the multi-vector active treatment when true, otherwise the inactive single-vector.
- Legal's active base is a CSS-drawn rounded rect with the purple linear-gradient
  (this matches the Figma export, which uses a styled div not an SVG).

## Font Fix (April 2026)
Figma-exported components used `font-['Gilroy:Medium',sans-serif]` syntax
where the colon makes the font name invalid → browsers fall back to plain sans-serif.
Replaced across all `client/src/components/settings/figma/*.tsx`:
- `font-['Gilroy:Medium',sans-serif]` → `font-['Gilroy',sans-serif] font-medium`
- `font-['Gilroy:SemiBold',sans-serif]` → `font-['Gilroy',sans-serif] font-semibold`
The "Gilroy" family is loaded via bunny.net at top of `client/src/index.css`
with weights 400/500/600/700/800.

## Rules Suggestion Counter Badge (April 2026)
Sidebar "Rules" nav now shows a notification counter badge (Figma 3876:70929)
when Brain has new rule suggestions:
- Shared store: `client/src/lib/rule-suggestions.ts` (useSyncExternalStore-backed,
  exports `useRuleSuggestions`, `toggleSuggestion`, `dismissSuggestion`,
  `acceptSuggestion`). Initial seed: 1 suggestion ("Run payroll on payday").
- `RulesPage.tsx` reads suggestions from this store instead of local useState.
- `NavigationMenuSection.tsx` adds a `NotificationBadge` component:
  bg #7631ee, text #240757, rounded-[4px], min-w-[16px], p-[2px],
  font Gilroy SemiBold 12/12. Renders between label and ChevronRight when
  count > 0. Collapsed sidebar uses an 8px purple dot ring-2 ring-[#11141b]
  in the icon's top-right corner.

## Add Money & Exchange Modals — Figma Refresh (April 2026)
AddAccountModal and ExchangeModal now share SendModal's back-button style and
use locally-stored Figma assets per Brain Finance design file `cC2lQwC3g9hv96o5Wgy8Ek`:
- All 3 modals (Send, AddAccount, Exchange) use the same inline-SVG `BackBtn`:
  32px circle bg #1d2132, chevron path `M10 3L5 8L10 13` stroke #a8b9f4 width 1.6,
  viewBox `0 0 16 16`. Matches Figma frame 3608:34364.
- AddAccountModal step-1 select-account row icon switches by selection state:
  `+` icon (Figma 3608:34376) when no account selected, chevron-down once selected.
- All Add Money icons (account icons, popup, step-2 bank/wallet/agent, QR popup)
  use 16 SVGs in `attached_assets/figma_icons/add-money/`.
- Typed registry: `client/src/assets/add-money-icons.ts` exports `ADD_MONEY_ICONS`.
- Source frames: select-popup 3608:34242, step-2 bank 3005:34247, step-2 crypto
  2979:41718, QR popup 2979:42687, step-2 agent 2979:42127.

To re-export updated Add Money icons: download URL hash → `attached_assets/figma_icons/add-money/<name>.svg`,
then add the import + map entry to `client/src/assets/add-money-icons.ts`.

## Exchange Modal Account Icons + Crypto Rename (April 2026)
"Stablecoin Account" → "Crypto Account" platform-wide. Wallet (Crypto Account)
and Bank Account icons in the Exchange Money "From" select use locally-stored
Figma exports per the design file:
- Crypto: bg circle #240757 + glyph #7631ee (Figma 2979:45360)
- Bank: bg circle #4A2300 + glyph #FF9500 (Figma 3949:42641)
- Local SVGs: `attached_assets/figma_icons/exchange/{bank,crypto}_{circle_bg,glyph}.svg`
- Typed registry: `client/src/assets/exchange-icons.ts` (`EXCHANGE_ICONS`).

## AddAccountModal "Select Account" Button Visual Sync (April 2026)
The right-side icon on Add Money's account selector now matches Exchange's
"Select Asset" pill: a 32px circle bg #1d2132 wrapping the plus (empty) or
chevron-down (filled) icon. Previously the icon floated bare in a 24px box.

## SendModal "Select Account" Popup Sync (April 2026)
SendModal's `RecipientPopup` now mirrors AddAccountModal's `AccountPopup`:
- Same shell: 320px width, bg #0a0c10, border #1d2132, rounded-16, multi-shadow.
- Header: border-b #1d2132 + backdrop-blur-10, title left-aligned, close on right.
- First list item highlighted with bg #11141b (matches AccountPopup pattern).
- All popup icons (`PopupShell`, `SearchBar`, `RecipientIcon`) migrated from
  Figma asset URLs to local `ADD_MONEY_ICONS` (close, search, wallet, bank,
  agent backgrounds + vectors).
- Receipt success checkmark replaced with inline SVG (Figma URL had expired).
- Result: zero `figma.com` references remaining in `client/src/components/SendModal.tsx`.

## Crypto Account Naming + Finances Accounts Expansion (April 2026)
- Renamed "Your Wallet" → "Crypto Account" platform-wide. Touched files:
  `AddAccountModal.tsx` (ALL_ACCOUNTS row + Step-2 title), `SendModal.tsx`
  (review-step source label), `SignupPage.tsx` (loading copy).
- Finances → Accounts widget now lists, in addition to the existing Chase
  Business Checking and Chase Savings, the user's: Crypto Account, Yield
  Agent, TraderPro, Treasury AI Agent. The Account Totals row is recalculated
  to $74,493 across bank, crypto and agents.
- Home page first stat widget label updated: "Cash in the bank" →
  "Money in all accounts".

## "AI Agent Account" → "Agent Account" (April 2026)
Generic recipient/account-type label "AI Agent Account" renamed to "Agent
Account" in `SendModal.tsx` (RECIPIENT_TYPES + step-2 review row + agent
fallback) and `AddAccountModal.tsx` (Step-2 comment). Proper agent names like
"Treasury AI Agent" and the platform tagline "AI Agent Marketplace on Base"
are intentionally unchanged.

## Brain Icon Refresh (April 2026)
- Activity page "Brain Did" icon (Figma 3943:42552): refreshed
  `attached_assets/figma_icons/brain_did_bg.svg` and `brain_did_vec.svg`. The
  surrounding `BrainDidIcon` component in `ActivityPage.tsx` already uses the
  same circle+vector composition that Figma exports for this node, so no
  component code change was needed — only assets.
- Main-menu top-left brain logo (Figma 3879:42001): replaced
  `attached_assets/figma_icons/brain_logo_3d.png` with the user-attached PNG
  (`Frame_1000002163_1777050618125.png`). The Figma node uses 19+ ellipses +
  Union shapes which would not be pixel-perfect to recompose, so per the
  user's instructions we used the attached file as the canonical render.
- `BrainLogo` in `NavigationMenuSection.tsx` now renders the new PNG directly
  (single `<img src={ICONS.brain_logo_3d}>`) instead of the old
  union+mask+overlay composition, so both the expanded and collapsed nav
  states show the same updated logo. The legacy `brain_union`, `brain_mask`,
  and `brain_overlay` SVG entries remain in `figma-icons.ts` for now in case
  we need them again.

## Needs Review Popup (April 2026)
HomePage "Needs Review" widget rows are now interactive: tapping any row
opens a centered "Review Needed" popup with a dimmed/blurred backdrop
(Figma node 3846:44649; centering matches 3844:44172). Implementation lives
inline in `client/src/pages/HomePage.tsx`:
- `NEEDS_REVIEW` items typed via `ReviewItemType` and enriched with detail
  fields (`question`, `description`, `who`, `amountFull`, `dueBy`, `from`,
  `autoLabel`).
- `ReviewItem` accepts `onClick` and is keyboard-accessible (`role=button`,
  Enter/Space activation).
- `ReviewModal` is built on `@radix-ui/react-dialog` primitives directly
  (Root/Portal/Overlay/Content/Title/Description/Close) so it gets focus
  trap, focus restore, Escape handling, body scroll lock, and proper
  `role=dialog` / `aria-modal` semantics for free, while keeping the
  custom Figma styling. The "Always …" toggle uses the shadcn `Checkbox`
  (Radix primitive) for accessible checkbox semantics.
- Confirm/Reject currently just close the modal (no backend wiring).

## Add Source — Data Ingestion Wizard (June 2026)
Sidebar "Add Source" button (`NavigationMenuSection.tsx`, bg #4a2300/text #ff9500,
8px above Logout) now opens `client/src/components/AddSourceModal.tsx` — a paginated,
source-agnostic connector wizard aligned with the Brain data-ingestion architecture.
- Radix Dialog shell (bg #11141b, border #1d2132, rounded-24, w-480). Navigation is a
  **screen stack** (`stack: Screen[]`, push/back) — branching, not fixed step dots.
  Header shows a back button (when depth>1) + contextual title + close.
- Screens: `home` (connected banks + tools + documents, each removable),
  `categories` (Bank/Accounting/Payroll/Payments/Tax/Documents), `bank` (Plaid via
  `react-plaid-link`, mirrors `OnboardingFlow.tsx` StepConnectBank), `providers`
  (Stripe live via `/api/integrations/stripe/connect`; QuickBooks/Xero/Wave/Gusto/
  Rippling/ADP/PayPal/Square shown "Coming soon"), `documents` (upload).
- Bank disconnect: POST `/api/integrations/plaid/disconnect` {itemId}. Tool disconnect:
  POST `/api/integrations/:toolId/disconnect`.
- Documents: `sourceDocuments` PG table (`shared/schema.ts`); storage CRUD mirrors
  bankConnections. Routes `GET/POST /api/integrations/documents` +
  `POST /api/integrations/documents/:id/delete` (DEMO_USER, zod-validated, registered
  BEFORE the generic `:toolId/disconnect` so specific routes win).
  **Only file metadata is persisted — no file bytes / object storage.**
- `App.tsx` now renders `AddSourceModal` for the Add Source button (was AddAccountModal).
