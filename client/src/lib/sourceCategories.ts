/* ── Source category grouping ──────────────────────────────────────────────────
   The "N connected" badges on the Add Source category picker are derived here, from
   the tenant's REAL connection surfaces: Plaid bank items, tool connections, uploaded
   source documents (GET /api/integrations/documents), and brain-core's own connector
   registry (GET /v1/sources, via brainSources.ts). Nothing in this module invents a
   count - a category with no live source reads 0 and renders no badge.

   Kept out of the connect screens so the grouping rules are unit-testable without
   pulling in React and the modal's icon assets. */

export type CategoryId = "bank" | "crypto" | "accounting" | "payroll" | "tax" | "payments" | "documents";

export const CATEGORY_ORDER: CategoryId[] = ["bank", "crypto", "accounting", "payroll", "payments", "tax", "documents"];

/** Minimal shapes - only the fields the counting rules actually read. */
export interface CountableBank {
  itemId: string;
}
export interface CountableTool {
  toolId: string;
}
export interface CountableDoc {
  category: string | null;
  rawId: string | null;
  extractStatus: string | null;
}
/** A brain-core connector source, already mapped to its category by brainSources.ts. */
export interface CountableBrainSource {
  /** Connector type ("plaid", "stripe", …) - also the dedupe key against local tools. */
  type: string;
  category: CategoryId;
}

/**
 * A document counts as a connected source once brain-core actually holds it (it has a
 * raw_id). "extracting" still counts - the bytes are connected, Brain is just still
 * reading them - but a document that never made it upstream ("pending", "failed") must
 * not be advertised as connected.
 */
export function isConnectedSourceDoc(d: CountableDoc): boolean {
  return d.rawId !== null && d.extractStatus !== "failed" && d.extractStatus !== "pending";
}

/**
 * Badge counts per category. Documents are grouped by their own `category` field - the
 * same vocabulary the upload flow and the demo seed write - so a bank statement shows
 * under Bank and a wallet export under Crypto. An unrecognised or missing category
 * falls through to Documents rather than being silently dropped.
 */
export function categoryCounts(
  banks: readonly CountableBank[],
  tools: readonly CountableTool[],
  docs: readonly CountableDoc[],
  toolCategory: Readonly<Record<string, CategoryId>>,
  brainSources: readonly CountableBrainSource[] = [],
): Record<CategoryId, number> {
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<CategoryId, number>;
  counts.bank += banks.length;
  for (const t of tools) {
    const cat = toolCategory[t.toolId];
    if (cat) counts[cat] += 1;
  }
  for (const d of docs) {
    if (!isConnectedSourceDoc(d)) continue;
    const cat = d.category as CategoryId | null;
    counts[cat !== null && cat in counts ? cat : "documents"] += 1;
  }

  // brain-core connector sources. These are a SEPARATE registry from the three local
  // surfaces above (uploads don't become sources; a locally-connected tool isn't
  // registered upstream), so today the two populations never overlap. The dedupe key
  // below keeps the badge honest if that ever changes - one real connector must count
  // once, whichever side we learned about it from, and the local record wins because
  // it is the one the user can actually act on.
  const localConnectorKeys = new Set<string>(tools.map((t) => t.toolId));
  if (banks.length > 0) localConnectorKeys.add("plaid");
  for (const s of brainSources) {
    if (localConnectorKeys.has(s.type)) continue;
    counts[s.category] += 1;
  }
  return counts;
}
