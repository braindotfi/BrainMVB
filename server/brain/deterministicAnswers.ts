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

import { type BrainObligation, type BrainInvoice, type BrainTransaction, type WikiEvidence, type CounterpartyLite } from "./client";
import { readAllObligations, readAllInvoices, readAllCounterparties, readAllTransactions, type PagedRead } from "./ledgerRead";

/** Which structured question was recognised. Surfaced for tests and logs. */
export type DeterministicPath =
  | "payable-by-counterparty"
  | "overdue-ar"
  | "payroll-total"
  | "monthly-income-expenses";

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

/**
 * The counterparty list itself was only partially read. Neither "this vendor does not
 * exist" nor "this is the vendor you mean" can be trusted from a partial list: a more
 * specific name (e.g. "Acme Corp Ltd" behind a matched "Acme") may simply not have been
 * fetched yet. Refusing here is what stops that from becoming a confident, wrong total
 * attributed to the wrong counterparty.
 */
function refuseUnverifiedCounterparty(path: DeterministicPath, term: string): DeterministicAnswer {
  return refuse(
    path,
    `I could only read part of your counterparty list just now, so I can't be sure "${term}" is the vendor you mean — a more specific match might exist beyond what I read. Try again in a moment, or open Ledger › Payables to check the name.`,
  );
}

/* ── question routing ─────────────────────────────────────────────────────────
   Deliberately high-precision. Under-matching is safe: the question falls through to
   the existing assistant behaviour, which is what happens today. Over-matching is not:
   it answers a question the user did not ask with a confident number. */

/* ── monthly income / expenses helpers ───────────────────────────────────── */

