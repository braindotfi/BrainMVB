/**
 * Decision receipts — proof that a decision this browser made actually landed.
 *
 * The Resolved list is projected from brain-core's audit feed, so a decision is
 * only visible there once its `proposal.decided` event has been written AND the
 * page has read the audit page containing it. Until both happen the row is gone
 * from Unresolved (core stops returning it as pending) and absent from Resolved,
 * which reads to the operator as "my approval vanished". Nothing is wrong with
 * the decision — the surface simply has no record of it yet.
 *
 * A receipt is that missing record: written the moment core confirms the
 * decision, held for this browser session, and shown in Resolved until the
 * authoritative audit event arrives and takes over (see the reconciliation in
 * InboxPage). It is deliberately NOT a substitute for the audit trail:
 *   - it is only ever written from a CONFIRMED 2xx decision response,
 *   - it never suppresses or contradicts an audit event, and
 *   - it does not survive the session, so it can never become a second,
 *     divergent history competing with brain-core's.
 *
 * Storage is sessionStorage keyed by user id. Session scope matches the claim:
 * "you did this, just now, and the trail hasn't caught up." Keying by user (the
 * same pattern as backupApprover) is what stops one account's decisions being
 * replayed into another's Resolved list after an in-place account switch, since
 * an SPA switch does not remount modules.
 */

import { useSyncExternalStore } from "react";

const KEY_PREFIX = "brain_decision_receipts_";

/** A receipt older than this is dropped on read. By then either the audit event
 *  exists (and the receipt is redundant) or something upstream is wrong and a
 *  stale local row would be asserting an outcome nothing else can confirm. */
export const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DecisionReceipt {
  /** brain-core proposal id the decision was made against. */
  proposalId: string;
  /** The decision verb sent to core ("approve" | "reject" | "acknowledge" | …). */
  decision: string;
  /** Status core reported back for the proposal after the decision. */
  status: string;
  /** Audit event id, when core returned one. The primary reconciliation key —
   *  when the audit feed catches up, this is what proves the two are the same
   *  record rather than two decisions that happen to look alike. */
  auditId: string | null;
  /** Payment intent core created/updated, when it returned one. */
  paymentIntentId: string | null;
  /** When the decision was confirmed, epoch ms. */
  decidedAtMs: number;
  /** Row title, captured at decision time so the receipt can render without
   *  the proposal it refers to — which core may already have stopped
   *  returning. */
  title: string;
  /** Secondary row line, same reason. */
  rowSubtitle?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

const EMPTY: readonly DecisionReceipt[] = [];

let scopeUserId: string | null = null;

/* useSyncExternalStore compares snapshots by identity: parsing storage on every
   call would hand React a new array each render and loop forever. Cached, and
   dropped only when something actually changes. */
let cached: readonly DecisionReceipt[] | null = null;

function storageKey(): string | null {
  return scopeUserId ? `${KEY_PREFIX}${scopeUserId}` : null;
}

function notify(): void {
  cached = null;
  listeners.forEach((l) => l());
}

function isReceipt(value: unknown): value is DecisionReceipt {
  if (value === null || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.proposalId === "string" &&
    r.proposalId.length > 0 &&
    typeof r.decision === "string" &&
    typeof r.status === "string" &&
    typeof r.decidedAtMs === "number" &&
    typeof r.title === "string"
  );
}

function read(): readonly DecisionReceipt[] {
  if (cached) return cached;
  const key = storageKey();
  if (!key) {
    cached = EMPTY;
    return cached;
  }
  try {
    const raw = sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - RECEIPT_MAX_AGE_MS;
    cached = Array.isArray(parsed)
      ? parsed.filter(isReceipt).filter((r) => r.decidedAtMs >= cutoff)
      : [];
  } catch {
    cached = [];
  }
  return cached;
}

function write(next: readonly DecisionReceipt[]): void {
  const key = storageKey();
  /* No signed-in account means no account to attribute the decision to. Holding
     it in memory anyway would let a receipt written in that window surface
     under whichever account is scoped next — the cross-account leak this store
     is scoped to prevent. Dropped instead. */
  if (!key) return;
  cached = next;
  try {
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode, quota) — the in-memory value still
       stands for this session, which is the whole lifetime of a receipt. */
  }
  listeners.forEach((l) => l());
}

/** Point the store at the signed-in account. Called from `applyUserScopedResets`. */
export function setDecisionReceiptScope(userId: string | null): void {
  if (scopeUserId === userId) return;
  scopeUserId = userId;
  notify();
}

/**
 * Record a confirmed decision.
 *
 * Only ever called after core has accepted the decision. A second receipt for
 * the same proposal replaces the first, so a re-decide (or an undo followed by
 * a new decision) leaves exactly one row rather than a stack of contradicting
 * ones.
 */
export function recordDecisionReceipt(receipt: DecisionReceipt): void {
  const next = read().filter((r) => r.proposalId !== receipt.proposalId);
  write([receipt, ...next]);
}

/**
 * Drop the receipt for a proposal.
 *
 * Undo is the reason this exists: undoing puts the proposal back in front of
 * the operator, so a receipt claiming it was decided has to go with it —
 * otherwise the same record would sit in Unresolved and Resolved at once.
 */
export function clearDecisionReceipt(proposalId: string): void {
  const current = read();
  const next = current.filter((r) => r.proposalId !== proposalId);
  if (next.length === current.length) return;
  write(next);
}

/** Current receipts, newest decision first. Non-reactive read. */
export function decisionReceipts(): readonly DecisionReceipt[] {
  return read();
}

/** Wipe the store, including its persisted copy. Used by the reset funnel. */
export function resetDecisionReceipts(): void {
  const key = storageKey();
  if (key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* nothing to do — the in-memory drop below still applies */
    }
  }
  notify();
}

/** What the loaded audit pages already prove, for reconciliation. */
export interface AuditCoverage {
  /** Audit record ids AND anchor audit ids from the loaded records. */
  auditIdentity: ReadonlySet<string>;
  /** Proposal ids referenced by loaded records that are DECISIONS. Creation
   *  events cite the same proposal id and must never be counted here — a
   *  proposal's own "proposed" event would otherwise retire the receipt for
   *  its decision the instant it was written. */
  decidedProposalRefs: ReadonlySet<string>;
}

/**
 * Has the authoritative audit trail caught up with this receipt?
 *
 * Audit-first: when the feed can be shown to contain the same decision, the
 * audit record is what renders and the receipt steps aside. Matching is tried
 * on exact audit identity first and only then on the proposal id, because the
 * second is an inference — it is right because a proposal carries at most one
 * live decision at a time, and an undo drops the receipt rather than leaving
 * two to tell apart.
 */
export function receiptSupersededByAudit(receipt: DecisionReceipt, coverage: AuditCoverage): boolean {
  if (receipt.auditId && coverage.auditIdentity.has(receipt.auditId)) return true;
  return coverage.decidedProposalRefs.has(receipt.proposalId);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive view of the current account's receipts. */
export function useDecisionReceipts(): readonly DecisionReceipt[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
