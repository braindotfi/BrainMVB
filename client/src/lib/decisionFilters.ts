/**
 * Decisions — filter facets for the single timeline.
 *
 * The v6 prototype replaces the Inbox's six tabs with ONE list plus three
 * dropdowns and a search box. Tabs and filters are not the same thing: tabs are
 * mutually exclusive and hide the rest of the queue, whereas a priority, a status
 * and a type are independent facets of the same row. "Approved collections" was
 * unreachable under tabs; it is one selection here.
 *
 * This module owns the facets and the filtering. It is pure and separate from the
 * page so the mapping can be tested without rendering — the page has no component
 * tests, and this is the part where a wrong mapping silently hides rows.
 */

import type { ProposalTier } from "./proposalTiers";

/**
 * Row grouping in the timeline.
 *
 * `decided` is NOT a priority tier — `proposalTiers.ts` owns those and deliberately
 * has only three. It is a presentation grouping for records whose decision is
 * already made, which the prototype renders at the end of the list with no accent
 * border. Keeping it out of `ProposalTier` is what stops it leaking into Overview's
 * tier logic, where it would be meaningless.
 */
export type RowTier = ProposalTier | "decided";

/** Fixed render order: what needs attention first, history last. */
export const ROW_TIER_ORDER: readonly RowTier[] = ["urgent", "waiting", "insight", "decided"] as const;

/** Priority filter options, labelled as the rest of the app labels these tiers.
 *  (The prototype says "Action needed" / "Informational"; we keep Overview's
 *  wording so one taxonomy covers both surfaces.) */
export const PRIORITY_OPTIONS: readonly { value: RowTier; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "waiting", label: "Waiting on you" },
  { value: "insight", label: "Insights" },
  { value: "decided", label: "Already decided" },
] as const;

export type DecisionStatus = "pending" | "approved" | "auto-approved" | "declined" | "informational";

export const STATUS_OPTIONS: readonly { value: DecisionStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "auto-approved", label: "Auto-approved" },
  { value: "declined", label: "Rejected" },
  { value: "informational", label: "Acknowledged" },
] as const;

/**
 * Display names for the proposal/record types we have actually seen.
 *
 * Anything absent falls back to a humanised form of the raw key rather than being
 * dropped or relabelled "Other": brain-core adds types without telling the client,
 * and a row filed under a wrong-but-tidy label is worse than one under an ugly
 * accurate one. The dropdown is built from the types PRESENT in the data, so an
 * unknown key shows up as itself instead of silently vanishing.
 */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  payment: "Payments",
  collections: "Collections",
  treasury: "Treasury",
  fraud_anomaly: "Fraud",
  fraud: "Fraud",
  vendor_risk: "Vendor risk",
  cash_forecast: "Cash forecast",
  cash_flow: "Cash forecast",
  reconciliation: "Close / reconciliation",
  compliance: "Compliance",
  subscription: "Subscriptions",
  dispute: "Disputes",
  revenue_intel: "Revenue",
  rule: "Rule changes",
};

export function decisionTypeLabel(type: string): string {
  const known = TYPE_LABELS[type];
  if (known) return known;
  const cleaned = type.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Other";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** The facets every timeline row carries. */
export interface DecisionFacets {
  tier: RowTier;
  status: DecisionStatus;
  /** Canonical type key (raw, not the label) — the dropdown maps it for display. */
  type: string;
  /** Everything the search box matches against, already lowercased. */
  search: string;
}

export interface DecisionFilterState {
  priority: RowTier | "all";
  status: DecisionStatus | "all";
  type: string | "all";
  query: string;
}

export const EMPTY_FILTERS: DecisionFilterState = {
  priority: "all",
  status: "all",
  type: "all",
  query: "",
};

export function hasActiveFilter(f: DecisionFilterState): boolean {
  return f.priority !== "all" || f.status !== "all" || f.type !== "all" || f.query.trim() !== "";
}

/** Build the search haystack once, at row-build time. */
export function buildSearchText(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Every term must match (AND), so typing more words narrows rather than widens.
 * An all-whitespace query matches everything instead of nothing.
 */
export function matchesQuery(search: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((t) => search.includes(t));
}

export function matchesFilters(row: DecisionFacets, f: DecisionFilterState): boolean {
  if (f.priority !== "all" && row.tier !== f.priority) return false;
  if (f.status !== "all" && row.status !== f.status) return false;
  if (f.type !== "all" && row.type !== f.type) return false;
  return matchesQuery(row.search, f.query);
}

/** Filter, then order by tier. Order within a tier is preserved, so each source's
 *  own ordering (queue order, audit recency) survives. */
export function applyDecisionFilters<T extends DecisionFacets>(rows: readonly T[], f: DecisionFilterState): T[] {
  const kept = rows.filter((r) => matchesFilters(r, f));
  return ROW_TIER_ORDER.flatMap((tier) => kept.filter((r) => r.tier === tier));
}

/**
 * Type dropdown options, built from the rows actually present.
 *
 * The prototype hardcodes eight types. Most match nothing on a real tenant, and an
 * option that can only ever return "no results" teaches the user the filter is
 * broken. Sorted by label so the list is stable as data changes.
 */
export function typeOptions(rows: readonly DecisionFacets[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  for (const r of rows) if (r.type) seen.add(r.type);
  return [...seen]
    .map((value) => ({ value, label: decisionTypeLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
