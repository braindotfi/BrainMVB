import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Counterparty trust-route contract.
 *
 * This mounts the real BFF router and mocks brain-core only at fetch. The
 * allowlist is intentionally explicit: a trust action must use the member
 * session token, while an unlisted POST must fall through to the 405 guard.
 */

const PROVISION_SECRET = "test-provision-secret-trust-routes";
const MEMBER_TOKEN = "MEMBER_TOKEN_trust_routes";
const AGENT_TOKEN = "AGENT_TOKEN_trust_routes";
const TENANT_ID = "tenant_trust_routes";

process.env.BRAIN_DEMO_PROVISION_SECRET = PROVISION_SECRET;
process.env.BRAIN_API_BASE_URL = "https://api.brain.fi/v1";
delete process.env.BRAIN_AUTH_SIGN_KEY;
delete process.env.BRAIN_TENANCY_MODE;
delete process.env.BRAIN_PLATFORM_SERVICE_SECRET;
delete process.env.BRAIN_AUTH_JWT_SECRET;

interface RecordedCall {
  url: string;
  method: string;
  auth?: string;
  provisionAuth?: string;
  requestId?: string;
}

const realFetch = globalThis.fetch;
let calls: RecordedCall[] = [];
let upstreamTrustStatus = 200;
let upstreamTrustBody: unknown;
let server: Server;
let baseUrl: string;
let createBrainProxyRouter: typeof import("./proxy").createBrainProxyRouter;
let clearBrainTokenCache: typeof import("./auth").clearBrainTokenCache;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routeBrainCore(fullUrl: string, method: string): Response {
  const path = fullUrl.split("?")[0];
  if (path.endsWith("/demo/provision-run")) {
    return json({
      tenant_id: TENANT_ID,
      member_token: MEMBER_TOKEN,
      agent_token: AGENT_TOKEN,
      expires_in: 1800,
    });
  }

  if (
    method === "POST" &&
    /^https:\/\/api\.brain\.fi\/v1\/ledger\/counterparties\/[^/]+\/trust\/(grant|pause|acknowledge|restore)$/.test(
      path,
    )
  ) {
    return json(upstreamTrustBody ?? { ok: true, path }, upstreamTrustStatus);
  }

  throw new Error(`unexpected brain-core call in trust route test: ${method} ${path}`);
}

function installFetchMock(): void {
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    if (!url.startsWith("https://api.brain.fi")) {
      return realFetch(input as never, init as never);
    }

    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: (init.method ?? "GET").toUpperCase(),
      auth: headers.Authorization ?? headers.authorization,
      provisionAuth: headers["X-Demo-Provision-Auth"],
      requestId: headers["X-Request-Id"] ?? headers["x-request-id"],
    });
    return routeBrainCore(url, (init.method ?? "GET").toUpperCase());
  }) as typeof fetch;
}

async function post(path: string): Promise<{ status: number; json: unknown }> {
  const response = await realFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  return { status: response.status, json: await response.json() };
}

function callsEndingWith(suffix: string): RecordedCall[] {
  return calls.filter((call) => call.url.split("?")[0].endsWith(suffix));
}

function proxySource(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(testDir, "proxy.ts"), "utf8");
}

beforeAll(async () => {
  installFetchMock();
  ({ createBrainProxyRouter } = await import("./proxy"));
  ({ clearBrainTokenCache } = await import("./auth"));

  const app: Express = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: { userId: string } }).session = {
      userId: "user-trust-routes",
    };
    next();
  });
  app.use("/api/brain", createBrainProxyRouter());

  await new Promise<void>((resolveListen) => {
    server = app.listen(0, resolveListen);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  server?.close();
});

beforeEach(() => {
  calls = [];
  upstreamTrustStatus = 200;
  upstreamTrustBody = undefined;
  clearBrainTokenCache();
});

