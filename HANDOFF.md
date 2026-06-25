# BrainMVB — Handoff

_Authoritative current state at top. Older dated notes were folded into this; full history is in
git log + the session memory `brainmvb-brain-core-integration`._

## ⛔ DEV-WORKFLOW HARD RULE (read first)

**The Windows checkout (`C:\Users\sanke\Work\brain.fi\BrainMVB`) is a READ-ONLY mirror. ALL
edit / write / build / run / git happens in WSL** (`/mnt/c/Users/sanke/Work/brain.fi/BrainMVB`,
native Node 22) so files stay **LF**. Same setup as brain-core. Reads (Read/Grep on the `C:\…`
path) are fine. The Windows Edit/Write tools write **CRLF** — never let CRLF reach the repo.

A committed-pending **`.gitattributes`** (`* text=auto eol=lf` + binaries marked `binary`) is the
durable guard: git normalizes text to LF on add regardless of the tool. **Keep it.** Detect line
endings with `file <path>` (not `grep $"\r"`). If the Windows Edit tool is ever used, normalize the
touched files in WSL afterward: `sed -i 's/\r$//' <files>`. Full rationale in the memory
`brainmvb-wsl-only-edit`.

> 2026-06-25 incident + fix: a Windows `autocrlf` had flipped the entire working tree to CRLF (466
> files modified with zero real changes; PNG/PDF binaries CRLF-corrupted). HEAD was clean LF
> throughout. Restored via `git checkout` of the pure-noise files + binaries and added
> `.gitattributes`. Working tree is now clean (only the Fork A changes below).

## CURRENT STATE — 2026-06-25 (Fork A: propose-only §6 demo — UNCOMMITTED)

**Fork A is built and verified end-to-end against live `api.brain.fi` (v0.0.6); NOT committed.**
The flagship "Brain proposes a payment → the §6/Policy gate decides" moment, with **no money
movement** (the demo token has `payment_intent:propose` + `policy:read` but NOT
`payment_intent:execute`, and the BFF exposes no execute path).

**What it does (FinancesPage → new "Bills — let Brain decide" widget):** lists the 3 seeded AP
invoices and, per bill, a "Let Brain pay" button → BFF proposes a PaymentIntent → renders the
decision: **Auto-approved (ALLOW)** / **Needs approval (CONFIRM, names owner+cfo)** / **Blocked
(REJECT)**, with an expandable per-rule policy trace and the proposal/decision ids labelled "not
executed". The 3 seed bills exercise all three outcomes:
- CloudOps $19,400 (approved, ≤$50k) → ALLOW (`ap-auto-approved-within`)
- Datacenter $187,000 (approved, >$50k) → CONFIRM (`ap-confirm-approved-large`, approvers owner+cfo)
- Quick Pay $4,800 (unapproved vendor, carries ⚠ flags) → REJECT (`ap-reject-unapproved`)

**Files changed (all compile clean; pre-existing `tsc` reds unchanged — see DEAD-CODE §C):**
- `server/brain/client.ts` — added `listLedgerInvoices`, `evaluatePolicy` (read-only dry-run for the
  "why" trace), `proposeInvoicePayment` (pay_invoice shortcut) + their types.
- `server/brain/proxy.ts` — added **`POST /api/brain/propose`** (the ONLY write the BFF exposes):
  looks up the invoice server-side → `evaluatePolicy` (best-effort trace) → `proposeInvoicePayment`
  → returns `{ intent, decision }`. Scoped to propose/evaluate only; everything else stays GET-or-405.
- `server/brain/auth.ts` — **race fix**: `getBrainSession` now coalesces concurrent provisions onto
  one in-flight promise. Without it, the page firing accounts+invoices+counterparties on mount
  provisioned 3 separate tenants, so invoice↔counterparty joins mismatched ("Unknown vendor"). Found
  via the live UI check; also fixes latent accounts/transactions cross-query inconsistency.
