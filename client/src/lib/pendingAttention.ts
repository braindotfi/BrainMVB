/**
 * Overview's one-line answer to "how much is waiting on me?".
 *
 * ## Why this is a function and not three lines inside the page
 *
 * The wording is the product decision here, not the arithmetic. Overview prints
 * a single number that stands in for the whole Inbox: if that number is
 * confident when the underlying reads were not, the page has told the tenant
 * they are clear when nobody actually checked. Keeping the phrasing rules in one
 * pure function is what lets every one of those cases be asserted directly,
 * including the two that only appear when something is broken.
 *
 * ## The five states
 *
 * | reads        | work found | result                                       |
 * |--------------|------------|----------------------------------------------|
 * | still coming | any        | "Checking what's waiting on you…"             |
 * | complete     | none       | `null` — render nothing                       |
 * | complete     | some       | "N items need your attention"                 |
 * | incomplete   | some       | "At least N …" plus a line naming the gap     |
 * | incomplete   | none       | an explicit "couldn't check" row              |
 *
 * The last two rows are the important ones. Hiding the line when the total is
 * zero is right when zero is a fact and dangerous when it is an artefact — an
 * absent alert reads as an all-clear, and "nothing is waiting on you" is the
 * single most consequential thing this product can say wrongly. So neither a
 * failed read nor an unfinished one is allowed to look like a quiet day: the
 * surrounding KPI cards resolve fast, so a blank space beside them reads as an
 * answer rather than as a page that has not finished asking.
 */

export type PendingAttentionTone = "urgent" | "normal" | "partial" | "unknown" | "loading";

export interface PendingAttentionCounts {
  /** Proposals whose tier is `urgent` — a writable decision plus materiality. */
  urgent: number;
  /** Everything else awaiting a decision: payment intents and waiting-tier proposals. */
  waiting: number;
  /** Stalled agent runs asking the tenant for information (Needs Your Input). */
  input: number;
  /**
   * True when ANY contributing read failed or stopped short of the full trail.
   * Truncation counts: at the audit page cap, an absent stalled run is not
   * evidence that there isn't one.
   */
  incomplete: boolean;
  /** True while any contributing read is still in flight. */
  loading?: boolean;
}

export interface PendingAttentionSummary {
  total: number;
  urgent: number;
  tone: PendingAttentionTone;
  /** Headline. Carries the "At least" hedge itself so callers can't drop it. */
  text: string;
  /** Second line: the breakdown, and what was unreadable when something was. */
  detail: string;
}

const INCOMPLETE_NOTE = "some sources couldn't be read, so there may be more";

export function pendingAttentionSummary({
  urgent,
  waiting,
  input,
  incomplete,
  loading = false,
}: PendingAttentionCounts): PendingAttentionSummary | null {
  const total = urgent + waiting + input;

  /* Checked before anything else, INCLUDING a non-zero total: a partial count
     drawn mid-load is a number that will change under the reader, and this line
     is the one people use to decide they are done. */
  if (loading) {
    return {
      total,
      urgent: 0,
      tone: "loading",
      text: "Checking what's waiting on you…",
      detail: "",
    };
  }

  if (total === 0) {
    if (!incomplete) return null;
    return {
      total: 0,
      urgent: 0,
      tone: "unknown",
      text: "Brain couldn't check what's waiting on you",
      /* Names the cause, because "0" and "unknown" look identical otherwise and
         only one of them is safe to act on. */
      detail: "This is a connection problem, not an empty queue. Open the Inbox to try again.",
    };
  }

  const parts: string[] = [];
  if (urgent > 0) parts.push(`${urgent} urgent`);
  if (input > 0) parts.push(`${input} needing your input`);
  if (waiting > 0) parts.push(`${waiting} waiting on you`);

  return {
    total,
    urgent,
    /* Urgency still shows through a partial read — a known-urgent item does not
       become less urgent because a second feed timed out — but the hedge in the
       wording is what stops the count being read as complete. */
    tone: incomplete ? "partial" : urgent > 0 ? "urgent" : "normal",
    text: `${incomplete ? "At least " : ""}${total} ${total === 1 ? "item needs" : "items need"} your attention`,
    detail: incomplete ? [...parts, INCOMPLETE_NOTE].join(" · ") : parts.join(" · "),
  };
}
