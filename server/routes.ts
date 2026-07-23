import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { setupAuth, googleEnabled, requireAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { verifyMessage } from "viem";
import { createBrainProxyRouter } from "./brain/proxy";
import { getBrainSession, getBrainSessionProvisionedAt, getBrainSessionExpiresAt } from "./brain/auth";
import { brainTenancyMode } from "./brain/config";
import {
  listLedgerAccounts,
  listLedgerTransactions,
  listLedgerCounterparties,
  listLedgerInvoices,
  listObligations,
  listMembers,
  getApprovalPolicyFacts,
  listActions,
  getPaymentIntent,
  listAuditEvents,
  ingestRawDocument,
  extractRawDocument,
  askWikiQuestion,
  listTenantKeys,
  issueTenantKey,
  rotateTenantKey,
  revokeTenantKey,
  getTenantKeyUsage,
  brainErrorCode,
  BrainApiError,
  type BrainTenantKey,
  type IssuedTenantKeyResponse,
  type RawSourceType,
  type WikiEvidence,
} from "./brain/client";
import type { ExtractStatus } from "./storage";
import { generateNonce } from "./nonce";
import { brainAuthConfigured, platformServiceConfigured } from "./brain/config";
import {
  aggregateUsage,
  API_KEY_SCOPES,
  type UsageAuditEvent,
} from "./developers";
import { ANTHROPIC_MODEL } from "./anthropicModel";
import { isDegenerateWikiPayload } from "./wikiAnswerGuard";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * True if `s` is a JSON object/array, not prose. Used to catch brain-core
 * wiki/question answers that come back as structured data (e.g. forecasts)
 * instead of a written answer, so they can be humanized before being shown
 * to the user.
 */
export function looksLikeStructuredJson(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * brain-core's wiki/question sometimes answers a question with structured
 * JSON (e.g. a cash-flow forecast) instead of prose. Turn that into a short
 * written answer, keeping every number/date exactly as given. Falls back to
 * the raw JSON on any failure so this step can never make the response worse
 * than today.
 */
async function humanizeWikiAnswer(raw: string): Promise<string> {
  if (!looksLikeStructuredJson(raw)) return raw;
  if (!process.env.ANTHROPIC_API_KEY) return raw;

  try {
    const parsed = JSON.parse(raw.trim());
    const payload = parsed && typeof parsed === "object" && "answer" in parsed
      ? JSON.stringify(parsed.answer)
      : raw;
    /* Degenerate payload (structurally empty answer): calling the summarizer
       with nothing to summarize makes the model ask for input ("I don't see
       any JSON data…"), which would then be shown to the user. Return "" to
       signal "no usable answer" so the chat handler falls through to the
       ledger-grounding fallback instead. */
    if (isDegenerateWikiPayload(payload)) {
      return "";
    }
    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system:
        "You turn a structured financial result (JSON) into a concise, warm prose answer for a business owner. " +
        "Keep every number and date EXACTLY as given in the JSON — do not round, recompute, or drop any. " +
        "Format currency with a $ and thousands separators. No JSON, no code fences. " +
        "Write about 1-4 sentences, plus a short list only if it genuinely helps readability.",
      messages: [{ role: "user", content: payload }],
    });
    const text = (message.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)?.text?.trim();
    return text || raw;
  } catch (e) {
    console.warn("[Assistant] humanizeWikiAnswer failed, returning raw wiki answer:", (e as Error)?.message);
    return raw;
  }
}

const GOAL_REC_FALLBACK_DEFAULT =
  "Set a target tied to one of your live metrics (operating cash, monthly burn, or AR) and Brain will keep agents aligned to it.";
