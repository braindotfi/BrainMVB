import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

const STORAGE_KEY = "brain_default_currency";

export type CurrencyCode = "USD" | "EUR";

const SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
};

interface CurrencyContextType {
  currency: CurrencyCode;
  symbol: string;
  setCurrency: (c: string) => void;
  /** Re-prefixes a numeric string (which may already start with $, +, -, or be plain) with the current currency symbol. */
  format: (amount: string | number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

function reformat(amount: string | number, symbol: string): string {
  if (typeof amount === "number") {
    const sign = amount < 0 ? "-" : "";
    return `${sign}${symbol}${Math.abs(amount).toLocaleString()}`;
  }
  const s = String(amount).trim();
  if (!s) return s;
  // Strip a leading sign and remember it
  let sign = "";
  let rest = s;
  if (rest.startsWith("+") || rest.startsWith("-")) {
    sign = rest[0];
    rest = rest.slice(1).trimStart();
  }
  // Strip any leading currency symbol/code (handles "$", "USD ", etc.)
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
    return {
      currency,
      symbol,
      setCurrency,
      format: (amount) => reformat(amount, symbol),
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
