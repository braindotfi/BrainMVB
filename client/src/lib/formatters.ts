/**
 * Shared number formatting utilities for Brain Finance.
 * Use these consistently across all display and input components.
 */

/** Strip thousands commas from a string (for parsing) */
export const stripCommas = (s: string): string => s.replace(/,/g, "");

/**
 * Parse an amount string (possibly comma-formatted) to a number.
 * Returns 0 for invalid/empty input.
 */
export const parseAmt = (s: string | number): number => {
  if (typeof s === "number") return isNaN(s) ? 0 : s;
  const n = parseFloat(stripCommas(s));
  return isNaN(n) ? 0 : n;
};

/**
 * Format a number with thousands separators and fixed decimal places.
 * e.g. 1234567.89 → "1,234,567.89"
 */
export const fmt = (value: number | string, decimals = 2): string => {
  const n = parseAmt(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Format as USD currency string: "$1,234.56"
 */
export const fmtUsd = (value: number | string, decimals = 2): string =>
  "$" + fmt(value, decimals);

/**
 * Format a crypto/token amount with up to maxDecimals significant decimals,
 * always at least 2. Trailing zeros are trimmed beyond 2 places.
 * e.g. 1.245 → "1.245", 100.0 → "100.00"
 */
export const fmtCrypto = (value: number | string, maxDecimals = 6): string => {
  const n = parseAmt(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
};

/**
 * Format a percentage: 12.5 → "12.50%"
 */
export const fmtPct = (value: number | string, decimals = 2): string =>
  fmt(value, decimals) + "%";

/**
 * Format a number for display inside an input field (on blur).
 * Returns the raw string unchanged if it's empty or not a valid number,
 * so the input doesn't jump while the user is typing.
 */
export const fmtInputBlur = (value: string, decimals = 2): string => {
  const stripped = stripCommas(value);
  if (stripped === "" || stripped === "." || stripped === "-") return value;
  const n = parseFloat(stripped);
  if (isNaN(n)) return value;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Sanitise a user keystroke for a numeric input.
 * Strips everything except digits and a single decimal point.
 * Call this in onChange before storing the value.
 */
export const sanitiseNumInput = (raw: string): string =>
  raw
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1");
