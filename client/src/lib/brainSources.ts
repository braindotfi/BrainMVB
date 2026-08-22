/* ── brain-core connected sources (GET /v1/sources) ───────────────────────────
   brain-core keeps its own registry of CONNECTOR sources (Plaid, Stripe, Finch,
   Merge, Alchemy wallets, inbound-email tax returns). That registry is separate
   from BrainMVB's three local surfaces (bank_connections, tool_connections,
   uploaded documents) - uploading a document through /raw/ingest does NOT create
   a brain-core source, and connecting Stripe through BrainMVB writes only local
   storage. The two populations are disjoint today; see categoryCounts() for the
   dedupe rule that keeps them disjoint if that ever changes.

   Historical provenance rows are real upstream records but are not live
   connections. They use status `historical` and carry metadata that prevents
   sync and disconnect controls:

     disconnectable:    false
     disconnect_hidden: true
     sync_disabled:     true

   The disconnect affordance is hidden for those rows. They render separately
   from connected accounts with an explicit no-live-connection label.

   Parsing is defensive on purpose: these rows reach the UI through the BFF's
   generic GET passthrough, which relays brain-core's response verbatim without
   normalising it. Nothing here may assume a field exists. */

import type { CategoryId } from "./sourceCategories";

export interface BrainSourceMetadata {
  /** Upstream says this connection cannot be severed by the tenant. */
  disconnectable?: boolean;
  /** Upstream says: render no disconnect affordance at all. */
  disconnect_hidden?: boolean;
  /** Upstream says: offer no manual re-sync. */
  sync_disabled?: boolean;
  [key: string]: unknown;
}

export interface BrainSource {
  id: string;
  /** Connector type: "plaid" | "stripe" | "finch" | "merge" | "alchemy" | "email_inbound" | … */
  type: string;
  /** Lowercased upstream status; "" when upstream omitted it. */
  status: string;
  /** ISO timestamp of the connector's last successful sync, or null when upstream
      omitted it. Only brain-core sources carry this; BrainMVB's own bank and tool
      connections know when they were CONNECTED and nothing more, so a row without
      this field must never be captioned as recently synced. */
  lastSyncedAt: string | null;
  /** Upstream's own verdict on that timestamp ("fresh" | "stale" | …), lowercased.
      Kept verbatim rather than recomputed from lastSyncedAt: only brain-core knows
      the expected sync cadence for a given connector. */
  freshness: string | null;
  metadata: BrainSourceMetadata;
}

/** Connector type → the Add-a-Source category its badge counts under.
 *
 *  Both the bare and the qualified spellings are listed on purpose: the seeded registry
 *  emits `merge_accounting` / `alchemy_wallet`, while the shorter forms appear elsewhere.
 *  Verified against a real seeded tenant 2026-07-29 - the live rows are plaid, stripe,
 *  finch, merge_accounting, alchemy_wallet, email_inbound. */
export const SOURCE_TYPE_CATEGORY: Readonly<Record<string, CategoryId>> = {
  plaid: "bank",
  alchemy: "crypto",
  alchemy_wallet: "crypto",
  merge: "accounting",
  merge_accounting: "accounting",
  finch: "payroll",
  stripe: "payments",
  email_inbound: "tax",
};

/** Upstream's own taxonomy (metadata.source_category) → our category. FALLBACK ONLY:
 *  the type map above wins, because it encodes our product's deliberate placement (e.g.
 *  the tax mailbox counts under Tax, not Documents, even though upstream files it as
 *  `documents_email`). This exists so an unrecognised future connector type still lands
 *  somewhere sensible instead of defaulting to Documents. */
const SOURCE_CATEGORY_ALIASES: Readonly<Record<string, CategoryId>> = {
  banking_cash: "bank",
  digital_assets: "crypto",
  accounting_erp: "accounting",
  payroll_hr: "payroll",
  payments_revenue: "payments",
  documents_email: "documents",
  tax_records: "tax",
};

/** Fallback display names. Real metadata (below) wins whenever upstream sends it. */
const SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  plaid: "Bank Account",
  alchemy: "Crypto Wallet",
  alchemy_wallet: "Crypto Wallet",
  merge: "Accounting",
  merge_accounting: "Accounting",
  finch: "Payroll",
  stripe: "Stripe",
  email_inbound: "Tax Return",
};