- `client/src/components/BrainBillsInbox.tsx` — NEW. The bills inbox + propose mutation + decision/trace UI.
- `client/src/pages/FinancesPage.tsx` — renders `<BrainBillsInbox/>` after Recent transactions.
- `script/brain-smoke.ts` — `npm run brain:smoke` now also proposes each AP bill and asserts the
  status ∈ {approved, pending_approval, rejected} + logs the policy outcome. Still PASSES.

**Verified:** `npm run brain:smoke` PASS (3 outcomes); full HTTP stack via curl (`POST /api/brain/propose`
→ 200 `{intent, decision}`); live browser (preview MCP) — all 3 decision states + expanded trace
render with correct content; `npx tsc --noEmit` adds no new errors (only the 5 pre-existing files).

**Probe facts (live, captured this session):** `POST /v1/payment-intents` `{type:"pay_invoice",
invoice_id}` → 201 with `status` = the outcome (approved/pending_approval/rejected). `POST
/v1/policy/{tenant}/evaluate` (needs only `policy:read`) returns `{outcome, matched_rule_id,
required_approvers, trace[]}`; action shape is `{kind:"outbound_payment", counterparty_id,
amount:{currency,value}}` (amount MUST be the `{currency,value}` object, not a bare string).
`GET /v1/ledger/invoices` returns AP+AR rows; AP bills carry `metadata.scenario:"ap"` + `flags`.
The provision response also returns `scenario.{vendors,customers,accounts,ap_invoices,ar_invoices,policy_id}`.

**Next:** commit when asked (branch-first). Remaining forks unchanged: **B** production-tenant
(writes/execution, needs a brain-core PR) and **C** read polish. See `next-steps.md`.

---

## PRIOR — 2026-06-25 (brain-core read integration: committed milestone)

