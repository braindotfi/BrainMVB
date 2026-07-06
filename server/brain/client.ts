/**
 * brain-core HTTP client (BFF side).
 *
 * A thin typed wrapper over `fetch` against brain-core's /v1 surface. It attaches
 * the minted bearer JWT, an X-Request-Id, and (for writes) an Idempotency-Key per
 * brain-core's engineering standards (§3 idempotency-by-default).
 *
 * For this first vertical slice we hand-type only the few endpoints we call. The
 * full typed surface (openapi-typescript codegen from Brain_API_Specification.yaml,
 * matching brain-core's own clients/sdk) is the foundation upgrade for later
 * phases — see deliverables/DEAD-CODE-INVENTORY.md / the integration plan.
 */

import { randomUUID } from "node:crypto";
import { brainConfig } from "./config";

export class BrainApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(`brain-core ${path} → HTTP ${status}`);
    this.name = "BrainApiError";
  }
}

export interface BrainRequestOptions {
  method?: string;
  token: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Override the idempotency key (defaults to a uuid for writes). */
  idempotencyKey?: string;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Issue a request to `${baseUrl}${path}` and return parsed JSON (or throw). */
export async function brainRequest<T>(path: string, opts: BrainRequestOptions): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const url = new URL(brainConfig.baseUrl + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    "X-Request-Id": `req_${randomUUID()}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (WRITE_METHODS.has(method)) {
    headers["Idempotency-Key"] = opts.idempotencyKey ?? randomUUID();
  }

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new BrainApiError(res.status, path, parsed ?? text);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── Minimal typed shapes for the slice (subset of the OpenAPI schemas) ──────

/** Layer 2 Account (Brain_API_Specification.yaml #/components/schemas/Account). */
export interface BrainAccount {
  id: string;
  account_type: "bank_checking" | "bank_savings" | "card" | "loan" | "line_of_credit" | "onchain" | "payment_processor";
  name: string;
  currency: string;
  status: "active" | "closed" | "frozen" | "pending";
  institution?: string | null;
  external_account_id?: string | null;
  current_balance?: string | null;
  available_balance?: string | null;
}

export interface ListAccountsResponse {
  accounts: BrainAccount[];
  next_cursor: string | null;
}

export interface WikiSchemaResponse {
  entity_kinds?: string[];
  // brain-core returns the full JSON-Schema registry; we only assert on kinds.
  [k: string]: unknown;
}

/** GET /ledger/accounts */
export function listLedgerAccounts(token: string, query?: { status?: string; limit?: number }): Promise<ListAccountsResponse> {
  return brainRequest<ListAccountsResponse>("/ledger/accounts", { token, query });
}

// ─── Ledger transactions (deterministic grounding for the assistant) ──────────

/** Subset of brain-core's Transaction schema. */
export interface BrainTransaction {
  id: string;
  amount: string;
  currency: string;
  direction: "inflow" | "outflow" | "transfer" | "adjustment";
  transaction_date: string;
  counterparty_id?: string | null;
  description_normalized?: string | null;
  description_raw?: string | null;
  status?: string | null;
}

export interface ListTransactionsResponse {
  transactions: BrainTransaction[];
  next_cursor: string | null;
}

/** GET /ledger/transactions */
export function listLedgerTransactions(
  token: string,
  query?: { limit?: number; direction?: string; status?: string },
): Promise<ListTransactionsResponse> {
  return brainRequest<ListTransactionsResponse>("/ledger/transactions", { token, query });
}

/** GET /ledger/counterparties (minimal slice for name resolution). */
export interface CounterpartyLite {
  id: string;
  name: string;
}

export interface ListCounterpartiesResponse {
  counterparties: CounterpartyLite[];
}

export function listLedgerCounterparties(token: string): Promise<ListCounterpartiesResponse> {
  return brainRequest<ListCounterpartiesResponse>("/ledger/counterparties", { token });
}

/** GET /wiki/schema */
export function getWikiSchema(token: string): Promise<WikiSchemaResponse> {
  return brainRequest<WikiSchemaResponse>("/wiki/schema", { token });
}

interface WikiQuestionResponse {
  answer?: unknown;
  /** Live shape: array of `{ entityType, entityId, excerpt }`. */
  evidence?: unknown;
  /** OpenAPI-spec shape: array of `{ entity_id, description, result_summary, … }`. */
  evidence_path?: unknown;
  /** Legacy / JSON-envelope shape: array of id strings. */
  evidence_ids?: unknown;
  confidence?: unknown;
}

/** Strip a ```json … ``` (or bare ```) fence brain-core sometimes wraps the answer in. */
function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}

