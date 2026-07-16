/* Canonical actor / member registry - the people who can take governed actions
   (approve payments, change rules). Kept deliberately minimal: this is the seam
   the upcoming members/limits spec will grow into (roles, approval limits, the
   "within her $10K payroll limit" authority line). Until then it carries just the
   display role so lifecycle steps can show WHO decided in WHICH capacity without
   hardcoding role strings per audit record. */

export interface Actor {
  id: string;
  email: string;
  role: string; // e.g. "finance admin" - the muted role suffix on approval steps
}

export const ACTORS: Actor[] = [
  { id: "sarah-meridian", email: "sarah@meridian", role: "finance admin" },
];

function norm(v?: string): string {
  return (v ?? "").trim().toLowerCase();
}

/* Resolve an actor from any identifier we store on records/steps (email or id).
   "system" and unknown identifiers resolve to undefined (no human role). */
export function resolveActor(identifier?: string): Actor | undefined {
  const key = norm(identifier);
  if (!key || key === "system") return undefined;
  return ACTORS.find((a) => norm(a.email) === key || norm(a.id) === key);
}

export function resolveActorRole(identifier?: string): string | undefined {
  return resolveActor(identifier)?.role;
}

/* Identity tokens for an actor - used by the segregation-of-duties guard to check
   an approver isn't also the payee. Includes the raw identifier plus the resolved
   email/id so a match is caught regardless of which form a payee row carries. */
export function actorIdentityTokens(identifier?: string): string[] {
  const tokens = new Set<string>();
  const raw = norm(identifier);
  if (raw && raw !== "system") tokens.add(raw);
  const actor = resolveActor(identifier);
  if (actor) {
    tokens.add(norm(actor.email));
    tokens.add(norm(actor.id));
  }
  tokens.delete("");
  return Array.from(tokens);
}
