import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { isBackupApprover, setBackupApprover, subscribe } from "./backupApprover";
import { applyUserScopedResets } from "./authContext";
import type { AuthUser } from "./authContext";

/* Same Node-environment polyfills as userContact.test.ts: an in-memory
   Storage (backupApprover.ts's try/catch would otherwise degrade to "no
   persistence" and the tests would pass vacuously) and a minimal window whose
   fireStorageEvent plays the browser's cross-tab delivery — the writing tab
   never receives its own storage event, so "another tab wrote" is simulated
   as a direct setItem plus an event fired at this tab's handlers. */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

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

let priorLocalStorage: Storage | undefined;
let priorWindow: unknown;

beforeAll(() => {
  priorLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  priorWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), writable: true, configurable: true });
  Object.defineProperty(globalThis, "window", { value: fakeWindow, writable: true, configurable: true });
});

afterAll(() => {
  Object.defineProperty(globalThis, "localStorage", { value: priorLocalStorage, writable: true, configurable: true });
  Object.defineProperty(globalThis, "window", { value: priorWindow, writable: true, configurable: true });
});

beforeEach(() => {
  localStorage.clear();
  applyUserScopedResets(null);
});

const REAL_USER_A: AuthUser = { id: "u-real-a", email: "a@example.com" };
const REAL_USER_B: AuthUser = { id: "u-real-b", email: "b@example.com" };

function otherTabWrites(key: string, value: string): void {
  localStorage.setItem(key, value);
  fireStorageEvent(key, value);
}

describe("backupApprover cross-tab storage events (two tabs, this module = tab B)", () => {
  it("a mark saved in a tab signed into a DIFFERENT account does not update this tab", () => {
    applyUserScopedResets(REAL_USER_B);
    let fired = 0;
    const unsubscribe = subscribe(() => fired++);

    // Tab A, signed in as user A, marks member m-1.
    otherTabWrites("brain_backup_approvers_u-real-a", JSON.stringify(["m-1"]));

    expect(fired).toBe(0);
    expect(isBackupApprover("m-1")).toBe(false);
    unsubscribe();
  });

  it("a mark saved in a second tab signed into the SAME account updates this tab", () => {
    applyUserScopedResets(REAL_USER_A);
    let fired = 0;
    const unsubscribe = subscribe(() => fired++);

    otherTabWrites("brain_backup_approvers_u-real-a", JSON.stringify(["m-1"]));

    expect(fired).toBe(1);
    expect(isBackupApprover("m-1")).toBe(true);
    unsubscribe();
  });

  it("unsubscribe detaches the storage handler", () => {
    applyUserScopedResets(REAL_USER_A);
    let fired = 0;
    const unsubscribe = subscribe(() => fired++);
    unsubscribe();

    otherTabWrites("brain_backup_approvers_u-real-a", JSON.stringify(["m-1"]));
    expect(fired).toBe(0);
  });

  it("marks never leak across accounts within one tab either (scope switch)", () => {
    applyUserScopedResets(REAL_USER_A);
    setBackupApprover("m-1", true);
    expect(isBackupApprover("m-1")).toBe(true);

    applyUserScopedResets(REAL_USER_B);
    expect(isBackupApprover("m-1")).toBe(false);

    applyUserScopedResets(REAL_USER_A);
    expect(isBackupApprover("m-1")).toBe(true);
  });
});
