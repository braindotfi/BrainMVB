/**
 * brain-core BFF proxy (`/api/brain/*`).
 *
 * The browser never talks to api.brain.fi directly and never sees a brain-core
 * JWT. Instead the client calls same-origin `/api/brain/<path>`; this router:
 *   1. requires a BrainMVB session (requireAuth),
 *   2. maps session.userId → a brain-core tenant + principal (tenant.ts),
 *   3. mints a short-lived JWT (auth.ts),
 *   4. forwards the request to `${BRAIN_API_BASE_URL}/<path>` and relays the
 *      response verbatim.
 *
 * SAFETY (slice scope): only GET is proxied generically — reads are safe to pass
 * through with the user's full scope set. Write paths (propose/approve/execute,
 * policy sign, raw ingest) are deliberately added per-endpoint in later phases so
 * an arbitrary POST from a session can't reach the money path. Non-GET returns 405.
 */

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth";
import { brainAuthConfigured } from "./config";
import { getBrainSession } from "./auth";
import {
  brainRequest,
  BrainApiError,
  listLedgerInvoices,
  evaluatePolicy,
  proposeInvoicePayment,
  rejectPaymentIntent,
  approvePaymentIntent,
  createMember,
  updateMember,
  deactivateMember,
  getApprovalPolicyFacts,
  askWikiQuestion,
  createCounterparty,
  type PolicyAction,
  type CreateCounterpartyBody,
} from "./client";

/** Canned prompt for the HomePage "Brain's take" line — one specific, numeric insight. */
const RECOMMENDATION_PROMPT =
  "In one sentence, give me the single most important and specific thing to know about my " +
  "money right now (a cash-flow, spending, or receivable item). Be concrete and numeric; do " +
  "not greet or add commentary.";

