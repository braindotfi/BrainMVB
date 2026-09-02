import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import { Pool } from "pg";
import { scrypt, randomBytes, timingSafeEqual, createHash, createHmac } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { brainTenancyMode } from "./brain/config";
import { isDemoEmail } from "./demoUsers";
import { evictBrainSession } from "./brain/auth";
import { formatPasswordResetEmailFailure, sendPasswordResetEmail } from "./passwordResetEmail";
import { PASSWORD_RESET_GENERIC_RESPONSE } from "./passwordResetRateLimit";

const scryptAsync = promisify(scrypt);

// ─── Session helper ───
/**
 * Switch the authenticated principal on a session.
 *
 * When an existing, different user is already bound to the session, regenerate
 * it first — this issues a new session ID and cookie, preventing session
 * fixation (a prior principal's cookie cannot be used to access the new one).
 * After regeneration (or immediately if the session was anonymous), the new
 * userId is written and explicitly persisted before the caller sends a
 * response. This matters for the Postgres-backed session store: response
 * completion must not race the client's next authenticated request.
 */
export async function switchSession(req: Request, newUserId: string): Promise<void> {
  const user = await storage.getUser(newUserId);
  if (!user) throw new Error("Cannot create a session for a missing user");
  const sessionVersion = user.sessionVersion;
  if (
    req.session.userId
    && (req.session.userId !== newUserId || req.session.sessionVersion !== sessionVersion)
  ) {
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
  }
  req.session.userId = newUserId;
  req.session.sessionVersion = sessionVersion;
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  writeAuthAudit(req, {
    route: "session",
    event: "session_bound",
    principalId: newUserId,
    transition: "authenticated",
    outcome: "success",
  });
}

// ─── Session typing ───
declare module "express-session" {
  interface SessionData {
    userId?: string;
    sessionVersion?: number;
    googleState?: string;
    /** A validated local invite path to restore after Google OAuth. */
    googleReturnTo?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      authAuditId?: string;
    }
  }
}

type AuthAuditFields = {
  route: string;
  event: string;
  principalId?: string;
  transition: string;
  outcome: string;
  revocationCount?: number;
};

const authAuditKey = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");

function authPseudonym(value: string | undefined): string {
  if (!value) return "none";
  return createHmac("sha256", authAuditKey).update(value).digest("hex").slice(0, 16);
}

function writeAuthAudit(req: Request, fields: AuthAuditFields): void {
  const correlationId = req.authAuditId ?? "missing";
  const sessionFingerprint = authPseudonym(req.sessionID);
  const principal = authPseudonym(fields.principalId);
  const revocationCount = fields.revocationCount ?? 0;
  console.info(
    `[auth-audit] correlation=${correlationId} route=${fields.route} event=${fields.event}`
    + ` principal=${principal} session=${sessionFingerprint} transition=${fields.transition}`
    + ` outcome=${fields.outcome} revocation_count=${revocationCount}`,
  );
}

// ─── Password hashing (scrypt, no external deps) ───
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyPassword(stored: string, supplied: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  if (hashedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Strip sensitive fields before sending a user to the client.
export function publicUser(u: User) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    walletAddress: u.walletAddress,
    // Demo accounts (and ONLY demo accounts) may see seeded/synthetic data.
    // The client gates every demo-only surface on this flag (see
    // client/src/lib/demoMode.ts); real accounts start genuinely empty.
    isDemo: isDemoEmail(u.email),
  };
}

// ─── Google OAuth (manual authorization-code flow, no external deps) ───
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const googleEnabled = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// OAuth callbacks must use the app's canonical public domain, not the
// Replit proxy hostname exposed through REPLIT_DOMAINS or the incoming Host
// header. The same value is used for both the authorization request and the
// code exchange below.
const GOOGLE_CALLBACK_URL = "https://app.brain.fi/api/auth/google/callback";

type GoogleTokenErrorPayload = {
  error?: string;
  error_description?: string;
  error_uri?: string;
  error_subtype?: string;
};

