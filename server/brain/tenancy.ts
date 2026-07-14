/**
 * Production tenancy — platform-service-credential calls (docs/contracts/production-tenancy.md).
 *
 * Everything here authenticates with the X-Platform-Service-Auth header
 * (BRAIN_PLATFORM_SERVICE_SECRET). None of it ever reaches the browser.
 *
 *  - POST /v1/tenants            — create a company tenant + bootstrap admin (NOT idempotent:
 *                                  never auto-retried; a failure surfaces verbatim).
 *  - POST /v1/sessions           — exchange a durable external_ref for a member session
 *                                  (token + refresh_token, 900s). 403 session_identity_unlinked
 *                                  when the ref was never bound → NoTenantError upstream.
 *  - POST /v1/sessions/refresh   — rotate a session before expiry. A reuse-detected rejection
 *                                  (refresh family revoked) forces a full re-auth via /sessions.
 *  - POST /v1/invites/consume    — bind an invitee's external_ref to a tenant membership.
 *                                  Rejections: invite_invalid | invite_expired | invite_consumed
 *                                  | invite_revoked (mapped to plain language at the route).
 */

import { brainConfig } from "./config";

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
      "BRAIN_PLATFORM_SERVICE_SECRET is not configured — production tenancy calls are unavailable.",
    );
  }
  return secret;
}

async function serviceCall<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${brainConfig.baseUrl}${path}`, {
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

/** Create a company tenant + bootstrap admin. NOT idempotent — call exactly once per signup. */
export function createTenant(params: {
  companyName: string;
  founderEmail: string;
  founderDisplayName: string;
  founderExternalRef: string;
}): Promise<{ tenant_id: string; member: BrainMemberShape; session: TenantSessionShape }> {
  return serviceCall("/tenants", {
    company_name: params.companyName,
    founder: { email: params.founderEmail, display_name: params.founderDisplayName },
    founder_external_ref: params.founderExternalRef,
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
