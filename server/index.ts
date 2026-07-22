import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { assertEncryptionKeyConfigured } from "./tokenCrypto";

assertEncryptionKeyConfigured();

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
          connectSrc: ["'self'", "https://mm-sdk-analytics.api.cx.metamask.io"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }
  : {
      contentSecurityPolicy: false,
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

app.use(["/api/auth/login", "/api/auth/register"], authLimiter);
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