function googleTokenFailureReason(payload: GoogleTokenErrorPayload): string {
  const error = payload.error?.toLowerCase();
  const description = payload.error_description?.toLowerCase() ?? "";
  if (error === "redirect_uri_mismatch" || description.includes("redirect_uri")) {
    return "redirect_uri_mismatch";
  }
  if (error === "invalid_client") {
    return /not found|unknown|deleted/.test(description)
      ? "client_id_not_found"
      : "client_credentials_rejected";
  }
  if (error === "invalid_grant") {
    return /expired|revoked/.test(description)
      ? "authorization_code_expired_or_revoked"
      : "authorization_code_rejected";
  }
  if (error === "unauthorized_client") return "oauth_client_not_authorized";
  return error || "unclassified_provider_error";
}

async function logGoogleTokenExchangeFailure(
  response: Awaited<ReturnType<typeof fetch>>,
  correlationId: string,
): Promise<void> {
  const body = await response.text();
  let payload: GoogleTokenErrorPayload = {};
  let responseFields: string[] = [];
  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      responseFields = Object.keys(record).sort();
      for (const field of ["error", "error_description", "error_uri", "error_subtype"] as const) {
        if (typeof record[field] === "string") payload[field] = record[field];
      }
    }
  } catch {
    // Do not log an unstructured provider body because it could echo request data.
  }

  console.error("[Google OAuth] token exchange failed", {
    correlation_id: correlationId,
    status: response.status,
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_URL,
    reason: googleTokenFailureReason(payload),
    google_error: payload.error ?? null,
    google_error_description: payload.error_description ?? null,
    google_error_uri: payload.error_uri ?? null,
    google_error_subtype: payload.error_subtype ?? null,
    google_request_id:
      response.headers.get("x-request-id")
      ?? response.headers.get("x-guploader-uploadid")
      ?? null,
    response_fields: responseFields,
    response_content_type: response.headers.get("content-type"),
  });
}

/** Auth continuations must never become open redirects. Only a route-shaped invite token
 * can survive OAuth or a password-reset round trip. */
function validInviteReturnTo(value: unknown): string | undefined {
  return typeof value === "string" && /^\/invite\/[A-Za-z0-9._~-]+$/.test(value)
    ? value
    : undefined;
}

function googleRedirect(returnTo: string | undefined, error?: string): string {
  const target = returnTo ?? "/";
  return error ? `${target}?auth_error=${encodeURIComponent(error)}` : target;
}

const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores")
    .optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1).max(80).optional(),
});