/** One evidence record backing a Wiki answer (a ledger row / raw artifact). */
export interface WikiEvidence {
  /** The id of the backing record (ledger tx/account/counterparty id, or a raw artifact id). */
  entityId: string;
  /** What kind of record it is, when the API tells us (e.g. "transaction"); else null. */
  entityType: string | null;
  /** A short human-readable snippet describing the record, when present; else null. */
  excerpt: string | null;
}

export interface WikiAnswer {
  /** The answer text/JSON, fence-stripped — suitable to ground an LLM or render. */
  raw: string;
  /** Evidence records backing the answer (id + optional type/excerpt), deduped by id. */
  evidence: WikiEvidence[];
  /** Evidence ids only, deduped — kept for back-compat (recommendation route, grounding). */
  evidenceIds: string[];
  confidence: number | null;
}

// ─── Ledger invoices (the AP "bills" inbox the propose demo pays from) ───────

/** Subset of brain-core's Invoice schema we render in the bills inbox. */
export interface BrainInvoice {
  id: string;
  invoice_number: string;
  counterparty_id: string;
  amount_due: string;
  currency: string;
  due_date?: string | null;
  status: string;
  /** Seed marks AP invoices with `{ scenario: "ap", po, flags }`. */
  metadata?: { scenario?: string; po?: string | null; flags?: string[] } | null;
}

export interface ListInvoicesResponse {
  invoices: BrainInvoice[];
}

/** GET /ledger/invoices */
export function listLedgerInvoices(
  token: string,
  query?: { status?: string; limit?: number },
): Promise<ListInvoicesResponse> {
  return brainRequest<ListInvoicesResponse>("/ledger/invoices", { token, query });
}

// ─── Policy evaluate (read-only "why" for the §6 decision trace) ─────────────

/** One rule's evaluation in a PolicyDecision trace (brain-core policy VM). */
export interface PolicyTraceEntry {
  rule_id: string;
  matched: boolean;
  checks: Array<{ key: string; passed: boolean; detail?: string }>;
}

/** brain-core PolicyDecision (the shape POST /policy/{tenant}/evaluate returns). */
export interface PolicyDecision {
  outcome: "allow" | "confirm" | "reject";
  matched_rule_id: string | null;
  required_approvers: string[];
  trace: PolicyTraceEntry[];
}

/** The policy-VM action shape (services/policy/src/vm.ts `Action`). */
export interface PolicyAction {
  kind: "outbound_payment" | "inbound_payment" | "onchain_tx" | "agent_action" | "ledger_write";
  counterparty_id: string | null;
  amount: { currency: string; value: string } | null;
}

/**
 * POST /policy/{tenantId}/evaluate — read-only dry-run of the active policy.
 * Returns the outcome + matched rule + required approvers + per-check trace.
 * Read-only (despite POST); needs only `policy:read`, which the demo token has.
 */
export function evaluatePolicy(
  token: string,
  tenantId: string,
  action: PolicyAction,
): Promise<PolicyDecision> {
  return brainRequest<PolicyDecision>(`/policy/${tenantId}/evaluate`, {
    token,
    method: "POST",
    body: { action },
  });
}

// ─── PaymentIntent propose (creates a §6-gated intent; NEVER executes) ───────

/** Subset of brain-core's PaymentIntent we surface after a propose. */
export interface PaymentIntent {
  id: string;
  action_type: string;
  source_account_id: string;
  destination_counterparty_id: string;
  amount: string;
  currency: string;
  invoice_id?: string | null;
  /** approved (allow) | pending_approval (confirm) | rejected (reject) | … */
  status: string;
  policy_decision_id: string | null;
}

/**
 * POST /payment-intents with the `pay_invoice` shortcut — proposes a payment for
 * a Ledger invoice. brain-core resolves amount/currency/counterparty/source from
 * the invoice, runs Policy, and returns the intent with its decided `status`.
 *
 * This is propose-ONLY: the returned intent is never executed here (the demo
 * token has no `payment_intent:execute` scope and the BFF exposes no execute
 * path). No money moves.
 */
export function proposeInvoicePayment(token: string, invoiceId: string): Promise<PaymentIntent> {
  return brainRequest<PaymentIntent>("/payment-intents", {
    token,
    method: "POST",
    body: { type: "pay_invoice", invoice_id: invoiceId },
  });
}

