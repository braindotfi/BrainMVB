# BrainMVB — Next Steps

Context: `HANDOFF.md` (2026-06-25 slice). Branch `feat/brain-core-integration` off `origin/feat/ui-rework`.

## 1. Slice is GREEN (no brain-core change, no deploy) ✅

The BFF gets tokens from the already-live **demo-provision fence** (`POST /v1/demo/provision-run`,
key-free, the same path BrainSaaS uses). `npm run brain:smoke` PASSES against api.brain.fi:
provisions a tenant, reads `/wiki/schema` 200 + `/ledger/accounts` 200 → 3 real accounts
(Operating $1,687,200 · Reserve $1,200,000 · Brain Smart Account 0.005 ETH). The FinancesPage
mapper matches this shape, so the Accounts widget renders live data.

### To run it
- [ ] Set BrainMVB secret `BRAIN_DEMO_PROVISION_SECRET` (value in `C:\Users\sanke\brain-prod-provision-secret.txt`).
- [ ] `npm run brain:smoke` → `[smoke] PASS`.
- [ ] `npm run dev`, log in (demo button), open **Finances → Accounts** → 3 live accounts.
- [ ] Confirm the browser only calls `/api/brain/...` (never api.brain.fi), no token client-side.

> Note: each `provision-run` mints a fresh seeded demo tenant. That's fine for the demo. A
> production per-user (non-demo) tenant + auth path is a later phase — it would need a proper
> brain-core auth route landed via a normal PR (NOT an ad-hoc commit/deploy). Discarded for now.

## 2. Prove the slice in the running app
- [ ] `npm run dev`, log in (demo button), open **Finances → Accounts** → rows come from api.brain.fi.
- [ ] Confirm in the network tab the browser only calls `/api/brain/...` (never api.brain.fi) and no JWT leaks.

## 3. Then iterate (reconciled to real v0.0.6 routes; see Brain-Migration-Plans.docx)
- [ ] **Phase 3 Raw/Ledger:** `server/wirex.ts` + `server/plaid.ts` publish to `POST /v1/raw/ingest`
      (`source_type:"plaid"`; WireX `api_partner`+`provider:"wirex"`); transactions from `/v1/ledger/transactions`.
      Widen the BFF proxy to allow these specific write paths.
- [ ] **Phase 4 Wiki:** retire `server/insightsService.ts`; HomePage Recommendations/Actions + "Ask Brain" →
      `/v1/wiki/search` + `/v1/wiki/question`; detail panels → `/v1/wiki/entity/{id}`.
- [ ] **Phase 5 Policy:** retire `server/policyEngine.ts`; Rules/Review → `/v1/policy/{tenant}/{versions,compose,sign,evaluate,simulate}`.
- [ ] **Phase 6 Agent:** retire `server/contractService.ts` + the in-route ReAct loop + `contracts/`; use
      `/v1/agents/*` + `/v1/payment-intents/*` (create→approve→execute via §6 gate). **Open: signer story w/o Crossmint** (RainbowKit/SIWE wallet vs brain-core-side).
- [ ] **Phase 7 Audit (net-new):** Audit page over `/v1/audit/*` + `GET /v1/proof/{action_id}/view`.
- [ ] **Phase 8 Cleanup:** execute `deliverables/DEAD-CODE-INVENTORY.md` (drop `@anthropic-ai/sdk`, hardhat/contracts,
      dead tables); rewrite `replit.md`; consider adding `"target":"es2022"` to fix the pre-existing `tsc` reds.

## Open questions for the brain-core team (carried)
1. Can `AUTH_SIGN_KEY` be provisioned to the BFF, or must minting be on-box?
2. `source_type` enum: add `wirex`/`crossmint`? (use `api_partner`+provider meta until then)
3. Fresh-User per-tenant provisioning: admin tenant-create vs `/v1/demo/provision-run`?
