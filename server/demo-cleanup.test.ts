/**
 * Behavioural tests for deleteExpiredDemoUsers.
 *
 * We use MemStorage directly so the suite never needs a database connection
 * and always runs in CI regardless of DATABASE_URL.  The behaviour under test
 * is identical in DatabaseStorage (same filter logic, same cascade via
 * deleteUserAccount) — the DB path is covered by the integration layer.
 */

import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "./storage";
import { SHARED_DEMO_EMAIL } from "./demoUsers";
import type { User } from "@shared/schema";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Access the private users map so we can backdate createdAt. */
function usersMap(mem: MemStorage): Map<string, User> {
  return (mem as unknown as { users: Map<string, User> }).users;
}

/**
 * Creates a demo-fresh user then backdates its createdAt by `ageMs`.
 * Returns the user id.
 */
async function createDemoUser(mem: MemStorage, ageMs: number): Promise<string> {
  // Use UUID hex (0-9a-f + hyphens) to match the isDemoEmail regex [0-9a-f-]+
  // — identical to what POST /api/auth/demo-fresh produces in production.
  const suffix = randomUUID().slice(0, 8);
  const email = `demo-fresh-${suffix}@brain.fi`;
  const user = await mem.createUser({ username: email, email, password: null });
  const backdated: User = {
    ...user,
    createdAt: new Date(Date.now() - ageMs),
  };
  usersMap(mem).set(user.id, backdated);
  return user.id;
}

// ─── tests ──────────────────────────────────────────────────────────────────

const ONE_HOUR = 60 * 60 * 1000;
const TTL = 24 * ONE_HOUR;

describe("deleteExpiredDemoUsers", () => {
  let mem: MemStorage;

  beforeEach(() => {
    mem = new MemStorage();
  });

  it("deletes a demo-fresh user whose createdAt is older than the TTL", async () => {
    const userId = await createDemoUser(mem, TTL + ONE_HOUR); // 25 h old, TTL = 24 h
    expect(await mem.getUser(userId)).toBeDefined();

    const deleted = await mem.deleteExpiredDemoUsers(TTL);

    expect(deleted).toBe(1);
    expect(await mem.getUser(userId)).toBeUndefined();
  });

  it("keeps a demo-fresh user whose createdAt is within the TTL", async () => {
    const userId = await createDemoUser(mem, TTL - ONE_HOUR); // 23 h old, TTL = 24 h
    expect(await mem.getUser(userId)).toBeDefined();

    const deleted = await mem.deleteExpiredDemoUsers(TTL);

    expect(deleted).toBe(0);
    expect(await mem.getUser(userId)).toBeDefined();
  });

  it("keeps a user created exactly at the TTL boundary (strictly-older required)", async () => {
    // createdAt = exactly `ttlMs` ms ago → cutoff = now - ttlMs → user.createdAt === cutoff,
    // which is NOT strictly less-than, so the user must survive.
    const userId = await createDemoUser(mem, TTL);
    const user = (await mem.getUser(userId))!;
    // Pin createdAt to exactly the cutoff value.
    usersMap(mem).set(userId, { ...user, createdAt: new Date(Date.now() - TTL) });

    const deleted = await mem.deleteExpiredDemoUsers(TTL);

    expect(deleted).toBe(0);
    expect(await mem.getUser(userId)).toBeDefined();
  });

  it("never deletes the shared demo@brain.fi account, even if very old", async () => {
    const sharedUser = await mem.createUser({
      username: SHARED_DEMO_EMAIL,
      email: SHARED_DEMO_EMAIL,
      password: null,
    });
    // Backdate by a week — well past any TTL.
    usersMap(mem).set(sharedUser.id, {
      ...sharedUser,
      createdAt: new Date(Date.now() - 7 * 24 * ONE_HOUR),
    });

    const deleted = await mem.deleteExpiredDemoUsers(TTL);

    expect(deleted).toBe(0);
    expect(await mem.getUser(sharedUser.id)).toBeDefined();
  });

  it("never deletes a real (non-demo) user, even if very old", async () => {
    const realUser = await mem.createUser({
      username: "real@company.com",
      email: "real@company.com",
      password: null,
    });
    usersMap(mem).set(realUser.id, {
      ...realUser,
      createdAt: new Date(Date.now() - 7 * 24 * ONE_HOUR),
    });

    const deleted = await mem.deleteExpiredDemoUsers(TTL);

    expect(deleted).toBe(0);
    expect(await mem.getUser(realUser.id)).toBeDefined();
  });

  it("returns 0 when there are no expired demo users", async () => {
    await createDemoUser(mem, TTL - ONE_HOUR); // fresh
    const deleted = await mem.deleteExpiredDemoUsers(TTL);
    expect(deleted).toBe(0);
  });

  it("deletes multiple expired users and returns the correct count", async () => {
    const expiredA = await createDemoUser(mem, TTL + ONE_HOUR);
    const expiredB = await createDemoUser(mem, TTL + 2 * ONE_HOUR);
    const fresh = await createDemoUser(mem, TTL - ONE_HOUR);

    const deleted = await mem.deleteExpiredDemoUsers(TTL);

    expect(deleted).toBe(2);
    expect(await mem.getUser(expiredA)).toBeUndefined();
    expect(await mem.getUser(expiredB)).toBeUndefined();
    expect(await mem.getUser(fresh)).toBeDefined(); // survivor
  });

  it("respects a custom (short) TTL so the threshold is not hardcoded", async () => {
    const shortTtl = 5 * 60 * 1000; // 5 minutes
    const userId = await createDemoUser(mem, shortTtl + 1000); // 5 min + 1 s old

    const deleted = await mem.deleteExpiredDemoUsers(shortTtl);

    expect(deleted).toBe(1);
    expect(await mem.getUser(userId)).toBeUndefined();
  });
});
