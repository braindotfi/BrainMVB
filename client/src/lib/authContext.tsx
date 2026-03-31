import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface CrossmintUser {
  id: string;
  email?: string;
}

export interface WirexAccount {
  id: string;
  type: "wallet" | "debit" | "bank";
  address?: string;
  iban?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  nameOnAccount?: string;
  balance?: string;
  currency?: string;
}

interface AuthContextType {
  user: CrossmintUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  wirexAccounts: WirexAccount[];
  wirexLoading: boolean;
  login: () => void;
  logout: () => void;
  setUserAndAccounts: (user: CrossmintUser, accounts: WirexAccount[]) => void;
  refreshWirexAccounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = "brain_auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CrossmintUser | null>(() => {
    try {
      const stored = sessionStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [wirexAccounts, setWirexAccounts] = useState<WirexAccount[]>([]);
  const [wirexLoading, setWirexLoading] = useState(false);
  const [loginRequested, setLoginRequested] = useState(false);

  const refreshWirexAccounts = useCallback(async () => {
    if (!user?.email) return;
    setWirexLoading(true);
    try {
      const res = await fetch(`/api/wirex/accounts?email=${encodeURIComponent(user.email)}`);
      if (res.ok) {
        const data = await res.json();
        setWirexAccounts(data.accounts ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch WireX accounts:", e);
    } finally {
      setWirexLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (user?.email) {
      refreshWirexAccounts();
    }
  }, [user?.email]);

  const login = useCallback(() => {
    setLoginRequested(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
    setWirexAccounts([]);
    setLoginRequested(false);
  }, []);

  const setUserAndAccounts = useCallback((u: CrossmintUser, accounts: WirexAccount[]) => {
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    setWirexAccounts(accounts);
    setLoginRequested(false);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      isLoading,
      wirexAccounts,
      wirexLoading,
      login,
      logout,
      setUserAndAccounts,
      refreshWirexAccounts,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
