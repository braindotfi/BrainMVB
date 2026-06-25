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
