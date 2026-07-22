import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import { Pool } from "pg";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { brainTenancyMode } from "./brain/config";

const scryptAsync = promisify(scrypt);

// ─── Session typing ───
declare module "express-session" {
  interface SessionData {
    userId?: string;
    googleState?: string;
  }
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
  };
}

// ─── Google OAuth (manual authorization-code flow, no external deps) ───
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const googleEnabled = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

function googleCallbackUrl(req: Request): string {
  const configuredDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const host = configuredDomain || req.get("host");
  const proto = configuredDomain ? "https" : req.protocol;
  return `${proto}://${host}/api/auth/google/callback`;
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

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const configuredSessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSessionSecret) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  const sessionSecret = configuredSessionSecret || randomBytes(32).toString("hex");

  let store: session.Store | undefined;
  if (process.env.DATABASE_URL) {
    const PgStore = connectPgSimple(session);
    store = new PgStore({
      pool: new Pool({ connectionString: process.env.DATABASE_URL }),
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

    req.session.userId = user.id;
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

    req.session.userId = user.id;
    return res.json({ user: publicUser(user) });
  });

  // ─── Demo login (no credentials) - explore the app with a shared demo account ───
  app.post("/api/auth/demo", async (req, res) => {
    // No shared demo account in production tenancy - real tenants/agents live there,
    // and there is no honest "explore with someone else's data" story. 404, not a
    // gated 403, so the route reads as not existing rather than merely locked.
    if (brainTenancyMode() === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    const DEMO_EMAIL = "demo@brain.fi";
    let user = await storage.getUserByEmail(DEMO_EMAIL);
    if (!user) {
      user = await storage.createUser({
        username: DEMO_EMAIL,
        email: DEMO_EMAIL,
        password: null,
        name: "ACME Inc.",
      });
    }
    req.session.userId = user.id;
    return res.json({ user: publicUser(user) });
  });

  // ─── Current session user ───
  app.get("/api/auth/user", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.json({ user: publicUser(user) });
  });

  // ─── Logout ───
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.clearCookie("brain.sid");
      return res.json({ success: true });
    });
  });

  // ─── Google OAuth: begin ───
  app.get("/api/auth/google", (req, res) => {
    if (!googleEnabled) {
      return res.status(503).json({ error: "Google sign-in is not configured" });
    }
    const state = randomBytes(16).toString("hex");
    req.session.googleState = state;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      redirect_uri: googleCallbackUrl(req),
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
    if (!googleEnabled) return res.redirect("/?auth_error=google_unconfigured");
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.session.googleState) {
      return res.redirect("/?auth_error=google_state");
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
          redirect_uri: googleCallbackUrl(req),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResp.ok) {
        console.error("[Google OAuth] token exchange failed:", tokenResp.status, await tokenResp.text());
        return res.redirect("/?auth_error=google_token");
      }
      const tokens = (await tokenResp.json()) as { access_token?: string };
      if (!tokens.access_token) return res.redirect("/?auth_error=google_token");

      const profResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profResp.ok) {
        console.error("[Google OAuth] userinfo failed:", profResp.status);
        return res.redirect("/?auth_error=google_profile");
      }
      const profile = (await profResp.json()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };

      let user = await storage.getUserByGoogleId(profile.sub);
      if (!user && profile.email) {
        const email = profile.email.toLowerCase();
        const byEmail = await storage.getUserByEmail(email);
        if (byEmail) {
          if (profile.email_verified !== true) {
            return res.redirect("/?auth_error=google_unverified_email");
          }
          user = byEmail;
        }
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

      req.session.userId = user.id;
      return res.redirect("/");
    } catch (err) {
      console.error("[Google OAuth] callback error:", err);
      return res.redirect("/?auth_error=google_failed");
    }
  });
}

// ─── Route guard helper ───
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}
