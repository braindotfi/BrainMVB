/* Keeping /api/brain/* fresh after a document upload.
 *
 * Every query in this app defaults to staleTime: Infinity with no refetch on focus or
 * interval, so nothing reloads unless something explicitly invalidates it. Uploading
 * documents changes server-side data that Home/Finances/Inbox read through /api/brain/*,
 * which is why those pages used to sit stale until a logout/login remounted the tree.
 *
 * An upload finishes in TWO stages, and only the second one matters to those pages:
 *
 *   1. Extraction - brain-core reads the file into a parsed record (`extractStatus`).
 *   2. Projection - the chain behind it (APAR rebuild -> account/transaction rebuild ->
 *      wiki settle -> wiki regen -> agent trigger) turns that record into ledger rows
 *      (`projectionStatus`). "extracted" says nothing about whether this has run.
 *
 * We wait for stage 2 when brain-core tells us about it, and fall back to a timing
 * heuristic when it doesn't:
 *
 *   - Signal present: a document is in flight until its projection reports a terminal
 *     state, then we invalidate ONCE. That is precise, and usually faster than the old
 *     window because it fires the moment projection lands instead of on a fixed timer.
 *   - Signal absent: brain-core has not deployed the field on this environment, so we
 *     keep the original behaviour - invalidate on the extraction edge, then re-invalidate
 *     across a settle window to catch rows that land late. A missing signal must never
 *     hold a document in flight, or the refresh would stop firing altogether.
 *
 * This lives at the shell rather than in the upload modal for two reasons that both
 * still apply: we only learn any of this by polling the document list, so polling must
 * outlive the modal; and the projection we are waiting on continues after the user
 * closes it.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

export type DocumentExtractStatus =
  | "pending" | "ingested" | "extracting" | "extracted"
  | "unsupported" | "unavailable" | "failed";

export type DocumentProjectionStatus =
  | "pending" | "projecting" | "projected"
  | "projection_timed_out" | "projection_failed";

/** Statuses that mean brain-core is still reading the document. */
const IN_PROGRESS_STATUSES: ReadonlyArray<DocumentExtractStatus> = ["pending", "ingested", "extracting"];

/** Projection states that mean the ledger rows behind a document aren't final yet. */
const PROJECTION_IN_FLIGHT: ReadonlyArray<DocumentProjectionStatus> = ["pending", "projecting"];

/** Projection states that mean the chain stopped, however it ended. */
const PROJECTION_TERMINAL: ReadonlyArray<DocumentProjectionStatus> = [
  "projected", "projection_timed_out", "projection_failed",
];

const DOCUMENTS_KEY = "/api/integrations/documents";
const DOCUMENT_POLL_MS = 15_000;
const SETTLE_INTERVAL_MS = 20_000;
const SETTLE_WINDOW_MS = 3 * 60_000;

/**
 * Ceiling on how long a projection signal can hold a document in flight, measured from
 * upload. Without it, a status that never advances - a stalled chain, or brain-core's
 * migration backfilling an old document to "pending" where nothing will ever move it -
 * would wedge the refresh permanently. The BFF stops refreshing the mirror at the same
 * age against the same clock, so the two ends agree on when a document stops waiting.
 */
const PROJECTION_DEADLINE_MS = 10 * 60_000;

type DocumentProgressLike = {
  extractStatus: DocumentExtractStatus | null;
  projectionStatus?: DocumentProjectionStatus | null;
  uploadedAt?: string | null;
};

/** Stable empty reference so `docs` doesn't change identity on every render. */
const EMPTY_DOCS: DocumentProgressLike[] = [];

function hasProjectionSignal(d: DocumentProgressLike): boolean {
  return (d.projectionStatus ?? null) !== null;
}

/** Within the window where a projection signal is still allowed to mean anything. */
function withinProjectionDeadline(d: DocumentProgressLike, now: number): boolean {
  const uploadedAt = d.uploadedAt ? Date.parse(d.uploadedAt) : NaN;
  // No usable upload time means we cannot bound the wait, so we refuse to start one.
  if (Number.isNaN(uploadedAt)) return false;
  return now - uploadedAt < PROJECTION_DEADLINE_MS;
}

