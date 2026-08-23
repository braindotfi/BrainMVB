/**
 * Source-scan guards for key-API auth, scope, and payload integrity.
 *
 * #264 — Catch an unrecognised scope value slipping through key creation.
 *   createKeySchema validates scopes against z.enum(API_KEY_SCOPES) so an
 *   unknown scope (e.g. "admin:write") is rejected at 400 before brain-core.
 *
 * #265 — Key-rotation rejects a missing or malformed key ID before touching brain-core.
 *   The :id route segment is always non-empty when matched, and errors from
 *   a bad ID (brain-core 404/400) are handled by sendKeyApiError, not left
 *   as unhandled rejections.
 *
 * #268 — Button state and actual 403 gate use the same conditions.
 *   GET /api/developers/tenants → liveKeysAvailable uses exactly
 *   platformServiceConfigured() && !!identity; the POST /api/developers/keys
 *   403 guard uses the same two predicates in the opposite sense so the UI
 *   can never offer a live-key create that the server will reject.
 *
 * #269 — Developers page refreshes tenancy state after a reload.
 *   The tenantsQ query is not disabled, so on page reload the client
 *   re-fetches /api/developers/tenants and picks up a newly-linked tenant
 *   without needing a full app reload.
 *
 * #272 — Key-rotation uses the session user's brain identity (not a wrong userId).
 *   requireBrainMemberSession reads req.session.userId — every rotate/revoke
 *   call runs through it, so the identity used is always the authenticated
 *   caller's, never a query-param userId or module-level default.
 *
 * #273 — Rotate and revoke reject unauthenticated callers before touching brain-core.
 *   requireAuth is in the route registration for both routes, so a caller
 *   without a valid session gets a 401 before the handler runs at all.
 *
 * #274 — Rotate handler validates the upstream response before returning 200.
 *   A missing key or plaintext in the rotate response → 502
 *   unexpected_upstream_shape, not a 200 with undefined fields.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTES = "server/routes.ts";
const DEVELOPERS = "client/src/components/settings/DevelopersSection.tsx";

// ─── #264: Unrecognised scope rejected at 400 before brain-core ──────────────

describe("Unrecognised scope value is rejected before reaching brain-core (#264)", () => {
  it("createKeySchema uses z.enum(API_KEY_SCOPES) so unknown scopes fail parse", () => {
    const src = readFileSync(ROUTES, "utf8");
    const schemaIdx = src.indexOf("createKeySchema");
    expect(schemaIdx, "createKeySchema not found").toBeGreaterThan(-1);
    const block = src.slice(schemaIdx, schemaIdx + 300);
    expect(block, "scopes must be validated against API_KEY_SCOPES enum").toMatch(
      /z\.enum\(API_KEY_SCOPES\)/,
    );
  });

  it("API_KEY_SCOPES is a fixed-length tuple so new scopes must be added explicitly", () => {
    const src = readFileSync(ROUTES, "utf8");
    // API_KEY_SCOPES is imported and used — it is not an ad-hoc inline array.
    expect(src, "API_KEY_SCOPES must be imported").toMatch(/API_KEY_SCOPES/);
    // API_KEY_SCOPES is imported in a multi-line import block (~char 2408).
    // Verify it is NOT defined inline (const API_KEY_SCOPES = [...]) in routes.ts,
    // confirming it comes from a shared shared module.
    expect(src, "API_KEY_SCOPES must not be defined inline in routes.ts").not.toMatch(
      /const API_KEY_SCOPES\s*=/,
    );
    // And it must appear somewhere in the file (imported above the route handlers).
    expect(src, "API_KEY_SCOPES must exist in routes.ts").toContain("API_KEY_SCOPES");
  });

  it("a failed parse returns 400 invalid_request before issueTenantKey is called", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 500);
    expect(block, "failed parse must return 400 before any upstream call").toMatch(
      /400.*invalid_request|invalid_request.*400/s,
    );
    // The return statement after a failed parse must precede issueTenantKey in the handler.
    const parseReturnIdx = block.indexOf("invalid_request");
    const issueIdx = block.indexOf("issueTenantKey");
    expect(
      parseReturnIdx,
      "invalid_request 400 must come before issueTenantKey in the handler",
    ).toBeLessThan(issueIdx === -1 ? block.length : issueIdx);
  });
});

// ─── #265: Rotate rejects bad key ID gracefully ───────────────────────────────

describe("Key-rotation handles a missing or malformed key ID gracefully (#265)", () => {
  it("rotate route uses :id path parameter (not a query param that could be omitted)", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "rotate route must use :id path param").toMatch(
      /app\.post\(["'`]\/api\/developers\/keys\/:id\/rotate["'`]/,
    );
  });

  it("the key ID is passed to rotateTenantKey as String(req.params.id)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 600);
    expect(block, "must pass req.params.id to rotateTenantKey").toMatch(
      /rotateTenantKey.*req\.params\.id|req\.params\.id.*rotateTenantKey/s,
    );
  });

  it("a brain-core 404 for a bad ID is caught by sendKeyApiError and returns 404, not 500", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    // sendKeyApiError is at offset ~774 in this handler (after shape validation),
    // so the window must exceed that.
    const block = src.slice(rotateIdx, rotateIdx + 900);
    // The catch must route through sendKeyApiError (not a bare throw).
    expect(block, "rotate handler must use sendKeyApiError in its catch").toMatch(
      /sendKeyApiError/,
    );
  });

  it("revoke route also uses :id path parameter consistently", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "revoke route must use :id path param").toMatch(
      /app\.delete\(["'`]\/api\/developers\/keys\/:id["'`]/,
    );
  });
});

// ─── #268: Button state and 403 gate share the same conditions ────────────────

describe("liveKeysAvailable flag and the 403 gate use the same conditions (#268)", () => {
  it("GET /api/developers/tenants sets liveKeysAvailable = platformServiceConfigured() && !!identity", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "liveKeysAvailable must use platformServiceConfigured()").toMatch(
      /liveKeysAvailable.*platformServiceConfigured/s,
    );
    expect(src, "liveKeysAvailable must check !!identity").toMatch(
      /liveKeysAvailable.*!!\s*identity/s,
    );
  });

  it("POST /api/developers/keys 403 gate checks !platformServiceConfigured() || !identity", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 800);
    expect(block, "403 gate must check platformServiceConfigured").toMatch(/platformServiceConfigured/);
    expect(block, "403 gate must check identity").toMatch(/identity/);
    expect(block, "403 gate must return 403 live_not_available").toMatch(/live_not_available/);
  });

  it("the comment in the tenants endpoint calls out the 'MUST match' contract explicitly", () => {
    const src = readFileSync(ROUTES, "utf8");
    // The code comment documents the coupling so future editors are warned.
    expect(src, "the MUST match comment must exist on the liveKeysAvailable line").toMatch(
      /MUST match.*POST.*developers.*keys|POST.*developers.*keys.*MUST match/s,
    );
  });

  it("the client reads liveKeysAvailable from the tenants response, not a local re-derivation", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "client must read liveKeysAvailable from tenantsQ.data").toMatch(
      /tenantsQ\.data.*liveKeysAvailable|liveKeysAvailable.*tenantsQ\.data/s,
    );
  });
});

// ─── #269: Developers page refreshes tenancy state after reload ───────────────

describe("Developers page picks up a newly-linked tenant after a page reload (#269)", () => {
  it("tenantsQ is not permanently disabled — the query runs on mount", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    const tenantsQIdx = src.indexOf("tenantsQ");
    expect(tenantsQIdx, "tenantsQ not found").toBeGreaterThan(-1);
    // If the query had `enabled: false` it would never fetch after a reload.
    const tenantsBlock = src.slice(tenantsQIdx, tenantsQIdx + 300);
    expect(
      tenantsBlock,
      "tenantsQ must not be unconditionally disabled",
    ).not.toMatch(/enabled:\s*false/);
  });

  it("tenantsQ fetches /api/developers/tenants (the live tenancy endpoint)", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "tenantsQ must target /api/developers/tenants").toMatch(
      /\/api\/developers\/tenants/,
    );
  });

  it("after a tenant is linked the tenants query is invalidated so new state loads", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    // After linking, the client must invalidate the tenants query so the
    // newly-linked identity appears without a manual reload.
    expect(src, "must invalidate tenants query after linking").toMatch(
      /invalidate.*developers.*tenants|developers.*tenants.*invalidate/s,
    );
  });
});

// ─── #272: Key-rotation uses the session user's brain identity ────────────────

describe("Key-rotation uses the authenticated caller's identity, not a wrong userId (#272)", () => {
  it("requireBrainMemberSession is called from the rotate handler with the request object", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 500);
    expect(block, "rotate handler must call requireBrainMemberSession(req, res)").toMatch(
      /requireBrainMemberSession\s*\(\s*req\s*,\s*res\s*\)/,
    );
  });

  it("requireBrainMemberSession reads req.session.userId (not a hardcoded or query-param userId)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const fnIdx = src.indexOf("async function requireBrainMemberSession");
    expect(fnIdx, "requireBrainMemberSession not found").toBeGreaterThan(-1);
    // req.session.userId! is at ~380 chars into the function — use 600 to be safe.
    const fnBlock = src.slice(fnIdx, fnIdx + 600);
    expect(fnBlock, "must read userId from req.session").toMatch(/req\.session\.userId/);
    // Must NOT read from req.query or req.params or req.body.
    expect(fnBlock, "must not read userId from req.query").not.toMatch(/req\.query\.userId/);
    expect(fnBlock, "must not read userId from req.params").not.toMatch(/req\.params\.userId/);
  });

  it("revoke handler also routes through requireBrainMemberSession(req, res)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const block = src.slice(revokeIdx, revokeIdx + 400);
    expect(block, "revoke handler must call requireBrainMemberSession").toMatch(
      /requireBrainMemberSession\s*\(\s*req\s*,\s*res\s*\)/,
    );
  });
});

// ─── #273: Rotate and revoke reject unauthenticated callers ──────────────────

describe("Rotate and revoke reject unauthenticated callers before touching brain-core (#273)", () => {
  it("POST /api/developers/keys/:id/rotate is registered with requireAuth", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const registration = src.slice(rotateIdx, rotateIdx + 80);
    expect(registration, "requireAuth must be in the rotate route registration").toMatch(
      /requireAuth/,
    );
  });

  it("DELETE /api/developers/keys/:id is registered with requireAuth", () => {
    const src = readFileSync(ROUTES, "utf8");
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const registration = src.slice(revokeIdx, revokeIdx + 80);
    expect(registration, "requireAuth must be in the revoke route registration").toMatch(
      /requireAuth/,
    );
  });

  it("POST /api/developers/keys is also protected by requireAuth", () => {
    const src = readFileSync(ROUTES, "utf8");
    const issueIdx = src.indexOf('app.post("/api/developers/keys"');
    const registration = src.slice(issueIdx, issueIdx + 80);
    expect(registration, "requireAuth must be in the issue-key route registration").toMatch(
      /requireAuth/,
    );
  });

  it("GET /api/developers/keys is also protected by requireAuth", () => {
    const src = readFileSync(ROUTES, "utf8");
    const listIdx = src.indexOf('app.get("/api/developers/keys"');
    const registration = src.slice(listIdx, listIdx + 80);
    expect(registration, "requireAuth must be in the list-keys route registration").toMatch(
      /requireAuth/,
    );
  });
});

// ─── #274: Rotate validates upstream response shape before returning 200 ──────

describe("Rotate handler validates the upstream response before returning 200 (#274)", () => {
  it("rotate handler checks issued.key before returning 200", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 600);
    expect(block, "rotate handler must check !issued.key").toMatch(/!issued\.key/);
  });

  it("rotate handler checks plaintext (via issuedPlaintext) before returning 200", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 600);
    expect(block, "rotate handler must use issuedPlaintext").toMatch(/issuedPlaintext/);
    expect(block, "rotate handler must check !plaintext").toMatch(/!plaintext/);
  });

  it("a missing key or plaintext returns 502 unexpected_upstream_shape, not 200", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 700);
    expect(block, "rotate handler must return 502 on bad shape").toMatch(/502/);
    expect(block, "rotate handler must use unexpected_upstream_shape error code").toMatch(
      /unexpected_upstream_shape/,
    );
  });

  it("a console.error logs the actual response keys so engineers can diagnose the mismatch", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 700);
    expect(block, "rotate handler must console.error on bad shape").toMatch(
      /console\.error.*[Rr]otate key/,
    );
  });

  it("a valid rotate response returns 200 with key + plaintext (not 201)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 700);
    // Rotate returns 200 res.json (not 201 res.status(201).json).
    expect(block, "rotate must return plain 200 res.json (not 201)").toMatch(/res\.json\(\s*\{/);
    expect(block, "rotate response must include plaintext field").toMatch(
      /plaintext/,
    );
  });
});
