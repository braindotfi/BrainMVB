/**
 * Presentation helpers for an obligation row.
 *
 * These live here rather than in `components/PayablesTab.tsx` for the same reason
 * ordering and totals live in `lib/cashFlow.ts`: they are the part worth testing, and
 * the component imports SVG assets that a DOM-less test runner cannot resolve.
 */

import { capitalCase } from "./displayLabels";

/* ── status presentation ──────────────────────────────────────────────────────
   Shared by the Payables list badge and the detail popup's header chip.

   These must come from ONE place. When the popup derived its own chip from the due
   date while the list badge read brain-core's `status`, a tax payable dated in the
   past but still marked `due` rendered as "Due" in the list and "Overdue" in the
   popup you got by clicking it — the same record disagreeing with itself on one
   screen. The date and the status are two different questions; the record's state is
   the status, so that is what both surfaces show.

   Colours are the three the rest of the Ledger already uses for these meanings
   (#350011 red, #4a2300 amber, #222737 neutral), so "overdue" reads the same here as
   it does on Cash Flow. Borders need an explicit `border border-solid` on the
   element; a colour alone renders no stroke at all. */
const STATUS_COLORS: Record<string, { bg: string; border: string; fg: string }> = {
  overdue:  { bg: "#350011", border: "rgba(210,3,68,0.25)",     fg: "#d20344" },
  due:      { bg: "#4a2300", border: "rgba(255,148,0,0.25)",    fg: "#ff9500" },
  upcoming: { bg: "#222737", border: "#2c3247",                 fg: "#6c779d" },
  /* AR / invoice statuses — matched to DocumentViewerPopup's STATUS_CHIP colours
     so the same record looks identical whether opened from Receivables or a
     linked-evidence tile in a proposal card. */
  paid:     { bg: "#123509", border: "rgba(66,191,35,0.2)",     fg: "#42bf23" },
  unpaid:   { bg: "#4a2300", border: "rgba(255,148,0,0.25)",    fg: "#ff9500" },
  partial:  { bg: "#4a2300", border: "rgba(255,148,0,0.25)",    fg: "#ff9500" },
  held:     { bg: "#350011", border: "rgba(210,3,68,0.2)",      fg: "#d20344" },
  disputed: { bg: "#350011", border: "rgba(210,3,68,0.2)",      fg: "#d20344" },
  cancelled:{ bg: "#222737", border: "#2c3247",                 fg: "#6c779d" },
  open:     { bg: "#4a2300", border: "rgba(255,148,0,0.25)",    fg: "#ff9500" },
  closed:   { bg: "#123509", border: "rgba(66,191,35,0.2)",     fg: "#42bf23" },
};
const NEUTRAL = { bg: "#222737", border: "#2c3247", fg: "#6c779d" };

/** An unrecognised status still gets colours — neutral ones. Never dropped. */
export function statusColors(status: string): { bg: string; border: string; fg: string } {
  return STATUS_COLORS[status.trim().toLowerCase()] ?? NEUTRAL;
}

