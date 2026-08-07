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
  brainRequest,
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
  /** The bare business identifier ("AR-MIDMARKET-001"), when the record has one
   *  distinct from its display name. Lets the card headline read as the document
   *  number a human would quote, without re-parsing `display`. */
  code: string | null;
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

/** A `presentation.key_facts` row after id resolution. */
export interface ResolvedKeyFact {
  label: string;
  value: string;
  /** True when the primary card view must NOT show this row: it is an identifier
   *  column, or a raw id nothing in the index could name. */
  technical?: boolean;
  /** The original id, when `value` is the name we resolved it to. */
  ref?: string | null;
}

export interface EnrichedProposal {
  evidence: EnrichedEvidenceItem[];
  /** The headline entity a human would name this card by, if one resolved. */
  subject: { label: string; display: string } | null;
  /** `presentation.key_facts` with ids resolved to names. Absent when the record
   *  carries no key facts — never an empty-but-present contract. */
  key_facts?: ResolvedKeyFact[];
  [key: string]: unknown;
}

interface IndexedEntity {
  label: string;
  display: string;
  code: string | null;
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

/* ── Entity mappers ───────────────────────────────────────────────────────────
 *
 * Shared by BOTH index paths: the bulk list pass below and the targeted by-id
 * hydration further down. They are deliberately loose about their input shape so
 * the same mapper can take either the client's parsed list row or the raw record
 * a `/ledger/<collection>/{id}` read returns.
 */

interface RawCounterparty { id?: unknown; name?: unknown; display_name?: unknown }
interface RawInvoice {
  id?: unknown; invoice_number?: unknown; counterparty_id?: unknown;
  amount_due?: unknown; currency?: unknown; due_date?: unknown; status?: unknown;
  metadata?: { po?: unknown } | null;
}
interface RawTransaction {
  id?: unknown; counterparty_id?: unknown; direction?: unknown; transaction_date?: unknown;
  status?: unknown; description_normalized?: unknown; description_raw?: unknown;
  amount?: unknown; currency?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function counterpartyEntity(c: RawCounterparty): IndexedEntity | null {
  const name = str(c.display_name) ?? str(c.name);
  if (!name) return null;
  return { label: "Counterparty", display: name, code: null, amount: null, facts: [] };
}

function invoiceEntity(inv: RawInvoice, cpName: string | undefined, now: Date): IndexedEntity | null {
  const number = str(inv.invoice_number);
  const facts: EvidenceFact[] = [];
  if (cpName) facts.push({ label: "Counterparty", value: cpName });
  facts.push(...dueFacts(str(inv.due_date), now));
  const status = str(inv.status);
  if (status) facts.push({ label: "Status", value: titleCase(status) });
  if (inv.metadata?.po != null) facts.push({ label: "PO", value: String(inv.metadata.po) });
  const currency = str(inv.currency);
  return {
    label: "Invoice",
    display: number ? `Invoice #${number}` : "Invoice",
    code: number,
    amount: inv.amount_due != null && currency ? { value: String(inv.amount_due), currency } : null,
    facts,
  };
}

function transactionEntity(t: RawTransaction, cpName: string | undefined, now: Date): IndexedEntity | null {
  void now;
  const facts: EvidenceFact[] = [];
  if (cpName) facts.push({ label: "Counterparty", value: cpName });
  const direction = str(t.direction);
  if (direction) facts.push({ label: "Direction", value: titleCase(direction) });
  const dated = formatDate(str(t.transaction_date));
  if (dated) facts.push({ label: "Date", value: dated });
  const status = str(t.status);
  if (status) facts.push({ label: "Status", value: titleCase(status) });
  const desc = str(t.description_normalized) ?? str(t.description_raw);
  const currency = str(t.currency);
  return {
    label: "Transaction",
    // Fall back to the party + direction rather than echoing the raw id.
    display: desc ?? (cpName ? `${cpName} ${direction ?? ""}`.trim() : titleCase(String(direction ?? "Transaction"))),
    code: null,
    amount: t.amount != null && currency ? { value: String(t.amount), currency } : null,
    facts,
  };
}

/* ── Index construction ───────────────────────────────────────────────────── */

/**
 * Fetch the tenant's reference data and build one id → entity index.
 *
 * Every leg is allSettled: a proposal card that shows resolved names for the
 * entities we could read plus raw ids for the rest is strictly better than a
 * 502, and these are independent upstream calls.
 *
 * This bulk pass is an OPTIMISTIC PREFETCH, not the guarantee of resolution.
 * brain-core caps these collections server-side (`/ledger/counterparties`
 * returns 20 rows however large `limit` is), so on a tenant with more records
 * than one page the cited entity may simply not be here. `hydrateMissingRefs`
 * below closes that gap by fetching the specific refs that missed.
 */
export async function buildEntityIndex(token: string, now: Date = new Date()): Promise<EntityIndex> {
  const [accounts, cps, invoices, obligations, members, transactions] = await Promise.allSettled([
    listLedgerAccounts(token, { limit: 100 }, BULK_TIMEOUT_MS),
    listLedgerCounterparties(token, undefined, BULK_TIMEOUT_MS),
    listLedgerInvoices(token, { limit: 100 }, BULK_TIMEOUT_MS),
    listObligations(token, { limit: 100 }, BULK_TIMEOUT_MS),
    listMembers(token, undefined, BULK_TIMEOUT_MS),
    listLedgerTransactions(token, { limit: 200 }, BULK_TIMEOUT_MS),
  ]);

  const index: EntityIndex = new Map();

  // Counterparty names are needed by invoice/obligation rows below, so index first.
  const cpNames = new Map<string, string>();
  if (cps.status === "fulfilled") {
    for (const c of cps.value.counterparties ?? []) {
      if (!c?.id) continue;
      const entity = counterpartyEntity(c);
      if (!entity) continue;
      cpNames.set(c.id, entity.display);
      index.set(c.id, entity);
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
        code: null,
        amount: a.current_balance != null ? { value: String(a.current_balance), currency: a.currency } : null,
        facts,
      });
    }
  }

