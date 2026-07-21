/**
 * brain-core session source (BFF side).
 *
 * Returns a { token, tenantId } a BrainMVB request can use to read from brain-core.
 * Two strategies, chosen by config (see brainTokenMode):
 *
 *  1. "demo-provision" (PREFERRED, key-free) - POST ${baseUrl}/demo/provision-run with the
 *     X-Demo-Provision-Auth: BRAIN_DEMO_PROVISION_SECRET header. brain-core creates a fresh
 *     seeded tenant and returns a scoped per-tenant token (reads + propose, no execute, ~30 min).
 *     The private signing key never leaves the box. Same path the BrainSaaS playground uses.
 *
 *  2. "local-key" (FALLBACK, local dev only) - mint a JWT in-process with a private JWK for
 *     BRAIN_DEV_TENANT_ID. Use only against a brain-core you control; never the prod key.
 *
 * Sessions are cached per app user and refreshed shortly before expiry. Nothing is ever
 * exposed to the browser.
 */

import { SignJWT, importJWK, type JWK } from "jose";
import { randomUUID } from "node:crypto";
import { brainConfig, brainTokenMode, brainTenancyMode } from "./config";
import { brainUserSubject } from "./ids";
import { exchangeSession, refreshSession, mintAgentToken, TenancyApiError, type TenantSessionShape } from "./tenancy";
import { storage } from "../storage";

/**
 * Thrown by the PRODUCTION strategy when the app user has no durable
 * appUserId → external_ref mapping (or brain-core answers 403
 * session_identity_unlinked). The caller must route the user to
 * "Create a company" or "Enter your invite link" - NEVER auto-provision.
 */
export class NoTenantError extends Error {
  constructor(appUserId: string) {
    super(`app user ${appUserId} is not linked to a brain-core tenant`);
    this.name = "NoTenantError";
  }
}

/** Staging demo tokens are valid 24h; used when the response omits expires_at. */
const STAGING_DEMO_TOKEN_TTL_SECONDS = 24 * 60 * 60;

export interface BrainSession {
  /**
   * The MEMBER token (principal_type "user", subject = the bootstrap admin). This is the
   * platform session token: it backs ALL reads, member/admin calls, policy reads, and the
   * approve/reject paths (it carries policy:read, payment_intent:approve, audit:read,
   * execution:admin). Per the token rule it is what every non-propose call uses.
   */
  token: string;
  /**
   * The AGENT token (principal_type "agent", propose-only: payment_intent:propose +
   * execution:propose). Used ONLY to create PaymentIntents on /propose. It is NOT authorized
   * for /members or the approve path - sending it there correctly 403s (agents propose, humans
   * approve), so it must never back those calls.
   */
  agentToken: string;
  /**
   * The SECOND distinct approver's MEMBER token, present on the demo path since the two-signer
   * approval fix (a payment above the demo policy's threshold needs two distinct approvers).
   * Optional: a not-yet-deployed core omits it, and the approve path then stays single-signer
   * (surfaces awaiting_second_approval verbatim, exactly as before). Never reaches the browser.
   */
  secondApproverToken?: string;
  tenantId: string;
}

interface CachedSession extends BrainSession {
  /** epoch seconds when the token expires */
  exp: number;
  /** PRODUCTION strategy only: rotating refresh token for POST /sessions/refresh. */
  refreshToken?: string;
  /** epoch ms when THIS tenant's session was first provisioned (kept across
   *  token refreshes of the same tenant; reset when a new tenant is provisioned). */
  provisionedAt?: number;
}

const cache = new Map<string, CachedSession>();
/**
 * In-flight session creations, keyed by app user. Coalesces concurrent callers
 * onto ONE provision so a burst of first requests (e.g. the FinancesPage firing
 * /ledger/accounts, /ledger/invoices and /ledger/counterparties on mount) all
 * land in the SAME freshly-provisioned tenant. Without this, each request races
 * an empty cache and provisions its own tenant, so cross-query joins (an
 * invoice's counterparty_id vs the counterparties list) silently mismatch.
 */
const inflight = new Map<string, Promise<CachedSession>>();
/** Refresh this many seconds before the token actually expires. */
const REFRESH_SKEW = 60;

/**
 * Obtain (or return a cached) brain-core session for the given BrainMVB user.
 * Throws a clear error when no token source is configured.
 */
