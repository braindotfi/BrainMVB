/* Keeping /api/brain/* fresh after a document upload.
 *
 * Every query in this app defaults to staleTime: Infinity with no refetch on focus or
 * interval, so nothing reloads unless something explicitly invalidates it. Uploading
 * documents changes server-side data that Home/Finances/Inbox read through /api/brain/*,
 * which is why those pages used to sit stale until a logout/login remounted the tree.
 *
 * Two things have to be true for the refresh to actually land, and both are why this lives
 * at the shell instead of inside the upload modal:
 *
 *   1. We only learn extraction finished by polling the document list. If polling stops
 *      when the modal closes, closing mid-extraction means we never see it finish.
 *   2. "extracted" only means brain-core's extract job succeeded. The ledger projection
 *      behind it (APAR rebuild -> account/transaction rebuild -> wiki regen -> agent
 *      trigger) runs afterwards, and there is no per-document "projected" signal today.
 *      So we re-invalidate across a settle window to catch results that land late.
 *
 * The settle window is a timing heuristic, not a guarantee. It stops being one once
 * brain-core exposes a real per-document projected status.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

export type DocumentExtractStatus =
  | "pending" | "ingested" | "extracting" | "extracted"
  | "unsupported" | "unavailable" | "failed";

/** Statuses that mean brain-core is still reading the document. */
const IN_PROGRESS_STATUSES: ReadonlyArray<DocumentExtractStatus> = ["pending", "ingested", "extracting"];

const DOCUMENTS_KEY = "/api/integrations/documents";
const DOCUMENT_POLL_MS = 15_000;
const SETTLE_INTERVAL_MS = 20_000;
const SETTLE_WINDOW_MS = 3 * 60_000;

type DocumentProgressLike = { extractStatus: DocumentExtractStatus | null };

/** True while any document is still being read. A missing status counts as pending, so a
 *  freshly uploaded document is never mistaken for a finished one. */
export function documentsInProgress(docs: ReadonlyArray<DocumentProgressLike>): boolean {
  return docs.some((d) =>
    IN_PROGRESS_STATUSES.includes((d.extractStatus ?? "pending") as DocumentExtractStatus),
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
 * Watches document extraction for the whole session and refreshes brain data when it
 * completes. Mount exactly once, inside the authenticated shell — it deliberately outlives
 * the Add Source modal and the onboarding flow so closing either one early does not
 * cancel the refresh.
 */
export function useBrainProjectionRefresh(): void {
  const docsQuery = useQuery<DocumentProgressLike[]>({ queryKey: [DOCUMENTS_KEY] });
  const anyInProgress = documentsInProgress(docsQuery.data ?? []);

  // Poll the document list while anything is still being read. This also drives the
  // reading-status pills in the upload UI, which observe the same query key.
  useEffect(() => {
    if (!anyInProgress) return;
    const poll = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: [DOCUMENTS_KEY] });
    }, DOCUMENT_POLL_MS);
    return () => clearInterval(poll);
  }, [anyInProgress]);

  // On the in-progress -> done edge, refresh brain data now and keep refreshing for the
  // settle window, since the projection behind the extraction may still be running.
  const prevInProgress = useRef(anyInProgress);
  useEffect(() => {
    const justFinished = prevInProgress.current && !anyInProgress;
    prevInProgress.current = anyInProgress;
    if (!justFinished) return;

    invalidateBrainNamespace();
    const settle = setInterval(invalidateBrainNamespace, SETTLE_INTERVAL_MS);
    const stop = setTimeout(() => clearInterval(settle), SETTLE_WINDOW_MS);
    return () => {
      clearInterval(settle);
      clearTimeout(stop);
    };
  }, [anyInProgress]);
}
