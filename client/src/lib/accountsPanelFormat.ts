/**
 * Formatting for the accounts panel's card and transaction rows.
 *
 * Split out of the component so the rules below are testable as behaviour rather
 * than as strings in a source scan. Every one of them exists because the panel
 * renders live ledger data, and a formatter is the easiest place to quietly
 * invent a figure that the feed never stated:
 *
 *   - A date-only timestamp is a calendar date, not an instant. Parsing it with
 *     `new Date("2026-07-05")` yields UTC midnight, which renders as the 4th in
 *     any western timezone. So date-only values are read as calendar fields and
 *     never shifted, and no clock time is invented for them.
 *   - Amounts arrive as decimal strings. Routing them through `Number` rounds
 *     past 2dp, drops precision above 2^53, and turns an unreadable value into
 *     `$0`. So the digits are grouped as text and anything unparseable is shown
 *     verbatim.
 *   - `transfer` and `adjustment` state no direction. Figma only draws incoming
 *     and outgoing rows, so those rows get neutral treatment rather than being
 *     coloured green and prefixed `+`.
 */

export type TransactionDirection = "inflow" | "outflow" | "transfer" | "adjustment";

/** What the row may assert visually: money out, money in, or nothing. */
export type TransactionFlow = "out" | "in" | "neutral";

const NUMERIC = /^[+-]?\d+(\.\d+)?$/;

export function transactionFlow(direction: TransactionDirection): TransactionFlow {
  if (direction === "outflow") return "out";
  if (direction === "inflow") return "in";
  // A transfer or an adjustment is not a claim about direction, and the amount's
  // own sign cannot stand in for one: this feed states magnitude in `amount` and
  // polarity in `direction`, so an unsigned transfer is not "incoming".
  return "neutral";
}

/**
 * Figma 4062:56400 amounts read "+$1,000" / "-$514.45".
 *
 * USD gets the currency glyph; every other currency keeps its own code, because
 * no FX source exists to restate it in dollars.
 */
export function formatTransactionAmount(
  rawAmount: string,
  currency: string,
  flow: TransactionFlow,
): string {
  const raw = (rawAmount ?? "").trim();
  const code = (currency ?? "").trim().toUpperCase();
  if (raw === "") return "Amount unavailable";
  if (!NUMERIC.test(raw)) {
    // Unreadable. Show exactly what the feed said, with its unit, and no sign.
    return code ? `${raw} ${code}` : raw;
  }

  const negative = raw.startsWith("-");
  const digits = raw.replace(/^[+-]/, "");
  const [whole, fractionRaw = ""] = digits.split(".");
  // Trailing zeros are not precision, so "240.00" prints as "240" -- but nothing
  // else is rounded away.
  const fraction = fractionRaw.replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const magnitude = fraction ? `${grouped}.${fraction}` : grouped;

  const isZero = /^0*$/.test(whole) && fraction === "";
  const sign = isZero ? "" : flow === "out" ? "-" : flow === "in" ? "+" : negative ? "-" : "";
  return code === "USD" ? `${sign}$${magnitude}` : code ? `${sign}${magnitude} ${code}` : `${sign}${magnitude}`;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayLabel(dayOfMonth: number, weekday: string): string {
  return `${dayOfMonth} ${weekday}`;
}

/**
 * The meta line under a transaction title: Figma 4062:56400 shows "8:49pm · 20 Sat".
 *
 * Returns one part when the feed gave a calendar date and two when it gave a real
 * instant. A date-only value never grows a clock time it does not have.
 */
export function transactionMeta(value: string): string[] {
  const raw = (value ?? "").trim();
  if (raw === "") return [];

  const calendar = CALENDAR_DATE.exec(raw);
  if (calendar) {
    const [, year, month, day] = calendar;
    const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    // Date.UTC rolls "2026-02-31" forward silently; a rolled value is not the
    // date the feed sent, so it is left verbatim instead.
    const roundTrips =
      utc.getUTCFullYear() === Number(year) &&
      utc.getUTCMonth() === Number(month) - 1 &&
      utc.getUTCDate() === Number(day);
    if (!roundTrips) return [raw];
    return [dayLabel(Number(day), utc.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }))];
  }

  const stamp = new Date(raw);
  if (Number.isNaN(stamp.getTime())) return [raw];
  const day = dayLabel(stamp.getDate(), stamp.toLocaleDateString("en-US", { weekday: "short" }));
  // Only a value that actually carries a clock time gets one rendered.
  if (!/T\d{2}:\d{2}/.test(raw)) return [day];
  const time = stamp
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s?([AP])M$/i, (_match, meridiem: string) => `${meridiem.toLowerCase()}m`);
  return [time, day];
}

/**
 * Figma 4062:57086 renders a wallet address as first-6 + five dots + last-5
 * ("0x7cB5.....486A8"). Only shorten when that is actually shorter than the real
 * value -- a short bank identifier is shown in full, and the copy button always
 * hands over the untruncated string.
 */
export function shortenIdentifier(value: string): string {
  return value.length > 16 ? `${value.slice(0, 6)}.....${value.slice(-5)}` : value;
}
