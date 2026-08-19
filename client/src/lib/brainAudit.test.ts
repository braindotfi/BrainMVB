import { describe, it, expect, vi, afterEach } from "vitest";
import { mapAuditEventToRecord, mergeRelatedAuditRecords, anchorFromInclusionProof, resolveDetailAnchor, localQuestionToRecord, applyTenantDbOnly, extractActorName, bffPathForActorLookup, truncateForCard, decidedProposalIdsFromEvents, CARD_TITLE_MAX, humanizeAuditAction, lifecycleStepsForDisplay, fetchAllBrainAuditEvents, fetchAuditInclusionProofs, type BrainAuditEvent, type BrainAnchor, type BrainInclusionProof } from "./brainAudit";
import type { AnchorProof } from "./auditTypes";

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
    anchoring_mode: "onchain",
    merkle_root: "0xroot",
    event_count: 10,
    period_start: "2026-07-01T00:00:00.000Z",
    period_end: "2026-07-01T23:59:59.000Z",
    onchain_tx_hash: "0xtx",
    onchain_block_number: 12345,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAllBrainAuditEvents", () => {
  it("follows brain-core's cursor through multiple pages and returns older anchored events exactly once", async () => {
    const newest = ev({ id: "evt_newest", created_at: "2026-07-02T12:00:00.000Z" });
    const anchoredOlder = ev({ id: "evt_anchored_older", created_at: "2026-06-15T12:00:00.000Z" });
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input, "http://brainmvb.test");
      requests.push(url);
      const page = url.searchParams.get("cursor")
        ? { events: [anchoredOlder], next_cursor: null }
        : { events: [newest], next_cursor: "older-page" };
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await fetchAllBrainAuditEvents();

    expect(requests).toHaveLength(2);
    expect(requests[0].searchParams.get("cursor")).toBeNull();
    expect(requests[1].searchParams.get("cursor")).toBe("older-page");
    expect(requests.every((request) => !request.searchParams.has("after"))).toBe(true);
    expect(result.events.map((event) => event.id)).toEqual(["evt_newest", "evt_anchored_older"]);
    expect(new Set(result.events.map((event) => event.id)).size).toBe(result.events.length);
  });

  it("fails explicitly instead of returning an incomplete history when a page repeats", async () => {
    const newest = ev({ id: "evt_newest" });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ events: [newest], next_cursor: "stuck" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(fetchAllBrainAuditEvents()).rejects.toThrow(/pagination (returned a repeated event|did not advance)/i);
  });
});