  if (invoices.status === "fulfilled") {
    for (const inv of invoices.value.invoices ?? []) {
      if (!inv?.id) continue;
      const entity = invoiceEntity(inv, inv.counterparty_id ? cpNames.get(inv.counterparty_id) : undefined, now);
      if (entity) index.set(inv.id, entity);
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
        code: null,
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
      const entity = transactionEntity(t, t.counterparty_id ? cpNames.get(t.counterparty_id) : undefined, now);
      if (entity) index.set(t.id, entity);
    }
  }

  if (members.status === "fulfilled") {
    for (const m of members.value?.members ?? []) {
      if (!m?.id) continue;
      const facts: EvidenceFact[] = [];
      if (m.role) facts.push({ label: "Role", value: titleCase(m.role) });
      if (m.email) facts.push({ label: "Email", value: m.email });
      index.set(m.id, { label: "Team member", display: m.displayName, code: null, amount: null, facts });
    }
  }

  return index;
}

/* ── Targeted hydration of refs the bulk pass missed ──────────────────────── */

/**
 * Collections a ref can be fetched from individually. brain-core exposes
 * `GET /ledger/<collection>/{id}` for these three; `/ledger/obligations/{id}` is
 * NOT routed (404), so obligations resolve only via the bulk pass above.
 */
const BY_ID_COLLECTIONS = ["counterparties", "invoices", "transactions"] as const;
type ByIdCollection = (typeof BY_ID_COLLECTIONS)[number];

/** `kind` → collection. Only used to choose an endpoint for a bare ref; a wrong
 *  guess costs one 404 and the ref stays raw, exactly as before. */
const KIND_COLLECTION: Record<string, ByIdCollection> = {
  counterparty: "counterparties",
  customer: "counterparties",
  vendor: "counterparties",
  invoice: "invoices",
  transaction: "transactions",
};

/**
 * Bound on individual reads per proposals page. A page of cards citing hundreds
 * of unresolved refs must not turn one review-queue load into hundreds of
 * upstream round-trips; past this cap the remainder stay raw ids.
 */
const MAX_TARGETED_LOOKUPS = 24;

/**
 * Time budgets. Enrichment is a nice-to-have that runs while the review queue
 * request is blocked on it, so it must be impossible for a slow upstream to
 * hold the queue open: each by-id read is aborted at `BY_ID_TIMEOUT_MS`, and
 * the whole join gives up at `ENRICHMENT_BUDGET_MS` and serves what it has.
 */
