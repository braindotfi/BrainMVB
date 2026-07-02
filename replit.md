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

## Finances Tab — popup detail cards (live brain-core)
- `client/src/pages/FinancesPage.tsx` drives the FINANCES widget tabs. Detail cards pull from
  LIVE brain-core Ledger via BFF proxy `/api/brain/ledger/*` (accounts, transactions,
  counterparties, invoices); mock only as fallback. Read-only, data-derived, NO setTimeout.
- **Accounts**: rows are clickable ONLY when the brain-core account has an `id`
  (`clickable = !!acc.id`); the mixed "Account Totals" row is NOT clickable. Clicking opens
  `AccountDetailSheet.tsx` (provenance/confidence/status/synced + recent activity filtered by
  `account_id`, top 5, → opens `TransactionDetailSheet`). **Currency honesty**: `rowBalanceLabel`
  (FinancesPage) + `balanceLabel` (AccountDetailSheet) render fiat (USD) through
  `useCurrency().format` but a non-fiat token (ETH, `currency !== "USD"`) in NATIVE units — never
  run a token amount through the USD→display converter. Account ids are ephemeral per demo
  provisioning — never hardcode.
- **Bills** (`BrainBillsInbox.tsx`): bill info area is tappable (`open-bill-<n>`) → `BillDetailSheet.tsx`
  (due-state chip, facts, flags callout, "View invoice document" builds a `DocumentRecord`
  on-the-fly and reuses `DocumentViewerPopup`). 3-state bridge via `useIntents`:
  flagged→`#d20344`, proposed→purple "Review proposal"→`/review`, else muted info.
- **Recent**: rows open the shared `TransactionDetailSheet.tsx` (enriched with
  `account_id`/`counterparty_id`/`reconciliation_status` resolved via accounts+counterparties
  queries → From/To, Account, Reconciliation).
- **Income**: `IncomeTxList` renders the actual inflow transactions inline (sorted desc,
  counterparty name resolved), each row → `TransactionDetailSheet`. Demo seed is all inflows,
  so **Expenses honestly renders empty** (never faked).
- **Liabilities**: "View bills to pay →" button switches `activeTab` to Bills.
- **Deviations from spec**: (1) Recent/account activity rows open the LIVE
  `TransactionDetailSheet` rather than `openDocumentDetail` bank_transaction (that helper is
  mock-only). (2) `ruleConsistencyCheck.ts` NOT extended — it guards mock stores and is N/A to
  live brain-core data. (3) "Due today" bill chip uses baby blue `#a8b9f4` (NOT orange — orange
  is reserved for active tabs).

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
- Review-status overrides live in a SHARED store `client/src/lib/reviewStatusStore.ts`
  (`useSyncExternalStore`, same pattern as `rulesStore`): `useReviewStatuses()` +
  `setReviewStatus(id, status)`. Both `ReviewPage.tsx` and HomePage's "Brain Detected" widget
  read/write it, so a decision on either surface reflects on the other (SSOT). Handoff is fully
  user-driven — NO setTimeout/auto-advance: approve→`executing` (held row with manual Cancel→
  pending and Mark settled→executed), reject→`rejected`, postpone→`postponed`, verifyFirst→
  `verifying` (parked, still tappable). Settled items collapse into a "Settled today" card.
  Store is module-global (not reset on logout, matching `rulesStore`/`intentsStore`).
- Color discipline: `#d20344` ONLY for danger/alerts/reject; Approve uses purple `#7631ee`.
- `ACCOUNT_SUMMARY.pendingAPTotal` (10,514) MUST equal the sum of the money-mover (AP)
  proposals (Con Edison 486 + Apex 1,450 + Bright Futures 3,200 + Comcast 1,228 + AWS 4,150).
  sweepMath must keep `operatingAfter > 0` after a ≥3-month buffer + pending AP.
- Live brain-core PaymentIntents (`useIntents`) + legacy static `NEEDS_REVIEW` items still
  render via the older `ReviewModal` ("Needs your approval" / "Routine approvals" cards).

