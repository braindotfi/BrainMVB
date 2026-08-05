/**
 * Structured answers computed from the ledger, with no model in the loop.
 *
 * ## Why some questions must not reach a model
 *
 * The assistant's normal path sends a prose snapshot of the ledger to a language model.
 * That is fine for open questions, but a class of questions has exactly one correct
 * answer that is a number: what we owe a named vendor, which customer invoices are
 * overdue, what payroll we owe. For those, a model can round, drop a row, or narrate
 * confidently from a snapshot that was silently truncated — and the answer still reads
 * as authoritative. So they are computed here, from a proven-complete read, and the
 * model is never called. `assistant-deterministic.test.ts` pins that.
 *
 * ## The rule every answer in this file obeys
 *
 * Never state a figure that cannot be proven. Three separate things can make a figure a
 * lie, and each one produces a refusal rather than a number:
 *
 *  1. **A truncated read.** Ledger list endpoints cap silently, so a partial walk yields
 *     a real, plausible, smaller total. See `ledgerRead.ts`.
 *  2. **An unreachable read.** A failed fetch must not fall through to a vaguer answer
 *     about the same money; it is reported as unavailable.
 *  3. **An unresolved subject.** "How much do we owe Acme" where no Acme exists, or where
 *     two counterparties match, is answered with the ambiguity — never with a total for a
 *     guessed vendor, and never by quietly widening to all vendors.
 *
 * A refusal is returned with `answered: false` so callers cannot present it as an answer.
 * Returning `null` instead means "not one of these questions" and lets the caller fall
 * through to its normal behaviour; that is the only non-answer that is not a refusal.
 */

import { listLedgerCounterparties, type BrainObligation, type BrainInvoice, type WikiEvidence, type CounterpartyLite } from "./client";
import { readAllObligations, readAllInvoices, type PagedRead } from "./ledgerRead";

/** Which structured question was recognised. Surfaced for tests and logs. */
export type DeterministicPath = "payable-by-counterparty" | "overdue-ar" | "payroll-total";

export interface DeterministicAnswer {
  reply: string;
  sources: WikiEvidence[];
  /** False for every refusal, so no caller can render one as an answer. */
  answered: boolean;
  grounded: boolean;
  engine: "deterministic";
  path: DeterministicPath;
}

/* ── shared vocabulary ────────────────────────────────────────────────────────
   Mirrors client/src/lib/liabilities.ts so "discharged" means the same thing on
   both sides of the app. Anything unrecognised counts as still outstanding: a
   status that wrongly inflates a total is visible and checkable, whereas one that
   silently writes off money is not. */
const SETTLED_STATUSES = new Set([
  "paid",
  "settled",
  "cancelled",
  "canceled",
  "void",
  "voided",
  "written_off",
]);

const AR_SCENARIO = "ar";

function isSettled(status: string | null | undefined): boolean {
  return SETTLED_STATUSES.has((status ?? "").trim().toLowerCase());
}

function isReceivable(o: BrainObligation): boolean {
  return (o.direction ?? "").toLowerCase().startsWith("receiv");
}

/** Outstanding payable obligations — the same filter the Payables tab applies. */
function openPayables(rows: readonly BrainObligation[]): BrainObligation[] {
  return rows.filter((o) => !!o && !isReceivable(o) && !isSettled(o.status));
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Same rendering as the grounding path, so figures look identical wherever they appear. */
function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Render a set of amounts that may span currencies.
 *
 * Summing across currencies would invent an exchange rate the ledger never stated, so
 * mixed currencies are reported side by side instead of added together.
 */
function totalsByCurrency(rows: readonly { amount: number; currency: string }[]): string {
  const byCurrency = new Map<string, number>();
  for (const r of rows) {
    byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + r.amount);
  }
  if (byCurrency.size === 0) return money(0, "USD");
  return [...byCurrency.entries()].map(([c, amt]) => money(amt, c)).join(" + ");
}

function refuse(path: DeterministicPath, reply: string): DeterministicAnswer {
  return { reply, sources: [], answered: false, grounded: false, engine: "deterministic", path };
}

/** The one message shape for a read that could not be proven whole. */
function refuseIncomplete(path: DeterministicPath, subject: string): DeterministicAnswer {
  return refuse(
    path,
    `I can't give you a reliable figure for ${subject} right now — I was only able to read part of the ledger, and a total from a partial read would be lower than the real one. Try again in a moment.`,
  );
}