// `identifier` is a username OR an email - either may be used to log in.
const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});
const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
  // Invalid return paths must never block the generic reset response or create
  // an open redirect. They are simply discarded below.
  return_to: z.unknown().optional(),
}).transform(({ email, return_to }) => ({
  email,
  returnTo: validInviteReturnTo(return_to),
}));
const passwordResetTokenSchema = z.object({
  token: z.string().min(32).max(512),
});
const passwordResetConfirmSchema = passwordResetTokenSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters").max(256),
  return_to: z.unknown().optional(),
});

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export function passwordResetTokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetUrl(token: string, returnTo?: string): string {
  // Development and production use separate databases. A token stored in the
  // dev DB must link back to the dev app; sending a link to app.brain.fi lets
  // the production DB reject it as invalid. REPLIT_DEV_DOMAIN being present is
  // the reliable signal that we are running inside a Replit preview — NODE_ENV
  // is intentionally left unset in this environment.
  const baseUrl =
    process.env.APP_BASE_URL
    || (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://app.brain.fi");
  const url = new URL(`/reset-password/${encodeURIComponent(token)}`, baseUrl);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  return url.toString();
}

/**
 * The public request endpoint must have the same response behavior for known,
 * unknown, malformed, and operationally failing inputs. Run account lookup and
 * mail delivery after the generic response has been sent so provider latency
 * cannot become an account-enumeration signal.
 */
async function processPasswordResetRequest(email: string, returnTo: string | undefined, req: Request): Promise<void> {
  let user: User | undefined;
  try {
    user = await storage.getUserByEmail(email);
    if (!user) {
      writeAuthAudit(req, {
        route: "password-reset/request",
        event: "reset_delivery",
        transition: "anonymous",
        outcome: "no_matching_account",
      });
      return;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const now = new Date();
    await storage.createPasswordResetToken({
      userId: user.id,
      tokenHash: passwordResetTokenDigest(rawToken),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
    });
    await sendPasswordResetEmail({
      to: user.email ?? email,
      resetUrl: passwordResetUrl(rawToken, returnTo),
      expiresInMinutes: PASSWORD_RESET_TTL_MS / 60_000,
    });
    writeAuthAudit(req, {
      route: "password-reset/request",
      event: "reset_delivery",
      principalId: user.id,
      transition: "anonymous",
      outcome: "accepted",
    });
  } catch (error) {
    // An undeliverable token must not remain usable. Cleanup failure cannot
    // alter the already-sent generic response or leak an account's existence.
    let revokeFailed = false;
    if (user) {
      try {
        await storage.revokePasswordResetTokens(user.id, new Date());
      } catch {
        revokeFailed = true;
      }
    }
    const failure = formatPasswordResetEmailFailure(error);
    console.error(
      `[auth] password reset email delivery failed ${failure}${revokeFailed ? " revoke_failed=true" : ""}`,
    );
    writeAuthAudit(req, {
      route: "password-reset/request",
      event: "reset_delivery",
      principalId: user?.id,
      transition: "anonymous",
      outcome: "failed",
    });
  }
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const configuredSessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSessionSecret) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  const sessionSecret = configuredSessionSecret || randomBytes(32).toString("hex");

  app.use((req, _res, next) => {
    req.authAuditId = randomBytes(12).toString("hex");
    next();
  });

  let store: session.Store | undefined;
  if (process.env.DATABASE_URL) {
    const PgStore = connectPgSimple(session);
    const sessionPool = new Pool({ connectionString: process.env.DATABASE_URL });
    sessionPool.on("error", (error) => {
      console.error("[auth] PostgreSQL session pool client error:", error);
    });
    store = new PgStore({
      pool: sessionPool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    });
  } else {
    const MemoryStore = createMemoryStore(session);
    store = new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 });
  }

  app.use(
    session({
      name: "brain.sid",
      secret: sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    }),
  );

  // ─── Email/password registration ───
  app.post("/api/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    }
    const email = parsed.data.email.toLowerCase().trim();
    // Block @brain.fi registrations: that domain is used exclusively for system-generated
    // demo accounts (demo@brain.fi, demo-fresh-*@brain.fi). Allowing real users to register
    // with it would spoof isDemoEmail() routing and land them on the staging brain target.
    if (email.endsWith("@brain.fi")) {
      return res.status(400).json({ error: "That email domain is not available for registration" });
    }
    const { password, name } = parsed.data;
    const username = parsed.data.username?.trim() || email;

    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    // Only enforce username uniqueness when the user picked a custom one
    // (otherwise it defaults to the email, which is already checked above).
    if (parsed.data.username) {
      const taken = await storage.getUserByUsername(username);
      if (taken) {
        return res.status(409).json({ error: "That username is already taken" });
      }
    }

    const hashed = await hashPassword(password);
    const user = await storage.createUser({
      username,
      email,
      password: hashed,
      name: name ?? null,
    });

    await switchSession(req, user.id);
    return res.status(201).json({ user: publicUser(user) });
  });

  // ─── Email/password login ───
  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }
    const idRaw = parsed.data.identifier.trim();
    const user =
      (await storage.getUserByEmail(idRaw.toLowerCase())) ??
      (await storage.getUserByUsername(idRaw));

    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }
    const ok = await verifyPassword(user.password, parsed.data.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    await switchSession(req, user.id);
    return res.json({ user: publicUser(user) });
  });

  // ─── Password reset ───
  // The response does not disclose whether an email address has an account.
  app.post("/api/auth/password-reset/request", async (req, res) => {
    const parsed = passwordResetRequestSchema.safeParse(req.body);
    res.set("Cache-Control", "no-store, private");
    res.json(PASSWORD_RESET_GENERIC_RESPONSE);
    if (!parsed.success) {
      writeAuthAudit(req, {
        route: "password-reset/request",
        event: "reset_request",
        transition: "anonymous",
        outcome: "invalid_input",
      });
      return;
    }

    // Deferring avoids starting a known-account lookup before Express flushes
    // the fixed response. Do not await this work in the request lifecycle.
    setImmediate(() => {
      void processPasswordResetRequest(parsed.data.email.toLowerCase(), parsed.data.returnTo, req);
    });
  });

  app.post("/api/auth/password-reset/verify", async (req, res) => {
    const parsed = passwordResetTokenSchema.safeParse(req.body);
    const valid = parsed.success
      && await storage.isPasswordResetTokenValid(passwordResetTokenDigest(parsed.data.token), new Date());
    res.set("Cache-Control", "no-store, private");
    writeAuthAudit(req, {
      route: "password-reset/verify",
      event: "reset_verify",
      transition: "anonymous",
      outcome: valid ? "valid" : "invalid",
    });
    return res.json({ valid });
  });

  app.post("/api/auth/password-reset/confirm", async (req, res) => {
    const parsed = passwordResetConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Choose a password with at least 8 characters." });
    }
    const tokenHash = passwordResetTokenDigest(parsed.data.token);
    if (!await storage.isPasswordResetTokenValid(tokenHash, new Date())) {
      writeAuthAudit(req, {
        route: "password-reset/confirm",
        event: "reset_confirm",
        transition: "anonymous",
        outcome: "rejected",
      });
      return res.status(400).json({ error: "This password reset link is invalid or has expired." });
    }
    const consumed = await storage.consumePasswordResetToken(
      tokenHash,
      await hashPassword(parsed.data.password),
      new Date(),
    );
    if (!consumed) {
      writeAuthAudit(req, {
        route: "password-reset/confirm",
        event: "reset_confirm",
        transition: "anonymous",
        outcome: "rejected",
      });
      return res.status(400).json({ error: "This password reset link is invalid or has expired." });
    }
    writeAuthAudit(req, {
      route: "password-reset/confirm",
      event: "reset_confirm",
      principalId: consumed.userId,
      transition: "password_reset",
      outcome: "success",
      // One durable generation advance invalidates every prior session for this
      // account; it never deletes or counts another account's session rows.
      revocationCount: 1,
    });
    return res.json({ success: true });
  });

  /* ── REMOVED: POST /api/auth/demo (shared demo@brain.fi login) ──────────────
     Deleted deliberately; do not reintroduce. It was unauthenticated and logged
     every caller into ONE app user backed by ONE persistent tenant, so each
     visitor could read and mutate whatever the previous visitor left behind:
     ledger rows, counterparties, trust decisions, audit entries, document
     metadata, tenant API keys, and any linked Plaid connection (institution,
     account names, last-4 masks) which they could also disconnect. The
     production-mode 404 above did not cover it in practice, because this
     deployment runs BRAIN_TENANCY_MODE=durable.

     Isolated demo access is /api/auth/demo-fresh, which mints a new user and a
     new seeded tenant per visitor. Any "explore the app" entry point must use
     that route. server/auth-security.test.ts pins this route as 404. */

  // ─── Demo fresh user (no credentials) - creates a NEW account each time ───
  app.post("/api/auth/demo-fresh", async (req, res) => {
    if (brainTenancyMode() === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    const freshId = crypto.randomUUID().slice(0, 8);
    const email = `demo-fresh-${freshId}@brain.fi`;
    const user = await storage.createUser({
      username: email,
      email,
      password: null,
      name: "Demo Business",
    });
    await switchSession(req, user.id);

    // Lazy cleanup: on each new provision, purge demo-fresh users older than the TTL.
    // Fire-and-forget — login is never blocked on this.
    const ttlHours = Math.max(
      1,
      parseInt(process.env.DEMO_TENANT_TTL_HOURS ?? "", 10) || 24,
    );
    const olderThan = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    void storage.cleanupExpiredDemoFreshUsers(olderThan).then((evictedIds) => {
      if (evictedIds.length > 0) {
        // Evict stale brain session cache entries so they don't linger in memory.
        for (const uid of evictedIds) evictBrainSession(uid);
        console.log(`[demo-cleanup] purged ${evictedIds.length} expired demo tenant(s) (TTL=${ttlHours}h)`);
      }
    }).catch((err) => {
      console.warn("[demo-cleanup] cleanup pass failed (non-fatal):", (err as Error).message);
    });

    return res.json({ user: publicUser(user) });
  });

  // ─── Current session user ───
  app.get("/api/auth/user", async (req, res) => {
    const user = await getValidSessionUser(req, res);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.set("Cache-Control", "no-store, private");
    return res.json({ user: publicUser(user) });
  });

  // ─── Logout ───
  app.post("/api/auth/logout", async (req, res) => {
    const principalId = req.session.userId;
    try {
      await destroySession(req, res);
      writeAuthAudit(req, {
        route: "logout",
        event: "session_destroyed",
        principalId,
        transition: "logout",
        outcome: "success",
      });
      return res.json({ success: true });
    } catch {
      writeAuthAudit(req, {
        route: "logout",
        event: "session_destroyed",
        principalId,
        transition: "logout",
        outcome: "failed",
      });
      return res.status(500).json({ error: "Logout failed" });
    }
  });

  // ─── Google OAuth: begin ───
  app.get("/api/auth/google", (req, res) => {
    if (!googleEnabled) {
      return res.status(503).json({ error: "Google sign-in is not configured" });
    }
    const state = randomBytes(16).toString("hex");
    req.session.googleState = state;
    req.session.googleReturnTo = validInviteReturnTo(req.query.return_to);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      redirect_uri: GOOGLE_CALLBACK_URL,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "select_account",
      state,
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // ─── Google OAuth: callback ───
  app.get("/api/auth/google/callback", async (req, res) => {
    const returnTo = req.session.googleReturnTo;
    req.session.googleReturnTo = undefined;
    if (!googleEnabled) return res.redirect(googleRedirect(returnTo, "google_unconfigured"));
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.session.googleState) {
      return res.redirect(googleRedirect(returnTo, "google_state"));
    }
    req.session.googleState = undefined;

    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          redirect_uri: GOOGLE_CALLBACK_URL,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResp.ok) {
        await logGoogleTokenExchangeFailure(tokenResp, req.authAuditId ?? "missing");
        return res.redirect(googleRedirect(returnTo, "google_token"));
      }
      const tokens = (await tokenResp.json()) as { access_token?: string };
      if (!tokens.access_token) {
        console.error("[Google OAuth] token exchange returned no access token", {
          correlation_id: req.authAuditId ?? "missing",
          status: tokenResp.status,
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: GOOGLE_CALLBACK_URL,
          response_fields: Object.keys(tokens).sort(),
        });
        return res.redirect(googleRedirect(returnTo, "google_token"));
      }

      const profResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profResp.ok) {
        console.error("[Google OAuth] userinfo failed:", profResp.status);
        return res.redirect(googleRedirect(returnTo, "google_profile"));
      }
      const profile = (await profResp.json()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };

      /* Demo accounts are NEVER reachable through OAuth. They hold shared, synthetic data
         and have no real owner, so adopting one by email match would hand the caller the
         demo tenant — the same exposure as the deleted shared demo login (see the note in
         the demo section above), just through a different door. This is deliberately
         narrower than /api/auth/register's blanket @brain.fi block: real brain.fi staff
         must still be able to sign in with Google, they just cannot land on a demo row. */
      const profileEmail = profile.email?.toLowerCase() ?? null;
      if (isDemoEmail(profileEmail)) {
        return res.redirect(googleRedirect(returnTo, "google_demo_account"));
      }

      let user = await storage.getUserByGoogleId(profile.sub);
      if (!user && profileEmail) {
        const byEmail = await storage.getUserByEmail(profileEmail);
        if (byEmail) {
          if (profile.email_verified !== true) {
            return res.redirect(googleRedirect(returnTo, "google_unverified_email"));
          }
          user = byEmail;
        }
      }
      /* Covers a demo row reached either by an existing googleId or by the by-email
         adoption just above — checked AFTER both resolve `user`, not only after the
         googleId lookup, so a demo row reached via email adoption is still caught. */
      if (isDemoEmail(user?.email)) {
        return res.redirect(googleRedirect(returnTo, "google_demo_account"));
      }
      if (!user) {
        const email = profile.email_verified === true ? profile.email?.toLowerCase() : undefined;
        user = await storage.createUser({
          username: email ?? `google_${profile.sub}`,
          email: email ?? null,
          googleId: profile.sub,
          name: profile.name ?? null,
          password: null,
        });
      }

      await switchSession(req, user.id);
      return res.redirect(googleRedirect(returnTo));
    } catch (err) {
      console.error("[Google OAuth] callback error:", err);
      return res.redirect(googleRedirect(returnTo, "google_failed"));
    }
  });
}