/**
 * POST /payment-intents/{id}/reject — operator declines a proposed/pending
 * PaymentIntent. Demo-safe human-oversight action: uses the `payment_intent:approve`
 * scope the demo token already holds, transitions the intent to `rejected`, and
 * moves no money. (The complementary `approve` path is intentionally NOT exposed:
 * the demo tenant has no seeded approvers and the live endpoint 500s for it.)
 */
export function rejectPaymentIntent(
  token: string,
  id: string,
  reason?: string,
): Promise<PaymentIntent> {
  return brainRequest<PaymentIntent>(`/payment-intents/${id}/reject`, {
    token,
    method: "POST",
    body: reason !== undefined ? { reason } : {},
  });
}

/**
 * POST /payment-intents/{id}/approve — a human member approves a pending PaymentIntent.
 *
 * MUST be called with the MEMBER token (payment_intent:approve; the agent token is
 * propose-only and correctly 403s here). Per ACTOR=SESSION we send NO actor field — core
 * derives the approver from the token subject and strips any client-supplied actor. The
 * response carries the new `status` (incl. "awaiting_second_approval") and `approvals[]`;
 * core rejects self-approval / limit / domain / second-approver violations with its own
 * 403 { error, reason, detail }, which we relay verbatim (enforcement is core-only).
 */
export function approvePaymentIntent(token: string, id: string): Promise<PaymentIntent> {
  return brainRequest<PaymentIntent>(`/payment-intents/${id}/approve`, {
    token,
    method: "POST",
    body: {},
  });
}

// ─── Members & approval authority (MEMBER token only) ────────────────────────

export type MemberRole = "admin" | "approver" | "viewer";
export type ApprovalDomain = "ap" | "ar" | "treasury" | "payroll" | "reconciliation";

/** A member's approval envelope (what they can approve, and up to how much). */
export interface MemberApproval {
  domains: ApprovalDomain[];
  /** Per-item approval limit in whole currency units. A very large value ≈ unlimited. */
  perItemLimit: number;
  requiresSecondApproverAbove: number | null;
}

/** brain-core Member (GET /members / /members/{id}). Deactivated members still resolve. */
export interface BrainMember {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: MemberRole;
  active: boolean;
  approval: MemberApproval;
  identityLinks?: Array<{ id?: string; provider?: string; subject?: string }> | null;
}

export interface ListMembersResponse {
  members: BrainMember[];
}

/** GET /members (+ optional role/domain filters). MEMBER token. */
export function listMembers(
  token: string,
  query?: { role?: string; domain?: string },
): Promise<ListMembersResponse> {
  return brainRequest<ListMembersResponse>("/members", { token, query });
}

/** GET /members/{id}. MEMBER token. Deactivated members return 200 (history resolution). */
export function getMember(token: string, id: string): Promise<BrainMember> {
  return brainRequest<BrainMember>(`/members/${id}`, { token });
}

/** brain-core wraps member writes as { member, audit_id }. */
export interface MemberMutationResponse {
  member: BrainMember;
  audit_id?: string;
}

/** POST /members — create a member (admin-gated by core). MEMBER token. */
export function createMember(token: string, body: unknown): Promise<MemberMutationResponse> {
  return brainRequest<MemberMutationResponse>("/members", { token, method: "POST", body });
}

/** PATCH /members/{id} — edit role/envelope (admin-gated by core). MEMBER token. */
export function updateMember(token: string, id: string, body: unknown): Promise<MemberMutationResponse> {
  return brainRequest<MemberMutationResponse>(`/members/${id}`, { token, method: "PATCH", body });
}

/** DELETE /members/{id} — DEACTIVATE (not hard delete). MEMBER token. */
export function deactivateMember(token: string, id: string): Promise<MemberMutationResponse> {
  return brainRequest<MemberMutationResponse>(`/members/${id}`, { token, method: "DELETE" });
}

// ─── Policy read (locked-rows / second-approval threshold, from core not hardcoded) ──

/** One rule inside the active policy content (services/policy/src/dsl.ts:69-81 `PolicyRule`). */
export interface PolicyContentRule {
  id: string;
  when?: { "amount.gt"?: { value?: string; currency?: string }; [k: string]: unknown };
  execute?: string;
  require?: string;
  applies_to?: string[];
}

interface ActivePolicy {
  id: string;
  content?: { version?: number; rules?: PolicyContentRule[] };
  quorum_required?: number;
}

