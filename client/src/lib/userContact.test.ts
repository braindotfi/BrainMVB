import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { setUserEmail, setUserPhone, userContactSnapshot, subscribe } from "./userContact";
import { applyUserScopedResets } from "./authContext";
import type { AuthUser } from "./authContext";

/**
 * This vitest project runs client tests under environment: "node" (see
 * vitest.config.ts), which has no global `localStorage` — and this repo has
 * no @testing-library/react to render the hook either. A minimal in-memory
 * Storage polyfill is the standard way to test browser-storage code under
 * Node; userContact.ts's own try/catch around every localStorage call means
 * it degrades to "no persistence" without this, silently — so without the
 * polyfill these tests would pass for the wrong reason (nothing ever
 * actually persisting) rather than proving the real fix.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

let priorLocalStorage: Storage | undefined;
let priorWindow: unknown;

/* Minimal window polyfill for the storage-event path: `subscribe` registers a
   "storage" handler on window at call time. `fireStorageEvent` plays the role
   of the BROWSER's cross-tab delivery — in a real browser the writing tab
   never receives its own storage event, so each test simulates "another tab
   wrote" as: mutate localStorage directly (the write is already visible,
   storage is shared), then fire the event at this tab's handlers. */
const storageHandlers = new Set<(e: StorageEvent) => void>();
function fireStorageEvent(key: string | null, newValue: string | null): void {
  const e = { key, newValue } as StorageEvent;
  storageHandlers.forEach((h) => h(e));
}
const fakeWindow = {
  addEventListener: (type: string, h: (e: StorageEvent) => void) => {
    if (type === "storage") storageHandlers.add(h);
  },
  removeEventListener: (type: string, h: (e: StorageEvent) => void) => {
    if (type === "storage") storageHandlers.delete(h);
  },
};

beforeAll(() => {
  priorLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  priorWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    writable: true,
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: priorLocalStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: priorWindow,
    writable: true,
    configurable: true,
  });
});

beforeEach(() => {
  localStorage.clear();
  applyUserScopedResets(null);
});

const REAL_USER_A: AuthUser = { id: "u-real-a", email: "a@example.com" };
const REAL_USER_B: AuthUser = { id: "u-real-b", email: "b@example.com" };
const DEMO_USER: AuthUser = { id: "u-demo-1", email: "demo-fresh-abc@brain.fi", isDemo: true };

describe("userContact", () => {
  it("falls back to the account's own email/phone when no override is saved", () => {
    applyUserScopedResets(REAL_USER_A);
    expect(userContactSnapshot()).toEqual({ email: null, phone: null });
  });

  it("returns a saved override for the account that saved it", () => {
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");
    setUserPhone("+1-555-0100");

    expect(userContactSnapshot()).toEqual({
      email: "custom-a@example.com",
      phone: "+1-555-0100",
    });
  });

  it("does NOT leak real user A's saved override into real user B's account on the same browser — the confirmed bug (2026-08-13)", () => {
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");
    setUserPhone("+1-555-0100");

    // Same browser (same localStorage instance), different account.
    applyUserScopedResets(REAL_USER_B);

    expect(userContactSnapshot()).toEqual({ email: null, phone: null });
  });

  it("correctly re-attaches user A's own saved override when A logs back in", () => {
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");

    applyUserScopedResets(REAL_USER_B);
    expect(userContactSnapshot().email).toBeNull();

    applyUserScopedResets(REAL_USER_A);
    expect(userContactSnapshot().email).toBe("custom-a@example.com");
  });

  it("survives the reset funnel re-running for the SAME account (session bootstrap on page load) without dropping the saved override", () => {
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");

    // applyUserScopedResets also runs on session bootstrap, not just on an
    // actual account change — must be a no-op for an unchanged user id, or a
    // page refresh would silently wipe every saved override.
    applyUserScopedResets(REAL_USER_A);

    expect(userContactSnapshot().email).toBe("custom-a@example.com");
  });

  it("never lets a demo session inherit a real user's saved override, with no separate isDemo flag needed", () => {
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");

    applyUserScopedResets(DEMO_USER);

    expect(userContactSnapshot()).toEqual({ email: null, phone: null });
  });

  it("clears the legacy unscoped keys so they can't be confused for anything (no functional dependency on this — new code never reads them)", () => {
    localStorage.setItem("brain_profile_email", "leftover@example.com");
    localStorage.setItem("brain_profile_phone", "+1-555-9999");
    localStorage.setItem("brain_profile_name", "Leftover Co");

    applyUserScopedResets(REAL_USER_A);

    expect(localStorage.getItem("brain_profile_email")).toBeNull();
    expect(localStorage.getItem("brain_profile_phone")).toBeNull();
    expect(localStorage.getItem("brain_profile_name")).toBeNull();
    // And user A does not somehow inherit the leftover value either.
    expect(userContactSnapshot()).toEqual({ email: null, phone: null });
  });

  it("distinguishes contact pairs that a serialized `email|phone` snapshot would collide (both fields are free text and may contain a pipe)", () => {
    // ("a|b", null) and ("a", "b|") both serialize to "a|b|". If the store's
    // snapshot were that string, useSyncExternalStore would treat the A → B
    // switch as "no change" and a consumer that doesn't independently re-render
    // on auth would keep showing A's contact info.
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("a|b");
    const a = userContactSnapshot();

    applyUserScopedResets(REAL_USER_B);
    setUserEmail("a");
    setUserPhone("b|");
    const b = userContactSnapshot();

    expect(a).not.toEqual(b);
    expect(a).not.toBe(b);
  });

  it("keeps snapshot identity stable while nothing changes, and replaces it when something does", () => {
    // useSyncExternalStore compares snapshots by identity: an unstable identity
    // renders forever, a frozen one never updates.
    applyUserScopedResets(REAL_USER_A);
    const first = userContactSnapshot();
    expect(userContactSnapshot()).toBe(first);

    setUserEmail("custom-a@example.com");
    const afterWrite = userContactSnapshot();
    expect(afterWrite).not.toBe(first);
    expect(userContactSnapshot()).toBe(afterWrite);

    applyUserScopedResets(REAL_USER_B);
    expect(userContactSnapshot()).not.toBe(afterWrite);
  });

  it("does nothing when there is no signed-in account to scope to (logged out)", () => {
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");

    applyUserScopedResets(null);
    setUserEmail("should-not-persist@example.com"); // no-ops: no scope to save under

    applyUserScopedResets(REAL_USER_A);
    expect(userContactSnapshot().email).toBe("custom-a@example.com");
  });
});

