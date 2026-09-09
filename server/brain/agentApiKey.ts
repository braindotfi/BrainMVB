const TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
const AGENT_API_KEY_SUBJECT_TOKEN_TYPE = "urn:brain:params:oauth:token-type:agent-api-key";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const ACCESS_TOKEN_MAX_TTL_SECONDS = 300;
const EARLY_REFRESH_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 5;

export const BFF_SERVICE_AGENT_SCOPES = [
  "ledger:read",
  "wiki:read",
  "raw:read",
  "raw:write",
  "policy:read",
  "execution:read",
  "execution:propose",
  "payment_intent:propose",
  "audit:read",
] as const;

interface CachedAccessToken {
  value: string;
  expiresAt: number;
  claims: AgentAccessTokenClaims;
}

interface ExchangeResponse {
  access_token?: unknown;
  issued_token_type?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  refresh_token?: unknown;
}

export interface AgentAccessTokenClaims {
  aud: string;
  sub: string;
  principal_type: "agent";
  tenant_id: string;
  scopes: string[];
  credential_id: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
}

export interface AgentApiKeyBinding {
  tenantId: string;
  agentApiKey: string;
  tokenUrl: string;
  resource: string;
}

export function isAgentApiKeyCredential(value: string): boolean {
  return value.startsWith("brain_ak_test_") || value.startsWith("brain_ak_live_");
}

function decodeJwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  const encoded = parts[1];
  if (parts.length !== 3 || encoded === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function sameScopes(actual: string[]): boolean {
  return (
    actual.length === BFF_SERVICE_AGENT_SCOPES.length &&
    BFF_SERVICE_AGENT_SCOPES.every((scope) => actual.includes(scope))
  );
}

export function parseAgentAccessTokenClaims(
  token: string,
  expected: { tenantId: string; resource: string; now?: number },
): AgentAccessTokenClaims {
  const claims = decodeJwtClaims(token);
  const now = Math.floor(expected.now ?? Date.now() / 1000);
  const scopes = claims?.scopes;
  if (
    claims === undefined ||
    claims.aud !== expected.resource ||
    typeof claims.sub !== "string" ||
    !claims.sub.startsWith("agent_") ||
    claims.principal_type !== "agent" ||
    claims.tenant_id !== expected.tenantId ||
    !Array.isArray(scopes) ||
    !scopes.every((scope) => typeof scope === "string") ||
    !sameScopes(scopes as string[]) ||
    typeof claims.credential_id !== "string" ||
    !claims.credential_id.startsWith("agkey_") ||
    typeof claims.jti !== "string" ||
    !claims.jti.startsWith("token_") ||
    typeof claims.iat !== "number" ||
    !Number.isInteger(claims.iat) ||
    typeof claims.exp !== "number" ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= now ||
    claims.exp <= claims.iat ||
    claims.iat > now + CLOCK_SKEW_SECONDS ||
    claims.exp - claims.iat !== ACCESS_TOKEN_MAX_TTL_SECONDS ||
    claims.exp > now + ACCESS_TOKEN_MAX_TTL_SECONDS + CLOCK_SKEW_SECONDS ||
    typeof claims.iss !== "string" ||
    claims.iss.length === 0
  ) {
    throw new Error("agent API key exchange returned an invalid access token");
  }
  return claims as unknown as AgentAccessTokenClaims;
}

class AgentTokenManager {
  private cached: CachedAccessToken | undefined;
  private exchangeInFlight: Promise<CachedAccessToken> | undefined;

  constructor(private readonly binding: AgentApiKeyBinding) {}

  matches(binding: AgentApiKeyBinding): boolean {
    return (
      this.binding.agentApiKey === binding.agentApiKey &&
      this.binding.tokenUrl === binding.tokenUrl &&
      this.binding.resource === binding.resource
    );
  }

  async getAccessToken(): Promise<CachedAccessToken> {
    const now = Date.now() / 1000;
    if (this.cached !== undefined && this.cached.expiresAt - now > EARLY_REFRESH_SECONDS) {
      return this.cached;
    }
    return this.exchangeSingleFlight();
  }

  async refreshAfterUnauthorized(failedToken: string): Promise<CachedAccessToken> {
    const now = Date.now() / 1000;
    if (
      this.cached !== undefined &&
      this.cached.value !== failedToken &&
      this.cached.expiresAt - now > EARLY_REFRESH_SECONDS
    ) {
      return this.cached;
    }
    return this.exchangeSingleFlight();
  }

  private exchangeSingleFlight(): Promise<CachedAccessToken> {
    if (this.exchangeInFlight !== undefined) return this.exchangeInFlight;
    const exchange = this.exchange();
    this.exchangeInFlight = exchange;
    const clear = (): void => {
      if (this.exchangeInFlight === exchange) this.exchangeInFlight = undefined;
    };
    void exchange.then(clear, clear);
    return exchange;
  }

  private async exchange(): Promise<CachedAccessToken> {
    const form = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: this.binding.agentApiKey,
      subject_token_type: AGENT_API_KEY_SUBJECT_TOKEN_TYPE,
      requested_token_type: ACCESS_TOKEN_TYPE,
      resource: this.binding.resource,
    });
    const response = await fetch(this.binding.tokenUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`agent API key exchange failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as ExchangeResponse;
    if (
      typeof payload.access_token !== "string" ||
      payload.access_token.length === 0 ||
      payload.issued_token_type !== ACCESS_TOKEN_TYPE ||
      payload.token_type !== "Bearer" ||
      typeof payload.expires_in !== "number" ||
      !Number.isInteger(payload.expires_in) ||
      payload.expires_in <= 0 ||
      payload.expires_in !== ACCESS_TOKEN_MAX_TTL_SECONDS ||
      typeof payload.scope !== "string" ||
      payload.scope.length === 0 ||
      payload.refresh_token !== undefined
    ) {
      throw new Error("agent API key exchange returned an invalid response");
    }
    const claims = parseAgentAccessTokenClaims(payload.access_token, {
      tenantId: this.binding.tenantId,
      resource: this.binding.resource,
    });
    if (claims.scopes.join(" ") !== payload.scope) {
      throw new Error("agent API key exchange scope response does not match JWT claims");
    }
    const cached = {
      value: payload.access_token,
      expiresAt: Math.min(claims.exp, Math.floor(Date.now() / 1000) + payload.expires_in),
      claims,
    };
    this.cached = cached;
    tokenOwners.set(cached.value, this);
    return cached;
  }
}

const managers = new Map<string, AgentTokenManager>();
const tokenOwners = new Map<string, AgentTokenManager>();

function managerFor(binding: AgentApiKeyBinding): AgentTokenManager {
  const current = managers.get(binding.tenantId);
  if (current !== undefined && current.matches(binding)) return current;
  const manager = new AgentTokenManager(binding);
  managers.set(binding.tenantId, manager);
  return manager;
}

export async function getAgentAccessToken(
  binding: AgentApiKeyBinding,
): Promise<{ token: string; claims: AgentAccessTokenClaims }> {
  if (!isAgentApiKeyCredential(binding.agentApiKey)) {
    throw new Error("invalid agent API key credential format");
  }
  const access = await managerFor(binding).getAccessToken();
  return { token: access.value, claims: access.claims };
}

export async function refreshAgentAccessTokenAfterUnauthorized(
  failedToken: string,
): Promise<string | null> {
  const manager = tokenOwners.get(failedToken);
  if (manager === undefined) return null;
  return (await manager.refreshAfterUnauthorized(failedToken)).value;
}

export async function fetchWithAgentAccessTokenRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  token: string,
): Promise<Response> {
  const attempt = (accessToken: string): Promise<Response> => {
    const headers =
      init.headers instanceof Headers
        ? new Headers(init.headers)
        : {
            ...Object.fromEntries(new Headers(init.headers).entries()),
            ...((init.headers ?? {}) as Record<string, string>),
            Authorization: `Bearer ${accessToken}`,
          };
    if (headers instanceof Headers) headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  };
  let response = await attempt(token);
  if (response.status !== 401) return response;
  const replacement = await refreshAgentAccessTokenAfterUnauthorized(token);
  if (replacement === null) return response;
  response = await attempt(replacement);
  return response;
}

export function resetAgentTokenManagersForTests(): void {
  managers.clear();
  tokenOwners.clear();
}
