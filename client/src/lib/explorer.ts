/* Block-explorer URL helpers for audit anchors. Kept dependency-free (no wallet SDK
   import) so data modules and vitest suites can use them without pulling in
   the whole web3 stack. */

/** The chain audit anchors land on. Configured, not hardcoded at call sites:
 *  VITE_ANCHOR_CHAIN="base" switches to Base mainnet; anything else (or unset)
 *  is Base Sepolia, matching the default demo contract mode. */
type AnchorChain = "base" | "base-sepolia";

const EXPLORER_HOST: Record<AnchorChain, string> = {
  "base": "https://basescan.org",
  "base-sepolia": "https://sepolia.basescan.org",
};

function anchorChain(): AnchorChain {
  return import.meta.env?.VITE_ANCHOR_CHAIN === "base" ? "base" : "base-sepolia";
}

/** Normalize a tx hash to 0x-prefixed form (brain-core returns bare hex). */
export function normalizeTxHash(hash: string): string {
  const t = hash.trim();
  return t.startsWith("0x") || t.startsWith("0X") ? `0x${t.slice(2)}` : `0x${t}`;
}

/** Basescan tx URL for the configured anchor chain. Callers must only pass a
 *  real, confirmed tx hash — never build a URL from a null/absent hash. */
export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_HOST[anchorChain()]}/tx/${normalizeTxHash(txHash)}`;
}
