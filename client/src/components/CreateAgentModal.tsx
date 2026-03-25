import { useState, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const agentTypes = [
  { id: "trading", label: "Trading", icon: "⚡", desc: "Automated crypto trading strategies" },
  { id: "payments", label: "Payments", icon: "💳", desc: "Real-time payment execution" },
  { id: "lending", label: "Lending", icon: "🏦", desc: "DeFi lending and borrowing" },
  { id: "analytics", label: "Analytics", icon: "📊", desc: "Market analysis and signals" },
  { id: "yield", label: "Yield", icon: "🌱", desc: "Yield farming and optimization" },
  { id: "custom", label: "Custom", icon: "🛠", desc: "Build your own agent logic" },
];

const avatarOptions = [
  "/figmaAssets/avatars.svg",
  "/figmaAssets/avatars-1.svg",
  "/figmaAssets/avatars-2.svg",
  "/figmaAssets/avatars-3.svg",
  "/figmaAssets/avatars-4.svg",
  "/figmaAssets/avatars-5.svg",
  "/figmaAssets/avatars-6.svg",
  "/figmaAssets/avatars-7.svg",
  "/figmaAssets/avatars-8.svg",
  "/figmaAssets/avatars-9.svg",
];

const STEPS = [
  "Agent Type",
  "Customize",
  "Assign Capital",
  "Policy Controls",
  "Risk & Limits",
  "Authorization",
  "Review",
];

const riskLevels = ["Conservative", "Moderate", "Aggressive", "Custom"];
const executionModes = ["Automatic", "Supervised", "Manual Approval"];
const assetList = ["ETH", "BTC", "USDC", "MATIC", "BNB", "SOL", "AVAX", "ARB"];

type PolicyTab = "capital" | "risk" | "assets" | "strategy" | "execution";

export const CreateAgentModal = ({ open, onClose }: Props): JSX.Element | null => {
  const [step, setStep] = useState(0);

  // Step 1
  const [selectedType, setSelectedType] = useState("");
  // Step 2
  const [agentName, setAgentName] = useState("");
  const [agentTicker, setAgentTicker] = useState("");
  const [agentDesc, setAgentDesc] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");
  // Step 3
  const [capital, setCapital] = useState("");
  const [capitalAsset, setCapitalAsset] = useState("USDC");
  // Step 4
  const [riskLevel, setRiskLevel] = useState("Moderate");
  const [maxDrawdown, setMaxDrawdown] = useState("20");
  const [stopLoss, setStopLoss] = useState("10");
  // Step 5
  const [policyTab, setPolicyTab] = useState<PolicyTab>("capital");
  const [maxAlloc, setMaxAlloc] = useState("80");
  const [minLiquidity, setMinLiquidity] = useState("5000");
  const [executionMode, setExecutionMode] = useState("Automatic");
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["ETH", "USDC"]);
  const [maxPosition, setMaxPosition] = useState("25");
  const [maxTrades, setMaxTrades] = useState("10");
  // Step 6
  const [authSig, setAuthSig] = useState(false);
  const [terms, setTerms] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const canProceed = () => {
    if (step === 0) return !!selectedType;
    if (step === 1) return !!agentName && !!agentTicker;
    if (step === 2) return !!capital;
    if (step === 5) return authSig && terms;
    return true;
  };

  const toggleAsset = (a: string) =>
    setSelectedAssets((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );

  const progressPct = ((step) / (STEPS.length - 1)) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[640px] max-h-[90vh] flex flex-col bg-brain-v1baby-blue-5 border border-[#1d2131] rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1d2131] flex-shrink-0">
          <div>
            <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-lg">
              Create an Agent
            </h2>
            <p className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors text-brain-v1baby-blue-60 hover:text-brain-v1white"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex-shrink-0 px-6 pt-4 pb-2">
          <div className="flex items-center gap-1 mb-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  i <= step ? "bg-brain-v1dark-orange" : "bg-brain-v1baby-blue-15"
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={`text-[9px] [font-family:'Gilroy-Medium',Helvetica] ${
                  i === step ? "text-brain-v1light-orange" : i < step ? "text-brain-v1baby-blue-60" : "text-brain-v1baby-blue-30"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ── Step 0: Agent Type ── */}
          {step === 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">
                Choose the primary function of your AI agent.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {agentTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedType(t.id)}
                    className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all ${
                      selectedType === t.id
                        ? "border-brain-v1dark-orange bg-brain-v1dark-orange/20"
                        : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                    }`}
                  >
                    <span className="text-2xl">{t.icon}</span>
                    <div>
                      <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">{t.label}</div>
                      <div className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">{t.desc}</div>
                    </div>
                    {selectedType === t.id && (
                      <div className="ml-auto w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 1: Customize ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {/* Avatar picker */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">
                  Agent Avatar
                </label>
                <div className="flex items-center gap-3">
                  <div
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-[#1d2131] flex items-center justify-center bg-brain-v1baby-blue-15 cursor-pointer hover:border-[#414965] transition-colors overflow-hidden"
                    onClick={() => fileRef.current?.click()}
                  >
                    {selectedAvatar ? (
                      <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-brain-v1baby-blue-30">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <span className="text-[10px] [font-family:'Gilroy-Medium',Helvetica]">Upload</span>
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Or choose a preset avatar:</span>
                    <div className="flex flex-wrap gap-2">
                      {avatarOptions.map((av) => (
                        <button
                          key={av}
                          onClick={() => setSelectedAvatar(av)}
                          className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all ${
                            selectedAvatar === av ? "border-brain-v1dark-orange" : "border-transparent hover:border-[#414965]"
                          }`}
                        >
                          <img src={av} alt="" className="w-full h-full" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Agent Name *</label>
                <input
                  value={agentName}
                  onChange={(e) => {
                    setAgentName(e.target.value);
                    setAgentTicker("$" + e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 8));
                  }}
                  placeholder="e.g. AlphaFlow"
                  className="px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none focus:border-[#414965] transition-colors"
                />
              </div>

              {/* Ticker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Token Ticker *</label>
                <input
                  value={agentTicker}
                  onChange={(e) => setAgentTicker(e.target.value)}
                  placeholder="$ALPHA"
                  className="px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-brain-v1white text-sm [font-family:'JetBrains_Mono',Helvetica] placeholder-brain-v1baby-blue-30 outline-none focus:border-[#414965] transition-colors"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Description</label>
                <textarea
                  value={agentDesc}
                  onChange={(e) => setAgentDesc(e.target.value)}
                  placeholder="Describe what your agent does..."
                  rows={3}
                  className="px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none focus:border-[#414965] transition-colors resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Assign Capital ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">
                Set the initial capital allocation for your agent.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Amount *</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl focus-within:border-[#414965] transition-colors">
                    <input
                      value={capital}
                      onChange={(e) => setCapital(e.target.value)}
                      type="number"
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-brain-v1white text-lg [font-family:'JetBrains_Mono',Helvetica] outline-none"
                    />
                  </div>
                  <select
                    value={capitalAsset}
                    onChange={(e) => setCapitalAsset(e.target.value)}
                    className="px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] outline-none cursor-pointer"
                  >
                    {["USDC", "ETH", "BTC", "MATIC", "BNB"].map((a) => (
                      <option key={a} value={a} className="bg-[#11141b]">{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick presets */}
              <div className="flex gap-2">
                {["1,000", "5,000", "10,000", "50,000"].map((v) => (
                  <button
                    key={v}
                    onClick={() => setCapital(v.replace(",", ""))}
                    className="flex-1 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-[#414965] transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Available balance */}
              <div className="flex items-center justify-between p-3 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
                <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Available balance</span>
                <span className="text-sm [font-family:'JetBrains_Mono',Helvetica] text-brain-v1green">$865,040.30 AED</span>
              </div>

              <div className="bg-brain-v1dark-orange/10 border border-brain-v1dark-orange/20 rounded-xl p-3">
                <p className="text-xs text-brain-v1light-orange [font-family:'Gilroy-Medium',Helvetica]">
                  ⚠️ Capital is locked while the agent is active. You can withdraw unused capital at any time.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 3: Policy Controls ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">
                Set the risk tolerance and operating limits for your agent.
              </p>

              {/* Risk level */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Risk Level</label>
                <div className="grid grid-cols-2 gap-2">
                  {riskLevels.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRiskLevel(r)}
                      className={`py-3 rounded-xl border text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-all ${
                        riskLevel === r
                          ? "border-brain-v1dark-orange bg-brain-v1dark-orange/20 text-brain-v1light-orange"
                          : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max drawdown */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Max Drawdown</label>
                  <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{maxDrawdown}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={80}
                  value={maxDrawdown}
                  onChange={(e) => setMaxDrawdown(e.target.value)}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                  <span>1%</span><span>80%</span>
                </div>
              </div>

              {/* Stop loss */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Stop Loss per Trade</label>
                  <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{stopLoss}%</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                  <span>1%</span><span>50%</span>
                </div>
              </div>

              {/* Execution mode */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Execution Mode</label>
                <div className="flex flex-col gap-1.5">
                  {executionModes.map((m) => (
                    <button
                      key={m}
                      onClick={() => setExecutionMode(m)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        executionMode === m
                          ? "border-brain-v1dark-orange bg-brain-v1dark-orange/10"
                          : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${executionMode === m ? "border-brain-v1light-orange" : "border-[#414965]"}`}>
                        {executionMode === m && <div className="w-2 h-2 bg-brain-v1light-orange rounded-full" />}
                      </div>
                      <span className={`text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${executionMode === m ? "text-brain-v1white" : "text-brain-v1baby-blue-60"}`}>{m}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Risk & Limits (tabbed) ── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              {/* Policy tabs */}
              <div className="flex gap-1 p-1 bg-brain-v1baby-blue-15 rounded-xl overflow-x-auto">
                {([
                  { id: "capital", label: "Capital" },
                  { id: "risk", label: "Risk Limits" },
                  { id: "assets", label: "Assets" },
                  { id: "strategy", label: "Strategy" },
                  { id: "execution", label: "Execution" },
                ] as { id: PolicyTab; label: string }[]).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPolicyTab(t.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors whitespace-nowrap ${
                      policyTab === t.id
                        ? "bg-brain-v1headerfooterbg text-brain-v1white"
                        : "text-brain-v1baby-blue-30 hover:text-brain-v1white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {policyTab === "capital" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Control how your agent allocates capital across positions.</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between">
                      <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica]">Max Allocation per Asset</label>
                      <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{maxAlloc}%</span>
                    </div>
                    <input type="range" min={1} max={100} value={maxAlloc} onChange={(e) => setMaxAlloc(e.target.value)} className="w-full accent-orange-500" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica]">Minimum Liquidity Threshold (USD)</label>
                    <input value={minLiquidity} onChange={(e) => setMinLiquidity(e.target.value)} type="number" className="px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-brain-v1white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none focus:border-[#414965] transition-colors" />
                  </div>
                </div>
              )}

              {policyTab === "risk" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Set hard limits to protect your capital from excessive losses.</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between">
                      <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica]">Max Position Size</label>
                      <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{maxPosition}%</span>
                    </div>
                    <input type="range" min={1} max={100} value={maxPosition} onChange={(e) => setMaxPosition(e.target.value)} className="w-full accent-orange-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Daily Loss Limit", val: "5" },
                      { label: "Weekly Loss Limit", val: "15" },
                    ].map((f) => (
                      <div key={f.label} className="flex flex-col gap-1">
                        <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{f.label}</label>
                        <div className="flex items-center px-3 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl gap-1">
                          <input defaultValue={f.val} type="number" className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
                          <span className="text-brain-v1baby-blue-30 text-xs">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {policyTab === "assets" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Choose which assets your agent is permitted to trade.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {assetList.map((a) => (
                      <button
                        key={a}
                        onClick={() => toggleAsset(a)}
                        className={`py-2.5 rounded-xl border text-xs [font-family:'JetBrains_Mono',Helvetica] font-medium transition-all ${
                          selectedAssets.includes(a)
                            ? "border-brain-v1dark-orange bg-brain-v1dark-orange/20 text-brain-v1light-orange"
                            : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                    {selectedAssets.length} asset{selectedAssets.length !== 1 ? "s" : ""} selected: {selectedAssets.join(", ")}
                  </p>
                </div>
              )}

              {policyTab === "strategy" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Define the rules and signals that guide your agent's decisions.</p>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica]">Max Concurrent Trades</label>
                    <input value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} type="number" className="px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-brain-v1white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none focus:border-[#414965] transition-colors" />
                  </div>
                  {["Momentum", "Mean Reversion", "Breakout", "Sentiment"].map((s) => (
                    <div key={s} className="flex items-center justify-between px-3 py-2.5 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
                      <span className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{s} Strategy</span>
                      <div className="w-9 h-5 bg-brain-v1dark-orange rounded-full relative cursor-pointer">
                        <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {policyTab === "execution" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure how your agent executes trades and interacts with protocols.</p>
                  {["Use MEV protection", "Auto-retry on failure", "Slippage tolerance 0.5%", "Gas optimization"].map((s) => (
                    <div key={s} className="flex items-center justify-between px-3 py-2.5 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
                      <span className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{s}</span>
                      <div className="w-9 h-5 bg-brain-v1dark-orange rounded-full relative cursor-pointer">
                        <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Authorization ── */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">
                Authorize your agent to operate on your behalf by signing the policy agreement.
              </p>

              {/* Policy summary */}
              <div className="flex flex-col gap-2 p-4 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
                <div className="text-xs [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-60 mb-1">Policy Summary</div>
                {[
                  { label: "Agent Type", val: selectedType || "—" },
                  { label: "Capital Allocated", val: capital ? `${capital} ${capitalAsset}` : "—" },
                  { label: "Risk Level", val: riskLevel },
                  { label: "Max Drawdown", val: `${maxDrawdown}%` },
                  { label: "Execution Mode", val: executionMode },
                  { label: "Permitted Assets", val: selectedAssets.join(", ") || "—" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-1 border-b border-[#1d2131] last:border-0">
                    <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{r.label}</span>
                    <span className="text-xs text-brain-v1white [font-family:'JetBrains_Mono',Helvetica] capitalize">{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Checkboxes */}
              <button
                onClick={() => setAuthSig((v) => !v)}
                className="flex items-start gap-3 text-left"
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors ${authSig ? "bg-brain-v1dark-orange border-brain-v1dark-orange" : "border-[#414965] bg-brain-v1baby-blue-15"}`}>
                  {authSig && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                  I authorize Brain Finance to execute this agent policy on my behalf and understand the associated risks.
                </span>
              </button>

              <button
                onClick={() => setTerms((v) => !v)}
                className="flex items-start gap-3 text-left"
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors ${terms ? "bg-brain-v1dark-orange border-brain-v1dark-orange" : "border-[#414965] bg-brain-v1baby-blue-15"}`}>
                  {terms && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                  I agree to the Brain Finance Agent Terms of Service and understand this is not financial advice.
                </span>
              </button>
            </div>
          )}

          {/* ── Step 6: Review ── */}
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                {selectedAvatar && (
                  <img src={selectedAvatar} alt="" className="w-16 h-16 rounded-2xl flex-shrink-0" />
                )}
                <div>
                  <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-lg">{agentName || "Unnamed Agent"}</div>
                  <div className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-sm">{agentTicker}</div>
                  {agentDesc && <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-1">{agentDesc}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Type", val: selectedType, icon: "⚡" },
                  { label: "Capital", val: `${capital || "0"} ${capitalAsset}`, icon: "💰" },
                  { label: "Risk Level", val: riskLevel, icon: "📊" },
                  { label: "Max Drawdown", val: `${maxDrawdown}%`, icon: "📉" },
                  { label: "Execution", val: executionMode, icon: "🤖" },
                  { label: "Assets", val: `${selectedAssets.length} assets`, icon: "🔑" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-3 p-3 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
                    <span className="text-xl">{r.icon}</span>
                    <div>
                      <div className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{r.label}</div>
                      <div className="text-xs text-brain-v1white [font-family:'Gilroy-SemiBold',Helvetica] capitalize">{r.val || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-brain-v1dark-green/20 border border-brain-v1dark-green rounded-xl">
                <p className="text-xs text-brain-v1green [font-family:'Gilroy-SemiBold',Helvetica]">
                  ✓ All checks passed. Your agent is ready to deploy.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1d2131] flex-shrink-0">
          <button
            onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}
            className="px-5 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-[#414965] transition-colors"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
              {step + 1} / {STEPS.length}
            </span>
            <button
              onClick={() => {
                if (step < STEPS.length - 1) {
                  setStep((s) => s + 1);
                } else {
                  onClose();
                  setStep(0);
                }
              }}
              disabled={!canProceed()}
              className={`px-5 py-2.5 rounded-xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm transition-all ${
                canProceed()
                  ? step === STEPS.length - 1
                    ? "bg-brain-v1dark-green text-brain-v1green hover:opacity-80"
                    : "bg-brain-v1dark-orange text-brain-v1light-orange hover:opacity-80"
                  : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed"
              }`}
            >
              {step === STEPS.length - 1 ? "🚀 Deploy Agent" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
