/* ── Demo-user detection (single source of truth) ─────────────────────────────
   The ONLY accounts that may ever see seeded/synthetic data are the demo
   accounts created by POST /api/auth/demo-fresh (demo-fresh-<id>@brain.fi).
   SHARED_DEMO_EMAIL stays recognised here even though its route was deleted:
   the account may still exist from before the removal, and it must keep
   classifying as demo so it is never mistaken for a real signup. Real signups
   must
   start genuinely empty — zero sources, zero ledger, zero raw-layer seed.
   Both the auth layer (publicUser.isDemo) and the brain-core starter seed
   gate (server/brain/auth.ts) check through here so the definition can
   never drift between them. */

export const SHARED_DEMO_EMAIL = "demo@brain.fi";

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e === SHARED_DEMO_EMAIL || /^demo-fresh-[0-9a-f-]+@brain\.fi$/.test(e);
}
