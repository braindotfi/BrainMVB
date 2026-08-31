/* ── Demo-user detection (single source of truth) ─────────────────────────────
   These are the ONLY accounts that may see client-side demo-only presentation data.
   Durable ordinary signups also receive backend-persisted Brightline and Raw fixtures,
   but remain real authenticated users and do not cross this client presentation fence.
   SHARED_DEMO_EMAIL stays recognised here even though its route was deleted:
   the account may still exist from before the removal, and it must keep
   classifying as demo so it is never mistaken for a real signup.
   The auth layer uses this single predicate for publicUser.isDemo and the
   resulting client-side demo-presentation fence. Durable signup seeding is
   intentionally independent of this classification. */

export const SHARED_DEMO_EMAIL = "demo@brain.fi";

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e === SHARED_DEMO_EMAIL || /^demo-fresh-[0-9a-f-]+@brain\.fi$/.test(e);
}