/** The approval facts the Member Detail "locked rows" render — derived from core's policy. */
export interface ApprovalPolicyFacts {
  /** Self-approval is a hard invariant in core; always true. */
  selfApprovalBlocked: true;
  /** Amount above which a second, different approver is required (tenant policy), or null. */
  secondApprovalThreshold: { value: string; currency: string } | null;
  /**
   * Phase 2a (Rules page, read-only): the full active policy document, so the
   * client can render every clause rather than only the one derived threshold
   * above. Same /policy/{tenantId} read this function already makes — added to
   * the existing response instead of a new BFF route (server/brain/proxy.ts's
   * /approval-policy). Read-only GET, member token, no new scope required.
   */
  version: number;
  quorumRequired: number;
  rules: PolicyContentRule[];
}

/**
 * GET /policy/{tenantId} and derive the approval facts shown as LOCKED rows in Member Detail.
 * The second-approval threshold is read from the policy (the outbound-payment "confirm" rule
 * that requires two distinct approvers, e.g. `require: owner_and_cfo`) — never hardcoded.
 */
export async function getApprovalPolicyFacts(token: string, tenantId: string): Promise<ApprovalPolicyFacts> {
  const policy = await brainRequest<ActivePolicy>(`/policy/${tenantId}`, { token });
  const rules = policy.content?.rules ?? [];
  const twoApproverRequires = new Set(["owner_and_cfo", "owner_and_controller", "two_approvers"]);
  let threshold: { value: string; currency: string } | null = null;
  for (const r of rules) {
    const isOutbound = (r.applies_to ?? []).includes("outbound_payment");
    const needsTwo = r.execute === "confirm" && typeof r.require === "string" && twoApproverRequires.has(r.require);
    const gt = r.when?.["amount.gt"];
    if (isOutbound && needsTwo && gt?.value) {
      const value = gt.value;
      const currency = gt.currency ?? "USD";
      if (threshold === null || Number(value) < Number(threshold.value)) {
        threshold = { value, currency };
      }
    }
  }
  return {
    selfApprovalBlocked: true,
    secondApprovalThreshold: threshold,
    version: policy.content?.version ?? 1,
    quorumRequired: policy.quorum_required ?? 1,
    rules,
  };
}

/** POST /wiki/question — grounded Q&A over the tenant's Ledger. Read-only despite POST. */
export async function askWikiQuestion(token: string, question: string): Promise<WikiAnswer> {
  const resp = await brainRequest<WikiQuestionResponse>("/wiki/question", {
    token,
    method: "POST",
    body: { question },
  });
  const answerStr = typeof resp.answer === "string" ? resp.answer : JSON.stringify(resp.answer ?? resp);
  const raw = stripFence(answerStr);

  // Dedup evidence by id; the richest record (one that carries an excerpt) wins.
  const byId = new Map<string, WikiEvidence>();
  const add = (rec: WikiEvidence): void => {
    const existing = byId.get(rec.entityId);
    if (!existing || (!existing.excerpt && rec.excerpt)) byId.set(rec.entityId, rec);
  };
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  // Structured arrays: live `evidence:[{entityType,entityId,excerpt}]` or
  // spec `evidence_path:[{entity_id,description,result_summary}]`. Tolerate camel/snake.
  const addStructured = (v: unknown): void => {
    if (!Array.isArray(v)) return;
    for (const e of v) {
      if (typeof e === "string") {
        add({ entityId: e, entityType: null, excerpt: null });
      } else if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        const id = str(o.entityId) ?? str(o.entity_id);
        if (!id) continue;
        add({
          entityId: id,
          entityType: str(o.entityType) ?? str(o.entity_type),
          excerpt: str(o.excerpt) ?? str(o.result_summary) ?? str(o.description),
        });
      }
    }
  };
  // Flat id arrays: legacy/JSON-envelope `evidence_ids:[string]`.
  const addIds = (v: unknown): void => {
    if (Array.isArray(v)) for (const e of v) if (typeof e === "string") add({ entityId: e, entityType: null, excerpt: null });
  };

  addStructured(resp.evidence);
  addStructured(resp.evidence_path);
  addIds(resp.evidence_ids);
  let confidence = typeof resp.confidence === "number" ? resp.confidence : null;
  try {
    const inner = JSON.parse(raw) as {
      evidence?: unknown;
      evidence_path?: unknown;
      evidence_ids?: unknown;
      confidence?: unknown;
    };
    addStructured(inner.evidence);
    addStructured(inner.evidence_path);
    addIds(inner.evidence_ids);
    if (confidence === null && typeof inner.confidence === "number") confidence = inner.confidence;
  } catch {
    // answer is prose, not JSON — nothing more to extract.
  }

  const evidence = Array.from(byId.values());
  return { raw, evidence, evidenceIds: evidence.map((e) => e.entityId), confidence };
}
