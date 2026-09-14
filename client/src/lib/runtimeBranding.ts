const LEGACY_PRODUCT_NAME = ["Br", "ain"].join("");
const LEGACY_PRODUCT_TOKEN = /\bBrain(?:'s)?\b/g;

/**
 * Normalize product-authored copy received from live services.
 *
 * Callers must apply this only to fields authored by RobotMoney services, never
 * to tenant, counterparty, or document text. Internal route names, identifiers,
 * and protocol fields must also bypass this helper.
 */
export function normalizeRuntimeBranding(
  text: string,
  protectedValues: readonly string[] = [],
): string {
  const masks: string[] = [];
  const mask = (value: string): string => {
    const token = `\uE000${masks.length}\uE001`;
    masks.push(value);
    return token;
  };

  let normalized = text;
  for (const value of [...new Set(protectedValues)].sort((a, b) => b.length - a.length)) {
    if (!value || !value.includes(LEGACY_PRODUCT_NAME)) continue;
    normalized = normalized.split(value).join(mask(value));
  }

  normalized = normalized.replace(LEGACY_PRODUCT_TOKEN, (match) =>
    match.endsWith("'s") ? "RobotMoney's" : "RobotMoney",
  );

  return normalized.replace(/\uE000(\d+)\uE001/g, (_, index: string) => masks[Number(index)]);
}

/** For fields whose complete value is a product identity, never business text. */
export function normalizeProductIdentity(text: string): string {
  return text.replace(LEGACY_PRODUCT_TOKEN, (match) =>
    match.endsWith("'s") ? "RobotMoney's" : "RobotMoney",
  );
}

/** Collect string leaves from structured ledger/user context for exact masking. */
export function collectRuntimeProtectedValues(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectRuntimeProtectedValues);
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectRuntimeProtectedValues);
}

/** Mapping boundary for the product-authored recommendation shown on Overview. */
export function normalizeOverviewRecommendation(
  text: string,
  protectedValues: readonly string[] = [],
): string {
  return normalizeRuntimeBranding(text, protectedValues);
}