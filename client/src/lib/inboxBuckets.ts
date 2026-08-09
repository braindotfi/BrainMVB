/**
 * Which of the Inbox's Unresolved sections a record belongs in.
 *
 * ## Why not `kind`
 *
 * The split used to read `InboxItem.kind`, which looks like the right field and
 * is not. `kind` is stamped per SOURCE at the point each feed is pushed into the
 * list — every agent proposal is `"proposal"` whatever brain-core will actually
 * accept for it. So a notify_only fraud or compliance finding, whose only
 * writable decision is `acknowledge`, landed under a heading demanding a
 * decision, directly above a single Acknowledge button. The heading and the
 * buttons were reading two different fields, which is the only way they could
 * ever have disagreed.
 *
 * Sorting on the outcome the record supports removes that class of bug: the
 * section and the buttons now answer the same question.
 *
 * ## What counts as a decision
 *
 * `acknowledge` and `undo` are writes, but they record that you SAW something
 * rather than settling it. Only an `approve` or `reject` that core will accept
 * is a decision, and that is the single test applied here — the same rule
 * `deriveProposalTier` uses to keep acknowledge-only records out of Overview's
 * pending count, so the two surfaces cannot disagree about what is outstanding.
 */

/** The fields a record must expose to be sorted. `InboxItem` satisfies this. */
export interface BucketableRecord {
  /** Where the row came from. Never sufficient on its own — see above. */
  kind: "proposal" | "detection";
  /** Whether the surface drew Approve / Reject for this row. */
  actionable: boolean;
  /** brain-core's published decision list, when the record has one. */
  liveDecisions?: readonly { id: string; writable: boolean }[];
}

export type InboxBucket = "approval" | "awareness";

export function inboxBucket(item: BucketableRecord): InboxBucket {
  /* Ledger-derived observations propose nothing by construction. */
  if (item.kind === "detection") return "awareness";

  /* When core published a decision list, it is the authority — including when
     it published an EMPTY one, which means nothing may be written and the row
     is awareness whatever its source field says. */
  if (item.liveDecisions) {
    return item.liveDecisions.some((d) => d.writable && (d.id === "approve" || d.id === "reject"))
      ? "approval"
      : "awareness";
  }

  /* Rows with no per-record decision list (payment intents, in-session rows):
     `actionable` is this surface's own record of whether it draws Approve /
     Reject, so grouping by it asks the same question one level up. */
  return item.actionable ? "approval" : "awareness";
}
