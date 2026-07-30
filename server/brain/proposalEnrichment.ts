/**
 * Server-side resolution of proposal evidence refs into human-readable names.
 *
 * brain-core's proposal read-model emits evidence as bare `{ kind, ref, resolvable }`
 * triples — `counterparty` / `cp_01KYSF0Q…` — which the review UI used to print
 * verbatim, so an approver was asked to approve something identified only by a ULID.
 *
 * Resolution happens HERE rather than in the browser for three reasons:
 *   1. the names become part of the payload contract, so every consumer (modal,
 *      inbox row, future surfaces) gets them without each re-implementing a join;
 *   2. the browser would otherwise need the whole counterparty/invoice/account
 *      book loaded just to caption one card;
 *   3. the client-side resolver caches are populated per-screen and are empty on a
 *      deep link straight into /review.
 *
 * Refs are matched by DIRECT ID LOOKUP against a combined index, never by parsing
 * the `xx_` prefix: brain-core's id pattern is `^[a-z]+_[0-9A-HJKMNP-TV-Z]{26}$`
 * with no published registry of which prefix belongs to which entity, so a prefix
 * table would be a guess that silently stops resolving when core adds a type.
 * `kind` is used only to caption the row.
 *
 * MONEY IS NEVER PRE-FORMATTED into a display string here. Amounts travel as
 * `{ value, currency }` so the client can apply the user's active display currency
 * and FX rate (see lib/currencyContext). Emitting "$18,600.00" server-side would
 * hard-code USD and break the currency switcher.
 */

import {
  listLedgerAccounts,
  listLedgerCounterparties,
  listLedgerInvoices,
  listObligations,
  listMembers,
  listLedgerTransactions,
} from "./client";

export interface ResolvedAmount {
  /** Raw decimal string exactly as the ledger holds it. */
  value: string;
  currency: string;
}

export interface EvidenceFact {
  label: string;
  value: string;
}

/** brain-core's `{kind, ref, resolvable}` plus the BFF-resolved presentation fields. */
export interface EnrichedEvidenceItem {
  kind: string;
  ref: string;
  resolvable: boolean;
  /** Human caption for `kind` — "Customer", "Invoice", "Account". */
  label: string;
  /** Resolved human name, or null when the ref matched nothing we can read. */
  display: string | null;
  /** Structured, NOT a formatted string — the client applies display currency. */
  amount: ResolvedAmount | null;
  /** Extra decision-supporting rows, all derived from real ledger fields. */
  facts: EvidenceFact[];
  /** True for broad BACKGROUND citations (brain-core's `wiki:` refs) as opposed
   *  to the specific record the proposal is about. Observed on a live tenant: a
   *  collections proposal about one customer also cites the whole counterparty
   *  book as wiki context, so letting these caption the card renamed a StartupX
   *  proposal after an unrelated customer. They stay in the technical section. */
  context: boolean;
}

export interface EnrichedProposal {
  evidence: EnrichedEvidenceItem[];
  /** The headline entity a human would name this card by, if one resolved. */
  subject: { label: string; display: string } | null;
  [key: string]: unknown;
}

interface IndexedEntity {
  label: string;
  display: string;
  amount: ResolvedAmount | null;
  facts: EvidenceFact[];
}

export type EntityIndex = Map<string, IndexedEntity>;

/* ── Captions ─────────────────────────────────────────────────────────────── */

const KIND_LABELS: Record<string, string> = {
  counterparty: "Counterparty",
  vendor: "Vendor",
  customer: "Customer",
  invoice: "Invoice",
  account: "Account",
  obligation: "Obligation",
  transaction: "Transaction",
  member: "Team member",
  user: "Team member",
  payment_intent: "Payment",
  document: "Document",
  raw_document: "Document",
};

/** Caption for an evidence kind. Unknown kinds are title-cased rather than
 *  dropped, so a new brain-core kind degrades to "Vendor Risk", not a raw token. */
export function labelForKind(kind: string): string {
  const known = KIND_LABELS[kind?.toLowerCase?.() ?? ""];
  if (known) return known;
  if (!kind) return "Reference";
  return kind
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/* ── Derived facts ────────────────────────────────────────────────────────── */

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Whole days between a due date and `now`. Positive = overdue. Null if unparseable.
 *  This is DERIVED from a real due_date, not invented: it is the single most
 *  decision-relevant thing about a collections or payables proposal. */
export function daysOverdue(dueDate: string | null | undefined, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const ms = now.getTime() - due.getTime();
  return Math.floor(ms / 86_400_000);
}

function dueFacts(dueDate: string | null | undefined, now: Date): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  const pretty = formatDate(dueDate);
  if (pretty) facts.push({ label: "Due", value: pretty });
  const od = daysOverdue(dueDate, now);
  if (od !== null && od > 0) {
    facts.push({ label: "Overdue by", value: `${od} day${od === 1 ? "" : "s"}` });
  }
  return facts;
}

