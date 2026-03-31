# Brain Finance

AI agent marketplace + programmable neobank on Base L2.

## Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js (same server via Vite proxy)
- **Web3**: wagmi v2, viem, RainbowKit (wallet connection + SIWE auth)
- **AI**: Claude ReAct agent runtime via Anthropic SDK (`ANTHROPIC_API_KEY`)
- **DB Schema**: Drizzle ORM, PostgreSQL-ready (currently in-memory MemStorage)
- **Smart Contracts**: Hardhat + Base Sepolia (in `contracts/`)

## Key Files
- `shared/schema.ts` — Drizzle schema (agents, marketplace, notifications, etc.)
- `server/routes.ts` — All API routes + Claude ReAct agent loop
- `server/storage.ts` — MemStorage (seeded) + IStorage interface
- `client/src/lib/web3.ts` — wagmi config (Base + BaseSepolia)
- `client/src/lib/web3Provider.tsx` — WagmiProvider > QueryClientProvider > RainbowKitProvider
- `client/src/App.tsx` — Root app, routing, NavContext
- `client/src/hooks/useNotifications.ts` — SSE live notifications hook
- `client/src/components/WalletButton.tsx` — Wallet connect + SIWE auth
- `client/src/components/CreateAgentModal.tsx` — 7-step agent creation (wired to POST /api/agents)
- `client/src/pages/AgentsActivityPage.tsx` — Agent list with Edit nav to /manage/:id
- `client/src/pages/AgentManagePage.tsx` — Full agent detail + edit (rules, config, activity log)
- `client/src/lib/agentsData.ts` — Shared agent data (rules, budget, schedule, activity log)

## API Endpoints
- `GET/POST /api/agents` — List/create agents
- `POST /api/agents/:id/run` — Run ReAct agent loop (Claude)
- `GET /api/marketplace` — Marketplace listings
- `GET /api/notifications` — User notifications
- `GET /api/notifications/stream` — SSE live stream
- `POST /api/notifications/demo` — Fire demo notification
- `POST /api/auth/siwe/nonce` / `/verify` / `/logout` — SIWE auth

## Smart Contracts (contracts/)
- BrainAccount (ERC-4337 smart account)
- PolicyValidator (on-chain spending policy)
- AgentRegistry (agent + action registry)

Deploy: `npm run deploy:sepolia` (needs `DEPLOYER_PRIVATE_KEY` + `ALCHEMY_API_KEY`)

## Design Tokens
- Background: `#0d1017` / `#11141b`
- Purple accent: `#7631ee`
- Gold/orange: `#ff9500` / `#f59e0b`
- Baby blue: `#a8b9f4` (60%), `#6c779d` (30%)
- Fonts: Gilroy (headings), JetBrains Mono (numbers/code)

## Provider Order (critical)
```
WagmiProvider > QueryClientProvider > RainbowKitProvider
```
The `QueryClientProvider` in `web3Provider.tsx` uses the shared `queryClient` instance from `@/lib/queryClient`.

## Secrets Needed
- `ANTHROPIC_API_KEY` — Claude API (already configured)
- `ALCHEMY_API_KEY` — For RPC + contract deployment
- `DEPLOYER_PRIVATE_KEY` — For Base Sepolia contract deploy
- WalletConnect `projectId` — For full WalletConnect support
