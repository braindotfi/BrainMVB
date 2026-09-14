// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useEffect } from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppAlertProvider, useAppAlert } from "./AppAlert";
import { SourceIngestToastProvider, useSourceIngestToast } from "./SourceIngestToast";

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

/* Reproduces the ordinary upload path: the progress card is on screen while an
   alert is raised underneath it. */
function UploadInProgressWithAlert() {
  const ingest = useSourceIngestToast();
  const alert = useAppAlert();
  useEffect(() => {
    ingest.notifyUploadStart("invoice.pdf");
    alert.success("Document uploaded", "Brain will read it and extract what it can.", 0);
  }, [ingest, alert]);
  return null;
}

function mountApp() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root!.render(
      <QueryClientProvider client={qc}>
        <AppAlertProvider>
          <SourceIngestToastProvider>
            <UploadInProgressWithAlert />
          </SourceIngestToastProvider>
        </AppAlertProvider>
      </QueryClientProvider>,
    );
  });
}

describe("bottom-right corner is a single shared stack", () => {
  /* The progress card and the alerts were both pinned at
     `fixed bottom-[20px] right-[20px]`, differing only in z-index, so an alert
     raised during an ingest was covered rather than queued. Both must now live
     in the one stack element, which is what makes them lay out as a column. */
  it("puts the ingest progress card and a concurrent alert in the same stack", () => {
    mountApp();

    const viewport = document.body.querySelector('[data-testid="alert-viewport"]');
    expect(viewport, "no alert viewport rendered").not.toBeNull();

    const card = document.body.querySelector('[data-testid="source-ingest-toast"]');
    expect(card, "no ingest progress card rendered").not.toBeNull();

    const alertCard = document.body.querySelector('[data-testid="alert-success"]');
    expect(alertCard, "no success alert rendered").not.toBeNull();

    expect(
      viewport!.contains(card!),
      "the ingest card is outside the shared stack, so it will overlap alerts instead of queueing",
    ).toBe(true);
    expect(viewport!.contains(alertCard!), "the alert is outside the shared stack").toBe(true);
  });

  it("drops its own corner pinning once it has joined the stack", () => {
    mountApp();

    const card = document.body.querySelector('[data-testid="source-ingest-toast"]')!;
    const cls = card.getAttribute("class") ?? "";
    /* Pinning itself inside a flex column would take it back out of flow and
       re-create the overlap the stack exists to prevent. */
    expect(cls, "ingest card still pins itself to the corner inside the stack").not.toMatch(
      /fixed/,
    );
  });
});
