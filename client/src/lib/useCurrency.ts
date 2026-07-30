import { useContext } from "react";
import { CurrencyContext, type CurrencyContextType } from "./currencyContext";

export function useCurrency(): CurrencyContextType {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}
