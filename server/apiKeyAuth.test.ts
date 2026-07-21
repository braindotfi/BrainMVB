/**
 * API key authentication regression suite.
 *
 * Pins the key-auth path behind GET /api/v1/ping: hash lookup of ACTIVE keys
 * only, 401 for missing/malformed/unknown/revoked keys, and lastUsedAt touch
 * on successful use. Runs against MemStorage + the shared resolver in
 * server/developers.ts (the same function server/routes.ts delegates to).
 */
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { MemStorage } from "./storage";
import {
  generateApiKey,
  hashSecret,
  resolveApiKeyFromAuthHeader,
} from "./developers";
import type { ApiKey } from "@shared/schema";

const USER_ID = "user-1";

async function mintKey(storage: MemStorage, environment: "sandbox" | "live" = "sandbox") {
  const generated = generateApiKey(environment);
  const row = await storage.createApiKey({
    userId: USER_ID,
    tenantId: null,
    name: "test key",
    environment,
    scopes: ["ledger:read"],
    keyPrefix: generated.keyPrefix,
    keyLast4: generated.keyLast4,
    hashedSecret: generated.hashedSecret,
    rotatedFromId: null,
  });
  return { plaintext: generated.plaintext, row };
}

function resolve(storage: MemStorage, header: string | undefined) {
  return resolveApiKeyFromAuthHeader<ApiKey>(header, (hash) =>
    storage.getApiKeyByHash(hash),
  );
}