**What BrainMVB is:** "Brain Finance", a programmable-neobank web app (React/Vite + Express,
npm, ESM). It is being made a thin web client + Backend-for-Frontend (BFF) over the live
**brain-core** protocol (`https://api.brain.fi/v1`, v0.0.6), per the 8-phase blueprint in
`deliverables/Brain-Migration-Plans.docx` (+ Handoff). That docx is dated April 2026 and is
**stale in two ways**: Crossmint was removed in June (real provisioning adapters are now
**Plaid + WireX**), and brain-core's real routes are `/v1/ledger/*`, `/v1/agents/*`,
`/v1/payment-intents/*` (not the doc's `/v1/execution/*`).

**Branch:** `feat/brain-core-integration` (off `origin/feat/ui-rework`). **3 commits, NOT pushed:**
- `e75a7a4 feat(brain): wire FinancesPage accounts to brain-core Ledger via BFF proxy`
- `542fea5 feat(finances): show live Ledger transactions and accounts total from brain-core`
- `17c08a4 feat(assistant): ground answers in brain-core Wiki Q&A with evidence trail`
Author Sanket Debnath. Working tree clean.

### Auth approach (FINAL): demo-provision fence — no key, no brain-core change, no deploy
The BFF gets per-tenant tokens from the **already-live, key-free** `POST /v1/demo/provision-run`
(`X-Demo-Provision-Auth: BRAIN_DEMO_PROVISION_SECRET`). brain-core creates a fresh seeded tenant
and returns a scoped token (reads + propose, no execute, ~30 min). Cached per app-user in
`server/brain/auth.ts` `getBrainSession()`. Same path the BrainSaaS playground uses. The browser
never sees a brain-core token; it only calls same-origin `/api/brain/*`.

> **Discarded (owner decisions):** (a) copying the box's private `AUTH_SIGN_KEY` into the BFF —
> full mint power, blocked by the prod classifier as exfiltration; (b) a new brain-core
> `POST /v1/auth/service-token` endpoint that was built + locally verified, then **reverted and
> deleted** (protocol code must land via a normal brain-core PR/CI, not ad-hoc commit/deploy).
> brain-core clone is clean on `main`. That endpoint is the design if a production per-user
> (non-demo) tenant path is ever wanted.

### What's done — 5 surfaces on real data, all verified through the running Express server
1. **FinancesPage Accounts** → `/api/brain/ledger/accounts` (Operating $1.69M, Reserve $1.2M, Brain Smart Account 0.005 ETH).
2. **FinancesPage "Recent transactions"** widget → `/api/brain/ledger/transactions` (real txns).
3. **HomePage "Money in all accounts"** total → sum of `/api/brain/ledger/accounts`.
4. **BrainAssistant** grounds answers in `POST /v1/wiki/question` (`/api/assistant/chat` injects
   grounding into the Anthropic system prompt; best-effort fallback to plain chat).
5. **Evidence trail** — assistant shows "Grounded in N records from your ledger" (hover = the ids).
All keep their original static data as a fallback when brain-core is unreachable.

### File map (`server/brain/`)
- `config.ts` — all `BRAIN_*` env; `brainTokenMode()` = `demo-provision` | `local-key` | `unconfigured`.
- `auth.ts` — `getBrainSession(appUserId)` → `{ token, tenantId }`, cached. demo-provision (preferred) + local-key (dev) minting via `jose`.
- `client.ts` — `brainRequest()` + `listLedgerAccounts`, `getWikiSchema`, `askWikiQuestion` (parses the ```json envelope + evidence).
- `ids.ts` — deterministic `user_<26-char ULID>` subject (local-key mode only).
- `proxy.ts` — `/api/brain/*` router, **GET-only** passthrough. Mounted in `server/routes.ts`.
- `README.md` — env table + how it works. (There is no `tenant.ts` — removed in the refactor.)
- `script/brain-smoke.ts` — `npm run brain:smoke` go/no-go (provision → `/wiki/schema` + `/ledger/accounts`).

### How to run / verify
```
# secret value is in C:\Users\sanke\brain-prod-provision-secret.txt
BRAIN_DEMO_PROVISION_SECRET='<secret>' npm run brain:smoke      # → [smoke] PASS (3 accounts)
BRAIN_DEMO_PROVISION_SECRET='<secret>' PORT=5052 npm run dev     # then open http://localhost:5052
#   → "Continue with Demo — Existing User" → Finances + the assistant
```
node is **only on WSL** (`/mnt/c/Users/sanke/Work/brain.fi/BrainMVB`, Node 22). Run everything via
`wsl.exe -e bash -lc "cd /mnt/c/... && <cmd>"`. Background a long server with the harness's
`run_in_background` (a trailing `&` orphans it). With no `ANTHROPIC_API_KEY` the assistant returns
the grounded JSON directly (prose needs the key); Finances widgets need no key.

### Gotchas
- Each `provision-run` mints a **fresh** seeded demo tenant (so different app users / restarts get
  different tenants; fine for a demo, not real per-user data).
- The golden id `tnt_01GOLDEN…` is **not a valid ULID** (has O, L) → 400s `isBrainId`. Use a
  demo-provisioned tenant.
- `wiki/question` answer is a ```json-fenced string; `wiki/search` returns `[]` for fresh tenants
  (use question, not search). Demo Audit is sparse (1 event, no anchor) → Phase 7 deferred.
- `npm run check` (`tsc`) has **pre-existing reds** unrelated to this work (no `target` in
  tsconfig → BigInt/Set/await/`insights`/Plaid types). App runs via `tsx`/esbuild. See
  `DEAD-CODE-INVENTORY.md` §C. My integration files compile clean.
- Local Vite dev cache can go stale (504 "Outdated Optimize Dep") after dep changes →
  `rm -rf node_modules/.vite` and hard-reload. HMR ws→5173 warnings are harmless.

### What's next
See `next-steps.md`. The read path is essentially complete; the remaining value forks: a
propose-only §6-gate demo (still demo-compatible), or the production-tenant decision (unlocks
writes/execution, needs a brain-core PR).
