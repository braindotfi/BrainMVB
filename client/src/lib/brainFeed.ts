import type { Proposal } from "@/lib/proposalTypes";

/* ── Shared source of truth for the Activity feed ──────────────────────────────
   The Activity page's "Brain Did" tab renders off the data declared here.
   (The Home page's "Brain Did" widget moved to a live brain-core read in
   Phase 1b — see client/src/lib/brainAudit.ts's useBrainAuditRecords — and
   the Review page's "Needs Review" queue + Home's "Brain Detected" widget
   moved earlier in Phase 1a — see client/src/lib/brainQueue.ts. Neither
   reads from here anymore.) */

export type ActivityType = "paid" | "moved" | "approved";

export type ActivityItemData = {
  id: number | string;
  type: ActivityType;
  title: string;
  meta1: string;
  meta2: string;
  meta3?: string;
  amount: string;
  time: string;
  /** Optional in-app destination opened when the row is tapped. */
  linkTo?: string;
  /** If this activity item is a settled/approved proposal, carry the proposal so a tap can open a SettledRecordCard. */
  proposal?: Proposal;
};

/** Parse a "8:02 AM" style label into minutes-since-midnight for sorting (-1 if unparseable). */
export function parseClockTime(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

/** Map an auto-handled proposal (an "Approved Automatically" receipt) onto an activity item. */
export function autoHandledToActivity(p: Proposal): ActivityItemData {
  const settled = p.rowSubtitle.match(/settled\s+(.+)$/i);
  return {
    id: p.id,
    type: "paid",
    title: `Paid ${p.counterparty ?? p.title}`,
    meta1: "Approved automatically",
    meta2: p.rule?.name ?? "your standing rule",
    amount: `$${(p.amount ?? 0).toLocaleString()}`,
    time: settled ? settled[1] : "Today",
    linkTo: `/review?receipt=${p.id}`,
    proposal: p,
  };
}

// Fabricated settled-history rows (Adobe/Comcast/USDC/payroll) REMOVED (2026-07-03
// honesty pass) — they asserted completed money movements that never happened. Real
// activity history comes from brain-core executed intents / audit log once Fork B lands.
export const TODAY_ACTIVITIES: ActivityItemData[] = [];

export const YESTERDAY_ACTIVITIES: ActivityItemData[] = [];

