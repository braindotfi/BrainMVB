/**
 * Bulk approve eligibility.
 *
 * Decisions offers a checkbox on rows that can safely be approved together, and a
 * bulk bar once two or more are selected. This module owns the ONLY question that
 * matters — which rows may carry a checkbox — and it is deliberately separate from
 * the page so the rule is testable without rendering anything.
 *
 * ── Where the threshold comes from ───────────────────────────────────────────
 *
 * The brief says to gate on "that type's existing auto-approve threshold (pull
 * from Rules, don't hardcode)". Two rule sources exist, and the obvious reading of
 * that sentence does not survive contact with either:
 *
 *   1. `GET /api/rules` (rulesStore) — the tenant's own authored rules, carrying
 *      `cap` / `threshold`. Returns `[]` on the reference tenant, so on its own it
 *      would mean the feature never appears for anybody.
 *
 *   2. `GET /api/brain/approval-policy` — the tenant's ACTUAL signed policy, which
 *      does carry real per-type amounts.
 *
 * Reading (2)'s literal auto-approve rule would be worse than useless. The live
 * policy's `ap-auto-approved-within` clause auto-executes outbound payments at or
 * under $50,000 *to already-approved vendors*. An outbound payment under $50,000
 * that is nevertheless sitting in the queue is there precisely BECAUSE it failed
 * that clause — its counterparty is not on the approved list, so it fell through to
 * `ap-reject-unapproved`. Gating checkboxes on "under the auto-approve line" would
 * therefore hand a one-click batch approval to exactly the payments the policy
 * singles out as needing scrutiny. That is the opposite of the brief's intent.
 *
 * So the line used here is the one that is meaningful for an item awaiting a
 * decision: the amount above which the tenant's own policy demands MORE THAN ONE
 * approver. Below it, one person's approval is sufficient — which is exactly what a
 * bulk bar is: one person approving several things they could each have approved
 * individually. Above it, a single click cannot stand in for two named signers, so
 * those rows get no checkbox and must be opened and approved one at a time.
 *
 * This never widens what one user may approve. It only batches approvals that were
 * already theirs to make.
 *
 * A user-authored rule (source 1) still counts, and can only ever tighten the line:
 * where both apply the lower wins, matching `thresholdsFromRules`' existing
 * "lowest limit wins" convention.
 */

import type { ApprovalPolicyFacts, PolicyContentRule } from "./brainPolicy";
import { ruleAgentForProposalType, type MaterialityThresholds, type TierableProposal } from "./proposalTiers";
import { proposalAmountValue } from "./proposalTiers";

/**
 * The only `require` value that means one approver is enough.
 *
 * Deliberately an allowlist rather than a denylist of the elevated values. An
 * unrecognised requirement — a clause added to the policy DSL after this shipped —
 * must fall to the safe side and suppress the checkbox, not be assumed harmless.
 * Under-offering bulk approve costs clicks; over-offering it approves money nobody
 * agreed to.
 */
export const SINGLE_SIGNER_REQUIREMENT = "single_signer";

/** Numeric value out of a policy `{value, currency}` amount, or a bare number. */
function policyAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (raw && typeof raw === "object") {
    const v = (raw as { value?: unknown }).value;
    if (typeof v === "string" || typeof v === "number") return policyAmount(v);
  }
  return null;
}

/** True when this clause escalates to more than one approver above some amount. */
function isElevatedConfirm(rule: PolicyContentRule): boolean {
  return rule.execute === "confirm" && rule.require !== SINGLE_SIGNER_REQUIREMENT;
}

/**
 * policy category (`applies_to`) → the amount above which more than one approver
 * is required.
 *
 * On the reference tenant this resolves to roughly
 * `{ outbound_payment: 50000, onchain_tx: 250000, agent_action: 500000 }`,
 * read from the signed document rather than written down here.
 *
 * Where several clauses cover one category the LOWEST wins: it is the first line an
 * amount crosses, so it is the one that governs.
 */
export function elevatedThresholdsFromPolicy(
  facts: ApprovalPolicyFacts | null | undefined,
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const rule of facts?.rules ?? []) {
    if (!rule || !isElevatedConfirm(rule)) continue;
    const limit = policyAmount(rule.when?.["amount.gt"]);
    if (limit == null || limit <= 0) continue;
    for (const category of rule.applies_to ?? []) {
      if (typeof category !== "string" || !category.trim()) continue;
      const key = category.trim();
      out[key] = out[key] == null ? limit : Math.min(out[key], limit);
    }
  }
  return out;
}

/** Which policy category a record falls under. brain-core puts it on
 *  `details.kind` ("agent_action", "outbound_payment", …). */
export function policyCategoryOf(p: TierableProposal): string | null {
  const details = p.details;
  if (!details || typeof details !== "object") return null;
  const kind = (details as { kind?: unknown }).kind;
  return typeof kind === "string" && kind.trim() ? kind.trim() : null;
}

export type BulkLimitSource = "policy" | "rule";

export interface BulkLimit {
  value: number;
  source: BulkLimitSource;
}

/**
 * The binding limit for one record: the lower of its policy category's
 * second-approver line and any active user rule scoped to its type.
 *
 * Null when neither source has a number — no limit means no checkbox, never an
 * assumed one.
 */
