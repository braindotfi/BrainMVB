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
 *
 * Severity then splits the actionable rows, and materiality can promote a middling
 * band — see `deriveProposalTier` and `thresholdsFromRules` below.
 */

import { buildDecisionButtons } from "./proposalCards";
import type { ProposalDecisionOption, ProposalRiskBand } from "./brainProposals";

export type ProposalTier = "urgent" | "waiting" | "insight";

/**
 * `high` escalates on the band alone. Nothing else does.
 *
 * Revised 2026-07-31 after Codex confirmed the cut: the earlier version also sent
 * `elevated` straight to Urgent, which over-filled the red tier.
 */
export const UNCONDITIONAL_URGENT_BAND: ProposalRiskBand = "high";

/**
 * `elevated` is Action-needed by default and reaches Urgent only when the amount
 * clears the tenant's own configured limit for that proposal type (materiality).
 */
export const MATERIAL_URGENT_BAND: ProposalRiskBand = "elevated";

/** Bands that satisfy reconciliation's severity leg (it needs more — see below). */
const RECONCILIATION_URGENT_BANDS: ReadonlySet<ProposalRiskBand> = new Set<ProposalRiskBand>([
  "elevated",
  "high",
]);

/**
 * A null/unknown band never escalates.
 *
 * Coverage of `risk_band` is unconfirmed across types, so absence has to mean "no
 * signal", not "assume the worst". Escalating on missing data would fill the red
 * tier with rows whose severity nobody asserted — the red tier stops meaning
 * anything, and the user learns to scroll past it. Under-reporting is recoverable;
 * crying wolf is not. `standard` and `low` are Action-needed for the same reason.
 */
export function isUnconditionallyUrgent(band: ProposalRiskBand | null | undefined): boolean {
  return band === UNCONDITIONAL_URGENT_BAND;
}

/* ── Materiality ──────────────────────────────────────────────────────────────
   The limit an amount must clear to promote an `elevated` record to Urgent.

   These come ONLY from rules the tenant actually configured (GET /api/rules, via
   rulesStore). There is deliberately no built-in default and no hardcoded number.

   Worth knowing before you go looking for them: the familiar "$25k collections /
   $50k treasury" figures exist only as copy in the v6 prototype and as one mock
   rule fixture. `GET /api/rules` returns `[]` on the reference tenant, so in
   practice NO type has a threshold today and no `elevated` record promotes. That
   is the intended failure mode — inventing a number here would escalate rows
   against a limit the user never set, and would quietly disagree with the limit
   they eventually do set. When they configure a rule, promotion starts working on
   its own, the same way the `available_decisions` mapping does.
   ──────────────────────────────────────────────────────────────────────────── */

/** proposal type → the amount above which an `elevated` record is material. */
export type MaterialityThresholds = Readonly<Record<string, number | undefined>>;

/**
 * Rules are scoped by `Agent` (proposalTypes.ts) and proposals carry a
 * `ProposalType` (brainProposals.ts). Those two unions are ALMOST identical, and
 * the join below relies on that — but they have already drifted once:
 *
 *   ProposalType "revenue_intel"  ⟷  Agent "revenue_intelligence"
 *
 * Left unaliased, a revenue proposal silently never matches its own rule and its
 * threshold quietly never applies — no error, no warning, just a record that never
 * escalates. Add an entry here whenever the two names diverge again.
 *
 * (Types with no counterpart in `Agent` at all — bill_management, tax_prep, the
 * personal-finance set — simply cannot have a rule scoped to them, so they get no
 * threshold and never promote. That is correct, not a gap.)
 */
const RULE_AGENT_ALIASES: Readonly<Record<string, string>> = {
  revenue_intel: "revenue_intelligence",
};

/** The rule scope (`Agent`) that governs a given proposal `type`. */
export function ruleAgentForProposalType(type: string): string {
  return RULE_AGENT_ALIASES[type] ?? type;
}

/** The shape `thresholdsFromRules` reads. Structural so it is testable without
 *  building whole `AutoRule`s, and so rulesStore stays the only place that owns
 *  the real type. */
export interface ThresholdRule {
  active?: boolean;
  /** Rules are scoped by agent, and agent ids line up with proposal `type`. */
  agent?: string | null;
  /** Explicit guardrail trip point, preferred when both are present. */
  threshold?: number | null;
  /** Amount ceiling the rule auto-clears under — the "auto-approve limit". */
  cap?: number | null;
}