/** The same badge, shaped for the detail popup's header chip. */
export function statusChip(status: string): { text: string; color: string; bg: string; border: string } | null {
  // No status at all gets no chip, rather than an empty pill.
  if (!status || !status.trim()) return null;
  const c = statusColors(status);
  return { text: capitalCase(status), color: c.fg, bg: c.bg, border: c.border };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Due 12 Aug 2026", or an honest phrase when the record carries no usable date. */
export function dueLabel(due: string | null): string {
  if (!due) return "No due date recorded";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "No due date recorded";
  return `Due ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* There is deliberately NO converting amount formatter here.
 *
 * There used to be one — `amountLabel(raw, format)` — which handed the record's own
 * amount to `useCurrency().format`. That helper converts as if its input were USD, so
 * the Payables list rendered a EUR bill as a dollar figure while the popup it opened
 * quoted the euros, and the running total below summed converted and unconverted
 * numbers together. Everything on this surface is a figure lifted off an upstream
 * record, so everything goes through `sourceAmountLabel` / `glanceAmountLabel` below.
 * See .agents/memory/display-vs-source-currency.md. */

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};

/**
 * An amount in the currency the RECORD is denominated in — never the display currency.
 *
 * `useCurrency().format` exists to re-express the app's figures in whichever currency
 * the user picked, and it does that by assuming its input is USD and applying a rate.
 * That assumption is fine for a running total the app owns and false for a figure
 * lifted off a supplier's document. Passing a EUR obligation through it and then
 * appending the record's own code rendered "$8,894.63 EUR": a converted number
 * labelled with the currency it was converted FROM. There is no FX table for arbitrary
 * currencies here anyway, so the honest move is not to convert at all — this is what
 * the counterparty is owed, in the units they are owed it.
 *
 * Formatting is done on the STRING. brain-core sends eight trailing decimal places
 * ("4800.00000000") and routing a money value through Number() to tidy that up is how
 * a large amount quietly loses precision.
 */
export function sourceAmountLabel(raw: string | null, currency: string | null): string {
  const parts = splitSourceAmount(raw, currency);
  if (!parts) return UNAVAILABLE;
  // The code is always shown when there is no symbol for it, because "1,200.00" alone
  // names no currency at all.
  return parts.code ? `${parts.number} ${parts.code}` : parts.number;
}

const UNAVAILABLE = "Amount unavailable";

/* The one place the digits are produced. Every label below is this plus a decision
   about where the currency code goes, so no two surfaces can round, group or sign a
   figure differently. */
function splitSourceAmount(
  raw: string | null,
  currency: string | null,
): { number: string; code: string | null } | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = raw.trim().replace(/,/g, "").match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if (!m) return null;
  const [, sign, intPart, decRaw = ""] = m;

  // Two places, but never fewer digits than the value actually carries: "1234.5678"
  // is a real figure and truncating it to "1,234.57" would restate the debt.
  const dec = decRaw.replace(/0+$/, "");
  const shown = dec.length > 2 ? dec : dec.padEnd(2, "0");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const code = currency?.trim().toUpperCase() || null;
  const symbol = code ? (CURRENCY_SYMBOL[code] ?? "") : "";
  return { number: `${sign}${symbol}${grouped}.${shown}`, code };
}

/**
 * The same figure as `sourceAmountLabel`, minus a redundant "USD" suffix.
 *
 * For the places a figure is read at a glance — a list row, the popup's one-line
 * summary, a running total — "$4,800.00 USD" is noise: the app's own figures are in
 * dollars and the symbol carries it. The code is kept for everything else, including
 * every currency whose symbol could be mistaken for dollars, because a bare "€8,894.63"
 * next to a column of dollar rows is exactly the confusion this exists to prevent.
 *
 * One function so a row and the popup it opens cannot render the same record
 * differently — which is what happened when each surface made this choice for itself.
 * The full `sourceAmountLabel` still backs the popup's Amount row, where the record is
 * being read rather than scanned.
 */
export function glanceAmountLabel(raw: string | null, currency: string | null): string {
  const parts = splitSourceAmount(raw, currency);
  if (!parts) return UNAVAILABLE;
  return parts.code && parts.code !== "USD" ? `${parts.number} ${parts.code}` : parts.number;
}

/**
 * The figure alone, for a header that renders the currency code in its own pill.
 *
 * The code is omitted because the pill beside it already states it — and only for
 * that reason. Never use this where nothing else on screen names the currency: a bare
 * "8,894.63", or a "€8,894.63" in a column of dollars, is the ambiguity the other two
 * labels exist to prevent. The record's amount still goes in unconverted.
 */
export function pilledAmountLabel(raw: string | null, currency: string | null): string {
  return splitSourceAmount(raw, currency)?.number ?? UNAVAILABLE;
}

/**
 * The trailing detail on a row: the obligation's kind (Bill / Payroll / Tax).
 *
 * Two adjustments. When the counterparty could not be resolved the raw id is shown
 * instead, so the row stays traceable rather than reading "Unidentified counterparty ·
 * Bill" with no way to chase it. And when the kind merely restates the name — the
 * reference tenant has a counterparty literally called "Payroll" — it is dropped, since
 * "Payroll · Due 21 Jul · Payroll" reads like a rendering fault rather than two facts.
 */
export function subLabel(kind: string | null, name: string | null, counterpartyId: string | null): string {
  const pretty = kind ? capitalCase(kind) : "";
  // Unresolved counterparty: the id is the more useful of the two, and keeps the row
  // chaseable. Falls back to the kind, then to nothing — never to an invented name.
  if (!name) return counterpartyId ?? pretty;
  if (!pretty) return "";
  return pretty.toLowerCase() === name.trim().toLowerCase() ? "" : pretty;
}