const MONTH_NAMES_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/** "2026-07" → "July 2026". */
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const labels = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${labels[Number(m) - 1] ?? m} ${y}`;
}

/**
 * Parse a YYYY-MM key from the question using month names ("July 2026") or
 * relative references ("last month", "this month").
 * Returns null when no recognisable month reference is present.
 */
function parseMonthKey(question: string, now: Date): string | null {
  const q = question;
  if (/\b(last|previous|past)\s+month\b/i.test(q)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (/\bthis\s+month\b/i.test(q)) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  /* Named month with optional year. The non-word-boundary after the year keeps
     "July 2026" from matching just "July" when a year follows. */
  const m = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b(?:[^a-z0-9]+(\d{4}))?\b/i.exec(q);
  if (!m) return null;
  const monthNum = MONTH_NAMES_MAP[m[1].toLowerCase()];
  if (!monthNum) return null;
  const year = m[2] ? parseInt(m[2], 10) : now.getFullYear();
  if (year < 2000 || year > 2100) return null;
  return `${year}-${String(monthNum).padStart(2, "0")}`;
}

/**
 * Signals that the question is about income/expenses for a calendar month.
 * High-precision to avoid capturing "what happened in July?" as a financial question.
 */
const MONTHLY_INCOME_EXPENSE_WORDS =
  /\b(income|revenue|earnings?|earned|earn|inflows?|expenses?|spending|spent|spend|outflows?|cash[-\s]?flow|financials?|results?|breakdown|summary|performance|profit|loss)\b/i;

/** A calendar month reference: a named month OR "last/this/previous month". */
const MONTH_REF_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|\b(last|previous|past|this)\s+month\b/i;

/** Same direction mapping as buildMonthlyBreakdown in client/src/lib/cashFlow.ts. */
const TX_DIRECTION: Record<string, "income" | "expense"> = {
  inflow: "income",
  outflow: "expense",
  // transfer and adjustment are deliberately absent: they do not count in either total.
};

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
  /* Monthly income/expenses first: a question with a calendar month reference AND an
     income/expense signal is about historical reporting, not outstanding balances. This
     must precede payroll-total so "last month's payroll expenses" routes here (historical
     transactions) rather than to payroll-total (outstanding obligations). */
  if (MONTH_REF_PATTERN.test(q) && MONTHLY_INCOME_EXPENSE_WORDS.test(q)) return "monthly-income-expenses";
  /* Payroll next: most specific of the balance questions. "how much payroll do we owe"
     contains "owe" and would otherwise be caught by the counterparty path. */
  if (PAYROLL_WORD.test(q) && AMOUNT_WORDS.test(q)) return "payroll-total";
  if (OVERDUE_WORDS.test(q) && INVOICE_WORDS.test(q) && CUSTOMER_WORDS.test(q)) return "overdue-ar";
  if (OWE_WORDS.test(q)) return "payable-by-counterparty";
  return null;
}

/* ── monthly income / expenses answer ────────────────────────────────────── */

/**
 * Answer a monthly income/expense question from a proven-complete transaction walk.
 *
 * Applies the same direction-based bucketing as `buildMonthlyBreakdown` in
 * `client/src/lib/cashFlow.ts`: inflows count as income, outflows as expenses,
 * and transfers/adjustments contribute to neither total. Given identical
 * transaction data, this function and the chart produce identical figures.
 *
 * Unlike the chart — which reads one un-paginated page from the BFF — this path
 * walks the cursor to the end, so its figures cover the full ledger and do not
 * suffer the page-cap truncation the chart notes in its opening comment.
 */
async function answerMonthlyIncomeExpenses(
  token: string,
  question: string,
  now: Date,
): Promise<DeterministicAnswer | null> {
  const path: DeterministicPath = "monthly-income-expenses";

  const monthKey = parseMonthKey(question, now);
  if (!monthKey) return null; // cannot determine which month — fall through to the normal path

  let read: PagedRead<BrainTransaction>;
  try {
    read = await readAllTransactions(token);
  } catch {
    return refuseUnreachable(path, `the figures for ${monthLabel(monthKey)}`);
  }
  if (!read.complete) return refuseIncomplete(path, `the figures for ${monthLabel(monthKey)}`);

  /* Sum amounts the same way buildMonthlyBreakdown does in client/src/lib/cashFlow.ts:
     all amounts are treated as a single pool regardless of currency. This is the same
     policy the chart uses so both surfaces produce identical figures from the same
     transaction feed. If the tenant transacts in multiple currencies, the total is a
     mixed sum — the same mixed sum the chart would show — and a disclosure note is
     added so the user can judge its meaning. */
  let income = 0;
  let expense = 0;
  const currencies = new Set<string>();

  for (const t of read.rows) {
    const kind = TX_DIRECTION[t.direction ?? ""];
    if (!kind) continue; // transfer or adjustment — excluded from both totals
    const txMonth = (t.transaction_date ?? "").slice(0, 7); // "YYYY-MM"
    if (txMonth !== monthKey) continue;
    if (kind === "income") income += num(t.amount);
    else expense += num(t.amount);
    currencies.add((t.currency ?? "USD").toUpperCase());
  }

  const label = monthLabel(monthKey);

  if (income === 0 && expense === 0) {
    return {
      reply:
        `No income or expense transactions were recorded for ${label}. ` +
        `Transfers between your own accounts and adjustments are excluded — ` +
        `they do not represent money earned or spent.`,
      sources: [],
      answered: true,
      grounded: true,
      engine: "deterministic",
      path,
    };
  }

  const [currency] = [...currencies]; // dominant currency for formatting
  const currencyNote =
    currencies.size > 1
      ? `\n\nNote: transactions in multiple currencies (${[...currencies].join(", ")}) were summed without conversion — the same way the Monthly Breakdown chart totals them.`
      : "";

  return {
    reply:
      `For ${label}:\n\n` +
      `  • Income:   ${money(income, currency ?? "USD")}\n` +
      `  • Expenses: ${money(expense, currency ?? "USD")}` +
      `${currencyNote}\n\n` +
      `These figures count settled transactions only. Inflows are counted as income, ` +
      `outflows as expenses. Transfers between your own accounts and adjustments are excluded.`,
    sources: [],
    answered: true,
    grounded: true,
    engine: "deterministic",
    path,
  };
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

  let cpRead: PagedRead<CounterpartyLite>;
  try {
    /* Walked to the end rather than one page: brain-core caps this list at 20 rows
       regardless of the requested size, so an unwalked read can resolve a shorter
       name ("Acme") while a longer, more specific one ("Acme Corp Ltd") sits unread
       past the cap — a wrong, confident total attributed to the wrong vendor. */
    cpRead = await readAllCounterparties(token);
  } catch {
    /* Without the counterparty list we cannot tell "vendor does not exist" from "vendor
       exists but we could not look it up", and those need different answers. */
    return refuseUnreachable(path, "what you owe that vendor");
  }
  const counterparties = cpRead.rows;

  const resolution = resolveCounterparty(question, counterparties);
  if (resolution.kind === "none") return null; // a general question — not ours.
  if (resolution.kind === "unresolved") {
    if (!cpRead.complete) return refuseUnverifiedCounterparty(path, resolution.term);
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

  // resolution.kind === "resolved" from here — but not yet safe to trust on a partial list.
  if (!cpRead.complete) return refuseUnverifiedCounterparty(path, resolution.counterparty.name);

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
    /* A customer resolves by name exactly like a vendor, and the payables sweep then
       truthfully finds nothing — but the reason is not "you are square with them", it is
       "this is not somebody you pay". Receivables live in the invoice feed, which this
       path never reads, so a flat "nothing outstanding" reads as reassurance about a
       relationship that may carry a large balance the other way. Name the category and
       point at the surface that holds the figure instead of implying a zero.

       Absent type is deliberately NOT treated as a customer: an unknown side of the
       ledger keeps the vendor wording, which is the weaker claim. */
    const kind = (target.type ?? "").trim().toLowerCase();
    return {
      reply:
        kind === "customer"
          ? `${target.name} is recorded as a customer, not a vendor, so there's nothing here that you owe them. If you meant what they owe you, open Ledger › Receivables — I don't total receivables on this path.`
          : kind === "vendor"
            ? /* Known to be somebody we pay, so the payables sweep covers the whole
                 relationship and may speak about it. */
              `You have nothing outstanding to ${target.name}. I checked every obligation in the ledger and none of them are unpaid amounts owed to them.`
            : /* Unknown or opaque side of the ledger — an absent type is not evidence of
                 a vendor, and employee/protocol/ledger parties have no receivable meaning
                 worth steering to. State only what was actually computed and make the
                 scope explicit, rather than implying a settled relationship. */
              `I found no unpaid payable obligations to ${target.name}. This path only totals what you owe, so that's a statement about payables — not about the relationship overall.`,
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
    /* Scoped to what was actually tested, not to what exists: this only checked rows
       whose `kind` is literally "payroll". Nothing in this repo pins brain-core's full
       obligation-kind vocabulary, so a "payroll_run"/"wages"-kinded row would silently
       produce a false "none" if this claimed to have checked payroll generally. */
    return {
      reply:
        "You have no obligations typed \"payroll\". I checked every obligation in the ledger for that exact kind and found none unpaid.",
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
    case "monthly-income-expenses":
      return answerMonthlyIncomeExpenses(token, question, now);
    case "payroll-total":
      return answerPayrollTotal(token);
    case "overdue-ar":
      return answerOverdueAr(token, now);
    case "payable-by-counterparty":
      return answerPayableByCounterparty(token, question);
  }
}
