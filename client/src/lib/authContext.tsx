import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { queryClient } from "./queryClient";

export interface AuthUser {
  id: string;
  username?: string;
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
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
  user: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  wirexAccounts: WirexAccount[];
  wirexLoading: boolean;
  loginWithPassword: (identifier: string, password: string) => Promise<void>;
  register: (params: { email: string; username?: string; password: string; name?: string }) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  deleteAccountData: () => Promise<void>;
  refreshWirexAccounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [wirexAccounts, setWirexAccounts] = useState<WirexAccount[]>([]);
  const [wirexLoading, setWirexLoading] = useState(false);

  // Bootstrap the session from the server cookie on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/user", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setUser(data.user ?? null);
        }
      } catch {
        /* not logged in */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    if (user?.email) refreshWirexAccounts();
  }, [user?.email, refreshWirexAccounts]);

  const loginWithPassword = useCallback(async (identifier: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Login failed");
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (params: { email: string; username?: string; password: string; name?: string }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Registration failed");
      setUser(data.user);
    },
    [],
  );

  const loginWithGoogle = useCallback(() => {
    window.location.href = "/api/auth/google";
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    setUser(null);
    setWirexAccounts([]);
    queryClient.clear();
  }, []);

  const deleteAccount = useCallback(async () => {
    const current = user;
    if (!current) return;
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    setUser(null);
    setWirexAccounts([]);
    queryClient.clear();
  }, [user]);

  const deleteAccountData = useCallback(async () => {
    const current = user;
    if (!current) return;
    const res = await fetch("/api/account/data", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: current.id,
        email: current.email,
        walletAddress: current.walletAddress,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Data deletion failed (${res.status})`);
    }
    queryClient.clear();
    setWirexAccounts([]);
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      isLoading,
      wirexAccounts,
      wirexLoading,
      loginWithPassword,
      register,
      loginWithGoogle,
      logout,
      deleteAccount,
      deleteAccountData,
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
