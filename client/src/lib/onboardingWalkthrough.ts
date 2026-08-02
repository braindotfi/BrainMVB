/**
 * Copy for the first-run rule walkthrough, derived from the tenant's REAL
 * approval policy.
 *
 * This is the first screen a new user sees, and its whole job is to demonstrate
 * the propose-only promise. Quoting a threshold nobody configured would
 * undermine the exact thing the screen exists to prove, so every number here
 * comes from the live policy or is visibly labelled as an example.
 *
 * The policy read has three outcomes and they are NOT interchangeable:
 *
 *   pending  - not known yet. Say nothing specific; specifics fill in later.
 *   failed   - not knowable right now. Say nothing about what the tenant has,
 *              in either direction. "We could not read it" must never render as
 *              "you have none".
 *   noPolicy - a real 404 from brain-core: an honest empty set. This is the one
 *              state allowed to say "yet", because it is true.
 *
 * `autoApproveLimitFromPolicy` already refuses to collapse unknown facts into
 * `{kind:"none"}`; this module keeps that distinction all the way to the copy.
 */

import { groupPolicyAmount, type AutoApproveLimit } from "./brainPolicy";

export type PolicyRead =
  | { state: "pending" }
  | { state: "failed" }
  | { state: "noPolicy" }
  | { state: "known"; limit: AutoApproveLimit };

/** The tenant's own rule, as shown on step 1. */
export interface WalkthroughRule {
  name: string;
  detail: string;
}

export interface WalkthroughRow {
  title: string;
  sub: string;
  badge?: { label: string; tone: "auto" | "needsYou" };
  /** Marks the row as an illustration rather than something that happened. */
  isExample: boolean;
  /** Step 3 shows the approve/decline pair, always disabled. */
  showDecisionButtons?: boolean;
  /** Step 1 shows an on/off toggle. */
  showToggle?: boolean;
}

export interface WalkthroughStep {
  headline: string;
  subhead: string;
  row: WalkthroughRow | null;
}

/** Collapse the policy hook's flags into the one state the copy depends on. */
export function readPolicyState(input: {
  isLoading: boolean;
  isError: boolean;
  limit: AutoApproveLimit | null;
}): PolicyRead {
  if (input.isLoading) return { state: "pending" };
  if (input.isError) return { state: "failed" };
  /* `null` here means the facts were undefined without an error: brain-core
     answered 404 policy_not_found, i.e. no policy is activated yet. */
  if (input.limit === null) return { state: "noPolicy" };
  return { state: "known", limit: input.limit };
}

function amountLabel(limit: Extract<AutoApproveLimit, { kind: "limit" }>): string {
  return `${groupPolicyAmount(limit.value)} ${limit.currency}`;
}

/* The example rows carry no tenant data, so they stay constant across states
   and are always rendered with an "Example" marker. */
const EXAMPLE_RULE: WalkthroughRule = {
  name: "Auto-approve routine vendor payments",
  detail: "Outbound payments · runs automatically",
};

function step1(read: PolicyRead, rule: WalkthroughRule | null): WalkthroughStep {
  const real = read.state === "known" && rule !== null;
  const shown = real ? (rule as WalkthroughRule) : EXAMPLE_RULE;
  return {
    headline: "This is a rule.",
    subhead:
      read.state === "noPolicy"
        ? "Rules define exactly what Brain may do without asking you first. You haven't set any yet. This is what one looks like."
        : real
          ? "Rules define exactly what Brain is allowed to do without asking you first. Nothing runs outside them."
          : "Rules define exactly what Brain may do without asking you first. Nothing runs outside them.",
    row: {
      title: shown.name,
      sub: shown.detail,
      isExample: !real,
      showToggle: true,
    },
  };
}

function step2(read: PolicyRead): WalkthroughStep {
  const headline = "Here's what Brain does automatically.";

  if (read.state === "known" && read.limit.kind === "limit") {
    const amount = amountLabel(read.limit);
    return {
      headline,
      subhead: `Payments at or below ${amount} execute on their own. Every one is logged.`,
      row: {
        title: "Vendor payment to a supplier",
        sub: `Under your ${amount} rule`,
        badge: { label: "auto-approved", tone: "auto" },
        isExample: true,
      },
    };
  }

  if (read.state === "known" && read.limit.kind === "conditional") {
    return {
      headline,
      subhead:
        "Some payments execute on their own, but only under the specific conditions your policy sets. This is not a flat amount.",
      row: {
        title: "Vendor payment to a supplier",
        sub: "Matched a rule that runs automatically",
        badge: { label: "auto-approved", tone: "auto" },
        isExample: true,
      },
    };
  }

  /* Only a policy we actually read may be reported as automating nothing. */
  if (read.state === "known") {
    return {
      headline,
      subhead: "Nothing runs automatically today. Every payment waits for an approver.",
      row: null,
    };
  }

  if (read.state === "noPolicy") {
    return {
      headline,
      subhead: "No rules are active yet, so nothing runs automatically. Everything waits for you.",
      row: null,
    };
  }

  /* pending / failed: describe the mechanism, claim nothing about this tenant. */
  return {
    headline,
    subhead: "Anything that fits one of your rules executes on its own. Every one is logged.",
    row: {
      title: "Vendor payment to a supplier",
      sub: "Matched one of your rules",
      badge: { label: "auto-approved", tone: "auto" },
      isExample: true,
    },
  };
}

function step3(read: PolicyRead): WalkthroughStep {
  const above =
    read.state === "known" && read.limit.kind === "limit"
      ? `Anything above ${amountLabel(read.limit)} waits for a real approval.`
      : "Anything your rules don't cover waits for a real approval.";
  return {
    headline: "Here's what always comes to you.",
    /* True regardless of what the policy says, or whether it could be read. */
    subhead: `${above} Brain proposes. It never executes outside your rules.`,
    row: {
      title: "Confirm treasury transfer to Reserve",
      sub: "Waiting on your approval",
      badge: { label: "needs you", tone: "needsYou" },
      isExample: true,
      showDecisionButtons: true,
    },
  };
}

/** The three steps, in order. */
export function buildWalkthrough(read: PolicyRead, rule: WalkthroughRule | null): WalkthroughStep[] {
  return [step1(read, rule), step2(read), step3(read)];
}

export const WALKTHROUGH_STEPS = 3;
