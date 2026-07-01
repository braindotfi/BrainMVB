import { AUTO_HANDLED_PROPOSALS, MOCK_PROPOSALS } from "@/lib/mockProposals";
import type { Proposal } from "@/lib/proposalTypes";

/* ── Shared source of truth for the Activity feed + Review queue ───────────────
   Both the Activity page ("Brain Did" tab) and the Home page ("Brain Did"
   widget) render off the SAME data declared here, so the two views can never
   drift. The Review page's "Needs Review" queue and the Home page's "Brain
   Detected" widget likewise share getNeedsReviewProposals(). */

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

export const TODAY_ACTIVITIES: ActivityItemData[] = [
  { id: 1, type: "paid", title: "Paid Adobe Creative Cloud (team plan)", meta1: "Automatic", meta2: "15th of every month", meta3: "Chase Business checking", amount: "$540", time: "9:14 AM" },
  { id: 2, type: "paid", title: "Paid Comcast Business Fiber", meta1: "Automatic", meta2: "15th of every month", meta3: "Chase Business checking", amount: "$240", time: "6:46 AM" },
];

export const YESTERDAY_ACTIVITIES: ActivityItemData[] = [
  { id: 4, type: "moved", title: "Moved idle USDC from operating to AAVE yield protocol", meta1: "Operating balance exceeded $5,000 threshold. Earning 4.5% yield now.", meta2: "", amount: "$3,500", time: "6:28 PM" },
  { id: 6, type: "approved", title: "You approved payroll run for J. Smith (Engineering)", meta1: "ACH sent to employee's bank account at Wells Fargo.", meta2: "", amount: "$5,600", time: "10:02 AM" },
];

/** Activity types that belong under the Activity page's "Brain Did" tab. */
export const BRAIN_DID_TYPES: ActivityType[] = ["paid", "moved"];

/** Today's "Brain Did" activity items — the exact list shown under the Activity
    page's "Today" section when the "Brain Did" tab is selected. Auto-handled
    receipts merged with the static Today activities, filtered to Brain-Did
    types, sorted newest-first. */
export function getBrainDidTodayItems(): ActivityItemData[] {
  return [...AUTO_HANDLED_PROPOSALS.map(autoHandledToActivity), ...TODAY_ACTIVITIES]
    .filter((it) => BRAIN_DID_TYPES.includes(it.type))
    .sort((a, b) => parseClockTime(b.time) - parseClockTime(a.time));
}

/** Proposals Brain is advising for human review — the base "Needs Review" queue
    (pending + verifying) shown on the Review page, straight from MOCK_PROPOSALS.
    (The Review page layers user-driven status overrides on top at runtime; a
    fresh summary uses the declared statuses.) */
export function getNeedsReviewProposals(): Proposal[] {
  return MOCK_PROPOSALS.filter((p) => p.status === "pending" || p.status === "verifying");
}
