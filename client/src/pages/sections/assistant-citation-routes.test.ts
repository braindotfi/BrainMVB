import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ASSISTANT_CHAT_LIB = "client/src/lib/assistantChat.ts";

/**
 * Grounded-answer citations in the Brain Assistant must land on real routes.
 *
 * An obligation citation used to navigate to "/bills", which App.tsx never
 * registered, so every obligation-backed citation dropped the user on the
 * NotFound catch-all. Nothing failed loudly — wouter just falls through to
 * the last <Route>. This pins the citation targets against the real route
 * table so a dead link fails the suite instead of shipping as a 404.
 */

const APP = "client/src/App.tsx";
const ASSISTANT = "client/src/pages/sections/BrainAssistant.tsx";
const LEDGER = "client/src/pages/FinancesPage.tsx";

/** Paths registered in App.tsx, e.g. `<Route path="/finances" ...>`. */
function registeredRoutes(): Set<string> {
  const src = readFileSync(APP, "utf8");
  const paths = [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
  return new Set(paths);
}

/**
 * Literal navigate() targets in a source file. Template literals are truncated
 * at the first interpolation (`/audit-log?record=${id}` → `/audit-log?record=`),
 * which is fine because only the pathname is checked.
 */
function navigateTargets(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/navigate\(\s*[`"']([^`"'$]*)/g)]
    .map((m) => m[1])
    .filter((t) => t.startsWith("/"));
}

describe("Truncation note rendering contract", () => {
  it("renders data-testid='context-truncation-note' only for isContextNote messages", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    // The testid must appear inside the isContextNote branch.
    const isContextNoteIdx = src.indexOf("msg.isContextNote ?");
    const testidIdx = src.indexOf('data-testid="context-truncation-note"');
    expect(isContextNoteIdx, "isContextNote branch not found in BrainAssistant").toBeGreaterThan(-1);
    expect(testidIdx, "context-truncation-note testid not found in BrainAssistant").toBeGreaterThan(-1);
    // The testid must come after the isContextNote check, never before it.
    expect(testidIdx).toBeGreaterThan(isContextNoteIdx);
    // It must also appear before the JSX element that renders regular chat
    // bubbles. Search for "<ChatBubble" (JSX open-tag) rather than
    // "ChatBubble" which also hits the component function definition near the
    // top of the file.
    const chatBubbleJsxIdx = src.indexOf("<ChatBubble");
    expect(chatBubbleJsxIdx, "<ChatBubble JSX not found in BrainAssistant").toBeGreaterThan(-1);
    expect(testidIdx).toBeLessThan(chatBubbleJsxIdx);
  });

  it("regular chat bubbles are gated behind the !isContextNote branch", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    // The <ChatBubble JSX is rendered in the else branch of isContextNote,
    // meaning context notes and chat bubbles are mutually exclusive.
    // Use "<ChatBubble" to target the JSX usage, not the function definition.
    const isContextNoteIdx = src.indexOf("msg.isContextNote ?");
    const chatBubbleJsxIdx = src.indexOf("<ChatBubble");
    expect(isContextNoteIdx).toBeGreaterThan(-1);
    expect(chatBubbleJsxIdx).toBeGreaterThan(isContextNoteIdx);
  });

  it("isContextNote flag is sourced from buildTruncationNote in the send path", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    // The component must import and call buildTruncationNote so the note-creation
    // logic is the pure-function variant that is unit-tested separately.
    expect(src).toContain("buildTruncationNote");
    // The isContextNote field must be set to true on the note message.
    expect(src).toContain("isContextNote: true");
  });

  it("buildTruncationNote is exported from assistantChat for use in the component", () => {
    const src = readFileSync(ASSISTANT_CHAT_LIB, "utf8");
    expect(src).toContain("export function buildTruncationNote");
  });
});