function titleCase(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ");
}

/* ── Index construction ───────────────────────────────────────────────────── */

/**
 * Fetch the tenant's reference data and build one id → entity index.
 *
 * Every leg is allSettled: a proposal card that shows resolved names for the
 * entities we could read plus raw ids for the rest is strictly better than a
 * 502, and these are independent upstream calls.
 *
 * The page limits are a deliberate latency cap, not an assumption of tenant
 * size. A ref that lives beyond the first page simply stays unresolved and
 * renders as a raw id under "Technical reference" — the same graceful
 * degradation as an upstream outage. If large tenants start showing raw ids,
 * switch to targeted lookup-by-ref rather than raising these numbers.
 */
export async function buildEntityIndex(token: string, now: Date = new Date()): Promise<EntityIndex> {
  const [accounts, cps, invoices, obligations, members, transactions] = await Promise.allSettled([
    listLedgerAccounts(token, { limit: 100 }),
    listLedgerCounterparties(token),
    listLedgerInvoices(token, { limit: 100 }),
    listObligations(token, { limit: 100 }),
    listMembers(token),
    listLedgerTransactions(token, { limit: 200 }),
  ]);

  const index: EntityIndex = new Map();

  // Counterparty names are needed by invoice/obligation rows below, so index first.
  const cpNames = new Map<string, string>();
  if (cps.status === "fulfilled") {
    for (const c of cps.value.counterparties ?? []) {
      if (!c?.id) continue;
      cpNames.set(c.id, c.name);
      index.set(c.id, { label: "Counterparty", display: c.name, amount: null, facts: [] });
    }
  }

  if (accounts.status === "fulfilled") {
    for (const a of accounts.value.accounts ?? []) {
      if (!a?.id) continue;
      const facts: EvidenceFact[] = [];
      if (a.account_type) facts.push({ label: "Type", value: titleCase(a.account_type) });
      if (a.institution) facts.push({ label: "Institution", value: a.institution });
      if (a.status) facts.push({ label: "Status", value: titleCase(a.status) });
      index.set(a.id, {
        label: "Account",
        display: a.name,
        amount: a.current_balance != null ? { value: String(a.current_balance), currency: a.currency } : null,
        facts,
      });
    }
  }

  if (invoices.status === "fulfilled") {
    for (const inv of invoices.value.invoices ?? []) {
      if (!inv?.id) continue;
      const facts: EvidenceFact[] = [];
      const cpName = inv.counterparty_id ? cpNames.get(inv.counterparty_id) : undefined;
      if (cpName) facts.push({ label: "Counterparty", value: cpName });
      facts.push(...dueFacts(inv.due_date, now));
      if (inv.status) facts.push({ label: "Status", value: titleCase(inv.status) });
      if (inv.metadata?.po) facts.push({ label: "PO", value: String(inv.metadata.po) });
      index.set(inv.id, {
        label: "Invoice",
        display: `Invoice #${inv.invoice_number}`,
        amount: { value: String(inv.amount_due), currency: inv.currency },
        facts,
      });
    }
  }

  if (obligations.status === "fulfilled") {
    for (const o of obligations.value.obligations ?? []) {
      if (!o?.id) continue;
      const facts: EvidenceFact[] = [];
      const cpName = o.counterparty_id ? cpNames.get(o.counterparty_id) : undefined;
      if (cpName) facts.push({ label: "Counterparty", value: cpName });
      facts.push(...dueFacts(o.due_date, now));
      if (o.status) facts.push({ label: "Status", value: titleCase(o.status) });
      index.set(o.id, {
        label: o.direction === "receivable" ? "Receivable" : "Payable",
        display: cpName ? `${cpName} ${o.direction}` : titleCase(String(o.direction)),
        amount: { value: String(o.amount_due), currency: o.currency },
        facts,
      });
    }
  }

  // Reconciliation proposals cite transactions and nothing else, so without this
  // leg every reconciliation card resolved to a subject-less wall of raw tx ids.
  if (transactions.status === "fulfilled") {
    for (const t of transactions.value.transactions ?? []) {
      if (!t?.id) continue;
      const facts: EvidenceFact[] = [];
      const cpName = t.counterparty_id ? cpNames.get(t.counterparty_id) : undefined;
      if (cpName) facts.push({ label: "Counterparty", value: cpName });
      if (t.direction) facts.push({ label: "Direction", value: titleCase(t.direction) });
      const dated = formatDate(t.transaction_date);
      if (dated) facts.push({ label: "Date", value: dated });
      if (t.status) facts.push({ label: "Status", value: titleCase(t.status) });
      const desc = t.description_normalized || t.description_raw;
      index.set(t.id, {
        label: "Transaction",
        // Fall back to the party + direction rather than echoing the raw id.
        display: desc || (cpName ? `${cpName} ${t.direction}` : titleCase(String(t.direction))),
        amount: { value: String(t.amount), currency: t.currency },
        facts,
      });
    }
  }

  if (members.status === "fulfilled") {
    for (const m of members.value?.members ?? []) {
      if (!m?.id) continue;
      const facts: EvidenceFact[] = [];
      if (m.role) facts.push({ label: "Role", value: titleCase(m.role) });
      if (m.email) facts.push({ label: "Email", value: m.email });
      index.set(m.id, { label: "Team member", display: m.displayName, amount: null, facts });
    }
  }

  return index;
}

