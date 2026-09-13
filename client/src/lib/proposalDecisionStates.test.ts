import { describe, it, expect } from "vitest";
import {
  PROPOSAL_ID_PATTERN,
  DECISION_STATE_BATCH_LIMIT,
  queryableProposalIds,
  unqueryableProposalIds,
  chunkProposalIds,
  parseDecisionStateResponse,
  isDecidedState,
  aggregateDecisionStates,
  isDecisionStateBatchFor,
  DECISION_STATES_QUERY_KEY,
  type ProposalDecisionState,
} from "./proposalDecisionStates";

/**
 * These guard a HIDE SWITCH. An id that lands in the decided set wrongly does
 * not surface as an error — it removes a record from the operator's queue and
 * they have no way to know it was there. So every ambiguous input below must
 * resolve to "not decided", and the id that is genuinely decided must still be
 * recognised, or the original bug (settled rows never leaving Unresolved)
 * comes straight back.
 */

const ULID_A = "01J9ZK4T7M8Q2W5R3X6Y8B4C7D";
const ULID_B = "01J9ZK4T7M8Q2W5R3X6Y8B4C7E";
const PROP_A = `prop_${ULID_A}`;
const PROP_B = `prop_${ULID_B}`;
const PI_A = `pi_${ULID_A}`;

const state = (over: Partial<ProposalDecisionState> = {}): ProposalDecisionState => ({
  proposalId: PROP_A,
  found: true,
  decisionState: "decided",
  status: "approved",
  decision: "approve",
  auditId: "evt_1",
  decidedAt: "2026-09-13T10:00:00.000Z",
  ...over,
});

describe("id gate", () => {
  it("accepts the two id prefixes the endpoint documents", () => {
    expect(PROPOSAL_ID_PATTERN.test(PROP_A)).toBe(true);
    expect(PROPOSAL_ID_PATTERN.test(PI_A)).toBe(true);
  });

  /* Crockford base32 excludes I, L, O and U. An id carrying one is not a ULID
     and the request schema will reject the whole batch over it. */
  it("rejects ids that are not ULID-shaped", () => {
    expect(PROPOSAL_ID_PATTERN.test("prop_example")).toBe(false);
    expect(PROPOSAL_ID_PATTERN.test(`prop_${ULID_A.slice(0, 25)}`)).toBe(false);
    expect(PROPOSAL_ID_PATTERN.test(`prop_ILOU${ULID_A.slice(4)}`)).toBe(false);
    expect(PROPOSAL_ID_PATTERN.test(`evt_${ULID_A}`)).toBe(false);
  });

  /* The failure this prevents: `proposal_ids` is schema-validated, so ONE
     malformed id 400s the batch and every well-formed proposal beside it loses
     its answer too. */
  it("keeps a malformed id from taking the rest of the batch down with it", () => {
    const ids = queryableProposalIds([PROP_A, "prop_example", PROP_B]);
    expect(ids).toEqual([PROP_A, PROP_B].sort());
  });

  it("deduplicates and sorts, so the same set in a different order is the same request", () => {
    expect(queryableProposalIds([PROP_B, PROP_A, PROP_B])).toEqual(queryableProposalIds([PROP_A, PROP_B]));
  });

  it("reports the ids it had to leave out rather than dropping them silently", () => {
    expect(unqueryableProposalIds([PROP_A, "prop_example", "evt_1"])).toEqual(["evt_1", "prop_example"]);
  });

  it("splits at the documented batch ceiling", () => {
    const many = Array.from({ length: 250 }, (_, i) => `prop_${i}`);
    const chunks = chunkProposalIds(many);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(DECISION_STATE_BATCH_LIMIT).toBe(100);
  });
});

