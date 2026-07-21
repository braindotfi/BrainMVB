/**
 * Developers section — pure helpers (key minting/hashing/masking + usage aggregation).
 *
 * Kept free of Express/storage imports so vitest can hit them directly.
 *
 * Key format: `${prefix}${secret}` where prefix is brain_sk_test_ / brain_sk_live_
 * and secret is 32 bytes of CSPRNG entropy, base62. The plaintext is returned to
 * the caller EXACTLY ONCE (create/rotate response); only the SHA-256 hex digest
 * is persisted.
 *
 * FOLLOW-UP (brain-core repo): brain-core does not yet accept these platform-issued
 * keys on its auth middleware — upstream enforcement is follow-up work. Until then
 * the keys are real, hashed credentials of THIS app's backend only.
 */

import { createHash, randomBytes } from "node:crypto";

export type ApiKeyEnvironment = "sandbox" | "live";

export const API_KEY_PREFIXES: Record<ApiKeyEnvironment, string> = {
  sandbox: "brain_sk_test_",
  live: "brain_sk_live_",
};

/** Scopes a platform key can carry (mirrors the read/propose split of the BFF). */
export const API_KEY_SCOPES = ["ledger:read", "audit:read", "payment_intent:propose"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 32 CSPRNG bytes → 43-char base62 string (rejection-free modulo bias is acceptable
 * here at 256 % 62, but we avoid it anyway with rejection sampling). */
function randomBase62(length: number): string {
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (const b of bytes) {
      if (b < 248) { // 248 = 62 * 4 → uniform over 0..247
        out += BASE62[b % 62];
        if (out.length === length) break;
      }
    }
  }
  return out;
}

export interface GeneratedApiKey {
  /** Full plaintext key — return once, never persist. */
  plaintext: string;
  keyPrefix: string;
  keyLast4: string;
  /** SHA-256 hex of the full plaintext. */
  hashedSecret: string;
}

export function generateApiKey(environment: ApiKeyEnvironment): GeneratedApiKey {
  const keyPrefix = API_KEY_PREFIXES[environment];
  const secret = randomBase62(43);
  const plaintext = `${keyPrefix}${secret}`;
  return {
    plaintext,
    keyPrefix,
    keyLast4: plaintext.slice(-4),
    hashedSecret: hashSecret(plaintext),
  };
}

export function hashSecret(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** `brain_sk_test_••••1a2B` — what list/detail surfaces show. */
export function maskKey(keyPrefix: string, keyLast4: string): string {
  return `${keyPrefix}\u2022\u2022\u2022\u2022${keyLast4}`;
}

// ─── Usage aggregation over brain-core audit events ───

export interface UsageAuditEvent {
  id: string;
  layer: string;
  action: string;
  created_at: string;
}

export interface UsageDay {
  /** ISO date (UTC), e.g. "2026-07-21" */
  date: string;
  count: number;
}

export interface UsageSummary {
  totalEvents: number;
  /** action → count, descending */
  byAction: Array<{ action: string; count: number }>;
  /** layer → count, descending */
  byLayer: Array<{ layer: string; count: number }>;
  /** one entry per day in the window, oldest first, zero-filled */
  daily: UsageDay[];
  windowDays: number;
}

/**
 * Aggregate audit events into the Usage page shape. Window is the last
 * `windowDays` UTC days ending at `now` (inclusive); events outside it are
 * dropped; days with no events are zero-filled so charts stay honest.
 */
export function aggregateUsage(
  events: UsageAuditEvent[],
  windowDays: number,
  now: Date = new Date(),
): UsageSummary {
  const dayMs = 24 * 60 * 60 * 1000;
  const endDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startDay = endDay - (windowDays - 1) * dayMs;

  const dailyCounts = new Map<string, number>();
  for (let t = startDay; t <= endDay; t += dayMs) {
    dailyCounts.set(new Date(t).toISOString().slice(0, 10), 0);
  }

  const byAction = new Map<string, number>();
  const byLayer = new Map<string, number>();
  let totalEvents = 0;

  for (const ev of events) {
    const ts = Date.parse(ev.created_at);
    if (Number.isNaN(ts)) continue;
    const day = new Date(ts).toISOString().slice(0, 10);
    if (!dailyCounts.has(day)) continue; // outside window
    totalEvents += 1;
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
    byAction.set(ev.action, (byAction.get(ev.action) ?? 0) + 1);
    byLayer.set(ev.layer, (byLayer.get(ev.layer) ?? 0) + 1);
  }

  const sortDesc = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return {
    totalEvents,
    byAction: sortDesc(byAction).map(([action, count]) => ({ action, count })),
    byLayer: sortDesc(byLayer).map(([layer, count]) => ({ layer, count })),
    daily: Array.from(dailyCounts.entries()).map(([date, count]) => ({ date, count })),
    windowDays,
  };
}