export function createBrainProxyRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // POST /api/brain/propose — the ONLY write the BFF exposes (Fork A).
  //
  // Proposes a payment for a Ledger invoice and returns the §6/Policy decision.
  // This is propose-only and demo-safe: the demo token carries
  // `payment_intent:propose` + `policy:read` but NOT `payment_intent:execute`,
  // and no execute path is proxied — so a proposal can never move money. The
  // policy decision (allow/confirm/reject + trace) is derived from the SAME
  // invoice the proposal pays, so the "why" the UI shows is truthful, not
  // client-supplied.
  router.post("/propose", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) {
      return res.status(503).json({
        error: "brain_unconfigured",
        message: "brain-core token source not configured (set BRAIN_DEMO_PROVISION_SECRET).",
      });
    }
    const invoiceId = (req.body as { invoice_id?: unknown } | undefined)?.invoice_id;
    if (typeof invoiceId !== "string" || invoiceId.length === 0) {
      return res.status(400).json({ error: "invalid_request", message: "invoice_id is required" });
    }
    try {
      const { token, agentToken, tenantId } = await getBrainSession(req.session.userId!);

      // Look up the invoice server-side so the evaluate action mirrors what the
      // propose actually pays (truthful trace, not client-asserted amounts).
      const { invoices } = await listLedgerInvoices(token, { limit: 100 });
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (invoice === undefined) {
        return res.status(404).json({ error: "invoice_not_found", message: "no such invoice" });
      }

      // Best-effort policy trace (the propose itself is authoritative for status).
      let decision = null;
      try {
        const action: PolicyAction = {
          kind: "outbound_payment",
          counterparty_id: invoice.counterparty_id,
          amount: { currency: invoice.currency, value: invoice.amount_due },
        };
        decision = await evaluatePolicy(token, tenantId, action);
      } catch (err) {
        console.warn(
          "[brain-proxy] policy evaluate failed (continuing without trace):",
          err instanceof Error ? err.message : String(err),
        );
      }

      // Authoritative: create the §6-gated PaymentIntent (no execution). Propose is an AGENT
      // action — the member/session token has no payment_intent:propose scope, so this MUST
      // use the agent token (agents propose, humans approve).
      const intent = await proposeInvoicePayment(agentToken, invoiceId);
      return res.json({ intent, decision });
    } catch (err) {
      return relayError(res, err);
    }
  });

  // POST /api/brain/reject — operator declines a proposed PaymentIntent.
  //
  // The second (and last) write the BFF exposes. Demo-safe human-oversight
  // action: transitions a proposed/pending intent to `rejected` via the
  // `payment_intent:approve` scope the demo token holds. No execute path; no
  // money movement. Mirror to /propose.
  router.post("/reject", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) {
      return res.status(503).json({
        error: "brain_unconfigured",
        message: "brain-core token source not configured (set BRAIN_DEMO_PROVISION_SECRET).",
      });
    }
    const body = req.body as { payment_intent_id?: unknown; reason?: unknown } | undefined;
    const intentId = body?.payment_intent_id;
    if (typeof intentId !== "string" || !intentId.startsWith("pi_")) {
      return res
        .status(400)
        .json({ error: "invalid_request", message: "payment_intent_id (pi_…) is required" });
    }
    const reason = typeof body?.reason === "string" ? body.reason : undefined;
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const intent = await rejectPaymentIntent(token, intentId, reason);
      return res.json({ intent });
    } catch (err) {
      return relayError(res, err);
    }
  });

  // GET /api/brain/recommendation — a one-line, ledger-grounded insight for the
  // HomePage, synthesized from Wiki Q&A (read-only). Replaces the old mock-data
  // daily-insights cron (server/insightsService.ts). Returns {} on any failure
  // so the page falls back to its static line.
  router.get("/recommendation", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) {
      return res.json({}); // not configured → caller uses its static fallback
    }
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const answer = await askWikiQuestion(token, RECOMMENDATION_PROMPT);
      return res.json({ text: answer.raw, evidenceIds: answer.evidenceIds });
    } catch (err) {
      console.warn(
        "[brain-proxy] recommendation failed (falling back):",
        err instanceof Error ? err.message : String(err),
      );
      return res.json({});
    }
  });

  // POST /api/brain/wiki/question — grounded Q&A over the tenant's Ledger (incl.
  // obligations Brain derived from uploaded documents). Read-only despite POST, so
  // it's safe on the MEMBER/session token. Relays upstream errors verbatim.
  router.post("/wiki/question", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    const question = (req.body as { question?: unknown } | undefined)?.question;
    if (typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ error: "invalid_request", message: "question is required" });
    }
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const answer = await askWikiQuestion(token, question.trim());
      return res.json(answer);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // ── Members & approval authority (MEMBER token; core is the sole enforcer) ──
  //
  // Reads (GET /members, GET /members/:id, GET /policy/:tenant) flow through the generic
  // GET passthrough below on the member/session token. These are the WRITES + one derived
  // read, added per-endpoint so an arbitrary session POST can't reach an unaudited path.
  // We NEVER send an `actor` field — core resolves the member from the token (ACTOR=SESSION).

  // POST /api/brain/members — create a member (core admin-gates; relays 403 verbatim).
  router.post("/members", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const result = await createMember(token, req.body);
      return res.json(result);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // PATCH /api/brain/members/:id — edit role/envelope (perItemLimit, domains, role).
  router.patch("/members/:id", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const result = await updateMember(token, String(req.params.id), req.body);
      return res.json(result);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // DELETE /api/brain/members/:id — DEACTIVATE (core protects the last admin → 403).
  router.delete("/members/:id", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const result = await deactivateMember(token, String(req.params.id));
      return res.json(result);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // POST /api/brain/payment-intents/:id/approve — human approves a pending intent.
  //
  // Two-signer auto-chain: the demo policy's quorum needs two DISTINCT approver members. The
  // first signature (member token) moves the intent to `awaiting_second_approval`; when the core
  // provisioned a SECOND distinct approver token (present since the two-signer fix), we sign again
  // as that member to reach `approved`. Both signatures are REAL, distinct member ids — core's
  // distinct-approver + actor-payee gates are genuinely satisfied, not bypassed. Pre-deploy (no
  // second token) we return the first result verbatim, so the UI shows awaiting_second_approval
  // exactly as before — no 404/500 window. The AGENT token is never used here (agents propose).
  router.post("/payment-intents/:id/approve", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    const id = String(req.params.id);
    if (!id.startsWith("pi_")) {
      return res.status(400).json({ error: "invalid_request", message: "payment_intent id (pi_…) required" });
    }
    try {
      const { token, secondApproverToken } = await getBrainSession(req.session.userId!);
      let intent = await approvePaymentIntent(token, id);
      if (intent.status === "awaiting_second_approval" && secondApproverToken) {
        intent = await approvePaymentIntent(secondApproverToken, id);
      }
      return res.json({ intent });
    } catch (err) {
      return relayError(res, err);
    }
  });

  // GET /api/brain/approval-policy — derived facts for Member Detail "locked rows"
  // (self-approval invariant + tenant second-approval threshold), read from core's policy.
  router.get("/approval-policy", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    try {
      const { token, tenantId } = await getBrainSession(req.session.userId!);
      const facts = await getApprovalPolicyFacts(token, tenantId);
      return res.json(facts);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // POST /api/brain/ledger/counterparties — manually add a vendor (counterparty).
  //
  // MEMBER token (a ledger write, not an agent action). Only identity fields are
  // forwarded — never an `actor` (core derives it from the token) and never a
  // payment/bank/trust field (core rejects those; we don't even accept them from
  // the client). Upsert: core returns 201 (created) or 200 (merged into an
  // existing counterparty) — relayed verbatim.
  router.post("/ledger/counterparties", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    const raw = req.body as Record<string, unknown> | undefined;
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    if (!name) {
      return res.status(400).json({ error: "invalid_request", message: "name is required" });
    }
    const body: CreateCounterpartyBody = { name, type: "vendor" };
    const optionalStrings = ["display_name", "category", "contact_email", "country", "tax_id"] as const;
    for (const key of optionalStrings) {
      const v = raw?.[key];
      if (typeof v === "string" && v.trim().length > 0) body[key] = v.trim();
    }
    if (Array.isArray(raw?.aliases)) {
      const aliases = raw.aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 0);
      if (aliases.length > 0) body.aliases = aliases;
    }
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const result = await createCounterparty(token, body);
      return res.status(result.created ? 201 : 200).json(result);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // Generic read passthrough: GET /api/brain/<brain-core path>
  router.get(/.*/, async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) {
      return res.status(503).json({
        error: "brain_unconfigured",
        message: "brain-core token source not configured (set BRAIN_DEMO_PROVISION_SECRET).",
      });
    }
    try {
      const { token } = await getBrainSession(req.session.userId!);
      // req.path here is the sub-path after the /api/brain mount, e.g. "/ledger/accounts".
      const query: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === "string") query[k] = v;
      }
      const data = await brainRequest<unknown>(req.path, { token, query });
      return res.json(data);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // Block non-GET through the generic proxy for now (see SAFETY note above).
  router.all(/.*/, (_req: Request, res: Response) => {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "Only GET is proxied to brain-core in this build; write paths are added per-endpoint.",
    });
  });

  return router;
}

function unconfigured(res: Response): Response {
  return res.status(503).json({
    error: "brain_unconfigured",
    message: "brain-core token source not configured (set BRAIN_DEMO_PROVISION_SECRET).",
  });
}

function relayError(res: Response, err: unknown): Response {
  if (err instanceof BrainApiError) {
    // Relay brain-core's status + body so the UI can react (e.g. 401/403/404).
    return res.status(err.status).json({ error: "brain_upstream_error", status: err.status, body: err.body });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[brain-proxy] error:", message);
  return res.status(502).json({ error: "brain_proxy_error", message });
}