/* ── Enrichment ───────────────────────────────────────────────────────────── */

interface RawEvidence {
  kind?: unknown;
  ref?: unknown;
  resolvable?: unknown;
}

/**
 * Look a ref up, tolerating brain-core's two ref spellings.
 *
 * Observed on a live tenant: the same entity is cited both as a bare id
 * (`cp_01KY…`) and as a wiki URI (`wiki:/counterparties/cp_01KY…`). The trailing
 * path segment of the URI is that same ledger id, so a bare-id-only lookup left
 * more than half of all evidence unresolved on a real collections proposal.
 */
function lookup(ref: string, index: EntityIndex): IndexedEntity | undefined {
  const direct = index.get(ref);
  if (direct) return direct;
  const tail = ref.split("/").pop();
  return tail && tail !== ref ? index.get(tail) : undefined;
}

/** Pure: resolve one evidence triple against the index. Unit-tested. */
export function resolveEvidenceItem(raw: RawEvidence, index: EntityIndex): EnrichedEvidenceItem {
  const kind = typeof raw?.kind === "string" ? raw.kind : "";
  const ref = typeof raw?.ref === "string" ? raw.ref : "";
  const hit = ref ? lookup(ref, index) : undefined;
  return {
    kind,
    ref,
    context: kind.toLowerCase() === "wiki" || ref.startsWith("wiki:"),
    resolvable: typeof raw?.resolvable === "boolean" ? raw.resolvable : Boolean(hit),
    // Prefer the caption of the entity we actually found; brain-core's `kind`
    // can disagree with the record (it labels customers "counterparty" too).
    label: hit?.label ?? labelForKind(kind),
    display: hit?.display ?? null,
    amount: hit?.amount ?? null,
    facts: hit?.facts ?? [],
  };
}

/** Pure: enrich one proposal record. Unknown top-level fields pass through. */
export function enrichProposal(raw: Record<string, unknown>, index: EntityIndex): EnrichedProposal {
  const rawEvidence = Array.isArray(raw.evidence) ? (raw.evidence as RawEvidence[]) : [];
  const evidence = rawEvidence.map((e) => resolveEvidenceItem(e, index));
  // Headline: the named party if one resolved, else the first resolved entity.
  // Background citations are excluded — they describe what the agent READ, not
  // what it is proposing about.
  const specific = evidence.filter((e) => e.display && !e.context);
  const party = specific.find((e) => e.label === "Counterparty" || e.label === "Vendor" || e.label === "Customer");
  const subject = party ?? specific[0];
  return {
    ...raw,
    evidence,
    subject: subject?.display ? { label: subject.label, display: subject.display } : null,
  };
}

/** Enrich a page of proposals, building the index once for the whole page. */
export async function enrichProposals(
  token: string,
  proposals: Record<string, unknown>[],
  now: Date = new Date(),
): Promise<EnrichedProposal[]> {
  const hasRefs = proposals.some(
    (p) => Array.isArray(p.evidence) && (p.evidence as RawEvidence[]).some((e) => typeof e?.ref === "string" && e.ref),
  );
  // Nothing to join against: skip five upstream round-trips entirely.
  const index: EntityIndex = hasRefs ? await buildEntityIndex(token, now) : new Map();
  return proposals.map((p) => enrichProposal(p, index));
}
