/**
 * Source-scan guards for orphaned brain-core key surfacing on account deletion.
 *
 * #251 — Confirm the client surfaces orphaned-key warnings so operators can act.
 *   The DELETE /api/account response now includes brainCoreUnreachable. The
 *   client (authContext.deleteAccount) must parse and return this field, and
 *   AccountSection must show a warning toast when it is true or when
 *   brainKeyRevocationsFailed > 0.
 *
 * #252 — Prevent a full brain-session outage from hiding how many keys were left.
 *   When getBrainSession() throws, the warn log must state "key count unknown"
 *   so operators know the zero counts in the response are indeterminate, not a
 *   confirmed clean state. The response must also include brainCoreUnreachable:true.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTES = "server/routes.ts";
const AUTH_CTX = "client/src/lib/authContext.tsx";
const ACCOUNT_SECTION = "client/src/components/settings/figma/AccountSection.tsx";

// ─── #252: Session-outage warn includes "key count unknown" ──────────────────

describe("Brain-session outage warn says 'key count unknown' (#252)", () => {
  it("the inner catch block emits 'key count unknown' in the warn message", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "warn must state 'key count unknown'").toMatch(/key count unknown/);
  });

  it("the response includes brainCoreUnreachable set from the catch block", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "brainCoreUnreachable must be set to true in catch").toMatch(
      /brainCoreUnreachable\s*=\s*true/,
    );
    expect(src, "brainCoreUnreachable must appear in the response json").toMatch(
      /brainCoreUnreachable/,
    );
  });

  it("brainCoreUnreachable is initialized to false so a clean run reports false", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "brainCoreUnreachable must be initialized to false").toMatch(
      /brainCoreUnreachable\s*=\s*false/,
    );
  });

  it("the zero-initialized counts are NOT set to zero again in the catch, confirming they're indeterminate", () => {
    const src = readFileSync(ROUTES, "utf8");
    const deleteAcctIdx = src.indexOf('app.delete("/api/account"');
    const handlerBlock = src.slice(deleteAcctIdx, deleteAcctIdx + 2500);
    // The catch block should set brainCoreUnreachable = true but must NOT
    // update brainKeysRevoked or brainKeyRevocationsFailed (they stay 0 = unknown).
    const catchIdx = handlerBlock.indexOf("} catch (revokeErr)");
    expect(catchIdx, "inner catch not found in handler").toBeGreaterThan(-1);
    const catchBlock = handlerBlock.slice(catchIdx, catchIdx + 400);
    expect(
      catchBlock,
      "catch must not assign brainKeysRevoked (that would claim 0 = confirmed)",
    ).not.toMatch(/brainKeysRevoked\s*=/);
  });
});

// ─── #251: Client parses and surfaces orphaned-key warnings ──────────────────

describe("Client surfaces orphaned-key warnings to operators (#251)", () => {
  it("authContext.deleteAccount parses the JSON response (not just checks res.ok)", () => {
    const src = readFileSync(AUTH_CTX, "utf8");
    const deleteAcctIdx = src.indexOf("const deleteAccount");
    expect(deleteAcctIdx, "deleteAccount not found in authContext").toBeGreaterThan(-1);
    const fn = src.slice(deleteAcctIdx, deleteAcctIdx + 800);
    expect(fn, "deleteAccount must call res.json()").toMatch(/res\.json\(\)/);
  });

  it("deleteAccount returns brainCoreUnreachable so callers can show warnings", () => {
    const src = readFileSync(AUTH_CTX, "utf8");
    expect(src, "deleteAccount must return brainCoreUnreachable").toMatch(
      /brainCoreUnreachable/,
    );
  });

  it("deleteAccount return type includes brainCoreUnreachable: boolean", () => {
    const src = readFileSync(AUTH_CTX, "utf8");
    // The AuthContextType interface must declare the enriched return type.
    expect(src, "interface must declare brainCoreUnreachable in deleteAccount return").toMatch(
      /brainCoreUnreachable.*boolean/,
    );
  });

  it("AccountSection shows a warning toast when brainCoreUnreachable is true", () => {
    const src = readFileSync(ACCOUNT_SECTION, "utf8");
    expect(src, "AccountSection must handle brainCoreUnreachable").toMatch(
      /brainCoreUnreachable/,
    );
    const unreachableIdx = src.indexOf("brainCoreUnreachable");
    const window = src.slice(unreachableIdx, unreachableIdx + 300);
    expect(
      window,
      "a toast must be shown when brainCoreUnreachable is true",
    ).toMatch(/toast/);
  });

  it("AccountSection shows a warning toast when brainKeyRevocationsFailed > 0", () => {
    const src = readFileSync(ACCOUNT_SECTION, "utf8");
    expect(src, "AccountSection must handle brainKeyRevocationsFailed").toMatch(
      /brainKeyRevocationsFailed/,
    );
    const failIdx = src.indexOf("brainKeyRevocationsFailed");
    const window = src.slice(failIdx, failIdx + 400);
    expect(
      window,
      "a toast must fire when brainKeyRevocationsFailed > 0",
    ).toMatch(/toast/);
  });

  it("the warning toast copy tells operators to contact support, not just dismiss", () => {
    const src = readFileSync(ACCOUNT_SECTION, "utf8");
    expect(src, "warning toast must mention contacting support").toMatch(/contact support/i);
  });
});
