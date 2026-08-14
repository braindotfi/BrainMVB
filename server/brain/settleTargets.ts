/**
 * Which uploaded documents the documents endpoint should chase upstream, and why.
 *
 * This is a hot path guarded by two very different clocks, so the rules live here as
 * pure predicates rather than inline in the route: getting either bound wrong is silent
 * and only shows up as either a wedged refresh or a flood of upstream calls.
 */
import type { ExtractStatus, ProjectionStatus } from "../storage";
import { isTerminalProjectionStatus } from "./projectionStatus";

/**
 * How long we keep reading GET /raw/{id} for a document's projection status.
 *
 * Deliberately far shorter than the extraction window. Projection starts once extraction
 * has produced a parsed record and takes seconds to a few minutes, so a document with no
 * terminal status after this long is one we will never hear about - either brain-core
 * hasn't deployed the field (the case on every environment today) or the chain died
 * without reporting. Past this point we stop calling upstream and leave the mirror NULL,
 * which the client reads as "no signal". The client applies the SAME bound to the SAME
 * `uploadedAt` clock, so both ends agree on when a document stops waiting.
 */
export const PROJECTION_SETTLE_MAX_AGE_MS = 10 * 60 * 1000;

export type SettleCandidate = {
  rawId: string | null;
  extractStatus: ExtractStatus | null;
  projectionStatus: ProjectionStatus | null;
  uploadedAt: string; // ISO
};

function ageMs(d: SettleCandidate, now: number): number {
  return now - new Date(d.uploadedAt).getTime();
}

/**
 * Extraction is still non-terminal locally, so it is worth one more check.
 *
 * Deliberately UNBOUNDED by age: brain-core's POST /raw/{id}/extract is idempotent
 * and cheap (an already-terminal job just returns its settled state), and the caller
 * caps fan-out per request via SETTLE_MAX_PER_REQUEST. An age cutoff here previously
 * meant a document could get stuck showing "extracting" forever if the one settle
 * window happened to close before the client polled again (e.g. the user navigated
 * away) - even though brain-core had already resolved it, often within seconds. Never
 * silently stop asking; brain-core's own terminal status is authoritative once it
 * exists, at any age.
 *
 * "unavailable" gets the same treatment as "extracting", not just "unsupported"/
 * "failed": it is set whenever the ingest-time extract call throws ANYTHING that
 * is not a clean 422 (a network error, a 404, a 500, an auth hiccup) - confirmed
 * live twice: a document landed "unavailable" locally while brain-core's own job
 * had already reached a genuine terminal "failed" within seconds. "unavailable"
 * is "we don't actually know", not "brain-core told us no" - the same category
 * "extracting" is, so it deserves the same never-give-up re-check.
 */
export function needsExtractSettle(d: SettleCandidate): boolean {
  return d.extractStatus === "extracting" || d.extractStatus === "unavailable";
}

/**
 * Projection is worth reading: extraction produced a parsed record, we have no terminal
 * answer yet, and the document is recent enough that an answer is still plausible.
 *
 * The age bound is what protects us from brain-core's migration, which backfills every
 * PRE-EXISTING upload artifact to "pending" and then never advances it. Without the
 * bound we would mirror that "pending" onto old documents and hold the post-upload
 * refresh open forever on rows whose projection actually finished months ago.
 */
export function needsProjectionSettle(
  d: SettleCandidate,
  now: number,
): boolean {
  return (
    d.extractStatus === "extracted" &&
    !isTerminalProjectionStatus(d.projectionStatus) &&
    ageMs(d, now) < PROJECTION_SETTLE_MAX_AGE_MS
  );
}

/** Whether this document warrants any upstream call at all this request. */
export function shouldSettle(d: SettleCandidate, now: number): boolean {
  return (
    Boolean(d.rawId) && (needsExtractSettle(d) || needsProjectionSettle(d, now))
  );
}
