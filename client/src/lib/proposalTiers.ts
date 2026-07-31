/**
 * Overview priority tiers.
 *
 * Overview groups everything Brain is waiting on into three tiers: Urgent (red),
 * Waiting on you (amber) and Insights (blue). This module is the ONLY place that
 * decides which tier a record lands in.
 *
 * The governing rule, and the reason this file is separate from the components
 * that render it:
 *
 *   Tier is derived from the record's own `available_decisions`, never from its
 *   `proposal_type` and never from a badge colour.
 *
 * Live data is the reason. `fraud_anomaly` *sounds* urgent and actionable, but on
 * the reference tenant it arrives `mode: "notify_only"` offering `[acknowledge]`
 * and nothing else — so it is an Insight, not an Urgent row. Compliance behaves
 * the same way, while treasury / cash_forecast / subscription offer
 * `[approve, reject]`. A tier table keyed by type would put an Approve button on a
 * row whose only legal decision is `acknowledge`, and brain-core rejects the write.
 *
 * That mapping is also expected to change: promoting fraud to approve/reject is a
 * pending brain-core policy decision. Because tier is read from the API response on
 * every fetch, that promotion moves those rows into the actionable tiers on their
 * own — no code change here, no release.
 */

import { buildDecisionButtons } from "./proposalCards";
import type { ProposalDecisionOption, ProposalRiskBand } from "./brainProposals";

export type ProposalTier = "urgent" | "waiting" | "insight";

/**
 * The severity cut, deliberately isolated as a single exported constant.
 *
 * Confirmed with the user 2026-07-31: `high` + `elevated` are Urgent, `standard`
 * and `low` are Waiting on you. `risk_band` is the only severity signal a proposal
 * actually carries — `confidence` is a 0-1 float (too noisy to tier on), and `mode`
 * and `status` are not severity at all.
 *
 * Whether brain-core populates `risk_band` consistently across every
 * approve/reject-capable type is an open question with Codex, which is exactly why
 * `isUrgentRiskBand` treats a missing band as NOT urgent (see below).
 */
export const URGENT_RISK_BANDS: ReadonlySet<ProposalRiskBand> = new Set<ProposalRiskBand>([
  "high",
  "elevated",
]);

/**
 * A null/unknown band never escalates.
 *
 * Coverage of `risk_band` is unconfirmed, so absence has to mean "no signal", not
 * "assume the worst". Escalating on missing data would fill the red tier with rows
 * whose severity nobody asserted — the red tier stops meaning anything, and the
 * user learns to scroll past it. Under-reporting is recoverable; crying wolf is not.
 */
export function isUrgentRiskBand(band: ProposalRiskBand | null | undefined): boolean {
  return band != null && URGENT_RISK_BANDS.has(band);
}

/** The subset of a proposal that tiering reads. Kept structural so the pure
 *  function is testable without constructing a whole `BrainProposal`. */
export interface TierableProposal {
  risk_band?: ProposalRiskBand | null;
  available_decisions?: ProposalDecisionOption[] | null;
  presentation?: { actions?: ProposalDecisionOption[] | null } | null;
}

/**
 * Which tier this proposal belongs to, or `null` when it belongs in none.
 *
 * `null` means the record offers no decision this app can actually submit — either
 * it carries no decisions at all, or only ids outside brain-core's documented write
 * set (`approve`/`reject`/`acknowledge`/`undo`). Those render as disabled buttons on
 * the detail card; putting them in a tier would promise an action Overview cannot
 * deliver. Read-only ledger facts reach the Insights tier through
 * `tierForReadOnlyInsight` instead, which is honest about having nothing to decide.
 */
export function deriveProposalTier(p: TierableProposal): ProposalTier | null {
  const decisions = buildDecisionButtons(p.available_decisions, p.presentation?.actions ?? null);
  const writable = decisions.filter((d) => d.writable);
  if (writable.length === 0) return null;

  /* Actionable: the record accepts a real approve/reject decision. Severity then
     splits Urgent from Waiting on you. */
  if (writable.some((d) => d.id === "approve" || d.id === "reject")) {
    return isUrgentRiskBand(p.risk_band) ? "urgent" : "waiting";
  }

  /* Acknowledge-only (and `undo`-only) records: informational. The user records
     that they have seen it; nothing moves. This is where notify-only fraud and
     compliance findings live today. */
  return "insight";
}

/** Live PaymentIntents always sit in Waiting on you.
 *
 *  They are money-path approvals, so they are always actionable — but every intent
 *  the queue maps carries a hardcoded `severity: "info"` (an honest placeholder in
 *  brainQueue.ts, not a value brain-core sent). There is no severity signal to
 *  escalate on, so none of them may claim the red tier. */
export function tierForPaymentIntent(): ProposalTier {
  return "waiting";
}

/** Read-only ledger facts (reconciliation matches, subscription/disputed
 *  obligations, cash flow) have no proposal lifecycle and nothing to decide. */
export function tierForReadOnlyInsight(): ProposalTier {
  return "insight";
}

export interface TierMeta {
  /** Tier heading, following the prototype's copy. */
  title: string;
  /** Shown after the heading on the Insights tier only. */
  note?: string;
}

export const TIER_META: Record<ProposalTier, TierMeta> = {
  urgent: { title: "Urgent" },
  waiting: { title: "Waiting on you" },
  insight: { title: "Insights", note: "informational, no action needed" },
};

/** Render order. Urgent first — the prototype's promise is that urgent items
 *  always show, above anything filtered to a threshold. */
export const TIER_ORDER: readonly ProposalTier[] = ["urgent", "waiting", "insight"] as const;
