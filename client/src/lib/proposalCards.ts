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

import type {
  ProposalEvidenceItem,
  ProposalAmount,
  ProposalPolicy,
  ProposalKeyFact,
  ResolvedKeyFact,
  ProposalDecisionOption,
  ProposalConsequences,
  ProposalDetails,
  ProposalType,
  BrainProposal,
} from "./brainProposals";

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

/* ══════════════════════════════════════════════════════════════════════════════
   RICH CARD LOGIC (brain-core #384: details / policy / presentation /
   available_decisions / stored_action_type).

   Everything below is pure and unit-tested (proposalCards.test.ts). The rule from
   the top of this file still holds and is the reason for most of the code here: a
   field brain-core does not carry produces NO row, never a plausible-looking one.
   ══════════════════════════════════════════════════════════════════════════════ */

/**
 * A brain-core entity id: a ULID with an optional collection prefix
 * (`tx_01KYS8S1WJ…`, `cp_01KY…`, `pd_01KY…`, `evt_01KY…`), or a `wiki:` URI.
 *
 * These are the values that must never reach the card face. Matching is on SHAPE,
 * not on a prefix allowlist: brain-core keeps adding domain refs (`dispute`,
 * `trip`, `budget`, …) and an allowlist would silently leak each new one.
 */
const RAW_ID_RE = /^(?:[a-z][a-z0-9]{0,11}_)?[0-9A-HJKMNP-TV-Z]{26}$/i;

export function isRawIdentifier(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("wiki:")) return true;
  return RAW_ID_RE.test(v);
}

/** A label naming an identifier column ("Transaction Id", "Policy Decision Id"). */
function isIdentifierLabel(label: string): boolean {
  return /\bids?\b/i.test(label.trim());
}

/**
 * Turn brain-core's enum values into prose: "create_liquidity_plan" → "Create
 * liquidity plan", "high" → "High".
 *
 * Applied ONLY to all-lowercase tokens with no spaces, which is exactly the shape
 * of a machine enum. Names ("Harbor Reserve"), sentences ("Review the rejected
 * policy decision."), numbers ("70197.57") and ids all contain a capital, a space
 * or a leading digit, so they pass through byte-for-byte — the function can never
 * quietly reword content a human wrote.
 */
export function humanizeEnumValue(value: string): string {
  const v = value.trim();
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(v)) return value;
  const words = v.split("_");
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "");
}

/** Customer-facing decision button copy. API ids remain unchanged, while labels
 * such as `hold_vendor` and `Clear vendor` consistently become `Hold Vendor`
 * and `Clear Vendor`. */
