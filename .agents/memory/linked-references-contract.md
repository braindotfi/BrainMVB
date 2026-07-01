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
  in the canonical store. The dev-boot guard in `ruleConsistencyCheck.ts` (wired in
  `main.tsx`, never throws) enforces this for all three types — RESOLUTION plus COHERENCE
  (linked invoice total == record amount; invoice.vendorId == record's vendor; every
  kind:"vendor" points at a real vendor; no paid-invoice vendor with zero history).
  Extend that ONE module; do not fork a parallel checker.
- A vendor's `history` must reconcile with the records referencing it — amounts, dates,
  tier, `trustStatus`. A payment human-approved above the auto-pay limit is NOT "trusted";
  a single recent payment reads as the "new" tier. No stubs, no contradictory tenure.
- **Non-vendor counterparties are NOT vendors.** Payroll employees, DeFi protocols, and
  internal ledgers must use accurate `linked[]` kinds (`employee`/`protocol`/`ledger` in
  `LinkedEntityKind`), NOT `kind:"vendor"`. Forcing them into the trust/allowlist model
  resolves-but-lies. They render as plain, non-tappable text with no "(… unavailable)"
  suffix (they were never meant to resolve to a detail surface).
