import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BFF_SERVICE_AGENT_SCOPES,
  fetchWithAgentAccessTokenRetry,
  getAgentAccessToken,
  resetAgentTokenManagersForTests,
} from "./agentApiKey";

const TENANT_ID = "tnt_01M2ABCDEABCDEABCDEABCDEAB";
const AGENT_ID = "agent_01M2ABCDEABCDEABCDEABCDEAB";
const CREDENTIAL_ID = "agkey_01M2ABCDEABCDEABCDEABCDEA";
const RESOURCE = "https://api.brain.fi/";
const KEY = "brain_ak_live_test-value";

function jwt(now: number, suffix: string): string {
  const claims = {
    aud: RESOURCE,
    sub: AGENT_ID,
    principal_type: "agent",
    tenant_id: TENANT_ID,
    scopes: [...BFF_SERVICE_AGENT_SCOPES],
    credential_id: CREDENTIAL_ID,
    jti: `token_01M2ABCDEABCDEABCDEABC${suffix}`,
    iat: now,
    exp: now + 300,
    iss: "https://auth.brain.fi",
  };
  return [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");
}

function exchangeResponse(token: string): Response {
  return Response.json({
    access_token: token,
    issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
    token_type: "Bearer",
    expires_in: 300,
    scope: BFF_SERVICE_AGENT_SCOPES.join(" "),
  });
}

describe("BrainMVB agent API key exchange", () => {
  beforeEach(() => {
    resetAgentTokenManagersForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("exchanges once for concurrent callers and caches only the access token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async () => exchangeResponse(jwt(now, "001")));
    vi.stubGlobal("fetch", fetchMock);
    const binding = {
      tenantId: TENANT_ID,
      agentApiKey: KEY,
      tokenUrl: "https://auth.brain.fi/token",
      resource: RESOURCE,
    };

    const [first, second] = await Promise.all([
      getAgentAccessToken(binding),
      getAgentAccessToken(binding),
    ]);

    expect(first.token).toBe(second.token);
    expect(first.claims.scopes).toEqual(BFF_SERVICE_AGENT_SCOPES);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(String(request.body)).toContain(`subject_token=${encodeURIComponent(KEY)}`);
  });

  it("refreshes early and never returns a token with widened scopes", async () => {
    const firstNow = Math.floor(Date.now() / 1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(exchangeResponse(jwt(firstNow, "002")))
      .mockResolvedValueOnce(exchangeResponse(jwt(firstNow + 241, "003")));
    vi.stubGlobal("fetch", fetchMock);
    const binding = {
      tenantId: TENANT_ID,
      agentApiKey: KEY,
      tokenUrl: "https://auth.brain.fi/token",
      resource: RESOURCE,
    };

    await getAgentAccessToken(binding);
    vi.setSystemTime(new Date((firstNow + 241) * 1000));
    const refreshed = await getAgentAccessToken(binding);

    expect(refreshed.claims.exp - refreshed.claims.iat).toBe(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a resource request once after 401 with a newly exchanged JWT", async () => {
    const now = Math.floor(Date.now() / 1000);
    const firstToken = jwt(now, "004");
    const secondToken = jwt(now, "005");
    const seenAuthorization: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.endsWith("/token")) {
        const exchanges = fetchMock.mock.calls.filter(
          ([candidate]) => typeof candidate === "string" && candidate.endsWith("/token"),
        ).length;
        return exchangeResponse(exchanges === 1 ? firstToken : secondToken);
      }
      seenAuthorization.push(new Headers(init?.headers).get("authorization") ?? "");
      return new Response(null, { status: seenAuthorization.length === 1 ? 401 : 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const binding = {
      tenantId: TENANT_ID,
      agentApiKey: KEY,
      tokenUrl: "https://auth.brain.fi/token",
      resource: RESOURCE,
    };
    const access = await getAgentAccessToken(binding);

    const response = await fetchWithAgentAccessTokenRetry(
      "https://api.brain.fi/v1/ledger/accounts",
      { headers: { Accept: "application/json" } },
      access.token,
    );

    expect(response.status).toBe(200);
    expect(seenAuthorization).toEqual([`Bearer ${firstToken}`, `Bearer ${secondToken}`]);
    expect(seenAuthorization.join(" ")).not.toContain(KEY);
  });

  it("replaces a mixed-case Authorization header instead of combining duplicates", async () => {
    const token = jwt(Math.floor(Date.now() / 1000), "header-normalization");
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("authorization") ?? "");
      return new Response(null, { status: 200 });
    }));

    const response = await fetchWithAgentAccessTokenRetry(
      "https://api.brain.fi/v1/ledger/accounts",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer stale-token",
        },
      },
      token,
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual([`Bearer ${token}`]);
    expect(seen[0]).not.toContain(",");
    expect(seen[0]).not.toContain("stale-token");
  });

  it("rejects a token with any scope outside the fixed BFF profile", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      aud: RESOURCE,
      sub: AGENT_ID,
      principal_type: "agent",
      tenant_id: TENANT_ID,
      scopes: [...BFF_SERVICE_AGENT_SCOPES, "payment_intent:approve"],
      credential_id: CREDENTIAL_ID,
      jti: "token_01M2ABCDEABCDEABCDEABC006",
      iat: now,
      exp: now + 300,
      iss: "https://auth.brain.fi",
    };
    const widened = [
      Buffer.from("{}").toString("base64url"),
      Buffer.from(JSON.stringify(claims)).toString("base64url"),
      "signature",
    ].join(".");
    vi.stubGlobal("fetch", vi.fn(async () => exchangeResponse(widened)));

    await expect(
      getAgentAccessToken({
        tenantId: TENANT_ID,
        agentApiKey: KEY,
        tokenUrl: "https://auth.brain.fi/token",
        resource: RESOURCE,
      }),
    ).rejects.toThrow(/invalid access token/);
  });
});
