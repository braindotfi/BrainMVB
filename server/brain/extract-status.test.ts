import { describe, it, expect } from "vitest";
import { extractStatusForJob } from "./extractStatus";
import { isTerminalExtractStatus, type RawExtractResult } from "./client";

/**
 * brain-core's POST /raw/{id}/extract is ASYNC (verified live 2026-07-28): the first
 * response is 202 with status "queued" and a null parsed_id, and the parsed record lands
 * 15-90s later. Recording that first response as "extracted" left every seeded document
 * with parsedId/confidence null forever, which is what this suite pins against.
 */
function job(partial: Partial<RawExtractResult>): RawExtractResult {
  return { parsed_id: null, confidence: null, status: null, error: null, ...partial };
}

describe("extraction job status mapping", () => {
  it("never claims 'extracted' for a job that has not settled", () => {
    expect(extractStatusForJob(job({ status: "queued" }))).toBe("extracting");
    expect(extractStatusForJob(job({ status: "running" }))).toBe("extracting");
    // Missing status (older/unknown shape) is also not evidence of success.
    expect(extractStatusForJob(job({ status: null }))).toBe("extracting");
  });

  it("maps a settled job to its real outcome", () => {
    expect(extractStatusForJob(job({ status: "succeeded", parsed_id: "prs_1", confidence: 0.9 }))).toBe("extracted");
    expect(extractStatusForJob(job({ status: "failed", error: "boom" }))).toBe("failed");
    expect(extractStatusForJob(job({ status: "cancelled" }))).toBe("failed");
  });

  it("agrees with the terminal-status predicate the poller loops on", () => {
    expect(isTerminalExtractStatus("queued")).toBe(false);
    expect(isTerminalExtractStatus("running")).toBe(false);
    expect(isTerminalExtractStatus(null)).toBe(false);
    expect(isTerminalExtractStatus("succeeded")).toBe(true);
    expect(isTerminalExtractStatus("failed")).toBe(true);
  });
});
