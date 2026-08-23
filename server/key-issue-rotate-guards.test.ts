/**
 * Source-scan guards for API key issue and rotate routes.
 *
 * #256 — Catch a regression where issuing a new API key silently skips the
 *   upstream call. POST /api/developers/keys must call issueTenantKey (the
 *   brain-core upstream) before returning 201. A regression would be a handler
 *   that short-circuits (e.g. environment-gate without issuing) or returns a
 *   fabricated key object.
 *
 * #257 — Confirm a malformed brain-core rotate response returns a clear error
 *   instead of a 200 with broken data. Both issue and rotate handlers validate
 *   the upstream response shape and return 502 unexpected_upstream_shape when
 *   the key object or plaintext is missing.
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

// ─── #257: Malformed rotate/issue response → 502, not 200 with broken data ──

describe("Malformed brain-core response returns 502, not 200 with broken data (#257)", () => {
  it("issue-key handler validates upstream response shape before returning 201", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    // 1500 chars covers the full handler including the shape-validation block.
    const handlerBlock = src.slice(routeIdx, routeIdx + 1500);
    expect(
      handlerBlock,
      "issue handler must check issued.key and plaintext",
    ).toMatch(/!issued\.key|!plaintext/);
    expect(
      handlerBlock,
      "issue handler must return 502 for unexpected shape",
    ).toMatch(/502/);
    expect(
      handlerBlock,
      "502 response must use unexpected_upstream_shape error code",
    ).toMatch(/unexpected_upstream_shape/);
  });

  it("rotate handler validates upstream response shape before returning 200", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    expect(rotateIdx, "rotate route not found").toBeGreaterThan(-1);
    const handlerBlock = src.slice(rotateIdx, rotateIdx + 800);
    expect(
      handlerBlock,
      "rotate handler must check issued.key and plaintext",
    ).toMatch(/!issued\.key|!plaintext/);
    expect(
      handlerBlock,
      "rotate handler must return 502 for unexpected shape",
    ).toMatch(/502/);
  });

  it("the error code is 'unexpected_upstream_shape' so the client can distinguish it from auth errors", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "unexpected_upstream_shape error code must exist").toMatch(
      /unexpected_upstream_shape/,
    );
  });

  it("a console.error is emitted with the actual response keys so engineers can diagnose the mismatch", () => {
    const src = readFileSync(ROUTES, "utf8");
    const issueIdx = src.indexOf('app.post("/api/developers/keys"');
    const issueBlock = src.slice(issueIdx, issueIdx + 1200);
    expect(
      issueBlock,
      "issue handler must console.error the response keys on bad shape",
    ).toMatch(/console\.error.*[Ii]ssue key/);
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const rotateBlock = src.slice(rotateIdx, rotateIdx + 800);
    expect(
      rotateBlock,
      "rotate handler must console.error the response keys on bad shape",
    ).toMatch(/console\.error.*[Rr]otate key/);
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
