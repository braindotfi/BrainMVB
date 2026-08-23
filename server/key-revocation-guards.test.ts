/**
 * Source-scan guards for API key revocation.
 *
 * #249 — Catch a regression where revoking a single key from the Settings page
 *   silently skips the upstream call.
 *
 *   DELETE /api/developers/keys/:id must call revokeTenantKey (the brain-core
 *   upstream) before returning 204. This test pins that the handler wires the
 *   upstream call unconditionally — it cannot be guarded by a flag that is
 *   only true in certain environments.
 *
 * #250 — Prevent orphaned brain-core keys from going unnoticed when account
 *   deletion can't revoke them.
 *
 *   DELETE /api/account attempts to list and revoke all brain-core keys before
 *   deleting the local account row. If the upstream call fails (no session,
 *   network error), the error must be LOGGED (not silently swallowed) so
 *   operators can identify orphaned keys. This test pins that the warn/log path
 *   exists in the deletion handler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTES = "server/routes.ts";

// ─── #249: Single-key revocation wires the upstream call ─────────────────────

describe("Single-key revocation calls brain-core (#249)", () => {
  it("DELETE /api/developers/keys/:id route is registered", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "DELETE keys/:id route must exist").toMatch(
      /app\.delete\(["'`]\/api\/developers\/keys\/:id["'`]/,
    );
  });

  it("the handler calls revokeTenantKey (not just returns 204)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    expect(routeIdx, "DELETE keys/:id route not found").toBeGreaterThan(-1);
    const handlerBlock = src.slice(routeIdx, routeIdx + 400);
    expect(
      handlerBlock,
      "handler must call revokeTenantKey",
    ).toMatch(/revokeTenantKey/);
  });

  it("revokeTenantKey is called with the :id param (not a hardcoded id or empty string)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const handlerBlock = src.slice(routeIdx, routeIdx + 400);
    expect(
      handlerBlock,
      "revokeTenantKey must be called with req.params.id",
    ).toMatch(/revokeTenantKey\(.*req\.params\.id/);
  });

  it("the route is protected by requireAuth so unauthenticated requests cannot trigger it", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const registration = src.slice(routeIdx, routeIdx + 120);
    expect(registration, "requireAuth must guard the DELETE keys route").toMatch(/requireAuth/);
  });

  it("errors from revokeTenantKey are caught and forwarded (not silently suppressed)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.delete("/api/developers/keys/:id"');
    const handlerBlock = src.slice(routeIdx, routeIdx + 500);
    expect(
      handlerBlock,
      "catch block must be present in the DELETE handler",
    ).toMatch(/catch/);
    expect(
      handlerBlock,
      "errors must be forwarded (sendKeyApiError or equivalent)",
    ).toMatch(/sendKeyApiError|return.*error/);
  });
});

// ─── #250: Orphaned keys are logged when account deletion can't revoke them ──

describe("Orphaned brain-core keys are logged on account deletion failure (#250)", () => {
  it("DELETE /api/account route is registered", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "DELETE account route must exist").toMatch(
      /app\.delete\(["'`]\/api\/account["'`]/,
    );
  });

  it("account deletion calls listTenantKeys to discover keys before deleting", () => {
    const src = readFileSync(ROUTES, "utf8");
    const deleteAcctIdx = src.indexOf('app.delete("/api/account"');
    expect(deleteAcctIdx, "DELETE account route not found").toBeGreaterThan(-1);
    // 2600-char window: console.warn is ~2249 chars into this handler (after
    // the nested inner try/catch block), so the window must exceed that.
    const handlerBlock = src.slice(deleteAcctIdx, deleteAcctIdx + 2600);
    expect(
      handlerBlock,
      "handler must call listTenantKeys to discover keys before deletion",
    ).toMatch(/listTenantKeys/);
  });

  it("account deletion calls revokeTenantKey for all discovered keys", () => {
    const src = readFileSync(ROUTES, "utf8");
    const deleteAcctIdx = src.indexOf('app.delete("/api/account"');
    // Use a generous window (2000 chars) — the revocation block is nested inside
    // an inner try/catch within the outer handler.
    const handlerBlock = src.slice(deleteAcctIdx, deleteAcctIdx + 2000);
    expect(
      handlerBlock,
      "handler must call revokeTenantKey for each key",
    ).toMatch(/revokeTenantKey/);
  });

  it("revocation failures are collected with Promise.allSettled (not Promise.all) so one failure cannot block the rest", () => {
    const src = readFileSync(ROUTES, "utf8");
    const deleteAcctIdx = src.indexOf('app.delete("/api/account"');
    const handlerBlock = src.slice(deleteAcctIdx, deleteAcctIdx + 2000);
    expect(
      handlerBlock,
      "Promise.allSettled must be used so a single revocation failure cannot abort the whole run",
    ).toMatch(/Promise\.allSettled/);
  });

  it("revocation failures are LOGGED (not silently swallowed) so operators can identify orphaned keys", () => {
    const src = readFileSync(ROUTES, "utf8");
    const deleteAcctIdx = src.indexOf('app.delete("/api/account"');
    const handlerBlock = src.slice(deleteAcctIdx, deleteAcctIdx + 2000);
    // The handler logs "X revocation(s) failed" when brain-core rejects some.
    expect(
      handlerBlock,
      "deletion handler must log how many revocations failed",
    ).toMatch(/revocation.*failed|failed.*revocation/i);
  });

  it("if brain-core is unreachable, a console.warn is emitted and deletion continues (not aborted)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const deleteAcctIdx = src.indexOf('app.delete("/api/account"');
    const handlerBlock = src.slice(deleteAcctIdx, deleteAcctIdx + 2600);
    expect(
      handlerBlock,
      "warn must be emitted when brain-core is unreachable during account deletion",
    ).toMatch(/console\.warn/);
    // 'continuing with deletion' confirms the operation is not aborted.
    expect(
      handlerBlock,
      "warn must state that deletion continues despite the revocation failure",
    ).toMatch(/continuing with deletion/);
  });
});
