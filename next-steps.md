# BrainMVB — Next Steps

Branch `feat/brain-core-integration` (off `origin/feat/ui-rework`), 3 commits, **not pushed**.
Full context: `HANDOFF.md`. Auth = live demo-provision fence (key-free). node only via WSL.

## Done ✅ (committed)
brain-core **read integration** across 5 surfaces, all on the demo path, server-verified:
Accounts + Recent transactions (FinancesPage), "Money in all accounts" total (HomePage),
grounded BrainAssistant (`/v1/wiki/question`) + evidence trail. `npm run brain:smoke` PASSES.

## Done ✅ (COMMITTED — Fork A: propose-only §6 demo)
Flagship "Brain proposes → §6/Policy gate decides" moment with **no money movement**. New
"Bills — let Brain decide" widget on FinancesPage lists the 3 AP invoices; "Let Brain pay" →
`POST /api/brain/propose` → renders ALLOW / CONFIRM (owner+cfo) / REJECT + expandable policy
trace + proposal/decision ids ("not executed"). New scoped BFF write route (propose+evaluate
only), `getBrainSession` provision-race fix, `brain:smoke` extended to assert all 3 outcomes.
Verified end-to-end vs live api.brain.fi (smoke + curl + live browser). Committed as `4457d41`
(+ `bbc6791` the `.gitattributes` LF guard), branch `feat/brain-core-integration`, **not pushed**.

## To run / re-verify
- Secret value is in `C:\Users\sanke\brain-prod-provision-secret.txt`.
- `BRAIN_DEMO_PROVISION_SECRET='<secret>' npm run brain:smoke` → `[smoke] PASS`.
- `BRAIN_DEMO_PROVISION_SECRET='<secret>' PORT=5052 npm run dev` → http://localhost:5052 →
  "Continue with Demo — Existing User" → Finances + assistant. (If a 504 "Outdated Optimize Dep":
  `rm -rf node_modules/.vite`, restart, hard-reload.)

## The forks (pick one — neither started without your call)

### A. Propose-only §6-gate demo — ✅ DONE (committed `4457d41`)
**+ Decline (reject) follow-on — DONE, UNCOMMITTED:** operator "Decline" button on a proposed bill
→ `POST /api/brain/reject` → brain-core reject → "✕ You declined this". Files: `client.ts`
(`rejectPaymentIntent`), `proxy.ts` (`POST /api/brain/reject`), `BrainBillsInbox.tsx`, `brain-smoke.ts`.
Verified (smoke incl. decline + browser). **Approve→approved is NOT viable on the demo path**:
`POST /payment-intents/{id}/approve` 500s for the demo agent token + the CONFIRM rule needs 2 roles
(owner+cfo) so quorum is unmeetable — would need a brain-core PR (seed approvers + fix the 500).

### A (orig note). Propose-only §6-gate demo
Built + verified. (Probe correction: the demo tenant DOES have payable invoices — `GET
/v1/ledger/invoices` returns 3 AP bills, `metadata.scenario:"ap"`; they're `ledger_invoices`,
not `ledger_obligations`, which is why the old note said "0 obligations". The `pay_invoice`
shortcut resolves amount/currency/counterparty/source from the invoice; `obligation_id` is null.)
Possible follow-ons if continuing A: approve-flow for the CONFIRM case (`POST
/payment-intents/{id}/approve`, token has `payment_intent:approve`) to flip pending_approval →
approved in the UI; surface the proposed intents elsewhere (Activity/Review pages).

### B. Production-tenant decision — FINDING (defer to a future session; do NOT start here)

**Finding (evidence gathered 2026-06-25):** The BFF authenticates via the **demo-provision fence**
(`POST /v1/demo/provision-run`), which mints a **fresh, seeded, ephemeral tenant per app-user** with
an **agent-type token scoped to reads + propose/approve only**. Excellent for a self-contained demo,
but it is a hard ceiling. Three concrete dead-ends this session ALL trace to this single root cause —
none are BrainMVB bugs:

1. **No real per-user data.** Every app user gets the same brand-new *seeded* demo tenant (3 accounts,
   3 AP bills, …), not their own finances. Concurrent mounts even spun up *different* tenants until the
   `getBrainSession` coalescing fix. So the app can never show a user's actual money on this path.
2. **Approve → approved is impossible** (probed: **HTTP 500**). The demo tenant seeds no human/org-role
   approvers, and the CONFIRM rule needs two distinct roles (owner+cfo); a lone demo agent principal
   can't meet quorum and the endpoint errors. The §6 human-approval loop needs real approver identities.
3. **`wiki/entity` detail panels are impossible** (probed: **HTTP 400**). The endpoint wants `ent_`
   wiki ids; the demo exposes only ledger ids (`acct_`/`cp_`/`tx_`). Needs a populated wiki-entity graph
   or a brain-core ledger-id→ent-id mapping.

   (Plus, by design, the demo token has **no `payment_intent:execute`** and no policy-sign scope, so
   real money movement / signing is off the table on this path.)

**Why a production-tenant path is necessary (and why it's deferred):** all four limits are inherent to
the demo fence — moving past them requires a **stable per-user tenant + a token minted for a real
principal with the right scopes/roles**, which the fence cannot provide. The design already exists: the
reverted `POST /v1/auth/service-token` endpoint (shared-secret fenced, scope-ceiling reads+propose+
approve, mints via the existing `siwxSigner`, signing key stays on the box). That is **protocol code →
must land via a normal brain-core PR/CI**, never ad-hoc. It is strategic + cross-repo (brain-core PR,
seed real approvers, then BrainMVB auth-path swap), so it is **a future-session decision, not a quick
task.** Next session: decide scope/sequencing before writing any code.

### C. Smaller demo-compatible polish (if continuing reads)
- ✅ **DONE (UNCOMMITTED):** HomePage **Recommendation** via `wiki/question` (`GET /api/brain/recommendation`)
  + **retired the mock `insightsService.ts` cron** (removed from `index.ts`; killed the boot 401 noise).
- ⛔ **Detail panels BLOCKED on demo:** `GET /v1/wiki/entity/{id}` wants an `ent_` wiki entity id
  (`isBrainId(id,"ent")`); demo exposes ledger ids (`acct_`/`cp_`/`tx_`) → 400. Needs a brain-core
  ledger-id→ent-id mapping. (`wiki/search` is also empty on fresh tenants.)
- Remaining: make the assistant evidence line **clickable** (needs a tx detail view first).

## Deferred / gated
- Phase 7 **Audit** page — demo tenant too sparse (1 event, no anchor).
- Anything write/execute (Phase 5 Policy sign, Phase 6 execute) — gated on fork **B**.
- Push the branch / open a PR — only when you ask.

## Standing rules
Commit only when asked (done for the read milestone); branch-first, never main; no Claude
attribution; no `ai-assisted` PR label. Track dead/old code in `DEAD-CODE-INVENTORY.md`
(don't delete it). brain-core protocol changes go via its own PR/CI, never ad-hoc.
