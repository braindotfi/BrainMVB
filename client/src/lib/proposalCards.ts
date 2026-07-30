/**
 * Pure presentation logic for the live agent-proposal card.
 *
 * Kept out of AgentProposalModal.tsx so it can be unit-tested: the suite runs in
 * a node environment, and that module pulls in JSX plus binary asset imports.
 *
 * Everything here is derived from fields the BFF actually resolved
 * (server/brain/proposalEnrichment.ts). Nothing is inferred or invented: a field
 * brain-core does not carry produces no row rather than a plausible-looking one,
 * because an approver acting on a fabricated detail is worse than one acting on
 * a sparse card.
 */

import type { ProposalEvidenceItem, ProposalAmount } from "./brainProposals";

/** Keeps the card scannable: the rest moves into "Technical reference". */
export const MAX_VISIBLE_DETAIL_ROWS = 4;

/** Most decision-relevant first. Rows not listed keep their arrival order after
 *  these, so a new brain-core fact still renders instead of being dropped. */
const DETAIL_ROW_PRIORITY = ["Amount", "Overdue by", "Due", "Status", "Invoice", "Counterparty", "PO"];

/** Icon key per row label, resolved to a component in the modal. Kept as a
 *  string so this module stays free of JSX/component imports. */
const ROW_ICONS: Record<string, string> = {
  Amount: "amount",
  Due: "calendar",
  "Overdue by": "alert",
  Status: "status",
  Invoice: "file",
  Counterparty: "building",
  Customer: "building",
  Vendor: "building",
  PO: "hash",
  Account: "wallet",
  Institution: "building",
  Type: "tag",
  Direction: "arrows",
  Date: "calendar",
  Role: "user",
  Email: "mail",
  Receivable: "amount",
  Payable: "amount",
  Transaction: "arrows",
  "Team member": "user",
};

export function iconKeyForRow(label: string): string {
  return ROW_ICONS[label] ?? "dot";
}

export interface ProposalDetailRow {
  label: string;
  value: string;
  /** Monospace — amounts and codes, so digits line up column-wise. */
  mono?: boolean;
  /** Key into the modal's icon map. */
  icon: string;
}

/** Two-letter initials for the subject avatar ("Thornebury Imports" → "TI"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * The card's secondary headline: the document a human would quote plus what it
 * is worth — "AR-MIDMARKET-001 · $42,000.00".
 *
 * Both halves are optional and independent, because they come from different
 * records: a proposal can cite an invoice with no amount, or an obligation with
 * an amount and no document number. The caller renders whichever parts exist and
 * falls back to the agent line when neither does.
 *
 * Context citations are ignored for the same reason they cannot caption the
 * card — they describe the book the agent read, not the record in question.
 */
export function buildProposalHeadline(evidence: ProposalEvidenceItem[]): {
  code: string | null;
  amount: ProposalAmount | null;
} {
  const specific = evidence.filter((e) => !e.context);
  const withCode = specific.find((e) => e.code);
  // Prefer the amount attached to the SAME record as the code, so the number
  // shown is that document's value and not some other cited entity's balance.
  const amount = withCode?.amount ?? specific.find((e) => e.amount)?.amount ?? null;
  return { code: withCode?.code ?? null, amount: amount ?? null };
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
  headlineCode?: string | null,
): ProposalDetailRow[] {
  const rows: ProposalDetailRow[] = [];
  const push = (label: string, value: string, mono = false) => {
    if (!label || !value) return;
    if (rows.some((r) => r.label === label && r.value === value)) return;
    rows.push({ label, value, mono, icon: iconKeyForRow(label) });
  };

  for (const e of evidence) {
    if (e.context) continue;
    if (e.amount) push("Amount", formatMoney(e.amount), true);
    for (const f of e.facts ?? []) push(f.label, f.value);
    // The headline already names this document; repeating it as a row wastes
    // one of only four slots.
    if (e.display && e.display !== subjectName && !(headlineCode && e.code === headlineCode)) {
      push(e.label ?? e.kind, e.display);
    }
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
