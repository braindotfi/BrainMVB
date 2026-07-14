# CLAUDE.md — Brain Finance

Working notes for agents. The full project overview lives in `replit.md`; this file
captures contracts that are easy to break silently. Keep it short and current.

## Rule references (RuleDetail links)

Every "rule reference" surface in the app — auto-handled receipt, Audit Log record
popup, settled record card, Rules page rows — must open the SAME `/rules/:id`
RuleDetail when tapped. They all go through one helper and one canonical store.

### The contract
- **Canonical rules live in `rulesStore.ts`** (seeded from `mockRules.ts`). The
  only valid rule ids are the store ids: `utility, saas, lease, payroll, sweep,
  ask-over-500, second-approval, flag-unusual, bank-detail-change, duplicate-catch`.
- **`client/src/lib/openRuleDetail.ts` is the single source of truth** for opening a
  rule. `resolveRule(id)` → `getRule` decides tappable-vs-plain; `openRuleDetail(id,
  navigate)` resolves and pushes `/rules/:id`. On an **unresolved id it
  `console.warn`s** `openRuleDetail: no rule found for id '<id>'` and returns false —
  it never fails silently and never produces a dead tap.
- **Two ways a rule is referenced:**
  - Receipts embed the whole rule object (`proposal.rule`); consumers read
    `proposal.rule.id`.
  - Audit records reference by id: `linked[]` entries with `kind:"rule"` carry the
    id in `refId`.
  - There is **no** `ruleId`/`rule_id` field for RuleDetail refs; don't introduce
    naming drift. (`BrainBillsInbox`'s `rule_id` is the separate brain-core bills
    payload — unrelated.)
- **Unresolvable id = graceful fallback:** the reference renders as plain,
  non-tappable text with a muted `(rule unavailable)` note. This path is a runtime
  safety net (e.g. a rule deleted via `deleteRule`, then an old receipt is opened) —
  **shipped mock data must have zero dangling refs.**

## Vendor + document references (same contract, different stores)

Vendors and documents follow the **identical** pattern as rules — referenced by id,
resolved via their own `openXDetail` helper against a canonical store, with a
resolve-or-plain-text fallback:
- **Vendors** — canonical store `MOCK_VENDORS` (`mockVendors.ts`). Helper
  `openVendorDetail.ts`: `resolveVendor(id)` decides tappable-vs-plain;
  `openVendorDetail(id, navigate)` pushes `/vendors?vendor=<id>` (VendorsPage reads
  `?vendor=` via `useSearch` and auto-opens the detail). Referenced by `linked[]`
  `kind:"vendor"` (`refId`) **and** by `document.vendorId`.
- **Documents** — canonical store `MOCK_DOCUMENTS` (`mockDocuments.ts`, served by
  `documentsStore.ts` `getDocument`/`allDocuments`). Helper `openDocumentDetail.ts`:
  `resolveDocument(id)` decides tappable-vs-plain; `openDocumentDetail(id, setOpen)`
  opens `DocumentViewerPopup` (setter, not navigate — by design, so it stacks over the
  audit popup). Referenced by `linked[]` `kind:"invoice"` (`refId`) **and** by
  `proposal.invoiceId`. This is the **generalized read-only EVIDENCE viewer**: ONE
  `DocumentRecord` type + ONE component render EVERY `DocKind` (`invoice` |
  `prior_payment` | `bank_transaction` | `contract` | `purchase_order`) from
  `documentTypes.ts` — there is NO per-kind type or per-kind component. It replaced the
  invoice-only `mockInvoices`/`invoiceTypes`/`openInvoiceDetail`/`InvoiceViewerPopup`
  (all deleted). The audit-log linked kind stays `"invoice"` (the `LinkedEntityKind`
  that overlaps `DocKind`) and routes through `openDocumentDetail`. Every kind shows
  provenance + a "viewer, not the system of record" caption; `bank_transaction` carries
  a `reconciliation` block; a `compareToId` twin drives an in-place COMPARE toggle
  (duplicate invoice / bank-detail change). KNOWN vendors carry `vendorId` (+
  `vendorName`) and deep-link; NON-vendor counterparties (landlords, ledgers) carry
  only `counterparty` text and no `vendorId`.
