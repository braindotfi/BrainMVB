import type { AutoRule, RuleSuggestion } from "./proposalTypes";
import { UTILITY_RULE, SAAS_RULE, LEASE_RULE, PAYROLL_RULE } from "./mockProposals";

/* ── Mock rule catalogue ──────────────────────────────────────────────────────
   Source of truth for the rules the Rules page renders. Grouped purely by
   `kind` so the page can derive its three sections (Automations / Guardrails /
   Always-on) from data alone — empty sections collapse on their own.

   The four AP automations are imported from mockProposals so the auto-handled
   RECEIPTS that embed them ("Review rule") resolve to the same rule in the store.
   ──────────────────────────────────────────────────────────────────────────── */

/* Automation that sweeps idle cash — the inline-editable threshold lives here
   ($25,000), demonstrating an automation whose amount is tweakable in place. */
export const SWEEP_RULE: AutoRule = {
  id: "sweep",
  kind: "automation",
  name: "Move extra cash to savings",
  summary: "When checking is over the threshold, sweep the surplus to high-yield",
  createdLabel: "You created this Mar 4 · swept 8 times since",
  policyId: "policy/cash.sweep.v2",
  active: true,
  agent: "cash",
  category: "cash sweep",
  threshold: 25000,
  thresholdEditable: true,
  scopeSummary: "the surplus above $25,000 in checking",
};

/* ── Guardrails — pull you back in above a threshold. The amount is the primary
   control and is editable inline as a bordered mono pill. ──────────────────── */
export const APPROVAL_GUARDRAIL: AutoRule = {
  id: "ask-over-500",
  kind: "guardrail",
  name: "Ask before paying over the limit",
  summary: "Any payment above the limit waits for your approval — no surprises",
  createdLabel: "You created this Jun 12",
  policyId: "policy/guardrail.approval.v1",
  active: true,
  agent: "invoice",
  category: "approval threshold",
  threshold: 500,
  thresholdEditable: true,
  scopeSummary: "any payment over $500",
};

export const SECOND_APPROVAL_GUARDRAIL: AutoRule = {
  id: "second-approval",
  kind: "guardrail",
  name: "Get a second look on large payments",
  summary: "Payments above the limit need a second approval before they settle",
  createdLabel: "You created this Apr 22",
  policyId: "policy/guardrail.dual.v1",
  active: true,
  agent: "invoice",
  category: "dual control",
  threshold: 10000,
  thresholdEditable: true,
  scopeSummary: "any payment over $10,000",
};

/* ── Always-on — protections that can't be turned off. Locked, no toggle. ──── */
export const ANOMALY_GUARD: AutoRule = {
  id: "flag-unusual",
  kind: "always_on",
  locked: true,
  name: "Flag strange behavior",
  summary: "New vendors, amounts that don't match a bill, anything off-pattern",
  createdLabel: "Built in — protects every account",
  policyId: "policy/guard.anomaly.v1",
  active: true,
  scopeSummary: "anything that doesn't fit your normal pattern",
};

export const BANK_CHANGE_GUARD: AutoRule = {
  id: "bank-detail-change",
  kind: "always_on",
  locked: true,
  name: "Stop on changed bank details",
  summary: "Hold any payment where a vendor's bank account changed",
  createdLabel: "Built in — protects every account",
  policyId: "policy/guard.bankchange.v1",
  active: true,
  scopeSummary: "payments to a vendor whose bank details just changed",
};

export const DUPLICATE_GUARD: AutoRule = {
  id: "duplicate-catch",
  kind: "always_on",
  locked: true,
  name: "Catch possible duplicates",
  summary: "Pause a payment that looks like one you've already made",
  createdLabel: "Built in — protects every account",
  policyId: "policy/guard.duplicate.v1",
  active: true,
  scopeSummary: "a charge that matches one already paid",
};

/* ── A rule the user authored in the "New rule" creator. `userCreated: true`
   is what the "Your Rules" tab filters on — only self-authored rules appear
   there, while the category tabs still show the full system + user set. This
   one is the seeded example; real creations are persisted per tenant. ────── */
