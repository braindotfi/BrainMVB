import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { truncateAddress } from "@/lib/web3";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const [signing, setSigning] = useState(false);
  const [authed, setAuthed] = useState(false);

  const handleSIWE = async () => {
    if (!address || authed) return;
    setSigning(true);
    try {
      // 1. Get nonce
      const nonceRes = await fetch("/api/auth/nonce").then(r => r.json());
      const nonce = nonceRes.nonce;

      // 2. Build SIWE message
      const message = [
        "Brain Finance wants you to sign in with your Ethereum account:",
        address,
        "",
        "Sign in to Brain Finance - AI Agent Marketplace on Base.",
        "",
        `URI: ${window.location.origin}`,
        "Version: 1",
        `Chain ID: ${chain?.id ?? 8453}`,
        `Nonce: ${nonce}`,
        `Issued At: ${new Date().toISOString()}`,
      ].join("\n");

      // 3. Request signature from wallet
      const { ethereum } = window as Window & { ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<string> } };
      if (!ethereum) throw new Error("No wallet found");
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      // 4. Verify on backend
      await apiRequest("POST", "/api/auth/verify", { address, message, signature });
      setAuthed(true);
    } catch (err) {
      console.error("SIWE failed:", err);
    } finally {
      setSigning(false);
    }
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: "#1d2132", border: "1px solid #2d3748" }}
        >
          {/* Chain indicator */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: chain?.id === 8453 ? "#22c55e" : "#f59e0b" }}
            title={chain?.name ?? "Unknown chain"}
          />
          <span
            className="text-xs font-mono"
            style={{ color: "#a8b9f4", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {truncateAddress(address)}
          </span>
          {!authed && (
            <button
              onClick={handleSIWE}
              disabled={signing}
              className="text-xs px-2 py-0.5 rounded-full transition-colors"
              style={{ background: "#7631ee", color: "white", opacity: signing ? 0.6 : 1 }}
            >
              {signing ? "Signing…" : "Sign In"}
            </button>
          )}
          {authed && (
            <span className="text-xs" style={{ color: "#22c55e" }}>✓</span>
          )}
        </div>
        <button
          onClick={() => { disconnect(); setAuthed(false); }}
          className="text-xs px-2 py-1 rounded-full transition-colors hover:opacity-80"
          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <button
          onClick={openConnectModal}
          data-testid="connect-wallet-btn"
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #7631ee 0%, #9d5cf5 100%)",
            color: "white",
            fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M16 13a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" fill="currentColor" />
            <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
          </svg>
          Connect Wallet
        </button>
      )}
    </ConnectButton.Custom>
  );
}
