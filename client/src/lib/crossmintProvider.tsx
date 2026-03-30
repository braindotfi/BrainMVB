import { useState, useEffect } from "react";
import {
  CrossmintProvider,
  CrossmintAuthProvider,
  CrossmintWalletProvider,
} from "@crossmint/client-sdk-react-ui";

interface CrossmintProvidersProps {
  children: React.ReactNode;
}

export function CrossmintProviders({ children }: CrossmintProvidersProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => setApiKey(cfg.crossmintApiKey ?? ""))
      .catch(() => setApiKey(""));
  }, []);

  if (apiKey === null) {
    return (
      <div className="w-full h-screen bg-[#06070a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="w-full h-screen bg-[#06070a] flex items-center justify-center">
        <p className="text-[#d20344] text-sm font-mono">Missing CROSSMINT_API_KEY</p>
      </div>
    );
  }

  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintAuthProvider
        loginMethods={["email", "google"]}
        embeddedWallets={{
          createOnLogin: "all-users",
          type: "evm-smart-wallet",
        }}
        termsOfServiceText={
          <span className="text-[10px] text-[#6c779d]">
            By continuing, you accept the{" "}
            <a
              href="https://www.crossmint.com/legal/terms-of-service"
              target="_blank"
              rel="noreferrer"
              className="underline text-[#a8b9f4] hover:text-white"
            >
              Terms of Service
            </a>
          </span>
        }
      >
        <CrossmintWalletProvider>{children}</CrossmintWalletProvider>
      </CrossmintAuthProvider>
    </CrossmintProvider>
  );
}
