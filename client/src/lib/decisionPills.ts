/* ── Decision outcome pills ──────────────────────────────────────────────────
   The single source of truth for the settled-outcome pill: the capsule shown
   on the right of a decided row in the Inbox's Resolved tab, and in the hero
   of the audit record popup for that same decision.

   These two surfaces render the SAME decision, so they must render the SAME
   pill. Keeping the palette here (rather than in whichever page happened to
   need it first) is what stops one of them being restyled on its own.

   Figma nodes 6214-69210 / 69233 / 69246 / 69258 / 69270. All settled pills
   use 60% opacity on both bg and text so the purple-tinted row shows through;
   Pending uses a lighter frosted-white with 40% text. */

import type { AuditEventType } from "./auditTypes";

/** Right-side outcome pill for settled / decided rows.
 *
 *  When this is set a row renders the pill instead of action buttons — the
 *  outcome is final so there is nothing to act on. The three icon variants map
 *  to the three semantic outcomes (done-positive, done-negative, in-progress).
 */
export interface TierRowStatusPill {
  label: string;
  /** Background of the pill capsule, e.g. "#123509" or "rgba(255,255,255,0.3)". */
  bg: string;
  /** Text + icon stroke colour. */
  textColor: string;
  /** Semantic shape: checkmark (approved/acknowledged), X (rejected), clock (pending). */
  icon: "check" | "x" | "pending";
}

export const PILL_APPROVED: TierRowStatusPill = { label: "Approved",      bg: "rgba(18,53,9,0.6)",       textColor: "rgba(66,191,35,0.6)",   icon: "check"   };
export const PILL_AUTO:     TierRowStatusPill = { label: "Auto-Approved", bg: "rgba(18,53,9,0.6)",       textColor: "rgba(66,191,35,0.6)",   icon: "check"   };
export const PILL_REJECTED: TierRowStatusPill = { label: "Rejected",      bg: "rgba(53,0,17,0.6)",       textColor: "rgba(210,3,68,0.6)",    icon: "x"       };
export const PILL_ACKED:    TierRowStatusPill = { label: "Acknowledged",  bg: "rgba(18,53,9,0.6)",       textColor: "rgba(66,191,35,0.6)",   icon: "check"   };
export const PILL_PENDING:  TierRowStatusPill = { label: "Pending",       bg: "rgba(255,255,255,0.15)",  textColor: "rgba(255,255,255,0.4)", icon: "pending" };

/** Map a brain-core audit event type to its outcome pill.
 *
 *  Returns undefined for event types that are NOT a settled decision
 *  (rule_change, trust_granted, system_activity): those have no outcome to
 *  report, so they must not borrow an outcome pill's vocabulary. Callers fall
 *  back to their own neutral chip. */
export function auditStatusPill(eventType: AuditEventType): TierRowStatusPill | undefined {
  switch (eventType) {
    case "approved":      return PILL_APPROVED;
    case "auto_approved": return PILL_AUTO;
    case "rejected":
    case "flagged":
    case "trust_revoked": return PILL_REJECTED;
    case "acknowledged":  return PILL_ACKED;
    case "postponed":     return PILL_PENDING;
    default:              return undefined;
  }
}
