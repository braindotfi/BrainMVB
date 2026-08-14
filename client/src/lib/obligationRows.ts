/**
 * Presentation helpers for an obligation row.
 *
 * These live here rather than in `components/PayablesTab.tsx` for the same reason
 * ordering and totals live in `lib/cashFlow.ts`: they are the part worth testing, and
 * the component imports SVG assets that a DOM-less test runner cannot resolve.
 */

import { capitalCase } from "./displayLabels";

type Format = (a: string | number) => string;

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

/**
 * brain-core sends `amount_due` as a raw decimal string with eight trailing places
 * ("4800.00000000"). Handing that straight to the currency formatter renders
 * "$4,800.00000000", so it goes through Number first — the same coercion the running
 * total applies, which is what keeps a row and the total below it consistent. An
 * unparseable amount says so rather than rendering "$NaN".
 */
export function amountLabel(raw: string, format: Format): string {
  // `Number("")` is 0, not NaN. A blank amount is not a zero amount, and rendering it
  // as "$0.00" would be a false all-clear on a debt — the same class of bug as showing
  // an unreachable total as zero. Reject it before the coercion can hide it.
  if (typeof raw !== "string" || !raw.trim()) return "Amount unavailable";
  const n = Number(raw);
  return Number.isFinite(n) ? format(n) : "Amount unavailable";
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
