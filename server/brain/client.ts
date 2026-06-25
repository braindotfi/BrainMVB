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

/** GET /wiki/schema */
export function getWikiSchema(token: string): Promise<WikiSchemaResponse> {
  return brainRequest<WikiSchemaResponse>("/wiki/schema", { token });
}

interface WikiQuestionResponse {
  answer?: unknown;
  evidence_ids?: unknown;
  confidence?: unknown;
}

/** Strip a ```json … ``` (or bare ```) fence brain-core sometimes wraps the answer in. */
function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}

export interface WikiAnswer {
  /** The answer text/JSON, fence-stripped — suitable to ground an LLM or render. */
  raw: string;
  /** Evidence ids (raw artifacts / ledger rows) backing the answer, deduped. */
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

/** POST /wiki/question — grounded Q&A over the tenant's Ledger. Read-only despite POST. */
export async function askWikiQuestion(token: string, question: string): Promise<WikiAnswer> {
  const resp = await brainRequest<WikiQuestionResponse>("/wiki/question", {
    token,
    method: "POST",
    body: { question },
  });
  const answerStr = typeof resp.answer === "string" ? resp.answer : JSON.stringify(resp.answer ?? resp);
  const raw = stripFence(answerStr);

  const evidence = new Set<string>();
  const collect = (v: unknown): void => {
    if (Array.isArray(v)) for (const e of v) if (typeof e === "string") evidence.add(e);
  };
  collect(resp.evidence_ids);
  let confidence = typeof resp.confidence === "number" ? resp.confidence : null;
  try {
    const inner = JSON.parse(raw) as { evidence_ids?: unknown; confidence?: unknown };
    collect(inner.evidence_ids);
    if (confidence === null && typeof inner.confidence === "number") confidence = inner.confidence;
  } catch {
    // answer is prose, not JSON — nothing more to extract.
  }
  return { raw, evidenceIds: Array.from(evidence), confidence };
}
