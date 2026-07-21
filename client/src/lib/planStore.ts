/**
 * Billing plan store — the SINGLE source of truth for the selected plan.
 *
 * There is no billing backend yet, so the plan lives in localStorage and starts
 * honestly unselected (null). Settings → Billing WRITES it; the Developers
 * Usage & Limits page READS it (rate-limit tier). Both surfaces stay in sync
 * via a tiny subscribe API (works across components and browser tabs).
 */

import { useSyncExternalStore } from "react";

export type PlanId = "free" | "pro" | "business";

const STORAGE_KEY = "brain_billing_plan";
const VALID: PlanId[] = ["free", "pro", "business"];

/** Rate-limit tier for each plan — the Developers Usage page renders this. */
export const PLAN_RATE_LIMITS: Record<PlanId, { tier: string; requestsPerMin: number; burst: number }> = {
  free:     { tier: "Starter",  requestsPerMin: 60,   burst: 100 },
  pro:      { tier: "Standard", requestsPerMin: 600,  burst: 1200 },
  business: { tier: "Scale",    requestsPerMin: 3000, burst: 6000 },
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function getPlanId(): PlanId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && (VALID as string[]).includes(raw) ? (raw as PlanId) : null;
  } catch {
    return null;
  }
}

export function setPlanId(planId: PlanId | null): void {
  try {
    if (planId === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, planId);
  } catch {
    /* storage unavailable — listeners still get the in-memory update */
  }
  listeners.forEach((l) => l());
}

/** React hook — re-renders when the plan changes anywhere (this tab or another). */
export function usePlanId(): PlanId | null {
  return useSyncExternalStore(subscribePlan, getPlanId, () => null);
}

export function subscribePlan(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
