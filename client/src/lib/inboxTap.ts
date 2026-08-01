/**
 * Where does tapping an Inbox timeline row take the user?
 *
 * Answer: NEVER to another route. Every row — pending or settled — opens its
 * detail surface in place, on top of the /inbox timeline. Settled history used
 * to `navigate("/audit-log?record=…")`, which swapped the whole page for the
 * old six-tab Audit Log; that regression is exactly what this module guards
 * against, so the return type deliberately has NO navigation variant. If a
 * future change wants a row tap to leave /inbox, it has to change this type,
 * and `inboxTap.test.ts` will make it explain itself.
 *
 * The precedence here mirrors the source payloads on InboxItem (exactly one is
 * set per row, but the order still matters if that invariant ever slips):
 * live agent proposal → §6 intent → insight → proposal sheet → audit popup.
 */

/** The payload fields of an InboxItem that drive tap behavior. */
export type InboxTapSource<TProposal, TIntent, TInsight, TRecord, TLive> = {
  proposal?: TProposal;
  proposalIsLive?: boolean;
  intent?: TIntent;
  insight?: TInsight;
  record?: TRecord;
  liveAgentProposal?: TLive;
};

export type InboxTapTarget<TProposal, TIntent, TInsight, TRecord, TLive> =
  | { surface: "agent-proposal-modal"; proposal: TLive }
  | { surface: "intent-modal"; intent: TIntent }
  | { surface: "insight-modal"; insight: TInsight }
  | { surface: "proposal-sheet"; proposal: TProposal; isLive: boolean }
  /* Settled history (approved / rejected / acknowledged / auto-approved):
     the audit record popup opens IN PLACE. Not a route change. */
  | { surface: "audit-popup"; record: TRecord }
  | { surface: "none" };

export function inboxTapTarget<TP, TI, TN, TR, TL>(
  item: InboxTapSource<TP, TI, TN, TR, TL>,
): InboxTapTarget<TP, TI, TN, TR, TL> {
  if (item.liveAgentProposal != null) return { surface: "agent-proposal-modal", proposal: item.liveAgentProposal };
  if (item.intent != null) return { surface: "intent-modal", intent: item.intent };
  if (item.insight != null) return { surface: "insight-modal", insight: item.insight };
  if (item.proposal != null) return { surface: "proposal-sheet", proposal: item.proposal, isLive: Boolean(item.proposalIsLive) };
  if (item.record != null) return { surface: "audit-popup", record: item.record };
  return { surface: "none" };
}
