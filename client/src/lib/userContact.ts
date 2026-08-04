import { useSyncExternalStore } from "react";

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
 * Called from applyUserScopedResets (authContext.tsx).
 *
 * `isDemo` controls localStorage rehydration:
 *   true  → set hydrated=true so the next render does NOT reload from localStorage.
 *           A real user's brain_profile_email / brain_profile_phone must not bleed
 *           into a demo session, even if the reset already cleared the in-memory value.
 *   false → set hydrated=false so the next render DOES reload from localStorage.
 *           A real user logging in (or back in) should recover their own saved contact
 *           info from a prior session.
 */
export function resetUserContact(isDemo = false) {
  emailOverride = null;
  phoneOverride = null;
  hydrated = isDemo; // skip localStorage reload for demo; allow it for real users
  emit();
}

/**
 * Returns the display email and phone for the current user.
 *
 * `userEmail` is the raw email from the auth context (user?.email). Callers
 * must supply it — this hook no longer imports useAuth itself, which would
 * create a circular dependency (authContext → userContact → authContext).
 */
export function useUserContact(userEmail?: string | null) {
  // One-time global rehydration from localStorage (skipped for demo users —
  // see resetUserContact(isDemo=true) which sets hydrated=true to prevent this).
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
    email: emailOverride ?? userEmail ?? EMAIL_NOT_SET,
    phone: phoneOverride ?? PHONE_NOT_SET,
  };
}