export function bulkLimitFor(
  type: string | null | undefined,
  category: string | null | undefined,
  policyLimits: Readonly<Record<string, number>>,
  userThresholds: MaterialityThresholds | undefined,
): BulkLimit | null {
  const policy = category ? policyLimits[category] : undefined;
  const cleanType = typeof type === "string" ? type.trim() : "";
  const rule = cleanType ? userThresholds?.[ruleAgentForProposalType(cleanType)] : undefined;

  const candidates: BulkLimit[] = [];
  if (typeof policy === "number" && Number.isFinite(policy) && policy > 0) {
    candidates.push({ value: policy, source: "policy" });
  }
  if (typeof rule === "number" && Number.isFinite(rule) && rule > 0) {
    candidates.push({ value: rule, source: "rule" });
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((lowest, c) => (c.value < lowest.value ? c : lowest));
}

/** The subset of a decision row bulk approval reads. Structural so the rules below
 *  are testable without building a whole page item. */
export interface BulkCandidate {
  id: string;
  /** Proposal type — "collections". Groups the selection and scopes user rules. */
  type: string | null;
  /** Policy category — "agent_action". Scopes the policy line. */
  category: string | null;
  amount: number | null;
  /** Whether an `approve` this user may actually send is on offer for this row. */
  approvable: boolean;
}

/** Build a candidate from a live proposal. `approvable` stays the caller's call —
 *  only the page knows whether core offered a writable `approve`. */
export function bulkCandidateFrom(
  id: string,
  proposal: TierableProposal,
  approvable: boolean,
): BulkCandidate {
  return {
    id,
    type: typeof proposal.type === "string" ? proposal.type.trim() || null : null,
    category: policyCategoryOf(proposal),
    amount: proposalAmountValue(proposal),
    approvable,
  };
}

/**
 * Whether a row may carry a checkbox.
 *
 * Every condition has to hold. In particular a row with NO amount is never
 * eligible: "we could not read an amount" is not evidence that the amount is small,
 * and treating absent data as safe is the same mistake as reading a failed fetch as
 * an empty queue.
 *
 * The comparison is strict. The policy escalates on `amount.gt`, so an item exactly
 * AT the line still only needs one approver and would qualify — but a user-authored
 * `cap` reads as "clears under this", which excludes it. The two disagree only on
 * the boundary, and excluding it costs one extra click while including it wrongly
 * costs an approval nobody authorised.
 */
export function isBulkEligible(candidate: BulkCandidate, limit: BulkLimit | null): boolean {
  if (!candidate.approvable) return false;
  if (!candidate.type) return false;
  if (candidate.amount == null || !Number.isFinite(candidate.amount)) return false;
  if (limit == null) return false;
  return candidate.amount < limit.value;
}

export interface BulkSelection {
  ids: string[];
  count: number;
  /** The single proposal type every selected row shares. */
  type: string | null;
  /** The lowest binding limit across the selection — what the bar quotes. */
  limit: BulkLimit | null;
}

/**
 * Resolve the current selection against the rows still on screen.
 *
 * Selection is kept as a set of ids, so a row that leaves the list (approved
 * elsewhere, filtered out, or no longer eligible) drops out of the selection here
 * rather than lingering as a stale id that a later "approve selected" would fire
 * at. The bar always reflects what is actually on screen.
 */
export function resolveBulkSelection(
  eligible: readonly BulkCandidate[],
  selectedIds: ReadonlySet<string>,
  limitOf: (candidate: BulkCandidate) => BulkLimit | null,
): BulkSelection {
  const chosen = eligible.filter((c) => selectedIds.has(c.id));
  if (chosen.length === 0) return { ids: [], count: 0, type: null, limit: null };

  const limits = chosen.map(limitOf).filter((l): l is BulkLimit => l != null);
  const limit = limits.length > 0 ? limits.reduce((low, l) => (l.value < low.value ? l : low)) : null;

  return {
    ids: chosen.map((c) => c.id),
    count: chosen.length,
    type: chosen[0].type,
    limit,
  };
}

/** Bulk approval covers one type at a time, so once something is selected the
 *  other types are out of scope for this batch. */
export function isBlockedByType(candidate: BulkCandidate, selectionType: string | null): boolean {
  return selectionType != null && candidate.type !== selectionType;
}

export interface BulkApproveOutcome {
  approved: string[];
  failed: { id: string; message: string }[];
}

/**
 * Approve a selection by looping the existing single-item endpoint.
 *
 * There is no bulk endpoint in the BFF or in brain-core's surface, so this is a
 * loop by necessity, and it runs SEQUENTIALLY on purpose: each approval is a
 * money-path write that lands in the audit log, and firing them concurrently would
 * both hammer the proxy and scramble the recorded order.
 *
 * A failure never stops the run — the remaining items are still attempted — and
 * every outcome is reported. A partial result must be shown as a partial result;
 * telling someone six payments went through when four did is the same class of lie
 * as an empty queue that is really a failed fetch.
 */
export async function runBulkApprove(
  ids: readonly string[],
  approveOne: (id: string) => Promise<unknown>,
): Promise<BulkApproveOutcome> {
  const outcome: BulkApproveOutcome = { approved: [], failed: [] };
  for (const id of ids) {
    try {
      await approveOne(id);
      outcome.approved.push(id);
    } catch (err) {
      outcome.failed.push({ id, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }
  return outcome;
}
