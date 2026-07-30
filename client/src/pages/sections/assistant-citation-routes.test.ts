import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

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

  it("routes obligation citations to the Bills tab that actually renders them", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    const line = src
      .split("\n")
      .find((l) => l.includes('resolvedType === "obligation"') && l.includes("navigate("));
    expect(line, 'no navigate() for resolvedType === "obligation"').toBeDefined();
    // FinancesPage reads ?tab= and renders <BrainBillsInbox/> for "Bills".
    expect(line).toContain("/finances?tab=Bills");
    expect(readFileSync("client/src/pages/FinancesPage.tsx", "utf8")).toContain(
      'activeTab === "Bills"',
    );
  });
});
