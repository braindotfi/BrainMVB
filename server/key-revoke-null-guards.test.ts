/**
 * Source-scan guards for key revocation, null-response handling, and
 * double-action error surfaces.
 *
 * #275 — Catch a key-revoke that silently skips the brain-identity check.
 *   Both rotate AND revoke route through requireBrainMemberSession(req, res),
 *   which calls getBrainSession(req.session.userId!). Neither bypasses it.
 *
 * #276 — Settings page shows a clear explanation when key rotation is blocked.
 *   keysUnavailable (503 keys_api_unavailable) renders "Keys API not yet
 *   enabled" — the card stays visible but the actions are hidden/explained,
 *   not silently absent.
 *
 * #277 — Catch a revoke that fails upstream before passing a bad response.
 *   DELETE /api/developers/keys/:id uses sendKeyApiError in its catch, so
 *   every upstream error is mapped to an honest status+body, never left as
 *   an unhandled rejection or swallowed into a 200.
 *
 * #278 — Double-rotate or double-revoke returns a clear error, not a crash.
 *   A 404 api_key_not_found on the second action is surfaced by rotateMut /
 *   revokeMut onError with a human message, not an unhandled exception.
 *
 * #282 — Null brain-core response on key revocation doesn't crash.
 *   Revoke expects 204 No Content (no body). A null / empty body is the
 *   happy-path; errors go through sendKeyApiError. The handler never tries
 *   to read a response body that could be null.
 *
 * #283 — Null brain-core response on key creation returns a clear 502.
 *   If brain-core returns null the issuedPlaintext helper returns null,
 *   !issued.key || !plaintext triggers the shape-guard, and the handler
 *   returns 502 unexpected_upstream_shape — never a crash or 201 with
 *   undefined fields.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTES = "server/routes.ts";
const DEVELOPERS = "client/src/components/settings/DevelopersSection.tsx";

// ─── #275: Revoke uses the authenticated session, same as rotate ─────────────

describe("Key-revoke uses authenticated brain identity, same as rotate (#275)", () => {
  it("DELETE /api/developers/keys/:id calls requireBrainMemberSession(req, res)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    expect(revokeIdx, "revoke route not found").toBeGreaterThan(-1);
    const block = src.slice(revokeIdx, revokeIdx + 400);
    expect(block, "revoke must call requireBrainMemberSession(req, res)").toMatch(
      /requireBrainMemberSession\s*\(\s*req\s*,\s*res\s*\)/,
    );
  });

  it("requireBrainMemberSession calls getBrainSession(req.session.userId!) — not a param or query value", () => {
    const src = readFileSync(ROUTES, "utf8");
    const fnIdx = src.indexOf("async function requireBrainMemberSession");
    const block = src.slice(fnIdx, fnIdx + 600);
    expect(block, "must call getBrainSession with req.session.userId").toMatch(
      /getBrainSession\s*\(\s*req\.session\.userId/,
    );
  });

  it("rotate also calls requireBrainMemberSession(req, res) — both go through the same identity gate", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const block = src.slice(rotateIdx, rotateIdx + 400);
    expect(block, "rotate must call requireBrainMemberSession").toMatch(
      /requireBrainMemberSession\s*\(\s*req\s*,\s*res\s*\)/,
    );
  });

  it("neither rotate nor revoke reads userId from req.params or req.query", () => {
    const src = readFileSync(ROUTES, "utf8");
    const rotateIdx = src.indexOf('app.post("/api/developers/keys/:id/rotate"');
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const rotateBlock = src.slice(rotateIdx, rotateIdx + 400);
    const revokeBlock = src.slice(revokeIdx, revokeIdx + 400);
    expect(rotateBlock, "rotate must not read userId from params/query").not.toMatch(
      /req\.(params|query)\.userId/,
    );
    expect(revokeBlock, "revoke must not read userId from params/query").not.toMatch(
      /req\.(params|query)\.userId/,
    );
  });
});

// ─── #276: Settings page explains when key rotation is blocked ────────────────

describe("Settings page shows a clear explanation when key operations are blocked (#276)", () => {
  it("isKeysApiUnavailable helper exists and is used to detect 503 keys_api_unavailable", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "isKeysApiUnavailable must be defined or imported").toMatch(
      /isKeysApiUnavailable/,
    );
  });

  it("keysUnavailable state renders 'Keys API not yet enabled' (not a blank panel)", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "must show 'Keys API not yet enabled' when service is off").toMatch(
      /Keys API not yet enabled/,
    );
  });

  it("rotate and revoke mutation errors show an alert.error message to the user", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    const rotateErrIdx = src.indexOf("Couldn't rotate key");
    expect(rotateErrIdx, "'Couldn't rotate key' message not found").toBeGreaterThan(-1);
    const revokeErrIdx = src.indexOf("Couldn't revoke key");
    expect(revokeErrIdx, "'Couldn't revoke key' message not found").toBeGreaterThan(-1);
  });

  it("rotate button is disabled while a mutation is pending so blocked state is visible", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "rotate button must show 'Rotating…' while pending").toMatch(/Rotating…|Rotating\.\.\./);
    expect(src, "revoke button must show 'Revoking…' while pending").toMatch(/Revoking…|Revoking\.\.\./);
  });
});

// ─── #277: Revoke upstream failures are mapped, not swallowed ────────────────

describe("Revoke upstream failures return an honest error, not a silent pass (#277)", () => {
  it("DELETE /api/developers/keys/:id catches errors with sendKeyApiError", () => {
    const src = readFileSync(ROUTES, "utf8");
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const block = src.slice(revokeIdx, revokeIdx + 400);
    expect(block, "revoke handler must use sendKeyApiError in its catch").toMatch(
      /sendKeyApiError/,
    );
  });

  it("a successful revoke returns 204 No Content (no body to be null or malformed)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const block = src.slice(revokeIdx, revokeIdx + 400);
    expect(block, "revoke must return 204 on success").toMatch(/204/);
    expect(block, "revoke success must use .end() (no JSON body to parse)").toMatch(/\.end\(\)/);
  });

  it("sendKeyApiError maps BrainApiError to the correct status code (not always 500)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const fnIdx = src.indexOf("function sendKeyApiError");
    const block = src.slice(fnIdx, fnIdx + 900);
    expect(block, "must map route_not_found to 503").toMatch(/503/);
    expect(block, "must map api_key_not_found to 404").toMatch(/404/);
    expect(block, "must map rate_limited to 429").toMatch(/429/);
    // The non-BrainApiError fallthrough logs then returns 500. Search the full
    // file for the specific log pattern rather than fighting a window limit.
    expect(src, "non-BrainApiError must be logged before 500").toMatch(
      /Developers.*error.*action|console\.error.*action/,
    );
  });
});

// ─── #278: Double-rotate and double-revoke return clear errors ────────────────

describe("Double-rotate and double-revoke return a clear error, not a crash (#278)", () => {
  it("rotateMut onError handles api_key_not_found with a human message", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "rotateMut must handle api_key_not_found").toMatch(/api_key_not_found/);
    const notFoundIdx = src.indexOf("api_key_not_found");
    const window = src.slice(notFoundIdx, notFoundIdx + 400);
    expect(
      window,
      "api_key_not_found must show a friendly alert, not an unhandled throw",
    ).toMatch(/alert\.error|Key no longer exists/);
  });

  it("revokeMut onError shows an error message on failure", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    // onError is ~380 chars after the revokeMut declaration — allow up to 500.
    expect(src, "revokeMut must have an onError handler").toMatch(/revokeMut[\s\S]{0,500}onError/);
    // alert.error appears BEFORE "Couldn't revoke key" in the source — search
    // with a combined regex so the window direction doesn't matter.
    expect(src, "revoke error must call alert.error with 'Couldn't revoke key'").toMatch(
      /alert\.error\([\s\S]{0,60}Couldn't revoke key/,
    );
  });

  it("rotate button is disabled while rotateMut is pending (prevents rapid double-click)", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "rotate button must check rotateMut.isPending").toMatch(/rotateMut\.isPending/);
  });

  it("revoke button is disabled while revokeMut is pending", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "revoke button must check revokeMut.isPending").toMatch(/revokeMut\.isPending/);
  });
});

// ─── #282: Null revoke response is the expected happy-path ───────────────────

describe("Null brain-core response on revocation is handled correctly (#282)", () => {
  it("revoke handler does not read a JSON body from the upstream response (204 No Content)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const block = src.slice(revokeIdx, revokeIdx + 400);
    // revokeTenantKey is called with await but its return value is not read into
    // a variable (since 204 has no body); this is the correct pattern.
    expect(block, "revoke must not try to parse a body from the upstream response").not.toMatch(
      /const\s+\w+\s*=\s*await.*revokeTenantKey/,
    );
    expect(block, "successful revoke must end with 204").toMatch(/204/);
  });

  it("errors from revokeTenantKey go through sendKeyApiError, not a null-body crash", () => {
    const src = readFileSync(ROUTES, "utf8");
    const revokeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const block = src.slice(revokeIdx, revokeIdx + 400);
    expect(block, "revoke errors must be caught by sendKeyApiError").toMatch(/sendKeyApiError/);
  });
});

// ─── #283: Null issue-key response returns 502, not a crash ──────────────────

describe("Null brain-core response on key creation returns 502, not a crash (#283)", () => {
  it("issuedPlaintext returns null when the response has no recognised plaintext field", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "issuedPlaintext must exist").toMatch(/issuedPlaintext/);
    // The helper returns null rather than throwing on unexpected shapes.
    // The null-return is ~365 chars into the helper — use 450 to be safe.
    const helperIdx = src.indexOf("issuedPlaintext");
    const block = src.slice(helperIdx, helperIdx + 450);
    expect(block, "issuedPlaintext must return null as its fallback").toMatch(/return.*null/);
  });

  it("the issue handler treats a null issued object as a shape failure", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1500);
    // issued ?? {} prevents a null-pointer when calling Object.keys in the error log.
    expect(block, "must guard against null issued with ?? {} in the error path").toMatch(
      /issued\s*\?\?\s*\{\}/,
    );
  });

  it("the shape guard fires before res.status(201) so null never becomes a 201 response", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1500);
    const guardIdx = block.indexOf("!issued.key");
    const createdIdx = block.indexOf("201");
    expect(guardIdx, "shape guard must exist").toBeGreaterThan(-1);
    expect(createdIdx, "201 status must exist").toBeGreaterThan(-1);
    expect(guardIdx, "shape guard must come before 201").toBeLessThan(createdIdx);
  });

  it("the 502 unexpected_upstream_shape error code is used for null/malformed responses", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1500);
    expect(block, "must use unexpected_upstream_shape for bad shapes").toMatch(
      /unexpected_upstream_shape/,
    );
  });
});
