// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useEffect, type ReactNode } from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { AppAlertProvider, useAppAlert } from "./AppAlert";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = "";
});

function mount(ui: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
}

function DoubleRateLimitAlert() {
  const alert = useAppAlert();
  useEffect(() => {
    alert.error("System Usage Error", "Rate limit exceeded. Retry in 1 second.", 5_000, "brain-rate-limit");
    alert.error("System Usage Error", "Rate limit exceeded. Retry in 12 seconds.", 5_000, "brain-rate-limit");
  }, [alert]);
  return null;
}

describe("AppAlert keyed dedupe", () => {
  it("updates one visible alert instead of stacking simultaneous rate-limit alerts", () => {
    mount(
      <AppAlertProvider>
        <DoubleRateLimitAlert />
      </AppAlertProvider>,
    );

    const alerts = document.body.querySelectorAll('[data-testid="alert-error"]');
    expect(alerts).toHaveLength(1);
    expect(document.body.textContent).toContain("System Usage Error");
    expect(document.body.textContent).toContain("Rate limit exceeded. Retry in 12 seconds.");
    expect(document.body.textContent).not.toContain("Rate limit exceeded. Retry in 1 second.");
  });
});
