/**
 * Whether the Inbox is showing everything it claims to be counting.
 *
 * The page prints two bare numbers — the Unresolved tab badge and the
 * "Awaiting you" pill — and both are built from feeds that silently cap. The
 * proposals read asks for 100 rows and the audit read asks for 100 events;
 * brain-core answers with a page and a cursor, and nothing above ever looked at
 * the cursor. A tenant past either cap therefore saw a prefix presented as a
 * total, with no way to tell.
 *
 * The two caps are not the same failure, and this deliberately does not
 * flatten them into one "list may be incomplete" line:
 *
 *   - A capped PROPOSALS read means unresolved records exist that are not on
 *     screen. The count is a floor. Work is missing.
 *   - A capped AUDIT read means the decided-proposal set is a floor, so a
 *     record someone already settled can still be listed as unresolved. The
 *     count is inflated, and nothing is missing.
 *
 * Under-reporting work and over-reporting it need opposite responses from the
 * reader, so they get opposite sentences.
 *
 * This is a completeness notice, NOT an error. It is suppressed while a feed is
 * unreachable, because "couldn't load" already leads and stacking a second
 * hedge under it just dilutes the first.
 */

export interface InboxCompletenessInput {
  /** Which tab is on screen — the two caps land on different tabs. */
  tab: "Unresolved" | "Resolved";
  /** GET /v1/proposals handed back a cursor, or filled the page exactly. */
  proposalsTruncated: boolean;
  /** GET /v1/audit/events handed back a cursor, or filled the page exactly. */
  auditTruncated: boolean;
  /** Any contributing feed failed. Errors own the banner slot when they happen. */
  unreachable: boolean;
}

/**
 * The sentence to print above the rows, or null when the list is complete.
 *
 * Returns prose rather than a boolean so the caller cannot pick its own wording
 * and quietly describe a floor as a total.
 */
export function inboxCompletenessNotice(input: InboxCompletenessInput): string | null {
  if (input.unreachable) return null;

  if (input.tab === "Resolved") {
    /* Resolved is built from the audit feed alone; the proposals cap cannot
       affect it, so its cursor is not consulted here. */
    return input.auditTruncated
      ? "Showing the most recent decisions only. Older history isn't on this list, so this count is not your full record."
      : null;
  }

  const parts: string[] = [];
  if (input.proposalsTruncated) {
    parts.push(
      "Brain returned more records than this page reads at once, so this count is a floor — some unresolved records aren't shown.",
    );
  }
  if (input.auditTruncated) {
    parts.push(
      "Brain could only read the most recent decisions, so something already decided may still be listed here.",
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