export async function getBrainSession(appUserId: string): Promise<BrainSession> {
  const now = Math.floor(Date.now() / 1000);
  const cached = cache.get(appUserId);
  if (cached && cached.exp - REFRESH_SKEW > now) {
    return { token: cached.token, agentToken: cached.agentToken, secondApproverToken: cached.secondApproverToken, tenantId: cached.tenantId };
  }

  // Coalesce: if a session is already being created for this user, await it.
  const pending = inflight.get(appUserId);
  if (pending) {
    const session = await pending;
    return { token: session.token, agentToken: session.agentToken, secondApproverToken: session.secondApproverToken, tenantId: session.tenantId };
  }

  const create = createSession(appUserId, now, cached);
  inflight.set(appUserId, create);
  try {
    const session = await create;
    // Preserve the original provision time across token refreshes of the SAME
    // tenant; a new tenant id means a fresh provision.
    session.provisionedAt =
      cached && cached.tenantId === session.tenantId && cached.provisionedAt
        ? cached.provisionedAt
        : Date.now();
    cache.set(appUserId, session);
    return { token: session.token, agentToken: session.agentToken, secondApproverToken: session.secondApproverToken, tenantId: session.tenantId };
  } finally {
    inflight.delete(appUserId);
  }
}

/**
 * When the given user's CURRENT cached session was provisioned (epoch ms), or
 * null if there is no live cached session. Real provision time, never fabricated.
 */
export function getBrainSessionProvisionedAt(appUserId: string): number | null {
  return cache.get(appUserId)?.provisionedAt ?? null;
}

/** Mint a new session via the configured token source. */
function createSession(appUserId: string, now: number, prior?: CachedSession): Promise<CachedSession> {
  // PRODUCTION TENANCY (Phase 2): real shared tenants, selected by BRAIN_TENANCY_MODE.
  // The demo strategies below are untouched - the playground build never enters here.
  if (brainTenancyMode() === "production") {
    return createProductionSession(appUserId, prior);
  }
  const mode = brainTokenMode();
  if (mode === "staging-demo-token") {
    return provisionStagingDemoToken();
  }
  if (mode === "demo-provision") {
    return provisionSession();
  }
  if (mode === "local-key") {
    return mintLocalSession(appUserId, now);
  }
  throw new Error(
    "brain-core token source not configured: set BRAIN_DEMO_PROVISION_SECRET (preferred - the box " +
      "provisions a tenant and returns a token) or, for a local brain-core only, BRAIN_AUTH_SIGN_KEY.",
  );
}

/**
 * PRODUCTION strategy (docs/contracts/production-tenancy.md):
 *  1. Look up the durable appUserId → external_ref mapping (brain_identities). No row →
 *     NoTenantError (route to "Create a company" / "Enter your invite link"; NEVER
 *     auto-provision - membership only comes from POST /v1/tenants or invite consume).
 *  2. If a prior session holds a refresh_token, rotate via POST /v1/sessions/refresh first.
 *     A reuse-detected/invalid-refresh rejection means the family is revoked: fall through
 *     to a FULL re-auth via POST /v1/sessions (service credential) - never a silent retry
 *     of the same refresh token.
 *  3. Otherwise POST /v1/sessions { external_ref }. 403 session_identity_unlinked →
 *     NoTenantError.
 *
 * Production sessions are MEMBER sessions plus a per-TENANT agent principal
 * (docs/contracts/production-agents.md): core mints a real agent token at tenant creation,
 * and POST /v1/tenants/{id}/agent-token re-issues it idempotently. The agent token is stored
 * per tenant (brain_agent_tokens), refreshed before expiry, and backfilled on first use for
 * tenants created before the contract existed. Agents propose, humans approve - the member
 * token still backs everything else.
 */
