---
name: Receivables source contract
description: Why AR reads the invoice feed by a positive marker, why the receivable obligations feed must never be its source, and why a demo tenant's AR total is wrong before projection settles.
---

# "What we are owed" comes from invoices, positively marked

AR = rows in the **invoice** feed where `metadata.scenario === "ar"`. Nothing else.

**Why:** this is the mirror-image of the liabilities contract, and the mirror flips the
source. AP is authoritative on *obligations* because payroll and tax are owed without an
invoice ever existing. AR is authoritative on *invoices* because the obligations feed only
carries part of it. Measured on a live reference tenant:

| feed | rows |
| --- | --- |
| `obligations?direction=receivable` | 8 |
| `invoices` where `scenario === "ar"` | 12 |

The 8 obligations are a **strict subset** of the 12 invoices — the AR-aging fixture rows,
which brain-core projects into both feeds. The 4 rows that exist *only* as invoices are the
largest on the tenant (~80% of the money). So sourcing AR from obligations drops most of the
balance, and summing both double-counts the shared 8. Either way the total looks fine.

**How to apply:** any new "money owed to us" surface reads invoices. If you find yourself
reaching for `direction=receivable`, stop — it is a real feed with real rows, which is
exactly what makes it a convincing wrong answer.

# The marker is a positive test, never `!== "ap"`

**Why:** a negation absorbs every scenario value that does not exist yet. The day brain-core
emits a third kind (`credit_note`, `intercompany`, …) a `!== "ap"` filter silently counts it
as money owed to the tenant. An unmarked row is simply not a receivable.

# `scenario` and `direction` are not server-side filters on invoices

`GET /ledger/invoices?scenario=ar` returns **byte-identical ids** to the unfiltered call, as
does `?direction=receivable`. Both are accepted and ignored — HTTP 200, no error, no hint.

**How to apply:** filter client-side, after walking the full cursor. Never assume a query
param filtered just because the response was 200 and plausible.

# A total is only honest if the cursor walk finished

Ledger list endpoints cap their page and return `next_cursor`. A single unpaged read gives
some rows with no indication any are missing, so the sum is quietly short.

**How to apply:** the total function takes the *read state*, not just the rows, and returns
`null` when the walk did not complete. Gating it structurally is what stops a partial sum
being rendered as a total — a smaller plausible number is worse than a dash.

# Demo tenant projection is staged — do not measure a total too early

On a freshly minted demo tenant the AR rows arrive in **two waves**: the ~4 seeded AR
invoices project within ~15s, and the ~8 AR-aging rows land roughly 60–90s later.

**Why:** this bit during verification. At t=15s the tab was fully populated, internally
consistent and completely wrong — 4 rows totalling $485,000 against the settled figure of
$601,300 across 12 rows. Nothing about the early state looks partial.

**How to apply:** when verifying any aggregate against a fresh demo tenant, poll until the
row count *stops changing* before trusting the number. Do not pin the count or the total in a
test against live data — use a fixture (see the AR reference-tenant fixture in the receivables
tests, which is what makes the figure reproducible).

# Decide list-surface view state in a pure function, not in ternaries

The states a data list can be in (failed / loading / incomplete / genuinely empty / rows)
are decided by an exported pure function that the component just switches on.

**Why:** vitest here runs `environment: "node"` with no DOM, so a component's branch order
cannot be asserted — only grepped for, which is brittle and evadable. The case that actually
bites is "zero rows *because* the read was cut short", and reviewers and greps both miss it.
As data it gets a real assertion.

**How to apply:** any surface where "empty" and "could not read" are different sentences.
Test the incomplete-read-with-zero-rows case explicitly; row count alone can never
distinguish it.
