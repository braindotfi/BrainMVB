import { useSyncExternalStore } from "react";
import { useAuth } from "./authContext";

// ponytail: no phone field on the users table and no SMS provider wired up —
// the app has no real phone number to show or edit, so this is a fixed
// "Not set" rather than an editable value. Add when a real phone field +
// verification flow exists.
const PHONE_NOT_SET = "Not set";
const EMAIL_NOT_SET = "Not set";

let emailOverride: string | null = null;
let phoneOverride: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function setUserEmail(next: string) {
  emailOverride = next;
  try { localStorage.setItem("brain_profile_email", next); } catch {}
  emit();
}

export function setUserPhone(next: string) {
  phoneOverride = next;
  try { localStorage.setItem("brain_profile_phone", next); } catch {}
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return `${emailOverride ?? ""}|${phoneOverride ?? ""}`;
}

let hydrated = false;

/**
 * Clear the in-memory email and phone overrides on every auth transition.
 * Called from applyUserScopedResets (authContext.tsx) so stale contact info
 * from a real user's session can never bleed into a subsequent demo session.
 * Does NOT touch localStorage — those values belong to the authenticated user
 * who set them and will be reloaded on their next login via the hydration block.
 */
export function resetUserContact() {
  emailOverride = null;
  phoneOverride = null;
  hydrated = false; // allow the next useUserContact() call to rehydrate from localStorage
  emit();
}

export function useUserContact() {
  const { user } = useAuth();
  // One-time global rehydration from localStorage
  if (!hydrated) {
    hydrated = true;
    try {
      const storedEmail = localStorage.getItem("brain_profile_email");
      if (storedEmail && storedEmail !== (emailOverride ?? "")) {
        emailOverride = storedEmail;
      }
    } catch {}
    try {
      const storedPhone = localStorage.getItem("brain_profile_phone");
      if (storedPhone && storedPhone !== (phoneOverride ?? "")) {
        phoneOverride = storedPhone;
      }
    } catch {}
  }
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    email: emailOverride ?? user?.email ?? EMAIL_NOT_SET,
    phone: phoneOverride ?? PHONE_NOT_SET,
  };
}
