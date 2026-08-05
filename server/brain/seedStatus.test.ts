import { describe, it, expect } from "vitest";
import { seedStillExpected } from "./seed";

/**
 * The defect: a freshly created demo tenant showed a settled-looking $211,200.00 owed
 * when the real figure was $287,223.39. Its records arrive in waves, and nothing the
 * browser can see says so — no document exists yet, so there is no extraction to be in
 * progress, and every ledger read comes back complete, consistent and short.
 *
 * This is the server's answer to "is that figure provisional". It has to be right at
 * both ends: false confidence on one side, a permanent disclaimer on the other.
 */

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const agoMs = (ms: number) => new Date(NOW - ms);
const MINUTE = 60_000;
const WINDOW = 10 * MINUTE;

const ask = (over: Partial<Parameters<typeof seedStillExpected>[0]> = {}) =>
  seedStillExpected({
    inFlight: false,
    isDemo: true,
    createdAt: agoMs(20_000),
    documentCount: 0,
    expectedDocuments: 4,
    expectedWithinMs: WINDOW,
    now: NOW,
    ...over,
  });

describe("seedStillExpected", () => {
  it("is true for a brand-new demo tenant with nothing ingested yet", () => {
    /* The exact window the old UI got wrong: the tenant is provisioned lazily on the
       first brain call, so for the first seconds there is no run in flight AND no
       document — indistinguishable, from the client, from an account that has nothing. */
    expect(ask({ inFlight: false, documentCount: 0 })).toBe(true);
  });

  it("is true while a run this process started is still going", () => {
    expect(ask({ inFlight: true, documentCount: 4 })).toBe(true);
  });

  it("is true midway through the manifest", () => {
    expect(ask({ documentCount: 3 })).toBe(true);
  });

  it("is false once the whole starter set has landed", () => {
    expect(ask({ documentCount: 4 })).toBe(false);
  });

  it("survives a restart that forgot the in-flight run", () => {
    // The durable fact, not the in-memory one, is what answers after a redeploy.
    expect(ask({ inFlight: false, documentCount: 1 })).toBe(true);
  });

  it("never claims a real account is being seeded", () => {
    /* Real signups start empty on purpose and are never seeded, so a low document
       count says nothing about them. Reporting "still importing" would put a
       permanent caveat under every figure a real user has. */
    expect(ask({ isDemo: false, documentCount: 0 })).toBe(false);
  });

  it("stops expecting a seed once the account is no longer young", () => {
    /* A demo user who DELETES a starter document drops below the manifest for good.
       Without the window, their totals would carry "still reading your documents"
       forever — a caveat that is not just useless but false. */
    expect(ask({ documentCount: 2, createdAt: agoMs(WINDOW + MINUTE) })).toBe(false);
    expect(ask({ documentCount: 2, createdAt: agoMs(WINDOW - MINUTE) })).toBe(true);
  });

  it("a run in flight outranks the age window", () => {
    // Actually observed work beats a heuristic about when work is plausible.
    expect(ask({ inFlight: true, createdAt: agoMs(30 * MINUTE), documentCount: 4 })).toBe(true);
  });

  it("says nothing when the account has no creation time to judge", () => {
    /* An unknown age cannot be inside the window. Guessing "true" would caveat
       figures indefinitely for any account whose timestamp is missing. */
    expect(ask({ createdAt: null, documentCount: 0 })).toBe(false);
    expect(ask({ createdAt: undefined, documentCount: 0 })).toBe(false);
  });

  it("defaults to the real manifest size when none is given", () => {
    /* The route does not pass a count — it must not have to know one. A default of 0
       would make the check vacuous and the flag permanently false, which is precisely
       the silence being fixed. */
    expect(seedStillExpected({
      inFlight: false,
      isDemo: true,
      createdAt: agoMs(20_000),
      documentCount: 0,
      expectedWithinMs: WINDOW,
      now: NOW,
    })).toBe(true);
  });
});
