import { useEffect, useState } from "react";
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
          <span className="[font-family:'Gilroy-Bold',Helvetica] text-white text-xl tracking-tight">brain</span>
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
        <span className="[font-family:'Mont-Regular',Helvetica] text-[#3a4060] text-sm">
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

  if (!apiKey) {
    return (
      <div className="text-[#6c779d] text-sm text-center max-w-sm">
        Crossmint API key not configured. Please add CROSSMINT_CLIENT_API_KEY to secrets.
      </div>
    );
  }

  const handleOnboarding = async (userId: string, email?: string, walletAddress?: string) => {
    if (status === "creating") return;
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

  if (status === "creating") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
        <span className="text-[#a8b9f4] text-base [font-family:'Gilroy-Medium',Helvetica]">
          Setting up your wallet &amp; accounts…
        </span>
      </div>
    );
  }

  return (
    <CrossmintAuthWrapper apiKey={apiKey} onSuccess={handleOnboarding} />
  );
}

function CrossmintAuthWrapper({
  apiKey,
  onSuccess,
}: {
  apiKey: string;
  onSuccess: (userId: string, email?: string, walletAddress?: string) => void;
}) {
  return (
    <LazyEmbeddedAuth apiKey={apiKey} onSuccess={onSuccess} />
  );
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

  useEffect(() => {
    import("@crossmint/client-sdk-react-ui").then((m) => {
      setComp(() => m.EmbeddedAuthForm);
      setProvider(() => m.CrossmintProvider);
      setAuthProv(() => m.CrossmintAuthProvider);
      setUseAuthHook(() => m.useAuth);
    });
  }, []);

  if (!Comp || !Provider || !AuthProv) {
    return <div className="w-8 h-8 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />;
  }

  return (
    <Provider apiKey={apiKey}>
      <AuthProv loginMethods={["email", "google"]}>
        <AuthWatcher useAuthHook={useAuthHook!} onSuccess={onSuccess}>
          <div className="w-full max-w-[420px]">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
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

  useEffect(() => {
    if (auth?.status === "logged-in" && auth?.user) {
      // Crossmint SDK may expose the wallet address on different fields depending on version
      const user = auth.user;
      const walletAddress =
        user?.wallet?.address ||
        user?.wallets?.[0]?.address ||
        user?.linkedWallets?.[0]?.address ||
        user?.evmWallet?.address ||
        undefined;
      onSuccess(user.id, user.email, walletAddress);
    }
  }, [auth?.status, auth?.user?.id]);

  return <>{children}</>;
}
