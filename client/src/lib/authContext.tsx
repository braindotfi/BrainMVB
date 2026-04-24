import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface CrossmintUser {
  id: string;
  email?: string;
  walletAddress?: string;
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
  deleteAccount: () => Promise<void>;
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

  // Fetch the real Crossmint wallet address if we don't already have one
  const refreshWalletAddress = useCallback(async (userId: string, email?: string) => {
    try {
      const params = new URLSearchParams({ userId });
      if (email) params.set("email", email);
      const res = await fetch(`/api/crossmint/wallet?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.address) {
          setUser((prev) => {
            if (!prev || prev.walletAddress === data.address) return prev;
            const updated = { ...prev, walletAddress: data.address };
            try { sessionStorage.setItem(USER_KEY, JSON.stringify(updated)); } catch {}
            return updated;
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch Crossmint wallet address:", e);
    }
  }, []);

  useEffect(() => {
    if (user?.email) {
      refreshWirexAccounts();
    }
  }, [user?.email]);

  // Whenever we have a userId but no wallet address, try to resolve it
  useEffect(() => {
    if (user?.id && !user?.walletAddress) {
      refreshWalletAddress(user.id, user?.email);
    }
  }, [user?.id, user?.walletAddress]);

  const login = useCallback(() => {
    setLoginRequested(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
    setWirexAccounts([]);
    setLoginRequested(false);
  }, []);

  const deleteAccount = useCallback(async () => {
    const current = user;
    if (!current) return;
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: current.id,
        email: current.email,
        walletAddress: current.walletAddress,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Account deletion failed (${res.status})`);
    }
    // Account is gone — clear local session.
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
    setWirexAccounts([]);
    setLoginRequested(false);
  }, [user]);

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
      deleteAccount,
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
