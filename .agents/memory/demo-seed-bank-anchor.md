---
name: The demo seed's bank statement is a vendored brain-core fixture
description: Why the June-2026 bank statement must never be regenerated, and what the other four seed documents owe it.
---

## The bank statement is copied in, not generated

`server/assets/demo-seed/bank_statement_2026-06.pdf` is brain-core's own interpreter fixture
(`services/raw/src/interpreters/__fixtures__/bank_statement_2026-06.pdf` in *their* repo,
which is a separate service — it does not exist in this checkout). It is vendored
byte-for-byte and is the only seed asset the generator does **not** produce; the generator
verifies its SHA-256 and refuses to run on drift.

**Why:** it was once replaced by a locally generated statement for a different fictional
company. Every seeded tenant silently ingested the wrong document, and the mismatch only
surfaced as an argument with the upstream team about whose transaction count was right.
Because brain-core parses this exact file in its own tests, any local re-encoding also risks
diverging from what their interpreter is known to handle.

**How to apply:** never regenerate or re-encode it. If it must change, take the new bytes
from brain-core and update the pinned hash in both the generator and the drift guard. The
company on the statement is Northlight Manufacturing Inc. (First Commerce Bank, acct
****4821); 19 transactions, net -14,586.02. A seeded tenant projecting anything else is a
red flag.

## The other four documents are derived from it, so they move together

AR aging, the payroll register, the crypto wallet CSV and the Form 1120 are all generated to
reconcile against the statement's figures: payroll net and tax remittance equal its PAYCORE
debits, the aging carries the unpaid remainder of the invoice the statement pays *partially*
and omits the one it settles in full, the wallet is on-chain only because the statement shows
no crypto transfer, and the 1120's recurring deduction lines are its monthly amounts
annualised.

**Why:** swapping the anchor alone leaves four documents quietly contradicting it, which is
worse than either consistent state — the demo then teaches the product to reason from
incoherent data.

**How to apply:** treat the five as one bundle. Changing the statement means re-deriving the
other four and re-running the drift guard, not patching one file.

## Verify on a FRESH demo tenant, never by re-seeding an old one

There is no "re-seed" that replaces documents: ingesting onto a tenant that already holds the
previous bundle *adds* to it, so the ledger ends up with both companies' transactions. Old
`demo-fresh-*` tenants are disposable and keep whatever bundle existed when they were created.

**How to apply:** log in as a new `demo-fresh-*` account, make one brain-core proxy read to
trigger tenant creation, wait for the seed, then check the ledger. (`DELETE /v1/raw/{raw_id}`
does exist upstream if an existing tenant genuinely must be cleaned, but it is not wired into
the BFF client.)
