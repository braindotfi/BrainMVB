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

## Document `category` is BFF-local and silently couples to the UI

brain-core is only ever sent `source_type`, `mime_type`, and `source_schema` — never a
category. The category is our own label, and the Add Source "N connected" badges group
documents by exactly that string, so a value outside the UI's `CategoryId` union makes a
document real, ingested, and invisible. There is no upstream vocabulary to reconcile with;
the only contract is between the seed manifest, the upload route, and the badge grouping.