describe("parseDecisionStateResponse", () => {
  it("reads a well-formed response", () => {
    const parsed = parseDecisionStateResponse(
      {
        states: [
          {
            proposal_id: PROP_A,
            found: true,
            decision_state: "decided",
            status: "approved",
            decision: "approve",
            audit_id: "evt_9",
            decided_at: "2026-09-13T10:00:00.000Z",
          },
        ],
      },
      [PROP_A],
    );
    expect(parsed.get(PROP_A)).toEqual({
      proposalId: PROP_A,
      found: true,
      decisionState: "decided",
      status: "approved",
      decision: "approve",
      auditId: "evt_9",
      decidedAt: "2026-09-13T10:00:00.000Z",
    });
  });

  /* The contract promises request order, but matching on POSITION means a
     short or reordered array attributes one proposal's decision to another —
     and the visible result of that is a PENDING proposal being hidden. */
  it("matches on id, not position, when the response is short or reordered", () => {
    const parsed = parseDecisionStateResponse(
      {
        states: [
          { proposal_id: PROP_B, found: true, decision_state: "decided", decision: "approve" },
        ],
      },
      [PROP_A, PROP_B],
    );
    expect(parsed.has(PROP_A)).toBe(false);
    expect(isDecidedState(parsed.get(PROP_B))).toBe(true);
  });

  it("ignores rows for ids nobody asked about", () => {
    const parsed = parseDecisionStateResponse(
      { states: [{ proposal_id: PROP_B, found: true, decision_state: "decided" }] },
      [PROP_A],
    );
    expect(parsed.size).toBe(0);
  });

  it("treats an unreadable body as no answer rather than no decisions", () => {
    expect(parseDecisionStateResponse(null, [PROP_A]).size).toBe(0);
    expect(parseDecisionStateResponse({}, [PROP_A]).size).toBe(0);
    expect(parseDecisionStateResponse({ states: "nope" }, [PROP_A]).size).toBe(0);
  });

  it("does not read an absent `found` as a found row", () => {
    const parsed = parseDecisionStateResponse(
      { states: [{ proposal_id: PROP_A, decision_state: "decided" }] },
      [PROP_A],
    );
    expect(parsed.get(PROP_A)?.found).toBe(false);
    expect(isDecidedState(parsed.get(PROP_A))).toBe(false);
  });

  it("normalises an unrecognised decision_state to null", () => {
    const parsed = parseDecisionStateResponse(
      { states: [{ proposal_id: PROP_A, found: true, decision_state: "settled" }] },
      [PROP_A],
    );
    expect(parsed.get(PROP_A)?.decisionState).toBeNull();
  });
});

describe("isDecidedState", () => {
  it("hides a proposal core reports as decided", () => {
    expect(isDecidedState(state())).toBe(true);
  });

  it("shows a proposal core reports as pending", () => {
    expect(isDecidedState(state({ decisionState: "pending", decision: null }))).toBe(false);
  });

  /* Every one of these is an absence of an answer, and none of them is grounds
     for taking a row off the queue. */
  it("shows a proposal whenever the answer is missing or uncertain", () => {
    expect(isDecidedState(undefined)).toBe(false);
    expect(isDecidedState(state({ found: false }))).toBe(false);
    expect(isDecidedState(state({ decisionState: null }))).toBe(false);
  });

  /* undo is the decision that REOPENS a record. Core reflects this itself, but
     a contradictory pair must not resolve in the hiding direction. */
  it("shows a proposal whose latest decision is an undo", () => {
    expect(isDecidedState(state({ decision: "undo" }))).toBe(false);
  });
});

