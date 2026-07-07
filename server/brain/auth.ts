/**
 * brain-core session source (BFF side).
 *
 * Returns a { token, tenantId } a BrainMVB request can use to read from brain-core.
 * Two strategies, chosen by config (see brainTokenMode):
 *
 *  1. "demo-provision" (PREFERRED, key-free) — POST ${baseUrl}/demo/provision-run with the
 *     X-Demo-Provision-Auth: BRAIN_DEMO_PROVISION_SECRET header. brain-core creates a fresh
 *     seeded tenant and returns a scoped per-tenant token (reads + propose, no execute, ~30 min).
 *     The private signing key never leaves the box. Same path the BrainSaaS playground uses.
 *
 *  2. "local-key" (FALLBACK, local dev only) — mint a JWT in-process with a private JWK for
 *     BRAIN_DEV_TENANT_ID. Use only against a brain-core you control; never the prod key.
 *
 * Sessions are cached per app user and refreshed shortly before expiry. Nothing is ever
 * exposed to the browser.
 */

import { SignJWT, importJWK, type JWK } from "jose";
import { randomUUID } from "node:crypto";
import { brainConfig, brainTokenMode } from "./config";
import { brainUserSubject } from "./ids";

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
   * for /members or the approve path — sending it there correctly 403s (agents propose, humans
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

  const create = createSession(appUserId, now);
  inflight.set(appUserId, create);
  try {
    const session = await create;
    cache.set(appUserId, session);
    return { token: session.token, agentToken: session.agentToken, secondApproverToken: session.secondApproverToken, tenantId: session.tenantId };
  } finally {
    inflight.delete(appUserId);
  }
}

/** Mint a new session via the configured token source. */
function createSession(appUserId: string, now: number): Promise<CachedSession> {
  const mode = brainTokenMode();
  if (mode === "demo-provision") {
    return provisionSession();
  }
  if (mode === "local-key") {
    return mintLocalSession(appUserId, now);
  }
  throw new Error(
    "brain-core token source not configured: set BRAIN_DEMO_PROVISION_SECRET (preferred — the box " +
      "provisions a tenant and returns a token) or, for a local brain-core only, BRAIN_AUTH_SIGN_KEY.",
  );
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
        "members/approval surface requires the user-principal token — cannot start the session.",
    );
  }
  const exp = Math.floor(Date.now() / 1000) + (json.expires_in ?? 30 * 60);
  return { token: memberToken, agentToken, secondApproverToken, tenantId: json.tenant_id, exp };
}

/** Local in-process minting — dev fallback only. Mirrors brain-core tools/dev-token. */
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

/** Test/maintenance hook — drop all cached sessions. */
export function clearBrainTokenCache(): void {
  cache.clear();
  inflight.clear();
}