describe("fetchAuditInclusionProofs", () => {
  it("restores an older event's anchored status from its authoritative inclusion proof", async () => {
    const older = ev({ id: "evt_older", created_at: "2026-06-15T12:00:00.000Z" });
    const uncovered = ev({ id: "evt_uncovered", created_at: "2026-06-16T12:00:00.000Z" });
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const id = input.split("/").at(-1);
      const inclusion_proof = id === "evt_older"
        ? { merkle_root: "0xolder-root", anchor_tx_hash: "0xolder-tx", anchor_block: 77 }
        : null;
      return new Response(JSON.stringify({ event: id === "evt_older" ? older : uncovered, inclusion_proof }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const proofs = await fetchAuditInclusionProofs([older, uncovered]);

    expect(proofs.evt_older).toMatchObject({
      status: "anchored",
      merkleRoot: "0xolder-root",
      baseTx: "0xolder-tx",
    });
    expect(proofs.evt_uncovered).toBeUndefined();
  });
});

describe("mapAuditEventToRecord", () => {
  it("shows demo audit records as database-only rather than pending on-chain", () => {
    const r = mapAuditEventToRecord(ev(), anchor({
      anchoring_mode: "db_only",
      merkle_root: null,
      event_count: null,
      period_start: null,
      period_end: null,
      onchain_tx_hash: null,
      onchain_block_number: null,
    }));
    expect(r.anchor.status).toBe("db_only_hash_chain");
  });

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

  it("turns agent action ids into human-readable lifecycle titles", () => {
    const r = mapAuditEventToRecord(
      ev({
        action: "agent.action.refreshed",
        event_type: "flagged",
      }),
      anchor(),
    );
    expect(r.lifecycle[0].label).toBe("Agent recommendation updated");
    expect(humanizeAuditAction("ledger.reconciled")).toBe("Ledger Reconciled");
  });

  /* The Inbox suppresses a live proposal when an audit record carries its id
     (brain-core leaves decided proposals in GET /proposals, so without that the
     pending row and its settled row both render). That makes `proposalId` a
     HIDE switch, and every agent proposal is born with an
     `agent.action.proposed` event quoting its own id in exactly the same field.
     If this mapping ever widened past proposal.decided, every record would be
     hidden for as long as its own creation event sat inside the audit page —
     and because that page is capped, which records vanished would drift as the
     tenant aged. Pinned here rather than at the call site: this is the line
     that decides it. */
  it("never links a proposal from a creation event, only from a decision", () => {
    const created = mapAuditEventToRecord(
      ev({
        action: "agent.action.proposed",
        actor: "compliance",
        inputs: { action_kind: "agent_action", proposal_id: "prop_01NOTDECIDED" },
        outputs: { status: "pending", outcome: "confirm" },
      }),
      anchor(),
    );
    expect(created.linked).toEqual([]);

    const decided = mapAuditEventToRecord(
      ev({ action: "proposal.decided", inputs: { proposal_id: "prop_01DECIDED", decision: "approve" } }),
      anchor(),
    );
    expect(decided.linked).toEqual([
      { kind: "proposal", label: "prop_01DECIDED", refId: "prop_01DECIDED" },
    ]);
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
    // summary is now the clean decision label; narrative/remediation move to the note
    // so they surface only in "Brain's Recommendation", not the summary header.
    expect(r.summary).toBe("Proposal acknowledged");
    // recommended_remediation is preferred over narrative for the note.
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

  it("uses a human-readable decision title for proposal.decided events predating the snapshot", () => {
    const r = mapAuditEventToRecord(
      ev({
        action: "proposal.decided",
        inputs: { proposal_id: "prop_01OLD", decision: "approve" },
        outputs: { status: "approved" }, // no proposal_summary key at all
      }),
      anchor(),
    );
    expect(r.summary).toBe("Proposal approved");
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

  /* db_only tenant regression: the tenant-level anchor.status is db_only for
     every event on the tenant, but an event anchored BEFORE the tenant
     flipped to db_only still carries a real anchor_tx_hash in its per-event
     inclusion proof. That real proof must win — flipping it to "database
     only" would deny a genuine on-chain proof and kill a working Verify
     link. */
  it("resolveDetailAnchor: db_only tenant + event whose inclusion proof carries a confirmed tx still reports anchored", () => {
    const dbOnlyRecordAnchor: AnchorProof = { status: "db_only_hash_chain", auditId: "evt_x" };
    const proof: BrainInclusionProof = {
      merkle_root: "0xroot",
      merkle_proof: [],
      anchor_tx_hash: "0xtx",
      anchor_block: 42,
    };
    const proofAnchor = anchorFromInclusionProof("evt_x", proof, "2026-06-15T12:00:00.000Z");
    const resolved = resolveDetailAnchor(dbOnlyRecordAnchor, proofAnchor);
    expect(resolved.status).toBe("anchored");
    expect(resolved.baseTx).toBe("0xtx");
    expect(resolved.verifyHref).toBeDefined();
  });

  it("resolveDetailAnchor: db_only tenant + no/incomplete proof still reports db_only, not pending", () => {
    const dbOnlyRecordAnchor: AnchorProof = { status: "db_only_hash_chain", auditId: "evt_x" };
    expect(resolveDetailAnchor(dbOnlyRecordAnchor, undefined).status).toBe("db_only_hash_chain");
    const incompleteProof = anchorFromInclusionProof("evt_x", { merkle_root: null, anchor_tx_hash: null, anchor_block: null });
    expect(resolveDetailAnchor(dbOnlyRecordAnchor, incompleteProof).status).toBe("db_only_hash_chain");
  });

  it("maps a known action to its eventType/summary with alert lifecycle for rejected", () => {
    const r = mapAuditEventToRecord(ev({ action: "payment_intent.rejected" }), anchor());
    expect(r.eventType).toBe("rejected");
    expect(r.summary).toBe("Payment rejected");
    expect(r.lifecycle[0].kind).toBe("alert");
  });

  it("uses a human-readable title for an unmapped action, never a fabricated category", () => {
    const r = mapAuditEventToRecord(ev({ action: "ledger.reconciliation.matched" }), anchor());
    expect(r.summary).toBe("Ledger Reconciliation Matched");
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

    // core explicitly flags an unmapped action → it IS flagged, with a human-readable summary
    const flagged = mapAuditEventToRecord(
      ev({ action: "policy.violation.detected", event_type: "flagged" }),
      anchor(),
    );
    expect(flagged.eventType).toBe("flagged");
    expect(flagged.summary).toBe("Policy Violation Detected");
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

describe("mergeRelatedAuditRecords", () => {
  it("keeps recommendation creation completed while its decision is pending", () => {
    const proposed = ev({
      action: "agent.action.proposed",
      inputs: { proposal_id: "prop_pending" },
      outputs: { status: "pending", outcome: "confirm" },
    });
    const record = mapAuditEventToRecord(proposed, anchor());
    expect(mergeRelatedAuditRecords([proposed], [record])[0].lifecycle[0].kind).toBe("ok");
  });

  it("adds an explicitly pending future execution stage to an unresolved recommendation", () => {
    const proposed = ev({
      action: "agent.action.proposed",
      inputs: { proposal_id: "prop_pending" },
      outputs: { status: "pending" },
    });
    const record = mapAuditEventToRecord(proposed, anchor());
    const steps = lifecycleStepsForDisplay(record);
    expect(steps.map((step) => step.label)).toEqual([
      "Agent recommendation created",
      "Agent action executed",
    ]);
    expect(steps[1]).toMatchObject({
      kind: "pending",
      timestamp: "Pending your decision",
    });
  });

  it("adds pending execution after an approved decision, but not after a rejection", () => {
    const approved = mapAuditEventToRecord(
      ev({
        action: "proposal.decided",
        inputs: { proposal_id: "prop_approved", decision: "approve" },
      }),
      anchor(),
    );
    const approvedSteps = lifecycleStepsForDisplay(approved);
    expect(approvedSteps.at(-1)).toMatchObject({
      label: "Agent action executed",
      kind: "pending",
      timestamp: "Pending execution",
    });

    const rejected = mapAuditEventToRecord(
      ev({
        action: "proposal.decided",
        inputs: { proposal_id: "prop_rejected", decision: "reject" },
      }),
      anchor(),
    );
    const rejectedSteps = lifecycleStepsForDisplay(rejected);
    expect(rejectedSteps[0]).toMatchObject({
      label: "Agent recommendation created",
      timestamp: "Before this decision",
      kind: "ok",
    });
    expect(rejectedSteps).toHaveLength(rejected.lifecycle.length + 1);
    expect(rejectedSteps.some((step) => step.kind === "pending")).toBe(false);
  });

  it("builds one chronological lifecycle from correlated proposal events", () => {
    const proposed = ev({
      id: "evt_proposed",
      action: "agent.action.proposed",
      created_at: "2026-07-01T10:00:00.000Z",
      inputs: { proposal_id: "prop_lifecycle" },
      outputs: { status: "pending" },
    });
    const decided = ev({
      id: "evt_decided",
      action: "proposal.decided",
      created_at: "2026-07-01T10:05:00.000Z",
      inputs: { proposal_id: "prop_lifecycle", decision: "approve" },
    });
    const records = [
      mapAuditEventToRecord(proposed, anchor()),
      mapAuditEventToRecord(decided, anchor()),
    ];
    const [merged] = mergeRelatedAuditRecords([proposed, decided], records);
    const expectedTimestamp = (iso: string) => new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });

    expect(merged.lifecycle).toHaveLength(2);
    expect(merged.lifecycle.map((step) => step.timestamp)).toEqual([
      expectedTimestamp("2026-07-01T10:00:00.000Z"),
      expectedTimestamp("2026-07-01T10:05:00.000Z"),
    ]);
  });

  it("marks an explicitly awaiting event as pending instead of inventing a terminal outcome", () => {
    const awaiting = ev({
      id: "evt_awaiting",
      action: "proposal.awaiting_second_approval",
      inputs: { payment_intent_id: "pi_lifecycle" },
      outputs: { status: "awaiting_second_approval" },
    });
    const record = mapAuditEventToRecord(awaiting, anchor());
    expect(mergeRelatedAuditRecords([awaiting], [record])[0].lifecycle[0].kind).toBe("pending");
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

  it("does not mark a wiki-engine question not_recorded — it DID reach brain-core", () => {
    const wikiQ = { ...q, engine: "wiki" };
    expect(localQuestionToRecord(wikiQ).anchor.status).toBe("pending_next_batch");
  });

  it("does not mark an unknown (null) engine not_recorded — that would assert a false negative", () => {
    const unknownQ = { ...q, engine: null };
    expect(localQuestionToRecord(unknownQ).anchor.status).toBe("pending_next_batch");
  });
});

describe("applyTenantDbOnly", () => {
  const q = {
    id: "q1",
    userId: "u1",
    question: "What's our trailing monthly cash flow?",
    engine: "anthropic",
    createdAt: new Date("2026-08-06T12:07:00Z"),
  };
  const wikiQ = { ...q, engine: "wiki" };

  it("remaps a pending_next_batch local row to db_only_hash_chain when the tenant is db_only", () => {
    const r = applyTenantDbOnly(localQuestionToRecord(wikiQ), true);
    expect(r.anchor.status).toBe("db_only_hash_chain");
  });

  it("leaves not_recorded untouched — it is the stronger, still-correct claim", () => {
    const r = applyTenantDbOnly(localQuestionToRecord(q), true);
    expect(r.anchor.status).toBe("not_recorded");
  });

  it("is a no-op when the tenant is not db_only", () => {
    const r = applyTenantDbOnly(localQuestionToRecord(wikiQ), false);
    expect(r.anchor.status).toBe("pending_next_batch");
  });
});

/**
 * This set is a HIDE SWITCH. Both the Inbox and the Overview count subtract it
 * from the live proposals feed, so an id that lands in it wrongly does not
 * produce a visible error — it produces a record the tenant is never shown and
 * cannot know to look for. These pin the two ways that could happen.
 */
describe("decidedProposalIdsFromEvents", () => {
  const decision = (id: string, d: string, at: string) =>
    ev({ action: "proposal.decided", inputs: { proposal_id: id, decision: d }, created_at: at });

  it("collects proposals that were actually decided", () => {
    const ids = decidedProposalIdsFromEvents([
      decision("prop_a", "approve", "2026-07-01T10:00:00.000Z"),
      decision("prop_b", "reject", "2026-07-01T11:00:00.000Z"),
      decision("prop_c", "acknowledge", "2026-07-01T12:00:00.000Z"),
    ]);
    expect([...ids].sort()).toEqual(["prop_a", "prop_b", "prop_c"]);
  });

  /* An agent filing a proposal quotes the same proposal_id in the same field as
     a decision does. Only the action tells them apart, and if that check ever
     goes away every record disappears while its own birth event is in the feed. */
  it("ignores an agent.action.proposed event quoting the same id", () => {
    const ids = decidedProposalIdsFromEvents([
      ev({
        action: "agent.action.proposed",
        inputs: { action_kind: "agent_action", proposal_id: "prop_live" },
        created_at: "2026-07-01T10:00:00.000Z",
      }),
    ]);
    expect(ids.has("prop_live")).toBe(false);
  });

  /* `undo` is a decision that REOPENS the record. Counting it as terminal would
     hide a proposal that is live and waiting on the tenant. */
  it("drops a proposal that was undone after being decided", () => {
    const ids = decidedProposalIdsFromEvents([
      decision("prop_a", "undo", "2026-07-01T12:00:00.000Z"),
      decision("prop_a", "approve", "2026-07-01T10:00:00.000Z"),
    ]);
    expect(ids.has("prop_a")).toBe(false);
  });

  /* ...and the reverse must still hide it, which is what makes this an ordered
     replay rather than "an undo anywhere wins". */
  it("hides a proposal decided again after an undo", () => {
    const ids = decidedProposalIdsFromEvents([
      decision("prop_a", "reject", "2026-07-01T14:00:00.000Z"),
      decision("prop_a", "undo", "2026-07-01T12:00:00.000Z"),
      decision("prop_a", "approve", "2026-07-01T10:00:00.000Z"),
    ]);
    expect(ids.has("prop_a")).toBe(true);
  });

  it("survives an empty or unread feed without inventing ids", () => {
    expect(decidedProposalIdsFromEvents([]).size).toBe(0);
    expect(decidedProposalIdsFromEvents(undefined).size).toBe(0);
    expect(decidedProposalIdsFromEvents(null).size).toBe(0);
  });
});
