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
 * How long we keep re-POSTing /raw/{id}/extract for a document stuck at "extracting".
 * Generous, because extraction genuinely can take a while and a document past this point
 * stays "extracting" - we don't know what happened, and inventing a terminal status
 * would be a lie.
 */
export const EXTRACT_SETTLE_MAX_AGE_MS = 60 * 60 * 1000;

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

/** Extraction is still running and recent enough to be worth another poll. */
export function needsExtractSettle(d: SettleCandidate, now: number): boolean {
  return d.extractStatus === "extracting" && ageMs(d, now) < EXTRACT_SETTLE_MAX_AGE_MS;
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
export function needsProjectionSettle(d: SettleCandidate, now: number): boolean {
  return (
    d.extractStatus === "extracted" &&
    !isTerminalProjectionStatus(d.projectionStatus) &&
    ageMs(d, now) < PROJECTION_SETTLE_MAX_AGE_MS
  );
}

/** Whether this document warrants any upstream call at all this request. */
export function shouldSettle(d: SettleCandidate, now: number): boolean {
  return Boolean(d.rawId) && (needsExtractSettle(d, now) || needsProjectionSettle(d, now));
}