export const USER_EXAMPLE_RULE: AutoRule = {
  id: "hosting-vercel",
  kind: "automation",
  name: "Auto-clear hosting from Vercel",
  summary: "Vercel · hosting · under $300 · matched prior charge",
  createdLabel: "You created this Jun 24",
  policyId: "policy/ap.tolerance.v3",
  active: true,
  agent: "invoice",
  category: "hosting",
  cap: 300,
  allowlist: ["Vercel"],
  scopeSummary: "Vercel (hosting) under $300",
  userCreated: true,
};

/* The full seed list. Order within a kind is the display order. The store layers
   the SAAS paused-from-report demo state on top of this. */
export const INITIAL_RULES: AutoRule[] = [
  // Automations — act for you
  UTILITY_RULE,
  SAAS_RULE,
  LEASE_RULE,
  PAYROLL_RULE,
  SWEEP_RULE,
  USER_EXAMPLE_RULE,
  // Guardrails — pull you back in
  APPROVAL_GUARDRAIL,
  SECOND_APPROVAL_GUARDRAIL,
  // Always-on — can't be turned off
  ANOMALY_GUARD,
  BANK_CHANGE_GUARD,
  DUPLICATE_GUARD,
];

/* ── Evidence-backed AI suggestions — patterns Brain noticed, with the facts.
   Default unaccepted: the user must "Review & accept" (runs the create flow). ── */
export const INITIAL_SUGGESTIONS: RuleSuggestion[] = [
  {
    id: "sugg-telecom",
    title: "Auto-clear telecom bills",
    description:
      "You've approved the same two telecom vendors every month without changes. Brain can clear these for you.",
    confidence: "high",
    dismissed: false,
    evidence: [
      { label: "vendors", value: "Verizon Business, Comcast Business" },
      { label: "approved", value: "11 of last 11 · 3 months", severity: "clean" },
      { label: "amount range", value: "$180 – $540 · never over $600" },
      { label: "flags raised", value: "0", severity: "clean" },
    ],
    proposedRule: {
      kind: "automation",
      name: "Auto-clear telecom bills",
      summary: "Trusted telecom vendors · monthly · under $600 · matched prior charge",
      policyId: "policy/ap.tolerance.v3",
      agent: "invoice",
      category: "telecom",
      cap: 600,
      allowlist: ["Verizon Business", "Comcast Business"],
      scopeSummary: "trusted telecom vendors under $600",
    },
  },
  {
    id: "sugg-weekly-sweep",
    title: "Sweep idle cash every Friday",
    description:
      "Checking has sat above $25,000 most weeks this quarter. Brain can move the surplus to high-yield weekly.",
    confidence: "medium",
    dismissed: false,
    evidence: [
      { label: "balance over $25k", value: "6 of last 8 weeks" },
      { label: "avg surplus", value: "$18,400" },
      { label: "missed yield", value: "~$71 / week", severity: "info" },
    ],
    proposedRule: {
      kind: "automation",
      name: "Sweep idle cash every Friday",
      summary: "Move surplus over the threshold to high-yield every Friday",
      policyId: "policy/cash.sweep.v2",
      agent: "cash",
      category: "cash sweep",
      threshold: 25000,
      thresholdEditable: true,
      scopeSummary: "the surplus above $25,000 every Friday",
    },
  },
];

/* ── Vendor trust — the builder's vendor picker only offers TRUSTED vendors.
   Trusted = the union of every automation's allowlist. Untrusted vendors are
   shown greyed with a "trust first →" link to a placeholder route; trust is
   NEVER granted inline. ──────────────────────────────────────────────────── */
export const TRUSTED_VENDORS: string[] = Array.from(
  new Set(
    INITIAL_RULES.filter((r) => r.kind === "automation").flatMap(
      (r) => r.allowlist ?? [],
    ),
  ),
).sort();

export const UNTRUSTED_VENDORS: string[] = [
  "Apex Cleaning Co",
  "Meridian Consulting LLC",
  "Northwind Logistics",
];

/* Plain-English category → the policy the rule "compiles to" (shown in the
   builder's visible compile line). */
export const CATEGORY_TO_POLICY: Record<string, string> = {
  bill: "policy/ap.tolerance.v3",
  subscription: "policy/ap.saas.v2",
  rent: "policy/ap.fixed.v1",
  payroll: "policy/ap.payroll.v4",
  invoice: "policy/ar.collections.v1",
};

export const BUILDER_CATEGORIES = Object.keys(CATEGORY_TO_POLICY);