async function createProductionSession(appUserId: string, prior?: CachedSession): Promise<CachedSession> {
  const identity = await storage.getBrainIdentity(appUserId);
  if (!identity) throw new NoTenantError(appUserId);

  // Rotate the existing session when we still hold its refresh token.
  if (prior?.refreshToken) {
    try {
      const rotated = await refreshSession(prior.refreshToken);
      return toProductionCached(rotated, identity.tenantId, await getProductionAgentToken(identity.tenantId));
    } catch (err) {
      // Revoked/reused/expired refresh family (or a core-side failure): fall through to a
      // full re-auth via POST /v1/sessions. Loud, not silent - log the reason.
      const reason = err instanceof TenancyApiError ? (err.reason ?? `HTTP ${err.status}`) : String(err);
      console.warn(`[brain-auth] session refresh rejected (${reason}) - full re-auth via /sessions`);
    }
  }

  try {
    const session = await exchangeSession(identity.externalRef);
    return toProductionCached(session, identity.tenantId, await getProductionAgentToken(identity.tenantId));
  } catch (err) {
    if (err instanceof TenancyApiError && err.status === 403 && err.reason === "session_identity_unlinked") {
      throw new NoTenantError(appUserId);
    }
    throw err;
  }
}

/** Refresh the stored agent token this many seconds before it expires. */
const AGENT_TOKEN_REFRESH_SKEW = 120;

/**
 * The tenant's AGENT token (propose-only principal). Reads the durable per-tenant row;
 * mints via POST /v1/tenants/{id}/agent-token when missing (backfill for pre-contract
 * tenants - the route is idempotent, so this is safe even if a token already exists via
 * another path) or when within the refresh skew of expiry (mirrors the member-session
 * refresh pattern; also idempotent - an unexpired token is simply returned again).
 *
 * Returns null when brain-core does not (yet) serve the agent-token contract - verified
 * live 2026-07-14: POST /tenants/{id}/agent-token answers 401 auth_token_missing to the
 * platform-service header, i.e. the production-agents route isn't deployed. In that case
 * the session must NOT fail: the caller falls back to the member token so reads keep
 * working and propose 403s honestly, and a loud warning is logged. A mint failure while a
 * (possibly stale) stored token exists returns the stored token rather than nothing.
 */
async function getProductionAgentToken(tenantId: string): Promise<string | null> {
  const stored = await storage.getBrainAgentToken(tenantId);
  const now = Date.now();
  if (stored && stored.expiresAt.getTime() - AGENT_TOKEN_REFRESH_SKEW * 1000 > now) {
    return stored.token;
  }
  try {
    const minted = await mintAgentToken(tenantId);
    if (!minted?.token) throw new Error("agent-token mint returned no token");
    await storage.upsertBrainAgentToken(tenantId, minted.token, new Date(now + (minted.expires_in ?? 900) * 1000));
    return minted.token;
  } catch (err) {
    const reason = err instanceof TenancyApiError ? (err.reason ?? `HTTP ${err.status}`) : String(err);
    console.warn(
      `[brain-auth] agent-token mint for ${tenantId} failed (${reason}) - ` +
        (stored ? "using stored (possibly stale) agent token" : "no agent token; propose will 403 until core ships the agent contract"),
    );
    return stored?.token ?? null;
  }
}

function toProductionCached(session: TenantSessionShape, fallbackTenantId: string, agentToken: string | null): CachedSession {
  if (!session.token) throw new Error("brain-core session response had no token");
  return {
    token: session.token,
    // Real per-tenant agent principal (production-agents contract). When core can't mint
    // one yet, mirror the member token - reads work, propose 403s honestly (never faked).
    agentToken: agentToken ?? session.token,
    tenantId: session.member?.tenantId ?? fallbackTenantId,
    refreshToken: session.refresh_token,
    exp: Math.floor(Date.now() / 1000) + (session.expires_in ?? 900),
  };
}

/**
 * Seed the session cache with a session brain-core just returned out-of-band (tenant
 * creation at signup, invite consume). Saves an immediate round-trip and makes the very
 * first authenticated page load work without a second /sessions call.
 */
export async function registerBrainSession(
  appUserId: string,
  session: TenantSessionShape,
  tenantId: string,
  agentToken?: string,
): Promise<void> {
  // Tenant creation hands the agent token in directly; invite-consume (no agent in that
  // response) resolves the tenant's stored token - minting it idempotently if missing.
  const agent = agentToken ?? (await getProductionAgentToken(tenantId));
  cache.set(appUserId, toProductionCached(session, tenantId, agent));
}

/**
 * Staging demo-token flow (per the Brain staging integration guide): POST /demo/token with
 * an empty JSON body, no auth header - no signup, no secret. Returns ONE token good for
 * every scope the staging tenant needs (raw:read/write, ledger:read, wiki:*); staging has no
 * member/agent token split, so it doubles as both here.
 */
