/**
 * What an assistant citation can be opened as, when the record it names is a payable.
 *
 * The assistant cites ledger records by id. Obligations have **no by-id route** —
 * `GET /ledger/obligations/{id}` is a 404 — so the list read IS the lookup, and a
 * citation opens the Payable popup only when that read is holding the record.
 *
 * That makes the *completeness* of the read part of the answer. brain-core's list
 * endpoints cap their page silently, so a single unpaged fetch returns SOME rows with
 * HTTP 200 and nothing saying otherwise. A miss against that partial map means one of
 * two entirely different things:
 *
 *   - the walk finished and the record genuinely is not a payable, or
 *   - the walk never got that far, and we simply do not know.
 *
 * Collapsing them renders the second as the first: a confident little evidence card
 * that repeats the id back, implying the record has nothing more behind it, when in
 * fact the full Payable record was one unread page away. So the state is four-valued,
 * and only `absent` licenses that card.
 */

/** The four answers a payable lookup can give. Only `absent` is a negative fact. */
export type PayableLookup =
  /** The read is holding this record — open the Payable popup. */
  | "held"
  /** The walk completed and this id is not in it. A real "no such payable". */
  | "absent"
  /** The read has not come back yet. Nobody has looked. */
  | "pending"
  /** The read failed, or stopped short of the last page. Nobody could look. */
  | "unavailable";

export function payableLookup(input: {
  /** Whether the obligations map contains the cited id. */
  held: boolean;
  /** The cursor walk, or null while it is still in flight. */
  read: { complete: boolean } | null;
  /** The read errored. */
  failed: boolean;
}): PayableLookup {
  /* Holding the record outranks everything: a partial read that happens to contain
     the citation still opens the right popup. Completeness only matters for a MISS. */
  if (input.held) return "held";
  if (input.failed) return "unavailable";
  if (input.read == null) return "pending";
  return input.read.complete ? "absent" : "unavailable";
}

/**
 * Kinds the assistant resolves through their own caches, so a miss against the
 * obligations read says nothing about them.
 *
 * The check is deliberately one-sided. brain-core labels a payable citation
 * inconsistently — obligation, payable, liability, or nothing at all — so an
 * unrecognised label is treated as a possible payable rather than ruled out. Only a
 * kind this surface positively resolves elsewhere is excluded.
 */
const NOT_PAYABLE_KINDS = new Set(["account", "transaction", "invoice", "counterparty", "member"]);

/** Whether a citation of this kind could be a payable, and so is worth a note. */
export function mayBePayable(kind: string | null | undefined): boolean {
  return !kind || !NOT_PAYABLE_KINDS.has(kind);
}

/** Popup title for a citation that could not be resolved to a record. */
export const UNRESOLVED_CITATION_LABEL = "Couldn't open this record";

/**
 * Why a citation could not be opened, or null when the lookup gave a real answer.
 *
 * Neither sentence guesses at what the record is or how much of the ledger is
 * missing — both are unknown, and the only honest claim is that the lookup did not
 * happen. `pending` and `unavailable` are worded apart because "still loading" is
 * fixed by waiting and "couldn't be read" is not.
 */
export function unresolvedCitationNote(state: PayableLookup): string | null {
  if (state === "pending") {
    return "Still reading your payables, so this record couldn't be looked up yet. Try again in a moment.";
  }
  if (state === "unavailable") {
    return "Your payables couldn't be read in full, so this record couldn't be looked up in them.";
  }
  return null;
}