/** Statuses that mean "this is no longer a source" - everything else is shown. */
const DEAD_STATUSES = new Set(["disconnected", "revoked", "deleted"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

/**
 * Normalise `GET /v1/sources`. Accepts the documented `{ data, next_cursor }`
 * envelope and a bare array, and drops any row without a usable id + type rather
 * than rendering a source we cannot act on. Returns [] for anything unparseable
 * (including an error body relayed by the BFF).
 */
export function parseBrainSources(raw: unknown): BrainSource[] {
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : isPlainObject(raw) && Array.isArray(raw.data)
      ? raw.data
      : [];

  const out: BrainSource[] = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const id = readString(row, "id", "source_id");
    const type = readString(row, "type", "source_type");
    if (!id || !type) continue;
    out.push({
      id,
      type: type.toLowerCase(),
      status: (readString(row, "status") ?? "").toLowerCase(),
      lastSyncedAt: readString(row, "last_synced_at", "lastSyncedAt"),
      freshness: (readString(row, "freshness") ?? "").toLowerCase() || null,
      // Arrays are objects too - an array metadata would make every `.foo` read
      // undefined and silently defeat the disconnect checks below.
      metadata: isPlainObject(row.metadata) ? (row.metadata as BrainSourceMetadata) : {},
    });
  }
  return out;
}

/** A source still worth showing. Historical rows are split from live rows by the caller. */
export function isConnectedBrainSource(s: BrainSource): boolean {
  return !DEAD_STATUSES.has(s.status);
}

/** A provenance row that explicitly does not represent a live connection. */
export function isHistoricalBrainSource(s: BrainSource): boolean {
  return s.status === "historical";
}

/**
 * True when the disconnect affordance must not be rendered at all.
 *
 * Strict comparisons matter: a real tenant's source carries neither key, so both
 * reads are `undefined`, neither test fires, and the control shows as normal.
 * Only an explicit `disconnect_hidden: true` or `disconnectable: false` hides it.
 */
export function isDisconnectHidden(s: BrainSource): boolean {
  return s.metadata.disconnect_hidden === true || s.metadata.disconnectable === false;
}

/**
 * True when upstream says this connection never syncs (seeded demo fixtures carry
 * `sync_disabled: true`). Such a row is permanently "stale" by arithmetic, so its
 * staleness is an artefact of the fixture rather than a problem with the feed, and
 * must not be reported to the user as one.
 */
export function isSyncDisabled(s: BrainSource): boolean {
  return s.metadata.sync_disabled === true;
}

/**
 * Whether a PROVIDER row (the per-category picker, which keys off connector type rather
 * than off an individual source record) must hide its disconnect affordance.
 *
 * A locally-connected tool is always removable: that record is BrainMVB's own and the user
 * can sever it, regardless of whether brain-core happens to carry a restricted seeded row
 * of the same connector type. Only a purely-upstream, metadata-restricted connection hides
 * the control - otherwise a seeded demo row would strip the affordance off a real one.
 */
export function isProviderRemoveHidden(
  providerId: string,
  locallyConnectedToolIds: ReadonlySet<string>,
  undisconnectableTypes: ReadonlySet<string>,
): boolean {
  if (locallyConnectedToolIds.has(providerId)) return false;
  return undisconnectableTypes.has(providerId);
}

/** Category a source's badge counts under. Known connector type first (our deliberate
 *  placement), then upstream's own source_category, then Documents. */
export function categoryForBrainSource(s: BrainSource): CategoryId {
  const byType = SOURCE_TYPE_CATEGORY[s.type];
  if (byType) return byType;
  const upstream = s.metadata.source_category;
  if (typeof upstream === "string") {
    const alias = SOURCE_CATEGORY_ALIASES[upstream.toLowerCase()];
    if (alias) return alias;
  }
  return "documents";
}

/** Human label: upstream metadata first, then a per-type fallback, then the raw type. */
export function brainSourceLabel(s: BrainSource): string {
  const m = s.metadata;
  for (const key of ["display_name", "institution_name", "account_label", "name"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return SOURCE_TYPE_LABELS[s.type] ?? s.type;
}

/** Row subtitle: "Connected" plus a mask/account hint when upstream sent one. */
export function brainSourceSubtitle(s: BrainSource): string {
  const head =
    s.status === "historical"
      ? "Historical import · no live connection"
      : s.status === ""
        ? "Connected"
        : s.status.charAt(0).toUpperCase() + s.status.slice(1);
  const mask = s.metadata.account_mask ?? s.metadata.mask;
  if (typeof mask === "string" && mask.trim() !== "") return `${head} · ····${mask}`;
  return head;
}
