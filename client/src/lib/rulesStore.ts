import { useSyncExternalStore } from "react";
import type { AutoRule, Agent, RuleKind, RuleHistoryEvent } from "./proposalTypes";
import { INITIAL_RULES } from "./mockRules";
import { apiRequest } from "./queryClient";

/* ── Shared rules store ───────────────────────────────────────────────────────
   Single source of truth for the standing auto-clear rules: live active state,
   scope (cap / allowlist), and the ProblemReport trail. The receipt report flow,
   the review page (related-item flagging), and RuleDetail all read/write here.
   No backend, no localStorage - module state behind useSyncExternalStore, the
   same pattern as rule-suggestions.ts. Every write is user-initiated.
   ──────────────────────────────────────────────────────────────────────────── */

function seedRule(base: AutoRule): AutoRule {
  return {
    ...base,
    allowlist: base.allowlist ? [...base.allowlist] : undefined,
    problemReports: [],
    history: [
      { id: `${base.id}-created`, type: "created", label: "Rule created", atLabel: base.createdLabel },
    ],
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
        note: "Figma jumped from our usual $288 to $360. I want to check this before it keeps clearing.",
        reportedAtLabel: "Jun 28, 2026 · 4:12 PM ET",
        resolved: false,
      },
    ];
    saas.history = [
      ...(saas.history ?? []),
      { id: "saas-paused-seed-1", type: "paused", label: "Rule paused", atLabel: "Jun 28, 2026 · 4:12 PM ET" },
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

let historyCounter = 0;
function nextHistoryId(): string {
  historyCounter += 1;
  return `hist-${Date.now()}-${historyCounter}`;
}

/* Appends a lifecycle event (paused/resumed) to a rule's history trail. */
function appendHistory(r: AutoRule, type: RuleHistoryEvent["type"], label: string): RuleHistoryEvent[] {
  return [...(r.history ?? []), { id: nextHistoryId(), type, label, atLabel: reportedAtLabel() }];
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
  updateRule(id, (r) =>
    r.active ? { ...r, active: false, history: appendHistory(r, "paused", "Rule paused") } : r,
  );
}

export function resumeRule(id: string) {
  updateRule(id, (r) => ({
    ...r,
    active: true,
    // Resuming clears the unresolved-report state that drove the paused banner.
    problemReports: (r.problemReports ?? []).map((pr) => ({ ...pr, resolved: true })),
    history: appendHistory(r, "resumed", "Rule resumed"),
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
    history: r.active ? appendHistory(r, "paused", "Rule paused") : r.history,
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

/* Inline threshold edit - guardrail trip point or automation sweep amount. */
export function setThreshold(id: string, amount: number) {
  updateRule(id, (r) => ({ ...r, threshold: amount }));
}

export function deleteRule(id: string) {
  const existing = rules.find((r) => r.id === id);
  rules = rules.filter((r) => r.id !== id);
  notify();
  if (existing?.userCreated) void persistDelete(id);
}

/* ── Create a rule (from the sentence builder or an accepted suggestion) ──────
   Every create is explicit and user-initiated. The new rule is prepended within
   its section so it's visible immediately, flagged `userCreated` (so it surfaces
   on the "Your Rules" tab), and persisted to the tenant's account. */
export function createRule(rule: AutoRule) {
  const created: AutoRule = {
    ...rule,
    userCreated: true,
    problemReports: [],
    history: [
      ...(rule.history ?? []),
      { id: nextHistoryId(), type: "created", label: "Rule created", atLabel: rule.createdLabel ?? "Just now" },
    ],
  };
  rules = [created, ...rules];
  notify();
  void persistCreate(created);
}

/* ── Backend persistence (per-tenant, session-authenticated) ─────────────────
   User-created rules are stored in Postgres and associated with the logged-in
   account. The store stays the SSOT for the session; the network calls keep the
   account's rules durable across reloads. All calls fail soft - a persistence
   error never blocks the optimistic UI. ──────────────────────────────────── */
function toRulePayload(rule: AutoRule) {
  return {
    id: rule.id,
    name: rule.name,
    summary: rule.summary ?? "",
    kind: rule.kind ?? "automation",
    policyId: rule.policyId,
    active: rule.active,
    agent: rule.agent ?? null,
    category: rule.category ?? null,
    cap: rule.cap ?? null,
    threshold: rule.threshold ?? null,
    thresholdEditable: rule.thresholdEditable ?? null,
    allowlist: rule.allowlist ?? null,
    scopeSummary: rule.scopeSummary ?? null,
    createdLabel: rule.createdLabel,
  };
}

async function persistCreate(rule: AutoRule) {
  try {
    await apiRequest("POST", "/api/rules", toRulePayload(rule));
  } catch (err) {
    console.warn("[rulesStore] failed to persist rule", err);
  }
}

async function persistDelete(id: string) {
  try {
    await apiRequest("DELETE", `/api/rules/${encodeURIComponent(id)}`);
  } catch (err) {
    console.warn("[rulesStore] failed to delete rule", err);
  }
}

/* Load the tenant's persisted rules and merge any not already in the store.
   Idempotent + fetched once per session (retried if it fails). Rules from the
   account are all `userCreated`, so they land on the "Your Rules" tab. */
let hydrated = false;
export async function hydrateUserRules() {
  if (hydrated) return;
  hydrated = true;
  try {
    const res = await apiRequest("GET", "/api/rules");
    const rows: any[] = await res.json();
    const existingIds = new Set(rules.map((r) => r.id));
    const incoming: AutoRule[] = rows
      .filter((row) => row && typeof row.id === "string" && !existingIds.has(row.id))
      .map((row) => ({
        id: row.id,
        name: row.name,
        summary: row.summary ?? "",
        createdLabel: row.createdLabel ?? "You created this",
        policyId: row.policyId,
        active: !!row.active,
        kind: (row.kind ?? "automation") as RuleKind,
        agent: (row.agent ?? undefined) as Agent | undefined,
        category: row.category ?? undefined,
        cap: row.cap ?? undefined,
        threshold: row.threshold ?? undefined,
        thresholdEditable: row.thresholdEditable ?? undefined,
        allowlist: row.allowlist ?? undefined,
        scopeSummary: row.scopeSummary ?? undefined,
        userCreated: true,
        problemReports: [],
      }));
    if (incoming.length) {
      rules = [...incoming, ...rules];
      notify();
    }
  } catch (err) {
    hydrated = false; // allow a retry on the next mount
    console.warn("[rulesStore] failed to hydrate user rules", err);
  }
}

/* ── Rule draft handoff ───────────────────────────────────────────────────────
   "Always handle this" on a routine receipt sets a draft, then navigates to the
   Rules page which consumes it to pre-fill the create flow. No backend, no
   localStorage - a one-shot module slot. ───────────────────────────────────── */
let ruleDraft: Partial<AutoRule> | null = null;

export function setRuleDraft(draft: Partial<AutoRule>) {
  ruleDraft = draft;
}

export function consumeRuleDraft(): Partial<AutoRule> | null {
  const d = ruleDraft;
  ruleDraft = null;
  return d;
}
