/* ── Demo-mode gate (client) ──────────────────────────────────────────────────
   Single module-level flag every demo-only surface checks before showing any
   seeded/synthetic data. Set from the server's `user.isDemo` (publicUser in
   server/auth.ts — the ONLY source of truth for who is a demo account) by
   AuthProvider whenever the signed-in user changes. Real accounts must render
   genuine empty states, never disguised mock data.

   Module state (not React context) on purpose: non-React resolvers like
   openProposalDetail.ts need to read it synchronously. A useSyncExternalStore
   hook is provided for components that render on it. */

import { useSyncExternalStore } from "react";

let demoDataEnabled = false;
const listeners = new Set<() => void>();

export function setDemoDataEnabled(enabled: boolean) {
  if (demoDataEnabled === enabled) return;
  demoDataEnabled = enabled;
  listeners.forEach((l) => l());
}

export function isDemoDataEnabled(): boolean {
  return demoDataEnabled;
}

export function useIsDemoData(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => demoDataEnabled,
    () => demoDataEnabled,
  );
}