describe("API key authentication", () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it("resolves a valid active key and lastUsedAt is touched on use", async () => {
    const { plaintext, row } = await mintKey(storage);
    const result = await resolve(storage, `Bearer ${plaintext}`);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.key.id).toBe(row.id);
    expect(result.key.hashedSecret).toBe(hashSecret(plaintext));
    expect(result.key.lastUsedAt).toBeNull();

    // The route touches lastUsedAt after successful resolution.
    await storage.touchApiKeyLastUsed(result.key.userId, result.key.id);
    const touched = await storage.getApiKey(USER_ID, row.id);
    expect(touched?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects a revoked key with 401 invalid_api_key", async () => {
    const { plaintext, row } = await mintKey(storage);
    const revoked = await storage.revokeApiKey(USER_ID, row.id);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);

    const result = await resolve(storage, `Bearer ${plaintext}`);
    expect(result).toMatchObject({ ok: false, status: 401, error: "invalid_api_key" });
  });

  it("rejects a well-formed but unknown key with 401 invalid_api_key", async () => {
    await mintKey(storage);
    const stranger = generateApiKey("sandbox").plaintext;
    const result = await resolve(storage, `Bearer ${stranger}`);
    expect(result).toMatchObject({ ok: false, status: 401, error: "invalid_api_key" });
  });

  it("rejects a malformed key (wrong prefix) with 401 invalid_api_key", async () => {
    const result = await resolve(storage, "Bearer sk_live_not_a_brain_key");
    expect(result).toMatchObject({ ok: false, status: 401, error: "invalid_api_key" });
  });

  it("rejects a missing or non-Bearer Authorization header with 401 missing_api_key", async () => {
    for (const header of [undefined, "", "Basic abc123", "bearer brain_sk_test_lowercase"]) {
      const result = await resolve(storage, header);
      expect(result).toMatchObject({ ok: false, status: 401, error: "missing_api_key" });
    }
  });

  it("does not accept a truncated or tampered variant of a real key", async () => {
    const { plaintext } = await mintKey(storage);
    const truncated = plaintext.slice(0, -1);
    const tampered = plaintext.slice(0, -1) + (plaintext.endsWith("A") ? "B" : "A");
    for (const bad of [truncated, tampered]) {
      const result = await resolve(storage, `Bearer ${bad}`);
      expect(result).toMatchObject({ ok: false, status: 401, error: "invalid_api_key" });
    }
  });

  it("N touches keep requestCount === sum of daily usage counts for that key", async () => {
    const { row } = await mintKey(storage);
    const N = 5;
    for (let i = 0; i < N; i++) {
      await storage.touchApiKeyLastUsed(USER_ID, row.id);
    }
    const touched = await storage.getApiKey(USER_ID, row.id);
    expect(touched?.requestCount).toBe(N);
    const today = new Date().toISOString().slice(0, 10);
    const usage = await storage.getApiKeyDailyUsage(USER_ID, today);
    const forKey = usage.filter((u) => u.keyId === row.id);
    const dailySum = forKey.reduce((sum, u) => sum + u.count, 0);
    expect(dailySum).toBe(touched?.requestCount);
  });

  it("a touch with the wrong userId moves neither counter", async () => {
    const { row } = await mintKey(storage);
    await storage.touchApiKeyLastUsed("someone-else", row.id);
    const key = await storage.getApiKey(USER_ID, row.id);
    expect(key?.requestCount).toBe(0);
    expect(key?.lastUsedAt).toBeNull();
    const today = new Date().toISOString().slice(0, 10);
    expect(await storage.getApiKeyDailyUsage(USER_ID, today)).toEqual([]);
    expect(await storage.getApiKeyDailyUsage("someone-else", today)).toEqual([]);
  });

  it("daily usage rows are scoped to the owning user", async () => {
    const { row: mine } = await mintKey(storage);
    const otherUser = "user-2";
    const generated = generateApiKey("sandbox");
    const theirs = await storage.createApiKey({
      userId: otherUser,
      tenantId: null,
      name: "their key",
      environment: "sandbox",
      scopes: ["ledger:read"],
      keyPrefix: generated.keyPrefix,
      keyLast4: generated.keyLast4,
      hashedSecret: generated.hashedSecret,
      rotatedFromId: null,
    });
    await storage.touchApiKeyLastUsed(USER_ID, mine.id);
    await storage.touchApiKeyLastUsed(otherUser, theirs.id);
    await storage.touchApiKeyLastUsed(otherUser, theirs.id);

    const today = new Date().toISOString().slice(0, 10);
    const myRows = await storage.getApiKeyDailyUsage(USER_ID, today);
    expect(myRows).toHaveLength(1);
    expect(myRows[0]).toMatchObject({ keyId: mine.id, userId: USER_ID, count: 1 });
    expect(myRows.some((r) => r.keyId === theirs.id)).toBe(false);

    const theirRows = await storage.getApiKeyDailyUsage(otherUser, today);
    expect(theirRows).toHaveLength(1);
    expect(theirRows[0]).toMatchObject({ keyId: theirs.id, userId: otherUser, count: 2 });
    expect(theirRows.some((r) => r.keyId === mine.id)).toBe(false);
  });

  it("hash lookup only ever matches the full-plaintext SHA-256 digest", async () => {
    const { plaintext, row } = await mintKey(storage);
    expect(row.hashedSecret).toBe(hashSecret(plaintext));
    expect(row.hashedSecret).toMatch(/^[0-9a-f]{64}$/);
    // A revoked key disappears from hash lookup entirely.
    await storage.revokeApiKey(USER_ID, row.id);
    expect(await storage.getApiKeyByHash(row.hashedSecret)).toBeUndefined();
  });
});

// ─── Route-level: GET /api/developers/keys/usage ───
// Spins a real Express server with registerRoutes (MemStorage-backed singleton),
// drives usage through the key-authed /api/v1/ping path, and pins the
// zero-filled window shape plus per-user isolation.