function projectionInFlight(d: DocumentProgressLike, now: number): boolean {
  const status = d.projectionStatus ?? null;
  if (status === null || !PROJECTION_IN_FLIGHT.includes(status)) return false;
  return withinProjectionDeadline(d, now);
}

/** True while any document is still being read OR still being projected. A missing
 *  extract status counts as pending, so a freshly uploaded document is never mistaken
 *  for a finished one; a missing PROJECTION status counts as no-signal and never holds
 *  a document in flight. */
export function documentsInProgress(docs: ReadonlyArray<DocumentProgressLike>, now: number = Date.now()): boolean {
  return docs.some((d) => {
    const extract = (d.extractStatus ?? "pending") as DocumentExtractStatus;
    if (IN_PROGRESS_STATUSES.includes(extract)) return true;
    return projectionInFlight(d, now);
  });
}

/**
 * True when work just finished and a real projection signal is what told us so.
 *
 * Only documents still inside the deadline count. That is what separates the two ways a
 * document can stop being in flight: one that reported `projected` moments ago is recent
 * AND terminal, so we know the chain ran and a single invalidation is enough. One that
 * aged out still sitting at `projecting` is excluded here, which correctly drops us back
 * to the settle window - we stopped waiting, but nothing ever told us it finished.
 */
export function projectionSettledCleanly(
  docs: ReadonlyArray<DocumentProgressLike>,
  now: number = Date.now(),
): boolean {
  const tracked = docs.filter((d) => hasProjectionSignal(d) && withinProjectionDeadline(d, now));
  return (
    tracked.length > 0 &&
    tracked.every((d) => PROJECTION_TERMINAL.includes(d.projectionStatus as DocumentProjectionStatus))
  );
}

/** Mark every /api/brain/* query stale. Mounted pages refetch immediately; unmounted ones
 *  refetch on their next mount, which they would not otherwise do under staleTime: Infinity. */
export function invalidateBrainNamespace(): void {
  void queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/"),
  });
}

/**
 * Watches document extraction and projection for the whole session and refreshes brain
 * data when they complete. Mount exactly once, inside the authenticated shell - it
 * deliberately outlives the Add Source modal and the onboarding flow so closing either
 * one early does not cancel the refresh.
 */
export function useBrainProjectionRefresh(): void {
  const docsQuery = useQuery<DocumentProgressLike[]>({ queryKey: [DOCUMENTS_KEY] });
  const docs = docsQuery.data ?? EMPTY_DOCS;

  // Re-evaluating the deadline needs a render, and a poll that returns identical data
  // won't cause one: React Query's structural sharing hands back the same object, so
  // nothing downstream changes. This tick makes each poll a render regardless, which is
  // what lets a purely time-based transition actually be noticed.
  const [, setTick] = useState(0);

  const anyInProgress = documentsInProgress(docs, Date.now());

  // Poll the document list while anything is still in flight. This also drives the
  // reading-status pills in the upload UI, which observe the same query key.
  useEffect(() => {
    if (!anyInProgress) return;
    const poll = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: [DOCUMENTS_KEY] });
      setTick((t) => t + 1);
    }, DOCUMENT_POLL_MS);
    return () => clearInterval(poll);
  }, [anyInProgress]);

  // On the in-progress -> done edge, refresh brain data. How long we keep refreshing
  // depends on whether a real projection signal is what ended the wait.
  const prevInProgress = useRef(anyInProgress);
  useEffect(() => {
    const justFinished = prevInProgress.current && !anyInProgress;
    prevInProgress.current = anyInProgress;
    if (!justFinished) return;

    invalidateBrainNamespace();

    // Projection reported terminal: the rows are already there, so one pass is enough.
    if (projectionSettledCleanly(docs, Date.now())) return;

    // No signal (or we gave up waiting for one) - fall back to the timing heuristic.
    const settle = setInterval(invalidateBrainNamespace, SETTLE_INTERVAL_MS);
    const stop = setTimeout(() => clearInterval(settle), SETTLE_WINDOW_MS);
    return () => {
      clearInterval(settle);
      clearTimeout(stop);
    };
    // `docs` is read only on the edge; re-running on every list change would restart the
    // settle window continuously while documents are being polled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyInProgress]);
}