## Rules store & Report-a-Problem (`/rules/:id`)
- `client/src/lib/rulesStore.ts` — `useSyncExternalStore` single source of truth for the 4
  standing auto-clear rules (active state, scope cap/allowlist, `ProblemReport[]`). Seeded
  from the now-EXPORTED rule consts in `mockProposals.ts` (UTILITY/SAAS/LEASE/PAYROLL).
  Receipts, `ReviewPage`, and `RuleDetail` all read/write it. SAAS pre-seeded paused + 1
  report (`auto-figma`) for demo; UTILITY stays active for the live Con Edison path.
- `AutoRule` gained a URL-safe `id` slug (route uses `/rules/<id>`, NOT policyId — slashes),
  plus `agent`/`category`/`cap`/`allowlist`/`scopeSummary`/`problemReports`. `ProblemReport`
  added to `proposalTypes.ts`.
- Receipt report flow (`ProposalDetail` auto-handled branch): preset chips + optional note →
  confirm step ("Pause rule and review" purple primary / "Just send feedback" secondary) —
  pausing is NEVER silent. `onReportProblem(p, {reason, note, pause})`.
- `RuleDetail.tsx` (`/rules/:id`): paused-from-report banner (#D20344 only) with linked
  payment (vendor + settledMeta date mono + amount), "what changed" line, Active/Paused
  toggle (resume needs confirm + resolves open reports), remediations (remove vendor / lower
  cap / delete), reported-problems trail. Linked payment → `/review?receipt=<id>`; ReviewPage
  reads `useSearch()` and auto-opens the receipt.
- Related pending-item flag (ReviewPage `relatedRuleFor`): NON-BLOCKING note, never changes
  status. Match = same `agent` + `counterparty` in rule `allowlist` + `amount ≤ cap`. Pending
  proposals have NO `category` field (only rule consts do) — don't match category for them.
- `ActivityPage.tsx` surfaces the same `AUTO_HANDLED_PROPOSALS` receipts in the feed: each maps
  to a `paid` activity item (→ "Brain Did" tab) via `autoHandledToActivity`, merged into the
  "Today" section sorted desc by `parseClockTime` (time parsed from `rowSubtitle` "settled
  H:MM AM"). Rows carry `linkTo: /review?receipt=<id>`; only `linkTo` rows are clickable
  (keyboard-accessible, conditional `cursor-pointer`) and navigate to the receipt.
- Naming conventions applied platform-wide: "Crypto Account" (not "Your Wallet" /
  "Stablecoin Account"), "Agent Account" (generic label; proper agent names unchanged).

## Linked references contract (rules + vendors + documents)
- Every "Linked" ref (Audit Log popup, receipts, settled cards) is referenced BY ID and
  resolved through ONE helper against ONE canonical store, with a resolve-or-plain-text
  fallback: rules → `openRuleDetail`/`getRule` (rulesStore); vendors →
  `openVendorDetail`/`resolveVendor` (`mockVendors.ts`, deep-links `/vendors?vendor=<id>`);
  documents → `openDocumentDetail`/`resolveDocument` (`mockDocuments.ts`/`documentsStore.ts`,
  opens `DocumentViewerPopup`). `document.vendorId` + `proposal.invoiceId` must also be
  canonical.
- **Generalized document/record EVIDENCE viewer** — `DocumentViewerPopup.tsx` is ONE
  read-only viewer for every kind of evidence Brain surfaces, keyed off a `DocKind`
  discriminator (`invoice` | `prior_payment` | `bank_transaction` | `contract` |
  `purchase_order`) in `client/src/lib/documentTypes.ts` (`DocumentRecord`). It renders all
  kinds from that one shape (no per-kind type/component) and always shows provenance +
  a "viewer, not the system of record" caption. `bank_transaction` carries a
  `reconciliation` block; a doc with a `compareToId` twin offers an in-place COMPARE toggle
  (duplicate invoice / bank-detail change). KNOWN vendors carry `vendorId` (+ `vendorName`)
  and deep-link; NON-vendor counterparties (landlords, internal ledgers) carry only
  `counterparty` text. The audit-log linked kind stays `"invoice"` but routes through
  `openDocumentDetail`. (The old invoice-only `openInvoiceDetail`/`resolveInvoice`/
  `mockInvoices`/`invoiceTypes`/`InvoiceViewerPopup` were REPLACED by this.)
- A vendor's `history` must RECONCILE with its referenced documents/payments (amounts,
  dates, tier, trustStatus) — no stubs, no contradictory tenure. A human-approved-above-
  limit payment is NOT "trusted"; a single recent payment reads as the "new" tier.
- Non-vendor counterparties (payroll employees, DeFi protocols, internal ledgers) are NOT
  vendors — they use accurate `linked[]` kinds (`employee`/`protocol`/`ledger` in
  `LinkedEntityKind`) and render as plain, non-tappable text. Never label them `vendor`.
- The proposal LIFECYCLE must be coherent end to end (proposal→document→audit→anchor). A
  settled/anchored audit record (`approved`/`auto_approved`) must NOT link a still-pending
  proposal — settled events point at their OWN settled twin. So a settled twin exists per
  settled-but-still-queued item: `AWS_SETTLED` (id `settled-aws`, AUD-3308FE, document
  AWS-2026-07) is the executed prior-cycle counterpart of the still-pending `prop-aws` in the
  review queue; the audit record's linked proposal + `proposalId` point at `settled-aws`, NOT
  `prop-aws`. Standalone settled/held records live outside the queue arrays, so they must be
  registered in `openProposalDetail.ts` `allProposals()` (else their refs dangle). A proposal's
  `invoiceId` must match its lifecycle: pending-like proposals never own a `paid` document;
  executed/auto_handled proposals do. A FLAGGED record CAN link a pending proposal and CAN be
  anchored (a hold is an auditable event) — that's NOT a lie.
- `client/src/lib/ruleConsistencyCheck.ts` (dev-boot, `main.tsx`, never throws) is the
  UNIFIED guard covering all types: RESOLUTION (`checkRuleReferences` /
  `checkVendorReferences` / `checkDocumentReferences` / `checkProposalReferences`) + COHERENCE
  (`checkReferenceCoherence`: linked document amount == record amount, document.vendorId ==
  record's vendor, kind:"vendor" points at a real vendor, no paid-document vendor with zero
  history; PLUS lifecycle: settled record's linked proposal not pending, document status matches
  event type [approved/auto_approved→paid, flagged→held], proposal.invoiceId matches proposal
  status + its document amount == proposal amount, document.vendorName == resolved vendor.name;
  PLUS document integrity: bank_transaction has a reconciliation block, a compareToId twin
  resolves + names the same vendor + is within a 5% amount band) + `checkSemanticAuditRecords`.
  Document status coherence only applies to kinds WITH a status (invoice/prior_payment/
  purchase_order); bank_transaction + contract carry none. Display labels MAY differ from a
  vendor's canonical name (e.g. "Notion Team" vs "Notion Labs") — not equality-checked. Extend
  this module; don't fork it. See CLAUDE.md.
- Same guard module also runs `checkAnchorUiCoherence` — a record whose `anchor.status` is
  `pending_next_batch` must NOT carry `merkleRoot`/`baseTx`/`verifyHref` (nothing to verify yet).
  This mirrors the shared `AnchorStatus` component, which renders Verify DISABLED with the caption
  "Verification opens once anchored." and NO live link whenever pending, in BOTH proof + status
  modes, driven purely from `anchor.status` — and `checkAgentDomainCoherence` — the proposing
  agent parsed from a lifecycle label ("<X> Agent proposed|detected …") must stay inside its
  catalog domain (Invoice=AP/vendor payments incl. payroll & subscriptions, Collections=AR,
  Cash=treasury/sweep, Close=reconciliation); flags only when the action phrase clearly matches a
  DIFFERENT domain, skips ambiguous phrases (no false positives) — and `checkActorPayeeSegregation`
  — the human ACTOR who approved a payment (lifecycle step `actor`) must never also be its PAYEE.
- **Actor vs payee convention** (audit records, see CLAUDE.md): the ACTOR = who decided
  (human-approval steps carry `actor`; UI resolves a muted role suffix "· finance admin" from the
  canonical `client/src/lib/actors.ts` registry, never hardcoded; `LifecycleStep.authority` reserved
  for a future members/limits suffix, not built). The PAYEE = who was paid (linked-evidence rows on
  payment records show a "PAYEE" relationship chip instead of the bare kind, DERIVED centrally by
  `linkedRelationship(record, link)` in `auditTypes.ts` from record type + link kind — vendor/employee
  are payees; protocol/ledger are treasury destinations; rule/invoice/proposal are evidence). ONE
  convention, driven from data, never per-surface.

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
