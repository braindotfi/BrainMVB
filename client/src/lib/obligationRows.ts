/**
 * Presentation helpers for an obligation row.
 *
 * These live here rather than in `components/PayablesTab.tsx` for the same reason
 * ordering and totals live in `lib/cashFlow.ts`: they are the part worth testing, and
 * the component imports SVG assets that a DOM-less test runner cannot resolve.
 */

import { capitalCase } from "./displayLabels";

type Format = (a: string | number) => string;

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
