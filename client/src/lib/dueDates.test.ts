import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { calendarDaysToDue, dueChip, relativeDueLabel } from "./dueDates";

/**
 * The bug this pins: `daysToDue` rounded the difference between two INSTANTS. A due
 * date arrives as a bare `YYYY-MM-DD` (UTC midnight), so the rounding boundary fell at
 * midday and the answer changed with the clock — a bill due today read "Due today"
 * in the morning and "Overdue" in the afternoon, with no data change behind it.
 */

const MORNING = "2026-09-14T09:00:00";
const EVENING = "2026-09-14T21:00:00";

/** Freezes the wall clock at a LOCAL time on 14 Sep 2026. */
function at(localTime: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(localTime));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("calendarDaysToDue", () => {
  it("reads the same at 09:00 and at 21:00 for a record due today", () => {
    at(MORNING);
    const morning = calendarDaysToDue("2026-09-14");
    at(EVENING);
    const evening = calendarDaysToDue("2026-09-14");

    expect(morning).toBe(0);
    expect(evening, "the clock moving is not a data change").toBe(morning);
  });

  it("holds across the whole day for past and future dates too", () => {
    for (const [due, expected] of [
      ["2026-09-13", -1],
      ["2026-04-15", -152],
      ["2026-09-15", 1],
      ["2026-09-21", 7],
    ] as const) {
      at(MORNING);
      expect(calendarDaysToDue(due), `${due} in the morning`).toBe(expected);
      at(EVENING);
      expect(calendarDaysToDue(due), `${due} in the evening`).toBe(expected);
    }
  });

  it("counts calendar days, not rounded 24-hour blocks", () => {
    /* The reported case: 152 calendar days printed as "153 days overdue" because the
       instant difference was 152.6 days and rounded up. */
    at("2026-09-14T15:30:00");
    expect(calendarDaysToDue("2026-04-15")).toBe(-152);
  });

  it("is unmoved by a time component on the due date", () => {
    at(MORNING);
    expect(calendarDaysToDue("2026-09-16T23:59:59.000Z")).toBe(2);
    expect(calendarDaysToDue("2026-09-16T00:00:00.000Z")).toBe(2);
  });

  it("returns null — never 0 — when there is no usable date", () => {
    at(MORNING);
    // 0 would render as "Due today" on a record that carries no date at all.
    expect(calendarDaysToDue(null)).toBeNull();
    expect(calendarDaysToDue(undefined)).toBeNull();
    expect(calendarDaysToDue("")).toBeNull();
    expect(calendarDaysToDue("not-a-date")).toBeNull();
  });
});

describe("dueChip", () => {
  it("does not flip a record due today to Overdue as the day goes on", () => {
    at(MORNING);
    const morning = dueChip(calendarDaysToDue("2026-09-14"));
    at(EVENING);
    const evening = dueChip(calendarDaysToDue("2026-09-14"));

    expect(morning?.text).toBe("Due today");
    expect(evening?.text).toBe("Due today");
  });

  it("labels a passed date Overdue and a future one with its day count", () => {
    at(EVENING);
    expect(dueChip(calendarDaysToDue("2026-09-13"))?.text).toBe("Overdue");
    expect(dueChip(calendarDaysToDue("2026-09-15"))?.text).toBe("Due in 1 day");
    expect(dueChip(calendarDaysToDue("2026-09-16"))?.text).toBe("Due in 2 days");
  });

  it("gives an undated record no chip rather than a guessed one", () => {
    expect(dueChip(null)).toBeNull();
  });
});

describe("relativeDueLabel", () => {
  it("agrees with the chip on the same record, all day", () => {
    for (const now of [MORNING, EVENING]) {
      at(now);
      const dd = calendarDaysToDue("2026-09-14");
      expect(relativeDueLabel(dd), now).toBe("due today");
      expect(dueChip(dd)?.text, now).toBe("Due today");
    }
  });

  it("phrases overdue records off the same calendar count", () => {
    at("2026-09-14T15:30:00");
    expect(relativeDueLabel(calendarDaysToDue("2026-04-15"))).toBe("152 days overdue");
    expect(relativeDueLabel(calendarDaysToDue("2026-09-13"))).toBe("1 day overdue");
  });

  it("says nothing about a record with no date", () => {
    expect(relativeDueLabel(null)).toBeNull();
  });
});

/* ── one implementation, not three ─────────────────────────────────────────────
   The popups each computed their own version of this, which is how they came to
   disagree on the same record. A source scan is the only way to pin that here: the
   components import image assets a DOM-less runner cannot resolve. */

const read = (rel: string) =>
  readFileSync(path.resolve(import.meta.dirname, rel), "utf8");

describe("the due-date helpers have a single home", () => {
  it("the popups import the shared helper instead of re-deriving it", () => {
    for (const rel of ["../components/BillDetailPopup.tsx", "../components/PayableDetailPopup.tsx"]) {
      const src = read(rel);
      expect(src, `${rel} must take its day count from lib/dueDates`).toMatch(
        /import\s*\{[^}]*calendarDaysToDue[^}]*\}\s*from\s*"@\/lib\/dueDates"/,
      );
      expect(src, `${rel} must not define its own`).not.toMatch(
        /function\s+calendarDaysToDue/,
      );
    }
  });

  it("no surface is left on the instant-difference arithmetic", () => {
    for (const rel of [
      "../components/detailPopup.tsx",
      "../components/BillDetailPopup.tsx",
      "../components/PayableDetailPopup.tsx",
      "../components/CashFlowTab.tsx",
    ]) {
      const src = read(rel);
      expect(src, `${rel} still subtracts Date.now() from a due date`).not.toMatch(
        /Date\.now\(\)\s*\)?\s*\/\s*86_400_000|86_400_000/,
      );
      expect(src, `${rel} must not keep the old helper name`).not.toContain("daysToDue(");
    }
  });

  it("a due DATE is rendered as the day it is, in UTC, on every surface", () => {
    /* `toLocaleDateString` on a UTC-midnight date prints the previous day west of
       Greenwich, so the bill popup's "Due" row disagreed with the payable popup's
       header for the same record. */
    const src = read("../components/detailPopup.tsx");
    expect(src).toMatch(/getUTCMonth\(\)/);
    // The call, not the word: the comment above `fmtDue` names the method it dropped.
    expect(src, "fmtDue must not fall back to a local-time rendering").not.toMatch(
      /\.toLocaleDateString\(/,
    );
  });
});
