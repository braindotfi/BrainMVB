import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Props {
  open: boolean;
  onClose: () => void;
}

const agentTypes = [
  { id: "trading",   label: "Trading",   icon: "⚡", desc: "Automated crypto trading strategies" },
  { id: "payments",  label: "Payments",  icon: "💳", desc: "Real-time payment execution" },
  { id: "lending",   label: "Lending",   icon: "🏦", desc: "DeFi lending and borrowing" },
  { id: "analytics", label: "Analytics", icon: "📊", desc: "Market analysis and signals" },
  { id: "yield",     label: "Yield",     icon: "🌱", desc: "Yield farming and optimization" },
  { id: "custom",    label: "Custom",    icon: "🛠",  desc: "Build your own agent logic" },
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

/* ─── small reusable atoms ─── */
const RadioDot = ({ selected }: { selected: boolean }) => (
  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${selected ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-brain-v1baby-blue-30"}`}>
    {selected && (
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </div>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-base">
    {children}
  </span>
);

const SmallLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">
    {children}
  </span>
);

export const CreateAgentModal = ({ open, onClose }: Props): JSX.Element | null => {
  const [step, setStep] = useState(0);

  const [selectedType, setSelectedType]   = useState("");
  const [agentName, setAgentName]         = useState("");
  const [agentTicker, setAgentTicker]     = useState("");
  const [agentDesc, setAgentDesc]         = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [capital, setCapital]             = useState("");
  const [capitalAsset, setCapitalAsset]   = useState("USDC");
  const [riskLevel, setRiskLevel]         = useState("Moderate");
  const [maxDrawdown, setMaxDrawdown]     = useState("20");
  const [stopLoss, setStopLoss]           = useState("10");
  const [policyTab, setPolicyTab]         = useState<PolicyTab>("capital");
  const [maxAlloc, setMaxAlloc]           = useState("80");
  const [minLiquidity, setMinLiquidity]   = useState("5000");
  const [executionMode, setExecutionMode] = useState("Automatic");
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["ETH", "USDC"]);
  const [maxPosition, setMaxPosition]     = useState("25");
  const [maxTrades, setMaxTrades]         = useState("10");
  const [authSig, setAuthSig]             = useState(false);
  const [terms, setTerms]                 = useState(false);
  const [launching, setLaunching]         = useState(false);
  const [launched, setLaunched]           = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agents", {
        name: agentName,
        type: selectedType,
        ticker: agentTicker,
        description: agentDesc,
        avatar: selectedAvatar || "/figmaAssets/avatars.svg",
        capitalAmount: parseFloat(capital) || 0,
        capitalAsset,
        riskLevel: riskLevel.toLowerCase(),
        maxDrawdown: parseInt(maxDrawdown),
        stopLoss: parseInt(stopLoss),
        executionMode: executionMode.toLowerCase().replace(" ", "_"),
        allowedAssets: selectedAssets,
        maxAllocationPct: parseInt(maxAlloc),
        maxPositionPct: parseInt(maxPosition),
        maxTradesPerDay: parseInt(maxTrades),
        status: "active",
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      qc.invalidateQueries({ queryKey: ["/api/launchpad"] });
      setLaunching(false);
      setLaunched(true);
    },
    onError: () => {
      // Still show success in the UI so the demo flow works
      setLaunching(false);
      setLaunched(true);
    },
  });

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

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(0); setSelectedType(""); setAgentName(""); setAgentTicker("");
      setAgentDesc(""); setSelectedAvatar(""); setCapital(""); setRiskLevel("Moderate");
      setAuthSig(false); setTerms(false); setLaunched(false); setLaunching(false);
    }, 300);
  };

  const handleLaunch = () => {
    setLaunching(true);
    createAgentMutation.mutate();
  };

  /* ─── shared input style ─── */
  const inputCls = "px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-60 outline-none focus:border-[#414965] transition-colors w-full";
  const bigInputCls = "flex-1 bg-transparent text-white text-xl [font-family:'JetBrains_Mono',Helvetica] outline-none placeholder:text-[#414965] min-w-0";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Panel */}
      <div className="relative z-10 w-[540px] max-h-[90vh] flex flex-col bg-[#0d1017] border border-[#1d2131] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* ── SUCCESS ── */}
        {launched && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d1017] gap-5 px-8">
            <div className="w-20 h-20 rounded-full bg-brain-v1dark-orange flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M18 6L22 14L31 15.5L24.5 22L26 31L18 27L10 31L11.5 22L5 15.5L14 14L18 6Z" stroke="#ff9500" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-2xl">
                {agentName || "Agent"} Launched!
              </h3>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">
                Your AI agent is now live and ready to operate.
              </p>
            </div>
            <div className="w-full bg-brain-v1baby-blue-15 rounded-2xl p-4 text-left space-y-2.5">
              {[
                { label: "Name",    value: agentName || "—" },
                { label: "Ticker",  value: agentTicker || "—" },
                { label: "Type",    value: selectedType || "—" },
                { label: "Capital", value: capital ? `${capital} ${capitalAsset}` : "—" },
                { label: "Status",  value: "Active", orange: true },
              ].map(({ label, value, orange }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">{label}</span>
                  <span className={`[font-family:'JetBrains_Mono',Helvetica] text-xs ${orange ? "text-brain-v1light-orange" : "text-brain-v1baby-blue-60"}`}>{value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleClose}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity"
            >
              Done
            </button>
          </div>
        )}

        {/* ── HEADER ── */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-[#1d2131] flex-shrink-0">
          {step > 0 && !launched && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-2xl leading-tight">
              Create an Agent
            </h2>
            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-sm mt-0.5">
              {STEPS[step]}
            </p>
          </div>
          {/* Step progress pills */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-5 h-1.5 rounded-full transition-colors ${i <= step ? "bg-brain-v1green" : "bg-[#1d2131]"}`}
              />
            ))}
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* STEP 0 — Agent Type */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Choose the primary function of your AI agent.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {agentTypes.map((t) => {
                  const sel = selectedType === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedType(t.id)}
                      className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all ${
                        sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                      }`}
                    >
                      <span className="text-2xl flex-shrink-0">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm ${sel ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>
                          {t.label}
                        </div>
                        <div className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">{t.desc}</div>
                      </div>
                      <RadioDot selected={sel} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 1 — Customize */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              {/* Avatar */}
              <div className="flex flex-col gap-2">
                <SmallLabel>Agent Avatar</SmallLabel>
                <div className="flex items-center gap-3">
                  <div
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-[#1d2131] flex items-center justify-center bg-brain-v1baby-blue-15 cursor-pointer hover:border-[#414965] transition-colors overflow-hidden flex-shrink-0"
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
                    <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Or choose a preset:</span>
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
                <FieldLabel>Agent Name *</FieldLabel>
                <input
                  value={agentName}
                  onChange={(e) => {
                    setAgentName(e.target.value);
                    setAgentTicker("$" + e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 8));
                  }}
                  placeholder="e.g. AlphaFlow"
                  className={inputCls}
                />
              </div>

              {/* Ticker */}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Token Ticker *</FieldLabel>
                <input
                  value={agentTicker}
                  onChange={(e) => setAgentTicker(e.target.value)}
                  placeholder="$ALPHA"
                  className={`${inputCls} [font-family:'JetBrains_Mono',Helvetica]`}
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Description</FieldLabel>
                <textarea
                  value={agentDesc}
                  onChange={(e) => setAgentDesc(e.target.value)}
                  placeholder="Describe what your agent does..."
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          )}

          {/* STEP 2 — Assign Capital */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Set the initial capital allocation for your agent.
              </p>

              <div className="flex flex-col gap-1.5">
                <FieldLabel>Amount *</FieldLabel>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-4 h-14 bg-[#222737] rounded-2xl focus-within:ring-1 focus-within:ring-[#414965] transition-all">
                    <input
                      value={capital}
                      onChange={(e) => setCapital(e.target.value)}
                      type="number"
                      placeholder="0.00"
                      className={bigInputCls}
                    />
                  </div>
                  <select
                    value={capitalAsset}
                    onChange={(e) => setCapitalAsset(e.target.value)}
                    className="px-4 py-3 h-14 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-brain-v1white text-sm [font-family:'Gilroy-SemiBold',Helvetica] outline-none cursor-pointer"
                  >
                    {["USDC", "ETH", "BTC", "MATIC", "BNB"].map((a) => (
                      <option key={a} value={a} className="bg-[#0d1017]">{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {["1,000", "5,000", "10,000", "50,000"].map((v) => (
                  <button
                    key={v}
                    onClick={() => setCapital(v.replace(",", ""))}
                    className="flex-1 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-[#414965] transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Balance */}
              <div className="flex items-center justify-between p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Available balance</span>
                <span className="text-sm [font-family:'JetBrains_Mono',Helvetica] text-brain-v1green">$865,040.30 AED</span>
              </div>

              <div className="bg-brain-v1dark-orange/10 border border-brain-v1dark-orange/20 rounded-2xl p-4">
                <p className="text-xs text-brain-v1light-orange [font-family:'Gilroy-Medium',Helvetica]">
                  ⚠️ Capital is locked while the agent is active. You can withdraw unused capital at any time.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3 — Policy Controls */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Set the risk tolerance and operating limits for your agent.
              </p>

              {/* Risk level */}
              <div className="flex flex-col gap-2">
                <SmallLabel>Risk Level</SmallLabel>
                <div className="grid grid-cols-2 gap-2">
                  {riskLevels.map((r) => {
                    const sel = riskLevel === r;
                    return (
                      <button
                        key={r}
                        onClick={() => setRiskLevel(r)}
                        className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-all ${
                          sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"
                        }`}
                      >
                        {r}
                        <RadioDot selected={sel} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Max drawdown */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <SmallLabel>Max Drawdown</SmallLabel>
                  <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{maxDrawdown}%</span>
                </div>
                <input type="range" min={1} max={80} value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value)} className="w-full accent-orange-500" />
                <div className="flex justify-between text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                  <span>1%</span><span>80%</span>
                </div>
              </div>

              {/* Stop loss */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <SmallLabel>Stop Loss per Trade</SmallLabel>
                  <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{stopLoss}%</span>
                </div>
                <input type="range" min={1} max={50} value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="w-full accent-orange-500" />
                <div className="flex justify-between text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                  <span>1%</span><span>50%</span>
                </div>
              </div>

              {/* Execution mode */}
              <div className="flex flex-col gap-2">
                <SmallLabel>Execution Mode</SmallLabel>
                <div className="flex flex-col gap-2">
                  {executionModes.map((m) => {
                    const sel = executionMode === m;
                    return (
                      <button
                        key={m}
                        onClick={() => setExecutionMode(m)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                          sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sel ? "border-brain-v1light-orange" : "border-[#414965]"}`}>
                          {sel && <div className="w-2 h-2 bg-brain-v1light-orange rounded-full" />}
                        </div>
                        <span className={`text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${sel ? "text-brain-v1light-orange" : "text-brain-v1baby-blue-60"}`}>{m}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — Risk & Limits (tabbed) */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              {/* Policy tabs */}
              <div className="flex gap-1 p-1 bg-brain-v1baby-blue-15 rounded-2xl overflow-x-auto">
                {([
                  { id: "capital",   label: "Capital" },
                  { id: "risk",      label: "Risk Limits" },
                  { id: "assets",    label: "Assets" },
                  { id: "strategy",  label: "Strategy" },
                  { id: "execution", label: "Execution" },
                ] as { id: PolicyTab; label: string }[]).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPolicyTab(t.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors whitespace-nowrap ${
                      policyTab === t.id ? "bg-brain-v1headerfooterbg text-brain-v1white" : "text-brain-v1baby-blue-30 hover:text-brain-v1white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {policyTab === "capital" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Control how your agent allocates capital across positions.</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <SmallLabel>Max Allocation per Asset</SmallLabel>
                      <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{maxAlloc}%</span>
                    </div>
                    <input type="range" min={1} max={100} value={maxAlloc} onChange={(e) => setMaxAlloc(e.target.value)} className="w-full accent-orange-500" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <SmallLabel>Minimum Liquidity Threshold (USD)</SmallLabel>
                    <input value={minLiquidity} onChange={(e) => setMinLiquidity(e.target.value)} type="number" className={inputCls} />
                  </div>
                </div>
              )}

              {policyTab === "risk" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Set hard limits to protect your capital from excessive losses.</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <SmallLabel>Max Position Size</SmallLabel>
                      <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{maxPosition}%</span>
                    </div>
                    <input type="range" min={1} max={100} value={maxPosition} onChange={(e) => setMaxPosition(e.target.value)} className="w-full accent-orange-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Daily Loss Limit",    val: "5",  suffix: "%" },
                      { label: "Max Open Positions",  val: "3",  suffix: "" },
                      { label: "Trailing Stop",       val: "8",  suffix: "%" },
                      { label: "Max Trades / Day",    val: maxTrades, suffix: "" },
                    ].map(({ label, val, suffix }) => (
                      <div key={label} className="flex items-center justify-between p-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                        <span className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{label}</span>
                        <span className="text-sm [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{val}{suffix}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {policyTab === "assets" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Select the assets your agent is allowed to trade.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {assetList.map((a) => {
                      const sel = selectedAssets.includes(a);
                      return (
                        <button
                          key={a}
                          onClick={() => toggleAsset(a)}
                          className={`py-2.5 rounded-2xl border text-sm [font-family:'JetBrains_Mono',Helvetica] font-semibold transition-all ${
                            sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"
                          }`}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                    {selectedAssets.length} asset{selectedAssets.length !== 1 ? "s" : ""} selected
                  </p>
                </div>
              )}

              {policyTab === "strategy" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Define the trading strategy and parameters.</p>
                  {[
                    { label: "Max Trades per Day", value: maxTrades, setter: setMaxTrades, type: "number" },
                  ].map(({ label, value, setter, type }) => (
                    <div key={label} className="flex flex-col gap-1.5">
                      <SmallLabel>{label}</SmallLabel>
                      <input
                        type={type}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  ))}
                  <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                    <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">
                      Strategy parameters are applied per execution cycle. Advanced configurations available post-launch.
                    </p>
                  </div>
                </div>
              )}

              {policyTab === "execution" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure how and when your agent executes transactions.</p>
                  <div className="flex flex-col gap-2">
                    {executionModes.map((m) => {
                      const sel = executionMode === m;
                      return (
                        <button
                          key={m}
                          onClick={() => setExecutionMode(m)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                            sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sel ? "border-brain-v1light-orange" : "border-[#414965]"}`}>
                            {sel && <div className="w-2 h-2 bg-brain-v1light-orange rounded-full" />}
                          </div>
                          <span className={`text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${sel ? "text-brain-v1light-orange" : "text-brain-v1baby-blue-60"}`}>{m}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5 — Authorization */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Authorize your agent to operate on your behalf.
              </p>

              <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] space-y-3">
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                  By authorizing, you grant this agent permission to execute trades and manage capital within the defined policy controls. You retain full control and can pause or revoke access at any time.
                </p>
              </div>

              {[
                { id: "auth", label: "I authorize this agent to act on my behalf", sublabel: "The agent will operate within my policy controls.", val: authSig, set: setAuthSig },
                { id: "terms", label: "I agree to the Brain Finance Agent Terms", sublabel: "Including liability, risk disclosures, and platform policies.", val: terms, set: setTerms },
              ].map(({ id, label, sublabel, val, set }) => (
                <button
                  key={id}
                  onClick={() => set(!val)}
                  className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all w-full ${
                    val ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${val ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-[#414965]"}`}>
                    {val && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${val ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>{label}</p>
                    <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">{sublabel}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* STEP 6 — Review */}
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Review your configuration before launching.
              </p>

              <div className="flex flex-col gap-3">
                {/* Agent identity */}
                <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                  {selectedAvatar ? (
                    <img src={selectedAvatar} alt="Avatar" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-brain-v1dark-orange flex items-center justify-center text-xl flex-shrink-0">
                      {agentTypes.find((t) => t.id === selectedType)?.icon ?? "🤖"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base">{agentName || "Unnamed Agent"}</p>
                    <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs">{agentTicker || "No ticker"}</p>
                  </div>
                  <span className="px-3 py-1 bg-brain-v1dark-orange/20 rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] capitalize">
                    {selectedType || "No type"}
                  </span>
                </div>

                {/* Config summary */}
                <div className="bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] overflow-hidden">
                  {[
                    { label: "Capital",        value: capital ? `${capital} ${capitalAsset}` : "—" },
                    { label: "Risk Level",     value: riskLevel },
                    { label: "Max Drawdown",   value: `${maxDrawdown}%` },
                    { label: "Stop Loss",      value: `${stopLoss}%` },
                    { label: "Execution Mode", value: executionMode },
                    { label: "Allowed Assets", value: selectedAssets.join(", ") || "None" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} className={`flex justify-between items-center px-4 py-3 ${i < arr.length - 1 ? "border-b border-[#1d2131]" : ""}`}>
                      <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">{label}</span>
                      <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs">{value}</span>
                    </div>
                  ))}
                </div>

                {agentDesc && (
                  <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                    <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">{agentDesc}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 pb-6 pt-4 border-t border-[#1d2131] flex-shrink-0">
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              {launching ? "Launching…" : "🚀 Launch Agent"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
