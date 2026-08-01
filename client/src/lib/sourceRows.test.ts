import { describe, it, expect } from "vitest";
import {
  readState,
  formatRelativeTime,
  syncCaption,
  sourceCountCaption,
  formatSize,
} from "./sourceRows";

const NOW = Date.parse("2026-07-31T12:00:00.000Z");

describe("readState", () => {
  it("separates the three outcomes", () => {
    expect(readState({ isError: true, isLoading: false, data: undefined })).toBe("failed");
    expect(readState({ isError: false, isLoading: true, data: undefined })).toBe("pending");
    expect(readState({ isError: false, isLoading: false, data: [] })).toBe("done");
  });

  it("treats a settled query with no data as pending, not as an answer", () => {
    expect(readState({ isError: false, isLoading: false, data: undefined })).toBe("pending");
  });
});

describe("formatRelativeTime", () => {
  it("returns null rather than a placeholder when there is no usable timestamp", () => {
    expect(formatRelativeTime(null, NOW)).toBeNull();
    expect(formatRelativeTime(undefined, NOW)).toBeNull();
    expect(formatRelativeTime("", NOW)).toBeNull();
    expect(formatRelativeTime("not a date", NOW)).toBeNull();
  });

  it("scales the unit with the gap", () => {
    expect(formatRelativeTime("2026-07-31T11:56:00.000Z", NOW)).toBe("4 min ago");
    expect(formatRelativeTime("2026-07-31T11:00:00.000Z", NOW)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-07-31T09:00:00.000Z", NOW)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-07-29T12:00:00.000Z", NOW)).toBe("2 days ago");
  });

  it("falls back to a date beyond a week", () => {
    expect(formatRelativeTime("2026-06-12T12:00:00.000Z", NOW)).toMatch(/Jun/);
  });

  it("never reports a future timestamp as a prediction", () => {
    expect(formatRelativeTime("2026-08-05T12:00:00.000Z", NOW)).toBe("just now");
  });
});

describe("syncCaption", () => {
  it("prints a real sync time when the feed publishes one", () => {
    expect(syncCaption({ kind: "Accounting", lastSyncedAt: "2026-07-31T11:56:00.000Z" }, NOW))
      .toBe("Accounting · last synced 4 min ago");
  });

  it("never captions a connection time as a sync time", () => {
    const caption = syncCaption({ kind: "Bank account", connectedAt: "2026-07-29T12:00:00.000Z" }, NOW);
    expect(caption).toBe("Bank account · connected 2 days ago");
    expect(caption).not.toContain("synced");
  });

  it("flags an overdue feed", () => {
    expect(syncCaption(
      { kind: "Payments", lastSyncedAt: "2026-07-29T12:00:00.000Z", freshness: "stale" },
      NOW,
    )).toContain("sync overdue");
  });

  it("does not cry stale over a source upstream says never syncs", () => {
    expect(syncCaption(
      { kind: "Payments", lastSyncedAt: "2026-07-29T12:00:00.000Z", freshness: "stale", syncDisabled: true },
      NOW,
    )).toBe("Payments · last synced 2 days ago");
  });

  it("degrades to the bare kind when there is no timestamp at all", () => {
    expect(syncCaption({ kind: "Crypto wallet" }, NOW)).toBe("Crypto wallet");
  });
});

describe("sourceCountCaption", () => {
  it("counts plainly once every feed has answered", () => {
    expect(sourceCountCaption(8, ["done", "done", "done", "done"])).toBe("8 connected sources");
    expect(sourceCountCaption(1, ["done"])).toBe("1 connected source");
  });

  it("does not report a total while every feed is still loading", () => {
    expect(sourceCountCaption(0, ["pending", "pending"])).toBe("Checking your sources…");
  });

  it("qualifies the count when a feed failed", () => {
    expect(sourceCountCaption(3, ["done", "failed", "done", "done"]))
      .toBe("3 connected sources shown · 1 list couldn't be loaded");
    expect(sourceCountCaption(3, ["failed", "failed", "done", "done"]))
      .toContain("2 lists couldn't be loaded");
  });

  it("qualifies the count while a feed is still answering", () => {
    expect(sourceCountCaption(3, ["done", "pending", "done", "done"]))
      .toBe("3 connected sources so far · still checking");
  });

  it("reports a failure ahead of a pending read", () => {
    expect(sourceCountCaption(3, ["failed", "pending", "done", "done"]))
      .toContain("couldn't be loaded");
  });
});

describe("formatSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(7168)).toBe("7.0 KB");
    expect(formatSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
