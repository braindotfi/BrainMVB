/**
 * brain-core integration config (BFF side).
 *
 * Central place that reads every BRAIN_* env var the Backend-for-Frontend uses to
 * talk to the brain-core protocol.
 *
 * Two base URLs are now resolved at startup:
 *   DEMO_BRAIN_API_BASE_URL  — demo / "Continue with Demo" users hit this target.
 *                              Defaults to https://staging-api.brain.fi/v1 (staging).
 *   PROD_BRAIN_API_BASE_URL  — signed-in / sign-up users hit this target.
 *                              Defaults to https://api.brain.fi/v1 (production).
 *   (Legacy BRAIN_API_BASE_URL is still honoured as the prod URL when the new var is unset.)
 *
 * Token source (see auth.ts / brainTokenMode), in priority order:
 *   - "staging-demo-token" (staging environment only) - when the demo URL points at
 *     https://staging-api.brain.fi/v1, the BFF calls the key-free POST /v1/demo/token
 *     (empty JSON body, no auth header) and uses the single 24h token it returns for every
 *     call (staging has no member/agent token split). Per the staging integration guide.
 *   - "demo-provision" (preferred against the live/prod box, key-free) - the BFF calls the
 *     already-live, fenced POST /v1/demo/provision-run with BRAIN_DEMO_PROVISION_SECRET in
 *     the X-Demo-Provision-Auth header, and uses the per-tenant token it returns. No signing
 *     key needed; this is the same path the BrainSaaS playground uses.
 *   - "local-key" (dev fallback) - mint tokens in-process with a private JWK against a
 *     brain-core you control (e.g. dev-up.sh). Never copy the prod key here.
 *
 * Nothing here is sent to the browser - secrets and minted/fetched tokens stay server-side.
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

/**
 * Base URL for PRODUCTION brain-core (signed-in / sign-up users).
 * Read from PROD_BRAIN_API_BASE_URL (preferred) or the legacy BRAIN_API_BASE_URL,
 * defaulting to https://api.brain.fi/v1.
 */
export function prodBrainBaseUrl(): string {
  return (env("PROD_BRAIN_API_BASE_URL") ?? env("BRAIN_API_BASE_URL") ?? "https://api.brain.fi/v1").replace(/\/+$/, "");
}

/**
 * Base URL for DEMO brain-core ("Continue with Demo" users).
 * Read from DEMO_BRAIN_API_BASE_URL, defaulting to https://staging-api.brain.fi/v1.
 */
export function demoBrainBaseUrl(): string {
  return (env("DEMO_BRAIN_API_BASE_URL") ?? "https://staging-api.brain.fi/v1").replace(/\/+$/, "");
}

export interface BrainConfig {
  /** Base URL for PRODUCTION / real-user calls (prodBrainBaseUrl()). */
  baseUrl: string;
  /** Base URL for DEMO / "Continue with Demo" calls (demoBrainBaseUrl()). */
  demoBaseUrl: string;
  /** PREFERRED (key-free): shared secret for the fenced POST /v1/demo/provision-run.
   *  Sent as the X-Demo-Provision-Auth header.
   *  Accepts BRAIN_DEMO_PROVISION_SECRET or the older BRAIN_PROVISION_SECRET alias. */
  demoProvisionSecret: string | undefined;
  /** PRODUCTION TENANCY: platform service credential for POST /v1/tenants,
   *  POST /v1/sessions and POST /v1/invites/consume. Sent as X-Platform-Service-Auth. */
  platformServiceSecret: string | undefined;
  /** FALLBACK (local dev only): private signing JWK (JSON) to mint tokens in-process. */
  signKeyJson: string | undefined;
  /** FALLBACK (local dev only): HS256 secret - valid only against a non-prod verifier. */
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
  baseUrl: prodBrainBaseUrl(),
  demoBaseUrl: demoBrainBaseUrl(),
  // Accept BRAIN_PROVISION_SECRET as an alias (legacy env var name from initial setup).
  demoProvisionSecret: env("BRAIN_DEMO_PROVISION_SECRET") ?? env("BRAIN_PROVISION_SECRET"),
  platformServiceSecret: env("BRAIN_PLATFORM_SERVICE_SECRET"),
  signKeyJson: env("BRAIN_AUTH_SIGN_KEY"),
  hs256Secret: env("BRAIN_AUTH_JWT_SECRET"),
  issuer: env("BRAIN_AUTH_ISSUER") ?? "https://auth.brain.fi",
  audience: env("BRAIN_AUTH_AUDIENCE") ?? "brain-api",
  devTenantId: env("BRAIN_DEV_TENANT_ID"),
  ttlSeconds: parseInt(env("BRAIN_JWT_TTL_SECONDS") ?? "900", 10),
  scopes: env("BRAIN_DEFAULT_SCOPES")?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SCOPES,
};

