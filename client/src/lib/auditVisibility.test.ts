import { describe, it, expect } from "vitest";
import { partitionSystemActivity, auditEmptyState, tabEmptyBase, systemActivityToggleLabel } from "./auditVisibility";
import type { AuditRecord } from "./auditTypes";

const rec = (over: Partial<AuditRecord>): AuditRecord =>
  ({
    id: over.id ?? "evt_1",
    eventType: "approved",
    summary: "Payment approved",
    actor: "someone",
    occurredAtMs: 0,
    occurredAtLabel: "now",
    linked: [],
    anchor: { status: "anchored", auditId: over.id ?? "evt_1" },
    ...over,
  }) as AuditRecord;

describe("partitionSystemActivity", () => {
  it("hides pipeline events and keeps decisions", () => {
    const { visible, system } = partitionSystemActivity([
      rec({ id: "a", eventType: "approved" }),
      rec({ id: "b", eventType: "system_activity", coreEventType: "system_activity", summary: "Wiki page regenerated" }),
      rec({ id: "c", eventType: "rejected" }),
    ]);
    expect(visible.map((r) => r.id)).toEqual(["a", "c"]);
    expect(system.map((r) => r.id)).toEqual(["b"]);
  });

  it("keeps assistant activity visible — a person asked that question", () => {
    const { visible, system } = partitionSystemActivity([
      rec({ id: "q", eventType: "system_activity", coreEventType: "assistant_activity", subtype: "wiki.question" }),
    ]);
    expect(visible.map((r) => r.id)).toEqual(["q"]);
    expect(system).toHaveLength(0);
  });
});

describe("empty-state copy", () => {
  it("never says the log is empty when the filter is what emptied it", () => {
    const copy = auditEmptyState({ tab: "All", searching: false, hiddenCount: 97, hiddenMatches: 0 });
    expect(copy).not.toMatch(/No audit records yet/);
    expect(copy).toContain("97 system events are hidden");
    expect(copy).toMatch(/Show system activity/);
  });

  it("says the log is empty only when nothing is being withheld", () => {
    expect(auditEmptyState({ tab: "All", searching: false, hiddenCount: 0, hiddenMatches: 0 })).toBe("No audit records yet.");
  });

  it("counts one hidden event in the singular", () => {
    expect(auditEmptyState({ tab: "All", searching: false, hiddenCount: 1, hiddenMatches: 0 })).toContain("1 system event is hidden");
  });

  it("admits when the thing being searched for is sitting in the hidden set", () => {
    const copy = auditEmptyState({ tab: "All", searching: true, hiddenCount: 97, hiddenMatches: 3 });
    expect(copy).toMatch(/3 hidden system events match/);
    expect(copy).not.toBe("No matches.");
  });

  it("reports a plain no-match when nothing hidden matches either", () => {
    expect(auditEmptyState({ tab: "All", searching: true, hiddenCount: 97, hiddenMatches: 0 })).toBe("No matches.");
  });

  it("keeps each tab's own sentence", () => {
    expect(tabEmptyBase("Flagged", false)).toBe("No flagged transactions yet.");
    expect(auditEmptyState({ tab: "Rejections", searching: false, hiddenCount: 0, hiddenMatches: 0 })).toBe(
      "No rejected payment records yet.",
    );
  });
});

describe("toggle label", () => {
  it("discloses how much is being held back", () => {
    expect(systemActivityToggleLabel(97, false)).toBe("Show system activity (97)");
  });

  it("drops the count when there is nothing to hide", () => {
    expect(systemActivityToggleLabel(0, false)).toBe("Show system activity");
  });

  it("reads as state, not instruction, once on", () => {
    expect(systemActivityToggleLabel(97, true)).toBe("Showing system activity");
  });
});
