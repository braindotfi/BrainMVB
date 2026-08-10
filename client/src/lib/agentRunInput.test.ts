import { describe, it, expect } from "vitest";
import {
  parseMissingEvidence,
  missingEvidenceItems,
  describeMissingEvidence,
  refKindLabel,
  humanizeField,
  MISSING_EVIDENCE_ACTION,
  agentKeyFromAction,
  buildInputRowTitle,
  buildInputRowSubtitle,
  inputRowActionLabel,
  inputRowFixPath,
  type MissingEvidenceItem,
} from "./agentRunInput";
import { agentBadgeLabel } from "./agentProposals";
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

/* ── helpers shared by the row-rendering suites ─────────────────────────── */

/** Minimal valid MissingEvidenceItem for the row-rendering helpers. */
function inputItem(over: Partial<MissingEvidenceItem> = {}): MissingEvidenceItem {
  return {
    id: "evt_a",
    runId: "run_01ABC",
    attemptedAction: "vendor_risk.assess",
    triggerEvent: null,
    missingFields: ["counterparty"],
    entityRefs: ["cp_brightline"],
    createdAt: "2026-08-09T10:00:00.000Z",
    ...over,
  };
}

describe("agentKeyFromAction — maps brain-core action strings to badge keys", () => {
  it("returns the correct key for every known action", () => {
    expect(agentKeyFromAction("vendor_risk.assess")).toBe("vendor_risk");
    expect(agentKeyFromAction("payment.execute")).toBe("payment");
    expect(agentKeyFromAction("payment.schedule")).toBe("payment");
    expect(agentKeyFromAction("collections.remind")).toBe("collections");
    expect(agentKeyFromAction("reconciliation.match")).toBe("reconciliation");
    expect(agentKeyFromAction("treasury.sweep")).toBe("treasury");
    expect(agentKeyFromAction("fraud.review")).toBe("fraud_anomaly");
    expect(agentKeyFromAction("cash_forecast.project")).toBe("cash_forecast");
  });

  it("falls back to the first segment for an unknown action", () => {
    // e.g. a new brain-core action "bill_management.approve" degrades gracefully.
    expect(agentKeyFromAction("bill_management.approve")).toBe("bill_management");
  });

  it("returns a safe default when the action is absent", () => {
    expect(agentKeyFromAction(null)).toBe("agent");
  });

  it("the key feeds into agentBadgeLabel to produce a named badge — never 'Agent blocked'", () => {
    // This is the end-to-end property the Inbox relies on: the pipeline
    // agentKeyFromAction → agentBadgeLabel must produce a named label for every
    // known action type, not the previous hardcoded "Agent blocked" string.
    expect(agentBadgeLabel(agentKeyFromAction("vendor_risk.assess"))).toBe("Vendor Risk Agent");
    expect(agentBadgeLabel(agentKeyFromAction("payment.execute"))).toBe("Payment Agent");
    expect(agentBadgeLabel(agentKeyFromAction("collections.remind"))).toBe("Collections Agent");
    expect(agentBadgeLabel(agentKeyFromAction("reconciliation.match"))).toBe("Reconciliation Agent");
    expect(agentBadgeLabel(agentKeyFromAction("treasury.sweep"))).toBe("Treasury Agent");
    expect(agentBadgeLabel(agentKeyFromAction("fraud.review"))).toBe("Fraud and Anomaly Agent");
    expect(agentBadgeLabel(agentKeyFromAction("cash_forecast.project"))).toBe("Cash Forecasting Agent");

    // The OLD behaviour was a static "Agent blocked" string — confirm it never appears.
    const labels = [
      "vendor_risk.assess",
      "payment.execute",
      "collections.remind",
      "reconciliation.match",
      "treasury.sweep",
      "fraud.review",
      "cash_forecast.project",
    ].map((a) => agentBadgeLabel(agentKeyFromAction(a)));
    for (const label of labels) {
      expect(label).not.toBe("Agent blocked");
    }
  });
});

describe("buildInputRowTitle — distinct counterparty names for different runs", () => {
  const nameMap = new Map([["cp_brightline", "Brightline Systems Inc."]]);

  it("vendor_risk run names the real counterparty from entity_refs", () => {
    const title = buildInputRowTitle(inputItem(), nameMap);
    expect(title).toBe("Vendor risk check blocked — couldn't classify Brightline Systems Inc. as a vendor");
    expect(title[0]).toBe(title[0].toUpperCase());
    expect(title).not.toMatch(/Vendor Risk|Vendor risk Check/);
  });

  it("collections run names the counterparty and field", () => {
    const title = buildInputRowTitle(
      inputItem({
        attemptedAction: "collections.remind",
        missingFields: ["contact_email"],
        entityRefs: ["cp_brightline"],
      }),
      nameMap,
    );
    expect(title).toContain("Brightline Systems Inc.");
    expect(title).toContain("contact email");
  });

  it("two runs of the same agent type with different counterparties produce different titles", () => {
    // This is the core regression the template fix addresses: before entity_refs
    // were read, all vendor_risk rows rendered identically and looked like
    // duplicates.
    const brightlineTitle = buildInputRowTitle(inputItem(), nameMap);
    const acmeTitle = buildInputRowTitle(
      inputItem({ entityRefs: ["cp_acme"] }),
      nameMap,
    );
    expect(brightlineTitle).not.toBe(acmeTitle);
    expect(brightlineTitle).toContain("Brightline Systems Inc.");
    expect(acmeTitle).toContain("cp_acme");
  });

  it("falls back to the raw id (not a generic sentence) when the cp_ is not in the map", () => {
    const title = buildInputRowTitle(
      inputItem({ entityRefs: ["cp_unknown_99"] }),
      nameMap,
    );
    // Raw id is more informative than a sentence that matches every run.
    expect(title).toContain("cp_unknown_99");
  });

  it("non-cp agent types (reconciliation, treasury, …) degrade without a counterparty gracefully", () => {
    const recon = buildInputRowTitle(
      inputItem({ attemptedAction: "reconciliation.match", missingFields: ["transaction_record"], entityRefs: [] }),
      nameMap,
    );
    expect(recon).toContain("Transaction matching blocked");

    const treasury = buildInputRowTitle(
      inputItem({ attemptedAction: "treasury.sweep", missingFields: ["balance"], entityRefs: [] }),
      nameMap,
    );
    expect(treasury).toContain("Treasury action blocked");
  });
});

