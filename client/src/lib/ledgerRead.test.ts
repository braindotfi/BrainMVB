import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ledgerPollMs, ledgerFigureCaption, ACTIVE_POLL_MS, IDLE_POLL_MS } from "./ledgerRead";

/**
 * The defect these exist for: a fresh tenant showed $211,200.00 owed — a complete,
 * self-consistent, entirely wrong figure — and kept showing it until the page was
 * reloaded by hand. Two separate causes, and this file pins both.
 *
 * 1. Nothing refetched. Every query in this app defaults to `staleTime: Infinity` with
 *    no interval and no refetch on focus, so the first answer was the last answer.
 * 2. Nothing said the figure was provisional, because nothing in a ledger response
 *    can: the rows behind an ingested document land in later waves.
 */

const here = dirname(fileURLToPath(import.meta.url));
const code = (p: string) => readFileSync(resolve(here, p), "utf8");

describe("ledgerPollMs", () => {
  it("polls faster while documents are still being read into the ledger", () => {
    expect(ledgerPollMs(true)).toBe(ACTIVE_POLL_MS);
    expect(ledgerPollMs(false)).toBe(IDLE_POLL_MS);
    expect(ACTIVE_POLL_MS).toBeLessThan(IDLE_POLL_MS);
  });

  it("never stops polling once the import is done", () => {
    /* `false` — as in "no interval" — is the behaviour that let a stale total sit on
       screen indefinitely. A wave can also follow an upload made in another tab or by
       an agent, so idle still means slow, not never. */
    expect(ledgerPollMs(false)).toBeGreaterThan(0);
    expect(Number.isFinite(ledgerPollMs(false))).toBe(true);
  });

  it("stays inside brain-core's observed seeding window", () => {
    /* Measured end to end on a fresh demo tenant: waves at ~1s, ~26s and ~56s. An
       active interval longer than the gap between waves would leave a superseded
       figure on screen for most of the import. */
    expect(ACTIVE_POLL_MS).toBeLessThan(25_000);
  });
});

describe("ledgerFigureCaption", () => {
  it("says the read was short before it says anything else", () => {
    const c = ledgerFigureCaption({ truncated: true, mayGrow: true }, "Across everything you still owe");
    expect(c).toMatch(/couldn't be read/);
  });

  it("marks a figure taken mid-import as not yet everything", () => {
    expect(ledgerFigureCaption({ truncated: false, mayGrow: true }, "settled")).toMatch(/Still reading your documents/);
  });

  it("uses the surface's own wording once the read is settled", () => {
    expect(ledgerFigureCaption({ truncated: false, mayGrow: false }, "Across everything you still owe")).toBe(
      "Across everything you still owe",
    );
  });

  it("never invents how much is missing", () => {
    /* We know the total is a floor; we do NOT know the gap. A caption naming an
       amount, a count or a remaining time would be fabricated — the honest statement
       is only that the import is unfinished. */
    for (const state of [
      { truncated: true, mayGrow: false },
      { truncated: false, mayGrow: true },
    ]) {
      expect(ledgerFigureCaption(state, "settled")).not.toMatch(/\d/);
    }
  });

  it("reads the same on every surface that quotes one of these figures", () => {
    /* Same caveat, same words. Four call sites, so it is worth stating: the wording
       is direction-neutral precisely so Receivables can share it with Payables. */
    for (const f of [
      "../components/PayablesTab.tsx",
      "../components/ReceivablesTab.tsx",
      "../components/CashFlowTab.tsx",
      "../pages/HomePage.tsx",
    ]) {
      expect(code(f), `${f} must caption its figure through the shared helper`).toContain("ledgerFigureCaption(");
    }
  });
});

describe("the surfaces read the ledger through the paged, polling hook", () => {
  const OBLIGATION_SURFACES = [
    "../components/PayablesTab.tsx",
    "../components/CashFlowTab.tsx",
    "../pages/HomePage.tsx",
  ];

  it("no surface fetches obligations with a bare one-page query", () => {
    /* A plain `useQuery(["/api/brain/ledger/obligations"])` reads page one and, under
       this app's defaults, never reads again. Both halves of the original bug in a
       single line — and it is the natural thing to write, so it is worth a guard. */
    for (const f of OBLIGATION_SURFACES) {
      expect(code(f), `${f}: obligations must go through usePagedLedgerRead`).not.toMatch(
        /queryKey:\s*\["\/api\/brain\/ledger\/obligations"\]/,
      );
      expect(code(f)).toContain("usePagedLedgerRead");
    }
  });

  it("all three obligations surfaces share one query key, so they cannot drift", () => {
    /* One fetch, one poll, one answer, however many of them are mounted. Two surfaces
       polling the same feed on their own schedules would show two different totals
       during an import — which is precisely the confusion being fixed. */
    for (const f of OBLIGATION_SURFACES) {
      expect(code(f)).toContain('usePagedLedgerRead<RawObligation>("/api/brain/ledger/obligations", "obligations")');
    }
  });

  it("the hook keys its cache under the plain endpoint path", () => {
    // The post-upload invalidation matches on the "/api/brain/" prefix; a key that did
    // not start with the path would silently opt out of it.
    expect(code("./ledgerRead.ts")).toContain('queryKey: [path, "all-pages"]');
  });
});

describe("every view state a surface can be handed is rendered", () => {
  /* A view kind with no branch in the JSX does not fail loudly — it falls through to
     whatever the last ternary is, which on both of these tabs is the ROW LIST. A
     provisional empty state would then render as a silent blank list with no
     explanation, and (worse, when the fallthrough lands the other way) an unfinished
     import would render as "nothing outstanding". This caught exactly that on
     Receivables: the kind existed in the view model with no branch in the tab. */
  const CASES: Array<[string, string[]]> = [
    ["../components/PayablesTab.tsx", ["failed", "loading", "unreadable", "arriving", "empty"]],
    ["../components/ReceivablesTab.tsx", ["failed", "loading", "unreadable", "arriving", "empty"]],
  ];

  it.each(CASES)("%s branches on every non-row kind", (file, kinds) => {
    const src = code(file);
    for (const k of kinds) {
      expect(src, `${file} has no branch for kind "${k}"`).toContain(`kind === "${k}"`);
    }
  });
});
