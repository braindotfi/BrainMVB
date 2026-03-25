import { useState } from "react";

type RecipientType = "bank" | "wallet" | "agent" | null;
type Step = 1 | 2 | 3 | 4;

interface SendState {
  step: Step;
  recipientType: RecipientType;
  selectedBankId: string | null;
  walletAddress: string;
  selectedAgentId: string | null;
  amount: string;
  assetId: string;
}

const bankAccounts = [
  { id: "chase", bank: "Chase Bank", number: "****4521", type: "Checking", color: "#1a3a6e" },
  { id: "citi", bank: "Citibank", number: "****7890", type: "Savings", color: "#0a2857" },
  { id: "boa", bank: "Bank of America", number: "****2347", type: "Checking", color: "#6e1a1a" },
];

const agentAccounts = [
  { id: "1", name: "AlphaFlow", ticker: "$ALPHA", icon: "⚡", type: "Trading", balance: "$354.00" },
  { id: "2", name: "SwarmAlpha", ticker: "$SWRM", icon: "🤖", type: "Analytics", balance: "$1,205.40" },
  { id: "3", name: "Risk Sentinel", ticker: "$RSKX", icon: "🛡", type: "Risk", balance: "$88.20" },
];

const assets = [
  { id: "usd", name: "Dollar", ticker: "USD", balance: "10,000.00", value: "$10,000.00", icon: "/figmaAssets/crypto-icons-3.svg" },
  { id: "eth", name: "Ethereum", ticker: "ETH", balance: "1.245", value: "$2,500.00", icon: "/figmaAssets/crypto-icons.svg" },
  { id: "matic", name: "Polygon", ticker: "MATIC", balance: "295.23", value: "$16,832.85", icon: "/figmaAssets/crypto-icons-1.svg" },
  { id: "bnb", name: "Binance", ticker: "BNB", balance: "1.245", value: "$2,500.00", icon: "/figmaAssets/crypto-icons-2.svg" },
];

const FEE = "0.50";

