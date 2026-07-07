/**
 * brain-core integration config (BFF side).
 *
 * Central place that reads every BRAIN_* env var the Backend-for-Frontend uses to
 * talk to the brain-core protocol (live target: https://api.brain.fi/v1).
 *
 * Token source (see auth.ts / brainTokenMode):
 *   - "demo-provision" (preferred, key-free) — the BFF calls the already-live, fenced
 *     POST /v1/demo/provision-run with BRAIN_DEMO_PROVISION_SECRET in the
 *     X-Demo-Provision-Auth header, and uses the per-tenant token it returns. No signing
 *     key needed; this is the same path the BrainSaaS playground uses.
 *   - "local-key" (dev fallback) — mint tokens in-process with a private JWK against a
 *     brain-core you control (e.g. dev-up.sh). Never copy the prod key here.
 *
 * Nothing here is sent to the browser — secrets and minted/fetched tokens stay server-side.
 */

/** Scopes requested in the local-key mint path. Subset of brain-core VALID_SCOPES. */
const DEFAULT_SCOPES = [
  "ledger:read",
  "wiki:read",
  "raw:read",
  "raw:write",          // required by POST /raw/ingest
  "policy:read",
  "audit:read",
  "execution:read",
  "execution:propose",
  "payment_intent:propose",
  "payment_intent:approve",
];

function env(name: string): string | undefined {
  const v = process.env[name];
  return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
}

export interface BrainConfig {
  /** Base URL incl. the /v1 prefix, e.g. https://api.brain.fi/v1 */
  baseUrl: string;
  /** PREFERRED (key-free): shared secret for the fenced POST /v1/demo/provision-run.
   *  Sent as the X-Demo-Provision-Auth header. */
  demoProvisionSecret: string | undefined;
  /** FALLBACK (local dev only): private signing JWK (JSON) to mint tokens in-process. */
  signKeyJson: string | undefined;
  /** FALLBACK (local dev only): HS256 secret — valid only against a non-prod verifier. */
  hs256Secret: string | undefined;
  issuer: string;
  audience: string;
  /** Tenant used by the local-key mint path (the demo-provision path gets its tenant
   *  from the provisioning response). */
  devTenantId: string | undefined;
  ttlSeconds: number;
  scopes: string[];
}

export const brainConfig: BrainConfig = {
  baseUrl: (env("BRAIN_API_BASE_URL") ?? "https://api.brain.fi/v1").replace(/\/+$/, ""),
  demoProvisionSecret: env("BRAIN_DEMO_PROVISION_SECRET"),
  signKeyJson: env("BRAIN_AUTH_SIGN_KEY"),
  hs256Secret: env("BRAIN_AUTH_JWT_SECRET"),
  issuer: env("BRAIN_AUTH_ISSUER") ?? "https://auth.brain.fi",
  audience: env("BRAIN_AUTH_AUDIENCE") ?? "brain-api",
  devTenantId: env("BRAIN_DEV_TENANT_ID"),
  ttlSeconds: parseInt(env("BRAIN_JWT_TTL_SECONDS") ?? "900", 10),
  scopes: env("BRAIN_DEFAULT_SCOPES")?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SCOPES,
};

/** How the BFF obtains brain-core tokens. */
export type BrainTokenMode = "demo-provision" | "local-key" | "unconfigured";

export function brainTokenMode(): BrainTokenMode {
  if (brainConfig.demoProvisionSecret !== undefined) return "demo-provision";
  if (brainConfig.signKeyJson !== undefined || brainConfig.hs256Secret !== undefined) return "local-key";
  return "unconfigured";
}

/** True when the BFF has a way to obtain a token brain-core will accept. */
export function brainAuthConfigured(): boolean {
  return brainTokenMode() !== "unconfigured";
}
