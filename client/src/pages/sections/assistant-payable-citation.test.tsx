// @vitest-environment jsdom
/**
 * Rendering test: tapping an assistant citation for a payable opens the Payable
 * record — including one that sits past the first page of the obligations read.
 *
 * The sibling source scans (assistant-citation-routes.test.ts, assistantCitations
 * .test.ts) prove the branch is spelled correctly and that the lookup rule is sound.
 * Neither can see whether the popup actually opens, and this defect lived entirely in
 * that gap: the wiring was right, the read was short, and the citation quietly fell
 * through to a card repeating the id back. So the two cases that differ only in how
 * much of the ledger was read are pinned against a real render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* The chat bubble measures its own line boxes to shrink-wrap wrapped text. jsdom
   lays nothing out, so the measurement APIs are stubbed to report no geometry —
   the bubble then leaves its width alone, which is all this suite needs. */
Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/** The record the assistant cites. It is the 23rd row, so a one-page read misses it. */
const CITED_ID = "obl_page_two";

const FIRST_PAGE = Array.from({ length: 20 }, (_, i) => ({
  id: `obl_first_${i}`,
  type: "bill",
  counterparty_id: "cp_other",
  amount_due: "100.00000000",
  currency: "USD",
  due_date: "2026-10-01",
  status: "upcoming",
}));

const CITED_ROW = {
  id: CITED_ID,
  type: "payroll",
  counterparty_id: "cp_acme",
  amount_due: "48250.00000000",
  currency: "USD",
  due_date: "2026-10-15",
  status: "upcoming",
};

/** What the obligations cursor walk came back with, per test. */
type ReadState = "complete" | "one-page" | "loading" | "failed";
let readState: ReadState = "complete";

vi.mock("@/lib/ledgerRead", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ledgerRead")>();
  return {
    ...real,
    usePagedLedgerRead: () => {
      if (readState === "loading") return { read: null, failed: false, ingesting: false };
      if (readState === "failed") return { read: null, failed: true, ingesting: false };
      /* "one-page" is the pre-fix behaviour: brain-core's silent cap, so the cited row
         never arrives and the walk knows it never reached the end. */
      if (readState === "one-page") return { read: { rows: FIRST_PAGE, complete: false }, failed: false, ingesting: false };
      return { read: { rows: [...FIRST_PAGE, CITED_ROW], complete: true }, failed: false, ingesting: false };
    },
  };
});

vi.mock("@/lib/authContext", () => ({
  useAuth: () => ({ user: { id: "u_test" }, isLoading: false, isTransitioning: false }),
}));

vi.mock("@/lib/useCurrency", () => ({
  useCurrency: () => ({
    symbol: "$",
    format: (v: string | number) => `$${v}`,
    formatText: (t: string) => t,
  }),
}));

vi.mock("@/lib/brainSuggestedQuestions", () => ({
  useSuggestedQuestions: () => ({ questions: [], isLoading: false, isError: false }),
  resolveSuggestionChips: () => ({ chips: [], state: "ready" }),
}));

import { BrainAssistant } from "./BrainAssistant";
import { IntentsProvider } from "@/lib/intentsStore";

const STORAGE_KEY = "brain.chat.u_test";

/** A saved conversation whose answer cites the payable. */
function seedConversation() {
  const session = {
    id: "sess_1",
    title: "What do we owe Acme?",
    createdAt: Date.now(),
    messages: [
      { id: "m1", role: "user", text: "What do we owe Acme?" },
      {
        id: "m2",
        role: "assistant",
        text: "Acme payroll is due on 15 October.",
        answerStatus: "answered",
        sources: [{ entityId: CITED_ID, entityType: null, excerpt: "Acme payroll" }],
      },
    ],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([session]));
  localStorage.setItem(`${STORAGE_KEY}.active`, session.id);
}

let container: HTMLDivElement;
let root: Root;

function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => ({}) } },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <IntentsProvider>
          <BrainAssistant />
        </IntentsProvider>
      </QueryClientProvider>,
    );
  });
}

