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
 * A user-authored rule (source 1) can only ever TIGHTEN that line — never establish
 * one. This distinction is the whole safety property, so it is worth spelling out:
 * a rule's `cap` is an auto-clear ceiling, which is the same *kind* of number as the
 * auto-approve clause rejected above, and it carries no claim about how many people
 * must sign. Letting a cap stand alone as the gate would quietly reintroduce exactly
 * the semantics this module exists to avoid, and would do it in the worst case —
 * when the policy could not be read at all. So a policy line is mandatory: no
 * evaluable policy threshold for a record's category means no checkbox, whatever
 * rules the tenant has authored.
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

export interface PolicyElevation {
  /** category → the amount above which more than one approver is required. */
  limits: Readonly<Record<string, number>>;
  /**
   * Categories that demand more than one approver with no amount condition this
   * code can evaluate. Nothing in them is ever bulk-eligible.
   *
   * A clause like "outbound payments require owner and CFO", with no `amount.gt` at
   * all, means EVERY outbound payment needs two signers — the strictest possible
   * reading, not an absent one. Skipping such a clause because it has no number
   * would let a different, amount-gated clause on the same category set a limit and
   * silently authorise batches the policy forbids outright. A clause phrased with a
   * comparator this code does not parse lands here for the same reason: unparsed is
   * not unconditional-safe, it is unknown, and unknown fails closed.
   */
  unconditional: ReadonlySet<string>;
  /**
   * The amount above which more than one approver is required for EVERY category,
   * from a clause whose scope is not one named category — see
   * {@link elevatedThresholdsFromPolicy}. Null when the policy has no such clause.
   */
  universal: number | null;
  /** A category-less clause escalates with no amount this code can evaluate, so
   *  nothing at all is bulk-eligible. The `unconditional` set, applied to every
   *  category at once. */
  universalUnconditional: boolean;
}

/** The DSL's explicit "every kind of action" scope. `APPLIES_TO_LABEL` renders it
 *  "any action"; it is a wildcard, never a category a record can be filed under. */
const ANY_SCOPE = "any";

/**
 * Read the tenant's elevated-approval structure out of the signed policy.
 *
 * On the reference tenant the limits resolve to
 * `{ outbound_payment: 50000, onchain_tx: 250000, agent_action: 500000 }`,
 * read from the signed document rather than written down here.
 *
 * Where several clauses cover one category the LOWEST wins: it is the first line an
 * amount crosses, so it is the one that governs.
 *
 * SCOPE. A clause's `applies_to` is a list of categories, but three shapes mean
 * "every category" rather than a named one, and all three are collected as
 * `universal` instead of as map keys:
 *
 *   - absent or empty — the same reading `mapPolicyRuleToCard` and
 *     `coversPayments` use: an unscoped rule constrains any action.
 *   - containing `"any"` — the DSL's explicit wildcard. Storing it under the
 *     literal key `"any"` would file it where no record can ever match, because a
 *     record's category comes from `details.kind` ("agent_action", …) and is never
 *     the string "any".
 *   - present but with no usable entry — scope this code cannot read. Unparsed is
 *     unknown, and unknown fails closed, exactly as for an unrecognised `require`.
 *
 * Dropping any of these would not merely lose a limit: a two-approver line covering
 * everything would go missing while a laxer per-category clause still set a limit,
 * so a batch would be offered under a ceiling the policy does not actually grant.
 * That is the one direction this file must never fail in.
 */
export function elevatedThresholdsFromPolicy(
  facts: ApprovalPolicyFacts | null | undefined,
): PolicyElevation {
  const limits: Record<string, number> = {};
  const unconditional = new Set<string>();
  let universal: number | null = null;
  let universalUnconditional = false;

  for (const rule of facts?.rules ?? []) {
    if (!rule || !isElevatedConfirm(rule)) continue;
    const limit = policyAmount(rule.when?.["amount.gt"]);

    const declared = Array.isArray(rule.applies_to) ? rule.applies_to : [];
    const named = declared
      .filter((c): c is string => typeof c === "string" && !!c.trim())
      .map((c) => c.trim());
    /* Unscoped, wildcard, or unreadable — all three bind every category. */
    const coversEverything = named.length === 0 || named.includes(ANY_SCOPE);

    if (coversEverything) {
      if (limit == null || limit <= 0) {
        universalUnconditional = true;
        continue;
      }
      universal = universal == null ? limit : Math.min(universal, limit);
      continue;
    }

    for (const key of named) {
      if (limit == null || limit <= 0) {
        unconditional.add(key);
        continue;
      }
      limits[key] = limits[key] == null ? limit : Math.min(limits[key], limit);
    }
  }
  return { limits, unconditional, universal, universalUnconditional };
}

