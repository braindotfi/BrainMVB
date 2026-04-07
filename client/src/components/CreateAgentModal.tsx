import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { keccak256 } from "viem";
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

/* ─── Agent type metadata ─── */
const agentTypes = [
  { id: "trading",   label: "Trading",   icon: "⚡", desc: "Autonomous perpetual & spot trading on Hyperliquid with position limits and market constraints.", use: "Momentum, grid, and arb strategies" },
  { id: "lending",   label: "Lending",   icon: "🏦", desc: "Supply capital to lending protocols and manage collateral positions under LTV constraints.", use: "Aave, Compound, Morpho, Euler" },
  { id: "yield",     label: "Yield",     icon: "🌱", desc: "Optimize stablecoin yield via LP provision, stable swaps, perpetual funding, or Curve strategies.", use: "Stable farming, LP, Curve/Convex" },
  { id: "payments",  label: "Payments",  icon: "💳", desc: "Automate recurring bills, batch payments, and subscription management via x402 and USDC transfers.", use: "Payroll, subscriptions, x402" },
  { id: "analytics", label: "Analytics", icon: "📊", desc: "Monitor portfolio, detect anomalies, trigger alerts, and recommend rebalances. Read-only by default.", use: "Portfolio monitoring, signals" },
  { id: "custom",    label: "Custom",    icon: "🛠",  desc: "Deploy arbitrary agent objectives with user-defined execution boundaries and tool whitelisting.", use: "Any custom automation logic" },
];

const avatarOptions = [
  "/figmaAssets/avatars.svg", "/figmaAssets/avatars-1.svg", "/figmaAssets/avatars-2.svg",
  "/figmaAssets/avatars-3.svg", "/figmaAssets/avatars-4.svg", "/figmaAssets/avatars-5.svg",
  "/figmaAssets/avatars-6.svg", "/figmaAssets/avatars-7.svg", "/figmaAssets/avatars-8.svg", "/figmaAssets/avatars-9.svg",
];

const STEPS = ["Agent Type", "Identity", "Configuration", "Capital & Risk", "Policy Preview", "Authorization", "Review"];
const AVAILABLE_BALANCE = 865040.30;

/* ─── Claude Tool Schemas per agent type ─── */
const TOOL_SCHEMAS: Record<string, object[]> = {
  trading: [
    { name: "execute_trade", description: "Execute a spot or perpetual trade on Hyperliquid within policy bounds", input_schema: { type: "object", properties: { market: { type: "string", description: "Market pair, e.g. BTC-USDC" }, side: { type: "string", enum: ["long", "short"] }, size_usdc: { type: "number", description: "Position size in USDC" }, order_type: { type: "string", enum: ["market", "limit", "stop_limit"] }, limit_price: { type: "number" }, leverage: { type: "integer", minimum: 1, maximum: 100 } }, required: ["market", "side", "size_usdc", "order_type"] } },
    { name: "close_position", description: "Close an open position fully or partially", input_schema: { type: "object", properties: { market: { type: "string" }, close_pct: { type: "number", minimum: 1, maximum: 100 } }, required: ["market"] } },
    { name: "get_position_info", description: "Retrieve current open positions and P&L", input_schema: { type: "object", properties: { market: { type: "string" } }, required: [] } },
  ],
  lending: [
    { name: "supply_collateral", description: "Supply an asset to a lending protocol as collateral", input_schema: { type: "object", properties: { protocol: { type: "string", enum: ["aave", "compound", "morpho"] }, asset: { type: "string" }, amount_usdc: { type: "number" } }, required: ["protocol", "asset", "amount_usdc"] } },
    { name: "borrow_asset", description: "Borrow an asset against supplied collateral", input_schema: { type: "object", properties: { protocol: { type: "string" }, asset: { type: "string" }, amount_usdc: { type: "number" }, rate_mode: { type: "string", enum: ["stable", "variable"] } }, required: ["protocol", "asset", "amount_usdc"] } },
    { name: "rebalance_ltv", description: "Repay or withdraw to reach target LTV", input_schema: { type: "object", properties: { protocol: { type: "string" }, target_ltv_pct: { type: "number" } }, required: ["protocol", "target_ltv_pct"] } },
    { name: "get_health_factor", description: "Get current health factor and liquidation risk", input_schema: { type: "object", properties: { protocol: { type: "string" } }, required: ["protocol"] } },
  ],
  yield: [
    { name: "enter_yield_position", description: "Enter a yield-generating position (LP, vault, or stable swap)", input_schema: { type: "object", properties: { protocol: { type: "string" }, strategy: { type: "string", enum: ["stable_farming", "lp_on_dex", "perpetual_funding", "curve_convex"] }, assets: { type: "array", items: { type: "string" } }, amount_usdc: { type: "number" } }, required: ["protocol", "strategy", "assets", "amount_usdc"] } },
    { name: "exit_yield_position", description: "Exit a yield position and return to USDC", input_schema: { type: "object", properties: { position_id: { type: "string" }, exit_pct: { type: "number", minimum: 1, maximum: 100 } }, required: ["position_id"] } },
    { name: "check_apy", description: "Check current APY for a given protocol and asset pair", input_schema: { type: "object", properties: { protocol: { type: "string" }, asset_pair: { type: "string" } }, required: ["protocol"] } },
    { name: "compound_rewards", description: "Claim and reinvest yield rewards", input_schema: { type: "object", properties: { position_id: { type: "string" }, reinvest: { type: "boolean" } }, required: ["position_id"] } },
  ],
  payments: [
    { name: "send_payment", description: "Execute a USDC payment to an allowlisted recipient", input_schema: { type: "object", properties: { recipient: { type: "string", description: "Wallet address (must be allowlisted)" }, amount_usdc: { type: "number" }, memo: { type: "string" }, reference_id: { type: "string" } }, required: ["recipient", "amount_usdc"] } },
    { name: "schedule_payment", description: "Schedule a recurring payment", input_schema: { type: "object", properties: { recipient: { type: "string" }, amount_usdc: { type: "number" }, interval: { type: "string", enum: ["daily", "weekly", "monthly"] }, start_timestamp: { type: "number" } }, required: ["recipient", "amount_usdc", "interval"] } },
    { name: "batch_payroll", description: "Execute a batch of payments in a single transaction", input_schema: { type: "object", properties: { payments: { type: "array", items: { type: "object", properties: { recipient: { type: "string" }, amount_usdc: { type: "number" } } } } }, required: ["payments"] } },
    { name: "verify_x402_request", description: "Parse and verify an x402 payment request header", input_schema: { type: "object", properties: { x402_header: { type: "string" }, max_amount_usdc: { type: "number" } }, required: ["x402_header"] } },
  ],
  analytics: [
    { name: "get_portfolio_snapshot", description: "Return current portfolio state across all tracked agents", input_schema: { type: "object", properties: { include_unrealized: { type: "boolean" } }, required: [] } },
    { name: "detect_anomaly", description: "Run anomaly detection on recent agent activity", input_schema: { type: "object", properties: { agent_id: { type: "string" }, lookback_hours: { type: "integer", minimum: 1, maximum: 168 } }, required: ["agent_id"] } },
    { name: "generate_report", description: "Generate a performance report for one or all agents", input_schema: { type: "object", properties: { agent_ids: { type: "array", items: { type: "string" } }, metrics: { type: "array", items: { type: "string" } }, period_days: { type: "integer" } }, required: [] } },
    { name: "fire_alert", description: "Send an alert notification when a threshold is breached", input_schema: { type: "object", properties: { severity: { type: "string", enum: ["info", "warning", "critical"] }, message: { type: "string" }, target: { type: "string" } }, required: ["severity", "message"] } },
  ],
  custom: [
    { name: "execute_custom_action", description: "Execute a user-defined action within allowed tool boundaries", input_schema: { type: "object", properties: { action_type: { type: "string" }, parameters: { type: "object" }, spend_usdc: { type: "number" } }, required: ["action_type", "parameters"] } },
    { name: "call_external_api", description: "Make an authenticated call to a whitelisted external API", input_schema: { type: "object", properties: { endpoint: { type: "string" }, method: { type: "string", enum: ["GET", "POST"] }, payload: { type: "object" } }, required: ["endpoint", "method"] } },
    { name: "store_observation", description: "Store an observation in agent memory for future reasoning", input_schema: { type: "object", properties: { content: { type: "string" }, category: { type: "string" } }, required: ["content"] } },
  ],
};