function refuseUnreachable(path: DeterministicPath, subject: string): DeterministicAnswer {
  return refuse(
    path,
    `I couldn't reach the ledger to work out ${subject}. That's a connection problem rather than an empty ledger, so I'd rather not quote a number. Try again in a moment.`,
  );
}

/* ── question routing ─────────────────────────────────────────────────────────
   Deliberately high-precision. Under-matching is safe: the question falls through to
   the existing assistant behaviour, which is what happens today. Over-matching is not:
   it answers a question the user did not ask with a confident number. */

const OVERDUE_WORDS = /\b(overdue|past[-\s]?due|late|behind)\b/i;
const INVOICE_WORDS = /\b(invoice|invoices|receivable|receivables)\b/i;
const CUSTOMER_WORDS = /\b(customer|customers|client|clients|receivable|receivables|ar|owed to us|owes? us)\b/i;
const PAYROLL_WORD = /\bpayroll\b/i;
const AMOUNT_WORDS = /\b(owe|owed|owing|total|totals|outstanding|obligation|obligations|due|how much|accrued|liability|liabilities|balance)\b/i;
const OWE_WORDS = /\b(owe|owed|owing|outstanding|payable|payables|balance|bill|bills)\b/i;

/**
 * Words that follow "owe" without naming anybody. Without this list, "how much do we owe
 * in total?" would be treated as naming an unresolvable vendor and refused, when it is
 * really a general question the normal assistant path should handle.
 */
const GENERIC_OWE_TARGETS = new Set([
  "", "in", "total", "in total", "overall", "money", "anything", "anyone", "everyone",
  "altogether", "right now", "now", "today", "this month", "currently", "people",
  "suppliers", "vendors", "everybody", "all", "all up", "our vendors", "our suppliers",
]);

/**
 * CATEGORIES of spend, as opposed to the name of a counterparty. "Do we owe taxes?" names
 * a kind of liability, not a vendor, so refusing it as an unknown counterparty would be
 * wrong twice over — the user never named one, and the question has a perfectly good
 * answer from the normal assistant path.
 */
