---
name: Compliance proposal narrative shape (production)
description: Live compliance proposals do NOT carry invoice/counterparty refs in narrative prose — narrative-derived enrichment is the wrong approach; source_refs is the right one.
---

# Compliance proposal narrative shape in production

## The rule

Do NOT attempt to resolve entity refs from `narrative` text for compliance proposals as a way to surface vendor name or amount. The narrative in production is generic prose with no embedded `inv_` / `cp_` IDs.

**Why:** A local test fixture used the string
`"Compliance review for inv_01KYS8RK94… found policy_violation with high severity."` which _does_ contain an invoice ref. That fixture was a synthetic test shape. Live tenant compliance narratives do not include those refs — the narrative is boilerplate.

An enrichment approach built on `textRefs(narrative)` for compliance will find nothing in production and produce no subject or amount, regardless of how well the BFF code is written.

## The correct approach

Vendor name and amount for compliance proposals will be surfaced via **`source_refs`** captured at policy-evaluation time — a brain-core change (PR #645). Once those refs arrive in the proposal payload, they follow the existing evidence resolution path in `enrichProposal` and require no special handling on the BFF side.

## How to apply

- When investigating compliance card data availability, probe the live `source_refs` field (not `narrative`) for entity refs.
- Any compliance-specific enrichment that parses narrative text is wrong and will silently produce `subject: null` in production.
- The test fixture in `proposalEnrichment.test.ts` uses a verbatim narrative shape from a live tenant — if it contains an `inv_` ref, that fixture may be stale; verify against the actual API response before trusting it.
