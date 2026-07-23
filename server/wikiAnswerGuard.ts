/**
 * Structural degeneracy check for brain-core wiki answers.
 *
 * A payload is "degenerate" when it contains no meaningful scalar anywhere:
 * recursively, every leaf is null, undefined, "" or whitespace-only, and there
 * are no numbers, booleans, or non-empty strings at any depth. Sending such a
 * payload to the summarizer LLM makes it ask for input ("please share the
 * JSON…"), which would then be shown to the user.
 */
export function hasMeaningfulScalar(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulScalar);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulScalar);
  }
  return false;
}

/**
 * True when the stringified wiki payload should be treated as "no usable
 * answer". Unparseable input is NOT degenerate — the caller falls back to the
 * raw text path in that case.
 */
export function isDegenerateWikiPayload(payload: string): boolean {
  const trimmed = (payload ?? "").trim();
  if (trimmed === "") return true;
  try {
    return !hasMeaningfulScalar(JSON.parse(trimmed));
  } catch {
    // Not JSON — a non-empty plain string is itself a meaningful scalar.
    return false;
  }
}
