/**
 * Open/close animation for the record cards — and why paging must not use it.
 *
 * The five detail surfaces (payment review, proposal detail, live proposal,
 * live insight, settled audit record) are five separate dialogs. Previous/Next
 * walks one list that mixes all five, so stepping from a proposal to a ledger
 * insight closes one dialog and opens a different one. With the normal entrance
 * animation that reads as a NEW card being thrown up — the insight card zoomed
 * in from nothing while its neighbours simply swapped their contents, and the
 * one record that happened to be a different component looked like a different
 * kind of thing.
 *
 * Paging is one card changing what it shows. So a surface opened by a pager
 * step skips its entrance animation, and only a genuine open — from a row, a
 * search result, a deep link — animates in.
 *
 * Exits are left alone: the outgoing card fading under the incoming one is what
 * makes the swap read as continuous rather than as a cut.
 */
import { useRef } from "react";

const ENTER = "data-[state=open]:animate-in data-[state=open]:fade-in-0";
const EXIT = "data-[state=closed]:animate-out data-[state=closed]:fade-out-0";
const CARD_ENTER = `${ENTER} data-[state=open]:zoom-in-95`;
const CARD_EXIT = `${EXIT} data-[state=closed]:zoom-out-95`;

export interface CardTransitionClasses {
  /** Applied to the dialog's Overlay. */
  overlay: string;
  /** Applied to the dialog's Content. */
  card: string;
}

/** The two class sets, split out from the hook so they can be asserted directly. */
export function cardTransitionClasses(suppressEntrance: boolean): CardTransitionClasses {
  return suppressEntrance
    ? { overlay: EXIT, card: CARD_EXIT }
    : { overlay: `${ENTER} ${EXIT}`, card: `${CARD_ENTER} ${CARD_EXIT}` };
}

/**
 * `pagerStep` is read once, at the moment the surface opens, and held for as
 * long as it stays open.
 *
 * **Why:** the classes decide a CSS animation that runs at mount. Letting them
 * change while the card is open either cancels the animation mid-flight or
 * starts it late — both look worse than either choice made consistently.
 */
export function useCardTransition(open: boolean, pagerStep?: boolean): CardTransitionClasses {
  const suppressed = useRef(false);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) suppressed.current = Boolean(pagerStep);
  wasOpen.current = open;

  return cardTransitionClasses(suppressed.current);
}
