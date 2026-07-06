import { describe, it, expect } from "vitest";
import { mapAuditEventToRecord, type BrainAuditEvent, type BrainAnchor } from "./brainAudit";

/**
 * mapAuditEventToRecord's real branches: eventType/summary classification from
 * the action id, and anchor status derived ONLY from whether created_at falls
 * inside the latest anchor's [period_start, period_end] window. This pins the
 * honesty invariant: a record never claims "anchored" (with hashes/href)
 * unless brain-core's own anchor window actually covers it — guard 6
 * (checkAnchorUiCoherence) would catch a violation of this at the data level.
 */

function ev(overrides: Partial<BrainAuditEvent> = {}): BrainAuditEvent {
  return {
    id: "evt_01ABC",
    tenant_id: "tn_1",
    layer: "agent",
    actor: "system",
    action: "payment_intent.approved",
    inputs: {},
    outputs: {},
    policy_version: 1,
    event_hash: "0xabc",
    prev_event_hash: null,
    created_at: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

function anchor(overrides: Partial<BrainAnchor> = {}): BrainAnchor {
  return {
    merkle_root: "0xroot",
    event_count: 10,
    period_start: "2026-07-01T00:00:00.000Z",
    period_end: "2026-07-01T23:59:59.000Z",
    onchain_tx_hash: "0xtx",
    onchain_block_number: 12345,
    ...overrides,
  };
}

describe("mapAuditEventToRecord", () => {
  it("marks a record anchored only when created_at falls inside the latest anchor window", () => {
    const r = mapAuditEventToRecord(ev(), anchor());
    expect(r.anchor.status).toBe("anchored");
    expect(r.anchor.merkleRoot).toBe("0xroot");
    expect(r.anchor.baseTx).toBe("0xtx");
  });

  it("marks pending_next_batch with NO hashes when created_at is after the anchor window", () => {
    const r = mapAuditEventToRecord(
      ev({ created_at: "2026-07-02T12:00:00.000Z" }),
      anchor(),
    );
    expect(r.anchor.status).toBe("pending_next_batch");
    expect(r.anchor.merkleRoot).toBeUndefined();
    expect(r.anchor.baseTx).toBeUndefined();
    expect(r.anchor.verifyHref).toBeUndefined();
  });

  it("marks pending_next_batch with no hashes when there is no anchor yet", () => {
    const r = mapAuditEventToRecord(ev(), undefined);
    expect(r.anchor.status).toBe("pending_next_batch");
    expect(r.anchor.merkleRoot).toBeUndefined();
  });

  it("maps a known action to its eventType/summary", () => {
    const r = mapAuditEventToRecord(ev({ action: "payment_intent.rejected" }), anchor());
    expect(r.eventType).toBe("flagged");
    expect(r.summary).toBe("Payment rejected");
  });

  it("falls back to the raw action id for an unmapped action, never a fabricated category", () => {
    const r = mapAuditEventToRecord(ev({ action: "ledger.reconciliation.matched" }), anchor());
    expect(r.summary).toBe("ledger.reconciliation.matched");
  });

  it("never fabricates linked evidence — linked[] is always empty from a live event", () => {
    const r = mapAuditEventToRecord(ev(), anchor());
    expect(r.linked).toEqual([]);
  });

  it("omits actor on lifecycle step for system actions but keeps it for a human actor", () => {
    const systemRec = mapAuditEventToRecord(ev({ actor: "system" }), anchor());
    expect(systemRec.lifecycle[0].actor).toBeUndefined();
    const humanRec = mapAuditEventToRecord(ev({ actor: "sarah@meridian" }), anchor());
    expect(humanRec.lifecycle[0].actor).toBe("sarah@meridian");
  });
});
