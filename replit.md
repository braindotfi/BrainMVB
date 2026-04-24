# Brain Finance

Programmable neobank on Base L2.

## Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js (same server via Vite proxy)
- **Web3**: wagmi v2, viem, RainbowKit (wallet connection + SIWE auth)
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

## API Endpoints
- `POST /api/auth/siwe/nonce` / `/verify` / `/logout` — SIWE auth
- `GET /api/wirex/accounts` — WireX neobank accounts (demo fallback active)
- `GET /api/crossmint/wallet` — Crossmint embedded wallet
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
- `CROSSMINT_CLIENT_API_KEY` + `CROSSMINT_SERVER_API_KEY` — Crossmint embedded wallets
- `WIREX_CLIENT_ID` + `WIREX_CLIENT_SECRET` — WireX neobank (auth broken, demo active)
- `ALCHEMY_API_KEY` — For RPC + contract deployment (optional, falls back to public RPC)
- `DEPLOYER_PRIVATE_KEY` — For Base Sepolia contract deploy
- `POLICY_SIGNER_PRIVATE_KEY` — Brain backend policy engine signing key
- `BASESCAN_API_KEY` — For contract verification on BaseScan

## Auth Context
- `AuthProvider` in `web3Provider.tsx`
- Demo user ID = `"demo-user"` (no wallet needed for UI preview)
- SIWE auth at `/api/auth/nonce` + `/api/auth/verify`

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
