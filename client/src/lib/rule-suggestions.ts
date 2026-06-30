import { useSyncExternalStore } from "react";
import type { RuleSuggestion } from "./proposalTypes";
import { INITIAL_SUGGESTIONS } from "./mockRules";

/* ── Rule suggestions store ───────────────────────────────────────────────────
   Evidence-backed AI suggestions Brain surfaces on the Rules page. Each carries
   the facts behind it + a confidence band, and is default unaccepted. Accepting
   runs the create-rule flow; dismissing hides it. The sidebar "Rules" badge
   counts the live (non-dismissed) suggestions via `.length`.
   No backend, no localStorage — module state behind useSyncExternalStore. ──── */

function seed(): RuleSuggestion[] {
  return INITIAL_SUGGESTIONS.map((s) => ({
    ...s,
    evidence: s.evidence.map((e) => ({ ...e })),
    proposedRule: { ...s.proposedRule },
  }));
}

let suggestions: RuleSuggestion[] = seed();
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
