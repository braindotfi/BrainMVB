import { describe, it, expect } from "vitest";
import { mapAuditEventToRecord, extractActorName, type BrainAuditEvent, type BrainAnchor } from "./brainAudit";

/**
 * mapAuditEventToRecord's real branches: eventType/summary classification from
 * the action id, and anchor status derived ONLY from whether created_at falls
 * inside the latest anchor's [period_start, period_end] window. This pins the
 * honesty invariant: a record never claims "anchored" (with hashes/href)
 * unless brain-core's own anchor window actually covers it - guard 6
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

  it("maps a known action to its eventType/summary with alert lifecycle for rejected", () => {
    const r = mapAuditEventToRecord(ev({ action: "payment_intent.rejected" }), anchor());
    expect(r.eventType).toBe("rejected");
    expect(r.summary).toBe("Payment rejected");
    expect(r.lifecycle[0].kind).toBe("alert");
  });

  it("falls back to the raw action id for an unmapped action, never a fabricated category", () => {
    const r = mapAuditEventToRecord(ev({ action: "ledger.reconciliation.matched" }), anchor());
    expect(r.summary).toBe("ledger.reconciliation.matched");
  });

  it("classifies an unmapped action as system_activity (brain-core's default), NOT flagged", () => {
    const r = mapAuditEventToRecord(ev({ action: "ledger.reconciliation.matched" }), anchor());
    expect(r.eventType).toBe("system_activity");
    expect(r.lifecycle[0].kind).toBe("ok");
  });

  it("honors brain-core's authoritative event_type over the local map for flagged-vs-informational", () => {
    // core says system_activity → informational even though unmapped
    const sys = mapAuditEventToRecord(
      ev({ action: "raw.ingest.new", event_type: "system_activity" }),
      anchor(),
    );
    expect(sys.eventType).toBe("system_activity");
    expect(sys.summary).toBe("New data ingested — Brain pulled in new records to process");
    expect(sys.coreEventType).toBe("system_activity");

    // core explicitly flags an unmapped action → it IS flagged, raw action id as summary
    const flagged = mapAuditEventToRecord(
      ev({ action: "policy.violation.detected", event_type: "flagged" }),
      anchor(),
    );
    expect(flagged.eventType).toBe("flagged");
    expect(flagged.summary).toBe("policy.violation.detected");
    expect(flagged.lifecycle[0].kind).toBe("alert");

    // core demotes a locally mapped-flagged action → informational wins
    const demoted = mapAuditEventToRecord(
      ev({ action: "member.changed", event_type: "system_activity" }),
      anchor(),
    );
    expect(demoted.eventType).toBe("system_activity");
    expect(demoted.summary).toBe("Team member updated");
  });

  it("keeps mapped DECISION types (approved/rejected) authoritative regardless of core buckets", () => {
    const r = mapAuditEventToRecord(
      ev({ action: "payment_intent.approved", event_type: "system_activity" }),
      anchor(),
    );
    expect(r.eventType).toBe("approved");
  });

  it("preserves legacy wiki.question behavior when event_type is absent (assistant activity, neutral)", () => {
    const r = mapAuditEventToRecord(ev({ action: "wiki.question" }), anchor());
    expect(r.eventType).toBe("flagged"); // legacy mapping retained
    expect(r.summary).toBe("Assistant asked a question");
    // subtype allowlist still marks it assistant activity → neutral rendering,
    // non-alert lifecycle, excluded from Inbox queues
    expect(r.subtype).toBe("wiki.question");
    expect(r.lifecycle[0].kind).toBe("ok");
  });

  it("maps raw.ingest.deduplicated to its human summary as system activity", () => {
    const r = mapAuditEventToRecord(ev({ action: "raw.ingest.deduplicated" }), anchor());
    expect(r.eventType).toBe("system_activity");
    expect(r.summary).toBe("Duplicate data — already ingested previously, skipped");
  });

  it("never fabricates linked evidence - linked[] is always empty from a live event", () => {
    const r = mapAuditEventToRecord(ev(), anchor());
    expect(r.linked).toEqual([]);
  });

  it("omits actor on lifecycle step for system actions but keeps it for a human actor", () => {
    const systemRec = mapAuditEventToRecord(ev({ actor: "system" }), anchor());
    expect(systemRec.lifecycle[0].actor).toBeUndefined();
    const humanRec = mapAuditEventToRecord(ev({ actor: "sarah@meridian" }), anchor());
    expect(humanRec.lifecycle[0].actor).toBe("sarah@meridian");
  });

  it("prefers actor_ref.display_name/email over the raw actor string", () => {
    const withName = mapAuditEventToRecord(
      ev({
        actor: "user_01KY52DRHFX1707ECARCY6Z8VJ",
        actor_ref: { id: "user_01KY52DRHFX1707ECARCY6Z8VJ", type: "user", display_name: "Sarah Chen" },
      }),
      anchor(),
    );
    expect(withName.actor).toBe("Sarah Chen");
    expect(withName.lifecycle[0].actor).toBe("Sarah Chen");

    const withEmail = mapAuditEventToRecord(
      ev({
        actor: "user_01KY52DRHFX1707ECARCY6Z8VJ",
        actor_ref: { id: "user_01KY52DRHFX1707ECARCY6Z8VJ", type: "user", email: "sarah@meridian.co" },
      }),
      anchor(),
    );
    expect(withEmail.actor).toBe("sarah@meridian.co");
  });

  it("uses the resolved lookup name when inline display data is absent", () => {
    const r = mapAuditEventToRecord(
      ev({
        actor: "user_01KY52DRHFX1707ECARCY6Z8VJ",
        actor_ref: {
          id: "user_01KY52DRHFX1707ECARCY6Z8VJ",
          type: "user",
          lookup: "/v1/members/user_01KY52DRHFX1707ECARCY6Z8VJ",
        },
      }),
      anchor(),
      { "/v1/members/user_01KY52DRHFX1707ECARCY6Z8VJ": "Sarah Chen" },
    );
    expect(r.actor).toBe("Sarah Chen");
    expect(r.lifecycle[0].actor).toBe("Sarah Chen");
  });

  it("keeps the honest omit-fallback when resolution failed: raw machine id never becomes a lifecycle actor", () => {
    const r = mapAuditEventToRecord(
      ev({
        actor: "user_01KY52DRHFX1707ECARCY6Z8VJ",
        actor_ref: {
          id: "user_01KY52DRHFX1707ECARCY6Z8VJ",
          type: "user",
          lookup: "/v1/members/user_01KY52DRHFX1707ECARCY6Z8VJ",
        },
      }),
      anchor(),
      { "/v1/members/user_01KY52DRHFX1707ECARCY6Z8VJ": null },
    );
    expect(r.lifecycle[0].actor).toBeUndefined();
  });
});

describe("extractActorName", () => {
  it("reads a member payload's top-level display fields", () => {
    expect(extractActorName({ display_name: "Sarah Chen", email: "s@x.co" })).toBe("Sarah Chen");
    expect(extractActorName({ email: "s@x.co" })).toBe("s@x.co");
    expect(extractActorName({ name: "Sarah" })).toBe("Sarah");
  });

  it("reads an agent payload nested under definition/registration", () => {
    expect(extractActorName({ definition: { display_name: "Collections Agent" }, registration: {} })).toBe(
      "Collections Agent",
    );
    expect(extractActorName({ registration: { name: "AP Agent" } })).toBe("AP Agent");
  });

  it("returns null (never a raw id) when no display data exists", () => {
    expect(extractActorName({ id: "agt_01ABC" })).toBeNull();
    expect(extractActorName(null)).toBeNull();
    expect(extractActorName("agt_01ABC")).toBeNull();
    expect(extractActorName({ definition: { id: "agt_01ABC" } })).toBeNull();
  });
});
