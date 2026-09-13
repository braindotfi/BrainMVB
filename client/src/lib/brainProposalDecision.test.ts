import { describe, it, expect } from "vitest";
import { AWAITING_STATUSES, parseDecisionResult } from "./brainProposals";

/**
 * A decision response is the only evidence the UI has that an approval landed.
 * It is what writes the receipt, shows the confirmation toast, and puts the row
 * into Resolved — so a body we cannot actually read, or one that is not about
 * the proposal we decided, must not be allowed to do any of those things on the
 * strength of a 2xx status alone. That is what the previous unchecked cast did.
 */
describe("parseDecisionResult", () => {
  it("accepts a well-formed confirmation", () => {
    expect(
      parseDecisionResult(
        { id: "prop_1", decision: "approve", status: "approved", audit_id: "aud_1", payment_intent_id: "pi_1" },
        "approve",
        "prop_1",
      ),
    ).toEqual({
      id: "prop_1",
      decision: "approve",
      status: "approved",
      audit_id: "aud_1",
      payment_intent_id: "pi_1",
    });
  });

  it("accepts a confirmation that omits the decision echo", () => {
    /* Core has not always sent one back. Absence is not a contradiction. */
    const result = parseDecisionResult({ id: "prop_1", status: "approved" }, "approve", "prop_1");
    expect(result?.decision).toBe("approve");
    expect(result?.audit_id).toBeNull();
    expect(result?.payment_intent_id).toBeNull();
  });

  it("refuses a body that confirms a DIFFERENT decision than the one submitted", () => {
    /* The dangerous case: the operator clicks Decline, core reports an
       approval. Anything other than a refusal here shows a confirmation for an
       outcome that did not happen. */
    expect(
      parseDecisionResult({ id: "prop_1", decision: "approve", status: "approved" }, "reject", "prop_1"),
    ).toBeNull();
  });

  it("refuses a body that is about a DIFFERENT proposal", () => {
    /* Otherwise the row the operator clicked gets a receipt and a green toast
       on the strength of some other proposal's outcome. */
    expect(
      parseDecisionResult({ id: "prop_other", decision: "approve", status: "approved" }, "approve", "prop_1"),
    ).toBeNull();
  });

  it("refuses an empty body", () => {
    expect(parseDecisionResult(undefined, "approve", "prop_1")).toBeNull();
    expect(parseDecisionResult(null, "approve", "prop_1")).toBeNull();
    expect(parseDecisionResult("", "approve", "prop_1")).toBeNull();
  });

  it("refuses a body with no proposal id or no status", () => {
    expect(parseDecisionResult({ status: "approved" }, "approve", "prop_1")).toBeNull();
    expect(parseDecisionResult({ id: "prop_1" }, "approve", "prop_1")).toBeNull();
    expect(parseDecisionResult({ id: "", status: "approved" }, "approve", "prop_1")).toBeNull();
  });

  it("keeps an awaiting-second-approver status intact instead of flattening it to approved", () => {
    /* The Inbox words this outcome differently: the approval is recorded but
       the item is not finished, and saying "Approved" would claim it is. */
    const result = parseDecisionResult(
      { id: "prop_1", decision: "approve", status: "awaiting_second_approval" },
      "approve",
      "prop_1",
    );
    expect(result?.status).toBe("awaiting_second_approval");
  });

  it("refuses a status that contradicts the submitted decision", () => {
    /* The verb can agree while the status does not. Trusting the verb alone
       shows "Approved" for a body that says the proposal was rejected. */
    expect(
      parseDecisionResult({ id: "prop_1", decision: "approve", status: "rejected" }, "approve", "prop_1"),
    ).toBeNull();
    expect(parseDecisionResult({ id: "prop_1", status: "declined" }, "approve", "prop_1")).toBeNull();
    expect(parseDecisionResult({ id: "prop_1", status: "approved" }, "reject", "prop_1")).toBeNull();
    expect(parseDecisionResult({ id: "prop_1", status: "executed" }, "reject", "prop_1")).toBeNull();
  });

  it("is case-insensitive about the status it refuses", () => {
    expect(parseDecisionResult({ id: "prop_1", status: "REJECTED" }, "approve", "prop_1")).toBeNull();
  });

  it("accepts a status it does not recognise", () => {
    /* Core's status vocabulary grows. Refusing an unrecognised value would
       reject a decision that actually landed and tell the user it failed. */
    expect(
      parseDecisionResult({ id: "prop_1", status: "queued_for_settlement" }, "approve", "prop_1")?.status,
    ).toBe("queued_for_settlement");
  });

  it("lists the statuses that mean the item is recorded but NOT finished", () => {
    /* These skip the receipt entirely: a receipt would move the row into
       Resolved while a second approver still has to act on it. */
    expect(AWAITING_STATUSES.has("pending")).toBe(true);
    expect(AWAITING_STATUSES.has("awaiting_second_approval")).toBe(true);
    expect(AWAITING_STATUSES.has("approved")).toBe(false);
  });

  it("normalises absent or blank optional ids to null rather than empty strings", () => {
    /* An empty-string audit id would be stored on the receipt and then compared
       against the audit feed, where it can never match — a reconciliation key
       that silently never fires. */
    const result = parseDecisionResult(
      { id: "prop_1", status: "approved", audit_id: "", payment_intent_id: null },
      "approve",
      "prop_1",
    );
    expect(result?.audit_id).toBeNull();
    expect(result?.payment_intent_id).toBeNull();
  });
});
