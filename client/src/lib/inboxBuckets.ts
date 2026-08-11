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
  /* A published decision list is the authority, whatever the source field says
     — including when it is EMPTY, which means nothing may be written.

     It is checked FIRST, ahead of the `kind: "detection"` shortcut below, and
     that ordering is the point rather than an accident. The row's own action
     buttons are built from this same list, so a detection that ever gained a
     writable approve would render Approve/Reject under a heading that says the
     row is only for information — the exact heading-versus-buttons split this
     function exists to close, just pointing the other way. Today no detection
     publishes one; if that changes, the section follows the buttons. */
  if (item.liveDecisions) {
    return item.liveDecisions.some((d) => d.writable && (d.id === "approve" || d.id === "reject"))
      ? "approval"
      : "awareness";
  }

  /* Ledger-derived observations with no published list propose nothing. */
  if (item.kind === "detection") return "awareness";

  /* Everything else (payment intents, in-session rows): `actionable` is this
     surface's own record of whether it draws Approve / Reject, so grouping by
     it asks the same question one level up. */
  return item.actionable ? "approval" : "awareness";
}
