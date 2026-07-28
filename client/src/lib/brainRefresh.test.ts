import { describe, expect, it } from "vitest";
import { documentsInProgress, type DocumentExtractStatus } from "./brainRefresh";

const doc = (extractStatus: DocumentExtractStatus | null) => ({ extractStatus });

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
});