/** Nothing known. What an unreachable or absent policy resolves to — and, because
 *  a policy line is mandatory below, what suppresses every checkbox. */
export const NO_POLICY_ELEVATION: PolicyElevation = {
  limits: {},
  unconditional: new Set(),
  universal: null,
  universalUnconditional: false,
};

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
 * The binding limit for one record.
 *
 * A policy line for the record's category is REQUIRED. Only once one exists may an
 * active user rule pull it lower. See the header: a rule cap is an auto-clear
 * ceiling and asserts nothing about how many people must sign, so on its own it is
 * not evidence that a single approver suffices — and "on its own" is precisely the
 * case where the policy could not be read.
 *
 * Null whenever the answer is not positively known: no category, a category the
 * policy escalates unconditionally, or no evaluable policy threshold.
 *
 * A category-less clause (`universal`) is a policy line for EVERY category, so it
 * both satisfies the requirement above on its own and competes with a named
 * clause — lowest wins, for the same reason it does within one category.
 */
export function bulkLimitFor(
  type: string | null | undefined,
  category: string | null | undefined,
  elevation: PolicyElevation,
  userThresholds: MaterialityThresholds | undefined,
): BulkLimit | null {
  if (!category) return null;
  if (elevation.universalUnconditional) return null;
  if (elevation.unconditional.has(category)) return null;

  const evaluable = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v > 0;
  const lines = [elevation.limits[category], elevation.universal].filter(evaluable);
  if (lines.length === 0) return null;
  const policy = Math.min(...lines);

  const cleanType = typeof type === "string" ? type.trim() : "";
  const rule = cleanType ? userThresholds?.[ruleAgentForProposalType(cleanType)] : undefined;
  if (typeof rule === "number" && Number.isFinite(rule) && rule > 0 && rule < policy) {
    return { value: rule, source: "rule" };
  }
  return { value: policy, source: "policy" };
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
 *
 * The batch is also single-type BY CONSTRUCTION here, not merely by the `disabled`
 * attribute the page puts on other-type checkboxes. That attribute is presentation:
 * it is one devtools edit away from gone, and it protects nothing against a future
 * caller that seeds `selectedIds` some other way (a "select all", a restored
 * selection, a keyboard path). Without this filter a mixed set still resolved, and
 * the bar — which reads `type` — would announce "all collections" over a batch that
 * also contained a vendor risk row, then approve exactly what it had just
 * misdescribed. Every row in a mixed set is individually approvable, so nothing
 * escalates; what breaks is the bar telling the truth, and this component's whole
 * justification is that it states precisely what it is about to do.
 *
 * The first selected row's type wins and the rest are dropped from the batch,
 * rather than resolving to an empty selection: dropping keeps the bar honest about
 * a subset the user can actually approve, where refusing outright would turn a
 * tampered checkbox into a dead surface with nothing explaining why.
 */
export function resolveBulkSelection(
  eligible: readonly BulkCandidate[],
  selectedIds: ReadonlySet<string>,
  limitOf: (candidate: BulkCandidate) => BulkLimit | null,
): BulkSelection {
  const chosen = eligible.filter((c) => selectedIds.has(c.id));
  if (chosen.length === 0) return { ids: [], count: 0, type: null, limit: null };

  /* The governing type is the EARLIEST SELECTED row's, taken from `selectedIds`
     insertion order, not the topmost row on screen. Those differ exactly when a row
     above the user's first pick joins the set later — the tampered case — and
     letting screen position decide would hand the batch to the intruder and quietly
     drop what the user had actually chosen. `ids` still follows screen order, which
     is the order the approvals fire and therefore the order the audit log records. */
  const byId = new Map(eligible.map((c) => [c.id, c]));
  let type: string | null = chosen[0].type;
  for (const id of selectedIds) {
    const first = byId.get(id);
    if (first) { type = first.type; break; }
  }
  const batch = chosen.filter((c) => c.type === type);

  const limits = batch.map(limitOf).filter((l): l is BulkLimit => l != null);
  const limit = limits.length > 0 ? limits.reduce((low, l) => (l.value < low.value ? l : low)) : null;

  return {
    ids: batch.map((c) => c.id),
    count: batch.length,
    type,
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