const GOAL_REC_FALLBACK: Record<string, string> = {
  "Pay Off Debt":
    "Target your highest-interest debt first. Paying it down fastest frees up the most monthly cash flow.",
  "Build Reserve":
    "Base your reserve target on a multiple of your monthly operating burn (e.g. 3-6 months) so it tracks real runway.",
  "Hit Milestone":
    "Pick a growth number tied to a metric you actually track (revenue, ARR, users) and Brain will pace agent activity toward it.",
  "Cut Spend":
    "Start with your largest recurring expense categories. Trimming there usually has the biggest monthly impact.",
  "Capital Deploy":
    "Point idle operating cash at a yield vault or a specific agent budget instead of letting it sit unused.",
  "Other":
    "Pick a number you want to move (runway, ARR, AR collected, burn) and Brain will translate it into agent budgets and policies.",
};

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─────────────────────────────────────────────────────────────
  // AUTH (session + email/password + Google OAuth)
  // ─────────────────────────────────────────────────────────────
  setupAuth(app);

  // ─────────────────────────────────────────────────────────────
  // BRAIN-CORE BFF PROXY (session → tenant JWT → api.brain.fi)
  // Reads flow through here; the browser never sees a brain-core JWT.
  // ─────────────────────────────────────────────────────────────
  app.use("/api/brain", createBrainProxyRouter());

  // ─────────────────────────────────────────────────────────────
  // DEVELOPERS (API keys, tenants read, usage aggregation)
  //
  // API keys are brain-core-issued (PR #309: POST/GET /tenants/:id/keys,
  // POST /keys/:id/rotate, DELETE /keys/:id, GET /tenants/:id/usage).
  // The platform stores NOTHING key-related: list/issue/rotate/revoke and
  // per-key usage all proxy to brain-core over the MEMBER token, and the
  // plaintext secret is relayed from the create/rotate response exactly
  // once. While brain-core's key flag (BRAIN_API_KEY_AUTH_ENABLED) is off
  // the routes 404 route_not_found — surfaced honestly as 503
  // keys_api_unavailable, never a local fallback.
  // Webhooks are explicitly excluded from this section (v2).
  // ─────────────────────────────────────────────────────────────

  const createKeySchema = z.object({
    name: z.string().trim().min(1).max(80),
    environment: z.enum(["sandbox", "live"]),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  });

  /** brain-core key → camelCase wire shape. Masked display is built
   * CLIENT-side from keyPrefix + keyLast4 (per the PR #309 contract). */
  const toDevKey = (k: BrainTenantKey) => ({
    id: k.id,
    name: k.name,
    environment: k.environment,
    scopes: k.scopes ?? [],
    keyPrefix: k.key_prefix,
    keyLast4: k.key_last4,
    createdAt: k.created_at ?? null,
    lastUsedAt: k.last_used_at ?? null,
    revokedAt: k.revoked_at ?? null,
    rotatedFromId: k.rotated_from_id ?? null,
    status: (k.status === "revoked" || k.revoked_at) ? "revoked" : "active",
  });

  /** The one-time plaintext from an issue/rotate response (field name tolerant). */
  const issuedPlaintext = (r: IssuedTenantKeyResponse): string | null => {
    for (const f of ["secret", "plaintext", "key_secret", "api_key"]) {
      const v = (r as Record<string, unknown>)[f];
      if (typeof v === "string" && v.startsWith("brain_sk_")) return v;
    }
    const keyObj = r.key as unknown as Record<string, unknown> | undefined;
    return keyObj && typeof keyObj.secret === "string" ? keyObj.secret : null;
  };

  /** Map brain-core key-API errors to honest platform responses.
   * route_not_found = the upstream key flag is off → 503 keys_api_unavailable
   * (the UI shows a "not yet enabled" state and auto-recovers when it flips). */
  function sendKeyApiError(res: Response, error: unknown, action: string): void {
    if (error instanceof BrainApiError) {
      const code = brainErrorCode(error);
      if (code === "route_not_found") {
        res.status(503).json({
          error: "keys_api_unavailable",
          message: "The brain-core API-key service isn't enabled yet. Keys become available as soon as it is — no action needed on your side.",
        });
        return;
      }
      if (code === "api_key_not_found" || error.status === 404) {
        res.status(404).json({ error: "api_key_not_found", message: "This key no longer exists — it may already have been rotated or revoked." });
        return;
      }
      if (code === "rate_limited" || error.status === 429) {
        res.status(429).json({ error: "rate_limited", message: "Rate limit hit (600 requests per 60s per key). Try again shortly." });
        return;
      }
      if (code === "auth_invalid_key" || error.status === 401) {
        res.status(401).json({ error: "auth_invalid_key", message: "The key is invalid or revoked." });
        return;
      }
      res.status(error.status >= 500 ? 502 : error.status).json({ error: code ?? "brain_upstream_error", status: error.status });
      return;
    }
    console.error(`Developers ${action} error:`, error);
    res.status(500).json({ error: `Failed to ${action}` });
  }

  /** Member session (token + tenantId) or an honest 503 if unconfigured. */
  async function requireBrainMemberSession(req: Request, res: Response): Promise<{ token: string; tenantId: string } | null> {
    if (!brainAuthConfigured()) {
      res.status(503).json({
        error: "brain_unconfigured",
        message: "brain-core token source not configured (set BRAIN_DEMO_PROVISION_SECRET).",
      });
      return null;
    }
    return await getBrainSession(req.session.userId!);
  }

  // GET /api/developers/keys - brain-core key list (masked fields only).
  app.get("/api/developers/keys", requireAuth, async (req, res) => {
    try {
      const session = await requireBrainMemberSession(req, res);
      if (!session) return;
      const { keys } = await listTenantKeys(session.token, session.tenantId);
      return res.json({ keys: (keys ?? []).map(toDevKey) });
    } catch (error) {
      return sendKeyApiError(res, error, "list keys");
    }
  });

  // POST /api/developers/keys - issue via brain-core. Plaintext relayed ONCE.
  // Live keys still require production tenancy readiness (linked tenant).
  app.post("/api/developers/keys", requireAuth, async (req, res) => {
    const parsed = createKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const { name, environment, scopes } = parsed.data;
    try {
      if (environment === "live") {
        const identity = await storage.getBrainIdentity(req.session.userId!);
        if (!platformServiceConfigured() || !identity) {
          return res.status(403).json({
            error: "live_not_available",
            message: "Live keys require a production tenant. Request access to go live.",
          });
        }
      }
      const session = await requireBrainMemberSession(req, res);
      if (!session) return;
      const issued = await issueTenantKey(session.token, session.tenantId, { name, environment, scopes });
      const plaintext = issuedPlaintext(issued);
      if (!issued.key || !plaintext) {
        console.error("Issue key: unexpected brain-core response shape", Object.keys(issued ?? {}));
        return res.status(502).json({ error: "unexpected_upstream_shape", message: "brain-core issued a key but the response shape was unexpected." });
      }
      return res.status(201).json({ key: toDevKey(issued.key), plaintext });
    } catch (error) {
      return sendKeyApiError(res, error, "create key");
    }
  });

  // POST /api/developers/keys/:id/rotate - brain-core atomic revoke + reissue.
  // 404 api_key_not_found on double-rotate (idempotent-unsafe upstream).
  app.post("/api/developers/keys/:id/rotate", requireAuth, async (req, res) => {
    try {
      const session = await requireBrainMemberSession(req, res);
      if (!session) return;
      const issued = await rotateTenantKey(session.token, String(req.params.id));
      const plaintext = issuedPlaintext(issued);
      if (!issued.key || !plaintext) {
        console.error("Rotate key: unexpected brain-core response shape", Object.keys(issued ?? {}));
        return res.status(502).json({ error: "unexpected_upstream_shape", message: "brain-core rotated the key but the response shape was unexpected." });
      }
      return res.json({ key: toDevKey(issued.key), plaintext });
    } catch (error) {
      return sendKeyApiError(res, error, "rotate key");
    }
  });

  // DELETE /api/developers/keys/:id - brain-core revoke (204 on success).
  // 404 api_key_not_found if already revoked (double-click) — handled client-side.
  app.delete("/api/developers/keys/:id", requireAuth, async (req, res) => {
    try {
      const session = await requireBrainMemberSession(req, res);
      if (!session) return;
      await revokeTenantKey(session.token, String(req.params.id));
      return res.status(204).end();
    } catch (error) {
      return sendKeyApiError(res, error, "revoke key");
    }
  });

  // GET /api/developers/key-usage?environment=&keyId= - brain-core per-key
  // usage attribution (30d window). keyId optional: omit for the tenant-wide
  // Usage page, include for a single key's detail modal.
  app.get("/api/developers/key-usage", requireAuth, async (req, res) => {
    const envParsed = z.enum(["sandbox", "live"]).safeParse(req.query.environment ?? "sandbox");
    if (!envParsed.success) return res.status(400).json({ error: "invalid_environment" });
    try {
      const session = await requireBrainMemberSession(req, res);
      if (!session) return;
      const usage = await getTenantKeyUsage(session.token, session.tenantId, {
        window: "30d",
        environment: envParsed.data,
        key_id: typeof req.query.keyId === "string" ? req.query.keyId : undefined,
      });
      return res.json({
        window: usage.window ?? "30d",
        totalEvents: usage.total_events ?? 0,
        keys: (usage.keys ?? []).map((k) => ({
          keyId: k.key_id,
          environment: k.environment,
          eventCount: k.event_count ?? 0,
          firstEventAt: k.first_event_at ?? null,
          lastEventAt: k.last_event_at ?? null,
        })),
      });
    } catch (error) {
      return sendKeyApiError(res, error, "load key usage");
    }
  });

  // GET /api/developers/tenants - read over the EXISTING tenancy layer. Demo mode
  // shows the live demo tenant honestly (ephemeral, creation N/A); production mode
  // shows the durable brain_identities mapping. Creation stays on the existing
  // POST /api/brain/tenants path (NOT idempotent — never duplicated here).
  app.get("/api/developers/tenants", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const mode = brainTenancyMode();
    try {
      if (mode === "production") {
        const identity = await storage.getBrainIdentity(userId);
        return res.json({
          mode,
          canCreate: platformServiceConfigured() && !identity,
          // Single readiness signal for live keys — MUST match the gate on
          // POST /api/developers/keys so the UI never offers a create that 403s.
          liveKeysAvailable: platformServiceConfigured() && !!identity,
          tenants: identity
            ? [{
                id: identity.tenantId,
                companyName: identity.companyName,
                environment: "live",
                createdAt: identity.linkedAt ? identity.linkedAt.toISOString() : null,
                ephemeral: false,
              }]
            : [],
        });
      }
      // Demo mode: the tenant is the provisioned demo tenant of the current session.
      if (!brainAuthConfigured()) {
        return res.json({ mode, canCreate: false, liveKeysAvailable: false, tenants: [] });
      }
      const { tenantId } = await getBrainSession(userId);
      // Real per-session provision timestamp recorded when the session cache
      // entry was created — never fabricated (null only if the cache is gone).
      const provisionedAt = getBrainSessionProvisionedAt(userId);
      // Demo tenants are ephemeral: the session token expiry is when the tenant
      // effectively resets (a refresh provisions a fresh tenant). Real expiry
      // from the token source — null if the cache is gone.
      const expiresAt = getBrainSessionExpiresAt(userId);
      return res.json({
        mode,
        canCreate: false,
        liveKeysAvailable: false,
        tenants: [{
          id: tenantId,
          companyName: null,
          environment: "sandbox",
          createdAt: provisionedAt ? new Date(provisionedAt).toISOString() : null,
          ephemeral: true,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }],
      });
    } catch (error: any) {
      console.error("List tenants error:", error);
      return res.status(500).json({ error: "Failed to load tenants" });
    }
  });

  // GET /api/developers/usage?window=30 - server-side aggregation over REAL
  // brain-core audit events (member token via the BFF session). No analytics
  // pipeline, no mock data; empty tenant → honest zeros.
  app.get("/api/developers/usage", requireAuth, async (req, res) => {
    const windowDays = Math.min(Math.max(parseInt(String(req.query.window ?? "30"), 10) || 30, 1), 90);
    const envParsed = z.enum(["sandbox", "live"]).safeParse(req.query.environment ?? "sandbox");
    if (!envParsed.success) {
      return res.status(400).json({ error: "invalid_environment" });
    }
    const environment = envParsed.data;
    // Environment attribution: brain-core doesn't tag audit events with an API
    // environment, but the tenancy mode determines it unambiguously — demo-mode
    // tenants are sandbox, production-mode tenants are live. The non-matching
    // environment therefore honestly has zero traffic (not "unknown").
    const tenantEnvironment = brainTenancyMode() === "production" ? "live" : "sandbox";
    if (environment !== tenantEnvironment) {
      return res.json({ ...aggregateUsage([], windowDays), environment });
    }
    if (!brainAuthConfigured()) {
      return res.status(503).json({
        error: "brain_unconfigured",
        message: "brain-core token source not configured (set BRAIN_DEMO_PROVISION_SECRET).",
      });
    }
    try {
      const { token } = await getBrainSession(req.session.userId!);
      // Page through audit events (bounded: 5 pages × 200 = 1000 events max —
      // plenty for a 90-day demo/POC window; older events fall out of the window).
      const events: UsageAuditEvent[] = [];
      let after: string | undefined = undefined;
      for (let page = 0; page < 5; page++) {
        const batch = await listAuditEvents(token, { limit: 200, after });
        events.push(...batch.events.map((e) => ({
          id: e.id,
          layer: e.layer,
          action: e.action,
          created_at: e.created_at,
        })));
        if (!batch.next_cursor || batch.events.length === 0) break;
        after = batch.next_cursor;
      }
      return res.json({ ...aggregateUsage(events, windowDays), environment });
    } catch (error: any) {
      console.error("Developers usage error:", error);
      if (error instanceof BrainApiError) {
        return res.status(error.status).json({ error: "brain_upstream_error", status: error.status });
      }
      return res.status(502).json({ error: "Failed to aggregate usage" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // KEY-AUTHENTICATED PLATFORM API (v1)
  //
  // The raw `Authorization: Bearer brain_sk_...` key is forwarded STRAIGHT
  // to brain-core, which owns validation, scope enforcement, and per-key
  // rate limiting (600 req/60s). The platform never stores or resolves
  // keys locally. brain-core error codes (auth_invalid_key, rate_limited)
  // pass through with their upstream status.
  // ─────────────────────────────────────────────────────────────

  /** Extract the plaintext brain_sk_ key from the Authorization header. */
  function extractApiKeyBearer(req: Request):
    { ok: true; key: string } | { ok: false; status: number; error: string; message: string } {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { ok: false, status: 401, error: "missing_api_key", message: "Provide an API key: Authorization: Bearer brain_sk_..." };
    }
    const plaintext = authHeader.slice("Bearer ".length).trim();
    if (!plaintext.startsWith("brain_sk_")) {
      return { ok: false, status: 401, error: "invalid_api_key", message: "Malformed API key." };
    }
    return { ok: true, key: plaintext };
  }

  /** Relay a brain-core key-auth failure with its real code/status. */
  function sendKeyAuthedError(res: Response, error: unknown, path: string): void {
    if (error instanceof BrainApiError) {
      const code = brainErrorCode(error);
      if (code === "route_not_found" || (error.status === 401 && code !== "auth_invalid_key")) {
        // 401 without auth_invalid_key = brain-core's auth middleware doesn't
        // recognize brain_sk_ bearers yet (key flag off) — honest 503.
        res.status(503).json({
          error: "keys_api_unavailable",
          message: "brain-core key authentication isn't enabled yet. This endpoint starts working as soon as it is.",
        });
        return;
      }
      res.status(error.status).json({
        error: code ?? "brain_upstream_error",
        message: error.status === 429
          ? "Rate limit hit (600 requests per 60s per key). Try again shortly."
          : error.status === 401
            ? "The key is invalid or revoked."
            : undefined,
      });
      return;
    }
    console.error(`Key-authed ${path} error:`, error);
    res.status(500).json({ error: "request_failed" });
  }

  // GET /api/v1/ping — verifies the key authenticates against brain-core.
  // Valid = any authenticated response, including 403 insufficient scope
  // (the key is real, it just wasn't issued that scope).
  app.get("/api/v1/ping", async (req, res) => {
    const auth = extractApiKeyBearer(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error, message: auth.message });
    try {
      await listAuditEvents(auth.key, { limit: 1 });
      return res.json({ ok: true, timestamp: new Date().toISOString() });
    } catch (error) {
      if (error instanceof BrainApiError && error.status === 403) {
        // Authenticated but not scoped for audit:read — the key itself works.
        return res.json({ ok: true, note: "Key is valid (not scoped for audit:read).", timestamp: new Date().toISOString() });
      }
      return sendKeyAuthedError(res, error, "/api/v1/ping");
    }
  });

  // Key-authed DATA endpoints: pure pass-throughs. brain-core enforces the
  // key's scopes itself (ledger:read / audit:read) and 403s honestly.
  function registerKeyAuthedRead(
    path: string,
    fetcher: (apiKey: string, req: Request) => Promise<unknown>,
  ): void {
    app.get(path, async (req, res) => {
      const auth = extractApiKeyBearer(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error, message: auth.message });
      try {
        return res.json(await fetcher(auth.key, req));
      } catch (error) {
        return sendKeyAuthedError(res, error, path);
      }
    });
  }

  const clampLimit = (raw: unknown, fallback: number, max: number): number =>
    Math.min(Math.max(parseInt(String(raw ?? fallback), 10) || fallback, 1), max);

  // GET /api/v1/ledger/accounts — ledger:read (enforced by brain-core)
  registerKeyAuthedRead("/api/v1/ledger/accounts", (apiKey, req) =>
    listLedgerAccounts(apiKey, { limit: clampLimit(req.query.limit, 50, 200) }),
  );

  // GET /api/v1/ledger/transactions — ledger:read (enforced by brain-core)
  registerKeyAuthedRead("/api/v1/ledger/transactions", (apiKey, req) =>
    listLedgerTransactions(apiKey, { limit: clampLimit(req.query.limit, 50, 200) }),
  );

  // GET /api/v1/audit/events — audit:read (enforced by brain-core)
  registerKeyAuthedRead("/api/v1/audit/events", (apiKey, req) =>
    listAuditEvents(apiKey, {
      limit: clampLimit(req.query.limit, 50, 200),
      after: typeof req.query.after === "string" ? req.query.after : undefined,
    }),
  );

  // ─────────────────────────────────────────────────────────────
  // ACCOUNT / BANKING
  // ─────────────────────────────────────────────────────────────

  // DELETE /api/account - permanently delete the authenticated user's account and
  // all associated records. The target user is derived from the session - never the body.
  app.delete("/api/account", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await storage.deleteUserAccount({ userId });
      req.session.destroy(() => {});
      return res.json({ success: true, deleted: result });
    } catch (error: any) {
      console.error("Delete account error:", error);
      return res.status(500).json({ error: error?.message || "Failed to delete account" });
    }
  });

  // DELETE /api/account/data - purge all user-owned records (memories,
  // transactions, notifications) but KEEP the user account itself so the user
  // remains logged in and can rebuild their data from scratch.
  // The target user is derived from the session - never the body.
  app.delete("/api/account/data", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await storage.deleteUserData({ userId });
      return res.json({ success: true, deleted: result });
    } catch (error: any) {
      console.error("Delete data error:", error);
      return res.status(500).json({ error: error?.message || "Failed to delete data" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GOAL RECOMMENDATIONS (brain-grounded, Claude-phrased)
  // For the "New Goal" modal - given a category the user picks in
  // the "What's it for?" tabs, returns a 1–2 sentence personalised
  // recommendation grounded in the user's live brain-core Ledger
  // (via Wiki Q&A) and phrased by Claude. Falls back to a curated,
  // category-specific line when brain-core / Claude are unavailable.
  // ─────────────────────────────────────────────────────────────
  const goalRecCache = new Map<string, { text: string; at: number }>();
  const GOAL_REC_TTL_MS = 30 * 60 * 1000; // 30 minutes

  const GOAL_REC_SYSTEM = `You are Brain AI, the financial brain embedded in a neobank for businesses.
The user is creating a new goal and just picked a CATEGORY in the "What's it for?" tabs.
Given the user's real financial figures, return ONE concrete, numeric recommendation
(1–2 short sentences, max ~220 chars) tailored to that category - what target to
set and why, grounded in those actual numbers.

Rules:
- Plain prose, no markdown, no bullet points, no leading label.
- Reference only the real numbers provided (dollars, percentages, months); do not invent figures.
- Do not greet, do not restate the category. Just the recommendation.`;

  app.get("/api/goals/recommendation", requireAuth, async (req, res) => {
    const category = String(req.query.category ?? "").slice(0, 64);
    if (!category) return res.status(400).json({ error: "category required" });

    const cached = goalRecCache.get(category);
    if (cached && Date.now() - cached.at < GOAL_REC_TTL_MS) {
      return res.json({ text: cached.text, cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      // No LLM to phrase - prefer the curated, category-specific line (reads better
      // than a raw figure dump). Skip the grounding fetch since it would go unused.
      return res.json({ text: GOAL_REC_FALLBACK[category] ?? GOAL_REC_FALLBACK_DEFAULT, cached: false, fallback: true });
    }

    // Best-effort: ground the recommendation in the user's real brain-core Ledger
    // account balances (replaces the old hardcoded mock snapshot). Read directly
    // from /ledger/accounts - deterministic and correct, unlike a broad Wiki Q&A
    // which misreads "accounts". Silently ungrounded on failure so the
    // recommendation never breaks on the integration.
    let grounding = "";
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const { accounts } = await listLedgerAccounts(token, { limit: 50 });
      if (accounts.length > 0) {
        const lines = accounts.map(
          (a) => `- ${a.name} (${a.account_type}): ${a.current_balance ?? "?"} ${a.currency}`,
        );
        const usdTotal = accounts
          .filter((a) => a.currency === "USD" && a.current_balance != null)
          .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
        grounding =
          `Real account balances from Brain:\n${lines.join("\n")}\n` +
          `Total USD cash ≈ ${usdTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD.`;
      }
    } catch (e) {
      console.warn("[GoalRec] ledger grounding skipped:", (e as Error)?.message);
    }

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const context = grounding
        ? `The user's real financial figures from Brain (source of truth. Use only these, do not invent):\n${grounding}`
        : "No live financial figures are available; give general but actionable guidance for the category.";
      const message = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 220,
        system: GOAL_REC_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${context}\n\nCategory the user picked: "${category}".\n\nReturn the recommendation as plain text.`,
          },
        ],
      });
      const text = (message.content[0]?.type === "text" ? message.content[0].text : "").trim();
      const clean = text.replace(/^["'`]+|["'`]+$/g, "").trim();
      if (!clean) throw new Error("empty recommendation");
      goalRecCache.set(category, { text: clean, at: Date.now() });
      return res.json({ text: clean, cached: false, grounded: !!grounding });
    } catch (err) {
      console.error("[GoalRec] generation failed:", err);
      return res.json({
        text: GOAL_REC_FALLBACK[category] ?? GOAL_REC_FALLBACK_DEFAULT,
        cached: false,
        fallback: true,
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // BRAIN ASSISTANT CHAT (Claude-powered)
  // Powers the right-hand Brain Assistant panel. Takes the running
  // conversation and returns Claude's next reply.
  // ─────────────────────────────────────────────────────────────
  const ASSISTANT_SYSTEM = `You are Brain, the AI financial assistant inside Brain Finance, a programmable neobank for businesses on Base L2.
Help the user with their finances, accounts, transactions, crypto basics, and how to use the platform.
Be concise, warm, and practical: default to 1–4 short sentences unless the user asks for more detail.
Use plain prose (no markdown headings or bullet dumps unless genuinely helpful).
You can explain concepts and surface general guidance, but do not give regulated or individualized investment advice. Instead point users to their own data and let them decide.`;

  const assistantChatSchema = z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(8000),
        }),
      )
      .min(1)
      .max(50),
  });

  /**
   * Deterministic ledger grounding (accounts, recent txs, counterparties, …),
   * fed to local Anthropic. This is now the FALLBACK path for /api/assistant/chat
   * (used when brain-core's wiki/question is unavailable) and still the primary
   * grounding for /api/rules/suggestions.
   *
   * Chat's primary path is brain-core's own POST /wiki/question: it grounds with
   * brain-core's server-side key, filters evidence against real ledger ids
   * (anti-hallucination), and returns per-answer cited evidence — a meaningfully
   * different (and better) contract than the old fuzzy Wiki Q&A this comment used
   * to warn about, which misread "accounts" and hallucinated balances client-side.
   */
  async function buildGrounding(token: string, tenantId: string, _question: string): Promise<{ text: string; sources: WikiEvidence[]; available: boolean }> {
    // Fetch ALL tenant data in parallel - the assistant should have the full picture.
    const [accounts, txs, cps, invoices, obligations, members, policy, actions, auditEvents] = await Promise.allSettled([
      listLedgerAccounts(token, { limit: 50 }),
      listLedgerTransactions(token, { limit: 50 }),
      listLedgerCounterparties(token),
      listLedgerInvoices(token, { limit: 20 }),
      listObligations(token, { limit: 20 }),
      listMembers(token),
      getApprovalPolicyFacts(token, tenantId),
      listActions(token),
      listAuditEvents(token, { limit: 20 }),
    ]);

    let text = "";
    const sources: WikiEvidence[] = [];

    // ─── Accounts ───
    const allAccounts = accounts.status === "fulfilled" ? accounts.value.accounts : [];
    if (allAccounts.length > 0) {
      const lines = allAccounts.map((a) => {
        const bal = a.current_balance != null ? Number(a.current_balance).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "unknown";
        return `  • ${a.name} (${a.currency}) - balance ${bal} - status: ${a.status} - id: ${a.id}`;
      });
      const usdTotal = allAccounts
        .filter((a) => a.currency === "USD" && a.current_balance != null)
        .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);
      text += `Accounts (source of truth):\n${lines.join("\n")}\nTotal USD cash ≈ ${usdTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD.\n\n`;
      for (const a of allAccounts) {
        sources.push({ entityId: a.id, entityType: "account", excerpt: `${a.name} - ${a.currency} ${a.current_balance ?? "n/a"}` });
      }
    }

    // ─── Transactions ───
    const allTxs = txs.status === "fulfilled" ? txs.value.transactions : [];
    if (allTxs.length > 0) {
      const recent = allTxs.slice(0, 10);
      const lines = recent.map((t) => {
        const dir = t.direction;
        const amt = Number(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 });
        const date = t.transaction_date;
        return `  • ${dir} ${t.currency} ${amt} on ${date}${t.description_normalized ? ` - ${t.description_normalized}` : ""} - id: ${t.id}`;
      });
      text += `Recent transactions (last ${recent.length}):\n${lines.join("\n")}\n\n`;
      for (const t of recent) {
        sources.push({ entityId: t.id, entityType: "transaction", excerpt: `${t.direction} ${t.currency} ${t.amount}` });
      }
    }

    // ─── Counterparties ───
    if (cps.status === "fulfilled" && cps.value.counterparties.length > 0) {
      const lines = cps.value.counterparties.slice(0, 20).map((c) => `  • ${c.name} - id: ${c.id}`);
      text += `Counterparties:\n${lines.join("\n")}\n\n`;
    }

    // ─── Invoices ───
    if (invoices.status === "fulfilled" && invoices.value && invoices.value.invoices.length > 0) {
      const lines = invoices.value.invoices.slice(0, 10).map((inv) => {
        const amt = Number(inv.amount_due).toLocaleString("en-US", { minimumFractionDigits: 2 });
        return `  • Invoice #${inv.invoice_number} - ${inv.currency} ${amt} - due ${inv.due_date ?? "unknown"} - status: ${inv.status} - id: ${inv.id}`;
      });
      text += `Invoices:\n${lines.join("\n")}\n\n`;
      for (const inv of invoices.value.invoices.slice(0, 10)) {
        sources.push({ entityId: inv.id, entityType: "invoice", excerpt: `Invoice #${inv.invoice_number} - ${inv.currency} ${inv.amount_due}` });
      }
    }

    // ─── Obligations ───
    if (obligations.status === "fulfilled" && obligations.value && obligations.value.obligations.length > 0) {
      const lines = obligations.value.obligations.slice(0, 10).map((o) => {
        const amt = Number(o.amount_due).toLocaleString("en-US", { minimumFractionDigits: 2 });
        return `  • ${o.direction} ${o.currency} ${amt} - due ${o.due_date ?? "unknown"} - status: ${o.status} - id: ${o.id}`;
      });
      text += `Upcoming obligations:\n${lines.join("\n")}\n\n`;
      for (const o of obligations.value.obligations.slice(0, 10)) {
        sources.push({ entityId: o.id, entityType: "obligation", excerpt: `${o.direction} ${o.currency} ${o.amount_due}` });
      }
    }

    // ─── Team members ───
    if (members.status === "fulfilled" && members.value && members.value.members.length > 0) {
      const lines = members.value.members.map((m) =>
        `  • ${m.displayName} (${m.email}) - role: ${m.role} - ${m.active ? "active" : "inactive"} - id: ${m.id}`
      );
      text += `Team members:\n${lines.join("\n")}\n\n`;
      for (const m of members.value.members) {
        sources.push({ entityId: m.id, entityType: "member", excerpt: `${m.displayName} - ${m.role}` });
      }
    }

    // ─── Approval policy ───
    if (policy.status === "fulfilled" && policy.value) {
      const p = policy.value;
      text += `Approval policy (v${p.version}):\n  • quorum required: ${p.quorumRequired}\n  • second-approval threshold: ${p.secondApprovalThreshold?.value ?? "none"} ${p.secondApprovalThreshold?.currency ?? ""}\n  • rules:\n`;
      for (const r of p.rules.slice(0, 5)) {
        text += `    - rule ${r.id}: execute=${r.execute ?? "none"}${r.require ? ` require=${r.require}` : ""}${r.when?.["amount.gt"] ? ` when amount.gt ${r.when["amount.gt"].value} ${r.when["amount.gt"].currency ?? "USD"}` : ""}\n`;
      }
      text += "\n";
    }

    // ─── Pending approvals (Needs Review queue) ───
    if (actions.status === "fulfilled" && actions.value && actions.value.data.length > 0) {
      const pending = actions.value.data.filter((a) => a.status === "needs_approval" || a.status === "pending_approval").slice(0, 5);
      if (pending.length > 0) {
        // Fan out to full PaymentIntent details (bounded by the slice above).
        const piResults = await Promise.allSettled(
          pending.map((a) => getPaymentIntent(token, a.id)),
        );
        const piLines: string[] = [];
        for (let i = 0; i < pending.length; i++) {
          const a = pending[i];
          const pi = piResults[i];
          if (pi.status === "fulfilled" && pi.value) {
            const p = pi.value;
            const amt = Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2 });
            const cpNote = p.destination_counterparty_id ? ` to counterparty ${p.destination_counterparty_id}` : "";
            const invNote = p.invoice_id ? ` (invoice ${p.invoice_id})` : "";
            piLines.push(`  • PaymentIntent ${p.id} - ${p.action_type} - ${p.currency} ${amt}${cpNote}${invNote} - status: ${p.status}`);
            sources.push({ entityId: p.id, entityType: "payment_intent", excerpt: `${p.action_type} ${p.currency} ${p.amount} - ${p.status}` });
          } else {
            piLines.push(`  • PaymentIntent ${a.id} - status: ${a.status}`);
            sources.push({ entityId: a.id, entityType: "payment_intent", excerpt: `PaymentIntent ${a.id} - ${a.status}` });
          }
        }
        text += `Pending approvals (${pending.length} items in review queue):\n${piLines.join("\n")}\n\n`;
      }
    }

    // ─── Recent audit trail ───
    if (auditEvents.status === "fulfilled" && auditEvents.value && auditEvents.value.events.length > 0) {
      const recent = auditEvents.value.events.slice(0, 10);
      const lines = recent.map((e) => {
        const actor = e.actor ?? "system";
        return `  • ${e.action} by ${actor} at ${e.created_at} (layer: ${e.layer}, hash: ${e.event_hash.slice(0, 8)}…)`;
      });
      text += `Recent audit trail (last ${recent.length} events):\n${lines.join("\n")}\n\n`;
      for (const e of recent) {
        sources.push({ entityId: e.id, entityType: "audit_event", excerpt: `${e.action} by ${e.actor ?? "system"}` });
      }
    }

    const hasLedgerData = text.trim().length > 0;
    if (!hasLedgerData) {
      return { text: "", sources: [], available: false };
    }

    return { text: text.trim(), sources, available: true };
  }

  /**
   * Returns true if the question is about concrete financial data (balances,
   * accounts, transactions, amounts).  When no ledger data is available the
   * assistant must refuse rather than hallucinate.
   */
  function isDataQuestion(q: string): boolean {
    const dataWords = /\b(balance|account|transaction|how much|spending|income|revenue|expense|cash|usd|crypto|btc|eth|wire|transfer|paid|received|deposit|withdraw|invoice|bill|payable|receivable|ap|ar|due|overdue|unpaid|upcoming|scheduled|owe|owed|obligation|commitment|team|member|user|approval|approver|policy|rule|threshold|pending|payment|intent|review|audit|activity|log|trail)\b/i;
    return dataWords.test(q);
  }

  app.post("/api/assistant/chat", requireAuth, async (req, res) => {
    const parsed = assistantChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_messages" });
    }

    const lastUserContent = parsed.data.messages[parsed.data.messages.length - 1].content;

    // Record every question locally so the audit trail is complete even when
    // the Anthropic fallback (no brain-core interaction) is taken.
    // Best-effort: a local write failure must never break the assistant.
    try {
      await storage.recordAssistantQuestion({
        userId: req.session.userId!,
        question: lastUserContent,
      });
    } catch (err) {
      console.warn("[Assistant] local question record failed (non-fatal):", (err as Error).message);
    }

    // ─── PRIMARY: brain-core wiki/question — per-answer cited evidence, grounded
    // server-side with brain-core's own key. ponytail: wiki/question takes a
    // single question, so multi-turn follow-up context (earlier messages) is
    // dropped here; revisit if users complain about lost follow-ups. ───
    try {
      const { token } = await getBrainSession(req.session.userId!);
      const wiki = await askWikiQuestion(token, lastUserContent);
      if (wiki.raw.trim().length > 0) {
        /* Only return the wiki result when there is real content. An envelope
           with an empty/null answer humanizes to "" — treat that as "wiki
           could not answer" and fall through to ledger grounding below. */
        const reply = await humanizeWikiAnswer(wiki.raw);
        if (reply.trim().length > 0) {
          return res.json({
            reply,
            sources: wiki.evidence,
            grounded: true,
            engine: "wiki",
          });
        }
      }
    } catch (e) {
      console.warn("[Assistant] wiki/question failed, falling back to ledger grounding:", (e as Error)?.message);
    }

    // ─── FALLBACK: deterministic ledger grounding + local Anthropic ───
    let grounding = "";
    let sources: WikiEvidence[] = [];
    let dataAvailable = false;
    try {
      const { token, tenantId } = await getBrainSession(req.session.userId!);
      const built = await buildGrounding(token, tenantId, lastUserContent);
      grounding = built.text;
      sources = built.sources;
      dataAvailable = built.available;
    } catch (e) {
      console.warn("[Assistant] ledger grounding failed:", (e as Error)?.message);
    }

    const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const dataUnavailable = !dataAvailable && isDataQuestion(lastUser);

    const system = grounding
      ? `${ASSISTANT_SYSTEM}\n\nGrounded financial data from Brain (the user's real accounts, transactions, invoices, upcoming obligations, team members, approval policy, pending approvals and payment intents, and recent audit trail). Treat this as the source of truth and answer from it, citing concrete figures. Do not invent numbers:\n${grounding}`
      : ASSISTANT_SYSTEM;

    if (!process.env.ANTHROPIC_API_KEY) {
      if (grounding) {
        return res.json({
          reply: `Assistant is offline (no API key configured), so here is your live data snapshot instead:\n\n${grounding}`,
          sources,
          grounded: true,
          assistantOffline: true,
          engine: "grounding-fallback",
        });
      }
      return res.status(503).json({
        error: "assistant_unconfigured",
        reply:
          "I'm not connected to my brain yet. An ANTHROPIC_API_KEY needs to be configured before I can answer live.",
        sources: [],
      });
    }

    // ─── Data-specific question plus no data means refuse. Do not hallucinate ───
    if (dataUnavailable) {
      return res.json({
        reply: "I can't access your live account data right now. This usually means your brain-core session is still initializing or the connection is warming up. Try again in a moment, or check your Finances page to confirm your accounts are connected.",
        sources: [],
        grounded: false,
        ungrounded: true,
        engine: "grounding-fallback",
      });
    }

    try {
      const message = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system,
        messages: parsed.data.messages,
      });
      const reply = (message.content.find((b) => b.type === "text") as
        | Anthropic.TextBlock
        | undefined)?.text?.trim();
      return res.json({
        reply: reply || "Sorry, I couldn't generate a response. Please try again.",
        sources,
        grounded: grounding.length > 0,
        engine: "anthropic",
      });
    } catch (err) {
      console.error("[Assistant] chat failed:", err);
      const status = (err as { status?: number })?.status;
      const e = err as {
        message?: string;
        error?: { message?: string; error?: { message?: string } };
      };
      const apiMsg =
        e?.error?.error?.message ?? e?.error?.message ?? e?.message ?? "";
      if (status === 400 && /credit balance/i.test(apiMsg)) {
        return res.status(402).json({
          error: "assistant_no_credit",
          reply:
            "I can't answer right now. The Anthropic API key has no available credit. Please add credits or billing at console.anthropic.com to enable live answers.",
          sources: [],
        });
      }
      return res.status(500).json({
        error: "assistant_failed",
        reply: "Something went wrong reaching the assistant. Please try again.",
        sources: [],
      });
    }
  });

  // GET local assistant questions (covers Anthropic fallback where brain-core
  // emits no audit event). Merged client-side with brain-core audit events.
  app.get("/api/assistant/questions", requireAuth, async (req, res) => {
    const questions = await storage.listAssistantQuestions(req.session.userId!, 100);
    return res.json({ questions });
  });

  // ─────────────────────────────────────────────────────────────
  // SIWE AUTH
  // ─────────────────────────────────────────────────────────────
  app.get("/api/auth/nonce", async (req, res) => {
    try {
      const nonce = generateNonce();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await storage.createSiweNonce({ nonce, expiresAt });
      return res.json({ nonce });
    } catch (error) {
      return res.status(500).json({ error: "Failed to generate nonce" });
    }
  });

  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { address, message, signature } = req.body;
      if (!address || !message || !signature) {
        return res.status(400).json({ error: "address, message, and signature required" });
      }
      // Bind the signature to the claimed address over the exact signed message (EIP-191
      // personal_sign). Without this, anyone could authenticate as any wallet address.
      let validSig = false;
      try {
        validSig = await verifyMessage({
          address: address as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
      } catch {
        validSig = false;
      }
      if (!validSig) return res.status(401).json({ error: "Invalid signature" });

      // Single-use nonce: the message must carry a nonce we issued, not yet consumed or expired.
      // Consume it first so a replay of the same signed message can't re-authenticate.
      const nonce = /^Nonce: (.+)$/m.exec(message)?.[1]?.trim();
      if (!nonce) return res.status(401).json({ error: "Missing nonce" });
      const nonceRecord = await storage.consumeSiweNonce(nonce);
      if (!nonceRecord) return res.status(401).json({ error: "Unknown or already-used nonce" });
      if (nonceRecord.expiresAt < new Date()) {
        return res.status(401).json({ error: "Nonce expired" });
      }
      // Defense-in-depth: the signed message must name this address.
      if (!message.includes(address)) return res.status(401).json({ error: "Address mismatch" });

      let user = await storage.getUserByWallet(address);
      if (!user) {
        user = await storage.createUser({ username: address.slice(0, 8) + "..." + address.slice(-4), password: "", walletAddress: address });
      }
      req.session.userId = user.id;
      return res.json({ success: true, user: { id: user.id, walletAddress: user.walletAddress, username: user.username } });
    } catch (error) {
      console.error("SIWE verify error:", error);
      return res.status(500).json({ error: "Authentication failed" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // PUBLIC CONFIG - exposes non-secret public keys to the frontend
  // ─────────────────────────────────────────────────────────────
  app.get("/api/config", (_req, res) => {
    return res.json({
      googleEnabled,
      // Production tenancy gate (Phase 2): tells SignupPage to run the company-signup
      // flow (register → create tenant) instead of the demo playground flow.
      tenancyProduction: brainTenancyMode() === "production",
    });
  });

  /* ──────────────────────────────────────────────────────────────────────
   *  Tool integrations  (Stripe wired; others coming soon)
   * ────────────────────────────────────────────────────────────────────── */

  app.get("/api/integrations/connections", requireAuth, async (req, res) => {
    try {
      const list = await storage.listToolConnections(req.session.userId!);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/integrations/stripe/connect", requireAuth, async (req, res) => {
    try {
      // Dynamic + untyped: server/stripe.ts is generated after the user
      // authorizes Stripe via the integrations flow.
      const stripeModulePath = "./stripe";
      const mod = await import(stripeModulePath).catch(() => null) as
        | { getUncachableStripeClient: () => Promise<unknown> }
        | null;
      const getUncachableStripeClient = mod?.getUncachableStripeClient;

      if (!getUncachableStripeClient) {
        return res.status(503).json({
          error: "Stripe integration is not configured yet on this Repl.",
          code: "not_configured",
        });
      }

      const stripe = (await getUncachableStripeClient()) as {
        accounts: { retrieve: () => Promise<{ id: string; business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } }; email?: string }> };
      };
      const account = await stripe.accounts.retrieve();
      const label =
        account.business_profile?.name ||
        account.settings?.dashboard?.display_name ||
        account.email ||
        account.id;

      const conn = await storage.upsertToolConnection({
        userId: req.session.userId!,
        toolId: "stripe",
        status: "connected",
        accountLabel: label,
        connectedAt: new Date().toISOString(),
      });
      res.json(conn);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message || "Stripe connection failed" });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   *  Plaid bank connections
   *  NOTE: registered BEFORE the generic `:toolId/disconnect` so the
   *  specific `/plaid/disconnect` handler wins for plaid.
   * ────────────────────────────────────────────────────────────────────── */

  app.get("/api/integrations/plaid/status", requireAuth, (_req, res) => {
    res.json({
      configured: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      env: process.env.PLAID_ENV ?? "sandbox",
    });
  });

  app.get("/api/integrations/plaid/connections", requireAuth, async (req, res) => {
    try {
      const list = await storage.listBankConnections(req.session.userId!);
      // Strip access_token before returning to the client
      res.json(list.map(({ accessToken: _t, ...rest }) => rest));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/integrations/plaid/link-token", requireAuth, async (req, res) => {
    try {
      const { getPlaidClient, PLAID_PRODUCTS, PLAID_COUNTRIES } = await import("./plaid");
      const client = getPlaidClient();
      const result = await client.linkTokenCreate({
        user: { client_user_id: req.session.userId! },
        client_name: "Brain Finance",
        products: PLAID_PRODUCTS,
        country_codes: PLAID_COUNTRIES,
        language: "en",
      });
      res.json({ link_token: result.data.link_token, expiration: result.data.expiration });
    } catch (err) {
      const msg = (err as Error).message || "Failed to create Plaid link token";
      const isConfig = msg.includes("not configured");
      res.status(isConfig ? 503 : 502).json({
        error: msg,
        code: isConfig ? "not_configured" : "plaid_error",
      });
    }
  });

  app.post("/api/integrations/plaid/exchange", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        public_token: z.string().min(1),
        institution: z.object({ id: z.string().nullable().optional(), name: z.string() }).optional(),
      });
      const { public_token, institution } = schema.parse(req.body);

      const { getPlaidClient } = await import("./plaid");
      const client = getPlaidClient();

      const exch = await client.itemPublicTokenExchange({ public_token });
      const accessToken = exch.data.access_token;
      const itemId = exch.data.item_id;

      // Pull account metadata so the UI can show real names + masks
      const accountsResp = await client.accountsGet({ access_token: accessToken });
      const accounts = accountsResp.data.accounts.map(a => ({
        accountId: a.account_id,
        name: a.name,
        mask: a.mask ?? null,
        subtype: a.subtype ?? null,
        type: a.type ?? null,
      }));

      const inst = accountsResp.data.item.institution_id
        ? await client.institutionsGetById({
            institution_id: accountsResp.data.item.institution_id,
            country_codes: (await import("./plaid")).PLAID_COUNTRIES,
          }).then(r => r.data.institution).catch(() => null)
        : null;

      const conn = await storage.createBankConnection({
        userId: req.session.userId!,
        itemId,
        accessToken,
        institutionId: inst?.institution_id ?? institution?.id ?? null,
        institutionName: inst?.name ?? institution?.name ?? "Connected Bank",
        accounts,
        connectedAt: new Date().toISOString(),
      });

      const { accessToken: _t, ...safe } = conn;
      res.json(safe);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: err.errors });
      }
      res.status(502).json({ error: (err as Error).message || "Token exchange failed" });
    }
  });

  app.post("/api/integrations/plaid/disconnect", requireAuth, async (req, res) => {
    try {
      const parsed = z.object({ itemId: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "itemId required" });
      }
      const { itemId } = parsed.data;
      const userId = req.session.userId!;

      // Best-effort revoke at Plaid; even if it fails we still drop our copy
      try {
        const conns = await storage.listBankConnections(userId);
        const target = conns.find(c => c.itemId === itemId);
        if (target) {
          const { getPlaidClient } = await import("./plaid");
          await getPlaidClient().itemRemove({ access_token: target.accessToken });
        }
      } catch (revokeErr) {
        console.warn("[plaid] item revoke failed:", (revokeErr as Error).message);
      }

      const ok = await storage.removeBankConnection(userId, itemId);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   *  Source documents (uploaded files registered as an ingestion source)
   *  NOTE: only file metadata is persisted here - raw bytes are not stored.
   * ────────────────────────────────────────────────────────────────────── */

  app.get("/api/integrations/documents", requireAuth, async (req, res) => {
    try {
      const list = await storage.listSourceDocuments(req.session.userId!);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/integrations/documents", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(512),
        size: z.number().int().nonnegative().max(50 * 1024 * 1024 * 1024),
        mimeType: z.string().max(256).nullable().optional(),
        category: z.string().max(64).nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const doc = await storage.createSourceDocument({
        userId: req.session.userId!,
        name: parsed.name,
        size: parsed.size,
        mimeType: parsed.mimeType ?? null,
        category: parsed.category ?? null,
      });
      res.json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: err.errors });
      }
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * POST /api/integrations/documents/ingest - upload a file to Brain's ingestion
   * pipeline. The bytes stream in as the raw request body (Content-Type
   * application/octet-stream); metadata rides on the query string. We:
   *   1. register a local metadata record (no file bytes stored here),
   *   2. POST the bytes to brain-core /raw/ingest → store the returned raw_id,
   *   3. trigger /raw/{raw_id}/extract, tolerating 404 (endpoint not deployed →
   *      "unavailable") and 422 (unsupported file type / scanned image →
   *      "unsupported").
   * The brain session is keyed on req.session.userId so the resulting obligations
   * land in the SAME tenant the /api/brain/ledger/obligations read uses.
   */
  app.post(
    "/api/integrations/documents/ingest",
    requireAuth,
    express.raw({ type: "application/octet-stream", limit: "52mb" }),
    async (req, res) => {
      const q = z
        .object({
          filename: z.string().min(1).max(512),
          mimeType: z.string().max(256).optional(),
          category: z.string().max(64).optional(),
          sourceType: z.enum(["pdf_upload", "csv_upload"]),
        })
        .safeParse(req.query);
      if (!q.success) {
        return res.status(400).json({ error: "invalid_request", details: q.error.errors });
      }
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        return res.status(400).json({ error: "empty_file", message: "No file bytes received." });
      }
      const { filename, category, sourceType } = q.data;
      const mimeType = q.data.mimeType ?? "application/octet-stream";

      const userId = req.session.userId!;

      // 1. Local metadata record (bytes are NOT persisted here - they live in Brain).
      const doc = await storage.createSourceDocument({
        userId,
        name: filename,
        size: bytes.length,
        mimeType,
        category: category ?? null,
        sourceType,
        extractStatus: "pending",
      });

      // 2. Ingest bytes to brain-core.
      let rawId: string;
      try {
        const { token } = await getBrainSession(userId);
        const ingest = await ingestRawDocument(token, {
          sourceType: sourceType as RawSourceType,
          bytes: new Uint8Array(bytes),
          filename,
          mimeType,
        });
        rawId = ingest.raw_id;
        await storage.updateSourceDocumentExtraction(userId, doc.id, {
          rawId: ingest.raw_id,
          sha256: ingest.sha256,
          extractStatus: "ingested",
        });
      } catch (err) {
        const patch = { extractStatus: "failed" as ExtractStatus };
        const updated = await storage.updateSourceDocumentExtraction(userId, doc.id, patch);
        let message = err instanceof BrainApiError ? err.message : (err as Error).message;
        if (err instanceof BrainApiError && err.status === 403) {
          const body = err.body as Record<string, unknown> | undefined;
          const code = typeof body?.error === "object" && body.error && typeof (body.error as Record<string, unknown>).code === "string"
            ? (body.error as Record<string, unknown>).code
            : undefined;
          if (code === "auth_scope_insufficient") {
            message = "Document upload is not yet available on this demo environment. Brain is adding the required permission to the demo token.";
          }
        }
        return res.status(502).json({
          document: updated ?? { ...doc, ...patch },
          error: "ingest_failed",
          message,
        });
      }

      // 3. Trigger extraction - non-fatal; record the outcome as a status.
      let extractStatus: ExtractStatus = "extracting";
      let parsedId: string | null = null;
      let confidence: string | null = null;
      try {
        const { token } = await getBrainSession(userId);
        const extract = await extractRawDocument(token, rawId);
        extractStatus = "extracted";
        parsedId = extract.parsed_id;
        confidence = extract.confidence !== null ? String(extract.confidence) : null;
      } catch (err) {
        if (err instanceof BrainApiError && err.status === 422) {
          extractStatus = "unsupported"; // can't read this file type yet (e.g. scanned image)
        } else if (err instanceof BrainApiError) {
          // 404 = not deployed; 403 = token lacks raw:write scope; 500 = under construction.
          // All map to "unavailable" so the UI says "extraction coming soon" instead of "failed".
          console.warn(`[document-extract] rawId=${rawId} status=${err.status} body=${JSON.stringify(err.body)}`);
          extractStatus = "unavailable";
        } else {
          console.warn(`[document-extract] rawId=${rawId} network error:`, (err as Error).message);
          extractStatus = "unavailable";
        }
      }
      const updated = await storage.updateSourceDocumentExtraction(userId, doc.id, {
        extractStatus,
        parsedId,
        confidence,
      });
      return res.json({ document: updated ?? doc });
    },
  );

  app.post("/api/integrations/documents/:id/delete", requireAuth, async (req, res) => {
    try {
      const ok = await storage.removeSourceDocument(req.session.userId!, req.params.id as string);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   *  User rules - rules authored via the "New rule" creator, persisted per
   *  tenant (associated with the logged-in account via the session).
   * ────────────────────────────────────────────────────────────────────── */

  const userRulePayload = z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(256),
    summary: z.string().max(512).optional(),
    kind: z.enum(["automation", "guardrail", "always_on"]).optional(),
    policyId: z.string().min(1).max(128),
    active: z.boolean().optional(),
    agent: z.string().max(32).nullable().optional(),
    category: z.string().max(64).nullable().optional(),
    cap: z.number().int().nonnegative().nullable().optional(),
    threshold: z.number().int().nonnegative().nullable().optional(),
    thresholdEditable: z.boolean().nullable().optional(),
    allowlist: z.array(z.string().max(128)).max(64).nullable().optional(),
    scopeSummary: z.string().max(512).nullable().optional(),
    createdLabel: z.string().max(128).optional(),
  });

  app.get("/api/rules", requireAuth, async (req, res) => {
    try {
      const list = await storage.listUserRules(req.session.userId!);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/rules", requireAuth, async (req, res) => {
    try {
      const parsed = userRulePayload.parse(req.body);
      const rule = await storage.createUserRule({ ...parsed, userId: req.session.userId! });
      res.json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: err.errors });
      }
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/rules/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.removeUserRule(req.session.userId!, String(req.params.id));
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // RULE SUGGESTIONS (Claude-generated, grounded in live brain-core data)
  // Replaces the old client-side INITIAL_SUGGESTIONS seed. Never fabricates —
  // an empty array (with a `reason`) beats an invented suggestion.
  // ponytail: in-memory cache; DB-back if suggestions must survive restarts
  // ─────────────────────────────────────────────────────────────
  const ruleSuggestionsCache = new Map<string, { suggestions: unknown[]; at: number }>();
  const RULE_SUGGESTIONS_TTL_MS = 15 * 60 * 1000; // 15 minutes

  const factRowSchema = z.object({
    label: z.string(),
    value: z.string(),
    severity: z.enum(["clean", "info", "warning", "danger"]).optional(),
  });
  const proposedRuleSchema = z.object({
    name: z.string().optional(),
    summary: z.string().optional(),
    kind: z.enum(["automation", "guardrail", "always_on"]).optional(),
    agent: z.enum(["invoice", "collections", "cash", "close"]).optional(),
    category: z.string().optional(),
    cap: z.number().optional(),
    threshold: z.number().optional(),
    allowlist: z.array(z.string()).optional(),
    scopeSummary: z.string().optional(),
  });
  const ruleSuggestionSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    proposedRule: proposedRuleSchema,
    evidence: z.array(factRowSchema).min(1),
    confidence: z.enum(["low", "medium", "high"]),
  });

  const RULE_SUGGESTIONS_SYSTEM = `You are Brain AI, proposing standing automation rules for a business's payment workflow.
Given the user's real financial data (accounts, transactions, invoices, obligations, pending approvals), propose 0-3
automation-rule suggestions derived ONLY from patterns you can see in that data:
- Recurring same-vendor payments → an auto-pay allowlist rule.
- A consistent amount pattern for a vendor/category → a cap rule.
- A new or unusual vendor / an amount spike → a guardrail rule (asks before acting, does not auto-clear).
Never invent a vendor, amount, or count that is not in the provided data. If nothing qualifies, return an empty array.

Return ONLY a JSON array (no markdown, no prose), 0-3 items, each shaped exactly as:
{
  "id": "short-slug-string",
  "title": "short title",
  "description": "1-2 sentence explanation",
  "proposedRule": { "name": "...", "summary": "...", "kind": "automation" | "guardrail", "agent": "invoice" | "collections" | "cash" | "close", "category": "...", "cap": number, "threshold": number, "allowlist": ["vendor name"], "scopeSummary": "..." },
  "evidence": [ { "label": "...", "value": "...", "severity": "clean" | "info" | "warning" | "danger" } ],
  "confidence": "low" | "medium" | "high"
}
Evidence rows must cite the actual vendor names, amounts, and counts you saw in the data — no placeholders.`;

  app.get("/api/rules/suggestions", requireAuth, async (req, res) => {
    let tenantId: string;
    let token: string;
    try {
      const session = await getBrainSession(req.session.userId!);
      token = session.token;
      tenantId = session.tenantId;
    } catch (e) {
      console.warn("[RuleSuggestions] brain session unavailable:", (e as Error)?.message);
      return res.json({ suggestions: [], reason: "no_data" });
    }

    const cached = ruleSuggestionsCache.get(tenantId);
    if (cached && Date.now() - cached.at < RULE_SUGGESTIONS_TTL_MS) {
      return res.json({ suggestions: cached.suggestions });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ suggestions: [], reason: "unconfigured" });
    }

    const built = await buildGrounding(token, tenantId, "").catch(() => ({ text: "", sources: [], available: false }));
    if (!built.available) {
      return res.json({ suggestions: [], reason: "no_data" });
    }

    try {
      const message = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: RULE_SUGGESTIONS_SYSTEM,
        messages: [{ role: "user", content: `Live financial data from Brain:\n${built.text}` }],
      });
      const raw = (message.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)?.text?.trim() ?? "[]";
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      const parsedJson: unknown = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      const candidates = Array.isArray(parsedJson) ? parsedJson : [];
      // Drop malformed entries silently rather than fail the whole response.
      const suggestions = candidates
        .map((c) => ruleSuggestionSchema.safeParse(c))
        .filter((r): r is { success: true; data: z.infer<typeof ruleSuggestionSchema> } => r.success)
        .map((r) => ({ ...r.data, dismissed: false }));

      ruleSuggestionsCache.set(tenantId, { suggestions, at: Date.now() });
      return res.json({ suggestions });
    } catch (err) {
      console.error("[RuleSuggestions] generation failed:", err);
      const status = (err as { status?: number })?.status;
      const e = err as { message?: string; error?: { message?: string; error?: { message?: string } } };
      const apiMsg = e?.error?.error?.message ?? e?.error?.message ?? e?.message ?? "";
      if (status === 400 && /credit balance/i.test(apiMsg)) {
        return res.status(402).json({ error: "assistant_no_credit", suggestions: [] });
      }
      return res.status(500).json({ error: "rule_suggestions_failed", suggestions: [] });
    }
  });

  /* Generic tool disconnect - registered LAST so specific routes (e.g. plaid) win */
  app.post("/api/integrations/:toolId/disconnect", requireAuth, async (req, res) => {
    try {
      const ok = await storage.removeToolConnection(req.session.userId!, String(req.params.toolId));
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return httpServer;
}
