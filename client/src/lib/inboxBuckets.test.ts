import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inboxBucket, type BucketableRecord } from "./inboxBuckets";

const rec = (over: Partial<BucketableRecord> = {}): BucketableRecord => ({
  kind: "proposal",
  actionable: false,
  ...over,
});
const d = (id: string, writable = true) => ({ id, writable });

describe("what makes a row a decision", () => {
  it("an approve core will accept", () => {
    expect(inboxBucket(rec({ liveDecisions: [d("approve"), d("reject")] }))).toBe("approval");
  });

  it("a reject on its own still is one", () => {
    expect(inboxBucket(rec({ liveDecisions: [d("reject")] }))).toBe("approval");
  });

  /* The bug this split exists to fix: notify_only records carry a writable
     acknowledge, were pushed as kind "proposal", and so sat under a heading
     asking for a decision they cannot take. */
  it("acknowledge is not a decision, however writable it is", () => {
    expect(inboxBucket(rec({ liveDecisions: [d("acknowledge")] }))).toBe("awareness");
  });

  it("undo is not a decision either", () => {
    expect(inboxBucket(rec({ liveDecisions: [d("undo")] }))).toBe("awareness");
  });

  it("an approve core will NOT accept doesn't count", () => {
    /* A read-only approve is core describing what happened, not offering it. */
    expect(inboxBucket(rec({ liveDecisions: [d("approve", false)] }))).toBe("awareness");
  });

  it("mixed lists resolve on the writable approve, not on the acknowledge beside it", () => {
    expect(inboxBucket(rec({ liveDecisions: [d("acknowledge"), d("approve")] }))).toBe("approval");
  });

  it("an empty published list means nothing may be written", () => {
    expect(inboxBucket(rec({ liveDecisions: [], actionable: true }))).toBe("awareness");
  });
});

describe("where the source field still matters", () => {
  it("ledger detections propose nothing, whatever else is set", () => {
    expect(inboxBucket(rec({ kind: "detection", actionable: true }))).toBe("awareness");
  });

  /* No detection publishes a writable approve today. If one ever does, the row
     will draw Approve/Reject from that same list — so the section has to follow
     the buttons rather than stranding them under "For your awareness". */
  it("yields to a published decision list even on a detection", () => {
    expect(inboxBucket(rec({ kind: "detection", liveDecisions: [d("approve")] }))).toBe("approval");
    expect(inboxBucket(rec({ kind: "detection", liveDecisions: [d("acknowledge")] }))).toBe("awareness");
  });

  it("rows with no published list fall back to whether buttons were drawn", () => {
    expect(inboxBucket(rec({ actionable: true }))).toBe("approval");
    expect(inboxBucket(rec({ actionable: false }))).toBe("awareness");
  });

  /* The whole point: two records from the same source, one decidable and one
     not, must land in different sections. Sorting on `kind` put both under
     "Needs your approval". */
  it("separates two rows that share a source but not an outcome", () => {
    const source = { kind: "proposal" as const, actionable: true };
    expect(inboxBucket({ ...source, liveDecisions: [d("approve")] })).toBe("approval");
    expect(inboxBucket({ ...source, liveDecisions: [d("acknowledge")] })).toBe("awareness");
  });
});

describe("the Inbox actually sorts on this", () => {
  const src = readFileSync("client/src/pages/InboxPage.tsx", "utf8");

  it("groups both sections through the shared rule", () => {
    expect(src).toContain('inboxBucket(it) === "approval"');
    expect(src).toContain('inboxBucket(it) === "awareness"');
  });

  /* A `kind` comparison creeping back into the section split is the exact
     regression, and it would look perfectly reasonable in a diff. */
  it("no longer splits the sections on the source field", () => {
    expect(src).not.toContain('it.kind === "proposal"');
    expect(src).not.toContain('it.kind === "detection"');
  });

  it("asks for approval rather than for an unnamed decision", () => {
    expect(src).toContain('title="Needs your approval"');
    expect(src).toContain('title="Needs your input"');
    expect(src).toContain('title="For your awareness"');
  });

  /* Overview prints the same number. If the count row started including
     awareness rows again the two screens would disagree about how much is
     outstanding, and neither would look wrong on its own. */
  it("counts only the two sections that ask the tenant for something", () => {
    expect(src).toContain("decisionRows.length + inputRows.length");
  });
});
