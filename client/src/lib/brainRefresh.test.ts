import { describe, expect, it } from "vitest";
import {
  documentsInProgress,
  projectionSettledCleanly,
  type DocumentExtractStatus,
  type DocumentProjectionStatus,
} from "./brainRefresh";

const NOW = Date.parse("2026-07-28T12:00:00.000Z");
const agoMs = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;

const doc = (extractStatus: DocumentExtractStatus | null) => ({ extractStatus });

/** An extracted document carrying a projection signal, uploaded `ageMs` ago. */
const projecting = (
  projectionStatus: DocumentProjectionStatus | null,
  ageMs = 30_000,
  extractStatus: DocumentExtractStatus = "extracted",
) => ({ extractStatus, projectionStatus, uploadedAt: agoMs(ageMs) });

describe("documentsInProgress", () => {
  it("is false with no documents, so an empty account never opens a settle window", () => {
    expect(documentsInProgress([])).toBe(false);
  });

  it("treats a missing status as still pending", () => {
    // A freshly uploaded document can arrive before brain-core has set a status. Reading
    // that as 'done' would fire the completion edge immediately and refresh nothing useful.
    expect(documentsInProgress([doc(null)])).toBe(true);
  });

  it.each<DocumentExtractStatus>(["pending", "ingested", "extracting"])(
    "reports %s as in progress",
    (status) => {
      expect(documentsInProgress([doc(status)])).toBe(true);
    },
  );

  it.each<DocumentExtractStatus>(["extracted", "unsupported", "unavailable", "failed"])(
    "reports %s as settled",
    (status) => {
      expect(documentsInProgress([doc(status)])).toBe(false);
    },
  );

  it("stays in progress while any single document is unfinished", () => {
    expect(documentsInProgress([doc("extracted"), doc("extracting")])).toBe(true);
  });

  it("goes false once every document has settled, including failures", () => {
    // Failures must count as settled or the window would never open for a batch where one
    // document could not be read.
    expect(documentsInProgress([doc("extracted"), doc("failed")])).toBe(false);
  });

  // ─── projection signal ───

  it("keeps an extracted document in flight while its projection is still running", () => {
    // The whole point of the signal: 'extracted' no longer means the brain pages are ready.
    expect(documentsInProgress([projecting("projecting")], NOW)).toBe(true);
  });

  it("keeps an extracted document in flight while its projection is queued", () => {
    expect(documentsInProgress([projecting("pending")], NOW)).toBe(true);
  });

  it.each<DocumentProjectionStatus>(["projected", "projection_timed_out", "projection_failed"])(
    "releases a document once projection reports %s",
    (status) => {
      // Every terminal state ends the wait, not just the happy one - a timed-out or failed
      // chain is never going to advance, so holding the refresh would just wedge it.
      expect(documentsInProgress([projecting(status)], NOW)).toBe(false);
    },
  );

  it("ignores an absent projection signal instead of treating it as unfinished", () => {
    // This is the case on every deployment that predates the field, which today is all of
    // them. If null gated, every document would look permanently in flight and the
    // post-upload refresh would stop firing entirely.
    expect(documentsInProgress([projecting(null)], NOW)).toBe(false);
    expect(documentsInProgress([{ extractStatus: "extracted" }], NOW)).toBe(false);
  });

  it("stops honouring a projection signal that never advanced past the deadline", () => {
    // brain-core's migration backfills pre-existing documents to 'pending' and nothing
    // ever moves them. Bounding the wait is what stops one of those from wedging the
    // refresh forever.
    expect(documentsInProgress([projecting("pending", 11 * MINUTE)], NOW)).toBe(false);
    expect(documentsInProgress([projecting("projecting", 11 * MINUTE)], NOW)).toBe(false);
  });

  it("still honours a projection signal just inside the deadline", () => {
    expect(documentsInProgress([projecting("projecting", 9 * MINUTE)], NOW)).toBe(true);
  });

  it("refuses to start an unbounded wait when there is no usable upload time", () => {
    // Without a clock we cannot enforce the deadline, so we decline to gate at all rather
    // than risk a permanent wait.
    expect(
      documentsInProgress([{ extractStatus: "extracted", projectionStatus: "projecting" }], NOW),
    ).toBe(false);
  });

  it("waits for extraction before projection matters", () => {
    // A document still being read is in flight for the extraction reason regardless of
    // what its projection column happens to say.
    expect(documentsInProgress([projecting("projected", 30_000, "extracting")], NOW)).toBe(true);
  });

  it("stays in flight while any document in a mixed batch is still projecting", () => {
    expect(
      documentsInProgress([projecting("projected"), projecting("projecting")], NOW),
    ).toBe(true);
  });
});

describe("projectionSettledCleanly", () => {
  it("is false when no document carries a signal, so we fall back to the settle window", () => {
    expect(projectionSettledCleanly([doc("extracted"), doc("failed")], NOW)).toBe(false);
  });

  it("is true when every tracked document reported a terminal projection", () => {
    expect(projectionSettledCleanly([projecting("projected")], NOW)).toBe(true);
  });

  it("counts a failed or timed-out projection as a clean settle", () => {
    // We asked and got an answer. It was a bad answer, but re-invalidating on a timer
    // would not conjure rows that a failed chain never produced.
    expect(
      projectionSettledCleanly([projecting("projection_failed"), projecting("projection_timed_out")], NOW),
    ).toBe(true);
  });

  it("is false when a document aged out still unprojected", () => {
    // We stopped waiting rather than being told it finished, so the heuristic window is
    // still the best guess we have.
    expect(projectionSettledCleanly([projecting("projecting", 11 * MINUTE)], NOW)).toBe(false);
  });

  it("ignores documents with no signal when judging the batch", () => {
    expect(
      projectionSettledCleanly([doc("extracted"), projecting("projected")], NOW),
    ).toBe(true);
  });

  it("is false while one tracked document is still mid-projection", () => {
    expect(
      projectionSettledCleanly([projecting("projected"), projecting("projecting")], NOW),
    ).toBe(false);
  });
});