describe("buildInputRowSubtitle — three-part subtitle with real entity name", () => {
  const nameMap = new Map([["cp_brightline", "Brightline Systems Inc."]]);

  it("starts with the resolved counterparty name when a cp_ ref is present", () => {
    const subtitle = buildInputRowSubtitle(inputItem(), nameMap);
    expect(subtitle).toContain("Brightline Systems Inc.");
  });

  it("omits the entity segment entirely when no refs exist", () => {
    const subtitle = buildInputRowSubtitle(
      inputItem({ entityRefs: [], runId: null, triggerEvent: null }),
      nameMap,
    );
    // Only the Missing segment remains — no leading '·'
    expect(subtitle).toBe("Missing: counterparty details");
  });
});

describe("inputRowActionLabel — field-specific labels, never a static 'Resolve'", () => {
  // The previous behaviour was a static "Resolve" button label regardless of
  // what field was missing. Each known field type now maps to an actionable label.
  const knownFields: Array<[string, string]> = [
    ["counterparty",        "Add Vendor"],
    ["tax_id",              "Add Tax ID"],
    ["contact_email",       "Add Contact Email"],
    ["payment_destination", "Add Payment Info"],
    ["invoice",             "Link Invoice"],
    ["balance",             "Refresh Account Balance"],
    ["account_balance",     "Refresh Account Balance"],
    ["bank_account",        "Add Banking Info"],
    ["payment_method",      "Add Payment Method"],
    ["transaction_record",  "Find Transaction"],
    ["transaction",         "Find Transaction"],
  ];

  it.each(knownFields)("field '%s' → '%s' (not 'Resolve')", (field, expected) => {
    expect(inputRowActionLabel(field)).toBe(expected);
    expect(inputRowActionLabel(field)).not.toBe("Resolve");
  });

  it("unknown field falls back to 'Resolve'", () => {
    // A completely unknown field still gets a button; the fallback is honest.
    expect(inputRowActionLabel("some_new_field")).toBe("Resolve");
  });

  it("absent field (undefined) falls back to 'Resolve'", () => {
    expect(inputRowActionLabel(undefined)).toBe("Resolve");
  });
});

/* ── inputRowFixPath routing ─────────────────────────────────────────────── */

/** Minimal MissingEvidenceItem for routing tests — no entity refs by default. */
function makeItem(field: string, entityRefs: string[] = []): MissingEvidenceItem {
  return {
    id: "evt_test",
    runId: null,
    attemptedAction: null,
    triggerEvent: null,
    missingFields: [field],
    entityRefs,
    createdAt: "2026-08-09T10:00:00.000Z",
  };
}

describe("inputRowFixPath — navigation path per missing field", () => {
  it("routes bank_account to the Sources settings page (where banks are linked)", () => {
    expect(inputRowFixPath(makeItem("bank_account"))).toBe("/settings?section=sources");
  });

  it("routes payment_method to the Billing settings page (where cards are added)", () => {
    expect(inputRowFixPath(makeItem("payment_method"))).toBe("/settings?section=billing");
  });

  it("routes transaction fields to the Cash Flow ledger tab", () => {
    expect(inputRowFixPath(makeItem("transaction_record"))).toBe("/ledger?tab=cash-flow");
    expect(inputRowFixPath(makeItem("transaction"))).toBe("/ledger?tab=cash-flow");
  });

  it("routes counterparty fields to the counterparties tab (deep-links when a cp_ ref is present)", () => {
    expect(inputRowFixPath(makeItem("counterparty"))).toBe("/ledger?tab=counterparties");
    expect(inputRowFixPath(makeItem("counterparty", ["cp_abc"]))).toBe("/ledger?tab=counterparties&vendor=cp_abc");
  });

  it("routes invoice to payables", () => {
    expect(inputRowFixPath(makeItem("invoice"))).toBe("/ledger?tab=payables");
  });

  it("routes balance fields to the accounts tab", () => {
    expect(inputRowFixPath(makeItem("balance"))).toBe("/ledger?tab=accounts");
    expect(inputRowFixPath(makeItem("account_balance"))).toBe("/ledger?tab=accounts");
  });

  it("falls back to audit log for any field not yet confirmed — and the fallback must differ from the banking/transaction routes", () => {
    const fallback = inputRowFixPath(makeItem("completely_unknown_field"));
    expect(fallback).toBe("/settings?section=audit");
    // Guard: the fallback must not equal any of the confirmed destinations
    expect(fallback).not.toBe("/settings?section=sources");
    expect(fallback).not.toBe("/settings?section=billing");
    expect(fallback).not.toBe("/ledger?tab=cash-flow");
  });
});