const BULK_TIMEOUT_MS = 4_000;
const BY_ID_TIMEOUT_MS = 3_000;
const ENRICHMENT_BUDGET_MS = 6_000;

/** Resolve to `fallback` if `work` has not settled within `ms`. */
async function withBudget<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), Math.max(ms, 0));
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    // Without this the pending timer keeps the event loop busy after we answer.
    if (timer) clearTimeout(timer);
  }
}

/** The ledger id inside a ref, for both spellings (`cp_…`, `wiki:/counterparties/cp_…`). */
function refId(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

/**
 * Which collection to fetch a ref from, WITHOUT parsing the ULID prefix.
 *
 * Two honest sources, in order: the wiki URI names its own collection
 * (`wiki:/counterparties/cp_…`), and failing that brain-core's declared `kind`.
 * A ref with neither is left alone rather than brute-forced across every
 * endpoint — see the header note on why prefix tables are not used.
 */
function wikiCollection(ref: string): ByIdCollection | null {
  const wiki = /^wiki:\/([^/]+)\//.exec(ref);
  return wiki && (BY_ID_COLLECTIONS as readonly string[]).includes(wiki[1])
    ? (wiki[1] as ByIdCollection)
    : null;
}

function collectionForRef(ref: string, kind: string): ByIdCollection | null {
  return wikiCollection(ref) ?? KIND_COLLECTION[kind?.toLowerCase?.() ?? ""] ?? null;
}

async function fetchById(token: string, collection: ByIdCollection, id: string): Promise<Record<string, unknown> | null> {
  try {
    return await brainRequest<Record<string, unknown>>(`/ledger/${collection}/${encodeURIComponent(id)}`, {
      token,
      timeoutMs: BY_ID_TIMEOUT_MS,
    });
  } catch {
    // A 404 here is ordinary: the kind-derived guess can be wrong, and a ref can
    // point at a record this member's scopes cannot read. Stay raw, never throw.
    return null;
  }
}

/**
 * Fill in the refs the bulk index missed by reading them individually.
 *
 * This is what makes resolution independent of brain-core's page caps: before
 * it, a tenant whose cited invoice sat outside the first 20 counterparties /
 * first page of invoices rendered a card with no subject, no detail rows, and
 * nothing but raw ids under "Technical reference".
 *
 * Mutates `index` in place. Never throws — every failure leaves the ref raw.
 */
export async function hydrateMissingRefs(
  token: string,
  refs: { ref: string; kind: string }[],
  index: EntityIndex,
  now: Date = new Date(),
): Promise<void> {
  // Dedupe by ledger id: the same entity is routinely cited twice per proposal
  // (once bare, once as a wiki URI) and again across sibling proposals.
  const wanted = new Map<string, { collection: ByIdCollection; fromWiki: boolean }>();
  for (const { ref, kind } of refs) {
    if (!ref) continue;
    const id = refId(ref);
    if (index.has(ref) || index.has(id)) continue;
    const wiki = wikiCollection(ref);
    const existing = wanted.get(id);
    // The same id arrives both bare and as a wiki URI. The URI names its own
    // collection, so it always wins over the `kind` guess — first-seen-wins
    // would let a mislabelled bare ref send us to the wrong endpoint and
    // "resolve" to a 404, leaving the ref raw for no reason.
    if (existing && (existing.fromWiki || !wiki)) continue;
    const collection = wiki ?? collectionForRef(ref, kind);
    if (collection) wanted.set(id, { collection, fromWiki: Boolean(wiki) });
  }
  if (wanted.size === 0) return;

  const batch = Array.from(wanted).slice(0, MAX_TARGETED_LOOKUPS);
  const fetched = await Promise.all(
    batch.map(async ([id, { collection }]) => ({ id, collection, record: await fetchById(token, collection, id) })),
  );

  // Second round: an invoice/transaction names its counterparty by id, so fetch
  // any of those we still cannot name. Bounded by the same cap.
  const missingCps = new Set<string>();
  for (const { collection, record } of fetched) {
    if (!record || collection === "counterparties") continue;
    const cpId = str((record as RawInvoice).counterparty_id);
    if (cpId && !index.has(cpId)) missingCps.add(cpId);
  }
  const cpRecords = await Promise.all(
    Array.from(missingCps)
      .slice(0, MAX_TARGETED_LOOKUPS)
      .map(async (id) => ({ id, record: await fetchById(token, "counterparties", id) })),
  );
  for (const { id, record } of cpRecords) {
    if (!record) continue;
    const entity = counterpartyEntity(record as RawCounterparty);
    if (entity) index.set(id, entity);
  }

  const cpNameFor = (cpId: string | null): string | undefined =>
    cpId ? index.get(cpId)?.display : undefined;

  for (const { id, collection, record } of fetched) {
    if (!record) continue;
    let entity: IndexedEntity | null = null;
    if (collection === "counterparties") {
      entity = counterpartyEntity(record as RawCounterparty);
    } else if (collection === "invoices") {
      const inv = record as RawInvoice;
      entity = invoiceEntity(inv, cpNameFor(str(inv.counterparty_id)), now);
    } else {
      const t = record as RawTransaction;
      entity = transactionEntity(t, cpNameFor(str(t.counterparty_id)), now);
    }
    if (entity) index.set(id, entity);
  }
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
    code: hit?.code ?? null,
    amount: hit?.amount ?? null,
    facts: hit?.facts ?? [],
  };
}