describe("counterparty trust BFF route contract", () => {
  const routes = [
    ["grant", "/trust/grant"],
    ["pause", "/trust/pause"],
    ["acknowledge", "/trust/acknowledge"],
    ["restore", "/trust/restore"],
  ] as const;

  it.each(routes)(
    "mounts POST %s and forwards to the matching brain-core transition",
    async (action, upstreamSuffix) => {
      const result = await post(
        `/api/brain/ledger/counterparties/cp_contract/trust/${action}`,
      );

      expect(result.status).toBe(200);
      const upstreamCalls = callsEndingWith(
        `/ledger/counterparties/cp_contract${upstreamSuffix}`,
      );
      expect(upstreamCalls).toHaveLength(1);
      expect(upstreamCalls[0].method).toBe("POST");
      expect(upstreamCalls[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);
      expect(upstreamCalls[0].provisionAuth).toBeUndefined();
      expect(result.json).toEqual({
        ok: true,
        path: `https://api.brain.fi/v1/ledger/counterparties/cp_contract${upstreamSuffix}`,
      });
    },
  );

  it.each(routes)(
    "forwards a well-formed X-Request-Id on the outbound trust call for POST %s",
    async (action, upstreamSuffix) => {
      await post(`/api/brain/ledger/counterparties/cp_contract/trust/${action}`);

      // The trust action call must carry a stable, well-formed BFF request ID.
      // (Provision calls go through brain/auth.ts directly and are excluded —
      // they are session-management machinery, not per-request brain-core calls.)
      const trustCalls = callsEndingWith(
        `/ledger/counterparties/cp_contract${upstreamSuffix}`,
      );
      expect(trustCalls).toHaveLength(1);
      expect(trustCalls[0].requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    },
  );

  it("relays an upstream 401 and its missing/expired-token body", async () => {
    upstreamTrustStatus = 401;
    upstreamTrustBody = {
      error: { code: "auth_token_expired", message: "token expired" },
    };

    const result = await post(
      "/api/brain/ledger/counterparties/cp_contract/trust/grant",
    );

    expect(result.status).toBe(401);
    expect(result.json).toEqual({
      error: "brain_upstream_error",
      status: 401,
      body: upstreamTrustBody,
    });
    const upstreamCalls = callsEndingWith(
      "/ledger/counterparties/cp_contract/trust/grant",
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(upstreamCalls[0].provisionAuth).toBeUndefined();
  });

  it("logs both bff_request_id and brain_request_id when brain-core returns an error", async () => {
    const CORE_REQUEST_ID = "req_brain_core_abc123";
    upstreamTrustStatus = 401;
    upstreamTrustBody = {
      error: {
        code: "auth_token_expired",
        message: "token expired",
        request_id: CORE_REQUEST_ID,
      },
    };

    const errorLines: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(" "));
    };
    try {
      await post("/api/brain/ledger/counterparties/cp_contract/trust/grant");
    } finally {
      console.error = originalError;
    }

    // Must have logged exactly one [brain-proxy] error line.
    const proxyLines = errorLines.filter((l) => l.includes("[brain-proxy] upstream error:"));
    expect(proxyLines).toHaveLength(1);
    const line = proxyLines[0];

    // The BFF request ID must be a well-formed req_ UUID.
    expect(line).toMatch(/bff_request_id=req_[0-9a-f-]{36}/);

    // The brain-core request_id must be relayed verbatim from the error body.
    expect(line).toContain(`brain_request_id=${CORE_REQUEST_ID}`);

    // Status and path must also appear.
    expect(line).toContain("status=401");
  });

  it("relays an upstream 409 ledger_status_invalid body", async () => {
    upstreamTrustStatus = 409;
    upstreamTrustBody = {
      error: {
        code: "ledger_status_invalid",
        message: "restore is not valid from trusted",
      },
    };

    const result = await post(
      "/api/brain/ledger/counterparties/cp_contract/trust/restore",
    );

    expect(result.status).toBe(409);
    expect(result.json).toEqual({
      error: "brain_upstream_error",
      status: 409,
      body: upstreamTrustBody,
    });
    const upstreamCalls = callsEndingWith(
      "/ledger/counterparties/cp_contract/trust/restore",
    );
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0].auth).toBe(`Bearer ${MEMBER_TOKEN}`);
    expect(upstreamCalls[0].provisionAuth).toBeUndefined();
  });

  it("declares every trust route as a member ledger:write allowlist entry", () => {
    const source = proxySource();

    for (const action of ["grant", "pause", "acknowledge", "restore"]) {
      const route = new RegExp(
        String.raw`\{ method: "post", mount: "/ledger/counterparties/:id/trust/${action}", upstream:`,
      );
      expect(source).toMatch(route);

      const routeLine = source
        .split("\n")
        .find((line) => line.includes(`mount: "/ledger/counterparties/:id/trust/${action}"`));
      expect(routeLine).toContain('principal: "member"');
      expect(routeLine).toContain('scope: "ledger:write"');
    }

    expect(source).not.toContain('mount: "/ledger/counterparties/:id/trust/revoke"');
    expect(source).not.toContain(
      'upstream: (p) => `/ledger/counterparties/${esc(p.id)}/trust/revoke`',
    );
  });

  it.each(["revoke", "resume", "delete"])(
    "rejects unallowlisted trust action %s with 405 instead of proxying it",
    async (action) => {
      const result = await post(
        `/api/brain/ledger/counterparties/cp_contract/trust/${action}`,
      );

      expect(result.status).toBe(405);
      expect(result.json).toEqual({
        error: "method_not_allowed",
        message: "Only GET is proxied to brain-core in this build; write paths are added per-endpoint.",
      });
      expect(calls).toHaveLength(0);
    },
  );
});