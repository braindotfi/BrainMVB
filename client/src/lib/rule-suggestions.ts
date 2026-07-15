import { useSyncExternalStore } from "react";
import type { RuleSuggestion } from "./proposalTypes";
import { apiRequest } from "./queryClient";

/* ── Rule suggestions store ───────────────────────────────────────────────────
   Evidence-backed AI suggestions Brain surfaces on the Rules page. Each carries
   the facts behind it + a confidence band, and is default unaccepted. Accepting
   runs the create-rule flow; dismissing hides it. The sidebar "Rules" badge
   counts the live (non-dismissed) suggestions via `.length`.
   Starts empty — `hydrateSuggestions` below fetches the tenant's live,
   grounded suggestions from GET /api/rules/suggestions. No backend persistence
   of the accept/dismiss state itself (session-only) — module state behind
   useSyncExternalStore. ──── */

let suggestions: RuleSuggestion[] = [];
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

/* Stable empty-array reference: the live list memo recomputes only on writes. */
let liveCache: RuleSuggestion[] = suggestions.filter((s) => !s.dismissed);
function recompute() {
  liveCache = suggestions.filter((s) => !s.dismissed);
}

const getSnapshot = () => liveCache;

export function useRuleSuggestions(): RuleSuggestion[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getSuggestion(id: string): RuleSuggestion | undefined {
  return suggestions.find((s) => s.id === id);
}

/* Hide a suggestion (no rule created). */
export function dismissSuggestion(id: string) {
  suggestions = suggestions.map((s) =>
    s.id === id ? { ...s, dismissed: true } : s,
  );
  recompute();
  notify();
}

/* Accept = remove from the list and hand the proposed rule back to the caller,
   which runs the explicit create-rule confirmation. */
export function acceptSuggestion(id: string): RuleSuggestion | undefined {
  const accepted = suggestions.find((s) => s.id === id);
  if (accepted) {
    suggestions = suggestions.filter((s) => s.id !== id);
    recompute();
    notify();
  }
  return accepted;
}

/* Fetch this tenant's live, grounded suggestions once per session (retried on
   the next mount if it fails). Fails soft — a failed fetch just leaves the
   list empty, never fabricated. Mirrors rulesStore's hydrateUserRules. */
let hydrated = false;
export async function hydrateSuggestions() {
  if (hydrated) return;
  hydrated = true;
  try {
    const res = await apiRequest("GET", "/api/rules/suggestions");
    const body: { suggestions?: RuleSuggestion[] } = await res.json();
    suggestions = body.suggestions ?? [];
    recompute();
    notify();
  } catch (err) {
    hydrated = false; // allow a retry on the next mount
    console.warn("[rule-suggestions] failed to hydrate suggestions", err);
  }
}
