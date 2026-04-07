import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AgentPrefillData } from "@/lib/navContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onViewMyAgents?: () => void;
  initialStep?: number;
  prefill?: AgentPrefillData;
  agentId?: string;
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

const STEPS = ["Agent Type", "Customize", "Assign Capital", "Policy Controls", "Risk & Limits", "Authorization", "Review"];
const riskLevels = ["Conservative", "Moderate", "Aggressive", "Custom"];
const executionModes = ["Automatic", "Supervised", "Manual Approval"];
const assetList = ["ETH", "BTC", "USDC", "MATIC", "BNB", "SOL", "AVAX", "ARB"];

const AVAILABLE_BALANCE = 865040.30;

const formatNumber = (raw: string): string => {
  const clean = raw.replace(/[^0-9.]/g, "");
  if (!clean) return "";
  const [intPart, ...decParts] = clean.split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decParts.length > 0 ? `${formatted}.${decParts.join("").slice(0, 2)}` : formatted;
};
const parseNumber = (val: string): number => parseFloat(val.replace(/,/g, "")) || 0;

type PolicyTab = "capital" | "risk" | "assets" | "strategy" | "execution";

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
  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-base">{children}</span>
);

const SmallLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">{children}</span>
);

const SliderRow = ({ label, value, min, max, unit, onChange, color = "#ff9500" }: {
  label: string; value: string; min: number; max: number; unit?: string;
  onChange: (v: string) => void; color?: string;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex justify-between">
      <SmallLabel>{label}</SmallLabel>
      <span className="text-xs [font-family:'JetBrains_Mono',Helvetica]" style={{ color }}>{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="w-full accent-orange-500" />
    <div className="flex justify-between text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
      <span>{min}{unit}</span><span>{max}{unit}</span>
    </div>
  </div>
);

const MultiSelect = ({ label, options, selected, onToggle }: {
  label: string; options: string[]; selected: string[]; onToggle: (v: string) => void;
}) => (
  <div className="flex flex-col gap-2">
    <SmallLabel>{label}</SmallLabel>
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const sel = selected.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 rounded-xl border text-xs [font-family:'Gilroy-SemiBold',Helvetica] transition-all ${
              sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  </div>
);

const RadioGroup = ({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) => (
  <div className="flex flex-col gap-2">
    <SmallLabel>{label}</SmallLabel>
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const sel = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-sm [font-family:'Gilroy-SemiBold',Helvetica] transition-all ${
              sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"
            }`}
          >
            {opt}
            <RadioDot selected={sel} />
          </button>
        );
      })}
    </div>
  </div>
);

/* Convert API execution mode string → modal label */
function toExecModeLabel(apiMode: string | undefined): string {
  switch ((apiMode ?? "").toLowerCase().replace(/\s/g, "_")) {
    case "automatic":       return "Automatic";
    case "supervised":      return "Supervised";
    case "manual_approval": return "Manual Approval";
    default:                return "Automatic";
  }
}

/* Capitalize first letter (conservative → Conservative) */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export const CreateAgentModal = ({ open, onClose, onViewMyAgents, initialStep = 0, prefill, agentId }: Props): JSX.Element | null => {
  const isEditMode = !!prefill && !!agentId;
  const [step, setStep] = useState(initialStep);

  const [selectedType, setSelectedType]     = useState("");
  const [agentName, setAgentName]           = useState("");
  const [agentDesc, setAgentDesc]           = useState("");
  const [agentWebsite, setAgentWebsite]     = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [capital, setCapital]               = useState("");
  const [capitalAsset, setCapitalAsset]     = useState("USDC");
  const [riskLevel, setRiskLevel]           = useState("Moderate");
  const [maxDrawdown, setMaxDrawdown]       = useState("20");
  const [stopLoss, setStopLoss]             = useState("10");
  const [policyTab, setPolicyTab]           = useState<PolicyTab>("capital");
  const [maxAlloc, setMaxAlloc]             = useState("80");
  const [minLiquidity, setMinLiquidity]     = useState("5,000");
  const [executionMode, setExecutionMode]   = useState("Automatic");
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["ETH", "USDC"]);
  const [maxPosition, setMaxPosition]       = useState("25");
  const [maxTrades, setMaxTrades]           = useState("10");
  const [authSig, setAuthSig]               = useState(false);
  const [terms, setTerms]                   = useState(false);
  const [launching, setLaunching]           = useState(false);
  const [launched, setLaunched]             = useState(false);

  /* ── Lending-specific ── */
  const [maxLTV, setMaxLTV]                       = useState("75");
  const [liquidationThreshold, setLiquidationThreshold] = useState("85");
  const [interestRateMode, setInterestRateMode]   = useState("Variable");
  const [lendingProtocols, setLendingProtocols]   = useState<string[]>(["Aave", "Compound"]);

  /* ── Yield-specific ── */
  const [targetAPY, setTargetAPY]         = useState("8");
  const [minAPY, setMinAPY]               = useState("4");
  const [rebalanceFreq, setRebalanceFreq] = useState("Every 24h");
  const [yieldProtocols, setYieldProtocols] = useState<string[]>(["Aave", "Curve"]);

  /* ── Payments-specific ── */
  const [maxSinglePayment, setMaxSinglePayment]     = useState("500");
  const [monthlyBudgetCap, setMonthlyBudgetCap]     = useState("2,000");
  const [autoApprovalThreshold, setAutoApprovalThreshold] = useState("50");
  const [paymentMethod, setPaymentMethod]           = useState("On-chain");

  /* ── Analytics-specific ── */
  const [signalSources, setSignalSources]   = useState<string[]>(["News", "On-chain"]);
  const [minConfidence, setMinConfidence]   = useState("Medium");
  const [signalsPerDay, setSignalsPerDay]   = useState("10");
  const [outputChannels, setOutputChannels] = useState<string[]>(["Dashboard"]);

  /* ── Custom-specific ── */
  const [customInstructions, setCustomInstructions] = useState("");
  const [triggerType, setTriggerType]               = useState("Event-driven");
  const [webhookURL, setWebhookURL]                 = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  /* ── Pre-fill state when opened with prefill data ── */
  useEffect(() => {
    if (!open) return;
    setStep(initialStep ?? 0);
    if (!prefill) return;
    setSelectedType(prefill.type || "");
    setAgentName(prefill.name || "");
    setAgentDesc(prefill.description || "");
    setSelectedAvatar(prefill.avatar || "");
    setCapital(prefill.capital || "");
    setCapitalAsset(prefill.capitalAsset || "USDC");
    setRiskLevel(capitalize(prefill.riskLevel || "Moderate"));
    setMaxDrawdown(prefill.maxDrawdown || "20");
    setStopLoss(prefill.stopLoss || "10");
    setExecutionMode(toExecModeLabel(prefill.executionMode));
    setSelectedAssets(prefill.allowedAssets?.length ? prefill.allowedAssets : ["ETH", "USDC"]);
    setMaxAlloc(prefill.maxAlloc || "80");
    setMaxPosition(prefill.maxPosition || "25");
    setMaxTrades(prefill.maxTrades || "10");
    if (prefill.maxLTV)              setMaxLTV(prefill.maxLTV);
    if (prefill.liquidationThreshold) setLiquidationThreshold(prefill.liquidationThreshold);
    if (prefill.targetAPY)            setTargetAPY(prefill.targetAPY);
    if (prefill.minAPY)               setMinAPY(prefill.minAPY);
    if (prefill.rebalanceFreq)        setRebalanceFreq(prefill.rebalanceFreq);
    if (prefill.yieldProtocols?.length) setYieldProtocols(prefill.yieldProtocols);
    if (prefill.maxSinglePayment)     setMaxSinglePayment(prefill.maxSinglePayment);
    if (prefill.monthlyBudgetCap)     setMonthlyBudgetCap(prefill.monthlyBudgetCap);
    if (prefill.autoApprovalThreshold) setAutoApprovalThreshold(prefill.autoApprovalThreshold);
    // Reset auth/launch flags
    setAuthSig(false);
    setTerms(false);
    setLaunched(false);
    setLaunching(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capitalNum = parseNumber(capital);
  const balanceError = capitalNum > 0 && capitalNum > AVAILABLE_BALANCE;
  const autoTicker = agentName ? "$" + agentName.toUpperCase().replace(/\s/g, "").slice(0, 8) : "";

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agents", {
        name: agentName,
        type: selectedType,
        ticker: autoTicker,
        description: agentDesc,
        website: agentWebsite || undefined,
        avatar: selectedAvatar || "/figmaAssets/avatars.svg",
        capitalAmount: capitalNum,
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
        createdByUser: true,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      setLaunching(false);
      setLaunched(true);
    },
    onError: () => {
      setLaunching(false);
      setLaunched(true);
    },
  });

  if (!open) return null;

  const canProceed = () => {
    if (step === 0) return !!selectedType;
    if (step === 1) return !!agentName;
    if (step === 2) return !!capital && !balanceError;
    if (step === 5) return isEditMode || (authSig && terms);
    return true;
  };

  const toggleAsset = (a: string) =>
    setSelectedAssets((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(0); setSelectedType(""); setAgentName(""); setAgentDesc("");
      setAgentWebsite(""); setSelectedAvatar(""); setCapital(""); setRiskLevel("Moderate");
      setAuthSig(false); setTerms(false); setLaunched(false); setLaunching(false);
      setCapitalAsset("USDC"); setMaxDrawdown("20"); setStopLoss("10");
      setExecutionMode("Automatic"); setSelectedAssets(["ETH", "USDC"]);
    }, 300);
  };

  const updateAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/agents/${agentId}`, {
        name: agentName,
        type: selectedType,
        description: agentDesc,
        avatar: selectedAvatar || "/figmaAssets/avatars.svg",
        capitalAmount: capitalNum,
        capitalAsset,
        riskLevel: riskLevel.toLowerCase(),
        maxDrawdown: parseInt(maxDrawdown),
        stopLoss: parseInt(stopLoss),
        executionMode: executionMode.toLowerCase().replace(" ", "_"),
        allowedAssets: selectedAssets,
        maxAllocationPct: parseInt(maxAlloc),
        maxPositionPct: parseInt(maxPosition),
        maxTradesPerDay: parseInt(maxTrades),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      qc.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      setLaunching(false);
      setLaunched(true);
    },
    onError: () => { setLaunching(false); setLaunched(true); },
  });

  const handleLaunch = () => {
    setLaunching(true);
    if (isEditMode) {
      updateAgentMutation.mutate();
    } else {
      createAgentMutation.mutate();
    }
  };

  const inputCls = "px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-60 outline-none focus:border-[#414965] transition-colors w-full";
  const bigInputCls = "flex-1 bg-transparent text-white text-xl [font-family:'JetBrains_Mono',Helvetica] outline-none placeholder:text-[#414965] min-w-0";

  /* ── Type-specific policy content (step 3 supplement) ── */
  const TypePolicyContent = () => {
    if (selectedType === "lending") return (
      <div className="flex flex-col gap-4 pt-4 border-t border-[#1d2131]">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Lending Configuration</p>
        <SliderRow label="Max Loan-to-Value (LTV)" value={maxLTV} min={10} max={90} unit="%" onChange={setMaxLTV} />
        <SliderRow label="Liquidation Threshold" value={liquidationThreshold} min={50} max={95} unit="%" onChange={setLiquidationThreshold} />
        <RadioGroup label="Interest Rate Mode" options={["Fixed", "Variable", "Best Available"]} value={interestRateMode} onChange={setInterestRateMode} />
        <MultiSelect label="Supported Protocols" options={["Aave", "Compound", "Spark", "Morpho", "Euler"]} selected={lendingProtocols} onToggle={(v) => setLendingProtocols((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])} />
      </div>
    );

    if (selectedType === "yield") return (
      <div className="flex flex-col gap-4 pt-4 border-t border-[#1d2131]">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Yield Configuration</p>
        <SliderRow label="Target APY" value={targetAPY} min={1} max={50} unit="%" onChange={setTargetAPY} color="#42bf23" />
        <SliderRow label="Minimum APY Threshold" value={minAPY} min={1} max={20} unit="%" onChange={setMinAPY} color="#42bf23" />
        <RadioGroup label="Rebalance Frequency" options={["Every 12h", "Every 24h", "Every 48h", "Weekly"]} value={rebalanceFreq} onChange={setRebalanceFreq} />
        <MultiSelect label="Protocol Whitelist" options={["Aave", "Compound", "Curve", "Yearn", "Pendle", "Convex"]} selected={yieldProtocols} onToggle={(v) => setYieldProtocols((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])} />
      </div>
    );

    if (selectedType === "payments") return (
      <div className="flex flex-col gap-4 pt-4 border-t border-[#1d2131]">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Payment Configuration</p>
        <div className="flex flex-col gap-1.5">
          <SmallLabel>Max Single Payment (USD)</SmallLabel>
          <input value={maxSinglePayment} onChange={(e) => setMaxSinglePayment(e.target.value)} placeholder="500" type="number" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <SmallLabel>Monthly Budget Cap (USD)</SmallLabel>
          <div className="flex items-center gap-2 px-4 h-12 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
            <span className="text-brain-v1baby-blue-60 text-sm [font-family:'JetBrains_Mono',Helvetica]">$</span>
            <input value={monthlyBudgetCap} onChange={(e) => setMonthlyBudgetCap(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="2,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <SmallLabel>Auto-approval Threshold (USD)</SmallLabel>
          <input value={autoApprovalThreshold} onChange={(e) => setAutoApprovalThreshold(e.target.value)} placeholder="50" type="number" className={inputCls} />
        </div>
        <RadioGroup label="Payment Method" options={["On-chain", "Bank Transfer", "USDC", "Mixed"]} value={paymentMethod} onChange={setPaymentMethod} />
      </div>
    );

    if (selectedType === "analytics") return (
      <div className="flex flex-col gap-4 pt-4 border-t border-[#1d2131]">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Analytics Configuration</p>
        <MultiSelect label="Signal Sources" options={["News", "On-chain", "Social", "GitHub", "DEX data"]} selected={signalSources} onToggle={(v) => setSignalSources((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])} />
        <RadioGroup label="Minimum Confidence" options={["Low", "Medium", "High", "Very High"]} value={minConfidence} onChange={setMinConfidence} />
        <SliderRow label="Max Signals per Day" value={signalsPerDay} min={1} max={50} onChange={setSignalsPerDay} color="#a8b9f4" />
        <MultiSelect label="Output Channels" options={["Dashboard", "Webhook", "Email", "On-chain"]} selected={outputChannels} onToggle={(v) => setOutputChannels((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])} />
      </div>
    );

    if (selectedType === "custom") return (
      <div className="flex flex-col gap-4 pt-4 border-t border-[#1d2131]">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">Custom Configuration</p>
        <div className="flex flex-col gap-1.5">
          <SmallLabel>Agent Instructions</SmallLabel>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="Describe exactly what your agent should do, its goals, constraints, and decision logic..."
            rows={4}
            className={`${inputCls} resize-none`}
          />
        </div>
        <RadioGroup label="Trigger Type" options={["Event-driven", "Scheduled (cron)", "On-demand", "Always-on"]} value={triggerType} onChange={setTriggerType} />
        <div className="flex flex-col gap-1.5">
          <SmallLabel>Webhook Endpoint (optional)</SmallLabel>
          <input value={webhookURL} onChange={(e) => setWebhookURL(e.target.value)} placeholder="https://api.example.com/trigger" type="url" className={inputCls} />
        </div>
      </div>
    );

    return null;
  };

  /* ── Type-specific strategy tab content (step 4) ── */
  const StrategyTabContent = () => {
    if (selectedType === "lending") return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Control lending strategy and collateral management.</p>
        <SliderRow label="Collateral Buffer (above liquidation)" value="10" min={2} max={30} unit="%" onChange={() => {}} />
        <RadioGroup label="Auto-repay Strategy" options={["Aggressive (lower LTV)", "Balanced", "Conservative", "Manual only"]} value="Balanced" onChange={() => {}} />
      </div>
    );

    if (selectedType === "yield") return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Define how your agent optimizes and compounds yield.</p>
        <RadioGroup label="Compounding Strategy" options={["Auto-compound", "Withdraw rewards", "Reinvest manually", "Hybrid"]} value="Auto-compound" onChange={() => {}} />
        <SliderRow label="Max Gas Budget (% of yield)" value="0.5" min={0} max={5} unit="%" onChange={() => {}} color="#42bf23" />
      </div>
    );

    if (selectedType === "payments") return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure payment batching and retry strategy.</p>
        <RadioGroup label="Batching Mode" options={["Real-time", "Hourly batch", "Daily batch", "Manual"]} value="Real-time" onChange={() => {}} />
        <SliderRow label="Retry Attempts" value="3" min={0} max={10} onChange={() => {}} color="#a8b9f4" />
      </div>
    );

    if (selectedType === "analytics") return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure signal aggregation and alert strategy.</p>
        <RadioGroup label="Aggregation Method" options={["Majority vote", "Weighted score", "First signal", "Consensus only"]} value="Majority vote" onChange={() => {}} />
        <SliderRow label="Signal Lookback Window (hours)" value="6" min={1} max={48} onChange={() => {}} color="#a8b9f4" />
      </div>
    );

    if (selectedType === "custom") return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Advanced settings for your custom agent logic.</p>
        <div className="flex flex-col gap-1.5">
          <SmallLabel>Max Actions per Day</SmallLabel>
          <input value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} type="number" className={inputCls} />
        </div>
        <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
          <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Additional strategy parameters can be configured via the agent management panel after launch.</p>
        </div>
      </div>
    );

    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Define the trading strategy and parameters.</p>
        <div className="flex flex-col gap-1.5">
          <SmallLabel>Max Trades per Day</SmallLabel>
          <input type="number" value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} className={inputCls} />
        </div>
        <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
          <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Strategy parameters are applied per execution cycle. Advanced configurations available post-launch.</p>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-[540px] max-h-[90vh] flex flex-col bg-[#0d1017] border border-[#1d2131] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* ── SUCCESS ── */}
        {launched && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d1017] gap-5 px-8 overflow-y-auto py-8">
            {/* Star icon */}
            <div className="w-20 h-20 rounded-full bg-brain-v1dark-orange/20 border border-brain-v1dark-orange/30 flex items-center justify-center flex-shrink-0">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M18 6L22 14L31 15.5L24.5 22L26 31L18 27L10 31L11.5 22L5 15.5L14 14L18 6Z" fill="#ff9500" fillOpacity="0.15" stroke="#ff9500" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>

            <div className="text-center">
              <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-2xl">
                {isEditMode ? "Changes saved!" : `${agentName || "Agent"} is live!`}
              </h3>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">
                Your AI agent is deployed and ready to operate.
              </p>
            </div>

            {/* Identity */}
            <div className="w-full flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
              {selectedAvatar ? (
                <img src={selectedAvatar} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-brain-v1dark-orange/20 flex items-center justify-center flex-shrink-0 text-lg">
                  {agentTypes.find((t) => t.id === selectedType)?.icon ?? "🤖"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm truncate">{agentName}</p>
                <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] capitalize">{selectedType} agent</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-brain-v1green animate-pulse" />
                <span className="text-xs text-brain-v1green [font-family:'Gilroy-SemiBold',Helvetica]">Active</span>
              </div>
            </div>

            {/* Summary rows */}
            <div className="w-full bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] overflow-hidden">
              {([
                { label: "Capital",        value: capital ? `$${capital} ${capitalAsset}` : "—" },
                { label: "Risk Level",     value: riskLevel },
                { label: "Execution",      value: executionMode },
                ...(selectedType === "lending" ? [
                  { label: "Max LTV",    value: `${maxLTV}%` },
                  { label: "Protocols",  value: lendingProtocols.slice(0, 2).join(", ") },
                ] : selectedType === "yield" ? [
                  { label: "Target APY",  value: `${targetAPY}%` },
                  { label: "Rebalance",   value: rebalanceFreq },
                ] : selectedType === "payments" ? [
                  { label: "Max Payment", value: `$${maxSinglePayment}` },
                  { label: "Monthly Cap", value: `$${monthlyBudgetCap}` },
                ] : selectedType === "analytics" ? [
                  { label: "Sources",     value: signalSources.slice(0, 2).join(", ") },
                  { label: "Confidence",  value: minConfidence },
                ] : selectedType === "custom" ? [
                  { label: "Trigger",     value: triggerType },
                ] : [
                  { label: "Assets",      value: selectedAssets.slice(0, 3).join(", ") + (selectedAssets.length > 3 ? "…" : "") },
                  { label: "Max Drawdown",value: `${maxDrawdown}%` },
                ]),
              ] as { label: string; value: string }[]).map(({ label, value }, i, arr) => (
                <div key={label} className={`flex justify-between items-center px-4 py-3 ${i < arr.length - 1 ? "border-b border-[#1d2131]" : ""}`}>
                  <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">{label}</span>
                  <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs">{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => { onViewMyAgents ? onViewMyAgents() : handleClose(); }}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity flex-shrink-0"
            >
              View in My Agents →
            </button>
          </div>
        )}

        {/* ── HEADER ── */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-[#1d2131] flex-shrink-0">
          {step > 0 && !launched && (
            <button onClick={() => setStep((s) => s - 1)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6L8 10" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-2xl leading-tight">{isEditMode ? "Edit Agent" : "Create an Agent"}</h2>
            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-sm mt-0.5">{STEPS[step]}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {STEPS.map((_, i) => (
              <div key={i} className={`w-5 h-1.5 rounded-full transition-colors ${i <= step ? "bg-brain-v1green" : "bg-[#1d2131]"}`} />
            ))}
          </div>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* STEP 0 — Agent Type */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Choose the primary function of your AI agent.</p>
              <div className="grid grid-cols-2 gap-3">
                {agentTypes.map((t) => {
                  const sel = selectedType === t.id;
                  return (
                    <button key={t.id} onClick={() => setSelectedType(t.id)} className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
                      <span className="text-2xl flex-shrink-0">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm ${sel ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>{t.label}</div>
                        <div className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">{t.desc}</div>
                      </div>
                      <RadioDot selected={sel} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 1 — Customize (no ticker field) */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              {/* Avatar */}
              <div className="flex flex-col gap-2">
                <SmallLabel>Agent Avatar</SmallLabel>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-[#1d2131] flex items-center justify-center bg-brain-v1baby-blue-15 cursor-pointer hover:border-[#414965] transition-colors overflow-hidden flex-shrink-0" onClick={() => fileRef.current?.click()}>
                    {selectedAvatar ? (
                      <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-brain-v1baby-blue-30">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        <span className="text-[10px] [font-family:'Gilroy-Medium',Helvetica]">Upload</span>
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Or choose a preset:</span>
                    <div className="flex flex-wrap gap-2">
                      {avatarOptions.map((av) => (
                        <button key={av} onClick={() => setSelectedAvatar(av)} className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all ${selectedAvatar === av ? "border-brain-v1dark-orange" : "border-transparent hover:border-[#414965]"}`}>
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
                <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. AlphaFlow" className={inputCls} />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Description</FieldLabel>
                <textarea value={agentDesc} onChange={(e) => setAgentDesc(e.target.value)} placeholder="Describe what your agent does..." rows={3} className={`${inputCls} resize-none`} />
              </div>

              {/* Website */}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Website</FieldLabel>
                <input value={agentWebsite} onChange={(e) => setAgentWebsite(e.target.value)} placeholder="https://yourproject.xyz" type="url" className={inputCls} />
              </div>
            </div>
          )}

          {/* STEP 2 — Assign Capital (formatted + balance validation) */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Set the initial capital allocation for your agent.</p>

              <div className="flex flex-col gap-1.5">
                <FieldLabel>Amount *</FieldLabel>
                <div className="flex items-center gap-2">
                  <div className={`flex-1 flex items-center gap-2 px-4 h-14 rounded-2xl focus-within:ring-1 transition-all ${balanceError ? "bg-[#2a0a0a] ring-1 ring-[#d20344] focus-within:ring-[#d20344]" : "bg-[#222737] focus-within:ring-[#414965]"}`}>
                    <span className="text-brain-v1baby-blue-60 text-lg [font-family:'JetBrains_Mono',Helvetica]">$</span>
                    <input
                      value={capital}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.]/g, "");
                        setCapital(formatNumber(raw));
                      }}
                      placeholder="0.00"
                      inputMode="decimal"
                      className={`${bigInputCls} ${balanceError ? "text-[#d20344]" : ""}`}
                    />
                  </div>
                  <select value={capitalAsset} onChange={(e) => setCapitalAsset(e.target.value)} className="px-4 py-3 h-14 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-brain-v1white text-sm [font-family:'Gilroy-SemiBold',Helvetica] outline-none cursor-pointer">
                    {["USDC", "ETH", "BTC", "MATIC", "BNB"].map((a) => (
                      <option key={a} value={a} className="bg-[#0d1017]">{a}</option>
                    ))}
                  </select>
                </div>

                {/* Balance error */}
                {balanceError && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#2a0a0a] border border-[#d20344]/30 rounded-xl">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                      <circle cx="7" cy="7" r="6" stroke="#d20344" strokeWidth="1.2"/>
                      <path d="M7 4v3.5M7 9.5v.5" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <p className="text-xs text-[#d20344] [font-family:'Gilroy-Medium',Helvetica]">
                      Amount exceeds available balance of ${AVAILABLE_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {["1,000", "5,000", "10,000", "50,000"].map((v) => (
                  <button key={v} onClick={() => setCapital(v)} className="flex-1 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-[#414965] transition-colors">
                    {v}
                  </button>
                ))}
              </div>

              {/* Balance info */}
              <div className={`flex items-center justify-between p-4 rounded-2xl border ${balanceError ? "bg-[#2a0a0a] border-[#d20344]/20" : "bg-brain-v1baby-blue-15 border-[#1d2131]"}`}>
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Available balance</span>
                <span className={`text-sm [font-family:'JetBrains_Mono',Helvetica] ${balanceError ? "text-[#d20344]" : "text-brain-v1green"}`}>
                  ${AVAILABLE_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC
                </span>
              </div>

              {/* Allocated so far */}
              {capital && !balanceError && (
                <div className="flex items-center justify-between p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                  <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Remaining after allocation</span>
                  <span className="text-sm [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60">
                    ${(AVAILABLE_BALANCE - capitalNum).toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC
                  </span>
                </div>
              )}

              <div className="bg-brain-v1dark-orange/10 border border-brain-v1dark-orange/20 rounded-2xl p-4">
                <p className="text-xs text-brain-v1light-orange [font-family:'Gilroy-Medium',Helvetica]">
                  ⚠️ Capital is locked while the agent is active. You can withdraw unused capital at any time.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3 — Policy Controls (generic + type-specific) */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                Set the risk tolerance and operating limits for your agent.
              </p>

              <RadioGroup label="Risk Level" options={riskLevels} value={riskLevel} onChange={setRiskLevel} />

              <SliderRow label="Max Drawdown" value={maxDrawdown} min={1} max={80} unit="%" onChange={setMaxDrawdown} />
              <SliderRow label="Stop Loss per Trade" value={stopLoss} min={1} max={50} unit="%" onChange={setStopLoss} />

              {/* Execution mode */}
              <div className="flex flex-col gap-2">
                <SmallLabel>Execution Mode</SmallLabel>
                <div className="flex flex-col gap-2">
                  {executionModes.map((m) => {
                    const sel = executionMode === m;
                    return (
                      <button key={m} onClick={() => setExecutionMode(m)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sel ? "border-brain-v1light-orange" : "border-[#414965]"}`}>
                          {sel && <div className="w-2 h-2 bg-brain-v1light-orange rounded-full" />}
                        </div>
                        <div className="flex-1">
                          <span className={`text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${sel ? "text-brain-v1light-orange" : "text-brain-v1baby-blue-60"}`}>{m}</span>
                          <p className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">
                            {m === "Automatic" ? "Agent acts independently within policy limits" :
                             m === "Supervised" ? "Agent proposes actions for your review" :
                             "Every action requires your explicit approval"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Type-specific fields */}
              <TypePolicyContent />
            </div>
          )}

          {/* STEP 4 — Risk & Limits (tabbed, partially type-aware) */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-1 p-1 bg-brain-v1baby-blue-15 rounded-2xl overflow-x-auto">
                {([
                  { id: "capital", label: "Capital" },
                  { id: "risk", label: "Risk Limits" },
                  { id: "assets", label: selectedType === "lending" ? "Collateral" : selectedType === "analytics" ? "Data" : "Assets" },
                  { id: "strategy", label: "Strategy" },
                  { id: "execution", label: "Execution" },
                ] as { id: PolicyTab; label: string }[]).map((t) => (
                  <button key={t.id} onClick={() => setPolicyTab(t.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors whitespace-nowrap ${policyTab === t.id ? "bg-brain-v1headerfooterbg text-brain-v1white" : "text-brain-v1baby-blue-30 hover:text-brain-v1white"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {policyTab === "capital" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Control how your agent allocates capital across positions.</p>
                  <SliderRow label="Max Allocation per Asset" value={maxAlloc} min={1} max={100} unit="%" onChange={setMaxAlloc} />
                  <div className="flex flex-col gap-1.5">
                    <SmallLabel>Minimum Liquidity Threshold (USD)</SmallLabel>
                    <div className="flex items-center gap-2 px-4 h-12 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
                      <span className="text-brain-v1baby-blue-60 text-sm [font-family:'JetBrains_Mono',Helvetica]">$</span>
                      <input value={minLiquidity} onChange={(e) => setMinLiquidity(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="5,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {policyTab === "risk" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Set hard limits to protect your capital from excessive losses.</p>
                  <SliderRow label="Max Position Size" value={maxPosition} min={1} max={100} unit="%" onChange={setMaxPosition} />
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Daily Loss Limit", val: "5%"  },
                      { label: "Max Open Positions", val: "3" },
                      { label: "Trailing Stop", val: "8%"     },
                      { label: "Max Actions / Day", val: maxTrades },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex items-center justify-between p-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                        <span className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{label}</span>
                        <span className="text-sm [font-family:'JetBrains_Mono',Helvetica] text-brain-v1light-orange">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {policyTab === "assets" && (
                <div className="flex flex-col gap-4">
                  {selectedType === "lending" ? (
                    <>
                      <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Select accepted collateral assets for lending positions.</p>
                      <div className="grid grid-cols-4 gap-2">
                        {["ETH", "WBTC", "USDC", "DAI", "USDT", "stETH", "cbETH", "rETH"].map((a) => {
                          const sel = selectedAssets.includes(a);
                          return (
                            <button key={a} onClick={() => toggleAsset(a)} className={`py-2.5 rounded-2xl border text-sm [font-family:'JetBrains_Mono',Helvetica] font-semibold transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"}`}>{a}</button>
                          );
                        })}
                      </div>
                    </>
                  ) : selectedType === "analytics" ? (
                    <>
                      <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Select markets and chains your agent monitors for signals.</p>
                      <div className="grid grid-cols-4 gap-2">
                        {["ETH", "BTC", "SOL", "ARB", "OP", "BASE", "AVAX", "MATIC"].map((a) => {
                          const sel = selectedAssets.includes(a);
                          return (
                            <button key={a} onClick={() => toggleAsset(a)} className={`py-2.5 rounded-2xl border text-sm [font-family:'JetBrains_Mono',Helvetica] font-semibold transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"}`}>{a}</button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Select the assets your agent is allowed to operate with.</p>
                      <div className="grid grid-cols-4 gap-2">
                        {assetList.map((a) => {
                          const sel = selectedAssets.includes(a);
                          return (
                            <button key={a} onClick={() => toggleAsset(a)} className={`py-2.5 rounded-2xl border text-sm [font-family:'JetBrains_Mono',Helvetica] font-semibold transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"}`}>{a}</button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{selectedAssets.length} asset{selectedAssets.length !== 1 ? "s" : ""} selected</p>
                </div>
              )}

              {policyTab === "strategy" && <StrategyTabContent />}

              {policyTab === "execution" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure how and when your agent executes transactions.</p>
                  <div className="flex flex-col gap-2">
                    {executionModes.map((m) => {
                      const sel = executionMode === m;
                      return (
                        <button key={m} onClick={() => setExecutionMode(m)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
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
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Authorize your agent to operate on your behalf.</p>
              <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] space-y-3">
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                  By authorizing, you grant this agent permission to execute actions and manage capital within the defined policy controls. You retain full control and can pause or revoke access at any time.
                </p>
              </div>
              {[
                { id: "auth", label: "I authorize this agent to act on my behalf", sublabel: "The agent will operate within my policy controls.", val: authSig, set: setAuthSig },
                { id: "terms", label: "I agree to the Brain Finance Agent Terms", sublabel: "Including liability, risk disclosures, and platform policies.", val: terms, set: setTerms },
              ].map(({ id, label, sublabel, val, set }) => (
                <button key={id} onClick={() => set(!val)} className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all w-full ${val ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${val ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-[#414965]"}`}>
                    {val && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
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
          {step === 6 && (() => {
            /* Rows that vary per agent type */
            const typeRows: { label: string; value: string }[] =
              selectedType === "lending" ? [
                { label: "Max LTV",               value: `${maxLTV}%` },
                { label: "Liquidation Threshold", value: `${liquidationThreshold}%` },
                { label: "Interest Rate Mode",    value: interestRateMode },
                { label: "Lending Protocols",     value: lendingProtocols.join(", ") || "None" },
              ] : selectedType === "yield" ? [
                { label: "Target APY",          value: `${targetAPY}%` },
                { label: "Min APY Threshold",   value: `${minAPY}%` },
                { label: "Rebalance Frequency", value: rebalanceFreq },
                { label: "Yield Protocols",     value: yieldProtocols.join(", ") || "None" },
              ] : selectedType === "payments" ? [
                { label: "Max Single Payment",      value: `$${maxSinglePayment}` },
                { label: "Monthly Budget Cap",      value: `$${monthlyBudgetCap}` },
                { label: "Auto-approval Threshold", value: `$${autoApprovalThreshold}` },
                { label: "Payment Method",          value: paymentMethod },
              ] : selectedType === "analytics" ? [
                { label: "Signal Sources",  value: signalSources.join(", ") || "None" },
                { label: "Min Confidence",  value: minConfidence },
                { label: "Signals per Day", value: signalsPerDay },
                { label: "Output Channels", value: outputChannels.join(", ") || "None" },
              ] : selectedType === "custom" ? [
                { label: "Trigger Type", value: triggerType },
                { label: "Webhook URL",  value: webhookURL || "Not set" },
              ] : [
                { label: "Max Allocation per Asset", value: `${maxAlloc}%` },
                { label: "Max Position Size",        value: `${maxPosition}%` },
                { label: "Max Trades per Day",       value: maxTrades },
              ];

            const SectionTitle = ({ children }: { children: React.ReactNode }) => (
              <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest px-1">{children}</p>
            );

            const RowBlock = ({ rows }: { rows: { label: string; value: string }[] }) => (
              <div className="bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] overflow-hidden">
                {rows.map(({ label, value }, i) => (
                  <div key={label} className={`flex justify-between items-center px-4 py-3 ${i < rows.length - 1 ? "border-b border-[#1d2131]" : ""}`}>
                    <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">{label}</span>
                    <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs max-w-[55%] text-right">{value}</span>
                  </div>
                ))}
              </div>
            );

            return (
              <div className="flex flex-col gap-4">
                <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Review every setting before launching your agent.</p>

                {/* Identity card */}
                <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                  {selectedAvatar ? (
                    <img src={selectedAvatar} alt="Avatar" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-brain-v1dark-orange flex items-center justify-center text-xl flex-shrink-0">
                      {agentTypes.find((t) => t.id === selectedType)?.icon ?? "🤖"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base truncate">{agentName || "Unnamed Agent"}</p>
                    {agentDesc ? (
                      <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5 line-clamp-1">{agentDesc}</p>
                    ) : (
                      <p className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-0.5 italic">No description</p>
                    )}
                  </div>
                  <span className="px-3 py-1 bg-brain-v1dark-orange/20 rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] capitalize flex-shrink-0">
                    {selectedType || "No type"}
                  </span>
                </div>

                {/* Capital & risk */}
                <SectionTitle>Capital &amp; Risk</SectionTitle>
                <RowBlock rows={[
                  { label: "Capital Allocation", value: capital ? `$${capital} ${capitalAsset}` : "—" },
                  { label: "Risk Level",         value: riskLevel },
                  { label: "Max Drawdown",       value: `${maxDrawdown}%` },
                  { label: "Stop Loss",          value: `${stopLoss}%` },
                  { label: "Execution Mode",     value: executionMode },
                ]} />

                {/* Assets */}
                <SectionTitle>
                  {selectedType === "lending" ? "Collateral Assets" : selectedType === "analytics" ? "Monitored Markets" : "Allowed Assets"}
                </SectionTitle>
                <RowBlock rows={[
                  { label: selectedType === "lending" ? "Accepted Collateral" : "Tradeable Assets", value: selectedAssets.join(", ") || "None selected" },
                  { label: "Max Allocation / Asset", value: `${maxAlloc}%` },
                  { label: "Min Liquidity Threshold", value: `$${minLiquidity}` },
                ]} />

                {/* Type-specific */}
                {typeRows.length > 0 && (
                  <>
                    <SectionTitle>
                      {selectedType === "lending" ? "Lending Policy" :
                       selectedType === "yield"    ? "Yield Strategy" :
                       selectedType === "payments" ? "Payment Controls" :
                       selectedType === "analytics"? "Analytics Settings" :
                       selectedType === "custom"   ? "Custom Logic" :
                       "Trading Strategy"}
                    </SectionTitle>
                    <RowBlock rows={typeRows} />
                  </>
                )}

                {/* Custom instructions preview */}
                {selectedType === "custom" && customInstructions && (
                  <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                    <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest mb-2">Instructions</p>
                    <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed line-clamp-4">{customInstructions}</p>
                  </div>
                )}

                {/* Description */}
                {agentDesc && (
                  <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                    <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest mb-2">Description</p>
                    <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">{agentDesc}</p>
                  </div>
                )}
              </div>
            );
          })()}
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
              {launching ? (isEditMode ? "Saving…" : "Launching…") : (isEditMode ? "💾 Save Changes" : "🚀 Launch Agent")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