- **A vendor's `history` must reconcile with its referenced documents/payments** — a
  vendor with a linked paid document must have `paymentCount ≥ 1` and
  `totalPaid/avgAmount/lastPaidLabel` consistent with the referenced amounts/dates;
  `trustStatus` must match how its records actually behaved (a payment human-approved
  above the auto-pay limit is NOT "trusted"; a single recent payment reads as the
  "new" tier). No stubs, no contradictory tenure.

### NON-vendor counterparties are NOT vendor links
Payroll employees, DeFi protocols, and internal accounts are **not** in the
trust/allowlist model — forcing them into `MOCK_VENDORS` would resolve-but-lie. They
use accurate `linked[]` kinds instead (`kind:"employee"`, `"protocol"`, `"ledger"` in
`LinkedEntityKind`) and render as plain, non-tappable text with **no** `(… unavailable)`
suffix (they were never meant to resolve). Never label them `kind:"vendor"`.

### Dev guards — unified, resolution AND coherence for all entity types
`client/src/lib/ruleConsistencyCheck.ts` runs on dev boot (imported in `main.tsx`,
guarded by `import.meta.env.DEV`). It never throws; it only `console.error`s. It now
covers **rules, vendors, documents, proposals, anchor-UI state, and agent↔event
domain** — resolution guards run first, coherence guards second. Extend this one
module; **don't fork** a parallel checker.

**Resolution guards** (does every referenced id point at a real store entity?):

1. **`checkRuleReferences()`** — every rule ref from `MOCK_AUDIT_RECORDS` +
   `AUTO_HANDLED_PROPOSALS` resolves via `getRule`. Logs `[rule-consistency] OK ...`.

2. **`checkVendorReferences()`** — every `kind:"vendor"` linked ref + every
   `document.vendorId` (only docs that name a KNOWN vendor) resolves via
   `resolveVendor`, and every `vendor.ruleIds` resolves via `getRule` (the reverse
   edge). This is the guard whose ABSENCE let the vendor-id drift
   (`aws`/`adobe`/`comcast`/`bright-futures`) ship silently. Logs
   `[vendor-consistency] OK ...`.

3. **`checkDocumentReferences()`** — every `kind:"invoice"` linked ref + every
   `proposal.invoiceId` (across `MOCK_PROPOSALS` + `AUTO_HANDLED_PROPOSALS`) resolves
   via `resolveDocument` against `MOCK_DOCUMENTS`. Logs `[document-consistency] OK ...`.

   **`checkProposalReferences()`** — every audit record's `kind:"proposal"` linked
   ref **and** its top-level `proposalId` resolve via `resolveProposal` (which spans
   the queue, receipts, AND standalone settled/held twins). Logs
   `[proposal-consistency] OK ...`.

**Coherence guards** (does a *resolved* ref also tell the truth? — this is the gap
that let rules break before):

4. **`checkReferenceCoherence()`** — for each audit record: a linked document's
   `amount` == the record's `amount`; a linked document's `vendorId` (when it names a
   KNOWN vendor) == the record's linked vendor; every `kind:"vendor"` ref points at an
   ACTUAL vendor (catches the `j-smith`/`aave` misfiling class); and a vendor with a
   linked PAID document is not contradicted by zero payment history. **Plus lifecycle
   coherence** across the proposal→document→audit→anchor chain (the
   "resolves-but-lies-about-STATE" class):
   - a SETTLED audit record (`approved`/`auto_approved`) must not link a proposal
     that is still `pending`/`verifying`/`postponed` — a settled/anchored event
     can't point at an un-acted proposal (this is why `AUD-3308FE` links the
     executed twin `settled-aws`, not the still-pending `prop-aws`);
   - a linked document's status matches the event type (`approved`/`auto_approved`
     ⇒ `paid`; `flagged` ⇒ `held`) — **only for kinds that HAVE a status**
     (invoice/prior_payment/purchase_order); `bank_transaction` + `contract` carry
     none and are skipped;
   - a proposal's `invoiceId` matches its OWN lifecycle — a pending-like proposal
     must not own a `paid` document, and an `executed`/`auto_handled` proposal must
     own one — **and** its document `amount` == the proposal `amount`;
   - a document's `vendorName` == its resolved `vendor.name` (catches rename drift);
   - **document integrity**: every `bank_transaction` carries a `reconciliation`
     block, a document naming a KNOWN vendor also carries a `vendorName`, and a
     `compareToId` twin resolves + names the SAME vendor (when both known) + sits
     within a 5% amount band (the pair exists to surface a duplicate / bank-detail
     change, so a wildly different vendor or amount would be an incoherent compare).
   NOTE: a `flagged` record CAN link a pending proposal and CAN be anchored (a hold
   is itself an auditable event — see `AUD-3K8Q`), so neither is treated as a lie;
   display labels (linked-ref label, counterparty) MAY differ from a vendor's
   canonical name ("Notion Team" vs "Notion Labs") and are NOT equality-checked.
   Logs `[coherence] OK ...`. NB: standalone settled/held twins (`AWS_SETTLED` etc.)
   live outside the queue arrays, so they must be registered in
   `openProposalDetail.ts` `allProposals()` or their refs dangle.