describe("Brain Assistant citation links", () => {
  it("does not label operational-error context as a grounded answer", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    expect(src).toContain('data?.answerError === true');
    expect(src).toContain('answerStatus === "error"');
    expect(src).toContain("answer unavailable");
    expect(src).toContain('data-testid="assistant-error"');
  });

  it("navigates only to routes App.tsx actually registers", () => {
    const routes = registeredRoutes();
    const targets = navigateTargets(ASSISTANT);

    // Guard against the regexes silently matching nothing and passing vacuously.
    expect(routes.size, "no <Route path=...> found in App.tsx").toBeGreaterThan(3);
    expect(targets.length, "no navigate() targets found in BrainAssistant").toBeGreaterThan(0);

    for (const target of targets) {
      const pathname = target.split("?")[0];
      expect(
        routes.has(pathname),
        `BrainAssistant navigates to "${pathname}" but App.tsx registers no such route — ` +
          `this silently renders the NotFound page. Registered: ${[...routes].join(", ")}`,
      ).toBe(true);
    }
  });

  it("routes obligation citations to the itemized list of what is owed", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    const line = src
      .split("\n")
      .find((l) => l.includes('resolvedType === "obligation"') && l.includes("navigate("));
    expect(line, 'no navigate() for resolvedType === "obligation"').toBeDefined();
    /* Payables renders one row per outstanding obligation, so a citation about a
       specific one lands among its peers. It pointed at Cash Flow while no such list
       existed — there, an obligation was at best a `bill` row and payroll and tax were
       not shown at all. */
    expect(line).toContain("/ledger?tab=payables");
    // The target tab must still exist, or the link silently falls back to Accounts.
    expect(readFileSync(LEDGER, "utf8")).toContain('activeTab === "Payables"');
  });
});

/**
 * The same silent-fallback hazard one level down.
 *
 * A `?tab=` value the Ledger does not recognise does not fail — it falls back to
 * Accounts. So a link written as `?tab=bills` after that tab was retired would
 * quietly land the user on a list of bank balances instead of the bill they asked
 * for, with nothing in the console. This pins every tab link in the client
 * against the Ledger's own lookup table.
 */
describe("Ledger tab deep links", () => {
  /** Every .ts/.tsx under a directory, tests excluded. */
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(path));
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  function knownTabSlugs(): Set<string> {
    const src = readFileSync(LEDGER, "utf8");
    const block = src.match(/const TAB_BY_SLUG[^{]*\{([\s\S]*?)\n\};/);
    expect(block, "TAB_BY_SLUG not found in FinancesPage").toBeTruthy();
    const keys = [...block![1].matchAll(/^\s*"?([a-z-]+)"?:/gm)].map((m) => m[1]);
    expect(keys.length, "parsed no keys out of TAB_BY_SLUG").toBeGreaterThan(3);
    return new Set(keys);
  }

  it("every ?tab= value the client navigates to is one the Ledger resolves", () => {
    const slugs = knownTabSlugs();
    const files = sourceFiles("client/src");
    const found: { file: string; slug: string }[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/[?&]tab=([a-zA-Z-]+)/g)) {
        found.push({ file, slug: m[1].toLowerCase() });
      }
    }

    expect(found.length, "no ?tab= links found anywhere — the regex is wrong").toBeGreaterThan(2);
    for (const { file, slug } of found) {
      expect(
        slugs.has(slug),
        `${file} links to ?tab=${slug}, which FinancesPage's TAB_BY_SLUG does not resolve — ` +
          `it silently falls back to Accounts. Known: ${[...slugs].join(", ")}`,
      ).toBe(true);
    }
  });

  it("keeps every retired tab name pointing somewhere real", () => {
    // Old links in bookmarks and history still carry these.
    const slugs = knownTabSlugs();
    for (const retired of ["recent", "bills", "income", "expenses", "liabilities"]) {
      expect(slugs.has(retired), `retired tab "${retired}" no longer resolves`).toBe(true);
    }
  });
});

// ─── Monthly Breakdown state contract ────────────────────────────────────────
//
// MonthlyBreakdownCard must distinguish three mutually exclusive states:
//   1. failed   → explicit "couldn't load" copy (NOT "no data", NOT zero chart)
//   2. loading  → loading copy
//   3. empty    → "no transaction data" copy
//
// A regression that merges failed+empty into one code path would silently let
// users mistake a source availability problem for a business fact (nothing moved).
//
// These source-scan checks pin the structural invariants without a DOM render:
//   a. The `failed` prop is declared in MonthlyBreakdownCard.
//   b. The failed branch renders a distinct testid and explicit "couldn't" text.
//   c. CashFlowTab passes `failed={txFailed}` (not omitting it) to the card.
//   d. Loading and empty states have their own distinct testids.

const CARD_SRC = "client/src/components/MonthlyBreakdownCard.tsx";
const TAB_SRC  = "client/src/components/CashFlowTab.tsx";

