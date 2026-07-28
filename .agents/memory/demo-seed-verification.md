---
name: Verifying the demo starter seed end to end
description: Traps when testing the demo-fresh seed flow — what actually triggers tenant creation, and why background seeding leaks across tests.
---

## The seed does not run until something needs a brain SESSION

Creating a `demo-fresh-*` account does not create the durable tenant, and neither does
reading the documents list or the tenancy mode — both are local DB reads that answer 200
without ever touching brain-core. The tenant (and therefore the fire-and-forget starter
seed) is created lazily by the first call that actually needs a brain session, e.g. a
ledger read.

**Why:** a verification probe that logged in and then polled the documents endpoint sat at
zero documents for five minutes and looked like a broken seed. Nothing was broken; the
tenant had never been created. Confirm by grepping the workflow log for the
`durable tenant ... created for DEMO user` line before concluding the seed failed.

**How to apply:** any script or manual check of the seed must issue one real brain-core
proxy read immediately after login, then poll. Budget ~3-4 minutes: each seed file waits
for brain-core's async extract job to settle.

## Fire-and-forget background work leaks between tests

The seed is deliberately not awaited in production. In a test suite that means a previous
test's ingests keep arriving after the test ends and get attributed to the next test —
which broke the "real users are never seeded" invariant with borrowed calls once the seed
grew past three files and stopped finishing incidentally.

**Why:** the old test polled for an expected call count, which is a race, not a barrier.

**How to apply:** give background work an explicit "settle" handle the tests can await in
`beforeEach` *before* resetting any recorded state. Don't paper over it with a sleep, and
don't assert on a count that a slower run can satisfy from the wrong test.

## The seed generator rewrites every fixture on every run

The generator script's entry point calls each document generator unconditionally, so adding
a new one also rewrites all the pre-existing files. PDF and XLSX both embed a build
timestamp, so those files come back byte-different even when their content is identical.

**Why:** silently churning a fixture invalidates any prior end-to-end verification against
it, and the churn is invisible in a diff (binary blobs). This turned into a real dispute
with the upstream team over whose transaction count was wrong.

**How to apply:** after running the generator, diff the git *blob hashes* of the fixtures
you did not intend to touch and revert the ones whose content is unchanged. Never claim a
fixture is unchanged from memory — `git rev-parse <ref>:<path>` on both sides is the proof.

## Reconciling a count dispute: compare the aggregate, not just the count

When an external service reports a different row count than a fixture contains, compare a
*sum* (net amount, closing balance) as well as the count before concluding anything.

**Why:** a miscount alone — counting header or opening-balance lines as rows — leaves the
aggregate intact. If the aggregate ALSO differs, the other side is not misparsing your
document, it is reading a different document, and a "your count is wrong" bug report would
send them chasing the wrong thing.

**How to apply:** derive the aggregate from something self-checking inside the artifact
where possible (the bank statement prints its own opening and closing balance, so the row
sum can be validated without trusting the counter). Then test the cheap hypotheses
mechanically — does dropping any single row, or flipping any single sign, reproduce their
number? — before escalating.

## Our seed fixture is authoritative; brain-core's `__fixtures__` copy is not

The demo bank statement is **Brightline Systems Inc.** (First Meridian Bank ****7302),
15 transactions, opening 187,450.23 → closing 165,087.55, net **-22,362.68**. That is what
production tenants actually store and parse. brain-core's test harness carries its own file
at the same-sounding path (`services/raw/src/interpreters/__fixtures__/bank_statement_2026-06.pdf`)
describing a *different* company — Northlight Manufacturing, 19 transactions, net -14,586.02.

**Why:** an upstream instruction, believing our fixture was stale, asked us to adopt their
`__fixtures__` file as the anchor and rebuild the other four seed documents around it. It was
done — and it was backwards: their local copy was the stale one, and the whole bundle had to
be reverted to a different fictional company. The two files are easy to confuse because the
filename and month are identical.

**How to apply:** when an upstream team reports a mismatch against "the fixture", establish
*which artifact they actually queried* before changing anything — a bundled local test
fixture and the production tenant's stored raw artifact are different objects. Ask them to
re-run against the stored production artifact. Identify our file by content, not filename:
account holder Brightline Systems Inc., closing balance 165,087.55. Never swap the anchor on
the strength of a count alone; the other four documents are derived from it and a swap
silently rebases the entire bundle onto another company.

## The seed is a fixed June-2026 statement, so trailing-window surfaces decay over time

Seed transactions are dated 2026-06-01..06-30 and never shift. Any surface using a trailing
window relative to *now* therefore sees less of the seed as real time advances. Observed on
2026-07-28: `/ledger/cash_flows` (trailing 30 days) caught only 3 of the 15 transactions —
the 06/30 payroll, tax debit and interest credit — and reported net -48,335.63, which looks
alarming but is just the tail of the month in isolation.

**Why:** this reads as a data bug, and it gets worse silently. Once wall-clock passes ~30
days after 2026-06-30, trailing-window surfaces show nothing at all from the seed.

**How to apply:** when a windowed surface looks wrong or empty, check the window bounds
against the fixed seed dates before investigating projection. If the demo needs to survive
indefinitely, the seed dates have to become relative to the tenant's creation date — that is
a real change to the generator, not a display tweak.

## Document `category` is BFF-local and silently couples to the UI

brain-core is only ever sent `source_type`, `mime_type`, and `source_schema` — never a
category. The category is our own label, and the Add Source "N connected" badges group
documents by exactly that string, so a value outside the UI's `CategoryId` union makes a
document real, ingested, and invisible. There is no upstream vocabulary to reconcile with;
the only contract is between the seed manifest, the upload route, and the badge grouping.
