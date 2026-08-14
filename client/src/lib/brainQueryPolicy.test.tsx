// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useBrainProposals, useDecideProposal } from "./brainProposals";
import { useBrainAutoApproved, useBrainReviewQueue } from "./brainQueue";
import { resetBrainRateLimitStateForTests } from "./rateLimit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let client: QueryClient;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function mount(ui: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

function proposalsResponse(proposals: unknown[] = []) {
  return new Response(JSON.stringify({ proposals, next_cursor: null }), { status: 200 });
}

beforeEach(() => {
  client = makeClient();
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  client.clear();
  focusManager.setFocused(undefined);
  resetBrainRateLimitStateForTests();
  vi.restoreAllMocks();
});

describe("Brain proposal query policy", () => {
  it("multiple mounted proposal consumers share one effective request per canonical list feed", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/brain/proposals")) return proposalsResponse();
      if (url.startsWith("/api/brain/ledger/counterparties")) {
        return new Response(JSON.stringify({ counterparties: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    function Consumers() {
      useBrainProposals();
      useBrainReviewQueue();
      useBrainAutoApproved();
      return null;
    }

    mount(<Consumers />);
    await vi.waitFor(() => {
      const proposalCalls = fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/brain/proposals"));
      expect(proposalCalls.filter((url) => url === "/api/brain/proposals?limit=100&status=pending")).toHaveLength(1);
      expect(proposalCalls.filter((url) => url === "/api/brain/proposals?limit=100")).toHaveLength(1);
    });
  });

  it("focus events within the 30-second freshness window do not refetch repeatedly", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => proposalsResponse());
    vi.stubGlobal("fetch", fetchMock);

    function Consumer() {
      useBrainProposals();
      return null;
    }

    mount(<Consumer />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a successful proposal decision invalidates and refreshes the list immediately", async () => {
    let proposalGets = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/brain/proposals/prop_1/decide") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "prop_1", decision: "approve", status: "approved", audit_id: null, payment_intent_id: null }), { status: 200 });
      }
      if (url.startsWith("/api/brain/proposals")) {
        proposalGets += 1;
        return proposalsResponse([]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    function Consumer() {
      const decide = useDecideProposal();
      useBrainProposals();
      return (
        <button
          type="button"
          onClick={() => decide.mutate({ id: "prop_1", decision: "approve" })}
          data-testid="decide"
        />
      );
    }

    mount(<Consumer />);
    await vi.waitFor(() => expect(proposalGets).toBe(1));

    act(() => {
      (container!.querySelector('[data-testid="decide"]') as HTMLButtonElement).click();
    });

    await vi.waitFor(() => expect(proposalGets).toBe(2));
  });
});
