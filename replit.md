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
