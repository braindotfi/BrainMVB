import { describe, it, expect } from "vitest";
import {
  parseMissingEvidence,
  missingEvidenceItems,
  describeMissingEvidence,
  refKindLabel,
  humanizeField,
  MISSING_EVIDENCE_ACTION,
} from "./agentRunInput";
import type { BrainAuditEvent } from "./brainAudit";

function event(over: Partial<BrainAuditEvent> = {}): BrainAuditEvent {
  return {
    id: "evt_1",
    tenant_id: "tnt_1",
    layer: "agents",
    actor: "agent",
    action: MISSING_EVIDENCE_ACTION,
    inputs: {},
    outputs: {},
    policy_version: null,
    event_hash: "h",
    prev_event_hash: null,
    created_at: "2026-08-09T10:00:00.000Z",
    ...over,
  };
}

describe("parseMissingEvidence — which events become rows", () => {
  it("ignores every other audit action", () => {
    expect(parseMissingEvidence(event({ action: "payment_intent.created" }))).toBeNull();
  });

  it("refuses a row that cannot say what is missing", () => {
    // A row saying an agent stopped for no stated reason is an alert nobody can act on.
    expect(parseMissingEvidence(event({ outputs: { missing_required_evidence: [] } }))).toBeNull();
    expect(parseMissingEvidence(event({ outputs: {} }))).toBeNull();
  });

  it("reads the payload whether it rides in outputs or inputs", () => {
    // The passthrough hands brain-core's payload over unnormalized; which bag a
    // key lands in is not pinned by any contract this repo can see.
    const fromOutputs = parseMissingEvidence(event({ outputs: { missing_required_evidence: ["payment_destination"], run_id: "run_a" } }));
    const fromInputs = parseMissingEvidence(event({ inputs: { missing_required_evidence: ["payment_destination"], run_id: "run_b" } }));
    expect(fromOutputs?.runId).toBe("run_a");
    expect(fromInputs?.runId).toBe("run_b");
    expect(fromInputs?.missingFields).toEqual(["payment_destination"]);
  });

  it("degrades a missing optional field to null instead of dropping the row", () => {
    const item = parseMissingEvidence(event({ outputs: { missing_required_evidence: ["balance"] } }));
    expect(item).not.toBeNull();
    expect(item?.runId).toBeNull();
    expect(item?.attemptedAction).toBeNull();
    expect(item?.entityRefs).toEqual([]);
  });
});

describe("parseMissingEvidence — entity refs", () => {
  const withRefs = (refs: unknown) =>
    parseMissingEvidence(event({ outputs: { missing_required_evidence: ["balance"], entity_refs: refs } }))?.entityRefs;

  it("accepts a list of ids", () => {
    expect(withRefs(["cp_01K", "obl_02K"])).toEqual(["cp_01K", "obl_02K"]);
  });

  it("accepts a single id sent as a bare string", () => {
    expect(withRefs("cp_01K")).toEqual(["cp_01K"]);
  });

  it("accepts the {kind, ref} object shape this feed uses elsewhere", () => {
    expect(withRefs([{ kind: "counterparty", ref: "cp_01K" }, { kind: "obligation", ref: "obl_02K" }]))
      .toEqual(["cp_01K", "obl_02K"]);
  });

  it("ignores entries it cannot read rather than rendering junk", () => {
    expect(withRefs(["cp_01K", null, 42, {}, { ref: "" }])).toEqual(["cp_01K"]);
  });
});

describe("missingEvidenceItems", () => {
  it("keeps only usable rows and orders them newest first", () => {
    const items = missingEvidenceItems([
      event({ id: "old", created_at: "2026-08-01T00:00:00.000Z", outputs: { missing_required_evidence: ["balance"] } }),
      event({ id: "other", action: "wiki.question" }),
      event({ id: "new", created_at: "2026-08-08T00:00:00.000Z", outputs: { missing_required_evidence: ["balance"] } }),
      event({ id: "unusable", outputs: { missing_required_evidence: [] } }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["new", "old"]);
  });

  it("handles an absent feed without throwing", () => {
    expect(missingEvidenceItems(null)).toEqual([]);
    expect(missingEvidenceItems(undefined)).toEqual([]);
  });
});

describe("describeMissingEvidence — the plain-language sentence", () => {
  const item = (over: Partial<Parameters<typeof describeMissingEvidence>[0]>) => ({
    id: "e",
    runId: null,
    attemptedAction: null,
    triggerEvent: null,
    missingFields: ["payment_destination"],
    entityRefs: [],
    createdAt: "2026-08-09T00:00:00.000Z",
    ...over,
  });

  it("reads as a sentence about the work, not a field dump", () => {
    const s = describeMissingEvidence(item({ attemptedAction: "payment.execute" }));
    expect(s).toBe("Brain tried to pay this bill but couldn't find a payment destination.");
    // The raw field name must not be the primary text.
    expect(s).not.toContain("payment_destination");
  });

  it("names the raw action rather than inventing a verb for one it doesn't know", () => {
    const s = describeMissingEvidence(item({ attemptedAction: "novel.workflow" }));
    expect(s).toBe("Brain tried to run novel.workflow but couldn't find a payment destination.");
  });

  it("still says something useful when even the action is absent", () => {
    expect(describeMissingEvidence(item({}))).toBe("Brain stopped an action because it couldn't find a payment destination.");
  });

  it("joins several missing fields readably", () => {
    const s = describeMissingEvidence(item({ attemptedAction: "payment.execute", missingFields: ["payment_destination", "tax_id"] }));
    expect(s).toContain("a payment destination and a tax ID");
    const three = describeMissingEvidence(item({ missingFields: ["amount", "due_date", "tax_id"] }));
    expect(three).toContain("an amount, a due date and a tax ID");
  });

  it("de-underscores an unknown field instead of guessing what it means", () => {
    expect(humanizeField("shipping_address")).toBe("shipping address");
    expect(humanizeField("payment_destination")).toBe("a payment destination");
  });
});

describe("refKindLabel", () => {
  it("labels the id kinds brain-core emits", () => {
    expect(refKindLabel("cp_01K")).toBe("Counterparty");
    expect(refKindLabel("obl_01K")).toBe("Obligation");
    expect(refKindLabel("inv_01K")).toBe("Invoice");
    expect(refKindLabel("txn_01K")).toBe("Transaction");
  });

  it("falls back to a neutral word for an unknown prefix", () => {
    expect(refKindLabel("zzz_01K")).toBe("Reference");
    expect(refKindLabel("nonsense")).toBe("Reference");
  });
});
