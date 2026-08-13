// @vitest-environment jsdom
/**
 * Rendering tests for the two surfaces the 2026-08-13 wrong-account-identity
 * bug was actually reported from: the Settings > Profile card and the
 * HomePage greeting. Both read the saved display-name override from
 * localStorage inline, so the store-level suite (userContact.test.ts) cannot
 * see a regression here — that gap is exactly how the first fix attempt
 * shipped broken.
 *
 * The critical assertion is frame-level: after an A → B account switch with
 * the component already mounted (SPA switches never remount pages), B's very
 * first committed frame must not contain A's saved name. To observe that
 * frame, the switch is driven through `flushSync`, which flushes the render
 * and layout effects but NOT passive effects — so a fix that re-points state
 * in a `useEffect` (correct-looking, but one stale frame is painted first)
 * fails the immediate assertion, while the render-time re-point passes.
 *
 * `useAuth` is mocked (module-level `currentUser`) so the test can flush the
 * user switch synchronously; the REAL `applyUserScopedResets` funnel is still
 * run first, in the same order `authContext.setUser` runs it, so the
 * userContact scope behaves exactly as in production.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { act } from "react-dom/test-utils";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/authContext";

const USER_A: AuthUser = { id: "u-acct-a", email: "a@example.com", name: "Alice Accountant" };
const USER_B: AuthUser = { id: "u-acct-b", email: "b@example.com", name: "Bea Builder" };
const A_SAVED_NAME = "Alice Override Co";
const A_SAVED_EMAIL = "alice-custom@example.com";

let currentUser: AuthUser | null = USER_A;

vi.mock("@/lib/authContext", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/authContext")>();
  return {
    ...real,
    useAuth: () => ({
      user: currentUser,
      isLoggedIn: !!currentUser,
      isLoading: false,
      isTransitioning: false,
      loginWithPassword: async () => {},
      register: async () => {},
      loginDemoFresh: async () => {},
      loginWithGoogle: () => {},
      logout: async () => {},
      deleteAccount: async () => {},
      deleteAccountData: async () => {},
    }),
  };
});

import { applyUserScopedResets } from "@/lib/authContext";
import { setUserEmail } from "@/lib/userContact";
import { CurrencyProvider } from "@/lib/currencyContext";
import { IntentsProvider } from "@/lib/intentsStore";
import { markOnboardingComplete } from "@/lib/onboarding";
import { ProfileSection } from "@/pages/SettingsPage";
import { HomePage } from "@/pages/HomePage";

/* Every backend read fails (retry: false): the pages must render from auth +
   localStorage alone, which keeps the identity assertions unpolluted by
   tenancy data — `companyName` is undefined, so the display name is exactly
   `override ?? user.name`. */
const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
          throw new Error("backend unavailable in identity tests");
        },
      },
    },
  });

let setHarnessUser: (u: AuthUser | null) => void = () => {};

function Harness({ children }: { children: ReactNode }) {
  const [user, setU] = useState<AuthUser | null>(currentUser);
  currentUser = user;
  setHarnessUser = setU;
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <CurrencyProvider>
        <IntentsProvider>{children}</IntentsProvider>
      </CurrencyProvider>
    </QueryClientProvider>
  );
}

// Silence "not configured to support act" — flushSync outside act is the
// point of these tests, but the mount/effect flushes still use act.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(ui: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness>{ui}</Harness>);
  });
}

/** The production funnel order (authContext.setUser): scoped resets first,
    then the React user state — flushed synchronously so the assertion right
    after this call observes B's FIRST committed frame, before any passive
    effect gets a chance to paper over a stale one. */
function switchAccountTo(user: AuthUser) {
  applyUserScopedResets(user);
  flushSync(() => {
    currentUser = user;
    setHarnessUser(user);
  });
}

const flushPassiveEffects = () => act(() => {});

function clickButton(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`);

// jsdom doesn't implement these; radix / interval code paths touch them.
beforeEach(() => {
  localStorage.clear();
  currentUser = USER_A;
  applyUserScopedResets(USER_A);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  applyUserScopedResets(null);
});

describe("Settings > Profile card across an A → B account switch (same mounted section)", () => {
  it("B never sees A's saved display name — not even for one frame", () => {
    mount(<ProfileSection />);
    flushPassiveEffects();

    // A saves a display-name override through the real Edit → Save flow, so
    // this test is bound to whatever key ProfileSection actually writes.
    clickButton(byTestId("button-edit-profile")!);
    setInputValue(byTestId("input-display-name") as HTMLInputElement, A_SAVED_NAME);
    clickButton(byTestId("button-edit-profile")!); // Save
    expect(byTestId("text-profile-name")!.textContent).toBe(A_SAVED_NAME);
    // ...and it actually persisted under A's scoped key.
    expect(localStorage.getItem(`brain_profile_name_${USER_A.id}`)).toBe(A_SAVED_NAME);

    // Same browser, same mounted section: B signs in.
    switchAccountTo(USER_B);

    // FIRST committed frame after the switch — passive effects have NOT run.
    // A useEffect-based "fix" leaves A's name in this frame and fails here.
    expect(byTestId("text-profile-name")!.textContent).toBe(USER_B.name);
    expect(container.textContent).not.toContain(A_SAVED_NAME);

    flushPassiveEffects();
    expect(byTestId("text-profile-name")!.textContent).toBe(USER_B.name);
    expect(container.textContent).not.toContain(A_SAVED_NAME);

    // A's override is still A's — switching back re-attaches it.
    switchAccountTo(USER_A);
    expect(byTestId("text-profile-name")!.textContent).toBe(A_SAVED_NAME);
  });

  it("B never sees A's saved contact email in the Identity card", () => {
    setUserEmail(A_SAVED_EMAIL); // saved while scoped to A (beforeEach)
    mount(<ProfileSection />);
    flushPassiveEffects();
    expect(container.textContent).toContain(A_SAVED_EMAIL);

    switchAccountTo(USER_B);

    expect(container.textContent).not.toContain(A_SAVED_EMAIL);
    flushPassiveEffects();
    expect(container.textContent).not.toContain(A_SAVED_EMAIL);
  });
});

describe("HomePage greeting across an A → B account switch (same mounted page)", () => {
  const greetingText = () => {
    // The greeting is the first <p> of the header stack; assert on the whole
    // container too so a stale name can't hide anywhere else on the page.
    return container.textContent ?? "";
  };

  it("B never sees A's saved display name in the greeting — not even for one frame", () => {
    // Keep the first-run walkthrough out of the way for both accounts.
    markOnboardingComplete(USER_A.id);
    markOnboardingComplete(USER_B.id);
    // A's saved override, under the exact key SettingsPage writes.
    localStorage.setItem(`brain_profile_name_${USER_A.id}`, A_SAVED_NAME);

    mount(<HomePage />);
    flushPassiveEffects();
    expect(greetingText()).toContain(A_SAVED_NAME);

    switchAccountTo(USER_B);

    // FIRST committed frame after the switch.
    expect(greetingText()).not.toContain(A_SAVED_NAME);
    expect(greetingText()).toContain(USER_B.name!);

    flushPassiveEffects();
    expect(greetingText()).not.toContain(A_SAVED_NAME);
    expect(greetingText()).toContain(USER_B.name!);

    // And A gets their own override back.
    switchAccountTo(USER_A);
    expect(greetingText()).toContain(A_SAVED_NAME);
  });
});
