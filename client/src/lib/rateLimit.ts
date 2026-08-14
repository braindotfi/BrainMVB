export const RATE_LIMIT_EVENT = "brain:rate-limit";

export const RATE_LIMIT_ALERT_TITLE = "System Usage Error";

/** Identify a rate-limit failure from either a fetch wrapper or a mutation. */
export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /\b429\b/.test(error.message) ||
    /\brate[_ -]?limit(?:ed)?\b/i.test(error.message) ||
    /too many (?:requests|demo sessions)/i.test(error.message)
  );
}

function retryAfterSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.ceil(value);
  }
  if (typeof value === "string") {
    if (/^\d+$/.test(value.trim())) return Number(value.trim());
    const match = value.match(/(?:retry(?:\s+after|\s+in)|retry_after)[^0-9]*(\d+)\s*(?:s|sec(?:ond)?s?)?/i);
    if (match) return Number(match[1]);
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;

  const object = value as Record<string, unknown>;
  for (const key of ["retry_after", "retryAfter", "retry-after", "message", "body", "error"]) {
    const seconds = retryAfterSeconds(object[key]);
    if (seconds !== undefined) return seconds;
  }
  return undefined;
}

/** Notify the app shell without coupling request code to the alert provider. */
export function reportRateLimit(detail?: unknown): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(RATE_LIMIT_EVENT, {
        detail: { retryAfterSeconds: retryAfterSeconds(detail) },
      }),
    );
  }
}