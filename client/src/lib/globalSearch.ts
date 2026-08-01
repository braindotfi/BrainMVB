/**
 * Global search — matching and ranking.
 *
 * One bar over three things the operator already has on screen somewhere:
 * decisions, vendors, accounts. There is no index and no service; every result
 * is projected from a feed the app has already read, which is why this module
 * takes plain shapes rather than talking to react-query. That keeps the part
 * worth arguing about — what matches, and in what order — testable without a DOM.
 *
 * Matching deliberately reuses `decisionFilters.matchesQuery`, the same AND-across-
 * terms rule the Decisions page has always used. A global bar that ranked or
 * tokenised differently from the in-page search directly beneath it would be two
 * behaviours wearing one label.
 */

import { buildSearchText, matchesQuery } from "@/lib/decisionFilters";

export type SearchResultKind = "decision" | "vendor" | "account";

export const KIND_LABEL: Record<SearchResultKind, string> = {
  decision: "Decision",
  vendor: "Vendor",
  account: "Account",
};

/** Ties are broken in this order, so a mixed result set reads consistently. */
const KIND_ORDER: readonly SearchResultKind[] = ["decision", "vendor", "account"];

/** The mock caps at six. More than that stops being a shortcut and becomes a page. */
export const MAX_RESULTS = 6;

export interface SearchResult {
  /** Record id — also the cmdk key, so it must be unique across kinds. */
  key: string;
  id: string;
  kind: SearchResultKind;
  label: string;
  /** Secondary line: what makes two similarly-named records tell-apart-able. */
  detail: string | null;
  /** Canonical destination. Vendors additionally route through openVendorDetail. */
  href: string;
  /** Pre-lowercased haystack. */
  search: string;
}

/* ── builders ─────────────────────────────────────────────────────────────── */

export interface DecisionLike {
  id: string;
  title: string;
  detail?: string | null;
  /** Agent name, type key — matched but not shown. */
  extra?: string | null;
}

export function decisionResult(d: DecisionLike): SearchResult {
  return {
    key: `decision:${d.id}`,
    id: d.id,
    kind: "decision",
    label: d.title,
    detail: d.detail ?? null,
    /* InboxPage already reads `?proposal=` — no new entry point. */
    href: `/decisions?proposal=${encodeURIComponent(d.id)}`,
    search: buildSearchText(d.title, d.detail, d.extra),
  };
}

export interface VendorLike {
  id: string;
  name: string;
  category?: string | null;
}

export function vendorResult(v: VendorLike): SearchResult {
  return {
    key: `vendor:${v.id}`,
    id: v.id,
    kind: "vendor",
    label: v.name,
    detail: v.category ?? null,
    href: `/ledger?tab=vendors&vendor=${encodeURIComponent(v.id)}`,
    search: buildSearchText(v.name, v.category),
  };
}

export interface AccountLike {
  id: string;
  name: string;
  institution?: string | null;
  kindLabel?: string | null;
}

export function accountResult(a: AccountLike): SearchResult {
  const detail = a.institution ?? a.kindLabel ?? null;
  return {
    key: `account:${a.id}`,
    id: a.id,
    kind: "account",
    label: a.name,
    detail,
    href: `/ledger?tab=accounts&account=${encodeURIComponent(a.id)}`,
    search: buildSearchText(a.name, a.institution, a.kindLabel),
  };
}

/* ── ranking ──────────────────────────────────────────────────────────────── */

/**
 * Lower is better.
 *
 * Rank on the LABEL, because that is the string the user is looking at and
 * typing toward. A record that matched only on hidden text (an agent name, an
 * account type) is still a legitimate hit but must not outrank a visible
 * prefix match, or the list looks arbitrary.
 */
function score(result: SearchResult, query: string): number {
  const label = result.label.toLowerCase();
  const q = query.toLowerCase().trim();
  if (q === "") return 3;
  if (label.startsWith(q)) return 0;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label)) return 1;
  if (label.includes(q)) return 2;
  return 3;
}

/**
 * Filter to matches, then order by relevance.
 *
 * An empty query returns nothing rather than everything. The mock opens on focus
 * and shows the first six records, but "the first six things in your ledger" is
 * not an answer to a question the user asked, and presenting it as a result list
 * implies a ranking that does not exist. Documented deviation.
 *
 * The sort is stable on the incoming order, so each source's own ordering (queue
 * order, account order) survives inside a score band.
 */
export function rankResults(
  all: readonly SearchResult[],
  query: string,
  limit: number = MAX_RESULTS,
): SearchResult[] {
  if (query.trim() === "") return [];
  return all
    .filter((r) => matchesQuery(r.search, query))
    .map((r, i) => ({ r, i, s: score(r, query) }))
    .sort(
      (a, b) =>
        a.s - b.s ||
        KIND_ORDER.indexOf(a.r.kind) - KIND_ORDER.indexOf(b.r.kind) ||
        a.i - b.i,
    )
    .slice(0, limit)
    .map((x) => x.r);
}