describe("userContact cross-tab storage events (two tabs, this module = tab B)", () => {
  // Simulated "tab A" writes: the other tab shares localStorage, so its write
  // is a direct setItem here, followed by the storage event the browser would
  // deliver to THIS tab. See fireStorageEvent above.
  function otherTabWrites(key: string, value: string): void {
    localStorage.setItem(key, value);
    fireStorageEvent(key, value);
  }

  it("a write in a tab signed into a DIFFERENT account does not update this tab", () => {
    applyUserScopedResets(REAL_USER_B);
    let fired = 0;
    const unsubscribe = subscribe(() => fired++);

    // Tab A is signed in as user A and saves an override.
    otherTabWrites("brain_profile_email_u-real-a", "custom-a@example.com");
    otherTabWrites("brain_profile_phone_u-real-a", "+1-555-0100");

    expect(fired).toBe(0);
    expect(userContactSnapshot()).toEqual({ email: null, phone: null });
    unsubscribe();
  });

  it("a write in a second tab signed into the SAME account updates this tab", () => {
    applyUserScopedResets(REAL_USER_A);
    let fired = 0;
    const unsubscribe = subscribe(() => fired++);

    otherTabWrites("brain_profile_email_u-real-a", "custom-a@example.com");
    expect(fired).toBe(1);
    expect(userContactSnapshot().email).toBe("custom-a@example.com");

    otherTabWrites("brain_profile_phone_u-real-a", "+1-555-0100");
    expect(fired).toBe(2);
    expect(userContactSnapshot().phone).toBe("+1-555-0100");
    unsubscribe();
  });

  it("unsubscribe detaches the storage handler (no update after cleanup)", () => {
    applyUserScopedResets(REAL_USER_A);
    let fired = 0;
    const unsubscribe = subscribe(() => fired++);
    unsubscribe();

    otherTabWrites("brain_profile_email_u-real-a", "custom-a@example.com");
    expect(fired).toBe(0);
  });

  it("a stale OLD-BUILD tab writing the legacy unscoped key neither updates this tab nor survives the next scope change", () => {
    // The legacy-key interaction, confirmed against the real prior build
    // (commit 7fa3284, the last one shipping unscoped keys): that client
    // (a) rehydrates `brain_profile_email`/`brain_profile_phone` ONCE into
    // module state and never re-reads storage afterwards, and (b) its
    // subscribe() never registers a `storage` listener at all. So the new
    // client deleting the legacy keys cannot change what an open old-build
    // tab displays, and an old-build tab's unscoped writes are never read by
    // the new client. Harmless in both directions — this test pins the new
    // client's half of that.
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");
    let fired = 0;
    const unsubscribe = subscribe(() => fired++);

    otherTabWrites("brain_profile_email", "stale-old-build@example.com");
    otherTabWrites("brain_profile_phone", "+1-555-9999");

    expect(fired).toBe(0);
    expect(userContactSnapshot()).toEqual({ email: "custom-a@example.com", phone: null });

    // Next auth transition sweeps the stale keys back out.
    applyUserScopedResets(REAL_USER_B);
    expect(localStorage.getItem("brain_profile_email")).toBeNull();
    expect(localStorage.getItem("brain_profile_phone")).toBeNull();
    unsubscribe();
  });
});
