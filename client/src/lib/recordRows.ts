/**
 * ONE row presentation for every live record, shared by Overview and the Inbox.
 *
 * Both screens list the same four sources — session payment intents, the
 * durable review queue, brain-core agent proposals and read-only ledger
 * insights — from the same hooks, and each screen used to spell out its own
 * title, pill and second line. They drifted every time either was touched: the
 * same cash-flow record pilled grey "Informational" on one screen and amber
 * "Cash Forecasting" on the other, and the payment rows showed the recorded
 * reasoning on the Inbox but the vendor and due date on Overview.
 *
 * The Inbox is the canonical reading of a record, so these presenters reproduce
 * ITS wording, and Overview consumes them. Anything genuinely page-specific —
 * which buttons a row offers, whether it is bulk-selectable, what clicking it
 * opens — stays with the page. Only the words and the pill live here.
 */
import { PAYMENT_AGENT_PILL } from "./proposalCards";
import type { ReviewItemType } from "@/components/ReviewItems";
import type { LiveInsight } from "./brainAgentSurfaces";

/** Currency helpers the pages already hold (useCurrency). Passed in rather than
 *  imported so these stay plain functions a test can call. */
export interface RowFormatters {
  /** Number → the tenant's display currency. */
  format: (value: number) => string;
  /** Backend prose carrying bare amounts → the same, with those amounts converted. */
  formatText: (text: string) => string;
}

export interface RowBadge {
  label: string;
  className: string;
  srLabel?: string;
}

export interface RecordRowPresentation {
  title: string;
  badge: RowBadge;
  subtitle?: string;
  /** Trailing note on the row — the due/needs-approval label where one exists. */
  note?: string;
}

/**
 * The pill every live record wears: the AGENT that raised it, in amber.
 *
 * The name answers "who is asking" in a list mixing four record types, and one
 * colour keeps that list reading as a single queue. Severity and risk band are
 * NOT encoded here — they are stated in full on the card the row opens, and a
 * second pill colour in the list only ever got read as a second category of
 * thing. Border COLOUR only; the pill element adds `border border-solid`
 * itself (chip convention).
 */
export const ROW_TAG_AGENT = "bg-brain-v1dark-orange text-brain-v1light-orange border-[rgba(255,149,0,0.2)]";

/** Amber says "needs you" to anyone who sees colour. These carry the same fact
 *  as text for anyone who does not. */
function agentBadge(label: string, srLabel: string): RowBadge {
  return { label, className: ROW_TAG_AGENT, srLabel };
}

/** `amount · detail`, skipping whichever the record does not carry. */
function joinLine(...parts: (string | undefined | null)[]): string | undefined {
  return parts.filter(Boolean).join(" · ") || undefined;
}

/** Recorded reasoning wins over a bare descriptor: "Why: …" is the sentence a
 *  reviewer needs, and it is the line the Inbox has always shown. */
function detailLine(why: string | undefined, fallback: string | undefined, fmt: RowFormatters) {
  if (why) return `Why: ${fmt.formatText(why)}`;
  return fallback ? fmt.formatText(fallback) : undefined;
}

/** Session-scoped payment intent (this browser session's proposals). */
export function sessionIntentRow(item: ReviewItemType, fmt: RowFormatters): RecordRowPresentation {
  return {
    title: fmt.formatText(item.title),
    badge: agentBadge(PAYMENT_AGENT_PILL, "needs approval"),
    subtitle: joinLine(
      item.amount,
      detailLine(item.description, item.vendor ? `${item.vendor} · ${item.due}` : item.due, fmt),
    ),
    note: item.dueBy || undefined,
  };
}

/** A durable brain-core PaymentIntent from the review queue. Typed structurally
 *  so the two pages can pass their own queue records without this module
 *  depending on either page's imports. */
export interface QueueRecordLike {
  title: string;
  rowSubtitle?: string;
  rationale?: string;
  severity?: string;
  dueLabel?: string;
  amount?: number | null;
  amountDisplay?: string;
}

export function queueIntentRow(p: QueueRecordLike, fmt: RowFormatters): RecordRowPresentation {
  return {
    title: fmt.formatText(p.title),
    badge: agentBadge(
      PAYMENT_AGENT_PILL,
      p.severity === "danger" ? "high risk" : p.severity === "warning" ? "elevated" : "needs review",
    ),
    subtitle: joinLine(
      typeof p.amount === "number" ? fmt.format(p.amount) : p.amountDisplay,
      detailLine(p.rationale, p.rowSubtitle, fmt),
    ),
    note: p.dueLabel || undefined,
  };
}

/**
 * A live brain-core agent proposal. Its title and narrative are built by
 * `buildProposalHeaderCopy`, which has already converted the amounts, so the
 * caller passes that copy in rather than this module re-deriving (and
 * re-formatting) it.
 */
export function liveProposalRow(
  headerCopy: { title: string; text: string },
  pillName: string,
  /** Set when other live proposals cite the same record — see
   *  `proposalInvoiceIdentity`. Two agent sweeps can both propose on one
   *  invoice, and each is a separate approval, so the rows say so rather than
   *  one of them being hidden. */
  note?: string,
): RecordRowPresentation {
  return {
    title: headerCopy.title,
    badge: agentBadge(pillName, "needs review"),
    subtitle: headerCopy.text || undefined,
    note: note || undefined,
  };
}

/**
 * A read-only ledger insight.
 *
 * It gets the same amber agent pill as everything else in the list: it was
 * raised by an agent and it sits in the same queue, and giving it its own
 * colour is what made one screen's copy of the record look like a different
 * record from the other's. What it CANNOT do — be approved — is stated on the
 * card it opens, which is where the reader learns it.
 */
export function insightRow(insight: LiveInsight, fmt: RowFormatters): RecordRowPresentation {
  return {
    title: fmt.formatText(insight.title),
    badge: agentBadge(insight.badge || "Detected", "informational"),
    /* The record's own subtitle carries its figures. The reasoning stays on the
       card as "Why Brain Suggested This" — promoting it into the row on one
       screen only is exactly how the two drifted apart. */
    subtitle: fmt.formatText(insight.subtitle ?? "Brain noticed this in your ledger."),
  };
}
