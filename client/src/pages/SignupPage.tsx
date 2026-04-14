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
      <header className="flex items-center px-6 h-[50px] flex-shrink-0 z-10 relative">
        <img src="/figmaAssets/brainfull2x.png" alt="Brain Finance" className="h-[32px] object-contain" />
      </header>

      <div className="flex-1 flex items-center justify-center z-10 relative px-4">
        {!keyLoaded ? (
          <div className="w-10 h-10 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
        ) : (
          <CrossmintSection apiKey={apiKey || ""} />
        )}
      </div>

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
      {apiKey && (
        <CrossmintErrorBoundary>
          <LazyEmbeddedAuth apiKey={apiKey} onSuccess={handleOnboarding} />
        </CrossmintErrorBoundary>
      )}

      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-[#1d2132]" />
        <span className="text-[#414965] text-xs [font-family:'Outfit',Helvetica]">or continue with demo</span>
        <div className="flex-1 h-px bg-[#1d2132]" />
      </div>

      <button
        onClick={handleDemoLogin}
        data-testid="button-demo-login"
        className="w-full py-3 px-6 rounded-2xl bg-[#131828] hover:bg-[#1a2235] border border-[#1d2132] hover:border-[#7631ee]/40 transition-colors [font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-base flex items-center justify-center gap-3"
      >
        <img src="/figmaAssets/brain2x.png" alt="" className="w-5 h-5 opacity-70 object-contain" />
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
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Crossmint] EmbeddedAuthForm crashed:", error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-[420px] rounded-[24px] bg-[#11141b] border border-[#1d2132] px-6 py-5 text-center">
          <p className="text-[#6c779d] text-sm [font-family:'Plus_Jakarta_Sans',Helvetica]">
            Sign-in form unavailable — use Demo below
          </p>
          <p className="text-[#d20344] text-[10px] mt-2 break-all opacity-70 font-mono">
            [boundary] {this.state.errorMessage}
          </p>
        </div>
      );
    }
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
  const [useAuthHook, setUseAuthHook] = useState<(() => any) | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    import("@crossmint/client-sdk-react-ui")
      .then((m) => {
        setComp(() => m.EmbeddedAuthForm);
        setProvider(() => m.CrossmintProvider);
        setAuthProv(() => m.CrossmintAuthProvider);
        setUseAuthHook(() => m.useCrossmintAuth);
      })
      .catch((err: unknown) => {
        const e = err as Error;
        const msg = e?.message ?? String(err);
        console.error("[Crossmint] SDK import failed:", msg, e?.stack ?? "");
        setSdkError(msg);
      });
  }, []);

  if (sdkError !== null) {
    return (
      <div className="w-full max-w-[420px] rounded-[24px] bg-[#11141b] border border-[#1d2132] px-6 py-5 text-center">
        <p className="text-[#6c779d] text-sm [font-family:'Plus_Jakarta_Sans',Helvetica]">
          Sign-in form unavailable — use Demo below
        </p>
        <p className="text-[#d20344] text-[10px] mt-2 break-all opacity-70 font-mono">
          [import] {sdkError}
        </p>
      </div>
    );
  }

  if (!Comp || !Provider || !AuthProv) {
    return <div className="w-8 h-8 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />;
  }

  const appearance = {
    colors: {
      background: "#11141b",
      backgroundSecondary: "#1d2132",
      backgroundTertiary: "#222737",
      inputBackground: "#222737",
      textPrimary: "#e8eaf0",
      textSecondary: "#6c779d",
      accent: "#7631ee",
      buttonBackground: "#7631ee",
      buttonText: "#ff9500",
      border: "#1d2132",
      danger: "#d20344",
      textLink: "#a8b9f4",
    },
    borderRadius: "12px",
  };

  return (
    <Provider apiKey={apiKey}>
      <AuthProv loginMethods={["email", "google"]} authModalTitle="Sign in to Brain" appearance={appearance}>
        <AuthWatcher useAuthHook={useAuthHook!} onSuccess={onSuccess}>
          <div className="w-full max-w-[420px] crossmint-form-wrapper">
            <div className="bg-[#11141b] border border-[#1d2132] rounded-[24px] overflow-hidden shadow-2xl">
              <Comp />
            </div>
          </div>
        </AuthWatcher>
      </AuthProv>
    </Provider>
  );
}

function AuthWatcher({
  useAuthHook,
  onSuccess,
  children,
}: {
  useAuthHook: () => any;
  onSuccess: (userId: string, email?: string, walletAddress?: string) => void;
  children: React.ReactNode;
}) {
  const auth = useAuthHook();
  const calledRef = useRef(false);

  useEffect(() => {
    if (auth?.status !== "logged-in" || !auth?.user) return;
    if (calledRef.current) return;
    calledRef.current = true;
    onSuccess(auth.user.id, auth.user.email, undefined);
  }, [auth?.status, auth?.user?.id]);

  return <>{children}</>;
}
