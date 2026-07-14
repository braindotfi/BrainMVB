import { useSyncExternalStore } from "react";
import { useAuth } from "./authContext";

const DEFAULT_PHONE = "+1 (415) 555-0192";

let phone: string = DEFAULT_PHONE;
let emailOverride: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function setUserPhone(next: string) {
  phone = next;
  emit();
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
  return `${phone}|${emailOverride ?? ""}`;
}

export function useUserContact() {
  const { user } = useAuth();
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    email: emailOverride ?? user?.email ?? "demo@brain.fi",
    phone,
  };
}
