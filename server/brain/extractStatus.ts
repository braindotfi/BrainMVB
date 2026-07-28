/**
 * Single mapping from brain-core's extraction JOB state to the local
 * `source_documents.extractStatus` mirror, shared by the seed path and the
 * interactive Add Source upload route so the two can never disagree.
 *
 * brain-core's POST /raw/{id}/extract is asynchronous: the first response is
 * 202 with `status: "queued"` and a null parsed_id. Only "succeeded" means the
 * parsed record exists - anything non-terminal must stay "extracting" so the UI
 * keeps polling instead of claiming a document was read.
 */
import type { RawExtractResult } from "./client";
import type { ExtractStatus } from "../storage";

export function extractStatusForJob(result: RawExtractResult): ExtractStatus {
  switch (result.status) {
    case "succeeded":
      return "extracted";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "extracting";
  }
}
