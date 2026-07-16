import { useSyncExternalStore } from "react";
import { useAuth } from "./authContext";

// ponytail: no phone field on the users table and no SMS provider wired up —
// the app has no real phone number to show or edit, so this is a fixed
// "Not set" rather than an editable value. Add when a real phone field +
// verification flow exists.
const PHONE_NOT_SET = "Not set";

let emailOverride: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function setUserEmail(next: string) {
  emailOverride = next;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return emailOverride ?? "";
}

export function useUserContact() {
  const { user } = useAuth();
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    email: emailOverride ?? user?.email ?? "demo@brain.fi",
    phone: PHONE_NOT_SET,
  };
}
