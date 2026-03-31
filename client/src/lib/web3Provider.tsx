import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "./web3";
import { queryClient } from "./queryClient";
import { AuthProvider } from "./authContext";

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#7631ee",
            accentColorForeground: "white",
            borderRadius: "large",
            overlayBlur: "small",
          })}
          appInfo={{
            appName: "Brain Finance",
            learnMoreUrl: "https://brainfinance.io",
          }}
        >
          <AuthProvider>
            {children}
          </AuthProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
