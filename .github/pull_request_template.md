<!-- Keep this short. Delete sections that genuinely do not apply. -->

## What changed and why

## Verification

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test`
- [ ] Before/after screenshots attached (any visible change)

## Failure states

This app reports money owed and approvals pending, so a surface that goes quiet
when a read fails is worse than one that errors: it tells the operator not to act.
The same defect has shipped on four consecutive surfaces, so it gets its own line.

- [ ] Every read this PR adds or touches can tell **unavailable** from **empty**.
      Prefer `useFeed` (`client/src/lib/feed.ts`); `?? []` on a query result is the
      bug. `npm test` fails on new instances, but it cannot read your copy —
      "No bills yet" rendered in the unavailable branch still passes.
- [ ] `npm run qa:degraded` run if this PR touches a Ledger surface, and extended
      if it adds one. It forces each feed to 503 and asserts the UI says so.
- [ ] Counts, totals and warning banners checked in the failed state specifically.
      A count of `0`, a `$0.00` and a banner that does not render are all claims.
