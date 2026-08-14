import { describe, expect, it } from "vitest";
import {
  needsExtractSettle,
  needsProjectionSettle,
  shouldSettle,
  type SettleCandidate,
} from "./settleTargets";
import type { ExtractStatus, ProjectionStatus } from "../storage";

const NOW = Date.parse("2026-07-28T12:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const doc = (over: Partial<SettleCandidate> = {}): SettleCandidate => ({
  rawId: "raw_1",
  extractStatus: "extracted",
  projectionStatus: null,
  uploadedAt: new Date(NOW - 30_000).toISOString(),
  ...over,
});

const aged = (ms: number) => new Date(NOW - ms).toISOString();

describe("needsExtractSettle", () => {
  it("chases a document still being extracted", () => {
    expect(needsExtractSettle(doc({ extractStatus: "extracting" }))).toBe(true);
  });

  it.each<ExtractStatus>([
    "pending",
    "ingested",
    "extracted",
    "unsupported",
    "unavailable",
    "failed",
  ])("does not chase extraction for %s", (extractStatus) => {
    expect(needsExtractSettle(doc({ extractStatus }))).toBe(false);
  });

  it("never gives up chasing an extraction, no matter how old", () => {
    // brain-core's POST /raw/{id}/extract is idempotent and cheap; an age cutoff here
    // previously meant a document could get stuck showing "extracting" forever if the
    // settle window closed before the client polled again, even though brain-core had
    // already resolved it.
    expect(
      needsExtractSettle(
        doc({ extractStatus: "extracting", uploadedAt: aged(HOUR + MINUTE) }),
      ),
    ).toBe(true);
    expect(
      needsExtractSettle(
        doc({ extractStatus: "extracting", uploadedAt: aged(48 * HOUR) }),
      ),
    ).toBe(true);
  });
});

describe("needsProjectionSettle", () => {
  it("reads projection for a recently extracted document with no answer yet", () => {
    expect(needsProjectionSettle(doc({ projectionStatus: null }), NOW)).toBe(
      true,
    );
  });

  it.each<ProjectionStatus>(["pending", "projecting"])(
    "keeps reading while projection reports %s",
    (projectionStatus) => {
      expect(needsProjectionSettle(doc({ projectionStatus }), NOW)).toBe(true);
    },
  );

  it.each<ProjectionStatus>([
    "projected",
    "projection_timed_out",
    "projection_failed",
  ])("stops once projection reports the terminal %s", (projectionStatus) => {
    expect(needsProjectionSettle(doc({ projectionStatus }), NOW)).toBe(false);
  });

  it("does not read projection before extraction has produced a parsed record", () => {
    // Projection cannot have started, so the call would be wasted.
    expect(
      needsProjectionSettle(doc({ extractStatus: "extracting" }), NOW),
    ).toBe(false);
    expect(needsProjectionSettle(doc({ extractStatus: "pending" }), NOW)).toBe(
      false,
    );
  });

  it.each<ExtractStatus>(["unsupported", "unavailable", "failed"])(
    "does not read projection for a document extraction never produced (%s)",
    (extractStatus) => {
      expect(needsProjectionSettle(doc({ extractStatus }), NOW)).toBe(false);
    },
  );

  it("STOPS chasing projection for a document older than the projection window", () => {
    // The backfill guard. brain-core's migration sets every pre-existing artifact to
    // "pending" and never advances it; without this bound we would mirror that onto old
    // documents and hold the post-upload refresh open on rows that finished long ago.
    expect(
      needsProjectionSettle(
        doc({ projectionStatus: "pending", uploadedAt: aged(11 * MINUTE) }),
        NOW,
      ),
    ).toBe(false);
    expect(
      needsProjectionSettle(
        doc({ projectionStatus: null, uploadedAt: aged(11 * MINUTE) }),
        NOW,
      ),
    ).toBe(false);
  });

  it("still chases just inside the projection window", () => {
    expect(
      needsProjectionSettle(
        doc({ projectionStatus: "pending", uploadedAt: aged(9 * MINUTE) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("uses a much tighter window than extraction does", () => {
    // A 30-minute-old document is still worth an extraction poll (extraction has no
    // age limit at all) but is long past the point where a projection answer would arrive.
    const old = aged(30 * MINUTE);
    expect(
      needsExtractSettle(doc({ extractStatus: "extracting", uploadedAt: old })),
    ).toBe(true);
    expect(needsProjectionSettle(doc({ uploadedAt: old }), NOW)).toBe(false);
  });
});

describe("shouldSettle", () => {
  it("never calls upstream for a document that was never ingested", () => {
    // No raw id means there is nothing to ask brain-core about.
    expect(
      shouldSettle(doc({ rawId: null, extractStatus: "extracting" }), NOW),
    ).toBe(false);
    expect(
      shouldSettle(doc({ rawId: null, projectionStatus: "projecting" }), NOW),
    ).toBe(false);
  });

  it("selects a document needing either half of the pipeline", () => {
    expect(shouldSettle(doc({ extractStatus: "extracting" }), NOW)).toBe(true);
    expect(
      shouldSettle(
        doc({ extractStatus: "extracted", projectionStatus: "projecting" }),
        NOW,
      ),
    ).toBe(true);
  });

  it("leaves a fully settled document alone", () => {
    expect(
      shouldSettle(
        doc({ extractStatus: "extracted", projectionStatus: "projected" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("leaves an old historical document alone once extraction and projection are both settled", () => {
    // The common steady-state case once the field deploys: a long-finished upload whose
    // local mirror is NULL or a stale backfilled "pending" projection. Neither may
    // generate traffic - but an old document still stuck "extracting" always does,
    // since that has no age limit.
    const ancient = aged(48 * HOUR);
    expect(
      shouldSettle(doc({ uploadedAt: ancient, projectionStatus: null }), NOW),
    ).toBe(false);
    expect(
      shouldSettle(
        doc({ uploadedAt: ancient, projectionStatus: "pending" }),
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldSettle(
        doc({ uploadedAt: ancient, extractStatus: "extracting" }),
        NOW,
      ),
    ).toBe(true);
  });
});
