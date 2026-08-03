import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

  it("routes obligation citations to the tab that actually renders bills", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    const line = src
      .split("\n")
      .find((l) => l.includes('resolvedType === "obligation"') && l.includes("navigate("));
    expect(line, 'no navigate() for resolvedType === "obligation"').toBeDefined();
    // Bills stopped being a tab of its own when the five money tabs collapsed;
    // unpaid AP now renders as `bill` rows inside Cash Flow.
    expect(line).toContain("/ledger?tab=cash-flow");
    expect(readFileSync(LEDGER, "utf8")).toContain('activeTab === "Cash Flow"');
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
