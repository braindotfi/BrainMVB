import { useState } from "react";

type AccountType = "bank" | "wallet" | "agent" | null;
type Step = "select-type" | "bank" | "wallet" | "wallet-qr" | "agent";

const accountTypes = [
  {
    id: "bank" as const,
    label: "Bank Account",
    description: "Connect via IBAN / bank transfer",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="9" width="22" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 13H25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 3L24 9H4L14 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 17H12M16 17H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    color: "bg-[#1a1300] border-[#3a2800]",
    iconColor: "text-[#ff9500]",
    badge: "Bank",
  },
  {
    id: "wallet" as const,
    label: "Your Wallet",
    description: "Connect via wallet address or QR",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="2" y="7" width="24" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 15.5C20 16.881 18.881 18 17.5 18C16.119 18 15 16.881 15 15.5C15 14.119 16.119 13 17.5 13C18.881 13 20 14.119 20 15.5Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 11H26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 7V5C7 3.895 7.895 3 9 3H19C20.105 3 21 3.895 21 5V7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    color: "bg-[#050d1a] border-[#1a3050]",
    iconColor: "text-[#4da3ff]",
    badge: "Web3",
  },
  {
    id: "agent" as const,
    label: "AI Agent Account",
    description: "Link an active AI trading agent",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="6" y="10" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10.5" cy="16" r="1.5" fill="currentColor" />
        <circle cx="17.5" cy="16" r="1.5" fill="currentColor" />
        <path d="M11 20H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 10V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M10 7H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6 16H3M22 16H25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    color: "bg-[#090517] border-[#2a1560]",
    iconColor: "text-[#a855f7]",
    badge: "Agent",
  },
];

const agentList = [
  { id: "1", name: "AlphaFlow", ticker: "$ALPHA", type: "Trading", status: "Active", apy: "+18.4%", emoji: "⚡" },
  { id: "2", name: "SwarmAlpha", ticker: "$SWRM", type: "Analytics", status: "Active", apy: "+11.2%", emoji: "🤖" },
  { id: "3", name: "Risk Sentinel", ticker: "$RSKX", type: "Risk", status: "Active", apy: "+6.8%", emoji: "🛡" },
  { id: "4", name: "YieldMax v2", ticker: "$YLD", type: "Yield", status: "Active", apy: "+22.1%", emoji: "📈" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  excludeTypes?: Array<"bank" | "wallet" | "agent">;
}

export const AddAccountModal = ({ open, onClose, excludeTypes = [] }: Props): JSX.Element | null => {
  const [step, setStep] = useState<Step>("select-type");
  const [selectedType, setSelectedType] = useState<AccountType>(null);
  const [recipientName, setRecipientName] = useState("");
  const [iban, setIban] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!open) return null;

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep("select-type");
      setSelectedType(null);
      setRecipientName("");
      setIban("");
      setWalletAddress("");
      setSelectedAgent(null);
      setSuccess(false);
    }, 300);
  };

  const handleTypeSelect = (type: AccountType) => {
    setSelectedType(type);
    setStep(type as Step);
  };

  const handleBack = () => {
    setStep("select-type");
    setSelectedType(null);
  };

  const handlePaste = async (field: "recipientName" | "iban" | "walletAddress") => {
    try {
      const text = await navigator.clipboard.readText();
      if (field === "recipientName") setRecipientName(text);
      else if (field === "iban") setIban(text);
      else setWalletAddress(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      if (field === "recipientName") setRecipientName("John Smith");
      else if (field === "iban") setIban("AE070331234567890123456");
      else setWalletAddress("0x7cB57B5A97eAbe94205C07890BE4c1aD31E486A8");
    }
  };

  const handleAddAccount = () => {
    setSuccess(true);
    setTimeout(() => {
      handleClose();
    }, 2000);
  };

  const activeType = accountTypes.find((t) => t.id === selectedType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-[500px] max-h-[90vh] flex flex-col bg-[#11141b] border border-[#1d2132] rounded-[24px] shadow-2xl overflow-hidden">

        {/* Success overlay */}
        {success && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#11141b] gap-4">
            <div className="w-16 h-16 rounded-full bg-brain-v1dark-green flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M5 14L11 20L23 8" stroke="#42bf23" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1white text-xl">Account Added!</span>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1baby-blue-60 text-sm">Your account has been connected successfully.</span>
          </div>
        )}

        {/* Header */}
        <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] flex-shrink-0 h-[56px] relative flex items-center justify-center w-full">
          {step !== "select-type" && (
            <button
              onClick={step === "wallet-qr" ? () => setStep("wallet") : handleBack}
              className="absolute left-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
              data-testid="btn-modal-back"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div className="flex items-center justify-center h-[24px] px-[12px] py-[8px] rounded-[100px]" style={{ background: "#12032D" }}>
            <div className="flex items-center gap-[8px]">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="rounded-full shrink-0 transition-colors duration-300"
                  style={{ width: 8, height: 8, background: (n === 1 || step !== "select-type") ? "#7631EE" : "#240757" }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="absolute right-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
            data-testid="btn-add-close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Select account type ── */}
          {step === "select-type" && (
            <div className="flex flex-col gap-3">
              {accountTypes.filter((type) => !excludeTypes.includes(type.id)).map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleTypeSelect(type.id)}
                  className={`flex items-center gap-4 p-4 w-full rounded-2xl border text-left transition-all hover:scale-[1.01] active:scale-100 ${type.color}`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-black/30 ${type.iconColor}`}>
                    {type.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1white text-base">
                        {type.label}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full [font-family:'Plus Jakarta Sans',Helvetica] font-semibold ${type.iconColor} bg-black/30`}>
                        {type.badge}
                      </span>
                    </div>
                    <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1baby-blue-60 text-sm">
                      {type.description}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-brain-v1baby-blue-30 flex-shrink-0">
                    <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: Bank Account ── */}
          {step === "bank" && (
            <div className="flex flex-col gap-4">
              {/* Selected type indicator */}
              <div className="flex items-center gap-3 p-3 bg-[#1a1300] border border-[#3a2800] rounded-2xl">
                <div className="w-8 h-8 rounded-xl bg-[#4a2300] flex items-center justify-center text-[#ff9500]">
                  <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                    <rect x="3" y="9" width="22" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 13H25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M14 3L24 9H4L14 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1white text-sm flex-1">Bank Account</span>
                <button onClick={handleBack} className="text-[#ff9500] text-xs [font-family:'Plus Jakarta Sans',Helvetica]">Change</button>
              </div>

              {/* Recipient Name */}
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-base">
                  Recipient Name
                </label>
                <div className="flex items-center gap-2 px-4 h-14 bg-[#222737] rounded-2xl">
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="John Smith"
                    className="flex-1 bg-transparent text-white text-xl [font-family:'Plus Jakarta Sans',Helvetica] placeholder-[#414965] outline-none"
                  />
                  <button
                    onClick={() => handlePaste("recipientName")}
                    className="flex items-center justify-center px-3 py-2 bg-[#4a2300] rounded-full flex-shrink-0 hover:bg-[#5a2d00] transition-colors"
                  >
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#ff9500] text-xs whitespace-nowrap">
                      {copiedField === "recipientName" ? "Pasted!" : "Paste"}
                    </span>
                  </button>
                </div>
              </div>

              {/* IBAN Bank Number */}
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-base">
                  IBAN Bank Number
                </label>
                <div className="flex items-center gap-2 px-4 h-14 bg-[#222737] rounded-2xl">
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="AE0703....123456"
                    className="flex-1 bg-transparent text-white text-xl [font-family:'JetBrains_Mono',Helvetica] placeholder-[#414965] outline-none tracking-wider"
                  />
                  <button
                    onClick={() => handlePaste("iban")}
                    className="flex items-center justify-center px-3 py-2 bg-[#4a2300] rounded-full flex-shrink-0 hover:bg-[#5a2d00] transition-colors"
                  >
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#ff9500] text-xs whitespace-nowrap">
                      {copiedField === "iban" ? "Pasted!" : "Paste"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 p-3 bg-brain-v1baby-blue-15 rounded-xl">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-brain-v1baby-blue-60 flex-shrink-0 mt-0.5">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M7 5V7M7 9V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1baby-blue-60 text-xs leading-relaxed">
                  Your bank account will be verified within 1–2 business days. Make sure the IBAN matches your account exactly.
                </p>
              </div>

              <button
                onClick={handleAddAccount}
                disabled={!recipientName.trim() || !iban.trim()}
                className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-base transition-all ${
                  recipientName.trim() && iban.trim()
                    ? "bg-brain-v1dark-orange text-brain-v1light-orange hover:opacity-80"
                    : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed opacity-50"
                }`}
              >
                Add Bank Account
              </button>
            </div>
          )}

          {/* ── Step 2: Your Wallet ── */}
          {step === "wallet" && (
            <div className="flex flex-col gap-4">
              {/* Selected type indicator */}
              <div className="flex items-center gap-3 p-3 bg-[#050d1a] border border-[#1a3050] rounded-2xl">
                <div className="w-8 h-8 rounded-xl bg-[#0a1a30] flex items-center justify-center text-[#4da3ff]">
                  <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                    <rect x="2" y="7" width="24" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M20 15.5C20 16.881 18.881 18 17.5 18C16.119 18 15 16.881 15 15.5C15 14.119 16.119 13 17.5 13C18.881 13 20 14.119 20 15.5Z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M2 11H26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1white text-sm flex-1">Your Wallet</span>
                <button onClick={handleBack} className="text-[#4da3ff] text-xs [font-family:'Plus Jakarta Sans',Helvetica]">Change</button>
              </div>

              {/* Wallet Address */}
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-base">
                  Wallet Address
                </label>
                <div className="flex items-center gap-2 px-4 h-14 bg-[#222737] rounded-2xl">
                  <input
                    type="text"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="0x7cB5...486A8"
                    className="flex-1 bg-transparent text-white text-lg [font-family:'JetBrains_Mono',Helvetica] placeholder-[#414965] outline-none tracking-wider min-w-0"
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Paste button */}
                    <button
                      onClick={() => handlePaste("walletAddress")}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-brain-v1baby-blue-30 hover:bg-brain-v1baby-blue-60 transition-colors"
                      title="Paste"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="0.75" y="2.75" width="8.5" height="10.5" rx="1.25" stroke="#a8b9f4" strokeWidth="1.2" />
                        <path d="M3.75 2.75V1.75C3.75 1.199 4.199 0.75 4.75 0.75H12.25C12.801 0.75 13.25 1.199 13.25 1.75V9.25C13.25 9.801 12.801 10.25 12.25 10.25H10.25" stroke="#a8b9f4" strokeWidth="1.2" />
                      </svg>
                    </button>
                    {/* QR button */}
                    <button
                      onClick={() => setStep("wallet-qr")}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-brain-v1dark-green hover:bg-brain-v1dark-green/80 transition-colors"
                      title="Scan QR"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="1" y="1" width="4.5" height="4.5" rx="0.75" stroke="#42bf23" strokeWidth="1.2" />
                        <rect x="8.5" y="1" width="4.5" height="4.5" rx="0.75" stroke="#42bf23" strokeWidth="1.2" />
                        <rect x="1" y="8.5" width="4.5" height="4.5" rx="0.75" stroke="#42bf23" strokeWidth="1.2" />
                        <rect x="2.5" y="2.5" width="1.5" height="1.5" fill="#42bf23" />
                        <rect x="10" y="2.5" width="1.5" height="1.5" fill="#42bf23" />
                        <rect x="2.5" y="10" width="1.5" height="1.5" fill="#42bf23" />
                        <path d="M8.5 8.5H10V10H8.5V8.5ZM11.5 8.5H13V10H11.5V8.5ZM8.5 11.5H10V13H8.5V11.5ZM11.5 11.5H13V13H11.5V11.5Z" fill="#42bf23" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Network chips */}
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-base">
                  Network
                </label>
                <div className="flex flex-wrap gap-2">
                  {["Ethereum", "Polygon", "BNB Chain", "Arbitrum", "Base"].map((net, i) => (
                    <button
                      key={net}
                      className={`px-3 py-1.5 rounded-full text-xs [font-family:'Plus Jakarta Sans',Helvetica] font-semibold transition-colors ${
                        i === 0
                          ? "bg-[#050d1a] border border-[#4da3ff] text-[#4da3ff]"
                          : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 border border-transparent hover:border-[#4da3ff] hover:text-[#4da3ff]"
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 p-3 bg-brain-v1baby-blue-15 rounded-xl">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-brain-v1baby-blue-60 flex-shrink-0 mt-0.5">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M7 5V7M7 9V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1baby-blue-60 text-xs leading-relaxed">
                  Make sure to select the correct network. Sending funds to the wrong network may result in permanent loss.
                </p>
              </div>

              <button
                onClick={handleAddAccount}
                disabled={!walletAddress.trim()}
                className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-base transition-all ${
                  walletAddress.trim()
                    ? "bg-[#0a1a30] border border-[#4da3ff] text-[#4da3ff] hover:bg-[#0d2040]"
                    : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed opacity-50"
                }`}
              >
                Connect Wallet
              </button>
            </div>
          )}

          {/* ── Step 2: Wallet QR ── */}
          {step === "wallet-qr" && (
            <div className="flex flex-col items-center gap-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1baby-blue-60 text-sm">
                  Point your camera at a wallet QR code
                </p>
              </div>

              {/* QR scanner placeholder */}
              <div className="relative w-64 h-64 bg-[#0a0c10] rounded-3xl flex items-center justify-center overflow-hidden border border-[#1d2131]">
                {/* Corner brackets */}
                <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-[#42bf23] rounded-tl-lg" />
                <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-[#42bf23] rounded-tr-lg" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-[#42bf23] rounded-bl-lg" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-[#42bf23] rounded-br-lg" />
                {/* Scan line */}
                <div className="absolute left-6 right-6 h-0.5 bg-brain-v1green opacity-70 animate-[scan_2s_ease-in-out_infinite]" style={{ top: "50%", boxShadow: "0 0 8px #42bf23" }} />
                {/* Center content */}
                <div className="flex flex-col items-center gap-3">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <rect x="4" y="4" width="14" height="14" rx="2" stroke="#414965" strokeWidth="1.5" />
                    <rect x="22" y="4" width="14" height="14" rx="2" stroke="#414965" strokeWidth="1.5" />
                    <rect x="4" y="22" width="14" height="14" rx="2" stroke="#414965" strokeWidth="1.5" />
                    <rect x="7.5" y="7.5" width="7" height="7" rx="1" fill="#414965" />
                    <rect x="25.5" y="7.5" width="7" height="7" rx="1" fill="#414965" />
                    <rect x="7.5" y="25.5" width="7" height="7" rx="1" fill="#414965" />
                    <path d="M22 22H25V25H22V22ZM28 22H31V25H28V22ZM22 28H25V31H22V28ZM28 28H31V31H28V28Z" fill="#414965" />
                  </svg>
                  <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#414965] text-xs">Scan QR Code</span>
                </div>
              </div>

              {/* Manual input fallback */}
              <div className="flex flex-col gap-1.5 w-full">
                <label className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-sm text-center">
                  — or paste address manually —
                </label>
                <div className="flex items-center gap-2 px-4 h-14 bg-[#222737] rounded-2xl">
                  <input
                    type="text"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="0x7cB5...486A8"
                    className="flex-1 bg-transparent text-white text-lg [font-family:'JetBrains_Mono',Helvetica] placeholder-[#414965] outline-none tracking-wider min-w-0"
                  />
                  <button
                    onClick={() => handlePaste("walletAddress")}
                    className="px-3 py-1.5 bg-[#4a2300] rounded-full hover:bg-[#5a2d00] transition-colors"
                  >
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#ff9500] text-xs">Paste</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setStep("wallet")}
                  className="flex-1 py-3.5 rounded-2xl bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 [font-family:'Plus Jakarta Sans',Helvetica] text-sm hover:bg-brain-v1baby-blue-30 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleAddAccount}
                  disabled={!walletAddress.trim()}
                  className={`flex-1 py-3.5 rounded-2xl [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-sm transition-all ${
                    walletAddress.trim()
                      ? "bg-[#0a1a30] border border-[#4da3ff] text-[#4da3ff] hover:bg-[#0d2040]"
                      : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed opacity-50"
                  }`}
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: AI Agent Account ── */}
          {step === "agent" && (
            <div className="flex flex-col gap-3">
              {/* Selected type indicator */}
              <div className="flex items-center gap-3 p-3 bg-[#090517] border border-[#2a1560] rounded-2xl mb-1">
                <div className="w-8 h-8 rounded-xl bg-[#150a30] flex items-center justify-center text-[#a855f7]">
                  <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                    <rect x="6" y="10" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="10.5" cy="16" r="1.5" fill="currentColor" />
                    <circle cx="17.5" cy="16" r="1.5" fill="currentColor" />
                    <path d="M6 16H3M22 16H25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1white text-sm flex-1">AI Agent Account</span>
                <button onClick={handleBack} className="text-[#a855f7] text-xs [font-family:'Plus Jakarta Sans',Helvetica]">Change</button>
              </div>

              {agentList.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={`flex items-center gap-3 p-4 w-full rounded-2xl border text-left transition-all ${
                    selectedAgent === agent.id
                      ? "bg-[#090517] border-[#a855f7]"
                      : "bg-brain-v1baby-blue-15 border-[#1d2131] hover:border-[#2a1560]"
                  }`}
                >
                  <div className="w-12 h-12 bg-[#150a30] rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                    {agent.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1white text-sm">{agent.name}</span>
                      <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-xs">{agent.ticker}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 bg-brain-v1baby-blue-15 rounded text-brain-v1baby-blue-30 [font-family:'Plus Jakarta Sans',Helvetica]">{agent.type}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-brain-v1dark-green rounded text-brain-v1green [font-family:'Plus Jakarta Sans',Helvetica]">{agent.status}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1green text-sm">{agent.apy}</div>
                    <div className="[font-family:'Plus Jakarta Sans',Helvetica] text-brain-v1baby-blue-30 text-[10px]">APY</div>
                  </div>
                  {selectedAgent === agent.id && (
                    <div className="w-5 h-5 rounded-full bg-[#a855f7] flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}

              <button
                onClick={handleAddAccount}
                disabled={!selectedAgent}
                className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-base transition-all mt-1 ${
                  selectedAgent
                    ? "bg-[#090517] border border-[#a855f7] text-[#a855f7] hover:bg-[#0d0820]"
                    : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed opacity-50"
                }`}
              >
                Link Agent Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* scan animation keyframe */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 20%; }
          50% { top: 80%; }
        }
      `}</style>
    </div>
  );
};
