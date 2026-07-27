# Message — Re-Probe Against the Actually-Running Commit (PR #340 / a1f8d2fd)

Copy/paste the block below into Replit.

---

## Correction: production is running a newer commit than we expected

Verified directly on the VM (image ID, container start time, `GIT_SHA` env var, and a
byte-for-byte file check all agree): production is running commit
`a1f8d2fdf0b0506f2214e439055a383c256394f2`, which is **PR #340**
("fix(canonical): re-project raw_parsed rows when the extracted payload changes"), merged
today by a brain-core engineer directly — separate from the #337/#338 round-trip we'd been
running. It touches exactly the files this whole investigation has centered on:
`services/canonical/src/projectors/worker.ts`, `services/raw/src/repository/parsed.ts`,
`services/raw/src/interpreters/upload.ts`, plus a new migration
(`0005_projection_log_source_version.sql`). This is likely a more complete fix than #338 —
we just haven't tested it yet.

Confirmed via `/health`: `{"commit":"a1f8d2fdf0b0506f2214e439055a383c256394f2"}` — this is
what you'll actually be probing against, not `aabc80e2`.

## Re-run both probes against this commit

**1. Repaired tenant** — `tnt_01KYD4PBEF96DH9NK3B5ZCN04D`. Check whether the stale
`parsed_id`s (`prs_01KYD4PEZA…`, `prs_01KYD4PGAC…`, `prs_01KYD4PBTR…`) have finally changed,
and whether `GET /ledger/accounts` / `/ledger/transactions` now return real data.

**2. Fresh tenant** — new `demo-fresh-*` account, same 3-file seed. Check:
- Does extraction now behave differently from the 0.5/0.5/0.9 external-agent fingerprint
  seen in all four prior rounds?
- Does the ledger actually populate this time?

Report both results plainly — if this also fails, say so exactly like before with full
identifiers; if it works, we're finally unblocked to move into Steps 2 and 3.

---
