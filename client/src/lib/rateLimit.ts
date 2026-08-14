export const RATE_LIMIT_EVENT = "brain:rate-limit";

export const RATE_LIMIT_ALERT_TITLE = "Rate limit reached";
export const RATE_LIMIT_ALERT_DESCRIPTION =
  "Brain is temporarily limiting requests. Please try again shortly.";

/** Identify a rate-limit failure from either a fetch wrapper or a mutation. */
export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /\b429\b/.test(error.message) ||
    /\brate[_ -]?limited\b/i.test(error.message) ||
    /too many (?:requests|demo sessions)/i.test(error.message)
  );
}

/** Notify the app shell without coupling request code to the alert provider. */
export function reportRateLimit(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RATE_LIMIT_EVENT));
  }
}