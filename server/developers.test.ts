import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashSecret,
  maskKey,
  aggregateUsage,
  API_KEY_PREFIXES,
  type UsageAuditEvent,
} from "./developers";

describe("generateApiKey", () => {
  it("mints env-prefixed keys with base62 secrets and matching hash/last4", () => {
    for (const env of ["sandbox", "live"] as const) {
      const k = generateApiKey(env);
      expect(k.plaintext.startsWith(API_KEY_PREFIXES[env])).toBe(true);
      const secret = k.plaintext.slice(API_KEY_PREFIXES[env].length);
      expect(secret).toMatch(/^[A-Za-z0-9]{43}$/);
      expect(k.keyLast4).toBe(k.plaintext.slice(-4));
      expect(k.hashedSecret).toBe(hashSecret(k.plaintext));
      expect(k.hashedSecret).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("never repeats keys (entropy sanity)", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateApiKey("sandbox").plaintext));
    expect(seen.size).toBe(50);
  });

  it("the generated shape never contains a persistable plaintext beyond the one field", () => {
    const k = generateApiKey("sandbox");
    // hash is one-way: hashing the hash differs from the stored hash
    expect(hashSecret(k.hashedSecret)).not.toBe(k.hashedSecret);
    // masking never leaks the middle of the secret
    const masked = maskKey(k.keyPrefix, k.keyLast4);
    expect(masked).toBe(`${k.keyPrefix}\u2022\u2022\u2022\u2022${k.keyLast4}`);
    expect(k.plaintext.includes(masked)).toBe(false);
  });
});

describe("aggregateUsage", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");
  const ev = (daysAgo: number, action = "ledger.read", layer = "ledger"): UsageAuditEvent => ({
    id: `ev_${daysAgo}_${action}`,
    layer,
    action,
    created_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  });

  it("zero-fills every day of the window, oldest first", () => {
    const out = aggregateUsage([], 7, now);
    expect(out.daily).toHaveLength(7);
    expect(out.daily[0].date).toBe("2026-07-15");
    expect(out.daily[6].date).toBe("2026-07-21");
    expect(out.daily.every((d) => d.count === 0)).toBe(true);
    expect(out.totalEvents).toBe(0);
    expect(out.byAction).toEqual([]);
  });

  it("counts in-window events and drops out-of-window / unparsable ones", () => {
    const events = [
      ev(0), ev(0, "audit.read", "audit"), ev(2),
      ev(30), // outside a 7-day window
      { id: "bad", layer: "x", action: "y", created_at: "not-a-date" },
    ];
    const out = aggregateUsage(events, 7, now);
    expect(out.totalEvents).toBe(3);
    expect(out.daily.find((d) => d.date === "2026-07-21")?.count).toBe(2);
    expect(out.daily.find((d) => d.date === "2026-07-19")?.count).toBe(1);
    expect(out.byAction).toEqual([
      { action: "ledger.read", count: 2 },
      { action: "audit.read", count: 1 },
    ]);
    expect(out.byLayer).toEqual([
      { layer: "ledger", count: 2 },
      { layer: "audit", count: 1 },
    ]);
  });

  it("sorts byAction descending with alphabetical tie-break", () => {
    const out = aggregateUsage([ev(0, "b.act"), ev(0, "a.act")], 3, now);
    expect(out.byAction.map((a) => a.action)).toEqual(["a.act", "b.act"]);
  });
});
