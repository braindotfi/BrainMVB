/**
 * The resolved view of one obligation: GET /ledger/obligations/{id}/resolved.
 *
 * WHY THIS IS A SEPARATE READ
 *
 * `/ledger/obligations` returns each observation verbatim. When two sources describe
 * the same debt — an uploaded invoice and the accounting export, say — brain-core keeps
 * BOTH rows and never overwrites one with the other. The resolved view is where it says
 * which observation it treats as authoritative, where the observations disagree, and
 * what GL coding the accounting-side observation carried.
 *
 * Two facts about this endpoint, both measured against a live tenant rather than read
 * off brain-core's source:
 *
 *   1. The plain by-id route `/ledger/obligations/{id}` is a 404. There is no way to
 *      re-read a single obligation except through `/resolved` or the list.
 *   2. `resolved.gl_accounts` is `null` and `conflicts` is `[]` for a tenant whose
 *      obligations each came from exactly one document. Those are ordinary states, not
 *      failures, and the popup omits the corresponding rows rather than rendering a
 *      blank "GL Account -".
 *
 * FAILURE IS NOT EMPTINESS
 *
 * `fetchResolvedObligation` returns `null` only for a 404 — brain-core does not know
 * this obligation. Every other failure throws, so a caller that cannot reach the
 * endpoint renders "couldn't check" instead of quietly claiming the amounts agree.
 * That distinction is the whole point: a swallowed error here would turn an unread
 * conflict into a clean bill of health.
 */

/** One value a field took, and which observation asserted it. */
export type ConflictValue = {
  value: string;
  obligation_id: string;
  provenance: string | null;
};

/** brain-core only computes conflicts for these two fields today. The field is kept as
 *  a plain string rather than a union so a third one added upstream still renders. */
export type ObligationConflict = {
  field: string;
  values: ConflictValue[];
};

export type ResolvedObligation = {
  /** GL codes from the accounting-side observation, or null when none carried any. */
  glAccounts: string[] | null;
  /** Disagreements between observations. Empty when they agree — or when there is one. */
  conflicts: ObligationConflict[];
  /** How many observations back this obligation. 1 means a single source. */
  observationCount: number;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function normalizeConflict(raw: unknown): ObligationConflict | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const field = str(o.field);
  if (!field) return null;
  const values = Array.isArray(o.values)
    ? o.values
        .map((v): ConflictValue | null => {
          if (!v || typeof v !== "object") return null;
          const e = v as Record<string, unknown>;
          /* A conflict value can legitimately be a number on the wire even though
             brain-core types it as a string, so it is stringified rather than dropped.
             A conflict we cannot name every side of is worse than useless — it tells
             the user something disagrees without showing what. */
          const value =
            typeof e.value === "string"
              ? e.value
              : typeof e.value === "number" && Number.isFinite(e.value)
                ? String(e.value)
                : null;
          if (value === null) return null;
          return {
            value,
            obligation_id: str(e.obligation_id) ?? "",
            provenance: str(e.provenance),
          };
        })
        .filter((v): v is ConflictValue => v !== null)
    : [];
  /* One value is not a disagreement. Dropping these here keeps every caller from
     having to re-check length before deciding whether to show the section. */
  if (values.length < 2) return null;
  return { field, values };
}

export function normalizeResolvedObligation(raw: unknown): ResolvedObligation {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const resolved = (o.resolved && typeof o.resolved === "object" ? o.resolved : {}) as Record<
    string,
    unknown
  >;
  const gl = resolved.gl_accounts as { value?: unknown } | null | undefined;
  const glValue = gl && typeof gl === "object" ? gl.value : null;
  const glAccounts = Array.isArray(glValue)
    ? glValue.filter((x): x is string => typeof x === "string" && !!x.trim())
    : null;
  return {
    /* An empty array is not "no GL coding present" in any useful sense, but it is also
       not a code to show. Collapsed to null so the popup's single "omit when absent"
       rule covers both. */
    glAccounts: glAccounts && glAccounts.length > 0 ? glAccounts : null,
    conflicts: Array.isArray(o.conflicts)
      ? o.conflicts.map(normalizeConflict).filter((c): c is ObligationConflict => c !== null)
      : [],
    observationCount: Array.isArray(o.observations) ? o.observations.length : 0,
  };
}

/** `null` means brain-core has no such obligation (404). Anything else throws. */
export async function fetchResolvedObligation(id: string): Promise<ResolvedObligation | null> {
  const res = await fetch(`/api/brain/ledger/obligations/${encodeURIComponent(id)}/resolved`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
  return normalizeResolvedObligation(await res.json());
}

export const resolvedObligationQueryKey = (id: string) =>
  ["/api/brain/ledger/obligations", id, "resolved"] as const;