const recipientTypes = [
  {
    id: "bank" as RecipientType,
    label: "Bank Account",
    icon: "🏦",
    description: "Transfer via wire or ACH to a linked bank account",
  },
  {
    id: "wallet" as RecipientType,
    label: "Wallet Address",
    icon: "👛",
    description: "Send crypto to any blockchain wallet address",
  },
  {
    id: "agent" as RecipientType,
    label: "AI Agent Account",
    icon: "🤖",
    description: "Fund an AI agent account on Brain Finance",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const INITIAL: SendState = {
  step: 1,
  recipientType: null,
  selectedBankId: null,
  walletAddress: "",
  selectedAgentId: null,
  amount: "",
  assetId: "usd",
};

const StepDot = ({ n, current }: { n: number; current: number }) => (
  <div className="flex items-center">
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${
        n < current
          ? "bg-brain-v1green text-white"
          : n === current
          ? "bg-brain-v1dark-orange text-brain-v1light-orange"
          : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30"
      }`}
    >
      {n < current ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : n}
    </div>
    {n < 4 && (
      <div className={`w-8 h-px mx-1 transition-colors ${n < current ? "bg-brain-v1green" : "bg-brain-v1baby-blue-15"}`} />
    )}
  </div>
);

const stepLabels = ["Type", "Recipient", "Amount", "Review"];

export const SendModal = ({ open, onClose }: Props): JSX.Element | null => {
  const [state, setState] = useState<SendState>(INITIAL);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!open) return null;

  const set = (patch: Partial<SendState>) => setState((prev) => ({ ...prev, ...patch }));

  const handleClose = () => {
    onClose();
    setTimeout(() => { setState(INITIAL); setSent(false); setSending(false); }, 300);
  };

  const selectedAsset = assets.find((a) => a.id === state.assetId) ?? assets[0];
  const totalAmount = state.amount
    ? (parseFloat(state.amount.replace(/,/g, "") || "0") + parseFloat(FEE)).toFixed(2)
    : "0.00";

  const canContinue = (() => {
    if (state.step === 1) return state.recipientType !== null;
    if (state.step === 2) {
      if (state.recipientType === "bank") return state.selectedBankId !== null;
      if (state.recipientType === "wallet") return state.walletAddress.length > 10;
      if (state.recipientType === "agent") return state.selectedAgentId !== null;
    }
    if (state.step === 3) return parseFloat(state.amount || "0") > 0;
    return true;
  })();

  const handleNext = () => {
    if (state.step < 4) set({ step: (state.step + 1) as Step });
  };
  const handleBack = () => {
    if (state.step > 1) set({ step: (state.step - 1) as Step });
  };

  const handleConfirm = () => {
    setSending(true);
    setTimeout(() => { setSending(false); setSent(true); }, 1800);
  };

  const getRecipientLabel = () => {
    if (state.recipientType === "bank") {
      const b = bankAccounts.find((b) => b.id === state.selectedBankId);
      return b ? `${b.bank} ${b.number}` : "Bank Account";
    }
    if (state.recipientType === "wallet") {
      return state.walletAddress.slice(0, 8) + "..." + state.walletAddress.slice(-6);
    }
    if (state.recipientType === "agent") {
      const a = agentAccounts.find((a) => a.id === state.selectedAgentId);
      return a ? `${a.name} (${a.ticker})` : "AI Agent";
    }
    return "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal panel */}
      <div className="relative z-10 w-[520px] max-h-[90vh] flex flex-col bg-[#0d1017] border border-[#1d2131] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[#1d2131] flex-shrink-0">
          <div className="flex-1">
            <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xl">
              {sent ? "Transfer Complete" : "Send Money"}
            </h2>
            {!sent && (
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5">
                {stepLabels[state.step - 1]}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Step progress */}
        {!sent && (
          <div className="flex items-center justify-center gap-0 px-6 py-4 border-b border-[#1d2131] flex-shrink-0">
            {[1, 2, 3, 4].map((n) => (
              <StepDot key={n} n={n} current={state.step} />
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ===== SUCCESS STATE ===== */}
          {sent && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-brain-v1dark-green flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M6 16L13 23L26 9" stroke="#42bf23" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-2xl">
                  {state.amount ? `$${parseFloat(state.amount).toFixed(2)} Sent!` : "Transfer Complete!"}
                </h3>
                <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">
                  Your transfer to {getRecipientLabel()} was successful.
                </p>
              </div>
              <div className="w-full bg-brain-v1baby-blue-15 rounded-2xl p-4 text-left space-y-2">
                <DetailRow label="To" value={getRecipientLabel()} />
                <DetailRow label="Amount" value={`${state.amount || "0"} ${selectedAsset.ticker}`} />
                <DetailRow label="Network Fee" value={`$${FEE}`} />
                <DetailRow label="Status" value="Confirmed" valueColor="text-brain-v1green" />
              </div>
              <button
                onClick={handleClose}
                className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity"
              >
                Done
              </button>
            </div>
          )}

          {/* ===== STEP 1: SELECT TYPE ===== */}
          {!sent && state.step === 1 && (
            <div className="flex flex-col gap-3">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Choose where you'd like to send funds.
              </p>
              <div className="flex flex-col gap-3 mt-2">
                {recipientTypes.map((rt) => {
                  const selected = state.recipientType === rt.id;
                  return (
                    <button
                      key={rt.id}
                      onClick={() => set({ recipientType: rt.id })}
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                        selected
                          ? "border-brain-v1dark-orange bg-[#2a1500]"
                          : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-colors ${selected ? "bg-brain-v1dark-orange" : "bg-brain-v1baby-blue-15"}`}>
                        {rt.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-base transition-colors ${selected ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>
                          {rt.label}
                        </p>
                        <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5 leading-relaxed">
                          {rt.description}
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${selected ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-brain-v1baby-blue-30"}`}>
                        {selected && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== STEP 2: BANK ACCOUNT ===== */}
          {!sent && state.step === 2 && state.recipientType === "bank" && (
            <div className="flex flex-col gap-3">
              <RecipientTypeTabs current="bank" onChange={(t) => set({ recipientType: t, selectedBankId: null, walletAddress: "", selectedAgentId: null })} />
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">
                Select a linked bank account.
              </p>
              <div className="flex flex-col gap-2 mt-1">
                {bankAccounts.map((b) => {
                  const selected = state.selectedBankId === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => set({ selectedBankId: b.id })}
                      className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                        selected ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: b.color }}>🏦</div>
                      <div className="flex-1 min-w-0">
                        <p className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm ${selected ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>{b.bank}</p>
                        <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5">{b.number} · {b.type}</p>
                      </div>
                      <RadioDot selected={selected} />
                    </button>
                  );
                })}
                <button className="flex items-center gap-3 p-4 rounded-2xl border border-dashed border-[#1d2131] hover:border-[#414965] bg-transparent transition-all text-left">
                  <div className="w-10 h-10 rounded-xl bg-brain-v1baby-blue-15 flex items-center justify-center flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                  <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Add new bank account</span>
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 2: WALLET ADDRESS ===== */}
          {!sent && state.step === 2 && state.recipientType === "wallet" && (
            <div className="flex flex-col gap-3">
              <RecipientTypeTabs current="wallet" onChange={(t) => set({ recipientType: t, selectedBankId: null, walletAddress: "", selectedAgentId: null })} />
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">
                Enter or paste the recipient's wallet address.
              </p>
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex flex-col gap-1">
                  <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">Wallet Address</label>
                  <div className="flex items-center gap-2 bg-brain-v1baby-blue-15 border border-[#1d2131] focus-within:border-[#414965] rounded-2xl px-4 py-3 transition-colors">
                    <input
                      type="text"
                      value={state.walletAddress}
                      onChange={(e) => set({ walletAddress: e.target.value })}
                      placeholder="0x... or bnb1... or sol..."
                      className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'JetBrains_Mono',Helvetica] placeholder-brain-v1baby-blue-30 outline-none"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          set({ walletAddress: text });
                        } catch {}
                      }}
                      className="text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white transition-colors px-2 py-1 rounded-lg bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 flex-shrink-0"
                    >
                      Paste
                    </button>
                  </div>
                  {state.walletAddress && state.walletAddress.length < 10 && (
                    <p className="text-brain-v1pink-red text-xs [font-family:'Gilroy-Medium',Helvetica]">Please enter a valid wallet address</p>
                  )}
                </div>

                {/* Network selector */}
                <div className="flex flex-col gap-1 mt-2">
                  <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">Network</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Ethereum", "BNB Chain", "Polygon"].map((net) => (
                      <button key={net} className="px-3 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] hover:border-[#414965] rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white transition-colors">
                        {net}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== STEP 2: AI AGENT ACCOUNT ===== */}
          {!sent && state.step === 2 && state.recipientType === "agent" && (
            <div className="flex flex-col gap-3">
              <RecipientTypeTabs current="agent" onChange={(t) => set({ recipientType: t, selectedBankId: null, walletAddress: "", selectedAgentId: null })} />
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">
                Select an AI agent account to fund.
              </p>
              <div className="flex flex-col gap-2 mt-1">
                {agentAccounts.map((a) => {
                  const selected = state.selectedAgentId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => set({ selectedAgentId: a.id })}
                      className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                        selected ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-brain-v1headerfooterbg flex items-center justify-center text-xl flex-shrink-0">{a.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm ${selected ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>{a.name}</p>
                        <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5">{a.ticker} · {a.type}</p>
                      </div>
                      <div className="text-right mr-2 flex-shrink-0">
                        <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1green text-sm">{a.balance}</p>
                        <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-30 text-[10px]">balance</p>
                      </div>
                      <RadioDot selected={selected} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== STEP 3: SEND AMOUNT ===== */}
          {!sent && state.step === 3 && (
            <div className="flex flex-col gap-4">
              {/* Recipient summary */}
              <div className="flex items-center gap-2 p-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                <div className="text-xl flex-shrink-0">
                  {state.recipientType === "bank" ? "🏦" : state.recipientType === "wallet" ? "👛" : "🤖"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-[10px] uppercase tracking-wider">Sending to</p>
                  <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm truncate">{getRecipientLabel()}</p>
                </div>
              </div>

              {/* Amount input */}
              <div className="flex flex-col gap-2">
                <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">Amount</label>
                <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 border border-[#1d2131] focus-within:border-[#414965] rounded-2xl transition-colors">
                  <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1baby-blue-30 text-xl">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.amount}
                    onChange={(e) => set({ amount: e.target.value })}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-brain-v1white text-3xl [font-family:'JetBrains_Mono',Helvetica] font-bold placeholder-brain-v1baby-blue-30 outline-none min-w-0"
                  />
                </div>

                {/* Quick amounts */}
                <div className="flex gap-2">
                  {["100", "500", "1000", "5000"].map((v) => (
                    <button
                      key={v}
                      onClick={() => set({ amount: v })}
                      className="flex-1 py-1.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-[#414965] transition-colors"
                    >
                      ${parseInt(v).toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Asset selector */}
              <div className="flex flex-col gap-2">
                <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">Asset</label>
                <div className="grid grid-cols-2 gap-2">
                  {assets.map((a) => {
                    const sel = state.assetId === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => set({ assetId: a.id })}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                          sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                        }`}
                      >
                        <img src={a.icon} alt={a.ticker} className="w-8 h-8 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-xs ${sel ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>{a.ticker}</p>
                          <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-[10px] truncate">{a.balance}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fee row */}
              {state.amount && parseFloat(state.amount) > 0 && (
                <div className="flex flex-col gap-1 p-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] text-xs [font-family:'Gilroy-Medium',Helvetica]">
                  <div className="flex justify-between text-brain-v1baby-blue-60">
                    <span>Amount</span>
                    <span className="text-brain-v1white [font-family:'JetBrains_Mono',Helvetica]">${parseFloat(state.amount).toFixed(2)} {selectedAsset.ticker}</span>
                  </div>
                  <div className="flex justify-between text-brain-v1baby-blue-60">
                    <span>Network fee</span>
                    <span className="[font-family:'JetBrains_Mono',Helvetica]">${FEE}</span>
                  </div>
                  <div className="h-px bg-[#1d2131] my-1" />
                  <div className="flex justify-between font-semibold text-brain-v1white [font-family:'Gilroy-SemiBold',Helvetica]">
                    <span>Total</span>
                    <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">${totalAmount}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 4: REVIEW DETAILS ===== */}
          {!sent && state.step === 4 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Please review your transaction details before confirming.
              </p>

              {/* From card */}
              <div className="flex flex-col gap-1">
                <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">From</label>
                <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl">
                  <div className="w-10 h-10 bg-brain-v1dark-orange rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke="#ff9500" strokeWidth="1.5"/><path d="M2 10H22" stroke="#ff9500" strokeWidth="1.5"/></svg>
                  </div>
                  <div>
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">Your Account</p>
                    <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs">1652 ···· 6995 · AED</p>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 bg-brain-v1baby-blue-15 rounded-full flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M3 8L7 12L11 8" stroke="#8899bb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              </div>

              {/* To card */}
              <div className="flex flex-col gap-1">
                <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">To</label>
                <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl">
                  <div className="w-10 h-10 bg-brain-v1baby-blue-15 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                    {state.recipientType === "bank" ? "🏦" : state.recipientType === "wallet" ? "👛" : "🤖"}
                  </div>
                  <div>
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">{getRecipientLabel()}</p>
                    <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">
                      {state.recipientType === "bank" ? "Bank Transfer" : state.recipientType === "wallet" ? "Crypto Wallet" : "AI Agent Account"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction details */}
              <div className="flex flex-col gap-2 p-4 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl">
                <DetailRow label="Amount" value={`${parseFloat(state.amount || "0").toFixed(2)} ${selectedAsset.ticker}`} valueColor="text-brain-v1white" />
                <div className="h-px bg-[#1d2131]" />
                <DetailRow label="Asset" value={`${selectedAsset.name} (${selectedAsset.ticker})`} />
                <DetailRow label="Network Fee" value={`$${FEE}`} />
                <DetailRow label="Transfer method" value={state.recipientType === "bank" ? "Wire / ACH" : state.recipientType === "wallet" ? "On-chain" : "Internal"} />
                <div className="h-px bg-[#1d2131]" />
                <DetailRow label="Total" value={`$${totalAmount}`} valueColor="text-brain-v1light-orange" />
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-[#1a1400] border border-[#3a2800] rounded-2xl">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5">
                  <path d="M7 1L13 12H1L7 1Z" stroke="#ff9500" strokeWidth="1.2" strokeLinejoin="round"/>
                  <path d="M7 5V8" stroke="#ff9500" strokeWidth="1.2" strokeLinecap="round"/>
                  <circle cx="7" cy="10" r="0.5" fill="#ff9500"/>
                </svg>
                <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs leading-relaxed">
                  Transactions are irreversible. Please verify recipient details before confirming.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!sent && (
          <div className={`flex gap-3 px-6 py-5 border-t border-[#1d2131] flex-shrink-0 ${state.step === 1 ? "justify-end" : "justify-between"}`}>
            {state.step > 1 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-5 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-sm hover:text-brain-v1white hover:border-[#414965] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Back
              </button>
            )}
            {state.step < 4 ? (
              <button
                onClick={handleNext}
                disabled={!canContinue}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm transition-all ${
                  canContinue
                    ? "bg-brain-v1dark-orange text-brain-v1light-orange hover:opacity-80"
                    : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed opacity-50"
                }`}
              >
                Continue
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={sending}
                className="flex items-center gap-2 px-6 py-3 bg-brain-v1dark-orange rounded-2xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1light-orange text-sm hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                      <path d="M7 2A5 5 0 0112 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Confirming...
                  </>
                ) : (
                  <>Confirm & Send</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sub-components ──

const RadioDot = ({ selected }: { selected: boolean }) => (
  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${selected ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-brain-v1baby-blue-30"}`}>
    {selected && (
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </div>
);

const DetailRow = ({
  label,
  value,
  valueColor = "text-brain-v1baby-blue-60",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) => (
  <div className="flex justify-between items-center gap-2">
    <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">{label}</span>
    <span className={`[font-family:'JetBrains_Mono',Helvetica] text-xs ${valueColor} truncate max-w-[60%] text-right`}>{value}</span>
  </div>
);

const recipientTypeLabels: Record<string, { label: string; icon: string }> = {
  bank: { label: "Bank", icon: "🏦" },
  wallet: { label: "Wallet", icon: "👛" },
  agent: { label: "Agent", icon: "🤖" },
};

const RecipientTypeTabs = ({
  current,
  onChange,
}: {
  current: string;
  onChange: (t: RecipientType) => void;
}) => (
  <div className="flex items-center gap-1 p-1 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
    {(["bank", "wallet", "agent"] as RecipientType[]).map((t) => {
      const info = recipientTypeLabels[t!];
      const sel = current === t;
      return (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-all ${
            sel
              ? "bg-brain-v1dark-orange text-brain-v1light-orange"
              : "text-brain-v1baby-blue-60 hover:text-brain-v1white"
          }`}
        >
          <span>{info.icon}</span>
          <span>{info.label}</span>
        </button>
      );
    })}
  </div>
);
