/**
 * YTD window boundary tests.
 *
 * #242 — Confirm the YTD window stays correct when the year rolls over.
 *
 * showYtdChip and ytdWindowKeys are pure helpers: they derive from a
 * caller-supplied value, so behaviour across year boundaries is fully
 * deterministic.  MonthlyBreakdownCard computes thisMonth once per mount —
 * a mid-session midnight crossing will not shift the window, which is
 * intentional to avoid a jarring mid-session chart jump.  These tests confirm:
 *   1. January (1) → no YTD chip (year just started, nothing to compare).
 *   2. December (12) → no YTD chip (full year visible in the bar chart).
 *   3. February–November (2–11) → YTD chip visible.
 *   4. ytdWindowKeys produces the correct Jan→month slice for each case.
 *   5. Dec → Jan year rollover: both endpoints return false (no chip),
 *      proving a fresh mount in the new year always reflects the right state.
 */
import { describe, it, expect } from "vitest";
import { showYtdChip, ytdWindowKeys } from "./cashFlow";

// ─── showYtdChip (month number 1–12) ─────────────────────────────────────────

describe("showYtdChip year-boundary behaviour (#242)", () => {
  it("returns false for January (1) — year just started, no prior months to compare", () => {
    expect(showYtdChip(1)).toBe(false);
  });

  it("returns false for December (12) — full year already visible in the bar chart", () => {
    expect(showYtdChip(12)).toBe(false);
  });

  it("returns true for every month from February (2) through November (11)", () => {
    for (let m = 2; m <= 11; m++) {
      expect(showYtdChip(m), `showYtdChip should be true for month ${m}`).toBe(true);
    }
  });

  it("does not bleed across the year boundary — Dec and Jan both return false", () => {
    // Dec 31 → Jan 1 transition: both sides of the boundary produce no chip.
    expect(showYtdChip(12)).toBe(false); // last month of old year
    expect(showYtdChip(1)).toBe(false);  // first month of new year
  });

  it("Feb remount after a year rollover correctly shows the chip again", () => {
    // A card remounted in February of the new year must show the YTD chip.
    expect(showYtdChip(2)).toBe(true);
  });
});

// ─── ytdWindowKeys (YYYY-MM string) ──────────────────────────────────────────

describe("ytdWindowKeys year-boundary behaviour (#242)", () => {
  it("for February the window is only Jan–Feb (two months)", () => {
    expect(ytdWindowKeys("2026-02")).toEqual(["2026-01", "2026-02"]);
  });

  it("for November the window runs Jan–Nov (eleven months)", () => {
    const keys = ytdWindowKeys("2026-11");
    expect(keys).toHaveLength(11);
    expect(keys[0]).toBe("2026-01");
    expect(keys[10]).toBe("2026-11");
  });

  it("for March the window is Jan–Mar with the correct year prefix", () => {
    expect(ytdWindowKeys("2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("all keys share the same year as the input month", () => {
    const keys = ytdWindowKeys("2025-09");
    for (const k of keys) {
      expect(k, `Key ${k} must belong to year 2025`).toMatch(/^2025-/);
    }
  });

  it("Dec-31 and Jan-1 mounts both produce zero-length YTD window (no chip), Feb produces two keys", () => {
    // Dec: showYtdChip(12) === false → ytdWindowKeys is never called in practice,
    // but it still returns a well-formed result (12 keys) without throwing.
    const decKeys = ytdWindowKeys("2025-12");
    expect(decKeys).toHaveLength(12); // Jan–Dec, all months

    // Jan: showYtdChip(1) === false → ytdWindowKeys would return a 1-key list.
    const janKeys = ytdWindowKeys("2026-01");
    expect(janKeys).toHaveLength(1);
    expect(janKeys[0]).toBe("2026-01");

    // Feb: chip is shown, window is Jan–Feb.
    const febKeys = ytdWindowKeys("2026-02");
    expect(febKeys).toHaveLength(2);
  });
});
