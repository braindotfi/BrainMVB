/**
 * Developers section scope constants and eligibility helpers.
 *
 * Kept free of Express/storage imports so vitest can hit them directly.
 *
 * API keys themselves are brain-core-issued (PR #309) and proxied through
 * server/routes.ts. No key material is minted, hashed, or stored here.
 */

/** Scopes brain-core recognizes for tenant API keys.
 *
 * Raw scopes remain conditionally issuable. The BFF accepts their wire values,
 * but only offers them for a verified synthetic demo tenant. brain-core repeats
 * that check when a key is issued and whenever a Raw-scoped key is used. */
export const API_KEY_SCOPES = [
  "ledger:read",
  "audit:read",
  "governance:read",
  "raw:read",
  "raw:write",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface RawScopeTenantState {
  provisioningState?: string | null;
  dataProfile?: string | null;
  accessStage?: string | null;
}

/** Must stay aligned with brain-core's synthetic demo key gate. */
export function isRawScopeEligible(state: RawScopeTenantState): boolean {
  return (
    state.provisioningState === "ready_demo" &&
    state.dataProfile === "synthetic_brightline_v1" &&
    state.accessStage === "demo"
  );
}
