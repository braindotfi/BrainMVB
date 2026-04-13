import { Component, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useLocation } from "wouter";

export function SignupPage() {
  const { isLoggedIn } = useAuth();
  const [, navigate] = useLocation();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyLoaded, setKeyLoaded] = useState(false);

  useEffect(() => {
    if (isLoggedIn) { navigate("/"); return; }
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => { setApiKey(d.crossmintApiKey || ""); setKeyLoaded(true); })
      .catch(() => { setApiKey(""); setKeyLoaded(true); });
  }, [isLoggedIn]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#06070a] flex flex-col">
      {/* ── Topbar ── */}
      <header className="flex items-center px-6 h-[50px] flex-shrink-0 z-10 relative">
        <div className="flex items-center gap-2">
          <img src="/figmaAssets/frame-1000002163.svg" alt="Brain" className="w-6 h-6" />
          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-xl tracking-tight">brain</span>
        </div>
      </header>

      {/* ── Centered auth form ── */}
      <div className="flex-1 flex items-center justify-center z-10 relative px-4">
        {!keyLoaded ? (
          <div className="w-10 h-10 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
        ) : (
          <CrossmintSection apiKey={apiKey || ""} />
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between px-6 h-14 flex-shrink-0 z-10 relative">
        <span className="[font-family:'Outfit',Helvetica] text-[#3a4060] text-sm">
          Copyright © 2025 Brain Finance. All rights reserved.
        </span>
        <img alt="Socials" src="/figmaAssets/socials.svg" className="opacity-40" />
      </footer>
    </div>
  );
}

function CrossmintSection({ apiKey }: { apiKey: string }) {
  const { setUserAndAccounts } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"idle" | "creating" | "done">("idle");

  const handleOnboarding = async (userId: string, email?: string, walletAddress?: string) => {
    if (status !== "idle") return;
    setStatus("creating");
    try {
      const res = await fetch("/api/wirex/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email, walletAddress }),
      });
      const data = await res.json();
      setUserAndAccounts({ id: userId, email, walletAddress }, data.accounts ?? []);
    } catch {
      setUserAndAccounts({ id: userId, email, walletAddress }, []);
    }
    navigate("/");
  };

  const handleDemoLogin = () => handleOnboarding("demo-user", "demo@brain.finance");

  if (status === "creating") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
        <span className="text-[#a8b9f4] text-base [font-family:'Plus Jakarta Sans',Helvetica]">
          Setting up your wallet &amp; accounts…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-[420px]">
      {/* Crossmint form — wrapped in error boundary; hidden gracefully on failure */}
      {apiKey && (
        <CrossmintErrorBoundary>
          <LazyEmbeddedAuth apiKey={apiKey} onSuccess={handleOnboarding} />
        </CrossmintErrorBoundary>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-[#1d2132]" />
        <span className="text-[#414965] text-xs [font-family:'Outfit',Helvetica]">or continue with demo</span>
        <div className="flex-1 h-px bg-[#1d2132]" />
      </div>

      {/* Demo login — always shown */}
      <button
        onClick={handleDemoLogin}
        data-testid="button-demo-login"
        className="w-full py-3 px-6 rounded-2xl bg-[#131828] hover:bg-[#1a2235] border border-[#1d2132] hover:border-[#7631ee]/40 transition-colors [font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-base flex items-center justify-center gap-3"
      >
        <img src="/figmaAssets/frame-1000002163.svg" alt="" className="w-5 h-5 opacity-70" />
        Continue with Demo
      </button>
      <p className="text-[#414965] text-xs">
        No wallet required · Explore all features
      </p>
    </div>
  );
}

class CrossmintErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function LazyEmbeddedAuth({
  apiKey,
  onSuccess,
}: {
  apiKey: string;
  onSuccess: (userId: string, email?: string, walletAddress?: string) => void;
}) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  const [Provider, setProvider] = useState<React.ComponentType<any> | null>(null);
  const [AuthProv, setAuthProv] = useState<React.ComponentType<any> | null>(null);
  const [WalletProv, setWalletProv] = useState<React.ComponentType<any> | null>(null);
  const [useAuthHook, setUseAuthHook] = useState<(() => any) | null>(null);
  const [useWalletHook, setUseWalletHook] = useState<(() => any) | null>(null);
  const [sdkError, setSdkError] = useState(false);

  useEffect(() => {
    import("@crossmint/client-sdk-react-ui")
      .then((m) => {
        setComp(() => m.EmbeddedAuthForm);
        setProvider(() => m.CrossmintProvider);
        setAuthProv(() => m.CrossmintAuthProvider);
        setWalletProv(() => m.CrossmintWalletProvider);
        setUseAuthHook(() => m.useAuth);
        setUseWalletHook(() => m.useWallet);
      })
      .catch(() => setSdkError(true));
  }, []);

  if (sdkError) return null;

  if (!Comp || !Provider || !AuthProv || !WalletProv) {
    return <div className="w-8 h-8 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />;
  }

  return (
    <Provider apiKey={apiKey}>
      <AuthProv loginMethods={["email", "google"]}>
        <WalletProv createOnLogin={{ chain: "base-sepolia", signer: { type: "email" } }}>
          <AuthWatcher useAuthHook={useAuthHook!} useWalletHook={useWalletHook!} onSuccess={onSuccess}>
            <div className="w-full max-w-[420px]">
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                <Comp />
              </div>
            </div>
          </AuthWatcher>
        </WalletProv>
      </AuthProv>
    </Provider>
  );
}

function AuthWatcher({
  useAuthHook,
  useWalletHook,
  onSuccess,
  children,
}: {
  useAuthHook: () => any;
  useWalletHook: () => any;
  onSuccess: (userId: string, email?: string, walletAddress?: string) => void;
  children: React.ReactNode;
}) {
  const auth = useAuthHook();
  const walletCtx = useWalletHook();
  const calledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walletAddressRef = useRef<string | undefined>(undefined);
  walletAddressRef.current = walletCtx?.wallet?.address ?? undefined;

  useEffect(() => {
    if (auth?.status !== "logged-in" || !auth?.user) return;
    if (calledRef.current) return;

    const walletStatus = walletCtx?.status;

    if (walletStatus === "loaded") {
      calledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      onSuccess(auth.user.id, auth.user.email, walletCtx?.wallet?.address);
      return;
    }

    if (walletStatus === "error") {
      calledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      onSuccess(auth.user.id, auth.user.email, undefined);
      return;
    }

    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        if (!calledRef.current) {
          calledRef.current = true;
          onSuccess(auth.user.id, auth.user.email, walletAddressRef.current);
        }
      }, 6000);
    }
  }, [auth?.status, auth?.user?.id, walletCtx?.status]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return <>{children}</>;
}
