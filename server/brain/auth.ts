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
  token: string;
  tenantId: string;
}

interface CachedSession extends BrainSession {
  /** epoch seconds when the token expires */
  exp: number;
}

const cache = new Map<string, CachedSession>();
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
    return { token: cached.token, tenantId: cached.tenantId };
  }

  const mode = brainTokenMode();
  let session: CachedSession;
  if (mode === "demo-provision") {
    session = await provisionSession();
  } else if (mode === "local-key") {
    session = await mintLocalSession(appUserId, now);
  } else {
    throw new Error(
      "brain-core token source not configured: set BRAIN_DEMO_PROVISION_SECRET (preferred — the box " +
        "provisions a tenant and returns a token) or, for a local brain-core only, BRAIN_AUTH_SIGN_KEY.",
    );
  }

  cache.set(appUserId, session);
  return { token: session.token, tenantId: session.tenantId };
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
  const json = JSON.parse(text) as { tenant_id?: string; token?: string; expires_in?: number };
  if (!json.token || !json.tenant_id) {
    throw new Error("brain-core /demo/provision-run returned no token/tenant_id");
  }
  const exp = Math.floor(Date.now() / 1000) + (json.expires_in ?? 30 * 60);
  return { token: json.token, tenantId: json.tenant_id, exp };
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
  return { token, tenantId: brainConfig.devTenantId, exp };
}

/** Test/maintenance hook — drop all cached sessions. */
export function clearBrainTokenCache(): void {
  cache.clear();
}
