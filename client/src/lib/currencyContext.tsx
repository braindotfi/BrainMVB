import { createContext, useContext, useState, useCallback, ReactNode } from "react";

const STORAGE_KEY = "brain_default_currency";

interface CurrencyContextType {
  currency: string;
  setCurrency: (c: string) => void;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "USD";
    } catch {
      return "USD";
    }
  });

  const setCurrency = useCallback((c: string) => {
    setCurrencyState(c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextType {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}
