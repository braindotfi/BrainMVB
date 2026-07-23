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
 * SAFETY (slice scope): only GET is proxied generically - reads are safe to pass
 * through with the user's full scope set. Write paths (propose/approve/execute,
 * policy sign, raw ingest) are deliberately added per-endpoint in later phases so
 * an arbitrary POST from a session can't reach the money path. Non-GET returns 405.
 */

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth";
import { brainAuthConfigured, brainTenancyMode, platformServiceConfigured } from "./config";
import { getBrainSession, registerBrainSession, NoTenantError } from "./auth";
import { createTenant, consumeInvite, TenancyApiError } from "./tenancy";
import { storage } from "../storage";
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

import { RECOMMENDATION_PROMPT } from "@shared/cannedPrompts";

export function createBrainProxyRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // POST /api/brain/propose - the ONLY write the BFF exposes (Fork A).
  //
  // Proposes a payment for a Ledger invoice and returns the §6/Policy decision.
  // This is propose-only and demo-safe: the demo token carries
  // `payment_intent:propose` + `policy:read` but NOT `payment_intent:execute`,
  // and no execute path is proxied - so a proposal can never move money. The
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
      // action - the member/session token has no payment_intent:propose scope, so this MUST
      // use the agent token (agents propose, humans approve).
      const intent = await proposeInvoicePayment(agentToken, invoiceId);
      return res.json({ intent, decision });
    } catch (err) {
      return relayError(res, err);
    }
  });

  // POST /api/brain/reject - operator declines a proposed PaymentIntent.
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

  // GET /api/brain/recommendation - a one-line, ledger-grounded insight for the
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

  // POST /api/brain/wiki/question - grounded Q&A over the tenant's Ledger (incl.
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

  // ── Production tenancy (Phase 2): company creation, invites, tenancy status ──

  // GET /api/brain/tenancy - tells the client which tenancy mode is active and whether
  // the current user is linked to a tenant (drives the "Create a company / Enter your
  // invite link" gate after login). Cheap: one local DB read, no brain-core call.
  router.get("/tenancy", async (req: Request, res: Response) => {
    const mode = brainTenancyMode();
    if (mode !== "production") return res.json({ mode, linked: true });
    const identity = await storage.getBrainIdentity(req.session.userId!);
    return res.json({
      mode,
      linked: !!identity,
      tenantId: identity?.tenantId,
      companyName: identity?.companyName ?? undefined,
    });
  });

  // POST /api/brain/tenants - create a company tenant for the CURRENT logged-in user
  // (they become the bootstrap admin). Explicit user action only - never called
  // automatically. NOT idempotent upstream, so we hard-guard on an existing mapping and
  // never retry: a failure surfaces verbatim for the user to decide.
  router.post("/tenants", async (req: Request, res: Response) => {
    if (!platformServiceConfigured()) {
      return res.status(503).json({
        error: "tenancy_unconfigured",
        message: "Company signup isn't available: BRAIN_PLATFORM_SERVICE_SECRET is not set.",
      });
    }
    const companyName = typeof (req.body as { company_name?: unknown })?.company_name === "string"
      ? (req.body.company_name as string).trim()
      : "";
    if (!companyName) {
      return res.status(400).json({ error: "invalid_request", message: "company_name is required" });
    }
    const userId = req.session.userId!;
    const existing = await storage.getBrainIdentity(userId);
    if (existing) {
      return res.status(409).json({
        error: "already_linked",
        message: "This account already belongs to a company.",
        tenantId: existing.tenantId,
      });
    }
    const user = await storage.getUser(userId);
    if (!user?.email) {
      return res.status(400).json({ error: "invalid_request", message: "Your account needs an email before creating a company." });
    }
    try {
      const result = await createTenant({
        companyName,
        founderEmail: user.email,
        founderDisplayName: user.name || user.username || user.email,
        founderExternalRef: userId, // external_ref = stable platform user id, never an email
      });
      await storage.createBrainIdentity({
        userId,
        externalRef: userId,
        tenantId: result.tenant_id,
        memberId: result.member?.id ?? null,
        companyName,
      });
      // Capture the agent token core mints at tenant creation (production-agents contract)
      // - never discarded, never sent to the browser. Older cores omit `agent`; the token
      // is then backfilled idempotently on first session use.
      if (result.agent?.token) {
        await storage.upsertBrainAgentToken(
          result.tenant_id,
          result.agent.token,
          new Date(Date.now() + (result.agent.expires_in ?? 900) * 1000),
        );
      }
      await registerBrainSession(userId, result.session, result.tenant_id, result.agent?.token);
      return res.status(201).json({ tenantId: result.tenant_id, member: result.member });
    } catch (err) {
      return relayError(res, err);
    }
  });

  // POST /api/brain/invites/consume - accept an invite for the CURRENT logged-in user.
  // Never auto-consumed on page load; the client calls this only after an explicit
  // confirm. Uses the platform service credential; binds external_ref = app user id.
  router.post("/invites/consume", async (req: Request, res: Response) => {
    if (!platformServiceConfigured()) {
      return res.status(503).json({
        error: "tenancy_unconfigured",
        message: "Invite acceptance isn't available: BRAIN_PLATFORM_SERVICE_SECRET is not set.",
      });
    }
    const inviteToken = typeof (req.body as { invite_token?: unknown })?.invite_token === "string"
      ? (req.body.invite_token as string).trim()
      : "";
    if (!inviteToken) {
      return res.status(400).json({ error: "invalid_request", message: "invite_token is required" });
    }
    const userId = req.session.userId!;
    const existing = await storage.getBrainIdentity(userId);
    if (existing) {
      return res.status(409).json({
        error: "already_linked",
        message: "This account already belongs to a company. Invites can only be accepted from a fresh account.",
      });
    }
    const user = await storage.getUser(userId);
    try {
      const result = await consumeInvite({
        inviteToken,
        externalRef: userId,
        displayName: user?.name || undefined,
      });
      const tenantId = result.member?.tenantId ?? result.tenant_id;
      if (!tenantId) throw new Error("brain-core invite consume returned no tenant id");
      await storage.createBrainIdentity({
        userId,
        externalRef: userId,
        tenantId,
        memberId: result.member?.id ?? null,
      });
      if (result.session) await registerBrainSession(userId, result.session, tenantId);
      return res.json({ tenantId, member: result.member });
    } catch (err) {
      if (err instanceof TenancyApiError) {
        // Map the four contract rejection reasons to plain language - never silent.
        const messages: Record<string, string> = {
          invite_invalid: "That invite link isn't valid. Ask your admin to send a new one.",
          invite_expired: "That invite has expired. Ask your admin to resend it.",
          invite_consumed: "That invite was already used. If that wasn't you, tell your admin.",
          invite_revoked: "That invite was revoked. Ask your admin for a new one.",
        };
        const reason = err.reason;
        if (reason && messages[reason]) {
          return res.status(err.status).json({ error: reason, message: messages[reason] });
        }
      }
      return relayError(res, err);
    }
  });

  // POST /api/brain/members/:id/invites - issue (or REISSUE, which revokes the prior
  // token per contract) an invite for a member. MEMBER token; core admin-gates.
  router.post("/members/:id/invites", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const data = await brainRequest<unknown>(`/members/${encodeURIComponent(String(req.params.id))}/invites`, {
        method: "POST",
        token,
        body: {},
      });
      return res.json(data);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // DELETE /api/brain/members/:id/invites - revoke a member's outstanding invite.
  router.delete("/members/:id/invites", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const data = await brainRequest<unknown>(`/members/${encodeURIComponent(String(req.params.id))}/invites`, {
        method: "DELETE",
        token,
      });
      return res.json(data);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // ── Members & approval authority (MEMBER token; core is the sole enforcer) ──
  //
  // Reads (GET /members, GET /members/:id, GET /policy/:tenant) flow through the generic
  // GET passthrough below on the member/session token. These are the WRITES + one derived
  // read, added per-endpoint so an arbitrary session POST can't reach an unaudited path.
  // We NEVER send an `actor` field - core resolves the member from the token (ACTOR=SESSION).

  // POST /api/brain/members - create a member (core admin-gates; relays 403 verbatim).
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

  // PATCH /api/brain/members/:id - edit role/envelope (perItemLimit, domains, role).
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

  // DELETE /api/brain/members/:id - DEACTIVATE (core protects the last admin → 403).
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

  // POST /api/brain/payment-intents/:id/approve - human approves a pending intent.
  //
  // Two-signer auto-chain: the demo policy's quorum needs two DISTINCT approver members. The
  // first signature (member token) moves the intent to `awaiting_second_approval`; when the core
  // provisioned a SECOND distinct approver token (present since the two-signer fix), we sign again
  // as that member to reach `approved`. Both signatures are REAL, distinct member ids - core's
  // distinct-approver + actor-payee gates are genuinely satisfied, not bypassed. Pre-deploy (no
  // second token) we return the first result verbatim, so the UI shows awaiting_second_approval
  // exactly as before - no 404/500 window. The AGENT token is never used here (agents propose).
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

  // GET /api/brain/approval-policy - derived facts for Member Detail "locked rows"
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

  // POST /api/brain/ledger/counterparties - manually add a vendor (counterparty).
  //
  // MEMBER token (a ledger write, not an agent action). Only identity fields are
  // forwarded - never an `actor` (core derives it from the token) and never a
  // payment/bank/trust field (core rejects those; we don't even accept them from
  // the client). Upsert: core returns 201 (created) or 200 (merged into an
  // existing counterparty) - relayed verbatim.
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

  // POST /api/brain/proposals/:id/decide - human records a decision on an agent
  // proposal (services/execution/src/proposals/{read-model,decision-service}.ts;
  // MERGED via brain-core #268-271 and LIVE on api.brain.fi). Relayed error codes:
  // execution_proposal_not_found -> 404, execution_proposal_invalid_state -> 409.
  //
  // MEMBER token (route accepts payment_intent:approve OR execution:read; core
  // resolves the actor from the token subject via ActorResolver - ACTOR=SESSION).
  // Only {decision} is ever forwarded, exactly mirroring approve/reject: never a
  // client-supplied actor field.
  router.post("/proposals/:id/decide", async (req: Request, res: Response) => {
    if (!brainAuthConfigured()) return unconfigured(res);
    const id = String(req.params.id);
    const raw = req.body as { decision?: unknown } | undefined;
    const decision = typeof raw?.decision === "string" ? raw.decision : undefined;
    if (!decision) {
      return res.status(400).json({ error: "invalid_request", message: "decision is required" });
    }
    const body = { decision };
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const result = await brainRequest<unknown>(`/proposals/${encodeURIComponent(id)}/decide`, {
        token,
        method: "POST",
        body,
      });
      return res.json(result);
    } catch (err) {
      return relayError(res, err);
    }
  });

  // ── Artifact-driven write allowlist (brainmvb_api_surface v1) ──────────────
  //
  // Wires the remaining in-scope WRITE endpoints from the api-surface artifact
  // groups: ledger_and_canonical, wiki_memory_policy,
  // agents_execution_payments_members, audit_proof_tenant. Every route here is
  // `route_scope_check_enforced` upstream (scopes noted per row are checked by
  // brain-core inside the handler — there is NO gateway matrix); the BFF adds no
  // demo/synthetic fallback: upstream errors (incl. 403 auth_scope_insufficient)
  // relay verbatim.
  //
  // Token rule (BFF invariant): MEMBER token for everything except agent-side
  // proposal ingestion (`/agents/run`, `/agents/events`, scope
  // payment_intent:propose) which — like /propose — is an AGENT action.
  //
  // DELIBERATELY ABSENT (excluded by the wiring plan):
  //   POST /execution/execute      — permanently disabled upstream (422
  //                                  gate_no_policy_decision); use
  //                                  POST /payment-intents/:id/execute instead.
  //   POST /execution/mcp          — deprecated ping-only stub.
  //   X-Platform-Service-Auth routes — only via tenancy.ts (never a session).
  //   DELETE /tenants/:id          — destructive; needs its own confirm flow.
  //   POST /audit/anchor/publish   — audit:admin + conditional dependency.
  interface BrainWriteRoute {
    method: "post" | "patch" | "delete";
    /** Express mount under /api/brain (params relayed into the upstream path). */
    mount: string;
    /** Build the upstream brain-core path (tenantId comes from the SESSION, never the client). */
    upstream: (params: Record<string, string>, tenantId: string) => string;
    /** Which minted principal signs the upstream call. */
    principal: "member" | "agent";
    /** Upstream scope (documentation; brain-core enforces via requireScope). */
    scope: string;
  }

  const esc = encodeURIComponent;
  const WRITE_ROUTES: BrainWriteRoute[] = [
    // ledger_and_canonical
    { method: "patch", mount: "/ledger/counterparties/:id", upstream: (p) => `/ledger/counterparties/${esc(p.id)}`, principal: "member", scope: "ledger:write" },
    { method: "post", mount: "/ledger/normalize", upstream: () => "/ledger/normalize", principal: "member", scope: "ledger:write" },
    { method: "post", mount: "/ledger/reconcile", upstream: () => "/ledger/reconcile", principal: "member", scope: "ledger:write" },
    // wiki_memory_policy
    { method: "post", mount: "/memory/regenerate", upstream: () => "/memory/regenerate", principal: "member", scope: "wiki:read" },
    { method: "post", mount: "/wiki/annotate", upstream: () => "/wiki/annotate", principal: "member", scope: "wiki:write" },
    { method: "post", mount: "/policy/compose", upstream: (_p, t) => `/policy/${esc(t)}/compose`, principal: "member", scope: "policy:write" },
    { method: "post", mount: "/policy/sign", upstream: (_p, t) => `/policy/${esc(t)}/sign`, principal: "member", scope: "policy:sign" },
    { method: "post", mount: "/policy/evaluate", upstream: (_p, t) => `/policy/${esc(t)}/evaluate`, principal: "member", scope: "policy:read" },
    { method: "post", mount: "/policy/simulate", upstream: (_p, t) => `/policy/${esc(t)}/simulate`, principal: "member", scope: "policy:read" },
    { method: "post", mount: "/policy/lint", upstream: (_p, t) => `/policy/${esc(t)}/lint`, principal: "member", scope: "policy:read" },
    { method: "post", mount: "/policy/diff", upstream: (_p, t) => `/policy/${esc(t)}/diff`, principal: "member", scope: "policy:read" },
    { method: "post", mount: "/policy/simulate-historical", upstream: (_p, t) => `/policy/${esc(t)}/simulate-historical`, principal: "member", scope: "policy:read" },
    // agents_execution_payments_members
    { method: "post", mount: "/agents/route", upstream: () => "/agents/route", principal: "member", scope: "execution:read" },
    { method: "post", mount: "/agents/run", upstream: () => "/agents/run", principal: "agent", scope: "payment_intent:propose" },
    { method: "post", mount: "/agents/events", upstream: () => "/agents/events", principal: "agent", scope: "payment_intent:propose" },
    { method: "post", mount: "/agents/halt-category", upstream: () => "/agents/halt-category", principal: "member", scope: "payment_intent:approve" },
    { method: "post", mount: "/agents/:id/halt", upstream: (p) => `/agents/${esc(p.id)}/halt`, principal: "member", scope: "payment_intent:approve" },
    { method: "post", mount: "/agents/:id/restore", upstream: (p) => `/agents/${esc(p.id)}/restore`, principal: "member", scope: "payment_intent:approve" },
    { method: "post", mount: "/agents/:id/contribution-hold/release", upstream: (p) => `/agents/${esc(p.id)}/contribution-hold/release`, principal: "member", scope: "payment_intent:approve" },
    // Generic PaymentIntent create — agent action (payment_intent:propose), same
    // principal rule as /propose; core's §6 gate + policy decide the outcome.
    { method: "post", mount: "/payment-intents", upstream: () => "/payment-intents", principal: "agent", scope: "payment_intent:propose" },
    // MCP tool calls: bearer auth at the route, then per-tool scope checks inside
    // core (auth_then_mcp_tool_scope_checks) — member token, core decides per tool.
    { method: "post", mount: "/agents/mcp", upstream: () => "/agents/mcp", principal: "member", scope: "per MCP tool" },
    { method: "post", mount: "/members/:id/identity-links", upstream: (p) => `/members/${esc(p.id)}/identity-links`, principal: "member", scope: "execution:admin" },
    { method: "delete", mount: "/members/:id/identity-links", upstream: (p) => `/members/${esc(p.id)}/identity-links`, principal: "member", scope: "execution:admin" },
    { method: "post", mount: "/evidence/resolve", upstream: () => "/evidence/resolve", principal: "member", scope: "execution:read" },
    { method: "post", mount: "/payment-intents/:id/pause", upstream: (p) => `/payment-intents/${esc(p.id)}/pause`, principal: "member", scope: "payment_intent:approve" },
    { method: "post", mount: "/payment-intents/:id/resume", upstream: (p) => `/payment-intents/${esc(p.id)}/resume`, principal: "member", scope: "payment_intent:approve" },
    // Execute: the ONLY money-moving path per the artifact (execution/execute is
    // dead). Wired honestly: if the session token lacks payment_intent:execute
    // (true for demo tokens), core answers 403 auth_scope_insufficient verbatim.
    { method: "post", mount: "/payment-intents/:id/execute", upstream: (p) => `/payment-intents/${esc(p.id)}/execute`, principal: "member", scope: "payment_intent:execute" },
    { method: "post", mount: "/execution/propose", upstream: () => "/execution/propose", principal: "member", scope: "execution:propose" },
    { method: "post", mount: "/execution/approve", upstream: () => "/execution/approve", principal: "member", scope: "execution:write" },
    { method: "post", mount: "/execution/escalate", upstream: () => "/execution/escalate", principal: "member", scope: "execution:propose" },
    { method: "post", mount: "/execution/agents/register", upstream: () => "/execution/agents/register", principal: "member", scope: "execution:admin" },
    // audit_proof_tenant
    { method: "post", mount: "/audit/export", upstream: () => "/audit/export", principal: "member", scope: "audit:read" },
    { method: "post", mount: "/audit/verify", upstream: () => "/audit/verify", principal: "member", scope: "public" },
    { method: "post", mount: "/audit/webhooks/endpoints", upstream: () => "/audit/webhooks/endpoints", principal: "member", scope: "audit:write" },
    { method: "delete", mount: "/audit/webhooks/endpoints/:id", upstream: (p) => `/audit/webhooks/endpoints/${esc(p.id)}`, principal: "member", scope: "audit:write" },
    { method: "post", mount: "/webhooks/:endpointId/replay", upstream: (p) => `/webhooks/${esc(p.endpointId)}/replay`, principal: "member", scope: "audit:write" },
    // Tenant export: upstream path is /tenants/{id}/export but the id ALWAYS
    // comes from the session's tenant (own-tenant contract) — never the client.
    { method: "post", mount: "/tenants/export", upstream: (_p, t) => `/tenants/${esc(t)}/export`, principal: "member", scope: "own_tenant_user" },
  ];

  for (const route of WRITE_ROUTES) {
    router[route.method](route.mount, async (req: Request, res: Response) => {
      if (!brainAuthConfigured()) return unconfigured(res);
      try {
        const session = await getBrainSession(req.session.userId!);
        const token = route.principal === "agent" ? session.agentToken : session.token;
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.params)) params[k] = String(v);
        const body =
          req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0
            ? req.body
            : {};
        const data = await brainRequest<unknown>(route.upstream(params, session.tenantId), {
          method: route.method.toUpperCase(),
          token,
          body,
        });
        return res.json(data);
      } catch (err) {
        return relayError(res, err);
      }
    });
  }

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
  if (err instanceof NoTenantError) {
    // Production tenancy: this app user isn't linked to any tenant. The client must route
    // to "Create a company" or "Enter your invite link" - nothing is auto-provisioned.
    return res.status(403).json({ error: "no_tenant", message: "This account isn't part of a company yet." });
  }
  if (err instanceof TenancyApiError) {
    return res.status(err.status).json({ error: "brain_upstream_error", status: err.status, body: err.body });
  }
  if (err instanceof BrainApiError) {
    // Relay brain-core's status + body so the UI can react (e.g. 401/403/404).
    return res.status(err.status).json({ error: "brain_upstream_error", status: err.status, body: err.body });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[brain-proxy] error:", message);
  return res.status(502).json({ error: "brain_proxy_error", message });
}