describe("aggregateDecisionStates", () => {
  const ok = (map: Record<string, Partial<ProposalDecisionState>>) => ({
    isPending: false,
    isError: false,
    data: new Map(Object.entries(map).map(([id, s]) => [id, state({ proposalId: id, ...s })])),
  });

  /* The reason each batch is its own query: a batch that fails costs only its
     own ids their answers, and the batch beside it still hides what it can. */
  it("keeps a successful batch's answers when a sibling batch fails", () => {
    const r = aggregateDecisionStates(
      [[PROP_A], [PROP_B]],
      [ok({ [PROP_A]: {} }), { isPending: false, isError: true }],
      [],
    );
    expect([...r.decidedIds]).toEqual([PROP_A]);
    expect(r.unansweredIds).toEqual([PROP_B]);
    expect(r.isError).toBe(true);
  });

  /* A row can come back and still say nothing usable. Counting it as a clean
     "not decided" is how an OVERCOUNT gets presented as an exact figure. */
  it("counts a row with no usable answer as unanswered, not as pending work it is sure about", () => {
    const r = aggregateDecisionStates(
      [[PROP_A, PROP_B, PI_A]],
      [
        ok({
          [PROP_A]: { found: false },
          [PROP_B]: { decisionState: null },
          [PI_A]: { decisionState: "decided", decision: "undo" },
        }),
      ],
      [],
    );
    expect(r.decidedIds.size).toBe(0);
    expect(r.unansweredIds).toEqual([PROP_A, PROP_B, PI_A].sort());
    /* Still parsed and kept, so a caller can show what core did say. */
    expect(r.states.size).toBe(3);
  });

  it("does not count a clear pending answer as a gap", () => {
    const r = aggregateDecisionStates(
      [[PROP_A]],
      [ok({ [PROP_A]: { decisionState: "pending", decision: null, status: "pending" } })],
      [],
    );
    expect(r.unansweredIds).toEqual([]);
    expect(r.decidedIds.size).toBe(0);
    expect(r.isError).toBe(false);
  });

  /* An in-flight batch is not a gap. Narrating "couldn't confirm" while the
     request is still open is its own wrong answer, and it would flash on
     every load. */
  it("reports a batch still in flight as loading, not as unanswered", () => {
    const r = aggregateDecisionStates([[PROP_A]], [{ isPending: true, isError: false }], []);
    expect(r.isLoading).toBe(true);
    expect(r.unansweredIds).toEqual([]);
    expect(r.isError).toBe(false);
  });

  it("carries ids the endpoint could not be asked about through as gaps", () => {
    const r = aggregateDecisionStates([[PROP_A]], [ok({ [PROP_A]: {} })], ["prop_example"]);
    expect(r.decidedIds.has(PROP_A)).toBe(true);
    expect(r.unansweredIds).toEqual(["prop_example"]);
  });

  it("reports nothing to ask about as neither loading nor failed", () => {
    const r = aggregateDecisionStates([], [], []);
    expect(r).toMatchObject({ isLoading: false, isError: false, unansweredIds: [] });
    expect(r.decidedIds.size).toBe(0);
  });

  /* An id in the batch that the response never mentioned. The endpoint
     promises one row per requested id, so this is core breaking its contract —
     and the safe reading of a broken contract is "no answer". */
  it("treats an id missing from the response as a gap", () => {
    const r = aggregateDecisionStates([[PROP_A, PROP_B]], [ok({ [PROP_A]: {} })], []);
    expect(r.unansweredIds).toEqual([PROP_B]);
    expect(r.decidedIds.has(PROP_B)).toBe(false);
  });
});

describe("isDecisionStateBatchFor", () => {
  const key = (batch: string[]) => [DECISION_STATES_QUERY_KEY, batch] as const;

  it("matches only the batch holding the decided proposal", () => {
    expect(isDecisionStateBatchFor(key([PROP_A, PROP_B]), PROP_A)).toBe(true);
    expect(isDecisionStateBatchFor(key([PI_A]), PROP_A)).toBe(false);
  });

  /* The regression this exists to catch: matching on the key PREFIX re-POSTs
     every batch on screen after every decision — fifty requests on a large
     inbox, and nothing in the UI shows it. */
  it("does not match a sibling batch just because the key prefix is the same", () => {
    const siblings = [key([PROP_A]), key([PROP_B]), key([PI_A])];
    expect(siblings.filter((k) => isDecisionStateBatchFor(k, PROP_B))).toHaveLength(1);
  });

  it("ignores other queries entirely", () => {
    expect(isDecisionStateBatchFor(["/api/brain/proposals", PROP_A], PROP_A)).toBe(false);
    expect(isDecisionStateBatchFor([DECISION_STATES_QUERY_KEY, PROP_A], PROP_A)).toBe(false);
  });
});
