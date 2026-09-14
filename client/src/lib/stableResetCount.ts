import { useLayoutEffect, useMemo, useRef } from "react";

interface SettledCountSnapshot {
  count: number;
  optimisticKeys: Set<string>;
}

export type AuthoritativeCountState = "ready" | "loading" | "error";

/** Keep the last complete count visible while an authoritative query is reset.
 *
 * The settled numeric count deliberately preserves distinct history rows. Only
 * optimistic records need identities: a newly-created receipt adds one during
 * the gap, while receipts that existed in the last committed snapshot add
 * nothing (including ones whose authoritative audit event had superseded them). */
export function useStableResetCount(
  currentCount: number,
  optimisticKeys: readonly string[],
  authoritativeState: AuthoritativeCountState,
): number | undefined {
  const currentOptimistic = useMemo(() => new Set(optimisticKeys), [optimisticKeys]);
  const settledRef = useRef<SettledCountSnapshot | null>(null);
  const isReady = authoritativeState === "ready";

  /* Commit-phase capture prevents an abandoned concurrent render from changing
     the snapshot a later loading/error render relies on. Only a successful
     authoritative read may replace it. */
  useLayoutEffect(() => {
    if (!isReady) return;
    settledRef.current = {
      count: currentCount,
      optimisticKeys: currentOptimistic,
    };
  }, [currentCount, currentOptimistic, isReady]);

  if (isReady) return currentCount;
  /* Before the first authoritative read there is no total to preserve. Hiding
     the optional badge is more honest than presenting a receipt-only count,
     whether that read is still loading or has failed. */
  if (!settledRef.current) return undefined;

  let createdDuringReset = 0;
  for (const key of currentOptimistic) {
    if (!settledRef.current.optimisticKeys.has(key)) createdDuringReset += 1;
  }
  return settledRef.current.count + createdDuringReset;
}