describe("GET /api/developers/keys/usage", () => {
  let server: Server;
  let baseUrl: string;

  class SessionClient {
    private cookie = "";
    constructor(private readonly base: string) {}
    async request<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
      if (body !== undefined) headers["content-type"] = "application/json";
      if (this.cookie) headers.cookie = this.cookie;
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) this.cookie = setCookie.split(";")[0];
      return { status: res.status, json: (await res.json()) as T };
    }
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = "api-key-usage-test-secret";
    const { registerRoutes } = await import("./routes");
    const app: Express = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    await new Promise<void>((resolve) => {
      server = httpServer.listen(0, resolve);
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    server?.close();
  });

  const RUN_ID = Math.random().toString(36).slice(2, 10);

  type UsageResponse = {
    days: number;
    usage: Array<{ keyId: string; daily: Array<{ day: string; count: number }>; windowTotal: number }>;
  };

  async function registerUser(client: SessionClient, suffix: string) {
    const res = await client.request<{ user: { id: string } }>("POST", "/api/auth/register", {
      email: `key-usage-${suffix}-${RUN_ID}@example.com`,
      password: "correct-horse-battery",
      name: `Key Usage ${suffix}`,
    });
    expect(res.status).toBe(201);
    return res.json.user.id;
  }

  async function mintKeyViaRoute(client: SessionClient) {
    const res = await client.request<{ key: { id: string }; plaintext: string }>(
      "POST",
      "/api/developers/keys",
      { name: "usage test key", environment: "sandbox", scopes: ["ledger:read"] },
    );
    expect(res.status).toBe(201);
    return res.json;
  }

  it("keeps windowTotal in lockstep with the key's lifetime requestCount and zero-fills 7- and 30-day windows", async () => {
    const client = new SessionClient(baseUrl);
    await registerUser(client, "owner");
    const minted = await mintKeyViaRoute(client);
    const keyId = minted.key.id;

    const N = 4;
    for (let i = 0; i < N; i++) {
      const ping = await fetch(`${baseUrl}/api/v1/ping`, {
        headers: { authorization: `Bearer ${minted.plaintext}` },
      });
      expect(ping.status).toBe(200);
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const days of [7, 30] as const) {
      const res = await client.request<UsageResponse>("GET", `/api/developers/keys/usage?days=${days}`);
      expect(res.status).toBe(200);
      expect(res.json.days).toBe(days);
      const entry = res.json.usage.find((u) => u.keyId === keyId);
      expect(entry).toBeDefined();
      // Zero-filled window: exactly `days` entries, consecutive days, ending today.
      expect(entry!.daily).toHaveLength(days);
      expect(entry!.daily[days - 1].day).toBe(today);
      for (let i = 1; i < days; i++) {
        const prev = new Date(`${entry!.daily[i - 1].day}T00:00:00Z`).getTime();
        const cur = new Date(`${entry!.daily[i].day}T00:00:00Z`).getTime();
        expect(cur - prev).toBe(86400000);
      }
      // All activity landed today; every other day is an explicit zero.
      expect(entry!.daily[days - 1].count).toBe(N);
      expect(entry!.daily.slice(0, -1).every((d) => d.count === 0)).toBe(true);
      expect(entry!.windowTotal).toBe(N);
    }

    // windowTotal must equal the lifetime requestCount reported by the keys list.
    const keys = await client.request<{ keys: Array<{ id: string; requestCount: number }> }>(
      "GET",
      "/api/developers/keys",
    );
    expect(keys.status).toBe(200);
    const listed = keys.json.keys.find((k) => k.id === keyId);
    expect(listed?.requestCount).toBe(N);
  });

  it("never returns usage rows for another user's keys", async () => {
    const owner = new SessionClient(baseUrl);
    await registerUser(owner, "alice");
    const minted = await mintKeyViaRoute(owner);
    const ping = await fetch(`${baseUrl}/api/v1/ping`, {
      headers: { authorization: `Bearer ${minted.plaintext}` },
    });
    expect(ping.status).toBe(200);

    const stranger = new SessionClient(baseUrl);
    await registerUser(stranger, "mallory");
    const res = await stranger.request<UsageResponse>("GET", "/api/developers/keys/usage?days=7");
    expect(res.status).toBe(200);
    expect(res.json.usage.some((u) => u.keyId === minted.key.id)).toBe(false);
    // And no usage entry carries any nonzero counts for the stranger.
    expect(res.json.usage.every((u) => u.windowTotal === 0)).toBe(true);
  });

  it("rejects unauthenticated usage requests", async () => {
    const res = await fetch(`${baseUrl}/api/developers/keys/usage`);
    expect(res.status).toBe(401);
  });
});
