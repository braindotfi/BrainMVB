/**
 * API key authentication regression suite.
 *
 * Pins the key-auth path behind GET /api/v1/ping: hash lookup of ACTIVE keys
 * only, 401 for missing/malformed/unknown/revoked keys, and lastUsedAt touch
 * on successful use. Runs against MemStorage + the shared resolver in
 * server/developers.ts (the same function server/routes.ts delegates to).
 */
import { describe, it, expect, beforeEach } from "vitest";
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

  it("hash lookup only ever matches the full-plaintext SHA-256 digest", async () => {
    const { plaintext, row } = await mintKey(storage);
    expect(row.hashedSecret).toBe(hashSecret(plaintext));
    expect(row.hashedSecret).toMatch(/^[0-9a-f]{64}$/);
    // A revoked key disappears from hash lookup entirely.
    await storage.revokeApiKey(USER_ID, row.id);
    expect(await storage.getApiKeyByHash(row.hashedSecret)).toBeUndefined();
  });
});
