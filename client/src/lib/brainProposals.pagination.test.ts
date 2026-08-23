/**
 * Source-scan guard for fetchAllBrainProposals pagination contract.
 *
 * #171 — Show every unresolved record instead of just the first pageful.
 *
 * fetchAllBrainProposals already paginates (up to MAX_PROPOSAL_PAGES = 50
 * pages of 100 proposals each, i.e. up to 5,000 records). This test pins the
 * contract so a future simplification that drops the cursor loop cannot ship
 * silently — it would truncate the inbox to the first page and hide proposals
 * from users without any visible error.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const PROPOSALS = "client/src/lib/brainProposals.ts";

describe("fetchAllBrainProposals pagination contract (#171)", () => {
  it("fetchAllBrainProposals exists and is exported", () => {
    const src = readFileSync(PROPOSALS, "utf8");
    expect(src, "fetchAllBrainProposals must be exported").toMatch(
      /export\s+async\s+function\s+fetchAllBrainProposals/,
    );
  });

  it("uses a cursor loop, not a single-page fetch", () => {
    const src = readFileSync(PROPOSALS, "utf8");
    // Must have a for/while loop that follows next_cursor.
    expect(src, "pagination loop must exist").toMatch(/for\s*\(.*page.*MAX_PROPOSAL_PAGES/);
    expect(src, "next_cursor must be consumed in the loop").toMatch(/next_cursor/);
    expect(src, "cursor must be advanced between pages").toMatch(/cursor\s*=/);
  });

  it("has MAX_PROPOSAL_PAGES safety cap so a stuck cursor cannot loop forever", () => {
    const src = readFileSync(PROPOSALS, "utf8");
    expect(src, "MAX_PROPOSAL_PAGES constant must exist").toMatch(/MAX_PROPOSAL_PAGES\s*=\s*\d+/);
    // The cap must be meaningful (at least 10 pages).
    const capMatch = src.match(/MAX_PROPOSAL_PAGES\s*=\s*(\d+)/);
    const cap = capMatch ? Number(capMatch[1]) : 0;
    expect(cap, "MAX_PROPOSAL_PAGES must be at least 10").toBeGreaterThanOrEqual(10);
  });

  it("detects a stuck cursor (repeated next_cursor) and throws instead of looping silently", () => {
    const src = readFileSync(PROPOSALS, "utf8");
    // Must track followed cursors and throw on a repeat.
    expect(src, "stuck-cursor detection requires a followed-set").toMatch(/followed/);
    expect(src, "stuck cursor must throw").toMatch(/pagination did not advance/i);
  });

  it("throws when the page cap is exceeded so the caller sees an error, not a truncated list", () => {
    const src = readFileSync(PROPOSALS, "utf8");
    expect(src, "exceeding MAX_PROPOSAL_PAGES must throw").toMatch(
      /throw.*exceeded.*maximum page count|maximum page count.*throw/i,
    );
  });

  it("returns next_cursor: null on the final page so consumers know the list is complete", () => {
    const src = readFileSync(PROPOSALS, "utf8");
    expect(src, "final return must include next_cursor: null").toMatch(
      /return\s*\{.*proposals.*next_cursor:\s*null/s,
    );
  });

  it("collects proposals from all pages into a single array", () => {
    const src = readFileSync(PROPOSALS, "utf8");
    // Must accumulate across pages with push or spread.
    expect(src, "proposals must be accumulated with push or spread across pages").toMatch(
      /proposals\.push|proposals.*=.*\.\.\./,
    );
  });
});
