import { useSyncExternalStore } from "react";

export type BrainReadFamily = "proposals" | "counterparties";

export const RATE_LIMIT_EVENT = "brain:rate-limit";
export const RATE_LIMIT_ALERT_TITLE = "System Usage Error";
export const DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 15;

export class BrainRateLimitError extends Error {
  readonly status = 429;
  readonly family: BrainReadFamily;
  readonly retryAfterSeconds: number | null;
  readonly cooldownUntil: number;

  constructor(family: BrainReadFamily, retryAfterSeconds: number | null, cooldownUntil: number) {
    super(formatRateLimitDescription(retryAfterSeconds));
    this.name = "BrainRateLimitError";
    this.family = family;
    this.retryAfterSeconds = retryAfterSeconds;
    this.cooldownUntil = cooldownUntil;
  }
}

type CooldownEvent = {
  family: BrainReadFamily;
  retryAfterSeconds: number | null;
  cooldownUntil: number;
};

const cooldowns = new Map<BrainReadFamily, number>();
const timers = new Map<BrainReadFamily, ReturnType<typeof setTimeout>>();
const cooldownListeners = new Set<() => void>();
const alertListeners = new Set<(event: CooldownEvent) => void>();

function emitCooldownChange(): void {
  for (const listener of cooldownListeners) listener();
}

function emitAlert(event: CooldownEvent): void {
  for (const listener of alertListeners) listener(event);
}

function setExpiryTimer(family: BrainReadFamily, deadline: number): void {
  const existing = timers.get(family);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, deadline - Date.now()) + 5;
  timers.set(
    family,
    setTimeout(() => {
      timers.delete(family);
      if ((cooldowns.get(family) ?? 0) <= Date.now()) {
        cooldowns.delete(family);
        emitCooldownChange();
      }
    }, delay),
  );
}

export function parseRetryAfterSeconds(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) return null;
  return Math.max(1, Math.ceil((asDate - now) / 1000));
}

export function parseRetrySecondsFromMessage(message: string): number | null {
  const match = message.match(/(?:retry|try again)\s+in\s+(\d+)\s+seconds?/i);
  return match ? Math.max(1, Number(match[1])) : null;
}

function retryAfterSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.max(1, Math.ceil(value));
  }
  if (typeof value === "string") {
    return parseRetryAfterSeconds(value) ?? parseRetrySecondsFromMessage(value);
  }
  if (!value || typeof value !== "object") return null;

  const object = value as Record<string, unknown>;
  for (const key of ["retry_after", "retryAfter", "retry-after", "message", "body", "error"]) {
    const seconds = retryAfterSeconds(object[key]);
    if (seconds !== null) return seconds;
  }
  return null;
}

export function formatRateLimitDescription(seconds: number | null | undefined): string {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    const rounded = Math.max(1, Math.ceil(seconds));
    return `Rate limit exceeded. Retry in ${rounded} ${rounded === 1 ? "second" : "seconds"}.`;
  }
  return "Rate limit exceeded. Retry shortly.";
}

export function brainReadFamilyForUrl(url: string): BrainReadFamily | null {
  if (url.startsWith("/api/brain/proposals")) return "proposals";
  if (url.startsWith("/api/brain/ledger/counterparties")) return "counterparties";
  return null;
}

export function startBrainReadCooldown(
  family: BrainReadFamily,
  retryAfterSeconds: number | null,
  now: number = Date.now(),
): BrainRateLimitError {
  const effectiveSeconds = retryAfterSeconds ?? DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
  const deadline = now + effectiveSeconds * 1000;
  const current = cooldowns.get(family) ?? 0;
  if (deadline > current) {
    cooldowns.set(family, deadline);
    setExpiryTimer(family, deadline);
    emitCooldownChange();
  }
  const event = { family, retryAfterSeconds, cooldownUntil: Math.max(deadline, current) };
  emitAlert(event);
  return new BrainRateLimitError(family, retryAfterSeconds, event.cooldownUntil);
}

