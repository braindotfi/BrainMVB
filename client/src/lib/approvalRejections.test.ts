import { describe, it, expect } from "vitest";
import { mapApprovalRejection, type CoreErrorBody } from "./approvalRejections";

/**
 * Invariant #4 (REJECTION MAPPING): approvalRejections maps every brain-core
 * approval failure to user copy. The two `self_approval_blocked` cases MUST split
 * on `details.payee_unresolved`, and unknown reasons MUST fall through to the
 * generic message while preserving the raw reason. This is the platform-side twin
 * of core's approval invariants: it may not silently collapse the two self-approval
 * cases, and it may not invent a happy path for a reason it doesn't recognize.
 */

function body(code: string, details?: Record<string, unknown>, message?: string): CoreErrorBody {
  return { error: { code, message, details: details ?? null } };
}

describe("mapApprovalRejection", () => {
  it("splits self_approval_blocked: payee_unresolved renders the 'couldn't verify the recipient' message, NOT the 'yourself' one", () => {
    const unresolved = mapApprovalRejection(body("self_approval_blocked", { payee_unresolved: true }));
    expect(unresolved.reason).toBe("self_approval_blocked:payee_unresolved");
    expect(unresolved.detail).toMatch(/can't match this payee|resolve the payee/i);
    // It must NOT be the true-self-approval copy.
    expect(unresolved.detail).not.toMatch(/this payment is to you/i);
  });

  it("splits self_approval_blocked: true self-approval (no payee_unresolved) renders the 'yourself' message", () => {
    const selfApproval = mapApprovalRejection(body("self_approval_blocked", { payee_unresolved: false }));
    expect(selfApproval.reason).toBe("self_approval_blocked");
    expect(selfApproval.title).toMatch(/your own payment/i);
    expect(selfApproval.detail).toMatch(/this payment is to you/i);
    // And absent the flag entirely it is still the true self-approval case.
    const noFlag = mapApprovalRejection(body("self_approval_blocked"));
    expect(noFlag.reason).toBe("self_approval_blocked");
  });

  it("maps every known reason to a non-empty, distinct sentence", () => {
    const known = [
      "actor_limit_exceeded",
      "domain_not_authorized",
      "second_approver_required",
      "requires_second_approver",
      "actor_unresolved",
      "auth_scope_insufficient",
      "approval_signer_revoked",
      "last_admin_protected",
    ];
    for (const code of known) {
      const r = mapApprovalRejection(body(code));
      expect(r.title.length, `title for ${code}`).toBeGreaterThan(0);
      expect(r.detail.length, `detail for ${code}`).toBeGreaterThan(0);
      // A known reason must NEVER fall through to the generic "Approval failed".
      expect(r.title, `known reason ${code} fell through to generic`).not.toBe("Approval failed");
    }
    // The two "second approver" aliases collapse to one stable reason key.
    expect(mapApprovalRejection(body("second_approver_required")).reason).toBe("second_approver_required");
    expect(mapApprovalRejection(body("requires_second_approver")).reason).toBe("second_approver_required");
  });

  it("reads `reason` from details in preference to code", () => {
    const r = mapApprovalRejection(body("some_http_code", { reason: "domain_not_authorized" }));
    expect(r.reason).toBe("domain_not_authorized");
  });

  it("falls through to the generic message for an unknown reason, preserving the raw reason", () => {
    const r = mapApprovalRejection(body("brand_new_reason_core_added", undefined, "Core says no."));
    expect(r.reason).toBe("brand_new_reason_core_added");
    expect(r.title).toBe("Approval failed");
    // The core-supplied message is surfaced verbatim when present.
    expect(r.detail).toBe("Core says no.");
  });

  it("degrades safely when there is no body at all", () => {
    const r = mapApprovalRejection(undefined);
    expect(r.reason).toBe("approval_failed");
    expect(r.title).toBe("Approval failed");
    expect(r.detail.length).toBeGreaterThan(0);
  });
});
