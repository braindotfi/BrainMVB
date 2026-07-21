import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module so importing storage.ts never touches a real Postgres,
// and so the DatabaseStorage prune path can be driven deterministically.
const dbMock = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("./db", () => ({ db: dbMock }));

import {
  MemStorage,
  DatabaseStorage,
  DAILY_USAGE_RETENTION_DAYS,
  DAILY_USAGE_SWEEP_INTERVAL_MS,
  dailyUsageRetentionCutoff,
  startDailyUsagePruneSweep,
  type IStorage,
} from "./storage";
import type { InsertApiKey } from "@shared/schema";

const NOW = new Date("2026-07-21T12:00:00.000Z");

function isoDay(daysAgo: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function makeKey(userId = "user-1"): InsertApiKey {
  return {
    userId,
    name: "test key",
    environment: "test",
    scopes: ["read"],
    keyPrefix: "brain_sk_test_abc",
    keyLast4: "abcd",
    hashedSecret: `hash-${Math.random()}`,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("dailyUsageRetentionCutoff", () => {
  it("is exactly DAILY_USAGE_RETENTION_DAYS days before today (UTC)", () => {
    expect(DAILY_USAGE_RETENTION_DAYS).toBe(90);
    expect(dailyUsageRetentionCutoff()).toBe(isoDay(90));
  });

  it("handles month/year boundaries via UTC date math", () => {
    vi.setSystemTime(new Date("2026-01-15T00:30:00.000Z"));
    expect(dailyUsageRetentionCutoff()).toBe("2025-10-17");
  });
});

describe("MemStorage daily-usage pruning", () => {
  it("deletes rows older than the cutoff and keeps rows inside the window", async () => {
    const storage = new MemStorage();
    const key = await storage.createApiKey(makeKey());

    // Seed usage rows at various ages by moving the clock.
    for (const daysAgo of [91, 90, 89, 30]) {
      vi.setSystemTime(new Date(NOW.getTime() - daysAgo * 86_400_000));
      await storage.touchApiKeyLastUsed(key.userId, key.id);
    }

    // Back to "today": this touch flips the once-per-day throttle and prunes.
    vi.setSystemTime(NOW);
    await storage.touchApiKeyLastUsed(key.userId, key.id);

    const rows = await storage.getApiKeyDailyUsage(key.userId, "0000-00-00");
    const days = rows.map((r) => r.day).sort();

    expect(days).not.toContain(isoDay(91)); // strictly older than cutoff → deleted
    expect(days).toContain(isoDay(90)); // exactly at cutoff → survives (strict <)
    expect(days).toContain(isoDay(89));
    expect(days).toContain(isoDay(30));
    expect(days).toContain(isoDay(0)); // today's row was recorded
  });

  it("prunes at most once per UTC day per process", async () => {
    const storage = new MemStorage();
    const key = await storage.createApiKey(makeKey());

    await storage.touchApiKeyLastUsed(key.userId, key.id); // prune ran for today

    // Sneak a stale row in behind the throttle.
    const staleDay = isoDay(200);
    (storage as any).apiKeyDailyUsageStore.set(`${key.id}|${staleDay}`, {
      id: "stale-row",
      keyId: key.id,
      userId: key.userId,
      day: staleDay,
      count: 1,
    });

    await storage.touchApiKeyLastUsed(key.userId, key.id);
    expect((storage as any).apiKeyDailyUsageStore.has(`${key.id}|${staleDay}`)).toBe(true);

    // Next UTC day the throttle resets and the stale row is pruned.
    vi.setSystemTime(new Date(NOW.getTime() + 86_400_000));
    await storage.touchApiKeyLastUsed(key.userId, key.id);
    expect((storage as any).apiKeyDailyUsageStore.has(`${key.id}|${staleDay}`)).toBe(false);
  });

  it("does not record usage or prune for a key owned by someone else", async () => {
    const storage = new MemStorage();
    const key = await storage.createApiKey(makeKey("owner"));
    await storage.touchApiKeyLastUsed("intruder", key.id);
    expect(await storage.getApiKeyDailyUsage("owner", "0000-00-00")).toEqual([]);
    expect(await storage.getApiKeyDailyUsage("intruder", "0000-00-00")).toEqual([]);
  });
});

describe("DatabaseStorage daily-usage pruning", () => {
  function wireHappyPath(opts: { deleteFails?: boolean } = {}) {
    dbMock.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "key-1" }]),
        }),
      }),
    });
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const deleteWhere = opts.deleteFails
      ? vi.fn().mockRejectedValue(new Error("db down"))
      : vi.fn().mockResolvedValue(undefined);
    dbMock.delete.mockReturnValue({ where: deleteWhere });
    return { deleteWhere };
  }

  it("issues a delete with the retention cutoff condition, once per day", async () => {
    const { deleteWhere } = wireHappyPath();
    const storage = new DatabaseStorage();

    await storage.touchApiKeyLastUsed("user-1", "key-1");
    expect(dbMock.delete).toHaveBeenCalledTimes(1);

    // The delete condition must be `day < cutoff` for today's cutoff.
    const condition = deleteWhere.mock.calls[0][0];
    const chunks: any[] = condition.queryChunks ?? [];
    const params = chunks
      .filter((c) => c && typeof c === "object" && "value" in c && !("name" in c))
      .map((c) => c.value);
    expect(params).toContain(isoDay(90));
    const rawSql = chunks
      .filter((c) => c && typeof c === "object" && Array.isArray(c.value))
      .flatMap((c) => c.value)
      .join("");
    expect(rawSql).toContain("<");

    // Throttled: same-day touches don't prune again.
    await storage.touchApiKeyLastUsed("user-1", "key-1");
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it("a prune failure does not break the request path and retries next touch", async () => {
    wireHappyPath({ deleteFails: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new DatabaseStorage();

    await expect(storage.touchApiKeyLastUsed("user-1", "key-1")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(dbMock.delete).toHaveBeenCalledTimes(1);

    // Because the prune failed, the throttle resets and the next touch retries.
    await storage.touchApiKeyLastUsed("user-1", "key-1");
    expect(dbMock.delete).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("pruneDailyUsage deletes with the cutoff condition and returns the row count", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock.delete.mockReturnValue({ where });

    const storage = new DatabaseStorage();
    await expect(storage.pruneDailyUsage()).resolves.toBe(2);

    const condition = where.mock.calls[0][0];
    const chunks: any[] = condition.queryChunks ?? [];
    const params = chunks
      .filter((c) => c && typeof c === "object" && "value" in c && !("name" in c))
      .map((c) => c.value);
    expect(params).toContain(isoDay(90));
  });
});

describe("MemStorage.pruneDailyUsage (traffic-independent)", () => {
  it("removes stale rows without any key being touched", async () => {
    const storage = new MemStorage();
    const key = await storage.createApiKey(makeKey());

    // Seed rows directly — no touch traffic on "today".
    for (const daysAgo of [200, 91, 89, 10]) {
      const day = isoDay(daysAgo);
      (storage as any).apiKeyDailyUsageStore.set(`${key.id}|${day}`, {
        id: `row-${daysAgo}`,
        keyId: key.id,
        userId: key.userId,
        day,
        count: 1,
      });
    }

    await expect(storage.pruneDailyUsage()).resolves.toBe(2);
    const days = (await storage.getApiKeyDailyUsage(key.userId, "0000-00-00")).map((r) => r.day);
    expect(days).not.toContain(isoDay(200));
    expect(days).not.toContain(isoDay(91));
    expect(days).toContain(isoDay(89));
    expect(days).toContain(isoDay(10));
  });
});

describe("startDailyUsagePruneSweep", () => {
  function fakeStore(prune: () => Promise<number>): IStorage {
    return { pruneDailyUsage: prune } as unknown as IStorage;
  }

  it("sweeps immediately on start and again after the daily interval", async () => {
    const prune = vi.fn().mockResolvedValue(0);
    const timer = startDailyUsagePruneSweep(fakeStore(prune));
    await vi.advanceTimersByTimeAsync(0);
    expect(prune).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DAILY_USAGE_SWEEP_INTERVAL_MS);
    expect(prune).toHaveBeenCalledTimes(2);
    clearInterval(timer);
  });

  it("a failing sweep logs a warning, does not throw, and keeps the timer alive", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prune = vi
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(3);
    const timer = startDailyUsagePruneSweep(fakeStore(prune));
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalled();

    // Next tick still runs and succeeds.
    await vi.advanceTimersByTimeAsync(DAILY_USAGE_SWEEP_INTERVAL_MS);
    expect(prune).toHaveBeenCalledTimes(2);
    clearInterval(timer);
    warn.mockRestore();
  });
});
