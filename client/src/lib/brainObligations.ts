/**
 * Obligations Brain derived from ingested documents (GET /ledger/obligations).
 *
 * This lives in lib/ rather than inside the connect screens because the wire shape has to be
 * normalized before anything renders it, and that normalization is worth testing on its own.
 */

/** Normalized obligation. Every field is guaranteed - `normalizeObligation` sees to it. */
export type Obligation = {
  id: string;
  direction: string;            // payable | receivable
  /**
   * The record's own KIND — bill | payroll | tax | … — or null when the wire carried
   * no kind. Kept separate from `direction` because `direction` folds `type` in as a
   * fallback for the payable/receivable axis, so it is not a trustworthy kind: today
   * brain-core leaves `direction` null and the kind rides on `type`, but the moment it
   * starts sending a real direction, `direction` would read "Payable" where a row wants
   * "Bill". Never a direction word.
   */
  kind: string | null;
  counterparty_id: string | null;
  amount_due: string;
  currency: string;
  due_date: string | null;
  status: string;
  provenance: string | null;
  confidence: number | null;    // ≤0.5, advisory
};

/**
 * The shape actually on the wire. `/api/brain/ledger/obligations` is served by the GENERIC
 * GET passthrough in server/brain/proxy.ts, so the raw brain-core payload reaches the browser
 * unnormalized. Nothing on it is guaranteed: the payable/receivable flag is carried as `type`
 * on some records and missing on others, and any field may be absent or the wrong type.
 * server/brain/client.ts does normalize this entity, but only on the assistant grounding
 * path, so nothing normalized it for the UI.
 */
export type RawObligation = { [K in keyof Obligation]?: unknown } & { type?: unknown };

export type ObligationsResponse = { obligations: RawObligation[]; next_cursor: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * `amount_due` only, which needs to be more tolerant than `str`.
 *
 * brain-core sends a decimal string ("4800.00000000") today, but a bare `str` coercion
 * turns a NUMBER on the wire into "0" — and this field now feeds the liabilities total
 * on three surfaces, where a silent zero is a false all-clear on money owed. An absent
 * amount still falls back to "0"; a present one is never discarded for being a number.
 */
const amountStr = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};

/**
 * Mirrors the tolerance in server/brain/client.ts's `listObligations`, which normalizes this
 * same entity for the assistant path.
 *
 * Every field is coerced, not just `direction`. A field that merely renders wrong is still a
 * bug: an absent `confidence` slipped past ConfidencePill's `!== null` check and printed
 * "NaN% · needs confirmation", and an absent `amount_due` printed "undefined USD".
 *
 * Unlike the server we deliberately do NOT fall back to a random id. This runs on every
 * refetch, so a fresh uuid each time would change React's keys and remount every row; a
 * composite of the record's own fields stays stable across refetches instead.
 */
/** Values of `type` that are really a direction, not a kind of obligation. */
const DIRECTION_WORDS = new Set(["payable", "receivable"]);

export function normalizeObligation(o: RawObligation): Obligation {
  const amount_due = amountStr(o.amount_due) ?? "0";
  const due_date = str(o.due_date);
  const counterparty_id = str(o.counterparty_id);
  const rawType = str(o.type);
  return {
    id: str(o.id) ?? `synthetic:${counterparty_id ?? "?"}:${due_date ?? "?"}:${amount_due}`,
    direction: str(o.direction) ?? rawType ?? "payable",
    kind: rawType && !DIRECTION_WORDS.has(rawType.trim().toLowerCase()) ? rawType : null,
    counterparty_id,
    amount_due,
    currency: str(o.currency) ?? "USD",
    due_date,
    status: str(o.status) ?? "upcoming",
    provenance: str(o.provenance),
    confidence:
      typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : null,
  };
}

export function isReceivable(o: Obligation): boolean {
  return o.direction.toLowerCase().startsWith("receiv");
}

/** Tolerant fetch: 404 / empty → [] (extraction not available yet), never an infinite spinner. */
export async function fetchObligations(): Promise<Obligation[]> {
  const res = await fetch("/api/brain/ledger/obligations", { credentials: "include" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
  const json = (await res.json()) as ObligationsResponse | RawObligation[] | null;
  const list = Array.isArray(json) ? json : (json?.obligations ?? []);
  return list.filter((o): o is RawObligation => !!o).map(normalizeObligation);
}