5. **`checkSemanticAuditRecords()`** — narrative guard. Asserts that the mock audit
   records tell a consistent story:
   - An **untrusted vendor** (listed in `UNTRUSTED_VENDORS`) must never have an
     `auto_approved` audit record — they're either flagged for human review or held
     by always_on guards.
   - An `auto_approved` record whose linked rule is resolvable must have a category
     that semantically matches the counterparty (e.g. a contractor/studio under
     a "rent & lease" rule is flagged).
   This is the guard that would have caught the original AUD-7N2S claiming Bright
   Futures was auto_approved. Logs: `[semantic-consistency] OK ...` or listed
   mismatches.

6. **`checkAnchorUiCoherence()`** — anchor-UI honesty guard. On-chain verification
   is only real once a record is anchored, so any record whose `anchor.status` is
   `pending_next_batch` must NOT carry `merkleRoot` / `baseTx` / `verifyHref` (there
   is nothing to link to yet). This is the DATA-level assertion that keeps the ONE
   shared `AnchorStatus` component honest across every surface — the UI renders the
   Verify affordance disabled (with the caption "Verification opens once anchored.")
   purely from `anchor.status`, so a pending record carrying hashes/href would be a
   lie waiting to leak into the UI. Logs `[anchor-ui-consistency] OK ...`.

7. **`checkAgentDomainCoherence()`** — agent↔event domain guard. The proposing
   agent named in a lifecycle label must stay inside its canonical catalog domain
   (see `AGENT_META` in `ProposalDetail.tsx`): **Invoice** = AP / vendor payments
   (incl. payroll runs & subscriptions), **Collections** = AR, **Cash** =
   treasury/sweep, **Close** = reconciliation. The proposing agent lives ONLY in the
   lifecycle label (`"<X> Agent proposed|detected …"`), so the guard parses it, then
   matches the ACTION PHRASE against per-domain keyword regexes (`AGENT_DOMAIN_KEYWORDS`).
   It flags ONLY when the matched domain(s) are non-empty AND the proposing agent is
   not among them; an ambiguous phrase (no keyword match) is SKIPPED so the guard
   never fires false positives on future copy. This is the guard that catches the
   class where e.g. the Close Agent (reconciliation) "proposes a payroll run" or a
   vendor payment — which belong to the Invoice Agent. Logs
   `[agent-domain-consistency] OK ...`.

8. **`checkActorPayeeSegregation()`** — segregation-of-duties guard. On a payment
   record the human ACTOR who approved it (lifecycle step `actor`) must never be the
   same party as the PAYEE it moves money to. The guard reuses the SHARED
   `linkedRelationship(record, link)` predicate to decide what counts as a payee —
   so it only fires on the exact rows the UI chips label `PAYEE` (payment event type
   + numeric amount + receiving kind vendor/employee), and can never drift from the
   UI. It compares actor identity tokens (raw + resolved email/id via `actors.ts`)
   against the payee's label / refId / resolved vendor name. Passes clean today
   (`sarah@meridian` is never a payee). Logs `[actor-payee-segregation] OK ...`.

