/* Members and approval-authority types + formatters (client mirror of the brain-core
   shapes the BFF relays from GET/POST/PATCH/DELETE /api/brain/members and
   /api/brain/approval-policy). Enforcement is CORE-ONLY — these are for rendering and
   admin conveniences; core's response is always the final word. */

export type MemberRole = "admin" | "approver" | "viewer";
export type ApprovalDomain = "ap" | "ar" | "treasury" | "payroll" | "reconciliation";

export interface MemberApproval {
  domains: ApprovalDomain[];
  /** Whole-currency per-item limit. Core returns ~9.2e18 (int64 max) for "unlimited". */
  perItemLimit: number;
  requiresSecondApproverAbove: number | null;
}

export interface BrainMember {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: MemberRole;
  active: boolean;
  approval: MemberApproval;
  identityLinks?: Array<{ id?: string; provider?: string; subject?: string }> | null;
  /** Production tenancy: "invited" until the invitee consumes their invite; then "active". */
  status?: "invited" | "active" | "deactivated" | string;
}

/** True while a member has been invited but hasn't accepted yet (production tenancy).
 *  Explicit core status ONLY — no heuristics (demo-tenant members often carry no
 *  identityLinks and must never render as "Invited"). */
export function isInvitedPending(m: BrainMember): boolean {
  return m.status === "invited";
}

export interface ListMembersResponse {
  members: BrainMember[];
}

export interface MemberMutationResponse {
  member: BrainMember;
  audit_id?: string;
}

/** Derived facts for the Member Detail "locked rows" (read from core's policy, never hardcoded). */
export interface ApprovalPolicyFacts {
  selfApprovalBlocked: true;
  secondApprovalThreshold: { value: string; currency: string } | null;
}

/** Anything at/above this is treated as "unlimited" (core's int64-max sentinel). */
const UNLIMITED_FLOOR = 1e15;

export function isUnlimited(limit: number): boolean {
  return limit >= UNLIMITED_FLOOR;
}

/** "$10,000" / "$2,500" — whole-dollar, grouped. */
export function formatLimit(limit: number, currency = "USD"): string {
  if (isUnlimited(limit)) return "no limit";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(limit);
  } catch {
    return `$${Math.round(limit).toLocaleString("en-US")}`;
  }
}

/** "$50,000" from the policy threshold's string value. */
export function formatThreshold(t: { value: string; currency: string }): string {
  const n = Number(t.value);
  if (Number.isFinite(n)) return formatLimit(n, t.currency);
  return `${t.currency} ${t.value}`;
}

const DOMAIN_LABELS: Record<ApprovalDomain, string> = {
  ap: "AP",
  ar: "AR",
  treasury: "Treasury",
  payroll: "Payroll",
  reconciliation: "Reconciliation",
};

export function domainLabel(d: ApprovalDomain): string {
  return DOMAIN_LABELS[d] ?? d;
}

/** "AP + Payroll" (or "No domains") — the domains half of the envelope line. */
export function domainsSummary(domains: ApprovalDomain[]): string {
  if (!domains.length) return "No domains";
  return domains.map(domainLabel).join(" + ");
}

/** "AP + Payroll · up to $10,000" — the one-line envelope shown on member rows. */
export function envelopeLine(approval: MemberApproval, currency = "USD"): string {
  const limit = isUnlimited(approval.perItemLimit)
    ? "no per-item limit"
    : `up to ${formatLimit(approval.perItemLimit, currency)}`;
  return `${domainsSummary(approval.domains)} · ${limit}`;
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  approver: "Approver",
  viewer: "Viewer",
};
