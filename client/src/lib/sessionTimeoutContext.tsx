import { createContext, useContext, useState, useCallback, ReactNode } from "react";

const STORAGE_KEY = "brain_session_timeout_min";

export const SESSION_TIMEOUT_OPTIONS_MIN = [5, 15, 30, 60] as const;

export const formatTimeoutLabel = (min: number): string =>
  min >= 60 && min % 60 === 0
    ? `${min / 60} hr`
    : `${min} min`;

interface SessionTimeoutContextType {
  timeoutMin: number;
  setTimeoutMin: (min: number) => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType | null>(null);

export function SessionTimeoutProvider({ children }: { children: ReactNode }) {
  const [timeoutMin, setTimeoutMinState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 5;
    } catch {
      return 5;
    }
  });

  const setTimeoutMin = useCallback((min: number) => {
    setTimeoutMinState(min);
    try { localStorage.setItem(STORAGE_KEY, String(min)); } catch {}
  }, []);

  return (
    <SessionTimeoutContext.Provider value={{ timeoutMin, setTimeoutMin }}>
      {children}
    </SessionTimeoutContext.Provider>
  );
}

export function useSessionTimeout(): SessionTimeoutContextType {
  const ctx = useContext(SessionTimeoutContext);
  if (!ctx) throw new Error("useSessionTimeout must be used inside SessionTimeoutProvider");
  return ctx;
}