9. **`checkMemberActorCoherence()`** — member↔actor seam guard. Members are
   CORE-BACKED (fetched at runtime, ephemeral ids) so this guard can't assert against
   live member data at boot; what it protects is the client seam that links an audit
   ACTOR to a core member. `resolveMemberByTokens` matches by normalized email/id, so
   the `actors.ts` registry those tokens come from must be unambiguous — this guard
   flags any duplicate or empty actor email/id (which would make an ACTOR resolve to
   the wrong member, or silently fail to link). Logs `[member-actor-coherence] OK ...`.

### Actor vs payee convention (audit records)

Audit records surface two distinct parties and they must stay visually + semantically
separate:
- **ACTOR** = WHO decided. Human-approval lifecycle steps carry an `actor` field
  (an email/id, e.g. `sarah@meridian`). The UI resolves a muted role suffix from the
  canonical `client/src/lib/actors.ts` registry (`resolveActorRole`) and renders it
  inline: `"sarah@meridian approved · finance admin"`. Roles are NEVER hardcoded per
  step. `LifecycleStep.authority` is reserved for the future members/limits spec
  (a second suffix like `· within her $10K payroll limit`) — the type + render slot
  exist.
  - **Actor → member link**: the ACTOR label becomes TAPPABLE (opens the member popup
    via `openMemberDetail`) ONLY when `resolveMemberByTokens(actorIdentityTokens(step.actor))`
    finds a real core member (matched by normalized email/id against the API-backed
    members cache). No core match → plain text. This is a link into core's record, never
    a client-side authority claim. `AuditRecordPopup` subscribes to `useMembersCache()`
    so labels light up once the cache primes. Guard 9 (`checkMemberActorCoherence`) keeps
    the `actors.ts` registry unambiguous (no dup/empty email/id) so a link never resolves
    to the wrong member.
- **PAYEE** = WHO was paid. Linked-evidence rows on payment records show a
  RELATIONSHIP chip (`PAYEE`), not the bare entity kind. This is DERIVED centrally by
  `linkedRelationship(record, link)` in `auditTypes.ts` from record type (payment
  event + numeric amount) and link kind (vendor/employee receive; protocol/ledger are
  treasury destinations, not payees; rule/invoice/proposal are evidence). An explicit
  `link.relationship` overrides the derived value. ONE convention, driven from data —
  never per-surface. `checkActorPayeeSegregation` (guard 8) asserts these two parties
  are never the same identity.

### History (2026-07): the "rule links don't work" bug

**Phase 1 — resolution fix**
- Diagnosis: wiring was correct and complete; only MOCK DATA was wrong. Three audit
  records pointed at rules that never existed — `cleaning` (`AUD-9H4X`, `AUD-0C4U`)
  and `contractor` (`AUD-7N2S`) — so those taps fell through to plain text.
