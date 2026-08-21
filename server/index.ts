import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { assertEncryptionKeyConfigured } from "./tokenCrypto";
import { storage } from "./storage";
import {
  createPasswordResetConfirmLimiter,
  createPasswordResetRequestLimiter,
  createPasswordResetVerifyLimiter,
} from "./passwordResetRateLimit";

if (process.env.NODE_ENV === "production") {
  assertEncryptionKeyConfigured();
}

const app = express();
const httpServer = createServer(app)

const helmetConfig: Parameters<typeof helmet>[0] = process.env.NODE_ENV === "production"
  ? {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'sha256-NzvNrqk5jB9YZATwo5BF4JoRlJ02HsnFikbKXgEPdaQ='"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }
  : {
      contentSecurityPolicy: false,
      // The Replit workspace canvas embeds the dev preview from a different
      // origin. Helmet's default SAMEORIGIN frameguard would render that
      // otherwise-healthy preview as a blank page. Production keeps the
      // stricter frame-ancestors policy above.
      frameguard: false,
    };

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(helmet(helmetConfig));

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const authLimiter = rateLimit({
  windowMs: envInt("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: envInt("AUTH_RATE_LIMIT_MAX", 20),
  standardHeaders: true,
  legacyHeaders: false,
});

const llmLimiter = rateLimit({
  windowMs: envInt("LLM_RATE_LIMIT_WINDOW_MS", 60 * 1000),
  limit: envInt("LLM_RATE_LIMIT_MAX", 30),
  standardHeaders: true,
  legacyHeaders: false,
});

// Fresh-demo creation is DELIBERATELY tighter than ordinary auth: it is unauthenticated,
// it is now the public "Continue with Demo" button, and every call provisions a real
// brain-core tenant AND an on-chain audit anchor transaction. Unbounded taps therefore
// burn real funds from the anchoring wallet, not just database rows. The per-IP ceiling
// here and the 24-hour TTL cleanup (runDemoCleanup below) work together: the limiter
// caps burst provisioning from one IP, and the cleanup bounds total accumulation over
// time. Raise DEMO_RATE_LIMIT_MAX temporarily if a live walkthrough needs more headroom
// from one venue's IP.
const demoLimiter = rateLimit({
  windowMs: envInt("DEMO_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: envInt("DEMO_RATE_LIMIT_MAX", 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many demo sessions from this network. Please try again shortly." },
});

app.use(["/api/auth/login", "/api/auth/register"], authLimiter);
app.use("/api/auth/password-reset/request", createPasswordResetRequestLimiter());
app.use("/api/auth/password-reset/verify", createPasswordResetVerifyLimiter());
app.use("/api/auth/password-reset/confirm", createPasswordResetConfirmLimiter());
// /api/auth/demo-fresh is the only demo entry point; the shared /api/auth/demo route was
// deleted (see server/auth.ts). It stays unauthenticated, so the ceiling above is what stops
// a caller from provisioning tenants — and paying for their anchor transactions — in bulk.
app.use(["/api/auth/demo-fresh"], demoLimiter);
app.use(["/api/goals/recommendation", "/api/assistant/chat", "/api/rules/suggestions"], llmLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const logBodies = process.env.NODE_ENV !== "production" && process.env.API_LOG_RESPONSE_BODY === "true";
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    if (logBodies) capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // ── Demo tenant cleanup ──────────────────────────────────────────────────
  // Each "Continue with Demo" tap provisions a real brain-core tenant + an
  // on-chain audit anchor. Without expiry, demo tenants accumulate indefinitely.
  // We cannot delete the brain-core tenant (no delete-tenant API endpoint), but
  // dropping the local user + all its linked rows prevents BrainMVB from ever
  // re-authenticating as that tenant again, bounds local row growth, and limits
  // exposure to any future cost-per-tenant billing.
  //
  // Both values are env-overridable so an ops team can tune without a deploy:
  //   DEMO_TENANT_TTL_HOURS       (default 24)
  //   DEMO_CLEANUP_INTERVAL_HOURS (default 1)
  const demoTtlMs = envInt("DEMO_TENANT_TTL_HOURS", 24) * 60 * 60 * 1000;
  const demoCleanupIntervalMs = envInt("DEMO_CLEANUP_INTERVAL_HOURS", 1) * 60 * 60 * 1000;

  async function runDemoCleanup() {
    try {
      const count = await storage.deleteExpiredDemoUsers(demoTtlMs);
      if (count > 0) log(`demo cleanup: removed ${count} expired demo tenant(s)`, "cleanup");
    } catch (err) {
      console.error("[cleanup] demo tenant cleanup error:", err);
    }
  }

  // Run immediately at startup to sweep tenants that expired during downtime,
  // then on a regular interval.
  runDemoCleanup();
  setInterval(runDemoCleanup, demoCleanupIntervalMs);

  // The legacy mock-data daily-insights cron (server/insightsService.ts) is
  // retired: the HomePage insight is now ledger-grounded via brain-core
  // (GET /api/brain/recommendation). The old cron also spammed Anthropic 401s
  // at boot when no ANTHROPIC_API_KEY was set. See deliverables/DEAD-CODE-INVENTORY.md.

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions: {
    port: number;
    host: string;
    reusePort?: boolean;
  } = {
    port,
    host: "0.0.0.0",
  };
  if (process.platform === "linux") {
    listenOptions.reusePort = true;
  }
  httpServer.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
