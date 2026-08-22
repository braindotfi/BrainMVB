/**
 * Source-scan guard for the Developers section endpoint list.
 *
 * #28 — Let developers try the data endpoints with their real key in one click.
 *
 * The DevelopersSection shows API_ENDPOINTS with paths, required scopes, and
 * curl examples. This test pins that:
 *   - API_ENDPOINTS is non-empty (the list cannot be accidentally cleared).
 *   - Every listed endpoint has a path starting with /api/v1/ (consistent with
 *     the server's key-authenticated read registrations).
 *   - The ping endpoint (scope: null — no scope required) is always present so
 *     developers can verify a key works without needing a specific scope.
 *   - Each endpoint with a non-null scope lists a scope that matches the
 *     server's API_KEY_SCOPES (covered jointly with #29 in settings-nav-guards).
 *   - The component renders the endpoints list (API_ENDPOINTS.map) so the list
 *     actually appears on screen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const DEVELOPERS = "client/src/components/settings/DevelopersSection.tsx";

function parseApiEndpoints(src: string): Array<{ path: string; scope: string | null }> {
  const match = src.match(/const API_ENDPOINTS[^=]*=\s*\[([\s\S]*?)\];/);
  if (!match) return [];
  const block = match[1];
  const entries: Array<{ path: string; scope: string | null }> = [];
  // Each entry is { path: "...", scope: "..." | null, description: "..." }
  for (const entryMatch of block.matchAll(/\{[^}]+\}/g)) {
    const entry = entryMatch[0];
    const pathM = entry.match(/path:\s*"([^"]+)"/);
    const scopeM = entry.match(/scope:\s*"([^"]+)"/);
    const scopeNull = entry.match(/scope:\s*null/);
    if (!pathM) continue;
    entries.push({
      path: pathM[1],
      scope: scopeM ? scopeM[1] : scopeNull ? null : null,
    });
  }
  return entries;
}

describe("Developer API endpoint list contract (#28)", () => {
  it("API_ENDPOINTS is non-empty — the list cannot be accidentally cleared", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    const endpoints = parseApiEndpoints(src);
    expect(endpoints.length, "API_ENDPOINTS must list at least one endpoint").toBeGreaterThan(0);
  });

  it("every endpoint path starts with /api/v1/ matching server registrations", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    const endpoints = parseApiEndpoints(src);
    for (const ep of endpoints) {
      expect(
        ep.path,
        `Endpoint "${ep.path}" must start with /api/v1/`,
      ).toMatch(/^\/api\/v1\//);
    }
  });

  it("the ping endpoint (scope: null) is always listed so key verification works without a specific scope", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    const endpoints = parseApiEndpoints(src);
    const ping = endpoints.find((ep) => ep.path === "/api/v1/ping");
    expect(ping, "API_ENDPOINTS must include /api/v1/ping").toBeDefined();
    expect(ping?.scope, "/api/v1/ping must have scope: null (no scope required)").toBeNull();
  });

  it("API_ENDPOINTS is rendered in the component (map call present)", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "DevelopersSection must render API_ENDPOINTS with .map").toMatch(
      /API_ENDPOINTS\.map/,
    );
  });

  it("curl examples use an Authorization: Bearer header so developers see the right format", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "DevelopersSection must include Authorization: Bearer in curl examples").toMatch(
      /Authorization.*Bearer/,
    );
  });
});
