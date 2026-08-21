// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { ResetPasswordPage } from "./ResetPasswordPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount(returnTo?: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ResetPasswordPage token="opaque-test-token" returnTo={returnTo} />);
  });
}

function click(text: string) {
  const button = Array.from(container!.querySelectorAll("button")).find((node) => node.textContent?.includes(text));
  expect(button).toBeTruthy();
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("ResetPasswordPage recovery path", () => {
  it("requests a replacement link from the invalid-link page without navigating into an account", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ valid: false }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mount();

    await act(async () => {});
    expect(container!.textContent).toContain("This Link Is No Longer Valid");
    expect(container!.textContent).toContain("expire 30 minutes after they are requested");

    click("Request a new link");
    const email = container!.querySelector('[data-testid="input-reset-resend-email"]') as HTMLInputElement;
    setInput(email, "invitee@example.com");
    const form = email.closest("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/password-reset/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "invitee@example.com" }),
      }),
    );
    expect(container!.textContent).toContain("Check your email");
    expect(container!.textContent).not.toContain("Set a New Password");
  });

  it("carries an invite return path through resend and back to the invite sign-in screen", async () => {
    const invitePath = "/invite/invite-token_123";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ valid: false }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mount(invitePath);

    await act(async () => {});
    click("Request a new link");
    const email = container!.querySelector('[data-testid="input-reset-resend-email"]') as HTMLInputElement;
    setInput(email, "invitee@example.com");
    await act(async () => {
      email.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/password-reset/request",
      expect.objectContaining({
        body: JSON.stringify({ email: "invitee@example.com", return_to: invitePath }),
      }),
    );
    click("Back to sign in");
    expect(window.location.pathname).toBe(invitePath);
  });

  it("sends an invite return path with confirmation and never falls back to home after a successful reset", async () => {
    const invitePath = "/invite/invite-token_123";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ valid: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);
    mount(invitePath);

    await act(async () => {});
    const password = container!.querySelector('[data-testid="input-reset-password"]') as HTMLInputElement;
    const confirmation = container!.querySelector('[data-testid="input-reset-password-confirm"]') as HTMLInputElement;
    setInput(password, "new-correct-horse");
    setInput(confirmation, "new-correct-horse");
    await act(async () => {
      password.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/password-reset/confirm",
      expect.objectContaining({
        body: JSON.stringify({
          token: "opaque-test-token",
          password: "new-correct-horse",
          return_to: invitePath,
        }),
      }),
    );
    click("Go to sign in");
    expect(window.location.pathname).toBe(invitePath);
  });
});