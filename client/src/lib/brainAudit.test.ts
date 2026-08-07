import { describe, it, expect } from "vitest";
import { mapAuditEventToRecord, anchorFromInclusionProof, localQuestionToRecord, extractActorName, bffPathForActorLookup, truncateForCard, CARD_TITLE_MAX, type BrainAuditEvent, type BrainAnchor, type BrainInclusionProof } from "./brainAudit";

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
  it("classifies an Inbox acknowledge decision into the Acknowledge audit bucket", () => {
    const r = mapAuditEventToRecord(
      ev({
        action: "proposal.decided",
        inputs: { proposal_id: "prop_01ABC", decision: "acknowledge" },
      }),
      anchor(),
    );
    expect(r.eventType).toBe("acknowledged");
    expect(r.summary).toContain("acknowledge");
  });

  it("uses the real narrative + links the proposal when brain-core attaches a proposal_summary", () => {
    const r = mapAuditEventToRecord(
      ev({
        action: "proposal.decided",
        inputs: { proposal_id: "prop_01KYN94C1GRDBQA5J4KM517143", decision: "acknowledge" },
        outputs: {
          status: "acknowledged",
          proposal_summary: {
            finding_type: "policy_violation",
            severity: "high",
            rule_id: "cmp_policy_violation",
            narrative: "Compliance review found policy_violation with high severity.",
            recommended_remediation: "Review the rejected policy decision and keep the action blocked.",
          },
        },
      }),
      anchor(),
    );
    expect(r.summary).toBe("Compliance review found policy_violation with high severity.");
    expect(r.lifecycle[0].note).toBe("Review the rejected policy decision and keep the action blocked.");
    expect(r.linked).toEqual([
      { kind: "proposal", label: "prop_01KYN94C1GRDBQA5J4KM517143", refId: "prop_01KYN94C1GRDBQA5J4KM517143" },
    ]);
  });

  it("prefers the retained proposal type over the generic execution-agent name", () => {
    const r = mapAuditEventToRecord(
      ev({
        action: "proposal.decided",
        inputs: { proposal_id: "prop_collections", decision: "reject" },
        outputs: {
          proposal_summary: {
            summary: "Review collections outreach for Midmarket Solutions",
            narrative: "Midmarket Solutions is overdue.",
            proposing_agent: "agent_demo_payment",
          },
        },
      }),
      anchor(),
      { "/v1/agents/agent_demo_payment": "Demo Payment Agent" },
      new Map([["prop_collections", "collections"]]),
    );
    expect(r.proposingAgent).toBe("collections");
    expect(r.proposingAgentDisplay).toBeUndefined();
  });

  it("falls back to the opaque id-only summary for proposal.decided events predating the snapshot", () => {
    const r = mapAuditEventToRecord(
      ev({
        action: "proposal.decided",
        inputs: { proposal_id: "prop_01OLD", decision: "approve" },
        outputs: { status: "approved" }, // no proposal_summary key at all
      }),
      anchor(),
    );
    expect(r.summary).toBe("Proposal decided - approve (prop_01OLD)");
    expect(r.lifecycle[0].note).toBeUndefined();
    // still links the id even without a summary - resolves-or-plain-text on the popup side
    expect(r.linked).toEqual([{ kind: "proposal", label: "prop_01OLD", refId: "prop_01OLD" }]);
  });

  it("marks a record anchored only when covered by the window AND a confirmed tx hash exists", () => {
    const r = mapAuditEventToRecord(ev(), anchor());
    expect(r.anchor.status).toBe("anchored");
    expect(r.anchor.merkleRoot).toBe("0xroot");
    expect(r.anchor.baseTx).toBe("0xtx");
    expect(r.anchor.verifyHref).toBe("https://sepolia.basescan.org/tx/0xtx");
    expect(r.anchor.anchoredAtLabel).toBeDefined();
  });

  it("0x-prefixes a bare-hex tx hash from the API in both baseTx and the verify URL", () => {
    const r = mapAuditEventToRecord(ev(), anchor({ onchain_tx_hash: "deadbeef" }));
    expect(r.anchor.baseTx).toBe("0xdeadbeef");
    expect(r.anchor.verifyHref).toBe("https://sepolia.basescan.org/tx/0xdeadbeef");
  });

  it("marks recorded_pending_anchor (NOT anchored) when the merkle root exists but anchor tx is null", () => {
    const r = mapAuditEventToRecord(ev(), anchor({ onchain_tx_hash: null, onchain_block_number: null }));
    expect(r.anchor.status).toBe("recorded_pending_anchor");
    expect(r.anchor.merkleRoot).toBe("0xroot");
    // Pending state must NEVER carry tx/block/verify link or an "Anchored at" label
    expect(r.anchor.baseTx).toBeUndefined();
    expect(r.anchor.block).toBeUndefined();
    expect(r.anchor.verifyHref).toBeUndefined();
    expect(r.anchor.anchoredAtLabel).toBeUndefined();
    expect(r.anchor.recordedAtLabel).toBeDefined();
  });

  it("treats an empty-string tx hash the same as null (recorded, no verify link)", () => {
    const r = mapAuditEventToRecord(ev(), anchor({ onchain_tx_hash: "  " }));
    expect(r.anchor.status).toBe("recorded_pending_anchor");
    expect(r.anchor.verifyHref).toBeUndefined();
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

  /* Multi-window regression: /audit/anchor/latest only returns the single
     most recent window, so an event covered by an EARLIER window is
     misclassified pending by the list-level anchorFor(). The per-event
     inclusion_proof (anchorFromInclusionProof) must resolve it correctly. */
  it("multi-window: an event preceding the latest window but covered by an earlier anchor renders anchored via its inclusion proof, not pending", () => {
    // Event from June; the latest anchor window is July — list-level state regresses to pending…
    const juneEvent = ev({ created_at: "2026-06-15T12:00:00.000Z" });
    const latestJulyAnchor = anchor(); // period 2026-07-01 → 2026-07-01
    const listLevel = mapAuditEventToRecord(juneEvent, latestJulyAnchor);
    expect(listLevel.anchor.status).toBe("pending_next_batch");

    // …but the per-event proof (computed by brain-core against the June
    // window that actually contains the event) says anchored — and wins.
    const proof: BrainInclusionProof = {
      merkle_root: "0xjuneroot",
      merkle_proof: ["0xsib"],
      anchor_tx_hash: "junetx",
      anchor_block: 999,
    };
    const a = anchorFromInclusionProof(juneEvent.id, proof, juneEvent.created_at);
    expect(a.status).toBe("anchored");
    expect(a.merkleRoot).toBe("0xjuneroot");
    expect(a.baseTx).toBe("0xjunetx");
    expect(a.block).toBe(999);
    expect(a.verifyHref).toBe("https://sepolia.basescan.org/tx/0xjunetx");
  });

  it("inclusion proof with null anchor_tx_hash is recorded_pending_anchor — no verify link, no tx/block", () => {
    const proof: BrainInclusionProof = {
      merkle_root: "0xroot",
      merkle_proof: [],
      anchor_tx_hash: null,
      anchor_block: null,
    };
    const a = anchorFromInclusionProof("evt_x", proof, "2026-06-15T12:00:00.000Z");
    expect(a.status).toBe("recorded_pending_anchor");
    expect(a.merkleRoot).toBe("0xroot");
    expect(a.baseTx).toBeUndefined();
    expect(a.block).toBeUndefined();
    expect(a.verifyHref).toBeUndefined();
    expect(a.anchoredAtLabel).toBeUndefined();
    expect(a.recordedAtLabel).toBeDefined();
  });

  it("inclusion proof with no merkle root (or missing proof) is pending_next_batch", () => {
    expect(anchorFromInclusionProof("evt_x", { merkle_root: null, anchor_tx_hash: null, anchor_block: null }).status).toBe("pending_next_batch");
    expect(anchorFromInclusionProof("evt_x", null).status).toBe("pending_next_batch");
    expect(anchorFromInclusionProof("evt_x", undefined).status).toBe("pending_next_batch");
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
    expect(sys.summary).toBe("New data ingested: Brain pulled in new records to process");
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

  it("surfaces the real question as the wiki.question title (short question = whole title)", () => {
    const r = mapAuditEventToRecord(
      ev({ action: "wiki.question", inputs: { question: "What do I owe AWS this month?" } }),
      anchor(),
    );
    expect(r.summary).toBe("What do I owe AWS this month?");
    // No truncation happened → no redundant note repeating the title
    expect(r.lifecycle[0].note).toBeUndefined();
  });

  it("truncates a long wiki.question title for cards and carries the FULL text on the lifecycle note", () => {
    const long =
      "Can you walk me through every outstanding vendor obligation we have for Q3, including anything already scheduled but not yet settled?";
    const r = mapAuditEventToRecord(
      ev({ action: "wiki.question", inputs: { question: long } }),
      anchor(),
    );
    expect(r.summary.endsWith("…")).toBe(true);
    expect(r.summary.length).toBeLessThanOrEqual(CARD_TITLE_MAX + 1);
    expect(r.lifecycle[0].note).toBe(long);
  });

  it("falls back to the generic wiki.question title when inputs.question is missing or not a string", () => {
    const missing = mapAuditEventToRecord(ev({ action: "wiki.question", inputs: {} }), anchor());
    expect(missing.summary).toBe("Assistant asked a question");
    const wrongType = mapAuditEventToRecord(
      ev({ action: "wiki.question", inputs: { question: 42 } }),
      anchor(),
    );
    expect(wrongType.summary).toBe("Assistant asked a question");
    const blank = mapAuditEventToRecord(
      ev({ action: "wiki.question", inputs: { question: "   " } }),
      anchor(),
    );
    expect(blank.summary).toBe("Assistant asked a question");
  });

  it("maps raw.ingest.deduplicated to its human summary as system activity", () => {
    const r = mapAuditEventToRecord(ev({ action: "raw.ingest.deduplicated" }), anchor());
    expect(r.eventType).toBe("system_activity");
    expect(r.summary).toBe("Duplicate data: already ingested previously, skipped");
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

describe("truncateForCard", () => {
  it("returns short text unchanged and truncates long text with an ellipsis", () => {
    expect(truncateForCard("short question")).toBe("short question");
    const long = "x".repeat(200);
    const t = truncateForCard(long);
    expect(t.length).toBe(CARD_TITLE_MAX + 1);
    expect(t.endsWith("…")).toBe(true);
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

/**
 * Actor-lookup routing. brain-core emits `actor_ref.lookup` as
 * `/v1/agents/{id}` for agent actors, but that route is its agent CATALOG,
 * keyed by agent_key ("collections", "treasury", …) — it answers 404
 * `agent_not_found` for the runtime ULIDs (`agent_01…`) audit events actually
 * carry. Runtime agents resolve at `/v1/execution/agents/{id}`. This pins the
 * re-point so agent-attributed audit rows keep their names instead of silently
 * falling back to "omit the actor" on every single row.
 */
describe("bffPathForActorLookup", () => {
  it("re-points agent lookups at the runtime registry, not the catalog", () => {
    expect(bffPathForActorLookup("/v1/agents/agent_01KYAT7A1V54DA2153R0NHE1YR")).toBe(
      "/api/brain/execution/agents/agent_01KYAT7A1V54DA2153R0NHE1YR",
    );
  });

  it("passes member lookups through unchanged", () => {
    expect(bffPathForActorLookup("/v1/members/user_01KYAT7A1QN8CBFP6S0SAY241F")).toBe(
      "/api/brain/members/user_01KYAT7A1QN8CBFP6S0SAY241F",
    );
  });

  it("only rewrites the bare /agents/{id} shape, never its sub-resources", () => {
    // /agents/{id}/actions is a real, different route - leave it alone.
    expect(bffPathForActorLookup("/v1/agents/collections/actions")).toBe("/api/brain/agents/collections/actions");
  });
});

/* Local assistant questions are recorded by THIS app: assistant_questions
   exists (shared/schema.ts) precisely because the Anthropic fallback path has
   "no brain-core interaction -> no upstream audit". They are in no anchor
   window and never will be, so rendering them as pending told the reader an
   anchor was on its way that cannot arrive. */
describe("localQuestionToRecord", () => {
  const q = {
    id: "q1",
    userId: "u1",
    question: "What's our trailing monthly cash flow?",
    engine: "anthropic",
    createdAt: new Date("2026-08-06T12:07:00Z"),
  };

  it("marks a local-only question not_recorded, never pending", () => {
    expect(localQuestionToRecord(q).anchor.status).toBe("not_recorded");
  });

  it("never carries proof material or a verify link", () => {
    const anchor = localQuestionToRecord(q).anchor;
    expect(anchor.merkleRoot).toBeUndefined();
    expect(anchor.baseTx).toBeUndefined();
    expect(anchor.verifyHref).toBeUndefined();
  });
});