/* ── presentation.key_facts ───────────────────────────────────────────────────
   brain-core writes ids straight into the card's fact table: a subscription's
   "Merchant" is a bare `cp_…`, a fraud finding's "Transaction Id" a bare `tx_…`.
   Rendering those verbatim is exactly the failure the evidence resolver above
   exists to prevent, so the same index is applied to the fact values. */

/** Shape-matched, not prefix-matched — see the module header. */
const RAW_ID_RE = /^(?:[a-z][a-z0-9]{0,11}_)?[0-9A-HJKMNP-TV-Z]{26}$/i;

function isRawId(value: string): boolean {
  return value.startsWith("wiki:") || RAW_ID_RE.test(value);
}

/** A label naming an identifier column: "Transaction Id", "Policy Decision Id". */
function isIdLabel(label: string): boolean {
  return /\bids?\b/i.test(label);
}

/** Drop the trailing "Id" once the value is a NAME: "Transaction Id" captioning
 *  "WIRE Transfer Out" reads as a mistake. */
function labelWithoutId(label: string): string {
  return label.replace(/\s*\bids?\b\s*$/i, "").trim() || label;
}

/** Ids cited by a record's key facts, so targeted hydration can fetch the ones the
 *  bulk index missed (a merchant outside the first counterparty page, say). */
export function keyFactRefs(raw: Record<string, unknown>): { ref: string; kind: string }[] {
  const presentation = raw.presentation as Record<string, unknown> | undefined;
  const facts = Array.isArray(presentation?.key_facts) ? (presentation!.key_facts as Record<string, unknown>[]) : [];
  const refs: { ref: string; kind: string }[] = [];
  for (const fact of facts) {
    const value = typeof fact?.value === "string" ? fact.value.trim() : "";
    if (value && isRawId(value)) {
      // No kind is available here; collectionForRef falls back to the wiki path
      // when the value is a URI, and to nothing otherwise — the id still gets a
      // chance through the bulk index.
      refs.push({ ref: value, kind: typeof fact?.label === "string" ? String(fact.label).toLowerCase() : "" });
    }
  }
  return refs;
}

/**
 * Ids embedded in the record's PROSE (`narrative`, `presentation.headline`).
 *
 * brain-core writes these sentences straight off the record, so they read
 * "Compliance review for inv_01KYS8RK94… found policy_violation" — a raw id in the
 * exact place a human reads first. The ids are collected here so the same index
 * that captions evidence can name them, and so targeted hydration fetches the ones
 * the bulk index missed.
 */
export function textRefs(raw: Record<string, unknown>): { ref: string; kind: string }[] {
  const presentation = raw.presentation as Record<string, unknown> | undefined;
  const sources = [raw.narrative, presentation?.headline].filter((s): s is string => typeof s === "string");
  const refs: { ref: string; kind: string }[] = [];
  for (const text of sources) {
    for (const token of text.split(/[\s,;:.!?()[\]]+/)) {
      if (token && isRawId(token)) refs.push({ ref: token, kind: "" });
    }
  }
  return refs;
}

