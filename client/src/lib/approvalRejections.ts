import { formatLimit } from "./membersApi";

/* Approval rejection reasons - the SINGLE place that turns a brain-core approval
   failure into user-facing copy. Enforcement is CORE-ONLY: we never pre-decide an
   approval can't happen (no client gate); we call core, and if it refuses we render
   the exact reason it returned. Never special-case a 403 into a happy path.

   Core error envelope (relayed verbatim by the BFF as `body`):
     { error: { code, message, details: { reason?, limit?, payee_unresolved?, ... } } }
   `reason` is preferred; when absent we fall back to `code`. */

export interface CoreErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown> | null;
  };
}

export interface ApprovalRejection {
  /** stable key for testids / analytics */
  reason: string;
  /** short human title (danger-tone) */
  title: string;
  /** one-line explanation shown under the title */
  detail: string;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Pull the core error body out of whatever the fetch layer produced. */
export function parseCoreError(input: unknown): CoreErrorBody | undefined {
  if (!input) return undefined;
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    // BFF relay shape: { error:"brain_upstream_error", status, body:{ error:{...} } }
    if (obj.body && typeof obj.body === "object") return obj.body as CoreErrorBody;
    if (obj.error && typeof obj.error === "object") return obj as CoreErrorBody;
  }
  if (typeof input === "string") {
    // apiRequest throws `Error("<status>: <json>")`; try to recover the JSON tail.
    const brace = input.indexOf("{");
    if (brace >= 0) {
      try {
        return parseCoreError(JSON.parse(input.slice(brace)));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/* The complete set of approval rejection reasons. `self_approval_blocked` has TWO
   distinct cases split by `details.payee_unresolved`:
     - payee_unresolved === true  → core couldn't tie the payee to a member, so it
       can't PROVE it isn't a self-approval and refuses (fail-closed).
     - otherwise                  → the approver IS the payee (true self-approval). */
export function mapApprovalRejection(body: CoreErrorBody | undefined): ApprovalRejection {
  const code = body?.error?.code ?? "";
  const details = (body?.error?.details ?? {}) as Record<string, unknown>;
  const reason = (typeof details.reason === "string" && details.reason) || code || "approval_failed";
  const limit = num(details.limit);
  const limitTxt = limit !== undefined ? formatLimit(limit) : "your limit";

  switch (reason) {
    case "self_approval_blocked": {
      if (details.payee_unresolved === true) {
        return {
          reason: "self_approval_blocked:payee_unresolved",
          title: "Payee couldn't be verified",
          detail:
            "Brain core can't match this payee to a team member, so it can't rule out a self-approval. Resolve the payee first, then approve.",
        };
      }
      return {
        reason: "self_approval_blocked",
        title: "You can't approve your own payment",
        detail: "This payment is to you. A different approver has to sign it off.",
      };
    }
    case "actor_limit_exceeded":
      return {
        reason: "actor_limit_exceeded",
        title: "Above your approval limit",
        detail: `This amount is over ${limitTxt}. Someone with a higher limit has to approve it.`,
      };
    case "domain_not_authorized":
      return {
        reason: "domain_not_authorized",
        title: "Outside your authority",
        detail: "You're not authorized to approve payments in this category.",
      };
    case "second_approver_required":
    case "requires_second_approver":
      return {
        reason: "second_approver_required",
        title: "Second approver required",
        detail: "This amount needs a second approver. Your approval is recorded - one more is needed.",
      };
    case "actor_unresolved":
      return {
        reason: "actor_unresolved",
        title: "You're not a recognized approver",
        detail: "Brain core doesn't recognize your account as an approver on this tenant.",
      };
    case "auth_scope_insufficient":
      return {
        reason: "auth_scope_insufficient",
        title: "Not permitted to approve",
        detail: "This session doesn't carry approval authority.",
      };
    case "approval_signer_revoked":
      return {
        reason: "approval_signer_revoked",
        title: "Approval can't be completed",
        detail:
          "Brain core no longer recognizes an active approval signer for this tenant, so the payment can't be signed off. (Demo environments hit this - the authority is real, the signer isn't provisioned.)",
      };
    case "last_admin_protected":
      return {
        reason: "last_admin_protected",
        title: "Can't remove the last admin",
        detail: "Every tenant must keep at least one active admin. Add another admin before deactivating this one.",
      };
    default:
      return {
        reason: reason || "approval_failed",
        title: "Approval failed",
        detail:
          body?.error?.message ||
          "Brain core refused this approval. No changes were made.",
      };
  }
}