function firstFiniteAmount(...candidates: (number | null | undefined)[]): number | null {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

/**
 * Collapse the tenant's configured rules into one threshold per proposal type.
 *
 * Only ACTIVE rules count: a paused rule is a limit the user switched off, and a
 * switched-off limit must not drive an escalation. Where several rules cover the
 * same type the LOWEST limit wins, because that is the first one an amount breaches.
 */
export function thresholdsFromRules(rules: readonly ThresholdRule[] | null | undefined): MaterialityThresholds {
  const out: Record<string, number> = {};
  for (const r of rules ?? []) {
    if (r?.active === false) continue;
    const type = typeof r?.agent === "string" ? r.agent.trim() : "";
    if (!type) continue;
    const limit = firstFiniteAmount(r?.threshold, r?.cap);
    if (limit == null) continue;
    out[type] = out[type] == null ? limit : Math.min(out[type], limit);
  }
  return out;
}

/** The subset of a proposal that tiering reads. Kept structural so the pure
 *  function is testable without constructing a whole `BrainProposal`. */
export interface TierableProposal {
  type?: string | null;
  risk_band?: ProposalRiskBand | null;
  available_decisions?: ProposalDecisionOption[] | null;
  presentation?: { actions?: ProposalDecisionOption[] | null } | null;
  details?: Record<string, unknown> | null;
}

function numericAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * The proposal's amount, for COMPARISON ONLY — never for display.
 *
 * Live rows carry the amount in two different shapes and this has to read both:
 * the richer records use `details.amount = {value, currency}`, while raw collections
 * records use `details.amount_due` alongside a separate `details.currency`.
 * Returns null when neither is present, which blocks promotion rather than
 * defaulting to zero.
 *
 * Note the currency is deliberately ignored: a threshold is a plain number with no
 * currency attached, so comparing across currencies would be wrong. Mixed-currency
 * tenants need the threshold to carry a currency before this can be trusted — until
 * then this compares magnitudes in whatever currency the record arrived in.
 */
export function proposalAmountValue(p: TierableProposal): number | null {
  const details = p.details;
  if (!details || typeof details !== "object") return null;

  const structured = (details as { amount?: unknown }).amount;
  if (structured && typeof structured === "object") {
    const v = numericAmount((structured as { value?: unknown }).value);
    if (v != null) return v;
  }
  const direct = numericAmount(structured);
  if (direct != null) return direct;

  return numericAmount((details as { amount_due?: unknown }).amount_due);
}

/** True only when we have BOTH a real amount and a real configured limit, and the
 *  amount clears it. A missing amount or a missing limit never promotes. */
export function isMaterial(p: TierableProposal, thresholds: MaterialityThresholds | undefined): boolean {
  const type = typeof p.type === "string" ? p.type.trim() : "";
  if (!type) return false;
  const limit = thresholds?.[ruleAgentForProposalType(type)];
  if (typeof limit !== "number" || !Number.isFinite(limit)) return false;
  const amount = proposalAmountValue(p);
  if (amount == null) return false;
  return amount > limit;
}

/**
 * Reconciliation's extra leg: the match is actually unresolved.
 *
 * UNVERIFIED AGAINST LIVE DATA. The reference tenant has zero reconciliation
 * proposals and zero rows on /ledger/reconciliation-matches, so the field names and
 * values below could not be confirmed the way the collections and fraud shapes were.
 * Written to fail CLOSED — anything it does not recognise reads as resolved and
 * stays out of Urgent — so an unconfirmed guess cannot manufacture a red row.
 */
function isUnresolvedReconciliation(p: TierableProposal): boolean {
  const details = p.details;
  if (!details || typeof details !== "object") return false;
  const matchType = (details as { match_type?: unknown }).match_type;
  if (typeof matchType === "string" && matchType.trim().toLowerCase() === "no_match") return true;
  const status = (details as { status?: unknown }).status;
  if (typeof status !== "string") return false;
  const s = status.trim().toLowerCase();
  return s === "unresolved" || s === "unmatched";
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
 *
 * `payment` deliberately has NO override. Codex referenced a `priority_score` signal
 * for it, but that field appears nowhere in the repo and on none of the live
 * proposals, and there are zero money-path rows to carry it — so there is nothing
 * real to key off yet. Payment records stay in Action-needed until that is resolved.
 */
export function deriveProposalTier(
  p: TierableProposal,
  opts?: { thresholds?: MaterialityThresholds },
): ProposalTier | null {
  const decisions = buildDecisionButtons(p.available_decisions, p.presentation?.actions ?? null);
  const writable = decisions.filter((d) => d.writable);
  if (writable.length === 0) return null;

  /* Acknowledge-only (and `undo`-only) records: informational. The user records
     that they have seen it; nothing moves. This is where notify-only fraud and
     compliance findings live today. Checked BEFORE severity so a high-risk
     acknowledge-only finding stays an Insight — it has nothing to approve. */
  if (!writable.some((d) => d.id === "approve" || d.id === "reject")) return "insight";

  const thresholds = opts?.thresholds;
  const band = p.risk_band ?? null;
  const type = typeof p.type === "string" ? p.type.trim() : "";

  /* Reconciliation is STRICTER than the general rule, not looser: a `high` band is
     not enough on its own. An unresolved match is only urgent when it is also
     material, otherwise a pile of small unmatched cents would own the red tier. */
  if (type === "reconciliation") {
    const severe = band != null && RECONCILIATION_URGENT_BANDS.has(band);
    return severe && isUnresolvedReconciliation(p) && isMaterial(p, thresholds) ? "urgent" : "waiting";
  }

  /* General rule. `high` escalates on the band alone. `elevated` escalates only on
     materiality — the amount clearing the tenant's own limit for this type, which
     is what makes collections ($amount_due vs the collections rule) and treasury
     (amount vs the treasury rule) behave the way the brief describes without either
     one needing its own branch. */
  if (isUnconditionallyUrgent(band)) return "urgent";
  if (band === MATERIAL_URGENT_BAND && isMaterial(p, thresholds)) return "urgent";
  return "waiting";
}

/** Live PaymentIntents always sit in Waiting on you.
 *
 *  They are money-path approvals, so they are always actionable — but every intent
 *  the queue maps carries a hardcoded `severity: "info"` (an honest placeholder in
 *  brainQueue.ts, not a value brain-core sent), and the PaymentIntent record itself
 *  carries no `risk_band` and no `priority_score` — only `confidence`. There is no
 *  severity signal to escalate on, so none of them may claim the red tier. */
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
  insight: { title: "Insights" },
};

/** Render order. Urgent first — the prototype's promise is that urgent items
 *  always show, above anything filtered to a threshold. */
export const TIER_ORDER: readonly ProposalTier[] = ["urgent", "waiting", "insight"] as const;
