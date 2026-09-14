/**
 * Due-date arithmetic and the phrases derived from it.
 *
 * A due date arrives from brain-core as a bare `YYYY-MM-DD`. That is a DAY, not a
 * moment — but `new Date("2026-09-14")` parses to UTC midnight, so any helper that
 * subtracts two instants answers a different question than the one being asked. The
 * shared helper used to do exactly that (`Math.round((due - Date.now()) / 86_400_000)`)
 * and the rounding boundary fell at midday: a bill due today read "Due today" in the
 * morning and "1 day overdue" in the afternoon, with no data change behind it. On a
 * record 152 calendar days old it printed "153 days overdue".
 *
 * Everything here reduces both sides to a day number BEFORE subtracting, so the answer
 * only changes when the calendar does. It lives in `lib/` rather than beside the popup
 * chrome so every surface — the bill popup's chip, the payable popup's relative
 * clause, a list row — shares one implementation and cannot drift, and so the
 * arithmetic is testable without pulling in JSX and image imports.
 *
 * ## The one rule, stated once
 *
 * A record's date is a UTC calendar day; "today" is the user's LOCAL calendar day.
 * Both are reduced to a day number by `recordDayNumber` / `todayDayNumber` below,
 * and every days-between count in the client is the difference of those two numbers.
 * The AR aging bucket (`lib/arAging.ts`) and the cash projection window
 * (`lib/cashProjection.ts`) both come through here rather than flooring `now` onto a
 * UTC day of their own: that variant is stable across the day but answers a different
 * question, and west of Greenwich it put the same invoice on either side of the
 * 90-day boundary depending on which surface the reader was looking at.
 */

const MS_PER_DAY = 86_400_000;

/**
 * The day number (whole days since the epoch) a RECORD's date falls on, or `null`
 * when there is no usable date.
 *
 * Read in UTC because that is the timezone a bare `YYYY-MM-DD` parses into; reading
 * it back with local getters would shift it a day west of Greenwich and turn "due
 * tomorrow" into "due today".
 */
export function recordDayNumber(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / MS_PER_DAY);
}

/**
 * The day number of the user's LOCAL today.
 *
 * "Overdue" is a statement about the day the reader is living in, not the day it
 * happens to be in UTC. `now` is injectable so callers that already thread an `asOf`
 * through a pure view function stay assertable.
 */
export function todayDayNumber(now: Date = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY;
}

/**
 * Whole CALENDAR days from today until `iso`: negative when the date has passed,
 * `0` on the day itself. `null` when there is no usable date, which callers must
 * render as "no date" rather than as zero.
 */
export function calendarDaysToDue(iso?: string | null, now: Date = new Date()): number | null {
  const dueDay = recordDayNumber(iso);
  if (dueDay === null) return null;
  return dueDay - todayDayNumber(now);
}

export interface DueChip {
  text: string;
  color: string;
  bg: string;
  border: string;
}

/** The due/overdue chip beside a record's name. `null` when there is no date to
 *  reason about — an undated record gets no chip rather than a guessed one. */
export function dueChip(dd: number | null): DueChip | null {
  if (dd == null) return null;
  if (dd < 0) return { text: "Overdue", color: "#d20344", bg: "#350011", border: "rgba(210,3,68,0.2)" };
  if (dd === 0) return { text: "Due today", color: "#a8b9f4", bg: "#222737", border: "rgba(108,119,157,0.2)" };
  return {
    text: `Due in ${dd} day${dd === 1 ? "" : "s"}`,
    color: "#a8b9f4",
    bg: "#222737",
    border: "rgba(108,119,157,0.2)",
  };
}

/**
 * "15 days overdue" / "due today" / "due in 5 days".
 *
 * This is date arithmetic and deliberately NOT a second rendering of `status`. The
 * header chip shows the state brain-core recorded; this shows how the due date sits
 * against today. They can legitimately differ — a tax payable can still be marked
 * `due` past its date — and collapsing them was what previously printed the status
 * twice in one line.
 */
export function relativeDueLabel(dd: number | null): string | null {
  if (dd == null) return null;
  if (dd < 0) return `${-dd} day${dd === -1 ? "" : "s"} overdue`;
  if (dd === 0) return "due today";
  return `due in ${dd} day${dd === 1 ? "" : "s"}`;
}