/** How the BFF obtains brain-core tokens. */
export type BrainTokenMode = "staging-demo-token" | "demo-provision" | "local-key" | "unconfigured";

/** True when the DEMO brain target points at the staging box. */
export function isStagingBrainTarget(): boolean {
  return brainConfig.demoBaseUrl.includes("staging-api.brain.fi");
}

export function brainTokenMode(): BrainTokenMode {
  // Staging takes priority when explicitly targeted: it has its own key-free demo-token
  // route (POST /demo/token) distinct from the live box's fenced /demo/provision-run.
  if (isStagingBrainTarget()) return "staging-demo-token";
  if (brainConfig.demoProvisionSecret !== undefined) return "demo-provision";
  if (brainConfig.signKeyJson !== undefined || brainConfig.hs256Secret !== undefined) return "local-key";
  return "unconfigured";
}

/** True when the BFF has a way to obtain a token brain-core will accept. */
export function brainAuthConfigured(): boolean {
  if (brainTenancyMode() === "production" || brainDurableTenancy()) {
    return brainConfig.platformServiceSecret !== undefined;
  }
  return brainTokenMode() !== "unconfigured";
}

/**
 * Production tenancy gate (Phase 2). "production" ONLY when BRAIN_TENANCY_MODE=production
 * AND the platform service credential is present; anything else stays on the demo
 * strategies above, so the demo/playground build is byte-for-byte unaffected.
 */
export type BrainTenancyMode = "production" | "durable" | "demo";

export function brainTenancyMode(): BrainTenancyMode {
  if (brainConfig.platformServiceSecret !== undefined) {
    if (env("BRAIN_TENANCY_MODE") === "production") return "production";
    // Durable tenants are real, persistent brain-core PRODUCTION tenants. Reporting
    // them as "demo" told clients their data was ephemeral session scratch, which is
    // the opposite of the truth — see brainDurableTenancy() below.
    if (env("BRAIN_TENANCY_MODE") === "durable") return "durable";
  }
  return "demo";
}

/**
 * DURABLE tenancy (BRAIN_TENANCY_MODE=durable): every app user gets ONE persistent
 * production tenant, auto-created at first brain-core use and stored in brain_identities
 * (external_ref = app user id). Later sessions re-attach via POST /v1/sessions /
 * /sessions/refresh, so documents, audit events, and proposals survive logouts,
 * restarts, and redeploys. Requires the platform service credential.
 *
 * This is deliberately distinct from "production" mode, whose contract FORBIDS
 * auto-provisioning (explicit company signup / invite only). Durable mode auto-creates
 * exactly once per user, then never again (tenant creation is not idempotent upstream).
 * This reports to the client as its own mode ("durable"), NOT as "demo": the tenant
 * is a genuine production tenant upstream (kind=production, sandbox=false) and
 * persists indefinitely. It is still not "production" mode, so the company-setup
 * gate stays off — that gate keys on mode === "production" alone.
 *
 * Verified live 2026-07-24: brain-core's demo fence cannot re-attach to an existing
 * demo tenant (provision-run always creates a fresh one; the platform agent-token
 * route rejects demo tenants), so durable data REQUIRES the production tenant path.
 */
export function brainDurableTenancy(): boolean {
  return brainTenancyMode() === "durable";
}

/** True when the platform service credential is configured (signup/invite consume need it
 *  even while BRAIN_TENANCY_MODE is still demo). */
export function platformServiceConfigured(): boolean {
  return brainConfig.platformServiceSecret !== undefined;
}

// ── Startup readiness log ────────────────────────────────────────────────────
// Printed once at module load so every server restart shows which targets and
// token strategies are live. Not sensitive: only URLs and mode names, never
// secrets or tokens.
(function logBrainConfig() {
  const mode = brainTenancyMode();
  const demoMode = brainConfig.demoBaseUrl.includes("staging-api.brain.fi")
    ? "staging-demo-token"
    : brainConfig.demoProvisionSecret
      ? "demo-provision"
      : "unconfigured";
  const realMode = mode === "production" ? "production" : mode === "durable" ? "durable" : "demo-fallback";
  console.log(
    `[brain-config] demo target: ${brainConfig.demoBaseUrl} (token: ${demoMode}) | ` +
    `prod target: ${brainConfig.baseUrl} (tenancy: ${realMode}) | ` +
    `platform-service: ${brainConfig.platformServiceSecret ? "✓" : "✗"} | ` +
    `demo-provision-secret: ${brainConfig.demoProvisionSecret ? "✓" : "✗"}`,
  );
})();