/** Pure: name every id the record's prose mentions, for the client to substitute.
 *  Only ids that RESOLVED appear here; the client drops the rest rather than
 *  printing them. Absent when the prose cites nothing. */
export function resolveTextRefs(raw: Record<string, unknown>, index: EntityIndex): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const { ref } of textRefs(raw)) {
    if (out[ref]) continue;
    const hit = lookup(ref, index);
    if (hit?.display) out[ref] = hit.display;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Pure: resolve one proposal's key facts against the index. Unit-tested. */
export function resolveKeyFacts(raw: Record<string, unknown>, index: EntityIndex): ResolvedKeyFact[] | undefined {
  const presentation = raw.presentation as Record<string, unknown> | undefined;
  if (!presentation || !Array.isArray(presentation.key_facts)) return undefined;

  const resolved: ResolvedKeyFact[] = [];
  for (const fact of presentation.key_facts as Record<string, unknown>[]) {
    const label = typeof fact?.label === "string" ? fact.label.trim() : "";
    if (!label) continue;
    const rawValue = fact?.value == null ? "" : String(fact.value).trim();
    if (!rawValue) continue;

    if (isRawId(rawValue)) {
      const hit = lookup(rawValue, index);
      if (hit?.display) {
        // Resolved: it is now a fact a human reads, so it earns the card face.
        resolved.push({ label: labelWithoutId(label), value: hit.display, ref: rawValue });
      } else {
        // Unresolved id — keep it, but only for the technical section.
        resolved.push({ label, value: rawValue, technical: true, ref: rawValue });
      }
      continue;
    }
    resolved.push({ label, value: rawValue, technical: isIdLabel(label) || undefined });
  }
  return resolved;
}

/** Pure: enrich one proposal record. Unknown top-level fields pass through. */
export function enrichProposal(raw: Record<string, unknown>, index: EntityIndex): EnrichedProposal {
  const rawEvidence = Array.isArray(raw.evidence) ? (raw.evidence as RawEvidence[]) : [];
  const evidence = rawEvidence.map((e) => resolveEvidenceItem(e, index));
  const keyFacts = resolveKeyFacts(raw, index);
  const textRefMap = resolveTextRefs(raw, index);
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
    ...(keyFacts ? { key_facts: keyFacts } : {}),
    ...(textRefMap ? { resolved_refs: textRefMap } : {}),
  };
}

/** Enrich a page of proposals, building the index once for the whole page. */
export async function enrichProposals(
  token: string,
  proposals: Record<string, unknown>[],
  now: Date = new Date(),
): Promise<EnrichedProposal[]> {
  const cited: { ref: string; kind: string }[] = [];
  for (const p of proposals) {
    // Key facts cite ids the evidence list does not always repeat (a subscription
    // names its merchant only in the fact table), so both are hydrated.
    cited.push(...keyFactRefs(p), ...textRefs(p));
    if (!Array.isArray(p.evidence)) continue;
    for (const e of p.evidence as RawEvidence[]) {
      if (typeof e?.ref === "string" && e.ref) {
        cited.push({ ref: e.ref, kind: typeof e.kind === "string" ? e.kind : "" });
      }
    }
  }
  // Nothing to join against: skip the upstream round-trips entirely.
  if (cited.length === 0) return proposals.map((p) => enrichProposal(p, new Map()));

  // Hard deadline across both upstream phases. Whatever is resolved by then is
  // used; the rest stay raw ids. A degraded card beats a hung review queue.
  const deadline = Date.now() + ENRICHMENT_BUDGET_MS;
  const index = await withBudget(
    buildEntityIndex(token, now).catch(() => new Map() as EntityIndex),
    ENRICHMENT_BUDGET_MS,
    new Map() as EntityIndex,
  );
  // Close the page-cap gap before resolving; failures here leave refs raw.
  await withBudget(
    hydrateMissingRefs(token, cited, index, now).catch(() => {}),
    deadline - Date.now(),
    undefined,
  );
  return proposals.map((p) => enrichProposal(p, index));
}