async function provisionStagingDemoToken(): Promise<CachedSession> {
  const res = await fetch(`${brainConfig.baseUrl}/demo/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`brain-core (staging) /demo/token → HTTP ${res.status}: ${text}`);
  }
  const json = JSON.parse(text) as {
    token?: string;
    tenant_id?: string;
    expires_at?: string;
  };
  if (!json.token || !json.tenant_id) {
    throw new Error("brain-core (staging) /demo/token returned no token/tenant_id");
  }
  const exp = json.expires_at
    ? Math.floor(new Date(json.expires_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000) + STAGING_DEMO_TOKEN_TTL_SECONDS;
  return { token: json.token, agentToken: json.token, tenantId: json.tenant_id, exp };
}

/** Ask the live demo fence to provision a tenant and hand back a scoped token. */
async function provisionSession(): Promise<CachedSession> {
  const res = await fetch(`${brainConfig.baseUrl}/demo/provision-run`, {
    method: "POST",
    headers: { "X-Demo-Provision-Auth": brainConfig.demoProvisionSecret! },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`brain-core /demo/provision-run → HTTP ${res.status}: ${text}`);
  }
  const json = JSON.parse(text) as {
    tenant_id?: string;
    token?: string;
    agent_token?: string;
    member_token?: string;
    second_approver_token?: string;
    tokens?: {
      agent?: { token?: string };
      member?: { token?: string };
      second_approver?: { token?: string };
    };
    expires_in?: number;
  };
  // Two principals since the members fix landed: MEMBER (user-principal, backs the platform
  // session) + AGENT (propose-only). Prefer the explicit aliases, fall back to tokens.*, and
  // finally to the legacy single `token` (which is the agent token) so a partially-rolled-back
  // core still boots reads/propose.
  const memberToken = json.member_token ?? json.tokens?.member?.token;
  const agentToken = json.agent_token ?? json.tokens?.agent?.token ?? json.token;
  // The SECOND distinct approver token, present only since the two-signer approval fix. Optional
  // by design: a not-yet-deployed core omits it and the approve path degrades to single-signer.
  const secondApproverToken = json.second_approver_token ?? json.tokens?.second_approver?.token;
  if (!json.tenant_id || !agentToken) {
    throw new Error("brain-core /demo/provision-run returned no token/tenant_id");
  }
  if (!memberToken) {
    throw new Error(
      "brain-core /demo/provision-run returned no member token (tokens.member.token). The " +
        "members/approval surface requires the user-principal token - cannot start the session.",
    );
  }
  const exp = Math.floor(Date.now() / 1000) + (json.expires_in ?? 30 * 60);
  return { token: memberToken, agentToken, secondApproverToken, tenantId: json.tenant_id, exp };
}

/** Local in-process minting - dev fallback only. Mirrors brain-core tools/dev-token. */
async function mintLocalSession(appUserId: string, now: number): Promise<CachedSession> {
  if (brainConfig.devTenantId === undefined) {
    throw new Error("local-key mode requires BRAIN_DEV_TENANT_ID (the tenant to mint for).");
  }
  const exp = now + brainConfig.ttlSeconds;
  const builder = new SignJWT({
    sub: brainUserSubject(appUserId),
    tenant_id: brainConfig.devTenantId,
    principal_type: "user",
    scopes: brainConfig.scopes,
  })
    .setIssuer(brainConfig.issuer)
    .setAudience(brainConfig.audience)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(`token_${randomUUID()}`);

  let token: string;
  if (brainConfig.signKeyJson !== undefined) {
    const jwk = JSON.parse(brainConfig.signKeyJson) as JWK;
    const alg = jwk.alg ?? "RS256";
    const signKey = await importJWK(jwk, alg);
    const header = jwk.kid !== undefined ? { alg, kid: jwk.kid } : { alg };
    token = await builder.setProtectedHeader(header).sign(signKey);
  } else {
    const secret = new TextEncoder().encode(brainConfig.hs256Secret!);
    token = await builder.setProtectedHeader({ alg: "HS256" }).sign(secret);
  }
  // Local dev mints one user-principal token; it doubles as the agent token here since a
  // self-controlled brain-core accepts it for both read/approve and propose scopes.
  return { token, agentToken: token, tenantId: brainConfig.devTenantId, exp };
}

/** Test/maintenance hook - drop all cached sessions. */
export function clearBrainTokenCache(): void {
  cache.clear();
  inflight.clear();
}
