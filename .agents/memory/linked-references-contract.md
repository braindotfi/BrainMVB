---
name: Linked references contract (rules + vendors + invoices)
description: How "Linked" refs in Audit Log / receipts / settled cards must resolve, and why non-vendor parties must not be vendors.
---

# Linked references contract

Every "Linked" ref (Audit Log popup, receipts, settled cards) is referenced BY ID and
resolved through ONE helper against ONE canonical store, with a resolve-or-plain-text
fallback. Three entity types share this pattern: rules (`openRuleDetail`/`getRule`),
vendors (`openVendorDetail`/`resolveVendor`), invoices (`openInvoiceDetail`/`resolveInvoice`).
`invoice.vendorId` and `proposal.invoiceId` must also point at canonical store ids.

**Why:** shipped mock-data ID drift is invisible until a user clicks — links silently
dangle to plain text. This has now bitten twice (rules first, then vendors/invoices).

**How to apply:**
- Never add a `linked[]` ref, `invoice.vendorId`, or `proposal.invoiceId` whose id isn't
  in the canonical store. This is a rule you must follow BY HAND — see the guard note below.
- **The `ruleConsistencyCheck.ts` dev guard does not exist (verified 2026-07-29).** There is
  no such file anywhere in the repo and `main.tsx` imports nothing but Buffer/React/App/CSS.
  Four places still describe it as live and running — `replit.md`, `CLAUDE.md`,
  `openProposalDetail.ts`'s header comment, and (previously) this file — so it is very easy
  to believe dangling refs are being caught when nothing is checking them. It was supposed to
  enforce RESOLUTION plus COHERENCE (linked invoice total == record amount; invoice.vendorId
  == record's vendor; every kind:"vendor" points at a real vendor; no paid-invoice vendor
  with zero history).
  **Why it matters:** the whole reason this contract exists is that mock-ID drift is invisible
  until a user clicks. Without the guard, the only thing standing between shipped data and a
  dangling chip is manual discipline.
  If you rebuild it, create the ONE module those docs already point at rather than forking a
  parallel checker, and fix the four stale references at the same time.
- **Mock and live proposal ids are different namespaces.** The demo corpus uses kebab-case
  (`prop-utilities`, `prop-duplicate`); brain-core issues ULIDs (`prop_01KY…`). A `linked[]`
  ref built from a live audit event will therefore never resolve against the demo store, and
  renders as a plain "(proposal unavailable)" chip. That is the intended honest fallback, not
  a bug — but do not read "it resolves in demo" as evidence it will resolve for a real tenant.
- A vendor's `history` must reconcile with the records referencing it — amounts, dates,
  tier, `trustStatus`. A payment human-approved above the auto-pay limit is NOT "trusted";
  a single recent payment reads as the "new" tier. No stubs, no contradictory tenure.
- **Non-vendor counterparties are NOT vendors.** Payroll employees, DeFi protocols, and
  internal ledgers must use accurate `linked[]` kinds (`employee`/`protocol`/`ledger` in
  `LinkedEntityKind`), NOT `kind:"vendor"`. Forcing them into the trust/allowlist model
  resolves-but-lies. They render as plain, non-tappable text with no "(… unavailable)"
  suffix (they were never meant to resolve to a detail surface).
