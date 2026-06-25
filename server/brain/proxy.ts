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
import { brainRequest, BrainApiError } from "./client";

export function createBrainProxyRouter(): Router {
  const router = Router();

  router.use(requireAuth);

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
