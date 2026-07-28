/**
 * Obligations Brain derived from ingested documents (GET /ledger/obligations).
 *
 * This lives in lib/ rather than inside AddSourceModal because the wire shape has to be
 * normalized before anything renders it, and that normalization is worth testing on its own.
 */

/** Normalized obligation. `direction` is always present - `fetchObligations` guarantees it. */
export type Obligation = {
  id: string;
  direction: string;            // payable | receivable
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
 * unnormalized: the payable/receivable flag is carried as `type` on some records and is
 * missing on others. server/brain/client.ts does normalize this, but only on the assistant
 * grounding path, so nothing normalized it for the UI.
 */
export type RawObligation = Omit<Obligation, "direction"> & {
  direction?: string | null;
  type?: string | null;
};

export type ObligationsResponse = { obligations: RawObligation[]; next_cursor: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Mirrors the tolerance in server/brain/client.ts (`direction ?? type ?? "payable"`).
 *
 * Assuming payable for an obligation that declares nothing is far better than the alternative
 * that shipped: `isReceivable` called `.toLowerCase()` on undefined, which threw inside a
 * `filter` during render and took the entire Found screen down with an error boundary.
 */
export function normalizeObligation(o: RawObligation): Obligation {
  return { ...o, direction: str(o.direction) ?? str(o.type) ?? "payable" };
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
