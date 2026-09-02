/**
 * Source-scan guards for API key issue and rotate routes.
 *
 * #256 — Catch a regression where issuing a new API key silently skips the
 *   upstream call. POST /api/developers/keys must call issueTenantKey (the
 *   brain-core upstream) before returning 201. A regression would be a handler
 *   that short-circuits (e.g. environment-gate without issuing) or returns a
 *   fabricated key object.
 *
 * The issued-key contract is flat: the created key fields and one-time secret
 * share one response object. The BFF maps that object directly instead of
 * tolerating obsolete wrapper and alternate-secret shapes.
 *
 * #255 — Confirm a double-click rotate doesn't crash the Settings page with an
 *   unexpected error. The rotate mutation's error handler checks for
 *   api_key_not_found (404) and surfaces a "Key no longer exists" message
 *   rather than an unhandled crash. The same guard exists for revoke.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTES = "server/routes.ts";
const DEVELOPERS = "client/src/components/settings/DevelopersSection.tsx";

// ─── #256: Issue key calls the upstream ──────────────────────────────────────

describe("Issue key calls brain-core upstream (#256)", () => {
  it("POST /api/developers/keys route is registered", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src).toMatch(/app\.post\(["'`]\/api\/developers\/keys["'`]/);
  });

  it("the handler calls issueTenantKey (not just returns a fabricated object)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    expect(routeIdx, "POST /api/developers/keys route not found").toBeGreaterThan(-1);
    // Use a 1200-char window — the issueTenantKey call is ~500 chars into the handler
    // (after the schema parse, environment gate, and requireBrainMemberSession call).
    const handlerBlock = src.slice(routeIdx, routeIdx + 1200);
    expect(handlerBlock, "handler must call issueTenantKey").toMatch(/issueTenantKey/);
  });

  it("issueTenantKey receives the tenantId and options (not a hardcoded stub)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const handlerBlock = src.slice(routeIdx, routeIdx + 1200);
    expect(
      handlerBlock,
      "issueTenantKey must be called with session.tenantId",
    ).toMatch(/issueTenantKey\(.*tenantId/);
  });

  it("the route is protected by requireAuth", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const registration = src.slice(routeIdx, routeIdx + 80);
    expect(registration, "requireAuth must guard the issue-key route").toMatch(/requireAuth/);
  });

  it("live-environment keys are gated behind platformServiceConfigured() + identity check", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const handlerBlock = src.slice(routeIdx, routeIdx + 800);
    expect(
      handlerBlock,
      "live-key gate must check platformServiceConfigured",
    ).toMatch(/platformServiceConfigured/);
  });
});

describe("Issued key responses follow the flat brain-core contract", () => {
  it("issue maps the flat key resource and required secret", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const handlerBlock = src.slice(routeIdx, routeIdx + 1500);
    expect(handlerBlock).toMatch(/toDevKey\(issued\)/);
    expect(handlerBlock).toMatch(/plaintext:\s*issued\.secret/);
    expect(handlerBlock).not.toMatch(/issued\.key|issuedPlaintext/);
  });

  it("rotate maps the same flat key resource and required secret", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const handlerBlock = src.slice(rotateIdx, rotateIdx + 800);
    expect(handlerBlock).toMatch(/toDevKey\(issued\)/);
    expect(handlerBlock).toMatch(/plaintext:\s*issued\.secret/);
    expect(handlerBlock).not.toMatch(/issued\.key|issuedPlaintext/);
  });
});

// ─── #255: Double-click rotate is handled gracefully ─────────────────────────

describe("Double-click rotate shows a clear message instead of crashing (#255)", () => {
  it("the rotate mutation has an onError handler (not just a success path)", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    const rotateMutIdx = src.indexOf("rotateMut");
    expect(rotateMutIdx, "rotateMut not found").toBeGreaterThan(-1);
    const rotateSrc = src.slice(rotateMutIdx, rotateMutIdx + 600);
    expect(rotateSrc, "rotateMut must have an onError / catch handler").toMatch(
      /onError|catch|error/i,
    );
  });

  it("api_key_not_found (404) from a double-rotate is surfaced as a user-friendly message", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "api_key_not_found must be handled in the rotate error path").toMatch(
      /api_key_not_found/,
    );
    // The error must produce a human message, not a crash.
    const apiKeyNotFoundIdx = src.indexOf("api_key_not_found");
    const window = src.slice(apiKeyNotFoundIdx - 50, apiKeyNotFoundIdx + 400);
    expect(
      window,
      "api_key_not_found must result in a user-friendly alert, not an unhandled throw",
    ).toMatch(/alert\.error|toast|"Key no longer exists"|already rotated/);
  });

  it("the rotate button is disabled while the mutation is pending so a second click cannot fire", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    // disabled={rotateMut.isPending || ...} prevents the second request entirely.
    expect(src, "rotate button must be disabled while isPending").toMatch(
      /rotateMut\.isPending/,
    );
  });

  it("after a 404 the key list is refreshed so the stale entry disappears", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    // The error handler must invalidate or refetch keys after api_key_not_found.
    const notFoundIdx = src.indexOf("api_key_not_found");
    const window = src.slice(notFoundIdx, notFoundIdx + 500);
    expect(
      window,
      "api_key_not_found must trigger a key-list refresh",
    ).toMatch(/invalidate|refetch|queryClient/);
  });
});
