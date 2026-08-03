/**
 * Row presentation for read-only ledger insights.
 *
 * Overview and the Inbox list the SAME records from the same hooks, so a
 * reader who sees one row on both screens must see the same row. They drifted
 * once — Overview pilled the cash-flow record grey "Informational" while the
 * Inbox pilled it amber "Cash Forecasting" — because each page spelled the
 * presentation out for itself. Both now go through here.
 */
import type { LiveInsight } from "./brainAgentSurfaces";

/** Grey "detected" palette. Deliberately NOT the amber "needs you" chip: these
 *  records carry no decision, and an amber pill on something you cannot action
 *  reads as an unfinished task. Border COLOUR only — the pill element adds
 *  `border border-solid` itself (chip convention). */
export const INSIGHT_ROW_TAG_CLASS = "bg-[#222737] text-[#6c779d] border-[rgba(108,119,157,0.2)]";

/** The pill text is the agent name, matching every other decision row, so a
 *  mixed queue reads as "who raised this". The colour is the only thing saying
 *  it is informational, so that word is carried as text for anyone who cannot
 *  see the colour. */
export const INSIGHT_ROW_SR_LABEL = "informational";

export function insightRowBadge(insight: LiveInsight): {
  label: string;
  className: string;
  srLabel: string;
} {
  return {
    label: insight.badge || "Detected",
    className: INSIGHT_ROW_TAG_CLASS,
    srLabel: INSIGHT_ROW_SR_LABEL,
  };
}

/** Second line. The insight's own subtitle carries its figures; the fallback is
 *  used only when a record has none. The reasoning is deliberately not put here
 *  — it is the card's "Why Brain Suggested This", and the two surfaces showed
 *  different lines when one of them promoted it into the row. */
export function insightRowDetail(insight: LiveInsight): string {
  return insight.subtitle ?? "Brain noticed this in your ledger.";
}
