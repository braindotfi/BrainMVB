import { useState, useEffect } from "react";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import { EVMWallet } from "@crossmint/client-sdk-react-ui";
import { formatEther } from "viem";

export interface CrossmintWalletState {
  email: string | null;
  walletAddress: string | null;
  walletAddressShort: string | null;
  ethBalance: string | null;
  ethBalanceRaw: bigint | null;
  isLoading: boolean;
  isReady: boolean;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function useCrossmintWallet(): CrossmintWalletState {
  const { user, status: authStatus } = useAuth();
  const { wallet, status: walletStatus } = useWallet();
  const [ethBalanceRaw, setEthBalanceRaw] = useState<bigint | null>(null);

  useEffect(() => {
    if (!wallet || walletStatus !== "loaded") {
      setEthBalanceRaw(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const evmWallet = EVMWallet.from(wallet as Parameters<typeof EVMWallet.from>[0]);
        const client = evmWallet.getViemClient();
        const bal = await client.getBalance({
          address: wallet.address as `0x${string}`,
        });
        if (!cancelled) setEthBalanceRaw(bal);
      } catch {
        if (!cancelled) setEthBalanceRaw(0n);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, walletStatus]);

  const walletAddress = wallet?.address ?? null;
  const isLoading =
    authStatus === "initializing" || authStatus === "in-progress" ||
    walletStatus === "in-progress" || walletStatus === "not-loaded";
  const isReady = walletStatus === "loaded" && !!walletAddress;

  const ethBalance =
    ethBalanceRaw !== null
      ? parseFloat(formatEther(ethBalanceRaw)).toFixed(4)
      : null;

  return {
    email: user?.email ?? null,
    walletAddress,
    walletAddressShort: walletAddress ? shortenAddress(walletAddress) : null,
    ethBalance,
    ethBalanceRaw,
    isLoading,
    isReady,
  };
}
