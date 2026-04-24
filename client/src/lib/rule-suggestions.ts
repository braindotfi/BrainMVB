import { useSyncExternalStore } from "react";

export type RuleSuggestion = {
  id: number;
  title: string;
  description: string;
  active: boolean;
};

const INITIAL: RuleSuggestion[] = [
  {
    id: 6,
    title: "Run payroll on payday",
    description:
      "Every other Friday, I'll check the amounts look normal and ask you first if anything changed.",
    active: true,
  },
];

let suggestions: RuleSuggestion[] = INITIAL;
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

const getSnapshot = () => suggestions;

export function useRuleSuggestions(): RuleSuggestion[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function toggleSuggestion(id: number) {
  suggestions = suggestions.map((r) =>
    r.id === id ? { ...r, active: !r.active } : r,
  );
  notify();
}

export function dismissSuggestion(id: number) {
  suggestions = suggestions.filter((r) => r.id !== id);
  notify();
}

export function acceptSuggestion(id: number): RuleSuggestion | undefined {
  const accepted = suggestions.find((r) => r.id === id);
  suggestions = suggestions.filter((r) => r.id !== id);
  notify();
  return accepted;
}