function q(testId: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${testId}"]`);
}

function click(testId: string) {
  act(() => {
    q(testId)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Open the evidence list and tap the one citation in it. */
function tapCitation() {
  click("assistant-sources");
  const link = q("evidence-link-0");
  expect(link, "the citation must be rendered and tappable").toBeTruthy();
  click("evidence-link-0");
}

beforeEach(() => {
  readState = "complete";
  localStorage.clear();
  seedConversation();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("an assistant citation for a payable", () => {
  it("opens the Payable record when the walk reached the row's page", () => {
    render();
    tapCitation();

    // The real Payable popup, showing the record's own figures — not a card
    // that can only repeat the id back.
    expect(q("text-payable-summary"), "the Payable popup did not open").toBeTruthy();
    expect(document.body.textContent).toContain("$48,250.00");
    expect(document.body.textContent).toContain("Oct 15, 2026");
    expect(q("live-evidence-record-popup"), "the generic evidence card must not be used").toBeNull();
  });

  it("says the lookup could not be made when the read stopped short", () => {
    /* The reported defect. The row exists upstream; the read simply never got to
       its page. The one thing this must not do is answer as though it had. */
    readState = "one-page";
    render();
    tapCitation();

    expect(q("text-payable-summary"), "no Payable record is held, so none may be shown").toBeNull();
    const note = q("live-evidence-unresolved-note");
    expect(note, "an unreadable page must not render as a confident evidence card").toBeTruthy();
    expect(note?.textContent).toMatch(/couldn't be looked up/);
  });

  it("distinguishes a read still in flight from one that failed", () => {
    readState = "loading";
    render();
    tapCitation();
    const pending = q("live-evidence-unresolved-note")?.textContent ?? "";
    expect(pending).toMatch(/Still reading/);

    act(() => root.unmount());
    container.remove();

    readState = "failed";
    render();
    tapCitation();
    const failed = q("live-evidence-unresolved-note")?.textContent ?? "";
    expect(failed).toBeTruthy();
    expect(failed).not.toBe(pending);
  });

  it("still shows a plain evidence card once the walk proves the record is not a payable", () => {
    /* The honest negative: the whole list was read and this id is not in it. The
       note would be a false alarm here, and every non-payable citation would wear
       it. */
    readState = "complete";
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "sess_2",
          title: "Who is this?",
          createdAt: Date.now(),
          messages: [
            { id: "m1", role: "user", text: "Who is this?" },
            {
              id: "m2",
              role: "assistant",
              text: "A counterparty record.",
              answerStatus: "answered",
              sources: [{ entityId: "cp_unknown", entityType: "counterparty", excerpt: "Acme Inc" }],
            },
          ],
        },
      ]),
    );
    localStorage.setItem(`${STORAGE_KEY}.active`, "sess_2");
    render();
    tapCitation();

    expect(q("live-evidence-record-popup"), "the citation must still open something").toBeTruthy();
    expect(q("live-evidence-unresolved-note")).toBeNull();
  });

  it("does not caption a non-payable citation with a payables read it never needed", () => {
    /* A counterparty the assistant cited is not looked up in the obligations feed, so
       an obligations read that is still running says nothing about it. Noting it there
       would put a warning on ordinary citations for the first seconds of every visit. */
    readState = "loading";
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "sess_3",
          title: "Who is this?",
          createdAt: Date.now(),
          messages: [
            { id: "m1", role: "user", text: "Who is this?" },
            {
              id: "m2",
              role: "assistant",
              text: "A counterparty record.",
              answerStatus: "answered",
              sources: [{ entityId: "cp_unknown", entityType: "counterparty", excerpt: "Acme Inc" }],
            },
          ],
        },
      ]),
    );
    localStorage.setItem(`${STORAGE_KEY}.active`, "sess_3");
    render();
    tapCitation();

    expect(q("live-evidence-record-popup")).toBeTruthy();
    expect(q("live-evidence-unresolved-note")).toBeNull();
  });
});
