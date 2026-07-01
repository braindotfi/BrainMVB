import { useSyncExternalStore } from "react";
import type { ProposalStatus } from "./proposalTypes";

/* ── Shared review-status store ────────────────────────────────────────────────
   Single source of truth for user-driven proposal status overrides, keyed by
   proposal id. The Review page's approval queue AND the Home page's "Brain
   Detected" widget both read/write here, so a decision made in either surface is
   reflected in the other (a proposal approved from Home leaves the Home queue
   and shows as executing on Review, and vice-versa).

   No backend, no localStorage — module state behind useSyncExternalStore, the
   same pattern as rulesStore.ts. Every transition is user-initiated; there is no
   setTimeout / auto-settle anywhere.
   ──────────────────────────────────────────────────────────────────────────── */

let statuses: Record<string, ProposalStatus> = {};
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

const getSnapshot = () => statuses;

/** React hook: the current override map. Re-renders on any status change. */
export function useReviewStatuses(): Record<string, ProposalStatus> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Set (or clear) the override for a proposal. */
export function setReviewStatus(id: string, status: ProposalStatus): void {
  statuses = { ...statuses, [id]: status };
  notify();
}
