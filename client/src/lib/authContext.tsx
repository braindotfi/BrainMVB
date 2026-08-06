import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { queryClient } from "./queryClient";
import { clearMembers } from "./membersStore";
import { setDemoDataEnabled } from "./demoMode";
import { resetAcknowledgedStore } from "./acknowledgedStore";
import { setBackupApproverScope } from "./backupApprover";
import { markOnboardingComplete } from "./onboarding";
import { resetUserContact } from "./userContact";

export interface AuthUser {
  id: string;
  username?: string;
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
  /** Server-decided (publicUser): true ONLY for the demo accounts. Gates every
      demo-only synthetic-data surface via demoMode.ts. */
  isDemo?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  /** True while an auth request may be rotating the browser session cookie. */
  isTransitioning: boolean;
  loginWithPassword: (identifier: string, password: string) => Promise<void>;
  register: (params: { email: string; username?: string; password: string; name?: string }) => Promise<void>;
  loginDemoFresh: (opts?: { skipOnboarding?: boolean }) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  deleteAccountData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Every piece of module-level, user-scoped client state that must be re-pointed
    or cleared when the signed-in user changes. Because this is a single-page app,
    an auth transition (logout → new account, demo → fresh account) does NOT
    remount these modules, so anything left here silently carries over and renders
    on the next account as activity it never had.

    Runs on EVERY transition — `loginWithPassword`, `register`, `loginDemoFresh`,
    session bootstrap, and `logout` (via `setUser(null)`) — not
    just the paths that happen to call `logout()`. Exported so tests can pin the
    funnel without mounting the provider. Add new user-scoped stores HERE, not to
    an individual caller. */
export function applyUserScopedResets(u: AuthUser | null): void {
  setDemoDataEnabled(!!u?.isDemo);
  resetAcknowledgedStore();
  /* Member ids are tenant-scoped, so backup-approver marks are re-pointed at the
     new account rather than carried over. Re-pointing (not clearing) because this
     funnel also runs on session bootstrap, where clearing would wipe the marks on
     every page load. */
  setBackupApproverScope(u?.id ?? null);
  /* Clear the in-memory email/phone overrides so contact info from a previous
     real-user session cannot bleed into a subsequent demo session (or vice versa).
     Pass isDemo so resetUserContact knows whether to permit a localStorage reload:
     demo sessions must not rehydrate from the prior real user's stored values. */
  resetUserContact(!!u?.isDemo);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Single funnel for user changes so the demo-data gate can NEVER drift from
  // the signed-in user. Real accounts (isDemo false/absent) disable all
  // demo-only synthetic data surfaces.
  const setUser = useCallback((u: AuthUser | null) => {
    applyUserScopedResets(u);
    setUserState(u);
  }, []);

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

  const loginWithPassword = useCallback(async (identifier: string, password: string) => {
    setIsTransitioning(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Login failed");
      // Clear any stale queries from a prior session (e.g. demo → real user switch)
      // before applying the new user identity, so no cached data from the previous
      // principal leaks into this session's renders. Same pattern as loginDemoFresh.
      queryClient.clear();
      clearMembers();
      setUser(data.user);
    } finally {
      setIsTransitioning(false);
    }
  }, []);

  const register = useCallback(
    async (params: { email: string; username?: string; password: string; name?: string }) => {
      setIsTransitioning(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(params),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Registration failed");
        // Same cache-clear as loginWithPassword — guards against any prior session data.
        queryClient.clear();
        clearMembers();
        setUser(data.user);
      } finally {
        setIsTransitioning(false);
      }
    },
    [],
  );

  /**
   * Fresh demo identity: a brand-new demo-fresh-<id>@brain.fi user, which durable tenancy
   * then backs with a brand-new seeded tenant. Isolated per visitor - nobody inherits the
   * previous visitor's state.
   *
   * `skipOnboarding` controls where the visitor lands. The PUBLIC "Continue with Demo"
   * button passes true so the walkthrough opens directly on a populated Home; without it
   * HomePage shows the first-visit onboarding flow instead (the default kept here for
   * internal use, where seeing onboarding is the point).
   */
  const loginDemoFresh = useCallback(async (opts?: { skipOnboarding?: boolean }) => {
    setIsTransitioning(true);
    try {
      const res = await fetch("/api/auth/demo-fresh", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Demo login failed");
      const u = data.user;
      if (opts?.skipOnboarding) markOnboardingComplete(u.id);
      // Clear the React Query cache and members store before switching the user
      // state. Without this, all queries cached for the previous (real) user
      // persist in the cache and Settings/Home/Finances pages continue to render
      // that user's tenant data — including company name, email, ledger figures,
      // proposals, etc. — until each query happens to stale-expire on its own.
      // This is the same pattern logout() and deleteAccount() already use.
      queryClient.clear();
      clearMembers();
      setUser(u);
    } finally {
      setIsTransitioning(false);
    }
  }, []);

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
    queryClient.clear();
    clearMembers();
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
    queryClient.clear();
    clearMembers();
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
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      isLoading,
      isTransitioning,
      loginWithPassword,
      register,
      loginDemoFresh,
      loginWithGoogle,
      logout,
      deleteAccount,
      deleteAccountData,
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
