import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const PASSWORD_RESET_GENERIC_RESPONSE = {
  message: "If an account matches that email, a password reset link will arrive shortly.",
};

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type LimiterSettings = {
  limit?: number;
  windowMs?: number;
};

export function createPasswordResetRequestLimiter(settings: LimiterSettings = {}) {
  return rateLimit({
    windowMs: settings.windowMs ?? envInt("PASSWORD_RESET_REQUEST_WINDOW_MS", 15 * 60 * 1000),
    limit: settings.limit ?? envInt("PASSWORD_RESET_REQUEST_MAX", 5),
    standardHeaders: true,
    legacyHeaders: false,
    // Retain account-enumeration safety even when an IP has exhausted its
    // mailbox-delivery allowance.
    handler: (_req: Request, res: Response) => {
      res.set("Cache-Control", "no-store, private");
      res.status(200).json(PASSWORD_RESET_GENERIC_RESPONSE);
    },
  });
}

export function createPasswordResetVerifyLimiter(settings: LimiterSettings = {}) {
  return rateLimit({
    windowMs: settings.windowMs ?? envInt("PASSWORD_RESET_VERIFY_WINDOW_MS", 15 * 60 * 1000),
    limit: settings.limit ?? envInt("PASSWORD_RESET_VERIFY_MAX", 30),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.set("Cache-Control", "no-store, private");
      res.status(200).json({ valid: false });
    },
  });
}

export function createPasswordResetConfirmLimiter(settings: LimiterSettings = {}) {
  return rateLimit({
    windowMs: settings.windowMs ?? envInt("PASSWORD_RESET_CONFIRM_WINDOW_MS", 15 * 60 * 1000),
    limit: settings.limit ?? envInt("PASSWORD_RESET_CONFIRM_MAX", 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(400).json({ error: "This password reset link is invalid or has expired." });
    },
  });
}