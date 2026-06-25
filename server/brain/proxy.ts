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
  type PolicyAction,
} from "./client";

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
      const { token, tenantId } = await getBrainSession(req.session.userId!);

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

      // Authoritative: create the §6-gated PaymentIntent (no execution).
      const intent = await proposeInvoicePayment(token, invoiceId);
      return res.json({ intent, decision });
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

function relayError(res: Response, err: unknown): Response {
  if (err instanceof BrainApiError) {
    // Relay brain-core's status + body so the UI can react (e.g. 401/403/404).
    return res.status(err.status).json({ error: "brain_upstream_error", status: err.status, body: err.body });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[brain-proxy] error:", message);
  return res.status(502).json({ error: "brain_proxy_error", message });
}