export function titleCaseDecisionLabel(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

/** Capitalize every word in a display label, including labels that already
 * contain spaces (for example, `Low risk` → `Low Risk`). */
export function titleCaseLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

/** Money-ish fact labels. Their values are bare decimals that read as raw data
 *  until the active display currency is applied. */
const MONEY_LABEL_RE =
  /(amount|cash|balance|position|inflow|outflow|transfer|minimum|floor|savings|price|total|payment|charge|spend|value)/i;

/** A bare decimal brain-core writes for money ("70197.57", "0.00"). */
const DECIMAL_RE = /^-?\d+\.\d{2}$/;

/** Labels whose value is unambiguously an amount even when core omits the cents
 *  ("Available Cash: 70197"). Deliberately NARROWER than MONEY_LABEL_RE: that one
 *  matches "payment" and "value", which also head non-money facts like
 *  "Payment Terms: 30" — formatting those as $30.00 would be a lie. */
const STRICT_MONEY_LABEL_RE = /(amount|balance|cash|outstanding|inflow|outflow|savings|invoice total|total due)/i;

/** A bare integer, with or without cents. */
const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;

/* ── Dates in fact tables ────────────────────────────────────────────────────
   brain-core hands back whatever its column holds, so a due date arrives as
   "2026-07-20 00:00:00+00". Rendered raw it reads as a database dump. The time
   is kept ONLY when it is meaningful (not midnight) and unambiguously UTC —
   dropping a real timestamp would lose information, and labelling an unknown
   offset as UTC would invent it. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

export function formatFactDate(raw: string): string | null {
  const m = TIMESTAMP_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, offset] = m;
  const monthIndex = Number(mo) - 1;
  if (monthIndex < 0 || monthIndex > 11 || Number(d) < 1 || Number(d) > 31) return null;
  const date = `${MONTHS[monthIndex]} ${Number(d)}, ${y}`;
  const isUtc = offset === "Z" || /^\+00(?::?00)?$/.test(offset ?? "");
  const midnight = hh === "00" && mm === "00" && ss === "00";
  return hh && !midnight && isUtc ? `${date} ${hh}:${mm} UTC` : date;
}

/** Thousands separators for a bare number that is NOT money — core sends
 *  "70197" and a human reads "70,197". Values with a symbol, unit or any other
 *  character are left exactly as they arrived. */
function groupDigits(raw: string): string {
  if (!NUMERIC_RE.test(raw)) return raw;
  const negative = raw.startsWith("-");
  const [intPart, decPart] = raw.replace(/^-/, "").split(".");
  /* A leading zero means this is a code, not a quantity ("0012345" is an account
     number); grouping it would both mislead and drop the zeros. */
  if (intPart.length < 4 || intPart.startsWith("0")) return raw;
  /* Grouped as a STRING. Number(intPart).toLocaleString() would round anything
     past 2^53 — silently changing a value on an approval surface. */
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${decPart ? `.${decPart}` : ""}`;
}

/* ── Source-currency amounts ─────────────────────────────────────────────────
   The card formats money through the operator's ACTIVE display currency (a USD
   receivable shows as €5,023 for a EUR user, converted at the app's FX rate).
   That is right for the card and wrong for anything quoting the amount back to
   a third party — the customer owes the invoice's own currency. Use this for
   that case only; everything else goes through useCurrency. */
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

export function formatSourceAmount(amount: { value: string; currency: string }): string {
  const raw = amount.value.trim();
  const negative = raw.startsWith("-");
  const [intPart, decPart = ""] = raw.replace(/^-/, "").split(".");
  if (!/^\d+$/.test(intPart)) return `${amount.currency} ${raw}`;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Core sends "5460.00000000"; quote two decimals, never a truncated third.
  const cents = decPart.length >= 2 ? decPart.slice(0, 2) : decPart.padEnd(2, "0");
  const symbol = CURRENCY_SYMBOLS[amount.currency.toUpperCase()];
  const body = `${grouped}.${cents}`;
  return symbol ? `${negative ? "-" : ""}${symbol}${body}` : `${negative ? "-" : ""}${amount.currency} ${body}`;
}

export interface KeyFactRow {
  label: string;
  value: string;
  mono?: boolean;
  icon: string;
}

export interface BuiltKeyFacts {
  /** Rows the card face shows. Never contains a raw id. */
  primary: KeyFactRow[];
  /** Identifier rows, moved out of the primary view but kept for support. */
  technical: KeyFactRow[];
}

/**
 * Build the structured key-facts table from the BFF-resolved facts.
 *
 * Three things happen here, all of them reversible reading of real data:
 *  - identifier rows (label says "Id", or the value is still a raw ULID because
 *    nothing resolved it) are routed to `technical`, satisfying the contract that
 *    no raw ids appear in the primary view;
 *  - money values are formatted through the caller's currency formatter, using the
 *    row's own `Currency` fact as the unit — that standalone Currency row is then
 *    dropped, because it exists only to qualify the amounts beside it;
 *  - snake_case enums are humanised.
 */
export function buildKeyFactRows(
  facts: ResolvedKeyFact[] | null | undefined,
  formatMoney: (amount: ProposalAmount) => string,
  /** Currency to use when the fact table carries amounts but no Currency row —
   *  taken from the proposal's own amount. Without it those rows would render as
   *  bare decimals next to properly formatted ones. */
  fallbackCurrency?: string | null,
): BuiltKeyFacts {
  const rows = facts ?? [];
  const currency =
    rows.find((f) => f.label.trim().toLowerCase() === "currency")?.value?.trim() ||
    fallbackCurrency?.trim() ||
    undefined;
  const primary: KeyFactRow[] = [];
  const technical: KeyFactRow[] = [];
  /* Resolution can make two facts identical: a fraud finding carries both
     "Transaction Id" and "Counterparty Name", and once the id becomes a name they
     are the same string. Show it once. */
  const seenValues = new Set<string>();

  for (const fact of rows) {
    const label = fact.label?.trim();
    const raw = fact.value == null ? "" : String(fact.value).trim();
    if (!label || !raw) continue;
    // The Currency row qualifies the amounts; once they carry a symbol it is noise.
    if (label.toLowerCase() === "currency" && currency) continue;

    const identifier = fact.technical === true || isIdentifierLabel(label) || isRawIdentifier(raw);
    if (identifier) {
      technical.push({ label, value: raw, mono: true, icon: iconKeyForRow(label) });
      continue;
    }

    if (seenValues.has(raw)) continue;
    seenValues.add(raw);

    const isMoney =
      Boolean(currency) &&
      ((MONEY_LABEL_RE.test(label) && DECIMAL_RE.test(raw)) ||
        (STRICT_MONEY_LABEL_RE.test(label) && NUMERIC_RE.test(raw)));
    primary.push({
      label,
      value: isMoney
        ? formatMoney({ value: raw, currency: currency! })
        : (formatFactDate(raw) ?? groupDigits(humanizeEnumValue(raw))),
      mono: isMoney,
      icon: iconKeyForRow(label),
    });
  }
  return { primary, technical };
}

/* ── Headline ───────────────────────────────────────────────────────────────── */

/** A machine enum embedded in prose: "create_liquidity_plan", "not_matched". */
const SNAKE_TOKEN_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** ref → resolved name, from everything on the record that already resolved. */
export function buildRefDisplayMap(
  facts: ResolvedKeyFact[] | null | undefined,
  evidence: ProposalEvidenceItem[] | null | undefined,
  serverResolved?: Record<string, string> | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [ref, display] of Object.entries(serverResolved ?? {})) {
    if (display && !isRawIdentifier(display)) map.set(ref, display);
  }
  for (const e of evidence ?? []) {
    const display = e.display?.trim();
    if (e.ref && display && !isRawIdentifier(display)) {
      map.set(e.ref, display);
      const tail = e.ref.split("/").pop();
      if (tail) map.set(tail, display);
    }
  }
  for (const f of facts ?? []) {
    if (f.ref && f.value && !f.technical && !isRawIdentifier(f.value)) map.set(f.ref, f.value);
  }
  return map;
}

/**
 * Make brain-core's headline fit to show a human.
 *
 * Core writes headlines straight off the record, so they arrive as
 * "tx_01KYS8S1WJ… fraud anomaly risk is elevated; recommend review." and
 * "create_liquidity_plan for USD balance 70197.57." Two passes:
 *
 *  - every raw id is replaced with the name we resolved for it; an id nothing
 *    resolved is REMOVED rather than shown, because the primary view must not
 *    contain one. It stays visible in the technical section either way.
 *  - snake_case enums are spaced out, and the result is sentence-cased.
 *
 * Returns null if nothing legible survives, so the caller falls back to the
 * subject-derived headline instead of printing a fragment.
 */
export function resolveHeadlineText(
  headline: string | null | undefined,
  refs: Map<string, string>,
  options: { sentenceCase?: boolean } = {},
): string | null {
  const { sentenceCase = true } = options;
  const source = headline?.trim();
  if (!source) return null;

  const rebuilt: string[] = [];
  for (const token of source.split(/\s+/)) {
    // Keep trailing punctuation attached to whatever replaces the token.
    const match = token.match(/^(.*?)([.,;:!?]*)$/);
    const bare = match?.[1] ?? token;
    const trailing = match?.[2] ?? "";
    if (bare && isRawIdentifier(bare)) {
      const display = refs.get(bare) ?? refs.get(bare.split("/").pop() ?? "");
      if (display) rebuilt.push(display + trailing);
      // Unresolved: drop the token entirely.
      continue;
    }
    // A lower_snake_case enum mid-sentence: space it out, but do NOT capitalise
    // it — the sentence gets its capital once, at the end.
    rebuilt.push(SNAKE_TOKEN_RE.test(bare) ? bare.replace(/_/g, " ") + trailing : token);
  }

  const text = rebuilt.join(" ").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
  if (!text || text === "." ) return null;
  return sentenceCase ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * The same treatment for the narrative under "Why This Needs Your Decision", which
 * has the same problem ("Compliance review for inv_01KYS8RK94… found …") but is
 * already prose, so its existing capitalisation is left alone.
 */
export function resolveProseText(
  text: string | null | undefined,
  refs: Map<string, string>,
): string | null {
  return resolveHeadlineText(text, refs, { sentenceCase: false });
}

export interface ProposalHeaderCopy {
  title: string;
  text: string;
}

/** The exact two-line header shared by the detail card and proposal list rows. */
export function buildProposalHeaderCopy(
  proposal: BrainProposal,
  agentName: string,
  formatText: (text: string) => string,
): ProposalHeaderCopy {
  const evidence = proposal.evidence ?? [];
  const subjectName = proposal.subject?.display ?? null;
  const headline = buildProposalHeadline(evidence);
  const headlineText = [
    headline.code,
    headline.amount ? formatText(`${headline.amount.currency} ${headline.amount.value}`) : null,
  ].filter(Boolean).join(" · ");
  const resolvedFacts = proposal.key_facts ?? keyFactsFromPresentation(proposal.presentation?.key_facts);
  const refDisplays = buildRefDisplayMap(resolvedFacts, evidence, proposal.resolved_refs);
  const resolvedHeadline = resolveHeadlineText(proposal.presentation?.headline, refDisplays);
  const cardHeadline = resolvedHeadline
    ? formatText(applyCurrencyToBareAmounts(resolvedHeadline, headline.amount?.currency ?? null))
    : null;

  return {
    title: cardHeadline ?? subjectName ?? agentName,
    text:
      [cardHeadline && subjectName ? subjectName : null, headlineText].filter(Boolean).join(" · ") ||
      (subjectName ? `${proposal.subject!.label} · ${agentName}` : `Proposed by ${agentName}`),
  };
}

/* ── "Flagged by …" ─────────────────────────────────────────────────────────── */

export interface FlaggedBy {
  /** The sentence rendered after "Flagged by". */
  text: string;
  /** Which rung of the fallback produced it — asserted in tests, and a useful
   *  data-testid suffix when debugging a tenant whose policy rows are sparse. */
  source: "policy_id" | "matched_rule_id" | "policy_content";
}

/**
 * Resolve the "Flagged by" line.
 *
 * `policy.policy_id` is null on most live rows even when the rest of the object is
 * populated (verified across every pending proposal on the reference tenant), so
 * reading it directly renders "Flagged by null". The contract's fallback order:
 *
 *   1. `policy_id`            — the policy that decided this, when core sends one.
 *   2. `matched_rule_id`      — the specific rule that matched (e.g. "cmp_policy_violation").
 *   3. policy CONTENT         — the matched entry in `trace`, else `explanation`,
 *                               else the bare `decision`, qualified by the approvers
 *                               the policy requires.
 *   4. null                   — nothing usable: the caller omits the line entirely
 *                               rather than printing an empty one.
 */
export function buildFlaggedBy(policy: ProposalPolicy | null | undefined): FlaggedBy | null {
  if (!policy) return null;

  const version = typeof policy.policy_version === "number" ? ` (v${policy.policy_version})` : "";
  const approvers = (policy.required_approvers ?? []).filter(Boolean);
  const approverSuffix = approvers.length > 0 ? ` · requires ${approvers.map(humanizeEnumValue).join(", ")} approval` : "";

  const policyId = policy.policy_id?.trim();
  if (policyId && isHumanReadablePolicyReference(policyId)) {
    return { text: `policy ${humanizePolicyReference(policyId)}${version}${approverSuffix}`, source: "policy_id" };
  }

  const ruleId = policy.matched_rule_id?.trim();
  if (ruleId && !isRawIdentifier(ruleId)) {
    return { text: `rule ${humanizeRuleId(ruleId)}${approverSuffix}`, source: "matched_rule_id" };
  }

  // Rung 3 — describe the decision from whatever policy content exists.
  const explanation = policy.explanation?.trim();
  if (explanation) return { text: `${explanation}${approverSuffix}`, source: "policy_content" };

  const matchedRule = (policy.trace ?? []).find((t) => t?.matched && typeof t.rule_id === "string" && t.rule_id.trim());
  if (matchedRule?.rule_id) {
    return { text: `${humanizeRuleId(matchedRule.rule_id)}${approverSuffix}`, source: "policy_content" };
  }

  const decision = policy.decision?.trim();
  if (decision) {
    return { text: `a policy ${humanizeEnumValue(decision).toLowerCase()} decision${approverSuffix}`, source: "policy_content" };
  }
  return null;
}

/** "default-agent-action-requires-review" → "the default agent action requires review rule". */
function humanizeRuleId(ruleId: string): string {
  const words = ruleId.trim().replace(/[-_]+/g, " ");
  return `the "${words}" rule`;
}

/** Policy ids are authorities, not human labels. Preserve a readable policy
 * name when core gives one, but never put a ULID or other opaque identifier on
 * the primary card face. */
function humanizePolicyReference(policyId: string): string {
  return policyId
    .replace(/^policy[-_:]?/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "the active policy";
}

/** `pol_8231`, `policy_01KY…`, and similar values are identifiers even when
 * they are not ULIDs. They may be useful in Technical Detail, but turning them
 * into title case does not make them a human label for the primary card. */
function isHumanReadablePolicyReference(value: string): boolean {
  const v = value.trim();
  if (!v || isRawIdentifier(v)) return false;
  if (/^(?:pol|policy)[-_][a-z0-9][a-z0-9_-]*$/i.test(v)) return false;
  return /[A-Z\s]/.test(v);
}

/* ── Decisions ──────────────────────────────────────────────────────────────── */

/**
 * The decision ids POST /proposals/{id}/decide actually accepts today.
 *
 * The read model exposes DOMAIN labels for some types ("Mark reviewed", "Hold
 * transaction"), but the contract is explicit that "the write route remains
 * `approve`, `reject`, `acknowledge`, or `undo` for compatibility". So the LABEL
 * comes from `available_decisions` while the wire value stays one of these four.
 */
const WRITABLE_DECISIONS = new Set(["approve", "reject", "acknowledge", "undo"]);

/** `edit` is never rendered as a decision button on any card. brain-core offers
 *  no such decision and no route that would accept one, so the control could
 *  only ever be a disabled placeholder — which was tried and rejected. Filtering
 *  by id (rather than merely not synthesising one) means a future core release
 *  that starts advertising `edit` cannot quietly resurrect the button either. */
export const EDIT_DECISION_ID = "edit";

/** Pill text for the rows raised by the payment agent — session payment intents
 *  and the durable review queue. Every decision row is pilled with the AGENT
 *  that raised it, and both of those sources are the payment agent, so the two
 *  pages must not drift into separate spellings of it. */
export const PAYMENT_AGENT_PILL = "Payment";

export type DecisionTone = "approve" | "reject" | "neutral" | "acknowledge";

export interface DecisionButton {
  /** Value sent to /decide. */
  id: string;
  /** Label brain-core wants shown ("Acknowledge", "Mark reviewed", …). */
  label: string;
  meaning: string | null;
  tone: DecisionTone;
  /** False when the id is outside the documented write set: the button renders,
   *  disabled, instead of firing a call the API would reject. */
  writable: boolean;
}

function toneFor(id: string): DecisionTone {
  if (id === "approve") return "approve";
  if (id === "reject") return "reject";
  if (id === "acknowledge") return "acknowledge";
  return "neutral";
}

/**
 * Build the footer buttons from `available_decisions` — never a hardcoded pair.
 *
 * Order is brain-core's, except that a destructive `reject` is pulled left of an
 * affirmative `approve` to match the existing Invoice/Cash Agent footer, where
 * Reject sits on the left. Falls back to `presentation.actions` (the same list,
 * mirrored) and finally to an empty list, which tells the caller to render the
 * read-only footer rather than inventing an Approve button.
 *
 * `available_decisions` is AUTHORITATIVE whenever core sent the field at all —
 * including when it sent an empty list. An empty list is core stating this record
 * accepts no decision, which is a different fact from the field being absent, and
 * only the latter may fall back to `presentation.actions`. Collapsing the two let a
 * mirrored presentation list resurrect an Approve button on a record whose
 * authoritative decision list was explicitly empty, and the API rejects that write.
 */
export function buildDecisionButtons(
  available: ProposalDecisionOption[] | null | undefined,
  fallback?: ProposalDecisionOption[] | null,
): DecisionButton[] {
  const source = (available ?? fallback) ?? [];
  const buttons = source
    .filter((d) => typeof d?.id === "string" && d.id.trim())
    .filter((d) => d.id.trim() !== EDIT_DECISION_ID)
    .map((d) => ({
      id: d.id.trim(),
      label: titleCaseDecisionLabel(d.label?.trim() || humanizeEnumValue(d.id.trim())),
      meaning: d.meaning?.trim() || null,
      tone: toneFor(d.id.trim()),
      writable: WRITABLE_DECISIONS.has(d.id.trim()),
    }));
  return buttons.sort((a, b) => rankTone(a.tone) - rankTone(b.tone));
}

function rankTone(tone: DecisionTone): number {
  return tone === "reject" ? 0 : tone === "neutral" ? 1 : 2;
}

/* ── Consequences ───────────────────────────────────────────────────────────── */

export interface ConsequenceLine {
  decisionId: string;
  label: string;
  text: string;
}

/**
 * Split `presentation.consequences` into the card's two prose sections.
 *
 * "What Happens Next" gets the consequences of the affirmative decisions (approve,
 * acknowledge, and any domain-specific id); "If This Is Wrong" gets the reject
 * path, which is precisely the "you disagreed" branch.
 *
 * Only decisions the proposal actually OFFERS are described, and only when core
 * wrote text for them — a null consequence yields no line, and a section with no
 * lines is omitted by the caller instead of being filled with generic copy.
 */
export function buildConsequences(
  consequences: ProposalConsequences | null | undefined,
  decisions: DecisionButton[],
): { next: ConsequenceLine[]; ifWrong: ConsequenceLine[] } {
  const next: ConsequenceLine[] = [];
  const ifWrong: ConsequenceLine[] = [];
  if (!consequences) return { next, ifWrong };

  for (const d of decisions) {
    const text = consequences[d.id];
    if (typeof text !== "string" || !text.trim()) continue;
    (d.tone === "reject" ? ifWrong : next).push({ decisionId: d.id, label: d.label, text: text.trim() });
  }
  return { next, ifWrong };
}

/* ── Why Brain Suggested This ─────────────────────────────────────────────────
   The frame opens every agent card with a short arrow-bullet list of the signals
   behind the proposal.

   brain-core publishes NO dedicated "reasons" array, so nothing here is authored
   by the client. Each bullet is read back from something the engine actually
   recorded while producing the record:

     • `policy.trace[].checks[]` — the checks the policy VM walked, but ONLY for
       trace entries that actually MATCHED. The trace records every rule the
       engine considered, including ones that did not fire; a check belonging to
       a rule that did not fire is not a reason this proposal exists, and listing
       it here would answer the section's question with something that had no
       bearing on the outcome. `matched` must be explicitly true — an entry that
       omits the flag leaves us unable to say the rule fired, so it is excluded
       rather than assumed (the same fail-closed rule the policy scope uses).
     • `details.ranked_signals` — the per-type scoring signals (fraud_anomaly and
       vendor_risk carry these) the agent ranked when it scored the record.

   A record carrying neither yields an empty list and the caller drops the whole
   section. That is the point: an approver who reads an invented reason is worse
   off than one who reads none, so this never falls back to generic copy. */

export interface ReasonBullet {
  text: string;
  /** The check's own verdict when it recorded one, else null.
   *
   *  This is carried through to the UI and RENDERED, never flattened away: a
   *  matched rule's checks can include both satisfied and failed conditions, so
   *  a list that showed them identically would let an approver read a passing
   *  check as the thing that escalated the record. A bullet whose source stated
   *  no verdict (every `ranked_signals` entry) is null and is shown as a plain
   *  observation rather than being given a verdict we do not have. */
  passed: boolean | null;
}

/** Keeps the list scannable; the full trace stays in Technical Detail. */
export const MAX_REASON_BULLETS = 5;

export function buildWhySuggested(
  policy: ProposalPolicy | null | undefined,
  details: ProposalDetails | null | undefined,
): ReasonBullet[] {
  const bullets: ReasonBullet[] = [];
  const seen = new Set<string>();

  const push = (raw: unknown, passed: boolean | null) => {
    if (typeof raw !== "string") return;
    const text = raw.trim();
    // A bare ULID is an identifier, not a reason a human can read.
    if (!text || isRawIdentifier(text)) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    bullets.push({ text, passed });
  };

  for (const entry of policy?.trace ?? []) {
    // Only rules that actually fired explain this proposal. See the note above.
    if (entry?.matched !== true) continue;
    for (const check of entry?.checks ?? []) {
      if (!check) continue;
      const verdict = typeof check.passed === "boolean" ? check.passed : null;
      // `detail` is the written sentence; `key` ("amount_over_limit") is the
      // machine name, humanized only when there is no sentence to prefer.
      if (typeof check.detail === "string" && check.detail.trim()) {
        push(check.detail, verdict);
      } else if (typeof check.key === "string" && check.key.trim()) {
        push(humanizeEnumValue(check.key), verdict);
      }
    }
  }

  const signals = details?.ranked_signals;
  if (Array.isArray(signals)) {
    for (const signal of signals) {
      if (typeof signal === "string") {
        push(signal, null);
        continue;
      }
      if (signal && typeof signal === "object") {
        const s = signal as Record<string, unknown>;
        // Prefer a written sentence; fall back to the signal's name humanized.
        const sentence = [s.detail, s.description, s.reason, s.explanation].find(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        );
        if (sentence) {
          push(sentence, null);
          continue;
        }
        const name = [s.label, s.name, s.signal, s.key].find(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        );
        if (name) push(humanizeEnumValue(name), null);
      }
    }
  }

  return bullets.slice(0, MAX_REASON_BULLETS);
}

/* ── Confidence ─────────────────────────────────────────────────────────────── */

export interface ConfidenceDisplay {
  /** "High" | "Medium" | "Low" — brain-core's band when it sends one. */
  band: string;
  pct: number;
  /** "High · 47%" */
  text: string;
}

/**
 * "High/Medium/Low · XX%".
 *
 * The band is brain-core's `presentation.confidence_band` when present — it is NOT
 * recomputed from the percentage, because the two genuinely disagree on live rows
 * (a fraud_anomaly row carries band "high" at 47%, where the band describes the
 * strength of the signal and the percentage the model's certainty). Deriving the
 * band locally would quietly overwrite core's judgement with our own.
 */
export function buildConfidence(
  confidence: number | null | undefined,
  band: string | null | undefined,
): ConfidenceDisplay | null {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return null;
  const pct = Math.round(confidence * 100);
  const resolved = band?.trim() ? humanizeEnumValue(band.trim()) : derivedBand(pct);
  return { band: resolved, pct, text: `${resolved} · ${pct}%` };
}

function derivedBand(pct: number): string {
  if (pct >= 80) return "High";
  if (pct >= 50) return "Medium";
  return "Low";
}

/* ── Evidence tiles ─────────────────────────────────────────────────────────── */

export interface EvidenceTile {
  /** Wiki page type / entity caption ("Transaction", "Counterparty"). */
  label: string;
  /** The resolved NAME. Never an id — an unresolved ref produces no tile. */
  display: string;
  /** Original evidence identity, used to open the matching record popup. */
  kind: string;
  ref: string;
  facts: { label: string; value: string }[];
}

/**
 * Evidence for the primary view, resolved to Wiki-backed labels.
 *
 * Two exclusions, both required by the contract:
 *  - `context` items (brain-core `wiki:` refs) describe the book the agent READ,
 *    not the record in question, so they belong in the technical layers;
 *  - anything that did not resolve to a name yields no tile, because the only
 *    thing we could show is the raw id the primary view must not contain
 *    (`pd_`/`evt_` refs are `resolvable: false` upstream and never resolve).
 */
export function buildEvidenceTiles(evidence: ProposalEvidenceItem[] | null | undefined): EvidenceTile[] {
  const tiles: EvidenceTile[] = [];
  const seen = new Set<string>();
  for (const e of evidence ?? []) {
    if (e.context) continue;
    const display = e.display?.trim();
    if (!display || isRawIdentifier(display)) continue;
    const label = e.label?.trim() || labelForEvidenceKind(e.kind);
    const key = `${label}|${display}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tiles.push({
      label,
      display,
      kind: e.kind,
      ref: e.ref,
      facts: (e.facts ?? []).filter((f) => f?.label && f?.value),
    });
  }
  return tiles;
}

