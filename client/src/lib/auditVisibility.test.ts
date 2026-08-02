import { describe, it, expect } from "vitest";
import { partitionSystemActivity } from "./auditVisibility";
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
  it("separates pipeline events from decisions", () => {
    const { visible, system } = partitionSystemActivity([
      rec({ id: "a", eventType: "approved" }),
      rec({ id: "b", eventType: "system_activity", coreEventType: "system_activity", summary: "Wiki page regenerated" }),
      rec({ id: "c", eventType: "rejected" }),
    ]);
    expect(visible.map((r) => r.id)).toEqual(["a", "c"]);
    expect(system.map((r) => r.id)).toEqual(["b"]);
  });

  it("does not count assistant activity as pipeline traffic — a person asked that question", () => {
    const { visible, system } = partitionSystemActivity([
      rec({ id: "q", eventType: "system_activity", coreEventType: "assistant_activity", subtype: "wiki.question" }),
    ]);
    expect(visible.map((r) => r.id)).toEqual(["q"]);
    expect(system).toHaveLength(0);
  });
});
