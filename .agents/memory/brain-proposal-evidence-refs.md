---
name: brain-core proposal evidence refs
description: What proposal evidence refs actually look like on a live tenant, which ones resolve against /ledger/*, and how to probe this without provisioning a tenant.
---

Proposal `evidence[]` entries are `{kind, ref, resolvable}` and are NOT self-describing.
Everything below was found by probing a live tenant; none of it is in the API spec.

**Refs come in two spellings for the same entity.** Both a bare id (`cp_01KY…`) and a wiki
URI (`wiki:/counterparties/cp_01KY…`) appear on the same proposal. Resolve by looking up the
ref, then its trailing `/` segment. Bare-id-only lookup left over half of live evidence
unresolved.

**Resolve by direct id lookup, never by ULID prefix.** Ids match
`^[a-z]+_[0-9A-HJKMNP-TV-Z]{26}$` and there is no published prefix→entity registry, so a
prefix table silently stops resolving the day core adds a type. `kind` should only caption
the row.

**`wiki:` refs are background context, not the subject.** A collections proposal cites the
entire counterparty book as wiki context while naming ONE customer. Treating them as equals
renames the card after an unrelated party. Exclude them from subject selection and from
detail rows; keep them in a technical/reference section.

**Which prefixes actually resolve against the ledger books:**
- `cp_`, `inv_`, `obl_`, `tx_`, account and member ids — yes.
- `pd_` (policy_decision), `evt_` (audit_event), `wiki:/monthly-summaries/*` — no, these are
  not ledger entities. Leaving them as raw refs is correct, not a bug.

**Proposal types cite disjoint evidence.** `reconciliation` cites `tx_` refs and nothing
else, so omitting transactions from a resolution index makes every reconciliation card a
subject-less wall of ids. Never assume the entity types one proposal type cites cover
the others.

**Why:** enrichment quality is invisible in unit tests — mocked evidence always resolves.
Only a live probe reveals that the real refs are shaped differently than assumed.

**How to apply:** never validate ref-resolution logic on mocked evidence alone — mocks always
resolve. Probe a live tenant read-only and measure a resolved/total ratio, which surfaces
both missing entity types and unexpected ref spellings at once. To get a token without
provisioning anything, reuse an existing `demo-fresh-*` user still in the `users` table
rather than signing up (a signup provisions a real upstream tenant and emits an audit anchor).
