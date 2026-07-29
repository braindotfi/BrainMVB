import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { onboardingKey, isOnboardingComplete, markOnboardingComplete } from "./onboarding";

function installStorage(impl?: Partial<Storage>) {
  const data = new Map<string, string>();
  const store: Storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
    ...impl,
  } as Storage;
  (globalThis as any).localStorage = store;
  return data;
}

describe("onboarding state", () => {
  beforeEach(() => installStorage());
  afterEach(() => {
    delete (globalThis as any).localStorage;
  });

  it("keys onboarding state per user, so one user cannot mark another as onboarded", () => {
    expect(onboardingKey("abc")).toBe("brain_onboarding_complete_abc");
    markOnboardingComplete("abc");
    expect(isOnboardingComplete("abc")).toBe(true);
    expect(isOnboardingComplete("xyz")).toBe(false);
  });

  it("treats a signed-out user as not onboarded and never writes a key for them", () => {
    const data = installStorage();
    expect(onboardingKey(null)).toBeNull();
    expect(onboardingKey(undefined)).toBeNull();
    expect(isOnboardingComplete(null)).toBe(false);
    markOnboardingComplete(null);
    markOnboardingComplete("");
    expect(data.size).toBe(0);
  });

  it("reports not-onboarded rather than throwing when storage is unavailable", () => {
    installStorage({
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
    });
    expect(() => markOnboardingComplete("abc")).not.toThrow();
    expect(isOnboardingComplete("abc")).toBe(false);
  });

  it("treats an empty-string value as onboarded, matching HomePage's presence check", () => {
    // HomePage gates on presence, not truthiness. If this helper used a truthiness test
    // instead, a stored "" would silently re-show onboarding to a returning user.
    localStorage.setItem("brain_onboarding_complete_abc", "");
    expect(isOnboardingComplete("abc")).toBe(true);
  });
});