function labelForEvidenceKind(kind: string): string {
  return humanizeEnumValue(kind || "Evidence");
}

/* ── Inbox routing ──────────────────────────────────────────────────────────── */

/**
 * Should this proposal appear in the Inbox as something the user acts on?
 *
 * Routing is by DECIDABILITY, not by `mode`. The old rule excluded every
 * `notify_only` record from Needs Review, which was right when the only signal was
 * `mode` — but the read model now states per proposal which decisions it accepts,
 * and notify-only rows (compliance findings, fraud holds) carry a real
 * `acknowledge` decision that a human must record. Excluding them stranded those
 * types in the Audit Log with no way to act on them.
 *
 * A row with no decisions at all is still informational and stays out.
 */
export function isDecidableProposal(p: {
  available_decisions?: ProposalDecisionOption[] | null;
  presentation?: { actions?: ProposalDecisionOption[] | null } | null;
  mode?: string;
}): boolean {
  const decisions = buildDecisionButtons(p.available_decisions, p.presentation?.actions ?? null);
  if (decisions.length > 0) return decisions.some((d) => d.writable);
  // Pre-#384 rows carry no decision list; fall back to the old mode-based rule so
  // an older core keeps behaving exactly as before.
  return p.mode !== "notify_only";
}

/** Advisory domains promoted by the read-model contract. They have no bespoke
 *  surface of their own — the assertion this list backs is that they route to the
 *  Inbox and render through the shared card, not a default view. */
