import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "./web3";
import { queryClient } from "./queryClient";

interface Web3ProviderProps {
  children: React.ReactNode;
}

/**
 * Correct provider order per RainbowKit v2 docs:
 * WagmiProvider > QueryClientProvider > RainbowKitProvider
 *
 * The outer QueryClientProvider in App.tsx handles the rest of the app's
 * queries. RainbowKit needs its own dedicated nesting order.
 */
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
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
