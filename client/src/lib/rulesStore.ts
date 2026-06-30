import { useSyncExternalStore } from "react";
import type { AutoRule, ProblemReport } from "./proposalTypes";
import { INITIAL_RULES } from "./mockRules";

/* ── Shared rules store ───────────────────────────────────────────────────────
   Single source of truth for the standing auto-clear rules: live active state,
   scope (cap / allowlist), and the ProblemReport trail. The receipt report flow,
   the review page (related-item flagging), and RuleDetail all read/write here.
   No backend, no localStorage — module state behind useSyncExternalStore, the
   same pattern as rule-suggestions.ts. Every write is user-initiated.
   ──────────────────────────────────────────────────────────────────────────── */

function seedRule(base: AutoRule): AutoRule {
  return {
    ...base,
    allowlist: base.allowlist ? [...base.allowlist] : undefined,
    problemReports: [],
  };
}

/* SAAS is pre-seeded paused with one ProblemReport so the paused-from-report
   RuleDetail state is demoable without triggering it live. UTILITY stays active
   for the live Con Edison path. */
function seedRules(): AutoRule[] {
  const rules = INITIAL_RULES.map(seedRule);
  const saas = rules.find((r) => r.id === "saas");
  if (saas) {
    saas.active = false;
    saas.problemReports = [
      {
        id: "pr-seed-1",
        ruleId: "saas",
        proposalId: "auto-figma",
        reason: "Wrong amount",
        note: "Figma jumped from our usual $288 to $360 — I want to check this before it keeps clearing.",
        reportedAtLabel: "Jun 28, 2026 · 4:12 PM ET",
        resolved: false,
      },
    ];
  }
  return rules;
}

let rules: AutoRule[] = seedRules();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

const getSnapshot = () => rules;

let reportCounter = 0;
function nextReportId(): string {
  reportCounter += 1;
  return `pr-${Date.now()}-${reportCounter}`;
}

function reportedAtLabel(): string {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " ET";
}

function updateRule(id: string, fn: (r: AutoRule) => AutoRule) {
  rules = rules.map((r) => (r.id === id ? fn(r) : r));
  notify();
}

/* ── Hooks ──────────────────────────────────────────────────────────────────── */
export function useRules(): AutoRule[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useRule(id: string | undefined): AutoRule | undefined {
  const all = useRules();
  return id ? all.find((r) => r.id === id) : undefined;
}

/* ── Lookups ──────────────────────────────────────────────────────────────────── */
export function getRuleByPolicyId(policyId: string): AutoRule | undefined {
  return rules.find((r) => r.policyId === policyId);
}

export function getRule(id: string): AutoRule | undefined {
  return rules.find((r) => r.id === id);
}

/* ── Mutations (all user-initiated) ───────────────────────────────────────────── */
export function pauseRule(id: string) {
  updateRule(id, (r) => (r.active ? { ...r, active: false } : r));
}

export function resumeRule(id: string) {
  updateRule(id, (r) => ({
    ...r,
    active: true,
    // Resuming clears the unresolved-report state that drove the paused banner.
    problemReports: (r.problemReports ?? []).map((pr) => ({ ...pr, resolved: true })),
  }));
}

/* Report + pause: the recommended safety action from a receipt. */
export function reportProblem(
  id: string,
  input: { proposalId: string; reason: string; note?: string },
) {
  updateRule(id, (r) => ({
    ...r,
    active: false,
    problemReports: [
      ...(r.problemReports ?? []),
      {
        id: nextReportId(),
        ruleId: id,
        proposalId: input.proposalId,
        reason: input.reason,
        note: input.note?.trim() ? input.note.trim() : undefined,
        reportedAtLabel: reportedAtLabel(),
        resolved: false,
      },
    ],
  }));
}

/* Feedback only: record the report but leave the rule active. */
export function sendFeedback(
  id: string,
  input: { proposalId: string; reason: string; note?: string },
) {
  updateRule(id, (r) => ({
    ...r,
    problemReports: [
      ...(r.problemReports ?? []),
      {
        id: nextReportId(),
        ruleId: id,
        proposalId: input.proposalId,
        reason: input.reason,
        note: input.note?.trim() ? input.note.trim() : undefined,
        reportedAtLabel: reportedAtLabel(),
        resolved: true, // no pause → nothing to resolve later
      },
    ],
  }));
}

/* ── Remediations ─────────────────────────────────────────────────────────────── */
export function removeVendor(id: string, vendor: string) {
  updateRule(id, (r) => ({
    ...r,
    allowlist: (r.allowlist ?? []).filter((v) => v !== vendor),
  }));
}

export function lowerCap(id: string, amount: number) {
  updateRule(id, (r) => ({ ...r, cap: amount }));
}

/* Inline threshold edit — guardrail trip point or automation sweep amount. */
export function setThreshold(id: string, amount: number) {
  updateRule(id, (r) => ({ ...r, threshold: amount }));
}

export function deleteRule(id: string) {
  rules = rules.filter((r) => r.id !== id);
  notify();
}

/* ── Create a rule (from the sentence builder or an accepted suggestion) ──────
   Every create is explicit and user-initiated. The new rule is prepended within
   its section so it's visible immediately. */
export function createRule(rule: AutoRule) {
  rules = [{ ...rule, problemReports: [] }, ...rules];
  notify();
}

/* ── Rule draft handoff ───────────────────────────────────────────────────────
   "Always handle this" on a routine receipt sets a draft, then navigates to the
   Rules page which consumes it to pre-fill the create flow. No backend, no
   localStorage — a one-shot module slot. ───────────────────────────────────── */
let ruleDraft: Partial<AutoRule> | null = null;

export function setRuleDraft(draft: Partial<AutoRule>) {
  ruleDraft = draft;
}

export function consumeRuleDraft(): Partial<AutoRule> | null {
  const d = ruleDraft;
  ruleDraft = null;
  return d;
}