export function isBrainRateLimitError(error: unknown): error is BrainRateLimitError {
  return error instanceof BrainRateLimitError || (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 429
  );
}

/** Identify a rate-limit failure from either a fetch wrapper or a mutation. */
export function isRateLimitError(error: unknown): boolean {
  if (isBrainRateLimitError(error)) return true;
  if (!(error instanceof Error)) return false;
  return (
    /\b429\b/.test(error.message) ||
    /\brate[_ -]?limit(?:ed)?\b/i.test(error.message) ||
    /too many (?:requests|demo sessions)/i.test(error.message)
  );
}

/** Backward-compatible notification hook for non-Brain-read 429s. */
export function reportRateLimit(detail?: unknown): void {
  const retryAfter = retryAfterSeconds(detail);
  emitAlert({
    family: "proposals",
    retryAfterSeconds: retryAfter,
    cooldownUntil: Date.now() + (retryAfter ?? DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS) * 1000,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(RATE_LIMIT_EVENT, {
        detail: { retryAfterSeconds: retryAfter ?? undefined },
      }),
    );
  }
}

export function getBrainReadCooldownDeadline(family: BrainReadFamily, now: number = Date.now()): number {
  const deadline = cooldowns.get(family) ?? 0;
  if (deadline <= now) {
    cooldowns.delete(family);
    return 0;
  }
  return deadline;
}

export function isBrainReadCoolingDown(family: BrainReadFamily, now: number = Date.now()): boolean {
  return getBrainReadCooldownDeadline(family, now) > now;
}

export function reportBrainReadCooldownIfActive(family: BrainReadFamily): boolean {
  const deadline = getBrainReadCooldownDeadline(family);
  if (!deadline) return false;
  emitAlert({
    family,
    retryAfterSeconds: Math.max(1, Math.ceil((deadline - Date.now()) / 1000)),
    cooldownUntil: deadline,
  });
  return true;
}

export function useBrainReadCooldown(family: BrainReadFamily): {
  isCoolingDown: boolean;
  retryAfterSeconds: number | null;
  cooldownUntil: number;
} {
  const cooldownUntil = useSyncExternalStore(
    (listener) => {
      cooldownListeners.add(listener);
      return () => cooldownListeners.delete(listener);
    },
    () => getBrainReadCooldownDeadline(family),
    () => 0,
  );
  return {
    isCoolingDown: cooldownUntil > Date.now(),
    retryAfterSeconds: cooldownUntil ? Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000)) : null,
    cooldownUntil,
  };
}

export function subscribeRateLimitReports(listener: (event: CooldownEvent) => void): () => void {
  alertListeners.add(listener);
  return () => alertListeners.delete(listener);
}

export function resetBrainRateLimitStateForTests(): void {
  cooldowns.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  emitCooldownChange();
}

function retrySecondsFromResponse(res: Response, bodyText: string): number | null {
  return parseRetryAfterSeconds(res.headers.get("Retry-After")) ?? parseRetrySecondsFromMessage(bodyText);
}

export async function throwBrainRateLimitIfNeeded(res: Response, bodyText: string, family: BrainReadFamily): Promise<never> {
  throw startBrainReadCooldown(family, retrySecondsFromResponse(res, bodyText));
}

export async function fetchBrainRead(
  url: string,
  family: BrainReadFamily,
  init: RequestInit = {},
): Promise<Response> {
  if (isBrainReadCoolingDown(family)) {
    throw new BrainRateLimitError(family, Math.max(1, Math.ceil((getBrainReadCooldownDeadline(family) - Date.now()) / 1000)), getBrainReadCooldownDeadline(family));
  }
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")) || res.statusText;
    if (res.status === 429) {
      await throwBrainRateLimitIfNeeded(res, detail, family);
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res;
}

export async function fetchBrainJson<T>(
  url: string,
  family: BrainReadFamily,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetchBrainRead(url, family, init);
  return await res.json() as T;
}
