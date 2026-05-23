import { useSyncExternalStore } from "react";
import { useAuth } from "./authContext";

const DEFAULT_PHONE = "+1 (415) 555-0192";

let phone: string = DEFAULT_PHONE;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function setUserPhone(next: string) {
  phone = next;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return phone;
}

export function useUserContact() {
  const { user } = useAuth();
  const currentPhone = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    email: user?.email ?? "treasury@acme.com",
    phone: currentPhone,
  };
}