/* ─── Enforcement checks per type ─── */
const ENFORCEMENT: Record<string, string[]> = {
  trading:   ["Position size ≤ max_position_size_usdc", "Market in allowed_markets list", "Velocity check (cooldown window)", "Daily loss tracking vs max_daily_loss_percent", "Slippage ≤ max_slippage_bps", "Leverage ≤ max_position_leverage"],
  lending:   ["Supply amount ≤ max_supply_usd", "Collateral in allowed_collateral_assets", "LTV simulation before every borrow", "Liquidation risk < max_liquidation_risk_percent", "Protocol in allowed protocol set"],
  yield:     ["Entry slippage ≤ max_slippage_bps", "Position ≤ max_position_size_usdc", "APY ≥ min_apy_percent at entry", "Impermanent loss simulation before LP entry", "Concentration ≤ max_stable_pair_concentration"],
  payments:  ["Recipient in allowlisted_recipients", "Amount ≤ per_transaction_limit_usdc", "Daily spend ≤ daily_spend_budget_usdc", "Daily tx count ≤ daily_transaction_count_limit", "x402 header validation", "Approval routing above threshold"],
  analytics: ["Read-only for non-auto-execute mode", "Execution spend ≤ execution_limit_usdc", "Alert rule evaluation (condition + threshold)", "Observation stored to pgvector memory"],
  custom:    ["Tool in allowed_tools whitelist", "Tool not in forbidden_tools", "Operations ≤ max_operations_per_hour", "Cumulative P&L circuit breaker", "Counterparty in allowed_counterparties"],
};

/* ─── Policy hash (keccak256 of canonical params) ─── */
function computePolicyHash(type: string, params: Record<string, unknown>): string {
  const canonical = { agent_type: type, ...Object.fromEntries(Object.entries(params).sort()) };
  const json = JSON.stringify(canonical);
  const bytes = new TextEncoder().encode(json);
  return keccak256(bytes);
}

/* ─── Helper components ─── */
const formatNumber = (raw: string): string => {
  const clean = raw.replace(/[^0-9.]/g, "");
  if (!clean) return "";
  const [intPart, ...decParts] = clean.split(".");
  return decParts.length > 0 ? `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decParts.join("").slice(0, 2)}` : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
const parseNumber = (val: string): number => parseFloat(val.replace(/,/g, "")) || 0;

const RadioDot = ({ selected }: { selected: boolean }) => (
  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${selected ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-brain-v1baby-blue-30"}`}>
    {selected && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </div>
);

const SmallLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">{children}</span>
);

const FieldHint = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{children}</span>
);

const SliderRow = ({ label, value, min, max, unit, onChange, color = "#ff9500", hint }: {
  label: string; value: string; min: number; max: number; unit?: string;
  onChange: (v: string) => void; color?: string; hint?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between">
      <SmallLabel>{label}</SmallLabel>
      <span className="text-xs [font-family:'JetBrains_Mono',Helvetica]" style={{ color }}>{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="w-full accent-orange-500" />
    <div className="flex justify-between text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
      <span>{min}{unit}</span><span>{max}{unit}</span>
    </div>
    {hint && <FieldHint>{hint}</FieldHint>}
  </div>
);

const MultiSelect = ({ label, options, selected, onToggle, hint }: {
  label: string; options: string[]; selected: string[]; onToggle: (v: string) => void; hint?: string;
}) => (
  <div className="flex flex-col gap-2">
    <SmallLabel>{label}</SmallLabel>
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const sel = selected.includes(opt);
        return (
          <button key={opt} onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 rounded-xl border text-xs [font-family:'Gilroy-SemiBold',Helvetica] transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"}`}>
            {opt}
          </button>
        );
      })}
    </div>
    {hint && <FieldHint>{hint}</FieldHint>}
  </div>
);

const RadioGroup = ({ label, options, value, onChange, cols = 2, hint }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void; cols?: number; hint?: string;
}) => (
  <div className="flex flex-col gap-2">
    <SmallLabel>{label}</SmallLabel>
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map((opt) => {
        const sel = value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt)}
            className={`flex items-center justify-between px-3 py-2.5 rounded-2xl border text-sm [font-family:'Gilroy-SemiBold',Helvetica] transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"}`}>
            <span className="text-left text-xs">{opt}</span>
            <RadioDot selected={sel} />
          </button>
        );
      })}
    </div>
    {hint && <FieldHint>{hint}</FieldHint>}
  </div>
);

