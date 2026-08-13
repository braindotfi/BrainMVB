/**
 * Locally-saved profile contact overrides (email/phone) — a UI-only field,
 * same category as backupApprover.ts's marks: brain-core's member model has
 * no editable contact-email/phone concept independent of the account's login
 * email, so a Settings "Edit Email"/"Edit Phone" save is held here, in the
 * browser, not sent to core.
 *
 * Scoped by KEY (`brain_profile_email_{userId}` / `brain_profile_phone_{userId}`),
 * not cleared-and-reloaded on every auth transition — same rationale as
 * backupApprover.ts: the reset funnel (applyUserScopedResets) also runs on
 * session bootstrap (page load), and clearing there would silently drop a
 * real saved override on every refresh while looking like it saved.
 *
 * This replaces a prior design that stored both fields under a single
 * unscoped `brain_profile_email` / `brain_profile_phone` key shared by every
 * account that ever logged in on that browser: real user A saves a custom
 * email, then real user B registers a brand-new account on the same browser
 * and sees user A's saved email instead of their own, forever, until B also
 * happens to save one. Key-scoping fixes this the same way it already fixed
 * the identical class of bug for backup-approver marks — a demo account's
 * freshly-minted id never collides with a real user's saved key, so demo
 * sessions naturally never inherit real contact info either, with no
 * separate isDemo flag needed here (unlike the old design).
 */

import { useSyncExternalStore } from "react";

const PHONE_NOT_SET = "Not set";
const EMAIL_NOT_SET = "Not set";
const EMAIL_KEY_PREFIX = "brain_profile_email_";
const PHONE_KEY_PREFIX = "brain_profile_phone_";

// Pre-scoping keys. Never read again under the new design — removed on every
// scope change purely so they don't linger in a real user's browser storage
// looking like they mean something. No data migration needed: an affected
// account simply falls back to its own real email/phone/name on next load,
// which is the correct value anyway. `brain_profile_name` belongs to
// SettingsPage.tsx (a separate, now-also-fixed override), cleaned up here too
// since this is the one shared entry point already wired into every auth
// transition via applyUserScopedResets. removeItem() is idempotent (a no-op
// once the key is gone), so this runs on every call rather than gating with
// a "ran once" flag — simpler, and avoids the flag surviving in memory for
// the rest of a long-lived tab in a way that's awkward to reason about or
// test.
const LEGACY_EMAIL_KEY = "brain_profile_email";
const LEGACY_PHONE_KEY = "brain_profile_phone";
const LEGACY_NAME_KEY = "brain_profile_name";
function clearLegacyKeys(): void {
  try {
    localStorage.removeItem(LEGACY_EMAIL_KEY);
    localStorage.removeItem(LEGACY_PHONE_KEY);
    localStorage.removeItem(LEGACY_NAME_KEY);
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

let scopeUserId: string | null = null;

/* useSyncExternalStore compares snapshots by identity, so re-reading storage
   on every call would hand React a fresh object each render. Cached and
   dropped only when something actually changes — same pattern as
   backupApprover.ts's `cached`. */
let cached: { email: string | null; phone: string | null } | null = null;

function emailKey(): string | null {
  return scopeUserId ? `${EMAIL_KEY_PREFIX}${scopeUserId}` : null;
}

function phoneKey(): string | null {
  return scopeUserId ? `${PHONE_KEY_PREFIX}${scopeUserId}` : null;
}

function notify(): void {
  cached = null;
  listeners.forEach((l) => l());
}

/* Stable identity for the "nothing readable" case, so a server/pre-scope
   snapshot never hands useSyncExternalStore a fresh object. */
const EMPTY: { email: string | null; phone: string | null } = { email: null, phone: null };

function read(): { email: string | null; phone: string | null } {
  if (cached) return cached;
  const ek = emailKey();
  const pk = phoneKey();
  let email: string | null = null;
  let phone: string | null = null;
  if (ek) {
    try {
      email = localStorage.getItem(ek);
    } catch {
      /* storage unavailable — no saved override for this session */
    }
  }
  if (pk) {
    try {
      phone = localStorage.getItem(pk);
    } catch {
      /* storage unavailable */
    }
  }
  cached = { email, phone };
  return cached;
}

/**
 * Point the store at the signed-in account. Called from
 * `applyUserScopedResets` (authContext.tsx) on every user change — logout,
 * login, register, demo-fresh, and session bootstrap.
 */
export function setUserContactScope(userId: string | null): void {
  clearLegacyKeys();
  if (scopeUserId === userId) return;
  scopeUserId = userId;
  notify();
}

export function setUserEmail(next: string): void {
  const key = emailKey();
  if (!key) return;
  cached = { email: next, phone: read().phone };
  try {
    localStorage.setItem(key, next);
  } catch {
    /* storage unavailable — the in-memory value still stands for this session */
  }
  listeners.forEach((l) => l());
}

export function setUserPhone(next: string): void {
  const key = phoneKey();
  if (!key) return;
  cached = { email: read().email, phone: next };
  try {
    localStorage.setItem(key, next);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/**
 * Exported for tests (userContact.test.ts's two-tab suite): the storage-event
 * handler compares `e.key` against keys computed from THIS tab's scope, which
 * is exactly what keeps a write in a tab signed into a different account from
 * bleeding into this one. React consumers get it via useUserContact below.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === emailKey() || e.key === phoneKey()) {
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

/* `read()` itself is the snapshot: it caches, and `notify()`/the setters are the
   only things that replace the cached object, so identity is stable between
   renders and changes exactly when the value does. Deliberately NOT a serialized
   `email|phone` string — both fields are free text that may contain "|", so
   distinct pairs can serialize identically ("a|b" + null and "a" + "b|" both give
   "a|b|") and useSyncExternalStore would then skip the re-render, leaving a
   consumer that doesn't independently re-render on auth (BillingSection reads this
   hook without useAuth) showing the previous account's contact info — the exact
   leak this change exists to close. */
function getServerSnapshot(): { email: string | null; phone: string | null } {
  return EMPTY;
}

/** Plain-function snapshot, same split as acknowledgedStore.ts's
 *  acknowledgedRecordsSnapshot()/useAcknowledgedRecords() — lets tests (and any
 *  non-React caller) read the current value without needing
 *  @testing-library/react, which this repo doesn't have. */
export function userContactSnapshot(): { email: string | null; phone: string | null } {
  return read();
}

/**
 * Returns the display email and phone for the current user.
 *
 * `userEmail` is the raw email from the auth context (user?.email). Callers
 * must supply it, used as the fallback when no saved override exists for
 * this account.
 */
export function useUserContact(userEmail?: string | null) {
  const { email, phone } = useSyncExternalStore(subscribe, read, getServerSnapshot);
  return {
    email: email ?? userEmail ?? EMAIL_NOT_SET,
    phone: phone ?? PHONE_NOT_SET,
  };
}