const OWE_CATEGORY_TERMS = new Set([
  "tax", "taxes", "vat", "sales tax", "payroll", "payroll tax", "salaries", "salary",
  "wages", "rent", "interest", "insurance", "utilities", "invoices", "bills", "debt",
  "debts", "loans", "loan", "contractors", "employees", "staff", "subscriptions",
  "commission", "commissions", "dividends", "fees",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type CounterpartyResolution =
  | { kind: "resolved"; counterparty: CounterpartyLite }
  | { kind: "ambiguous"; matches: CounterpartyLite[] }
  | { kind: "unresolved"; term: string }
  | { kind: "none" };

/**
 * Find which known counterparty the question is about.
 *
 * Matching known names against the question — rather than parsing a name out of it — is
 * what keeps this honest: the only names it can resolve are names that exist. A name that
 * is a strict substring of another match ("Cloud" inside "CloudOps") is dropped so the
 * more specific vendor wins instead of registering as an ambiguity.
 */
export function resolveCounterparty(
  question: string,
  counterparties: readonly CounterpartyLite[],
): CounterpartyResolution {
  const matches = counterparties.filter((c) => {
    const name = (c?.name ?? "").trim();
    if (!name) return false;
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`, "i").test(question);
  });

  const specific = matches.filter(
    (c) =>
      !matches.some(
        (other) =>
          other !== c &&
          other.name.toLowerCase().includes(c.name.toLowerCase()) &&
          other.name.length > c.name.length,
      ),
  );

  if (specific.length === 1) return { kind: "resolved", counterparty: specific[0] };
  if (specific.length > 1) return { kind: "ambiguous", matches: specific };

  /* Nothing known matched. Decide whether the user named somebody we do not have (which
     must be said out loud) or asked a general question (which is not ours to answer). */
  const named = /\b(?:owe|owed|owing|paying|pay|bill from|invoice from)\s+(?:to\s+)?([a-z0-9&.'\- ]{2,40}?)\s*(?:[?.,!]|$)/i.exec(
    question,
  );
  const term = (named?.[1] ?? "").trim().replace(/\s+/g, " ");
  const lower = term.toLowerCase();
  /* Three things must all hold before we tell the user their vendor does not exist.
     Getting this wrong is not a wrong number, but it does replace a usable answer with a
     dead end, so the bar is "the user clearly named somebody". A capital letter is what
     separates a name from a common noun: people write "owe CloudOps", but "owe rent". */
  const namesSomebody =
    !!term &&
    !GENERIC_OWE_TARGETS.has(lower) &&
    !OWE_CATEGORY_TERMS.has(lower) &&
    /[A-Z]/.test(term);
  if (namesSomebody) return { kind: "unresolved", term };
  return { kind: "none" };
}

/** Which structured path, if any, this question belongs to. */
export function classify(question: string): DeterministicPath | null {
  const q = question ?? "";
  /* Payroll first: it is the most specific, and "how much payroll do we owe" would
     otherwise be caught by the counterparty path and refused as an unknown vendor. */
  if (PAYROLL_WORD.test(q) && AMOUNT_WORDS.test(q)) return "payroll-total";
  if (OVERDUE_WORDS.test(q) && INVOICE_WORDS.test(q) && CUSTOMER_WORDS.test(q)) return "overdue-ar";
  if (OWE_WORDS.test(q)) return "payable-by-counterparty";
  return null;
}

/* ── the three answers ────────────────────────────────────────────────────── */

function obligationEvidence(rows: readonly BrainObligation[]): WikiEvidence[] {
  return rows.map((o) => ({
    entityId: o.id,
    entityType: "obligation",
    excerpt: `${money(num(o.amount_due), o.currency)} due ${o.due_date ?? "unknown"} - ${o.status}`,
  }));
}

async function answerPayableByCounterparty(
  token: string,
  question: string,
): Promise<DeterministicAnswer | null> {
  const path: DeterministicPath = "payable-by-counterparty";

  let counterparties: CounterpartyLite[];
  try {
    counterparties = (await listLedgerCounterparties(token, 10_000)).counterparties ?? [];
  } catch {
    /* Without the counterparty list we cannot tell "vendor does not exist" from "vendor
       exists but we could not look it up", and those need different answers. */
    return refuseUnreachable(path, "what you owe that vendor");
  }

  const resolution = resolveCounterparty(question, counterparties);
  if (resolution.kind === "none") return null; // a general question — not ours.
  if (resolution.kind === "unresolved") {
    return refuse(
      path,
      `I couldn't find a counterparty called "${resolution.term}" in your ledger, so I can't total what you owe them. Check the spelling, or open Ledger › Payables to see the vendors Brain knows about.`,
    );
  }
  if (resolution.kind === "ambiguous") {
    const names = resolution.matches.map((c) => c.name).join(", ");
    return refuse(
      path,
      `That could mean more than one counterparty — ${names}. Ask me again naming just one and I'll total it exactly.`,
    );
  }

  const target = resolution.counterparty;

  let read: PagedRead<BrainObligation>;
  try {
    read = await readAllObligations(token);
  } catch {
    return refuseUnreachable(path, `what you owe ${target.name}`);
  }
  if (!read.complete) return refuseIncomplete(path, `what you owe ${target.name}`);

  const rows = openPayables(read.rows).filter((o) => o.counterparty_id === target.id);
  if (rows.length === 0) {
    return {
      reply: `You have nothing outstanding to ${target.name}. I checked every obligation in the ledger and none of them are unpaid amounts owed to them.`,
      sources: [],
      answered: true,
      grounded: true,
      engine: "deterministic",
      path,
    };
  }

  const total = totalsByCurrency(rows.map((o) => ({ amount: num(o.amount_due), currency: o.currency })));
  const dated = rows.filter((o) => o.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const soonest = dated[0]?.due_date;
  const detail = rows
    .map((o) => `  • ${money(num(o.amount_due), o.currency)} due ${o.due_date ?? "date unknown"} (${o.status})`)
    .join("\n");

  return {
    reply:
      `You owe ${target.name} ${total} across ${rows.length} outstanding ${rows.length === 1 ? "obligation" : "obligations"}` +
      `${soonest ? `, the earliest due ${soonest}` : ""}.\n\n${detail}`,
    sources: obligationEvidence(rows),
    answered: true,
    grounded: true,
    engine: "deterministic",
    path,
  };
}

async function answerPayrollTotal(token: string): Promise<DeterministicAnswer> {
  const path: DeterministicPath = "payroll-total";

  let read: PagedRead<BrainObligation>;
  try {
    read = await readAllObligations(token);
  } catch {
    return refuseUnreachable(path, "your payroll obligations");
  }
  if (!read.complete) return refuseIncomplete(path, "your payroll obligations");

  /* `kind` is the record's own type, kept separate from `direction` by the normalizer.
     Reading `direction` here would match nothing, because brain-core leaves it null and
     folds the kind onto `type`. */
  const rows = openPayables(read.rows).filter((o) => (o.kind ?? "").trim().toLowerCase() === "payroll");

  if (rows.length === 0) {
    return {
      reply:
        "You have no outstanding payroll obligations. I read every obligation in the ledger and none of them are unpaid payroll.",
      sources: [],
      answered: true,
      grounded: true,
      engine: "deterministic",
      path,
    };
  }

  const total = totalsByCurrency(rows.map((o) => ({ amount: num(o.amount_due), currency: o.currency })));
  const detail = rows
    .map((o) => `  • ${money(num(o.amount_due), o.currency)} due ${o.due_date ?? "date unknown"} (${o.status})`)
    .join("\n");

  return {
    reply: `Your outstanding payroll obligation is ${total} across ${rows.length} ${rows.length === 1 ? "record" : "records"}.\n\n${detail}`,
    sources: obligationEvidence(rows),
    answered: true,
    grounded: true,
    engine: "deterministic",
    path,
  };
}

/** `YYYY-MM-DD` in UTC — the same shape brain-core uses for `due_date`, so the two compare as strings. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function answerOverdueAr(token: string, now: Date): Promise<DeterministicAnswer> {
  const path: DeterministicPath = "overdue-ar";

  let read: PagedRead<BrainInvoice>;
  try {
    read = await readAllInvoices(token);
  } catch {
    return refuseUnreachable(path, "which customer invoices are overdue");
  }
  if (!read.complete) {
    return refuse(
      path,
      "I can't give you a complete list of overdue customer invoices right now — I was only able to read part of the invoice ledger, and a short list here would look like good news. Try again in a moment.",
    );
  }

  const today = isoDay(now);
  /* `scenario === "ar"` is a POSITIVE test: an invoice with absent or unreadable metadata
     is not treated as a receivable. Summing AP rows in here would invert the direction of
     the whole answer. */
  const overdue = read.rows
    .filter((i) => !!i && i.metadata?.scenario === AR_SCENARIO)
    .filter((i) => !isSettled(i.status))
    .filter((i) => !!i.due_date && i.due_date < today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  if (overdue.length === 0) {
    return {
      reply: `No customer invoices are overdue as of ${today}. I checked every invoice in the ledger.`,
      sources: [],
      answered: true,
      grounded: true,
      engine: "deterministic",
      path,
    };
  }

  const outstanding = overdue.map((i) => ({
    amount: num(i.amount_due) - num(i.amount_paid),
    currency: i.currency,
  }));
  const total = totalsByCurrency(outstanding);
  const detail = overdue
    .map((i, idx) => {
      const label = i.invoice_number ? `Invoice ${i.invoice_number}` : "Invoice";
      return `  • ${label} — ${money(outstanding[idx].amount, i.currency)} — due ${i.due_date} (${i.status})`;
    })
    .join("\n");

  return {
    reply: `${overdue.length} customer ${overdue.length === 1 ? "invoice is" : "invoices are"} overdue as of ${today}, totalling ${total}.\n\n${detail}`,
    sources: overdue.map((i) => ({
      entityId: i.id,
      entityType: "invoice",
      excerpt: `Invoice ${i.invoice_number} - ${money(num(i.amount_due), i.currency)} due ${i.due_date}`,
    })),
    answered: true,
    grounded: true,
    engine: "deterministic",
    path,
  };
}

/**
 * Answer `question` from the ledger, or return `null` if it is not a structured question.
 *
 * `null` is the fall-through signal: the caller keeps its existing behaviour. Every other
 * return is final and must be sent as-is — including the refusals, which exist precisely
 * so that a question about money owed is never quietly downgraded to a model's guess.
 */
export async function answerDeterministically(
  token: string,
  question: string,
  now: Date = new Date(),
): Promise<DeterministicAnswer | null> {
  const path = classify(question);
  if (!path) return null;

  switch (path) {
    case "payroll-total":
      return answerPayrollTotal(token);
    case "overdue-ar":
      return answerOverdueAr(token, now);
    case "payable-by-counterparty":
      return answerPayableByCounterparty(token, question);
  }
}
