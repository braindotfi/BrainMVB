/**
 * brain-core's per-document PROJECTION status - the signal that says whether the
 * side-effect chain behind an upload (APAR rebuild -> account/transaction rebuild ->
 * wiki settle -> wiki regen -> agent trigger) has finished.
 *
 * This is deliberately separate from `extractStatus`. Extraction producing a parsed
 * record is only the FIRST half of an upload; the projection that turns that record
 * into ledger rows runs afterwards, and "extracted" says nothing about it.
 *
 * Two properties of this field decide every rule below, and they fail in OPPOSITE
 * directions, so both matter:
 *
 *  1. It is not deployed everywhere yet. brain-core merged it, but the live and staging
 *     OpenAPI specs (checked 2026-07-28) do not expose it, so today every response omits
 *     it. Absent therefore has to mean "no information", never "still projecting" -
 *     otherwise a document would look permanently in flight and the post-upload refresh
 *     would stop firing entirely.
 *
 *  2. Its migration backfills every PRE-EXISTING upload artifact to `pending`, not
 *     `projected`, and nothing will ever advance those rows - their projection ran long
 *     before the column existed. So `pending` read off an arbitrary historical document
 *     is meaningless. We only ever record a status for a document we are actively
 *     chasing right after its upload, which keeps backfilled rows at NULL locally.
 *
 * It is documented as a lifecycle signal, NOT a row-count validator: `projected` means
 * the chain ran, not that it produced any particular number of rows. Use audit events
 * (e.g. `ledger.apar_projection.rebuilt`) for produced-row diagnostics.
 */
import type { ProjectionStatus } from "../storage";

const PROJECTION_STATUSES: ReadonlyArray<ProjectionStatus> = [
  "pending",
  "projecting",
  "projected",
  "projection_timed_out",
  "projection_failed",
];

/** Statuses that mean the projection chain has stopped, however it ended. */
const TERMINAL_PROJECTION_STATUSES: ReadonlyArray<ProjectionStatus> = [
  "projected",
  "projection_timed_out",
  "projection_failed",
];

/**
 * Narrow an untrusted brain-core value to a known status, or null.
 *
 * This is the capability gate for the whole feature: anything we don't recognise -
 * a missing field on a deployment that predates it, a null, or a status added upstream
 * later - collapses to null, and null never gates the refresh. That is what lets this
 * code ship before brain-core deploys the field and light up on its own afterwards.
 */
export function projectionStatusFrom(value: unknown): ProjectionStatus | null {
  return typeof value === "string" && (PROJECTION_STATUSES as ReadonlyArray<string>).includes(value)
    ? (value as ProjectionStatus)
    : null;
}

/** True once the projection chain has settled. NULL is NOT terminal - it is "unknown". */
export function isTerminalProjectionStatus(status: ProjectionStatus | null): boolean {
  return status !== null && TERMINAL_PROJECTION_STATUSES.includes(status);
}
