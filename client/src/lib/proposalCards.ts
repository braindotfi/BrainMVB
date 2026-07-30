/**
 * Pure presentation logic for the live agent-proposal card.
 *
 * Kept out of AgentProposalModal.tsx so it can be unit-tested: the suite runs in
 * a node environment, and that module pulls in JSX plus binary asset imports.
 */

import type { ProposalEvidenceItem, ProposalAmount } from "./brainProposals";

/** Keeps the card scannable: the rest moves into "Technical reference". */
export const MAX_VISIBLE_DETAIL_ROWS = 4;

/** Most decision-relevant first. Rows not listed keep their arrival order after
 *  these, so a new brain-core fact still renders instead of being dropped. */
const DETAIL_ROW_PRIORITY = ["Amount", "Overdue by", "Due", "Status", "Invoice", "Counterparty", "PO"];

export interface ProposalDetailRow {
  label: string;
  value: string;
  /** Monospace — amounts and codes, so digits line up column-wise. */
  mono?: boolean;
}

/** Two-letter initials for the subject avatar ("Thornebury Imports" → "TI"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Flatten BFF-resolved evidence into de-duplicated, prioritised detail rows.
 *
 * `subjectName` is already shown in the card header, so the row that merely
 * repeats it is suppressed rather than printed twice. Evidence that resolved to
 * nothing contributes no row at all — its raw ref still appears under
 * "Technical reference", which is the honest place for an unresolved id.
 *
 * Background citations (`context`) are skipped entirely: a real collections
 * proposal cites the whole counterparty book, which would bury the four rows
 * that actually inform the decision.
 */
export function buildProposalDetailRows(
  evidence: ProposalEvidenceItem[],
  subjectName: string | null,
  formatMoney: (amount: ProposalAmount) => string,
): ProposalDetailRow[] {
  const rows: ProposalDetailRow[] = [];
  const push = (label: string, value: string, mono = false) => {
    if (!label || !value) return;
    if (rows.some((r) => r.label === label && r.value === value)) return;
    rows.push({ label, value, mono });
  };

  for (const e of evidence) {
    if (e.context) continue;
    if (e.amount) push("Amount", formatMoney(e.amount), true);
    for (const f of e.facts ?? []) push(f.label, f.value);
    if (e.display && e.display !== subjectName) push(e.label ?? e.kind, e.display);
  }

  const rank = (label: string) => {
    const i = DETAIL_ROW_PRIORITY.indexOf(label);
    return i === -1 ? DETAIL_ROW_PRIORITY.length : i;
  };
  // Stable sort: equal-rank rows keep the order the agent's evidence gave them.
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.label) - rank(b.r.label) || a.i - b.i)
    .map(({ r }) => r);
}