export const ADVISORY_PROPOSAL_TYPES: ProposalType[] = [
  "bill_management",
  "cash_forecast",
  "debt_optimization",
  "financial_health",
  "personal_budget",
  "purchase_advisor",
  "savings",
  "tax_prep",
  "travel_finance",
];

export function isAdvisoryProposalType(type: string): boolean {
  return (ADVISORY_PROPOSAL_TYPES as string[]).includes(type);
}

/** Fallback key-fact builder for rows the BFF did not enrich (a cached pre-#384
 *  record, or any path that bypassed the enriching route). Same classification
 *  rules, minus the id→name resolution the server alone can do. */
export function keyFactsFromPresentation(facts: ProposalKeyFact[] | null | undefined): ResolvedKeyFact[] {
  return (facts ?? [])
    .filter((f) => f && typeof f.label === "string")
    .map((f) => {
      const value = f.value == null ? "" : String(f.value);
      return { label: f.label, value, technical: isIdentifierLabel(f.label) || isRawIdentifier(value) };
    })
    .filter((f) => f.value.trim() !== "");
}

/* ── Collections message draft ────────────────────────────────────────────────
   brain-core composes the outbound text at EXECUTION time, so a pending
   collections proposal carries no message to show. This composes a draft from
   the proposal's own resolved facts so the approver can read what the chase
   note will say before approving.

   Two rules keep it honest:
     • Every clause is dropped when its fact is missing — nothing here invents an
       amount, a date or an invoice number.
     • With no amount AND no invoice reference there is nothing concrete to
       chase, so the draft is withheld entirely rather than padded with filler.
   The card labels the result as a draft for review; it is not represented as
   the exact bytes brain-core will send. */