- Fix (no new rules invented; repointed to correct existing rules):
  - `AUD-9H4X` (Apex trust-revoked): removed the dangling rule link — `trust_revoked`
    is a vendor event, and no existing pausable rule governs untrusted Apex.
  - `AUD-0C4U` ("new rule created"): repointed to `sweep` ("Move extra cash to
    savings"), matching the weekly-sweep suggestion narrative.
  - `AUD-7N2S` (Bright Futures): initially repointed to `lease` — but see Phase 2.
- Also added `console.warn` in `openRuleDetail` and the dev resolution guard so
  this id drift can never ship silently again.

**Phase 2 — semantic audit (follow-up)**
The resolution fix made the id resolve, but the NARRATIVE was still broken.
Bright Futures is the canonical **bank-detail-change fraud example** across the
entire demo — it must NEVER be auto_approved. Cross-surface check confirmed:

| Surface | Bright Futures story |
|---|---|
| `prop-bankchange` (NEEDS_REVIEW) | "Bank details changed on a contractor invoice" — held for review, `severity: danger`, `policy: ap.fraud.v2` |
| `AUD-7K2M` (audit) | `eventType: "flagged"`, summary: "Payment held — bank details changed", lifecycle: escalated to human, payment held pending verification |
| `ReviewItems.tsx` | "Should I pay Bright Futures Studio $3,200?" — verify-first action |
| `UNTRUSTED_VENDORS` | `Apex Cleaning Co`, `Meridian Consulting LLC`, `Northwind Logistics` — Bright Futures is NOT listed, but the bank-detail-change guard (`bank-detail-change`) is always_on and holds ALL vendor bank changes |

**AUD-7N2S fix (semantic):**
- Changed `eventType` from `"auto_approved"` → `"flagged"`.
- Summary changed to "Payment held — bank details changed" (matching AUD-7K2M).
- Lifecycle rebuilt to match: propose → escalate (policy/ap.fraud.v2) → held pending
  verification. No ACH settled step — it's still held.
- Removed the `lease` rule link entirely; replaced with a proposal link to
  `prop-bankchange` (Invoice #BFS-0426).
- Anchor status: `pending_next_batch` (unchanged — the payment is still held, not
  anchored as executed).

**AUD-7K2M fix (dangling proposal ref):**
- The `linked` proposal ref was `prop-bright-futures` (a non-existent id). Fixed
  to `prop-bankchange` (the real proposal id for Bright Futures), with label
  "Invoice #BFS-0426" to match the proposal's invoice title.

**Result:** Both `AUD-7K2M` and `AUD-7N2S` now tell the same story as the review
proposal and the `ReviewItems` surface: Bright Futures is HELD for bank-detail
verification, never auto-cleared.

**Phase 3 — anchor-UI honesty + agent↔event domain coherence**
Two more "resolves-but-lies" classes, each fixed in data AND locked by a new
unified dev guard (see guards 6 & 7 above):
- **Anchor-UI:** on-chain verification is only real once anchored, so `AnchorStatus`
  now renders the Verify affordance DISABLED with the caption "Verification opens
  once anchored." and NO live link whenever `anchor.status` is `pending_next_batch`
  — in BOTH proof and status modes, driven purely from `anchor.status`. Guarded by
  `checkAnchorUiCoherence` (a pending record must not carry `merkleRoot`/`baseTx`/
  `verifyHref`).
- **Agent↔event domain:** two records had the WRONG proposing agent for the action —
  `AUD-8A1R` ("Close Agent proposed payment" for an office-lease AP payment) and
  `AUD-5J7Y` ("Close Agent proposed payroll run") both belong to the **Invoice**
  Agent (AP). Fixed the lifecycle labels; `AUD-5J7Y`'s linked `PAYROLL_SETTLED`
  proposal (`mockProposals.ts`) also had `agent: "close"` → changed to `"invoice"`
  with its timeline label updated to match. Guarded by `checkAgentDomainCoherence`.

## Route ordering (wouter)
`/rules/:id` is registered before `/rules` in `App.tsx` — keep specific routes ahead
of generic ones. `RuleDetail` reads `params.id` and must not be modified to accept a
different key.

## Branch reconciliation (state of record)
This workspace line is the unified state intended to land on `main` (the platform merge
flow lands it once the task is approved; after that merge `main` is the source of truth).
It carries the full platform (Review, Rules, Vendors, Audit Log, Finances, the members
integration, the BFF) plus two honesty commits that previously lived only on a side branch:
1. real SIWE signature verification with a single-use nonce in `server/routes.ts`
   (the dead `/api/account/allocate` stub was dropped in the same pass), and
2. honest empty states in place of fabricated money surfaces (the static account
   list on Finances, the auto-handled receipts on Review, and the Account Totals card
   are gone, so an empty or unreachable ledger reads as empty rather than inventing
   numbers).
The superseded branches `feat/ui-rework`, `feat/brain-core-honesty`, and
`feat/brain-core-integration` are folded into this line (reconciliation commit `7e89a5b`
folded in the honesty and integration lines) and are slated for deletion once it lands on
`main`. If a conflict ever forces a choice between a fabricated surface and an empty state,
the empty state wins.

## SIWE nonce (CSPRNG)
The `/api/auth/nonce` login nonce is generated by a cryptographically secure RNG
(`generateNonce()` in `server/nonce.ts`, backed by `crypto.randomBytes(32).toString("hex")`)
— never `Math.random()`, which is not a CSPRNG. The consume-before-validate flow, the
expiry, and the address binding in the verify handler are unchanged. `server/nonce.test.ts`
pins the two properties (64-char hex, distinct successive values) as a merge gate.

## Settled record card (STATUS vs PROOF)
`client/src/components/SettledRecordCard.tsx` is the post-approval operational view of a
proposal: past-tense headline ("You approved / executed"), meta line, NO decision buttons,
and the anchor line via `AnchorStatus mode="status"` (status, not the full cryptographic
proof). Its "View full record in Audit Log" link is the ONLY path to the canonical PROOF —
the rule stands: STATUS on operational surfaces, PROOF in the canonical Audit Log record.
It renders from `ReviewPage` "Settled today": the demo proposal (`MOCK_PROPOSALS[0]`, live
queue empty) moves Needs Review → executing → settled purely by user action via
`reviewStatusStore` (no setTimeout), and an `executed` row opens the card. Live brain-core
rows have no client-side settled state, so they never populate this list; their settled
state is read straight from the Audit Log instead.

## BFF safety tests (invariant guard)
`server/brain/bff-invariants.test.ts` plus `client/src/lib/approvalRejections.test.ts`
are the platform-side twins of brain-core's own invariants. They pin five safety rules:
token routing (propose uses the AGENT token only; reads, member writes, and approve or
reject use the MEMBER token), no `actor` field in any BFF-constructed payload (ACTOR is
the SESSION and core derives it), provision fail-hard when the member token is missing
(never a silent agent-only fallback), the full approval-rejection mapping including both
`self_approval_blocked` cases split by `details.payee_unresolved`, and the secrets
boundary (the provision secret and brain-core tokens never reach the browser). brain-core
is mocked at the fetch boundary, so the suite never touches the live API. Run it with
`npm test`. Any change to `server/brain/*` must keep these green; if the behavior is
meant to change, update the test in the same commit so the invariant stays explicit.

## CI gate
`.github/workflows/test.yml` runs `npm test` (the vitest suite) on every pull request and
on push to `main` (Node 20, npm cache). The workflow is green only when the suite passes,
so the BFF invariants and the CSPRNG nonce test are a MERGE GATE, not just documentation.
Any change to `server/brain/*` must keep the invariant suite green or the PR cannot land.

## Repo discipline
`main` is the source of truth; push to GitHub and merge to main after each milestone so the
public repo never drifts. The CI gate above must be green before a PR merges to `main`.
No work is complete until it is on main; branch-complete is not complete.

## Production tenancy (Phase 2, gated by BRAIN_TENANCY_MODE=production)
Demo mode (default) is byte-identical to before — `/api/brain/tenancy` returns
`{mode:"demo", linked:true}` and nothing else changes. In production mode:
- **Identity mapping** `brain_identities` (app userId → tenantId/userPrincipalId) is the ONLY
  link between platform accounts and brain-core tenants. `external_ref` sent to core is ALWAYS
  the app userId, never an email.
- **Platform-service calls** (`server/brain/tenancy.ts`) use `X-Platform-Service-Auth:
  BRAIN_PLATFORM_SERVICE_SECRET`: `createTenant`, `exchangeSession`, `refreshSession`,
  `consumeInvite`. Everything else stays on the member/agent tokens as before.
- **Session strategy** (`auth.ts` `createProductionSession`): identity lookup → no identity =
  `NoTenantError` (relayed as 403 `no_tenant`, NEVER auto-provision); session exchange on login;
  refresh-token first, full re-exchange on rejection. In production the member token also backs
  propose (no agent split).
- **Tenant creation is NOT idempotent** — never auto-retry `POST /api/brain/tenants`; surface
  the failure and let the human resubmit. 409 `already_linked` is honest, not a no-op.
- **Invites**: issue/revoke via member token (`POST/DELETE /api/brain/members/:id/invites`);
  consume via platform-service (`POST /api/brain/invites/consume`), only after the explicit
  "Join company" confirm on `CompanySetupPage` (`/invite/:token` keeps the token in the URL
  through login). Invite refusals (`invite_invalid|expired|consumed|revoked`, `already_linked`)
  map to plain language, never silently swallowed.
- **Client gate**: `App.tsx` `TenancyGate` queries `/api/brain/tenancy`; production + unlinked →
  `CompanySetupPage` (create company / join with invite). Signup collects Company name when
  `/api/config.tenancyProduction` is true and creates the tenant right after registering; a
  failure hands the error to `CompanySetupPage` via sessionStorage so it is never dropped.
- **Team UI**: production shows "Invited — awaiting signup" pill + Resend/Revoke; add-member
  sends `invite:true`.