async function destroySession(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
  res.clearCookie("brain.sid");
}

async function getValidSessionUser(req: Request, res: Response): Promise<User | undefined> {
  const { userId, sessionVersion } = req.session;
  if (!userId || !Number.isInteger(sessionVersion)) return undefined;

  const cachedUser = res.locals.authenticatedUser as User | undefined;
  if (cachedUser?.id === userId && cachedUser.sessionVersion === sessionVersion) {
    return cachedUser;
  }
  let user: User | undefined;
  try {
    user = await storage.getUser(userId);
  } catch {
    return undefined;
  }
  if (!user || user.sessionVersion !== sessionVersion) {
    try {
      await destroySession(req, res);
    } catch {
      // The credential is still refused even if storage cleanup has failed.
    }
    writeAuthAudit(req, {
      route: "protected",
      event: "session_rejected",
      principalId: userId,
      transition: "session_validation",
      outcome: user ? "generation_mismatch" : "missing_user",
    });
    return undefined;
  }
  return user;
}

// ─── Route guard helper ───
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getValidSessionUser(req, res);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.locals.authenticatedUser = user;
  next();
}

/**
 * Blocks demo accounts from routes that reach a real third party or persist a real
 * credential on the account.
 *
 * Demo sessions are handed out unauthenticated (POST /api/auth/demo-fresh), so any route
 * behind `requireAuth` alone is effectively public. That is fine for reading seeded data,
 * but not for linking a live bank: the credential would outlive the visitor's session on an
 * account nobody owns. `PLAID_ENV` being unset (so Plaid resolves to sandbox) is a real
 * mitigation but a fragile one — it is one environment variable away from being wrong, and
 * it lives outside the code. This guard does not depend on it.
 *
 * Fails CLOSED: if the account type cannot be determined, the route is refused rather than
 * allowed, because the failure mode of guessing wrong is a real credential on a demo row.
 */
export async function requireNonDemo(req: Request, res: Response, next: NextFunction) {
  const user = (res.locals.authenticatedUser as User | undefined) ?? await getValidSessionUser(req, res);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  if (!user || isDemoEmail(user.email)) {
    return res.status(403).json({
      error: "demo_account_not_permitted",
      message: "Demo accounts can't connect a real account. Sign up to link your own.",
    });
  }
  next();
}
