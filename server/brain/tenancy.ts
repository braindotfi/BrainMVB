/**
 * Production tenancy - platform-service-credential calls (docs/contracts/production-tenancy.md).
 *
 * Everything here authenticates with the X-Platform-Service-Auth header
 * (BRAIN_PLATFORM_SERVICE_SECRET). None of it ever reaches the browser.
 *
 *  - POST /v1/tenants            - create a company tenant + bootstrap admin (NOT idempotent:
 *                                  never auto-retried; a failure surfaces verbatim).
 *  - POST /v1/sessions           - exchange a durable external_ref for a member session
 *                                  (token + refresh_token, 900s). 403 session_identity_unlinked
 *                                  when the ref was never bound → NoTenantError upstream.
 *  - POST /v1/sessions/refresh   - rotate a session before expiry. A reuse-detected rejection
 *                                  (refresh family revoked) forces a full re-auth via /sessions.
 *  - POST /v1/invites/consume    - bind an invitee's external_ref to a tenant membership.
 *                                  Rejections: invite_invalid | invite_expired | invite_consumed
 *                                  | invite_revoked (mapped to plain language at the route).
 *  - POST /v1/invites/pending    - check whether an email has a valid pending invite before
 *                                  the BFF implicitly provisions a durable tenant.
 */

import { brainConfig } from "./config";
import { currentBrainBaseUrl } from "./baseUrl";

export interface BrainMemberShape {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
  status?: string;
  active?: boolean;
  approval?: unknown;
}

export interface TenantSessionShape {
  token: string;
  refresh_token: string;
  expires_in: number;
  member?: BrainMemberShape;
}

/** Agent principal minted at tenant creation (docs/contracts/production-agents.md). */
export interface AgentTokenShape {
  id?: string;
  token: string;
  expires_in: number;
}

export interface AgentApiKeyShape {
  id: string;
  agent_id: string;
  tenant_id: string;
  profile: "bff_service_v1";
  environment: "live";
  scopes: string[];
  key_prefix: string;
  key_last4: string;
  expires_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  api_key?: string;
}

export class TenancyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `brain-core tenancy call failed with HTTP ${status}`);
    this.name = "TenancyApiError";
  }
  /** brain-core rejection reason, from either { reason } or { error: { code } }. */
  get reason(): string | undefined {
    const b = this.body as { reason?: string; error?: { code?: string } } | undefined;
    return b?.reason ?? b?.error?.code;
  }
}

function requireServiceSecret(): string {
  const secret = brainConfig.platformServiceSecret;
  if (!secret) {
    throw new Error(
      "BRAIN_PLATFORM_SERVICE_SECRET is not configured - production tenancy calls are unavailable.",
    );
  }
  return secret;
}

async function serviceCall<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${currentBrainBaseUrl(brainConfig.baseUrl)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Platform-Service-Auth": requireServiceSecret(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new TenancyApiError(res.status, json);
  return json as T;
}

