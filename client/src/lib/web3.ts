import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, metaMask, coinbaseWallet } from "wagmi/connectors";

const alchemyKey = import.meta.env.VITE_ALCHEMY_API_KEY;

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({
      appName: "Brain Finance",
      appLogoUrl: "/figmaAssets/logo.svg",
    }),
  ],
  transports: {
    [base.id]: http(
      alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : "https://mainnet.base.org"
    ),
    [baseSepolia.id]: http(
      alchemyKey
        ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
        : "https://sepolia.base.org"
    ),
  },
});

export const BASE_CHAIN_ID = base.id;
export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id;

/** Truncate a wallet address for display: 0x1234...abcd */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

/** Format ETH value (18 decimals bigint → human readable) */
export function formatEth(wei: bigint, decimals = 4): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(decimals);
}
