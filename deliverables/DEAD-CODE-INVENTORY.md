# BrainMVB — Dead / Outdated Code Inventory

**Status:** living document. **Do not delete anything listed here** during the brain-core
integration — this is a tracking record only. Removal happens later, as a deliberate cleanup
pass (migration Phase 8: "Final Cleanup & Documentation"), once each layer has been migrated
and the replacement is proven against brain-core.

The migration blueprint (`deliverables/Brain-Migration-Plans.docx` +
`Brain-Migration-Handoff.docx`) already marks several modules **Delete** / **Reshape**. As we
touch the codebase we add anything else that is outdated, unused, or superseded so the future
cleanup has a complete, evidence-backed list.

> Reconciliation note: the docx is dated April 2026 and predates the June removal of Crossmint,
> so its Crossmint-as-signer guidance is itself stale. Provisioning adapters today are **Plaid
> (real) + WireX (demo)** + a RainbowKit/SIWE wallet — no Crossmint.

## Legend
- **Status**: `confirmed-dead` (no live references) · `superseded` (replaced by brain-core) ·
  `suspect` (looks unused, needs a usage check before the cleanup pass) · `migrate-then-delete`
  (still wired today; removed only after its brain-core replacement ships).

---

## A. Marked for deletion by the migration blueprint (migrate-then-delete)

| Path | Status | Replaced by (brain-core) | Notes |
| --- | --- | --- | --- |
| `server/policyEngine.ts` | migrate-then-delete | `/v1/policy/{tenant}/{compose,sign,evaluate,simulate}` | Bespoke JSON rules + ECDSA signing. Still imported by `server/routes.ts`. Remove in Phase 5. |
| `server/contractService.ts` | migrate-then-delete | `/v1/agents/*` + `/v1/payment-intents/*` + `BrainSmartAccount` | viem direct calls + custom factory. Still imported by `server/routes.ts`. Remove in Phase 6. |
| `server/insightsService.ts` | migrate-then-delete | `POST /v1/wiki/question`, `GET /v1/wiki/search` | Daily Anthropic cron over a mock context; started in `server/index.ts`. Remove in Phase 4. |
| `contracts/` (whole dir) | migrate-then-delete | brain-core contracts (`BrainSmartAccount`, `BrainPolicyRegistry`, `BrainMCPAgentRegistry`, `BrainAuditAnchor`) | 4 bespoke `.sol` files + ABIs + Hardhat. Still present on `feat/ui-rework`. Remove in Phase 6/8. |
| In-route ReAct agent loop in `server/routes.ts` (`runAgentLoop`, `BRAIN_TOOLS`) | migrate-then-delete | brain-core Agent layer | Hardcoded tool stubs (`check_balance` returns "5000.00", `analyze_market` returns canned data). Remove in Phase 6. |
| `@anthropic-ai/sdk` (dependency) | migrate-then-delete | brain-core Wiki/Agent | Stays until the assistant + insights are brain-core-backed (Phase 4+). Note: the live BrainAssistant chat also uses it. |

## B. Hardcoded / mock data that brain-core will replace (migrate-then-delete)

| Path | Status | Notes |
| --- | --- | --- |
| `client/src/pages/FinancesPage.tsx` → `STATIC_ACCOUNTS` | migrate-then-delete | Hardcoded account list ("Chase Business Checking" … "Account Totals"). **Being wired to `/api/brain/ledger/accounts` in this slice**; kept as the offline fallback. |
| `server/routes.ts` → `GET /api/account/{balance,assets,transactions}` | suspect / migrate-then-delete | Return hardcoded JSON (USDC "5000.00", canned assets/txns). Confirm client usage, then source from `/v1/ledger/*`. |
| `server/routes.ts` → `GOAL_REC_FALLBACK*` | suspect | Hardcoded goal-recommendation copy used as Anthropic fallback. Superseded by Wiki when Phase 4 lands. |
| `client/src/pages/FinancesPage.tsx` → `InvoicesLateBanner` + static Income/Expenses/Liabilities copy | migrate-then-delete | Hardcoded "2 Invoices are late" banner + prose. The new **`BrainBillsInbox`** (live AP invoices via `/api/brain/ledger/invoices` + propose) is the real-data replacement for the AP/bills story; retire the static banner once the inbox covers the late/overdue framing (invoice `status:"overdue"` + `due_date` are available). Income/Expenses still static. |

## C. Newly observed (added as encountered)

| Path | Status | Notes |
| --- | --- | --- |
| `npm run check` (`tsc`) on `feat/ui-rework` | suspect (pre-existing red) | `tsc` fails on this branch **independently of the brain-core work** — `tsconfig.json` sets no `target`, so `server/contractService.ts` (BigInt literals), `server/storage.ts` (Set iteration + top-level await), `server/policyEngine.ts` (`privateKeyToAccount` import), `client/src/pages/HomePage.tsx` (`insights`), `server/routes.ts:1115` all error. The app runs via `tsx`/esbuild (`script/build.ts`), not `tsc`. The new `server/brain/*` + `FinancesPage` edits compile clean. Decide later whether to add `"target": "es2022"` (would clear the BigInt/Set/await errors) — out of scope for the integration. |

---

### How to use this during cleanup (Phase 8)
1. For every `suspect` row, grep for references before removing.
2. For `migrate-then-delete` rows, confirm the brain-core replacement is live and the UI no
   longer imports the old module, then delete in the phase noted.
3. Drop dependencies (`@anthropic-ai/sdk`, hardhat/`@nomicfoundation/*`) only after their last
   importer is gone; run `npm run check` after each removal.
