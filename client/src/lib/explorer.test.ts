import { describe, it, expect, afterEach, vi } from "vitest";
import { explorerTxUrl, normalizeTxHash } from "./explorer";

describe("normalizeTxHash", () => {
  it("prepends 0x to bare hex and leaves prefixed hashes intact", () => {
    expect(normalizeTxHash("deadbeef")).toBe("0xdeadbeef");
    expect(normalizeTxHash("0xdeadbeef")).toBe("0xdeadbeef");
    expect(normalizeTxHash("  abc123  ")).toBe("0xabc123");
    expect(normalizeTxHash("0Xabc123")).toBe("0xabc123");
  });
});

describe("explorerTxUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to Base Sepolia when VITE_ANCHOR_CHAIN is unset", () => {
    expect(explorerTxUrl("abc")).toBe("https://sepolia.basescan.org/tx/0xabc");
  });

  it("uses Base mainnet host when VITE_ANCHOR_CHAIN=base", () => {
    vi.stubEnv("VITE_ANCHOR_CHAIN", "base");
    expect(explorerTxUrl("0xabc")).toBe("https://basescan.org/tx/0xabc");
  });
});
