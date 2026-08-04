---
name: brain-core extraction and obligations fixes
description: Upload extraction retry loop root cause + obligations direction filter — both landed in fix/demo-extraction-obligations
---

## Upload extraction retry loop

**Rule:** When `tryInProcessUploadExtraction` returns null for an upload-classified artifact (`looksLikeUploadArtifact` is true), the worker now fails terminally with `raw_source_unsupported`. Previously it fell through to the external AI extractor, which returned 5xx for unsupported types; `isTransientExtractionError` treated all 5xx as transient → up to 3 retries (30s/60s/120s backoff) before eventual terminal failure. Symptoms: artifact stuck in `extracting` state for several minutes.

**Why:** The in-process upload interpreter is authoritative for upload-classified artifacts. An unrecognised format should be an immediate hard failure, not a retry loop through an equally-unable external extractor.

**How to apply:** File: `services/api/src/raw-extract/worker.ts`. Look for `looksLikeUploadArtifact` block. If the in-process interpreter adds support for a new upload type, `tryInProcessUploadExtraction` returns a result rather than null, so no change needed there.

## Obligations direction filter

**Rule:** `GET /ledger/obligations` now accepts `?direction=payable|receivable`. Add it to new callers that only want AP or AR obligations. `listObligations` in `repository/obligations.ts` and `LedgerService.ts` both accept `direction?: "payable" | "receivable"`.

**Why:** `ledger_obligations` stores both AR receivables (projected from ar_aging uploads) and AP payables. Without a direction filter the endpoint returned AR rows for AP callers.

**How to apply:** BFF proxy calls that fetch AP obligations must pass `?direction=payable`. AR callers pass `?direction=receivable`.
