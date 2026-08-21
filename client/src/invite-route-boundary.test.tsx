// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";

const boundarySpies = vi.hoisted(() => ({
  signedIn: true,
  registrations: 0,
  googleReturnPaths: [] as Array<string | undefined>,
  currencyProviderMounts: 0,
  transactionProviderMounts: 0,
  intentsProviderMounts: 0,
  memberDetailHostMounts: 0,
  hydrateDocumentsCalls: 0,
  projectionRefreshCalls: 0,
}));

vi.mock("@/lib/authContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: boundarySpies.signedIn
      ? { id: "unlinked-invitee", email: "invitee@example.com", name: "Invited User" }
      : null,
    isLoggedIn: boundarySpies.signedIn,
    isLoading: false,
    isTransitioning: false,
    loginWithPassword: async () => {},
    register: async () => {
      boundarySpies.registrations += 1;
      boundarySpies.signedIn = true;
    },
    loginDemoFresh: async () => {},
    loginWithGoogle: (returnTo?: string) => { boundarySpies.googleReturnPaths.push(returnTo); },
    logout: async () => true,
    deleteAccount: async () => {},
    deleteAccountData: async () => {},
  }),
}));

vi.mock("@/lib/sessionTimeoutContext", () => ({
  SessionTimeoutProvider: ({ children }: { children: React.ReactNode }) => children,
  useSessionTimeout: () => ({ timeoutMin: 30 }),
}));

vi.mock("@/components/AppAlert", () => ({
  AppAlertProvider: ({ children }: { children: React.ReactNode }) => children,
  useAppAlert: () => ({ error: () => {}, info: () => {} }),
}));

vi.mock("@/lib/currencyContext", () => ({
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => {
    boundarySpies.currencyProviderMounts += 1;
    return children;
  },
}));

vi.mock("@/lib/transactionContext", () => ({
  TransactionProvider: ({ children }: { children: React.ReactNode }) => {
    boundarySpies.transactionProviderMounts += 1;
    return children;
  },
}));

vi.mock("@/lib/intentsStore", () => ({
  IntentsProvider: ({ children }: { children: React.ReactNode }) => {
    boundarySpies.intentsProviderMounts += 1;
    return children;
  },
}));

vi.mock("@/components/MemberDetailPopup", () => ({
  MemberDetailHost: () => {
    boundarySpies.memberDetailHostMounts += 1;
    return null;
  },
}));

vi.mock("@/lib/documentsStore", () => ({
  hydrateDocuments: () => {
    boundarySpies.hydrateDocumentsCalls += 1;
  },
}));

vi.mock("@/lib/brainRefresh", () => ({
  useBrainProjectionRefresh: () => {
    boundarySpies.projectionRefreshCalls += 1;
  },
}));

import App from "@/App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let requests: string[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  window.history.pushState({}, "", "/invite/invite-token-for-boundary-test");
  requests = [];
  Object.assign(boundarySpies, {
    signedIn: true,
    registrations: 0,
    googleReturnPaths: [],
    currencyProviderMounts: 0,
    transactionProviderMounts: 0,
    intentsProviderMounts: 0,
    memberDetailHostMounts: 0,
    hydrateDocumentsCalls: 0,
    projectionRefreshCalls: 0,
  });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    requests.push(typeof input === "string" ? input : input.toString());
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

describe("/invite/:token route boundary", () => {
  it("does not mount Brain data providers or request a Brain session before explicit invite action", async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="input-invite-token"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="button-join-company"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="tab-create-company"]')).toBeNull();

    // No /api/brain read means the server cannot enter getBrainSession/createDurableSession.
    expect(requests.filter((url) => url.startsWith("/api/brain/"))).toEqual([]);
    expect(requests).toEqual([]);
    expect(boundarySpies.currencyProviderMounts).toBe(0);
    expect(boundarySpies.transactionProviderMounts).toBe(0);
    expect(boundarySpies.intentsProviderMounts).toBe(0);
    expect(boundarySpies.memberDetailHostMounts).toBe(0);
    expect(boundarySpies.hydrateDocumentsCalls).toBe(0);
    expect(boundarySpies.projectionRefreshCalls).toBe(0);
  });

  it("lets an anonymous invitee register without creating a company before Join", async () => {
    boundarySpies.signedIn = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requests.push(url);
      if (url === "/api/config") {
        return new Response(JSON.stringify({ tenancyProduction: true, googleEnabled: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    const click = (selector: string) => {
      act(() => {
        container.querySelector(selector)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    };
    const setValue = (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    click('[data-testid="button-toggle-mode"]');
    setValue('[data-testid="input-name"]', "Invited User");
    setValue('[data-testid="input-email"]', "invitee@example.com");
    setValue('[data-testid="input-password"]', "safe-password");
    expect(container.querySelector('[data-testid="input-signup-company"]')).toBeNull();

    await act(async () => {
      (container.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(boundarySpies.registrations).toBe(1);
    expect(requests.filter((url) => url.startsWith("/api/brain/"))).toEqual([]);
    expect(requests).not.toContain("/api/brain/tenants");

    // Auth state normally re-renders AuthProvider immediately after register. Re-render the
    // mocked provider state to prove the preserved URL then selects the explicit Join screen.
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="input-invite-token"]')).not.toBeNull();
    expect(requests.filter((url) => url.startsWith("/api/brain/"))).toEqual([]);
  });

  it("passes the exact invite path into Google sign-in", async () => {
    boundarySpies.signedIn = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requests.push(url);
      if (url === "/api/config") {
        return new Response(JSON.stringify({ tenancyProduction: true, googleEnabled: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });
    act(() => {
      container.querySelector('[data-testid="button-google-signin"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(boundarySpies.googleReturnPaths).toEqual(["/invite/invite-token-for-boundary-test"]);
    expect(requests.filter((url) => url.startsWith("/api/brain/"))).toEqual([]);
  });
});