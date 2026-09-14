// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  useStableResetCount,
  type AuthoritativeCountState,
} from "./stableResetCount";

function CountProbe({
  count,
  receiptKeys,
  state,
}: {
  count: number;
  receiptKeys: string[];
  state: AuthoritativeCountState;
}) {
  return (
    <output data-testid="count">
      {useStableResetCount(count, receiptKeys, state)}
    </output>
  );
}

describe("useStableResetCount", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (
    count: number,
    receiptKeys: string[],
    state: AuthoritativeCountState,
  ) => {
    act(() => {
      root.render(
        <CountProbe count={count} receiptKeys={receiptKeys} state={state} />,
      );
    });
    return container.textContent;
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not collapse to one while reset data contains only a new receipt", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(render(3, [], "ready")).toBe("3");
    expect(render(1, ["receipt:newly-approved"], "loading")).toBe("4");
    expect(render(4, ["receipt:newly-approved"], "ready")).toBe("4");
  });

  it("hides a receipt-only count before the first audit snapshot exists", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(render(0, [], "loading")).toBe("");
    expect(render(1, ["receipt:newly-approved"], "loading")).toBe("");
    expect(render(4, ["receipt:newly-approved"], "ready")).toBe("4");
  });

  it("keeps the badge hidden when the first audit read fails", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(render(0, [], "loading")).toBe("");
    expect(render(1, ["receipt:newly-approved"], "error")).toBe("");
  });

  it("does not add a receipt that existed in the settled snapshot", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(render(3, ["receipt:already-recorded"], "ready")).toBe("3");
    expect(render(1, ["receipt:already-recorded"], "loading")).toBe("3");
  });

  it("preserves separate historical decisions for the same proposal", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    /* The two prior rows may link to one proposal; their distinct row count is
       retained, and a re-decision receipt still adds a third event. */
    expect(render(2, ["receipt:old-decision"], "ready")).toBe("2");
    expect(render(1, ["receipt:new-decision"], "loading")).toBe("3");
  });

  it("keeps the settled total plus a new receipt when a reset fails", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(render(3, ["receipt:old-decision"], "ready")).toBe("3");
    expect(
      render(
        2,
        ["receipt:new-decision", "receipt:old-decision"],
        "error",
      ),
    ).toBe("4");
  });

  it("accepts an authoritative decrease after the reset finishes", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(render(3, [], "ready")).toBe("3");
    expect(render(0, [], "loading")).toBe("3");
    expect(render(2, [], "ready")).toBe("2");
  });
});