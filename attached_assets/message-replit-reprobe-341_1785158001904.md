# Message — Re-Run Both Probes (PR #341 / 9346491)

Copy/paste the block below into Replit once the VM-side worker log check confirms
`git_sha: 9346491` is actually running.

---

## Deploy confirmed, worker log check pending — re-probe once that clears

`9346491` (PR #341 — fixes the ISO date-token bug in bank statement parsing, and the
title-row-outscoring-real-header bug in AR aging detection) is deployed to production
(`deploy/prod/20260727T113614Z-9346491`). Someone with VM access is confirming the worker's
own startup log shows this `git_sha` directly (not just `/health`, given the `a1f8d2fd` gap
that check alone missed last round). Once that's confirmed, please re-run both probes:

**1. Repaired tenant** — `tnt_01KYD4PBEF96DH9NK3B5ZCN04D`. Check:
- `parsed_id`s should now be **new and distinct** from all prior stale ones
  (`prs_01KYD4PEZA…`, `prs_01KYD4PGAC…`, `prs_01KYD4PBTR…`).
- Confidence values for bank statement and AR aging should **no longer be exactly `0.5`** —
  the in-process interpreter's real outputs are `0.9/0.78/0.62/0.42` (bank statement) or
  `0.9/0.72/0.48/0.1` (AR aging). Payroll should still show `0.9` as it always has.
- `GET /ledger/accounts` and `/ledger/transactions` should return real data.

**2. Fresh tenant** — new `demo-fresh-*` account, same 3-file seed. Same checks: confidence
values away from `0.5` for bank/AR, real ledger data.

This fix was verified in CI against the actual real demo-seed fixture bytes (not just
synthetic test cases), so this round has a real basis to expect success — but report the
actual numbers either way, same as every prior round.

If both come back clean: this is finally resolved, and Steps 2/3 (broadening `SEED_FILES` to
cover crypto wallet/tax return/etc., wiring source badges) can proceed with no further
brain-core dependency.

---
