# BrainMVB — Next Steps

Branch `feat/brain-core-integration` (off `origin/feat/ui-rework`), 3 commits, **not pushed**.
Full context: `HANDOFF.md`. Auth = live demo-provision fence (key-free). node only via WSL.

## Done ✅ (committed)
brain-core **read integration** across 5 surfaces, all on the demo path, server-verified:
Accounts + Recent transactions (FinancesPage), "Money in all accounts" total (HomePage),
grounded BrainAssistant (`/v1/wiki/question`) + evidence trail. `npm run brain:smoke` PASSES.

## Done ✅ (UNCOMMITTED — Fork A: propose-only §6 demo)
Flagship "Brain proposes → §6/Policy gate decides" moment with **no money movement**. New
"Bills — let Brain decide" widget on FinancesPage lists the 3 AP invoices; "Let Brain pay" →
`POST /api/brain/propose` → renders ALLOW / CONFIRM (owner+cfo) / REJECT + expandable policy
trace + proposal/decision ids ("not executed"). New scoped BFF write route (propose+evaluate
only), `getBrainSession` provision-race fix, `brain:smoke` extended to assert all 3 outcomes.
Verified end-to-end vs live api.brain.fi (smoke + curl + live browser). See `HANDOFF.md` top
section for the full file list + probe facts. **Commit when asked (branch-first).**

## To run / re-verify
- Secret value is in `C:\Users\sanke\brain-prod-provision-secret.txt`.
- `BRAIN_DEMO_PROVISION_SECRET='<secret>' npm run brain:smoke` → `[smoke] PASS`.
- `BRAIN_DEMO_PROVISION_SECRET='<secret>' PORT=5052 npm run dev` → http://localhost:5052 →
  "Continue with Demo — Existing User" → Finances + assistant. (If a 504 "Outdated Optimize Dep":
  `rm -rf node_modules/.vite`, restart, hard-reload.)

## The forks (pick one — neither started without your call)

### A. Propose-only §6-gate demo — ✅ DONE (uncommitted, see above)
Built + verified. (Probe correction: the demo tenant DOES have payable invoices — `GET
/v1/ledger/invoices` returns 3 AP bills, `metadata.scenario:"ap"`; they're `ledger_invoices`,
not `ledger_obligations`, which is why the old note said "0 obligations". The `pay_invoice`
shortcut resolves amount/currency/counterparty/source from the invoice; `obligation_id` is null.)
Possible follow-ons if continuing A: approve-flow for the CONFIRM case (`POST
/payment-intents/{id}/approve`, token has `payment_intent:approve`) to flip pending_approval →
approved in the UI; surface the proposed intents elsewhere (Activity/Review pages).

### B. Production-tenant decision (unlocks the real value)
Real per-user data, policy **signing**, payment **execution** all require moving off the
fresh-demo-tenant model to a real per-user tenant + auth path. That needs a proper **brain-core
PR** (the reverted `POST /v1/auth/service-token` endpoint is the design: shared-secret fenced,
scope-ceiling reads+propose/approve, mints via the existing `siwxSigner`, key stays on box). This
is a strategic + cross-repo decision, not a quick task.

### C. Smaller demo-compatible polish (if continuing reads)
- Account / transaction **detail panels** via `GET /v1/wiki/entity/{id}` (provenance + confidence).
- HomePage **Recommendations** via `wiki/question` canned prompts + **retire `insightsService.ts`**
  (note: `wiki/search` is empty on fresh tenants; "Actions"/obligations list is empty on demo).
- Make the assistant evidence line **clickable** (needs a tx detail view first).

## Deferred / gated
- Phase 7 **Audit** page — demo tenant too sparse (1 event, no anchor).
- Anything write/execute (Phase 5 Policy sign, Phase 6 execute) — gated on fork **B**.
- Push the branch / open a PR — only when you ask.

## Standing rules
Commit only when asked (done for the read milestone); branch-first, never main; no Claude
attribution; no `ai-assisted` PR label. Track dead/old code in `DEAD-CODE-INVENTORY.md`
(don't delete it). brain-core protocol changes go via its own PR/CI, never ad-hoc.
