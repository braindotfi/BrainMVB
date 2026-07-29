/**
 * First-visit onboarding state, keyed per signed-in user.
 *
 * The key format lives here and NOWHERE else. It is read by HomePage to decide whether to
 * show the onboarding flow, and written both when a user finishes onboarding and when the
 * public "Continue with Demo" button pre-marks it complete so the walkthrough opens on a
 * populated Home. If those spellings ever drift apart, onboarding silently reappears for
 * demo visitors - which is exactly the kind of failure nobody notices until a live demo.
 */

/** Storage key for a user's onboarding state, or null when there is no signed-in user. */
export function onboardingKey(userId: string | null | undefined): string | null {
  return userId ? `brain_onboarding_complete_${userId}` : null;
}

/** True once this user has seen (or been opted out of) onboarding. */
export function isOnboardingComplete(userId: string | null | undefined): boolean {
  const key = onboardingKey(userId);
  if (!key) return false;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Storage unavailable (private mode, blocked cookies): treat as not-yet-onboarded
    // rather than throwing, so the app still renders.
    return false;
  }
}

/** Mark onboarding done for this user. No-ops when storage is unavailable. */
export function markOnboardingComplete(userId: string | null | undefined): void {
  const key = onboardingKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore storage errors */
  }
}
