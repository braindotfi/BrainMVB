# Message — Confirm the `worker` Container Is Actually Running 76eb857

Copy/paste the block below (to Codex, or to whoever can check the running deployment).

---

## The numbers are identical to before the fix — that's the key signal

Re-probed against the confirmed `76eb857` deploy (deploy tag
`deploy/prod/20260725T181155Z-76eb857`) with a fresh tenant. Both checks still fail, and not
just "still broken" — the failure signature is **statistically identical** to the pre-fix
probe against `cec457e`:

| | Pre-fix tenant (`tnt_...D4PB...`) | Post-fix tenant (`tnt_...D8AZ...`) |
|---|---|---|
| bank statement confidence | 0.5 | 0.5 |
| AR aging confidence | 0.5 | 0.5 |
| payroll confidence | 0.9 | 0.9 |
| batch completion pattern | 3 jobs within ~300ms, ~73s after enqueue | 3 jobs within ~235ms, ~79s after enqueue |

PR #337's whole point was to route these exact bank-statement/AR-aging/payroll PDFs through a
**deterministic in-process interpreter** that explicitly skips the external agent — its own
new test (`worker.test.ts`, "detects upload PDFs by MIME and still skips the external agent")
asserts `client.extract` is never called for this scenario. In-process parsing shouldn't need
a ~75-second wait or produce the external agent's confidence scores. The fact that timing
*and* confidence are unchanged strongly suggests the new routing logic in
`services/api/src/raw-extract/worker.ts` is not actually executing in production, despite
`/health` reporting the new commit.

## Likely explanation: `/health` only confirms the `api` container's commit

Per the deploy runbook, `api`, `worker`, and `agents` are three **separate containers**
recreated in the same promote. The code that changed in PR #337 lives entirely in
`services/api/src/raw-extract/worker.ts` — the logic the **`worker`** container runs, not the
`api` container that serves `/health`. Confirming `api`'s commit via `/health` says nothing
about whether `worker` actually picked up the new image.

**Please confirm directly, not via `/health`:**
1. What image tag/commit is the `worker` container actually running right now on the
   production VM? (`docker ps` / `docker inspect` on the host, or however that's normally
   checked — not an API health endpoint.)
2. If it's not `76eb857`, why didn't the promote recreate it? (Compose profile mismatch,
   image pull failure that didn't fail the workflow, wrong image reference for the `worker`
   service — whatever it turns out to be.)
3. Once `worker` is confirmed on `76eb857`, re-check whether the migration
   (`0020_requeue_zero_row_upload_extractions.sql`) actually requeued the previously-broken
   jobs, or whether a stale worker reprocessed them the same broken way after the requeue.

## Evidence for tracing

- Fresh tenant: `tnt_01KYD8AZ50B8TKH4CKSKRV90J2`
- Raw/job/parsed ids:

| file | raw_id | job_id | parsed_id |
|---|---|---|---|
| bank statement | `raw_01KYD8AZ7W2V55VTHGVR85VT9W` | `rexj_01KYD8AZA4B76EBAQT719VE61D` | `prs_01KYD8B8WBXS51XFKHHX6T2382` |
| AR aging | `raw_01KYD8AZBH1MRZV4SFSSBHSB3A` | `rexj_01KYD8AZCQ7XRVBGBR3YED3XWN` | `prs_01KYD8BA9CXJWJSNQ9HC0R49EJ` |
| payroll | `raw_01KYD8AZDN44NFN6BC1QTXGXER` | `rexj_01KYD8AZEVB04P7R1Z82R5AD27` | `prs_01KYD8B5HJACJF4KR95DFVZ5YH` |

- Previously-broken tenant, re-checked ~25 minutes after its extracts succeeded and still
  empty: `tnt_01KYD4PBEF96DH9NK3B5ZCN04D`
- All timestamps UTC 2026-07-25. Extract called with the tenant agent token, ledger reads
  with the member token.

Please don't re-promote and ask for another re-probe until you've directly confirmed what
image the `worker` container is running — three consecutive round-trips have now hit the same
"looks deployed, isn't" shape, and checking the actual running process beats another
end-to-end probe cycle.

---
