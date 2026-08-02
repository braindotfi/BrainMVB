/**
 * Backup-approver marks — a UI-only field, and deliberately labelled as one.
 *
 * brain-core's member model has `role` (admin/approver/viewer) and an approval
 * envelope (`domains`, `perItemLimit`, `requiresSecondApproverAbove`). There is
 * no backup-approver concept anywhere in it. Sending an unrecognised field to
 * `PATCH /api/brain/members/:id` would be worse than not saving at all: core
 * drops it, the request succeeds, the UI shows the mark, and it disappears on
 * the next reload with no error to explain why.
 *
 * So the mark is held here, in the browser, and every surface that renders it
 * has to say what it is — see `BACKUP_APPROVER_NOTE`. Nothing in the approval
 * path reads this store, and nothing should until core grows a real role: a
 * value that looks like authority but enforces nothing is exactly the kind of
 * thing an operator would reasonably rely on in a hurry.
 *
 * Member ids are tenant-scoped, so a mark must never survive into a different
 * account. The scoping is done by KEY (`brain_backup_approvers_{userId}`) rather
 * than by clearing on every auth transition: the reset funnel also runs when the
 * session is restored on page load, and clearing there would silently drop the
 * mark on every refresh while looking like it saved.
 */

import { useSyncExternalStore } from "react";

const KEY_PREFIX = "brain_backup_approvers_";

export const BACKUP_APPROVER_NOTE =
  "Recorded here only. Brain core has no backup-approver role yet, so this changes nothing about who can approve what.";

type Listener = () => void;
const listeners = new Set<Listener>();

const EMPTY: ReadonlySet<string> = new Set();

let scopeUserId: string | null = null;

/* useSyncExternalStore compares snapshots by identity, so parsing storage on
   every call would hand React a fresh Set each render and spin forever. The
   parsed value is cached and dropped only when something actually changes. */
let cached: ReadonlySet<string> | null = null;

function storageKey(): string | null {
  return scopeUserId ? `${KEY_PREFIX}${scopeUserId}` : null;
}

function notify(): void {
  cached = null;
  listeners.forEach((l) => l());
}

function read(): ReadonlySet<string> {
  if (cached) return cached;
  const key = storageKey();
  if (!key) {
    cached = EMPTY;
    return cached;
  }
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cached = new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    cached = new Set();
  }
  return cached;
}

/** Point the store at the signed-in account. Called from `applyUserScopedResets`. */
export function setBackupApproverScope(userId: string | null): void {
  if (scopeUserId === userId) return;
  scopeUserId = userId;
  notify();
}

export function isBackupApprover(memberId: string): boolean {
  return read().has(memberId);
}

export function setBackupApprover(memberId: string, value: boolean): void {
  const key = storageKey();
  if (!key) return;
  const current = read();
  if (current.has(memberId) === value) return;
  const next = new Set(current);
  if (value) next.add(memberId);
  else next.delete(memberId);
  cached = next;
  try {
    localStorage.setItem(key, JSON.stringify([...next]));
  } catch {
    /* storage unavailable — the in-memory value still stands for this session */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey()) {
      cached = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Re-renders when a mark changes in this tab or another. */
export function useBackupApprovers(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