async function serviceGet<T>(path: string): Promise<T> {
  const res = await fetch(`${currentBrainBaseUrl(brainConfig.baseUrl)}${path}`, {
    headers: {
      Accept: "application/json",
      "X-Platform-Service-Auth": requireServiceSecret(),
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new TenancyApiError(res.status, json);
  return json as T;
}

async function serviceDelete(path: string): Promise<void> {
  const res = await fetch(`${currentBrainBaseUrl(brainConfig.baseUrl)}${path}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "X-Platform-Service-Auth": requireServiceSecret(),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    throw new TenancyApiError(res.status, json);
  }
}

async function idempotentServiceCall<T>(
  path: string,
  body: unknown,
  idempotencyKey: string,
): Promise<T> {
  const res = await fetch(`${currentBrainBaseUrl(brainConfig.baseUrl)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Platform-Service-Auth": requireServiceSecret(),
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new TenancyApiError(res.status, json);
  return json as T;
}

/**
 * Create a company tenant + bootstrap admin. NOT idempotent - call exactly once per signup.
 *
 * `demoSeed` opts the new tenant into brain-core's `seedBrainSaasDemo` while keeping
 * tenant.kind = 'production', so durable tenancy and demo seeding can coexist. The
 * durable auto-provisioning path uses it for both ordinary signup and "Continue with
 * Demo". Explicit company creation and invite consumption remain separate paths.
 * The key is omitted entirely when false.
 */
export function createTenant(params: {
  companyName: string;
  founderEmail: string;
  founderDisplayName: string;
  founderExternalRef: string;
  demoSeed?: boolean;
}): Promise<{
  tenant_id: string;
  member: BrainMemberShape;
  session: TenantSessionShape;
  agent?: AgentTokenShape;
  /** Present only when demo_seed was requested AND the core supports it. Core owns the
   *  shape, so it stays opaque here - we surface it verbatim for confirmation. */
  demo_seed?: Record<string, unknown>;
}> {
  return serviceCall("/tenants", {
    company_name: params.companyName,
    founder: { email: params.founderEmail, display_name: params.founderDisplayName },
    founder_external_ref: params.founderExternalRef,
    ...(params.demoSeed ? { demo_seed: true } : {}),
  });
}

/** Exchange a bound external_ref for a member session. 403 session_identity_unlinked if unbound. */
export function exchangeSession(externalRef: string): Promise<TenantSessionShape> {
  return serviceCall("/sessions", { external_ref: externalRef });
}

/** Rotate a session. Reuse-detected rejections mean the refresh family is revoked. */
export function refreshSession(refreshToken: string): Promise<TenantSessionShape> {
  return serviceCall("/sessions/refresh", { refresh_token: refreshToken });
}

/**
 * Check whether an email has an unexpired, unconsumed, unrevoked invite.
 * This call intentionally returns no token or membership details.
 */
export function getPendingInviteStatus(email: string): Promise<{ pending: boolean }> {
  return serviceCall("/invites/pending", { email: email.trim().toLowerCase() });
}

/**
 * Mint (or re-fetch) the tenant's agent token - POST /v1/tenants/{tenantId}/agent-token
 * (docs/contracts/production-agents.md). IDEMPOTENT: safe to call before expiry or for a
 * tenant that already has one via another path - core returns the existing token. Used for
 * refresh AND for backfilling tenants created before the agent contract existed.
 */
export function mintAgentToken(tenantId: string): Promise<AgentTokenShape> {
  return serviceCall(`/tenants/${encodeURIComponent(tenantId)}/agent-token`, {});
}

export function issueBffAgentApiKey(
  tenantId: string,
  agentId: string,
  idempotencyKey: string,
): Promise<AgentApiKeyShape & { api_key: string }> {
  return idempotentServiceCall(
    `/tenants/${encodeURIComponent(tenantId)}/agent-keys`,
    {
      agent_id: agentId,
      profile: "bff_service_v1",
      environment: "live",
      name: "BrainMVB BFF Phase 3",
    },
    idempotencyKey,
  );
}

export function listAgentApiKeys(
  tenantId: string,
): Promise<{ keys: AgentApiKeyShape[] }> {
  return serviceGet(`/tenants/${encodeURIComponent(tenantId)}/agent-keys`);
}

export function revokeAgentApiKey(agentKeyId: string): Promise<void> {
  return serviceDelete(`/agent-keys/${encodeURIComponent(agentKeyId)}`);
}

/** Bind an invitee's external_ref to the inviting tenant's membership. */
export function consumeInvite(params: {
  inviteToken: string;
  externalRef: string;
  displayName?: string;
}): Promise<{ member: BrainMemberShape; session?: TenantSessionShape; tenant_id?: string }> {
  const body: Record<string, unknown> = {
    invite_token: params.inviteToken,
    external_ref: params.externalRef,
  };
  if (params.displayName) body.display_name = params.displayName;
  return serviceCall("/invites/consume", body);
}