export interface DraftedMessage {
  subject: string;
  body: string;
}

const DRAFT_DAYS_RE = /(days?\s*(past\s*due|overdue)|overdue|aging|age)/i;
const DRAFT_DUE_DATE_RE = /(due\s*date|date\s*due)/i;
const DRAFT_AMOUNT_RE = /(amount|balance|outstanding|total|due)/i;
const DRAFT_INVOICE_RE = /(invoice|receivable|reference|document)/i;
const DRAFT_CUSTOMER_RE = /(customer|client|debtor|payer|counterparty|account\s*name|company)/i;
const HAS_DIGIT_RE = /\d/;

export function buildCollectionsDraft(
  facts: KeyFactRow[] | null | undefined,
  subjectName: string | null,
  senderName: string | null,
): DraftedMessage | null {
  let customer = subjectName?.trim() || null;
  let amount: string | null = null;
  let invoice: string | null = null;
  let daysOverdue: string | null = null;
  let dueDate: string | null = null;

  for (const row of facts ?? []) {
    const label = row.label?.trim() ?? "";
    const value = row.value?.trim() ?? "";
    if (!label || !value) continue;

    /* Order matters: "Days Past Due" and "Due Date" both contain "due", which is
       also an amount label. The narrower slots claim the row first. */
    if (!daysOverdue && DRAFT_DAYS_RE.test(label) && HAS_DIGIT_RE.test(value)) daysOverdue = value;
    else if (!dueDate && DRAFT_DUE_DATE_RE.test(label)) dueDate = value;
    else if (!amount && DRAFT_AMOUNT_RE.test(label) && HAS_DIGIT_RE.test(value)) amount = value;
    else if (!invoice && DRAFT_INVOICE_RE.test(label)) invoice = value;
    else if (!customer && DRAFT_CUSTOMER_RE.test(label)) customer = value;
  }

  if (!amount && !invoice) return null;

  const reference = invoice ? `invoice ${invoice}` : "your account";
  const amountClause = amount ? ` for ${amount}` : "";
  const overdueClause = daysOverdue
    ? ` is now ${/day/i.test(daysOverdue) ? daysOverdue : `${daysOverdue} days`} past due`
    : dueDate
      ? ` was due on ${dueDate}`
      : " is still outstanding";

  const subject = [invoice ? `Invoice ${invoice}` : "Outstanding balance", amount]
    .filter(Boolean)
    .join(": ");

  const body = [
    `Hi ${customer ?? "there"},`,
    "",
    `Our records show ${reference}${amountClause}${overdueClause}. If payment is already on its way, please ignore this note.`,
    "",
    "If there's a problem with the invoice, reply here and we'll get it sorted. Otherwise, could you confirm when we can expect payment?",
    "",
    "Thanks,",
    senderName?.trim() || "Accounts Receivable",
  ].join("\n");

  return { subject, body };
}

/* ── Bare amounts in brain-core prose ────────────────────────────────────────
   Core writes narratives like "…for 50000.00 scored 0.70 fraud anomaly risk":
   the amount arrives with no symbol, so the currency formatter walks past it and
   the sentence prints a raw ledger value beside a properly formatted table.

   Only a number with thousands grouping or 4+ integer digits AND exactly two
   decimals is treated as money. That deliberately excludes scores ("0.70"),
   percentages ("12.50%"), counts and versions — mislabelling one of those as
   currency would be worse than leaving an amount unformatted. */
const BARE_AMOUNT_RE =
  /(?<![\w$€£¥.,-])(?<!(?:USD|EUR|GBP|JPY|[$€£¥])\s)(\d{1,3}(?:,\d{3})+|\d{4,})\.(\d{2})(?![\d%])/g;

export function applyCurrencyToBareAmounts(text: string, currency: string | null | undefined): string {
  if (!text || !currency) return text;
  return text.replace(BARE_AMOUNT_RE, (m) => `${currency} ${m}`);
}
