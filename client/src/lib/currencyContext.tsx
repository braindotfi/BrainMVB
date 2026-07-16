import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

const STORAGE_KEY = "brain_default_currency";

export type CurrencyCode = "USD" | "EUR";

const SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
};

/** Static FX rates relative to USD (the canonical/source currency for the demo data). */
const USD_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
};

interface CurrencyContextType {
  currency: CurrencyCode;
  symbol: string;
  setCurrency: (c: string) => void;
  /** Convert a USD amount (number or string like "$1,234.56" / "-$2,400") into the
   * active currency, returning a symbol-prefixed string with the same decimal places. */
  format: (amount: string | number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

/** Parse "+$1,234.56", "-$2,400", "1234.5", 1234 etc. into { sign, value, decimals }.
 * Returns null if no number can be extracted (in which case callers should fall back
 * to a pure-symbol swap). */
function parseAmount(amount: string | number): { sign: "" | "-"; value: number; decimals: number } | null {
  if (typeof amount === "number") {
    if (!isFinite(amount)) return null;
    return { sign: amount < 0 ? "-" : "", value: Math.abs(amount), decimals: Number.isInteger(amount) ? 0 : 2 };
  }
  const s = String(amount).trim();
  if (!s) return null;
  let rest = s;
  let sign: "" | "-" = "";
  if (rest.startsWith("+") || rest.startsWith("-")) {
    if (rest[0] === "-") sign = "-";
    rest = rest.slice(1).trimStart();
  }
  rest = rest.replace(/^(?:\$|€|£|¥|USD|EUR|GBP|JPY)\s*/i, "");
  const match = rest.match(/^(\d[\d,]*)(?:\.(\d+))?/);
  if (!match) return null;
  const intPart = match[1].replace(/,/g, "");
  const decPart = match[2] ?? "";
  const value = Number(`${intPart}.${decPart || "0"}`);
  if (!isFinite(value)) return null;
  return { sign, value, decimals: decPart.length };
}

function formatConverted(parsed: { sign: "" | "-"; value: number; decimals: number }, symbol: string, rate: number): string {
  const converted = parsed.value * rate;
  const formatted = converted.toLocaleString("en-US", {
    minimumFractionDigits: parsed.decimals,
    maximumFractionDigits: parsed.decimals,
  });
  return `${parsed.sign}${symbol}${formatted}`;
}

function reformat(amount: string | number, symbol: string, rate: number): string {
  const parsed = parseAmount(amount);
  if (parsed) return formatConverted(parsed, symbol, rate);
  // Fallback: couldn't parse a number - just swap the leading symbol.
  const s = String(amount).trim();
  if (!s) return s;
  let sign = "";
  let rest = s;
  if (rest.startsWith("+") || rest.startsWith("-")) {
    sign = rest[0];
    rest = rest.slice(1).trimStart();
  }
  rest = rest.replace(/^(?:\$|€|£|¥|USD|EUR|GBP|JPY)\s*/i, "");
  return `${sign}${symbol}${rest}`;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "USD" || stored === "EUR") return stored;
      return "USD";
    } catch {
      return "USD";
    }
  });

  const setCurrency = useCallback((c: string) => {
    const next: CurrencyCode = c === "EUR" ? "EUR" : "USD";
    setCurrencyState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  const value = useMemo<CurrencyContextType>(() => {
    const symbol = SYMBOLS[currency];
    const rate = USD_RATES[currency];
    return {
      currency,
      symbol,
      setCurrency,
      format: (amount) => reformat(amount, symbol, rate),
    };
  }, [currency, setCurrency]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextType {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}