function toExecModeLabel(apiMode: string | undefined): string {
  switch ((apiMode ?? "").toLowerCase().replace(/\s/g, "_")) {
    case "automatic": return "Automatic"; case "supervised": return "Supervised"; case "manual_approval": return "Manual Approval"; default: return "Automatic";
  }
}
function capitalize(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ─────────────────────── MAIN COMPONENT ─────────────────────── */
export const CreateAgentModal = ({ open, onClose, onViewMyAgents, initialStep = 0, prefill, agentId }: Props): JSX.Element | null => {
  const isEditMode = !!prefill && !!agentId;
  const [step, setStep] = useState(initialStep);

  /* Identity */
  const [selectedType, setSelectedType]     = useState("");
  const [agentName, setAgentName]           = useState("");
  const [agentDesc, setAgentDesc]           = useState("");
  const [agentWebsite, setAgentWebsite]     = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");

  /* Capital & risk */
  const [capital, setCapital]         = useState("");
  const [capitalAsset, setCapitalAsset] = useState("USDC");
  const [riskLevel, setRiskLevel]     = useState("Moderate");
  const [maxDrawdown, setMaxDrawdown] = useState("20");
  const [stopLoss, setStopLoss]       = useState("10");
  const [executionMode, setExecutionMode] = useState("Automatic");

  /* Authorization */
  const [authSig, setAuthSig] = useState(false);
  const [terms, setTerms]     = useState(false);

  /* Launch state */
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched]   = useState(false);

  /* ── Trading-specific (schema: §1) ── */
  const [tradingStrategy, setTradingStrategy] = useState("perpetual_long_short");
  const [maxPositionSizeUsdc, setMaxPositionSizeUsdc] = useState("10,000");
  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState("5");
  const [allowedMarkets, setAllowedMarkets]   = useState<string[]>(["BTC-USDC", "ETH-USDC"]);
  const [cooldownWindow, setCooldownWindow]   = useState("1h");
  const [maxSlippageBps, setMaxSlippageBps]   = useState("50");
  const [maxLeverage, setMaxLeverage]         = useState("3");
  const [orderTypes, setOrderTypes]           = useState<string[]>(["market", "limit"]);

  /* ── Lending-specific (schema: §2) ── */
  const [lendingProtocol, setLendingProtocol] = useState("aave");
  const [maxSupplyUsd, setMaxSupplyUsd]         = useState("50,000");
  const [allowedCollateral, setAllowedCollateral] = useState<string[]>(["ETH", "WBTC", "stETH"]);
  const [allowedBorrow, setAllowedBorrow]       = useState<string[]>(["USDC", "DAI"]);
  const [maxLtvPercent, setMaxLtvPercent]       = useState("70");
  const [targetLtvPercent, setTargetLtvPercent] = useState("55");
  const [minApyTargetPercent, setMinApyTargetPercent] = useState("4");

  /* ── Yield-specific (schema: §3) ── */
  const [yieldStrategy, setYieldStrategy]       = useState("stable_farming");
  const [minApyPercent, setMinApyPercent]       = useState("4");
  const [targetApyPercent, setTargetApyPercent] = useState("8");
  const [exitApyBelow, setExitApyBelow]         = useState("3");
  const [ilTolerance, setIlTolerance]           = useState("5");
  const [yieldMaxPositionSize, setYieldMaxPositionSize] = useState("25,000");
  const [yieldRebalanceFreq, setYieldRebalanceFreq] = useState("24h");
  const [yieldProtocols, setYieldProtocols]     = useState<string[]>(["Aave", "Curve"]);

  /* ── Payments-specific (schema: §4) ── */
  const [paymentType, setPaymentType]           = useState("recurring_bills");
  const [perTxLimitUsdc, setPerTxLimitUsdc]     = useState("500");
  const [dailySpendBudget, setDailySpendBudget] = useState("2,000");
  const [dailyTxCountLimit, setDailyTxCountLimit] = useState("10");
  const [requireApprovalAbove, setRequireApprovalAbove] = useState("1,000");
  const [executionWindow, setExecutionWindow]   = useState("24/7");
  const [acceptX402, setAcceptX402]             = useState(false);
  const [x402MaxPerRequest, setX402MaxPerRequest] = useState("50");

  /* ── Analytics-specific (schema: §5) ── */
  const [trackedAgents, setTrackedAgents]       = useState("all");
  const [alertCondition, setAlertCondition]     = useState("portfolio_loss_pct");
  const [alertThreshold, setAlertThreshold]     = useState("5");
  const [reportFrequency, setReportFrequency]   = useState("daily");
  const [allowAutoExecute, setAllowAutoExecute] = useState(false);
  const [executionLimitUsdc, setExecutionLimitUsdc] = useState("1,000");

  /* ── Custom-specific (schema: §6) ── */
  const [objective, setObjective]             = useState("");
  const [complexityLevel, setComplexityLevel] = useState("moderate");
  const [allowedTools, setAllowedTools]       = useState<string[]>(["execute_custom_action", "call_external_api"]);
  const [forbiddenTools, setForbiddenTools]   = useState<string[]>([]);
  const [primaryLimitUsdc, setPrimaryLimitUsdc] = useState("5,000");
  const [maxOpsPerHour, setMaxOpsPerHour]       = useState("10");
  const [circuitBreakerLoss, setCircuitBreakerLoss] = useState("10");
  const [webhookURL, setWebhookURL]           = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  /* ── Derived policy params for hash ── */
  const policyParams = useMemo<Record<string, unknown>>(() => {
    if (selectedType === "trading")   return { strategy: tradingStrategy, max_position_size_usdc: parseNumber(maxPositionSizeUsdc), max_daily_loss_pct: parseInt(maxDailyLossPercent), allowed_markets: allowedMarkets, cooldown_window: cooldownWindow, max_slippage_bps: parseInt(maxSlippageBps), max_leverage: parseInt(maxLeverage), order_types: orderTypes };
    if (selectedType === "lending")   return { protocol: lendingProtocol, max_supply_usd: parseNumber(maxSupplyUsd), allowed_collateral: allowedCollateral, allowed_borrow: allowedBorrow, max_ltv_pct: parseInt(maxLtvPercent), target_ltv_pct: parseInt(targetLtvPercent), min_apy_target_pct: parseInt(minApyTargetPercent) };
    if (selectedType === "yield")     return { strategy: yieldStrategy, min_apy_pct: parseInt(minApyPercent), target_apy_pct: parseInt(targetApyPercent), exit_if_apy_below: parseInt(exitApyBelow), il_tolerance_pct: parseInt(ilTolerance), max_position_size_usdc: parseNumber(yieldMaxPositionSize), rebalance_freq: yieldRebalanceFreq, protocols: yieldProtocols };
    if (selectedType === "payments")  return { payment_type: paymentType, per_tx_limit_usdc: parseNumber(perTxLimitUsdc), daily_spend_budget_usdc: parseNumber(dailySpendBudget), daily_tx_count_limit: parseInt(dailyTxCountLimit), require_approval_above_usdc: parseNumber(requireApprovalAbove), execution_window: executionWindow, accept_x402: acceptX402, x402_max_per_request_usdc: parseNumber(x402MaxPerRequest) };
    if (selectedType === "analytics") return { tracked_agents: trackedAgents, alert_condition: alertCondition, alert_threshold_pct: parseFloat(alertThreshold), report_frequency: reportFrequency, allow_auto_execute: allowAutoExecute, execution_limit_usdc: parseNumber(executionLimitUsdc) };
    if (selectedType === "custom")    return { objective: objective.slice(0, 100), complexity: complexityLevel, allowed_tools: allowedTools, forbidden_tools: forbiddenTools, primary_limit_usdc: parseNumber(primaryLimitUsdc), max_ops_per_hour: parseInt(maxOpsPerHour), circuit_breaker_loss_pct: parseInt(circuitBreakerLoss) };
    return {};
  }, [selectedType, tradingStrategy, maxPositionSizeUsdc, maxDailyLossPercent, allowedMarkets, cooldownWindow, maxSlippageBps, maxLeverage, orderTypes, lendingProtocol, maxSupplyUsd, allowedCollateral, allowedBorrow, maxLtvPercent, targetLtvPercent, minApyTargetPercent, yieldStrategy, minApyPercent, targetApyPercent, exitApyBelow, ilTolerance, yieldMaxPositionSize, yieldRebalanceFreq, yieldProtocols, paymentType, perTxLimitUsdc, dailySpendBudget, dailyTxCountLimit, requireApprovalAbove, executionWindow, acceptX402, x402MaxPerRequest, trackedAgents, alertCondition, alertThreshold, reportFrequency, allowAutoExecute, executionLimitUsdc, objective, complexityLevel, allowedTools, forbiddenTools, primaryLimitUsdc, maxOpsPerHour, circuitBreakerLoss]);

  const policyHash = useMemo(() => {
    if (!selectedType) return "";
    return computePolicyHash(selectedType, policyParams);
  }, [selectedType, policyParams]);

  /* ── Reset when modal opens ── */
  useEffect(() => {
    if (!open) return;
    setStep(initialStep ?? 0);
    setLaunched(false); setLaunching(false); setAuthSig(false); setTerms(false);
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
    if (prefill.maxLTV)              setMaxLtvPercent(prefill.maxLTV);
    if (prefill.targetAPY)           setTargetApyPercent(prefill.targetAPY);
    if (prefill.minAPY)              setMinApyPercent(prefill.minAPY);
    if (prefill.rebalanceFreq)       setYieldRebalanceFreq(prefill.rebalanceFreq);
    if (prefill.yieldProtocols?.length) setYieldProtocols(prefill.yieldProtocols);
    if (prefill.maxSinglePayment)    setPerTxLimitUsdc(prefill.maxSinglePayment);
    if (prefill.monthlyBudgetCap)    setDailySpendBudget(prefill.monthlyBudgetCap);
    if (prefill.autoApprovalThreshold) setRequireApprovalAbove(prefill.autoApprovalThreshold);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capitalNum = parseNumber(capital);
  const balanceError = capitalNum > 0 && capitalNum > AVAILABLE_BALANCE;
  const autoTicker = agentName ? "$" + agentName.toUpperCase().replace(/\s/g, "").slice(0, 8) : "";

  /* ── Create / Update mutations ── */
  const createAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agents", {
        name: agentName, type: selectedType, ticker: autoTicker,
        description: agentDesc, website: agentWebsite || undefined,
        avatar: selectedAvatar || "/figmaAssets/avatars.svg",
        capitalAmount: capitalNum, capitalAsset,
        riskLevel: riskLevel.toLowerCase(),
        maxDrawdown: parseInt(maxDrawdown), stopLoss: parseInt(stopLoss),
        executionMode: executionMode.toLowerCase().replace(" ", "_"),
        allowedAssets: selectedType === "trading" ? allowedMarkets : selectedType === "lending" ? allowedCollateral : ["ETH", "USDC"],
        maxAllocationPct: 80, maxPositionPct: 25, maxTradesPerDay: 10,
        status: "active", createdByUser: true,
        policyHash,
        typeConfig: policyParams,
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents"] }); setLaunching(false); setLaunched(true); },
    onError:   () => { setLaunching(false); setLaunched(true); },
  });

  const updateAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/agents/${agentId}`, {
        name: agentName, type: selectedType, description: agentDesc,
        avatar: selectedAvatar || "/figmaAssets/avatars.svg",
        capitalAmount: capitalNum, capitalAsset,
        riskLevel: riskLevel.toLowerCase(),
        maxDrawdown: parseInt(maxDrawdown), stopLoss: parseInt(stopLoss),
        executionMode: executionMode.toLowerCase().replace(" ", "_"),
        policyHash, typeConfig: policyParams,
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents"] }); qc.invalidateQueries({ queryKey: ["/api/agents", agentId] }); setLaunching(false); setLaunched(true); },
    onError:   () => { setLaunching(false); setLaunched(true); },
  });

  if (!open) return null;

  const canProceed = () => {
    if (step === 0) return !!selectedType;
    if (step === 1) return !!agentName;
    if (step === 3) return !!capital && !balanceError;
    if (step === 5) return isEditMode || (authSig && terms);
    return true;
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(0); setSelectedType(""); setAgentName(""); setAgentDesc(""); setAgentWebsite("");
      setSelectedAvatar(""); setCapital(""); setRiskLevel("Moderate");
      setAuthSig(false); setTerms(false); setLaunched(false); setLaunching(false);
      setCapitalAsset("USDC"); setMaxDrawdown("20"); setStopLoss("10"); setExecutionMode("Automatic");
    }, 300);
  };

  const handleLaunch = () => {
    setLaunching(true);
    if (isEditMode) updateAgentMutation.mutate(); else createAgentMutation.mutate();
  };

  const inputCls = "px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-60 outline-none focus:border-[#414965] transition-colors w-full";
  const toggleAllowed = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  /* ── Type-specific configuration content (Step 2) ── */
  const ConfigurationStep = () => {
    if (selectedType === "trading") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure your trading agent per the PolicyEngine schema.</p>

        <RadioGroup label="Strategy Type" options={["perpetual_long_short", "grid_trading", "yield_farming_arb", "index_tracking", "custom"]} value={tradingStrategy} onChange={setTradingStrategy} cols={2} hint="Defines the execution logic and Claude ReAct loop objective" />

        <div className="flex flex-col gap-1.5">
          <SmallLabel>Max Position Size (USDC)</SmallLabel>
          <div className="flex items-center gap-2 px-4 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
            <span className="text-brain-v1baby-blue-60 [font-family:'JetBrains_Mono',Helvetica]">$</span>
            <input value={maxPositionSizeUsdc} onChange={(e) => setMaxPositionSizeUsdc(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="10,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
          </div>
          <FieldHint>uint256 in USDC — e.g. 10 000 USDC = 10000</FieldHint>
        </div>

        <SliderRow label="Max Daily Loss" value={maxDailyLossPercent} min={1} max={30} unit="%" onChange={setMaxDailyLossPercent} hint="Agent pauses if cumulative daily loss exceeds this threshold" />
        <SliderRow label="Max Slippage (bps)" value={maxSlippageBps} min={1} max={500} onChange={setMaxSlippageBps} hint="1 bps = 0.01% · e.g. 50 bps = 0.5% slippage" />
        <SliderRow label="Max Leverage" value={maxLeverage} min={1} max={20} onChange={setMaxLeverage} hint="Max position leverage allowed by policy (1 = spot only)" />

        <MultiSelect label="Allowed Markets" options={["BTC-USDC", "ETH-USDC", "SOL-USDC", "ARB-USDC", "OP-USDC", "AVAX-USDC", "MATIC-USDC", "BNB-USDC"]} selected={allowedMarkets} onToggle={(v) => toggleAllowed(allowedMarkets, setAllowedMarkets, v)} hint="Only these pairs can be traded — enforced on-chain" />
        <MultiSelect label="Order Types" options={["market", "limit", "stop_limit", "take_profit"]} selected={orderTypes} onToggle={(v) => toggleAllowed(orderTypes, setOrderTypes, v)} />
        <RadioGroup label="Cooldown Window" options={["1h", "4h", "8h", "24h"]} value={cooldownWindow} onChange={setCooldownWindow} cols={4} hint="Minimum time between consecutive trades" />
      </div>
    );

    if (selectedType === "lending") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure lending policy — LTV constraints enforced at every borrow.</p>
        <RadioGroup label="Protocol" options={["aave", "compound", "morpho", "custom_contract"]} value={lendingProtocol} onChange={setLendingProtocol} cols={2} />

        <div className="flex flex-col gap-1.5">
          <SmallLabel>Max Supply (USD)</SmallLabel>
          <div className="flex items-center gap-2 px-4 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
            <span className="text-brain-v1baby-blue-60 [font-family:'JetBrains_Mono',Helvetica]">$</span>
            <input value={maxSupplyUsd} onChange={(e) => setMaxSupplyUsd(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="50,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
          </div>
          <FieldHint>Maximum total capital supplied to this lending protocol</FieldHint>
        </div>

        <MultiSelect label="Allowed Collateral Assets" options={["ETH", "WBTC", "stETH", "cbETH", "rETH", "USDC", "DAI"]} selected={allowedCollateral} onToggle={(v) => toggleAllowed(allowedCollateral, setAllowedCollateral, v)} hint="Only these assets can be posted as collateral" />
        <MultiSelect label="Allowed Borrow Assets" options={["USDC", "DAI", "USDT", "ETH", "WBTC"]} selected={allowedBorrow} onToggle={(v) => toggleAllowed(allowedBorrow, setAllowedBorrow, v)} hint="Only these assets can be borrowed" />

        <SliderRow label="Max LTV %" value={maxLtvPercent} min={10} max={85} unit="%" onChange={setMaxLtvPercent} hint="Loan-to-value ceiling — borrow is rejected above this" />
        <SliderRow label="Target LTV %" value={targetLtvPercent} min={10} max={80} unit="%" onChange={setTargetLtvPercent} hint="Rebalance triggers when actual LTV deviates from this" color="#42bf23" />
        <SliderRow label="Min APY Target %" value={minApyTargetPercent} min={1} max={20} unit="%" onChange={setMinApyTargetPercent} hint="Supply APY must exceed this to enter a new position" color="#42bf23" />
      </div>
    );

    if (selectedType === "yield") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure yield optimization — APY floors enforced via oracle gates.</p>
        <RadioGroup label="Strategy Type" options={["stable_farming", "lp_on_dex", "perpetual_funding", "curve_convex", "custom"]} value={yieldStrategy} onChange={setYieldStrategy} cols={2} />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Target APY %</SmallLabel>
            <input value={targetApyPercent} onChange={(e) => setTargetApyPercent(e.target.value)} type="number" min="1" max="100" placeholder="8" className={inputCls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Min APY %</SmallLabel>
            <input value={minApyPercent} onChange={(e) => setMinApyPercent(e.target.value)} type="number" min="1" max="50" placeholder="4" className={inputCls} />
          </div>
        </div>
        <FieldHint>Agent exits position if APY falls below {exitApyBelow}%</FieldHint>

        <SliderRow label="Exit if APY below %" value={exitApyBelow} min={1} max={20} unit="%" onChange={setExitApyBelow} color="#42bf23" />
        <SliderRow label="IL Tolerance %" value={ilTolerance} min={0} max={30} unit="%" onChange={setIlTolerance} hint="Max acceptable impermanent loss before exiting LP" />
        <SliderRow label="Max Slippage (bps)" value={maxSlippageBps} min={1} max={300} onChange={setMaxSlippageBps} />

        <div className="flex flex-col gap-1.5">
          <SmallLabel>Max Position Size (USDC)</SmallLabel>
          <div className="flex items-center gap-2 px-4 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
            <span className="text-brain-v1baby-blue-60 [font-family:'JetBrains_Mono',Helvetica]">$</span>
            <input value={yieldMaxPositionSize} onChange={(e) => setYieldMaxPositionSize(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="25,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
          </div>
        </div>

        <RadioGroup label="Rebalance Frequency" options={["6h", "12h", "24h", "48h", "weekly"]} value={yieldRebalanceFreq} onChange={setYieldRebalanceFreq} cols={5} />
        <MultiSelect label="Protocol Whitelist" options={["Aave", "Compound", "Curve", "Convex", "Yearn", "Pendle", "Lido"]} selected={yieldProtocols} onToggle={(v) => toggleAllowed(yieldProtocols, setYieldProtocols, v)} />
      </div>
    );

    if (selectedType === "payments") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Configure payment policy — recipient allowlists enforced at smart contract level.</p>
        <RadioGroup label="Payment Type" options={["recurring_bills", "direct_transfers", "batch_payroll", "subscription_manager", "custom"]} value={paymentType} onChange={setPaymentType} cols={2} />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Per-transaction Limit (USD)</SmallLabel>
            <div className="flex items-center gap-2 px-3 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
              <span className="text-brain-v1baby-blue-60 text-xs [font-family:'JetBrains_Mono',Helvetica]">$</span>
              <input value={perTxLimitUsdc} onChange={(e) => setPerTxLimitUsdc(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="500" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Daily Spend Budget (USD)</SmallLabel>
            <div className="flex items-center gap-2 px-3 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
              <span className="text-brain-v1baby-blue-60 text-xs [font-family:'JetBrains_Mono',Helvetica]">$</span>
              <input value={dailySpendBudget} onChange={(e) => setDailySpendBudget(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="2,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Daily Tx Count Limit</SmallLabel>
            <input value={dailyTxCountLimit} onChange={(e) => setDailyTxCountLimit(e.target.value)} type="number" min="1" placeholder="10" className={inputCls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Require Approval Above (USD)</SmallLabel>
            <div className="flex items-center gap-2 px-3 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
              <span className="text-brain-v1baby-blue-60 text-xs [font-family:'JetBrains_Mono',Helvetica]">$</span>
              <input value={requireApprovalAbove} onChange={(e) => setRequireApprovalAbove(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="1,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
            </div>
          </div>
        </div>

        <RadioGroup label="Execution Window" options={["24/7", "Business hours", "Custom"]} value={executionWindow} onChange={setExecutionWindow} cols={3} />

        <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm [font-family:'Gilroy-SemiBold',Helvetica] text-white">x402 Payments</p>
              <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Accept machine-to-machine x402 payment requests</p>
            </div>
            <button onClick={() => setAcceptX402(!acceptX402)} className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${acceptX402 ? "bg-brain-v1dark-orange" : "bg-[#222737]"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${acceptX402 ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
            </button>
          </div>
          {acceptX402 && (
            <div className="flex flex-col gap-1.5">
              <SmallLabel>x402 Max Per Request (USD)</SmallLabel>
              <div className="flex items-center gap-2 px-3 h-10 bg-[#0d1017] border border-[#1d2131] rounded-xl focus-within:border-[#414965]">
                <span className="text-brain-v1baby-blue-60 text-xs [font-family:'JetBrains_Mono',Helvetica]">$</span>
                <input value={x402MaxPerRequest} onChange={(e) => setX402MaxPerRequest(e.target.value)} placeholder="50" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
              </div>
            </div>
          )}
        </div>
      </div>
    );

    if (selectedType === "analytics") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Analytics agents are read-only by default. Auto-execute adds a spend policy.</p>
        <RadioGroup label="Tracked Agents" options={["all", "selected"]} value={trackedAgents} onChange={setTrackedAgents} cols={2} hint="'all' monitors every agent in your account" />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Alert Condition</SmallLabel>
            <select value={alertCondition} onChange={(e) => setAlertCondition(e.target.value)} className={`${inputCls} cursor-pointer`}>
              {["portfolio_loss_pct", "agent_inactive", "position_liquidation_risk", "apy_drop", "anomalous_spend", "custom"].map((c) => (
                <option key={c} value={c} className="bg-[#0d1017]">{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Alert Threshold</SmallLabel>
            <input value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)} type="number" placeholder="5" className={inputCls} />
          </div>
        </div>

        <RadioGroup label="Report Frequency" options={["hourly", "daily", "weekly", "on_alert"]} value={reportFrequency} onChange={setReportFrequency} cols={4} />

        <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm [font-family:'Gilroy-SemiBold',Helvetica] text-white">Allow Auto-Execute</p>
              <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Let agent act on alerts (e.g. rebalance, pause). Adds spend policy.</p>
            </div>
            <button onClick={() => setAllowAutoExecute(!allowAutoExecute)} className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${allowAutoExecute ? "bg-brain-v1dark-orange" : "bg-[#222737]"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${allowAutoExecute ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
            </button>
          </div>
          {allowAutoExecute && (
            <div className="flex flex-col gap-1.5">
              <SmallLabel>Execution Limit (USD)</SmallLabel>
              <div className="flex items-center gap-2 px-3 h-10 bg-[#0d1017] border border-[#1d2131] rounded-xl focus-within:border-[#414965]">
                <span className="text-brain-v1baby-blue-60 text-xs [font-family:'JetBrains_Mono',Helvetica]">$</span>
                <input value={executionLimitUsdc} onChange={(e) => setExecutionLimitUsdc(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="1,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
              </div>
            </div>
          )}
        </div>
      </div>
    );

    if (selectedType === "custom") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Define your agent's objective and execution boundaries.</p>

        <div className="flex flex-col gap-1.5">
          <SmallLabel>Objective *</SmallLabel>
          <textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Describe exactly what your agent should do — its goals, constraints, and decision logic. Be specific about trigger conditions and success criteria." rows={4} className={`${inputCls} resize-none`} />
          <FieldHint>{objective.length}/256 chars — this becomes the Claude system prompt objective</FieldHint>
        </div>

        <RadioGroup label="Complexity Level" options={["simple", "moderate", "complex", "experimental"]} value={complexityLevel} onChange={setComplexityLevel} cols={4} hint="Affects ReAct loop depth and max tool invocations" />
        <MultiSelect label="Allowed Tools" options={["execute_custom_action", "call_external_api", "store_observation", "send_payment", "get_portfolio_snapshot"]} selected={allowedTools} onToggle={(v) => toggleAllowed(allowedTools, setAllowedTools, v)} hint="Only these tools can be called by the agent" />
        <MultiSelect label="Forbidden Tools" options={["execute_trade", "supply_collateral", "batch_payroll"]} selected={forbiddenTools} onToggle={(v) => toggleAllowed(forbiddenTools, setForbiddenTools, v)} hint="Blacklisted — agent cannot call these even if hallucinated" />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Primary Limit (USD)</SmallLabel>
            <div className="flex items-center gap-2 px-3 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965]">
              <span className="text-brain-v1baby-blue-60 text-xs [font-family:'JetBrains_Mono',Helvetica]">$</span>
              <input value={primaryLimitUsdc} onChange={(e) => setPrimaryLimitUsdc(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="5,000" className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <SmallLabel>Max Ops / Hour</SmallLabel>
            <input value={maxOpsPerHour} onChange={(e) => setMaxOpsPerHour(e.target.value)} type="number" min="1" max="100" placeholder="10" className={inputCls} />
          </div>
        </div>

        <SliderRow label="Circuit Breaker Loss %" value={circuitBreakerLoss} min={1} max={50} unit="%" onChange={setCircuitBreakerLoss} hint="Agent pauses if cumulative P&L loss exceeds this threshold" />

        <div className="flex flex-col gap-1.5">
          <SmallLabel>Webhook Endpoint (optional)</SmallLabel>
          <input value={webhookURL} onChange={(e) => setWebhookURL(e.target.value)} placeholder="https://api.example.com/agent-trigger" type="url" className={inputCls} />
          <FieldHint>Agent will POST observations and action results here</FieldHint>
        </div>
      </div>
    );

    return null;
  };

  /* ── Enforcement stack (Step 4) ── */
  const EnforcementStack = () => {
    const tiers = [
      {
        num: "1", label: "PolicyEngine", sublabel: "Control Plane", color: "#ff9500", bg: "#2a1500", border: "#4a2500",
        checks: ENFORCEMENT[selectedType] ?? [],
        desc: "Off-chain validation before any UserOperation is submitted.",
      },
      {
        num: "2", label: "PolicyValidator", sublabel: "On-Chain", color: "#a8b9f4", bg: "#111827", border: "#1d2131",
        checks: ["Cryptographic proof verification (keccak256)", "Replay prevention via nonce + expiry", "Oracle-gated checks (APY, LTV, price)", "ERC-8004 audit trail recording"],
        desc: "Solidity contract verifies every proof before execution.",
      },
      {
        num: "3", label: "Crossmint Agent Wallet", sublabel: "Smart Contract", color: "#9d5cf5", bg: "#1a0d2e", border: "#2d1a4a",
        checks: ["Hard spend cap enforcement", "Recipient allowlist at contract level", "Reentrancy guard on all operations", "Agent revocation at any time"],
        desc: "ERC-4337 smart account guardrails — cannot be bypassed.",
      },
    ];
    return (
      <div className="flex flex-col gap-4">
        {tiers.map((tier) => (
          <div key={tier.num} className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: tier.bg, borderColor: tier.border }}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs [font-family:'JetBrains_Mono',Helvetica] font-bold" style={{ background: tier.color + "22", color: tier.color }}>{tier.num}</div>
              <div className="flex-1">
                <p className="text-sm [font-family:'Gilroy-SemiBold',Helvetica]" style={{ color: tier.color }}>{tier.label}</p>
                <p className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{tier.sublabel} · {tier.desc}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 pl-10">
              {tier.checks.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: tier.color + "88" }} />
                  <span className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{c}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ── Policy hash section ── */
  const PolicyHashSection = () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SmallLabel>Policy Hash (keccak256)</SmallLabel>
        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">deterministic · same inputs → same hash</span>
      </div>
      <div className="p-3 bg-[#06070a] rounded-2xl border border-[#1d2131] flex items-center gap-2">
        <svg className="flex-shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="2" stroke="#414965" strokeWidth="1.2" /><path d="M5 3V2a2 2 0 0 1 4 0v1" stroke="#414965" strokeWidth="1.2" strokeLinecap="round" /></svg>
        <code className="text-[10px] text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica] break-all flex-1 leading-relaxed">{policyHash || "—"}</code>
        <button onClick={() => navigator.clipboard.writeText(policyHash)} title="Copy hash"
          className="text-[10px] text-brain-v1baby-blue-60 hover:text-white transition-colors px-2 py-1 rounded-lg border border-[#1d2131] hover:border-[#414965] flex-shrink-0 [font-family:'Gilroy-SemiBold',Helvetica]">
          Copy
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
          <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider mb-1">Policy Nonce</p>
          <p className="text-sm [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60">0</p>
        </div>
        <div className="p-3 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
          <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider mb-1">Proof Expiry</p>
          <p className="text-sm [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60">10 min</p>
        </div>
      </div>
    </div>
  );

  /* ── Tool schema section ── */
  const ToolSchemaSection = () => {
    const [selectedTool, setSelectedTool] = useState(0);
    const tools = TOOL_SCHEMAS[selectedType] ?? [];
    const tool = tools[selectedTool];
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 p-1 bg-[#06070a] rounded-xl overflow-x-auto">
          {tools.map((t: any, i) => (
            <button key={i} onClick={() => setSelectedTool(i)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors whitespace-nowrap ${selectedTool === i ? "bg-[#1d2131] text-white" : "text-brain-v1baby-blue-30 hover:text-white"}`}>
              {(t as any).name}
            </button>
          ))}
        </div>
        {tool && (
          <div className="relative">
            <div className="p-4 bg-[#06070a] rounded-2xl border border-[#1d2131] overflow-x-auto">
              <pre className="text-[10px] [font-family:'JetBrains_Mono',Helvetica] text-[#a8b9f4] whitespace-pre-wrap leading-relaxed">{JSON.stringify(tool, null, 2)}</pre>
            </div>
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(tool, null, 2))}
              className="absolute top-3 right-3 text-[10px] text-brain-v1baby-blue-60 hover:text-white px-2 py-1 rounded-lg border border-[#1d2131] hover:border-[#414965] [font-family:'Gilroy-SemiBold',Helvetica] bg-[#0d1017]">
              Copy
            </button>
          </div>
        )}
        <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">These tools are available to the Claude ReAct loop for this agent type. The agent can only call tools matching its policy whitelist.</p>
      </div>
    );
  };

  /* ── Review rows per type ── */
  const typeReviewRows: { label: string; value: string }[] =
    selectedType === "trading" ? [
      { label: "Strategy",             value: tradingStrategy },
      { label: "Max Position (USDC)", value: `$${maxPositionSizeUsdc}` },
      { label: "Max Daily Loss",       value: `${maxDailyLossPercent}%` },
      { label: "Max Slippage",         value: `${maxSlippageBps} bps` },
      { label: "Max Leverage",         value: `${maxLeverage}×` },
      { label: "Allowed Markets",      value: allowedMarkets.join(", ") || "None" },
      { label: "Order Types",          value: orderTypes.join(", ") || "None" },
      { label: "Cooldown Window",      value: cooldownWindow },
    ] : selectedType === "lending" ? [
      { label: "Protocol",        value: lendingProtocol },
      { label: "Max Supply",      value: `$${maxSupplyUsd}` },
      { label: "Collateral",      value: allowedCollateral.join(", ") || "None" },
      { label: "Borrow Assets",   value: allowedBorrow.join(", ") || "None" },
      { label: "Max LTV",         value: `${maxLtvPercent}%` },
      { label: "Target LTV",      value: `${targetLtvPercent}%` },
      { label: "Min APY Target",  value: `${minApyTargetPercent}%` },
    ] : selectedType === "yield" ? [
      { label: "Strategy",          value: yieldStrategy },
      { label: "Target APY",        value: `${targetApyPercent}%` },
      { label: "Min APY",           value: `${minApyPercent}%` },
      { label: "Exit if APY below", value: `${exitApyBelow}%` },
      { label: "IL Tolerance",      value: `${ilTolerance}%` },
      { label: "Max Position",      value: `$${yieldMaxPositionSize}` },
      { label: "Rebalance Freq",    value: yieldRebalanceFreq },
      { label: "Protocols",         value: yieldProtocols.join(", ") || "None" },
    ] : selectedType === "payments" ? [
      { label: "Payment Type",      value: paymentType },
      { label: "Per-tx Limit",      value: `$${perTxLimitUsdc}` },
      { label: "Daily Budget",      value: `$${dailySpendBudget}` },
      { label: "Daily Tx Limit",    value: dailyTxCountLimit },
      { label: "Approval Above",    value: `$${requireApprovalAbove}` },
      { label: "Execution Window",  value: executionWindow },
      { label: "x402 Payments",     value: acceptX402 ? `Yes (max $${x402MaxPerRequest})` : "No" },
    ] : selectedType === "analytics" ? [
      { label: "Tracked Agents",    value: trackedAgents },
      { label: "Alert Condition",   value: alertCondition },
      { label: "Alert Threshold",   value: alertThreshold },
      { label: "Report Frequency",  value: reportFrequency },
      { label: "Auto-Execute",      value: allowAutoExecute ? `Yes (limit $${executionLimitUsdc})` : "No" },
    ] : selectedType === "custom" ? [
      { label: "Complexity",        value: complexityLevel },
      { label: "Allowed Tools",     value: allowedTools.join(", ") || "None" },
      { label: "Forbidden Tools",   value: forbiddenTools.join(", ") || "None" },
      { label: "Primary Limit",     value: `$${primaryLimitUsdc}` },
      { label: "Max Ops/Hour",      value: maxOpsPerHour },
      { label: "Circuit Breaker",   value: `${circuitBreakerLoss}% loss` },
    ] : [];

  const RowBlock = ({ rows }: { rows: { label: string; value: string }[] }) => (
    <div className="bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] overflow-hidden">
      {rows.map(({ label, value }, i) => (
        <div key={label} className={`flex justify-between items-center px-4 py-2.5 ${i < rows.length - 1 ? "border-b border-[#1d2131]" : ""}`}>
          <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">{label}</span>
          <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs max-w-[55%] text-right truncate">{value}</span>
        </div>
      ))}
    </div>
  );
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest px-1">{children}</p>
  );

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-[560px] max-h-[90vh] flex flex-col bg-[#0d1017] border border-[#1d2131] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* ── SUCCESS SCREEN ── */}
        {launched && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d1017] gap-5 px-8 overflow-y-auto py-8">
            <div className="w-20 h-20 rounded-full bg-brain-v1dark-orange/20 border border-brain-v1dark-orange/30 flex items-center justify-center flex-shrink-0">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18 6L22 14L31 15.5L24.5 22L26 31L18 27L10 31L11.5 22L5 15.5L14 14L18 6Z" fill="#ff9500" fillOpacity="0.15" stroke="#ff9500" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </div>
            <div className="text-center">
              <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-2xl">{isEditMode ? "Changes saved!" : `${agentName || "Agent"} is live!`}</h3>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">Your AI agent is deployed and ready to operate.</p>
            </div>
            <div className="w-full flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
              {selectedAvatar ? <img src={selectedAvatar} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" /> : (
                <div className="w-10 h-10 rounded-xl bg-brain-v1dark-orange/20 flex items-center justify-center flex-shrink-0 text-lg">{agentTypes.find((t) => t.id === selectedType)?.icon ?? "🤖"}</div>
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
            <div className="w-full bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1d2131] flex justify-between items-center">
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Capital</span>
                <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60">{capital ? `$${capital} ${capitalAsset}` : "—"}</span>
              </div>
              <div className="px-4 py-2.5 border-b border-[#1d2131] flex justify-between items-center">
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Execution Mode</span>
                <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60">{executionMode}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center">
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Policy Hash</span>
                <code className="text-[10px] [font-family:'JetBrains_Mono',Helvetica] text-[#42bf23]">{policyHash.slice(0, 18)}…</code>
              </div>
            </div>
            <button onClick={() => { onViewMyAgents ? onViewMyAgents() : handleClose(); }}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity flex-shrink-0">
              View in My Agents →
            </button>
          </div>
        )}

        {/* ── HEADER ── */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-[#1d2131] flex-shrink-0">
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
              <div key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? "bg-brain-v1green w-5" : "bg-[#1d2131] w-3"}`} />
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
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Choose the primary function of your AI agent. Each type has a distinct enforcement schema.</p>
              <div className="grid grid-cols-2 gap-3">
                {agentTypes.map((t) => {
                  const sel = selectedType === t.id;
                  return (
                    <button key={t.id} onClick={() => setSelectedType(t.id)}
                      className={`flex flex-col gap-2 p-4 rounded-2xl border text-left transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{t.icon}</span>
                        <RadioDot selected={sel} />
                      </div>
                      <div>
                        <div className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm ${sel ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>{t.label}</div>
                        <div className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5 leading-relaxed">{t.desc}</div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1 h-1 rounded-full bg-brain-v1baby-blue-30 flex-shrink-0" />
                        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{t.use}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 1 — Identity */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <SmallLabel>Agent Avatar</SmallLabel>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-[#1d2131] flex items-center justify-center bg-brain-v1baby-blue-15 cursor-pointer hover:border-[#414965] transition-colors overflow-hidden flex-shrink-0" onClick={() => fileRef.current?.click()}>
                    {selectedAvatar ? <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" /> : (
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

              <div className="flex flex-col gap-1.5">
                <SmallLabel>Agent Name * <span className="normal-case">(max 64 chars)</span></SmallLabel>
                <input value={agentName} onChange={(e) => setAgentName(e.target.value.slice(0, 64))} placeholder={`e.g. My ${agentTypes.find(t => t.id === selectedType)?.label ?? ""} Agent`} className={inputCls} />
                <FieldHint>Auto-ticker: {agentName ? `$${agentName.toUpperCase().replace(/\s/g, "").slice(0, 8)}` : "—"}</FieldHint>
              </div>

              <div className="flex flex-col gap-1.5">
                <SmallLabel>Description <span className="normal-case">(max 256 chars)</span></SmallLabel>
                <textarea value={agentDesc} onChange={(e) => setAgentDesc(e.target.value.slice(0, 256))} placeholder="Describe what your agent does and its objective..." rows={3} className={`${inputCls} resize-none`} />
                <FieldHint>{agentDesc.length}/256</FieldHint>
              </div>

              <div className="flex flex-col gap-1.5">
                <SmallLabel>Website (optional)</SmallLabel>
                <input value={agentWebsite} onChange={(e) => setAgentWebsite(e.target.value)} placeholder="https://yourproject.xyz" type="url" className={inputCls} />
              </div>
            </div>
          )}

          {/* STEP 2 — Type-specific Configuration */}
          {step === 2 && <ConfigurationStep />}

          {/* STEP 3 — Capital & Risk */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Set the capital allocation and global risk parameters applied to every action.</p>

              <div className="flex flex-col gap-1.5">
                <SmallLabel>Capital Allocation *</SmallLabel>
                <div className="flex items-center gap-2">
                  <div className={`flex-1 flex items-center gap-2 px-4 h-14 rounded-2xl focus-within:ring-1 transition-all ${balanceError ? "bg-[#2a0a0a] ring-1 ring-[#d20344] focus-within:ring-[#d20344]" : "bg-[#222737] focus-within:ring-[#414965]"}`}>
                    <span className="text-brain-v1baby-blue-60 text-lg [font-family:'JetBrains_Mono',Helvetica]">$</span>
                    <input value={capital} onChange={(e) => setCapital(formatNumber(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0.00" inputMode="decimal"
                      className={`flex-1 bg-transparent text-xl [font-family:'JetBrains_Mono',Helvetica] outline-none placeholder:text-[#414965] min-w-0 ${balanceError ? "text-[#d20344]" : "text-white"}`} />
                  </div>
                  <select value={capitalAsset} onChange={(e) => setCapitalAsset(e.target.value)} className="px-4 py-3 h-14 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-brain-v1white text-sm [font-family:'Gilroy-SemiBold',Helvetica] outline-none cursor-pointer">
                    {["USDC", "ETH", "BTC", "MATIC", "BNB"].map((a) => <option key={a} value={a} className="bg-[#0d1017]">{a}</option>)}
                  </select>
                </div>
                {balanceError && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#2a0a0a] border border-[#d20344]/30 rounded-xl">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0"><circle cx="7" cy="7" r="6" stroke="#d20344" strokeWidth="1.2"/><path d="M7 4v3.5M7 9.5v.5" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    <p className="text-xs text-[#d20344] [font-family:'Gilroy-Medium',Helvetica]">Exceeds available balance of ${AVAILABLE_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {["1,000", "5,000", "10,000", "50,000"].map((v) => (
                    <button key={v} onClick={() => setCapital(v)} className="flex-1 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-[#414965] transition-colors">${v}</button>
                  ))}
                </div>
              </div>

              <div className={`flex items-center justify-between p-4 rounded-2xl border ${balanceError ? "bg-[#2a0a0a] border-[#d20344]/20" : "bg-brain-v1baby-blue-15 border-[#1d2131]"}`}>
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Available balance</span>
                <span className={`text-sm [font-family:'JetBrains_Mono',Helvetica] ${balanceError ? "text-[#d20344]" : "text-brain-v1green"}`}>${AVAILABLE_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC</span>
              </div>

              <RadioGroup label="Risk Level" options={["Conservative", "Moderate", "Aggressive", "Custom"]} value={riskLevel} onChange={setRiskLevel} cols={2} />
              <SliderRow label="Max Drawdown" value={maxDrawdown} min={1} max={80} unit="%" onChange={setMaxDrawdown} hint="Agent pauses if total portfolio drawdown exceeds this" />
              <SliderRow label="Stop Loss per Trade" value={stopLoss} min={1} max={50} unit="%" onChange={setStopLoss} hint="Hard exit trigger per individual position" />

              <div className="flex flex-col gap-2">
                <SmallLabel>Execution Mode</SmallLabel>
                {[
                  { m: "Automatic", desc: "Agent acts independently within policy limits" },
                  { m: "Supervised", desc: "Agent proposes actions — you review before execution" },
                  { m: "Manual Approval", desc: "Every action requires your explicit on-chain approval" },
                ].map(({ m, desc }) => {
                  const sel = executionMode === m;
                  return (
                    <button key={m} onClick={() => setExecutionMode(m)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel ? "border-brain-v1light-orange" : "border-[#414965]"}`}>
                        {sel && <div className="w-2 h-2 bg-brain-v1light-orange rounded-full" />}
                      </div>
                      <div className="flex-1">
                        <span className={`text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${sel ? "text-brain-v1light-orange" : "text-brain-v1baby-blue-60"}`}>{m}</span>
                        <p className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="bg-brain-v1dark-orange/10 border border-brain-v1dark-orange/20 rounded-2xl p-4">
                <p className="text-xs text-brain-v1light-orange [font-family:'Gilroy-Medium',Helvetica]">⚠️ Capital is locked while the agent is active. Unused capital can be withdrawn at any time.</p>
              </div>
            </div>
          )}

          {/* STEP 4 — Policy Preview */}
          {step === 4 && (
            <div className="flex flex-col gap-6">
              <div>
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1white text-sm mb-1">Policy Hash</p>
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mb-3">Deterministic keccak256 of your policy parameters. Same inputs always produce the same hash.</p>
                <PolicyHashSection />
              </div>

              <div className="border-t border-[#1d2131] pt-5">
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1white text-sm mb-1">Enforcement Stack</p>
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mb-3">Three independent layers ensure your policy is respected at every stage of execution.</p>
                <EnforcementStack />
              </div>

              <div className="border-t border-[#1d2131] pt-5">
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1white text-sm mb-1">Claude Tool Schema</p>
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mb-3">Tools available to the ReAct loop for this agent type. Only allowlisted tools can be called.</p>
                <ToolSchemaSection />
              </div>
            </div>
          )}

          {/* STEP 5 — Authorization */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Authorize your agent to operate on your behalf within the defined policy.</p>
              <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                  By authorizing, you grant this agent permission to execute actions and manage capital within the defined policy. The policy hash <code className="text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica]">{policyHash.slice(0, 14)}…</code> will be committed on-chain. You retain full control and can pause or revoke access at any time.
                </p>
              </div>
              {[
                { id: "auth", label: "I authorize this agent to act on my behalf", sublabel: "The agent will operate within my defined policy controls.", val: authSig, set: setAuthSig },
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
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Review every setting before launching your agent.</p>

              {/* Identity */}
              <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                {selectedAvatar ? <img src={selectedAvatar} alt="Avatar" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" /> : (
                  <div className="w-12 h-12 rounded-xl bg-brain-v1dark-orange flex items-center justify-center text-xl flex-shrink-0">{agentTypes.find((t) => t.id === selectedType)?.icon ?? "🤖"}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base truncate">{agentName || "Unnamed Agent"}</p>
                  {agentDesc && <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5 line-clamp-1">{agentDesc}</p>}
                </div>
                <span className="px-3 py-1 bg-brain-v1dark-orange/20 rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] capitalize flex-shrink-0">{selectedType}</span>
              </div>

              <SectionTitle>Capital & Risk</SectionTitle>
              <RowBlock rows={[
                { label: "Capital Allocation", value: capital ? `$${capital} ${capitalAsset}` : "—" },
                { label: "Risk Level",         value: riskLevel },
                { label: "Max Drawdown",       value: `${maxDrawdown}%` },
                { label: "Stop Loss",          value: `${stopLoss}%` },
                { label: "Execution Mode",     value: executionMode },
              ]} />

              {typeReviewRows.length > 0 && (
                <>
                  <SectionTitle>
                    {selectedType === "trading" ? "Trading Policy" : selectedType === "lending" ? "Lending Policy" : selectedType === "yield" ? "Yield Strategy" : selectedType === "payments" ? "Payment Controls" : selectedType === "analytics" ? "Analytics Settings" : "Custom Logic"}
                  </SectionTitle>
                  <RowBlock rows={typeReviewRows} />
                </>
              )}

              <SectionTitle>Policy Commitment</SectionTitle>
              <div className="p-4 bg-[#06070a] rounded-2xl border border-[#1d2131] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Policy Hash (keccak256)</span>
                  <span className="text-[10px] text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica]">verified ✓</span>
                </div>
                <code className="text-[10px] text-brain-v1baby-blue-60 [font-family:'JetBrains_Mono',Helvetica] break-all leading-relaxed">{policyHash}</code>
                <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">This hash will be committed on-chain via PolicyValidator. Changing any field changes the hash.</p>
              </div>

              {selectedType === "custom" && objective && (
                <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                  <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest mb-2">Objective</p>
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed line-clamp-4">{objective}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 pb-6 pt-4 border-t border-[#1d2131] flex-shrink-0">
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
              Continue
            </button>
          ) : (
            <button onClick={handleLaunch} disabled={launching}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-40">
              {launching ? (isEditMode ? "Saving…" : "Launching…") : (isEditMode ? "💾 Save Changes" : "🚀 Launch Agent")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