describe("Monthly Breakdown state contract", () => {
  const card = readFileSync(CARD_SRC, "utf8");
  const tab  = readFileSync(TAB_SRC, "utf8");

  it("declares the `failed` prop in MonthlyBreakdownCard", () => {
    expect(card).toMatch(/failed\??\s*:\s*boolean/);
  });

  it("renders a distinct testid for the failed state (not loading, not empty)", () => {
    expect(card).toContain('data-testid="text-monthly-breakdown-unavailable"');
    // Confirm the loading and empty testids are separate code paths.
    expect(card).toContain('data-testid="text-monthly-breakdown-loading"');
    expect(card).toContain('data-testid="text-monthly-breakdown-empty"');
    // All three must be distinct strings.
    const ids = [
      "text-monthly-breakdown-unavailable",
      "text-monthly-breakdown-loading",
      "text-monthly-breakdown-empty",
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("uses explicit 'couldn't' copy in the failed branch (not zero / not 'no data')", () => {
    // The failed branch must say "couldn't" (or equivalent honest qualifier)
    // and must appear BEFORE the empty-state branch in source order so the
    // render logic checks failure before drawing any chart.
    // Match either a straight apostrophe (') or a curly one (\u2019).
    const failedIdx = Math.max(card.indexOf("couldn't"), card.indexOf("couldn\u2019t"));
    const emptyIdx  = card.indexOf("No transaction data");
    expect(failedIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(failedIdx).toBeLessThan(emptyIdx);
  });

  it("CashFlowTab wires `failed={txFailed}` into MonthlyBreakdownCard", () => {
    // The tab must pass the failure flag, not rely on a default of undefined.
    expect(tab).toMatch(/failed=\{txFailed\}/);
  });
});

// ─── Monthly Breakdown placement in CashFlowTab ───────────────────────────────
//
// MonthlyBreakdownCard must sit between the metric grid and the Transactions
// WidgetCard. A careless refactor could move or remove it with no failing test
// because the placement is invisible to the existing DOM-free suite.
//
// Three invariants are pinned here (source-scan, no DOM):
//   1. MonthlyBreakdownCard is imported in CashFlowTab.tsx.
//   2. <MonthlyBreakdownCard appears AFTER the metric grid (last <Metric) and
//      BEFORE <WidgetCard title="Transactions" in source order.
//   3. data-testid="chart-monthly-breakdown" lives inside MonthlyBreakdownCard.tsx.

describe("Monthly Breakdown placement in CashFlowTab", () => {
  const tab  = readFileSync(TAB_SRC, "utf8");
  const card = readFileSync(CARD_SRC, "utf8");

  it("CashFlowTab imports MonthlyBreakdownCard", () => {
    // A rename or removal of the import would silently break the JSX below it.
    expect(tab).toMatch(/import\s*\{[^}]*MonthlyBreakdownCard[^}]*\}\s*from/);
  });

  it("<MonthlyBreakdownCard is placed after the metric grid and before the Transactions WidgetCard", () => {
    const breakdownIdx   = tab.indexOf("<MonthlyBreakdownCard");
    const transactionsIdx = tab.indexOf('<WidgetCard title="Transactions"');

    expect(
      breakdownIdx,
      "<MonthlyBreakdownCard not found in CashFlowTab.tsx",
    ).toBeGreaterThan(-1);
    expect(
      transactionsIdx,
      '<WidgetCard title="Transactions" not found in CashFlowTab.tsx',
    ).toBeGreaterThan(-1);

    // The metric grid contains <Metric components; find the LAST one so we
    // can assert MonthlyBreakdownCard follows the whole grid, not just its start.
    const lastMetricIdx = tab.lastIndexOf("<Metric");
    expect(
      lastMetricIdx,
      "<Metric not found in CashFlowTab.tsx — the metric grid may have been removed",
    ).toBeGreaterThan(-1);

    expect(
      breakdownIdx,
      "<MonthlyBreakdownCard must appear after the last <Metric (metric grid) in CashFlowTab.tsx",
    ).toBeGreaterThan(lastMetricIdx);

    expect(
      breakdownIdx,
      '<MonthlyBreakdownCard must appear before <WidgetCard title="Transactions" in CashFlowTab.tsx',
    ).toBeLessThan(transactionsIdx);
  });

  it('data-testid="chart-monthly-breakdown" is present inside MonthlyBreakdownCard.tsx', () => {
    // This testid is the hook that QA scripts and future DOM tests use to
    // locate the chart. If it disappears — or moves into CashFlowTab — the
    // tests look in the wrong place and the chart becomes untestable.
    expect(card).toContain('data-testid="chart-monthly-breakdown"');
  });
});
