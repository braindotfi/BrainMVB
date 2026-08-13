import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { setUserEmail, setUserPhone, userContactSnapshot } from "./userContact";
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

beforeAll(() => {
  priorLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
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

  it("does nothing when there is no signed-in account to scope to (logged out)", () => {
    applyUserScopedResets(REAL_USER_A);
    setUserEmail("custom-a@example.com");

    applyUserScopedResets(null);
    setUserEmail("should-not-persist@example.com"); // no-ops: no scope to save under

    applyUserScopedResets(REAL_USER_A);
    expect(userContactSnapshot().email).toBe("custom-a@example.com");
  });
});
