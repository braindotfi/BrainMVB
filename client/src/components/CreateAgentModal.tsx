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
  { id: "trading",   label: "Trading",   icon: "⚡", desc: "Autonomous perpetual & spot trades on Hyperliquid, subject to position limits and market constraints.", use: "perpetual_long_short · grid_trading · yield_farming_arb" },
  { id: "lending",   label: "Lending",   icon: "🏦", desc: "Supply capital to lending protocols and manage collateral positions under LTV constraints.", use: "Aave · Compound · Morpho · custom_contract" },
  { id: "yield",     label: "Yield",     icon: "🌱", desc: "Optimize stablecoin yield via LP provision, stable swaps, perpetual funding, or Curve strategies.", use: "stable_farming · lp_on_dex · curve_convex" },
  { id: "payments",  label: "Payments",  icon: "💳", desc: "Automate recurring bills, batch payments, and subscription management via x402 and direct USDC transfers.", use: "recurring_bills · batch_payroll · x402" },
  { id: "analytics", label: "Analytics", icon: "📊", desc: "Monitor portfolio state, detect anomalies, trigger alerts, and recommend rebalances. Read-only by default.", use: "portfolio monitoring · anomaly detection · alerts" },
  { id: "custom",    label: "Custom",    icon: "🛠",  desc: "Deploy arbitrary agent objectives with user-defined execution boundaries and tool whitelisting.", use: "flexible · bounded · fully configurable" },
];

const avatarOptions = [
  "/figmaAssets/avatars.svg", "/figmaAssets/avatars-1.svg", "/figmaAssets/avatars-2.svg",
  "/figmaAssets/avatars-3.svg", "/figmaAssets/avatars-4.svg", "/figmaAssets/avatars-5.svg",
  "/figmaAssets/avatars-6.svg", "/figmaAssets/avatars-7.svg", "/figmaAssets/avatars-8.svg", "/figmaAssets/avatars-9.svg",
];

const STEPS = ["Agent Type", "Identity", "Configuration", "Capital", "Policy Preview", "Authorization", "Review"];
const AVAILABLE_BALANCE = 865040.30;

/* ─── Enforcement checks per type (sourced from schema doc) ─── */
const ENFORCEMENT: Record<string, { tier1: string[]; tier2extra?: string; tier3: string }> = {
  trading:   { tier1: ["Position size check vs max_position_size_usdc", "Market in allowed_markets allowlist", "Velocity check (cooldown_window_seconds)", "Daily loss tracking vs max_daily_loss_percent", "Cumulative exposure vs cumulative_exposure_limit"], tier2extra: undefined, tier3: "Smart contract guardrails, spend limits, recipient restrictions" },
  lending:   { tier1: ["Supply amount check vs max_supply_usd", "Collateral in allowed_collateral_assets", "LTV simulation before every borrow (vs max_ltv_percent)", "Liquidation risk < max_liquidation_risk_percent", "Protocol exposure ≤ max_protocol_exposure_percent"], tier2extra: "Oracle-gated LTV verification", tier3: "Enforces cumulative spend limit, prevents non-whitelisted pool addresses" },
  yield:     { tier1: ["Entry slippage ≤ max_slippage_bps", "Position ≤ max_position_size_usdc", "APY ≥ min_apy_percent at entry", "IL simulation vs impermanent_loss_tolerance_percent", "Stable pair concentration ≤ max_stable_pair_concentration"], tier2extra: "Oracle-gated APY confirmation", tier3: "Enforces position limits and concentration caps" },
  payments:  { tier1: ["Recipient in allowlisted_recipients", "Amount ≤ per_transaction_limit_usdc", "Daily spend ≤ daily_spend_budget_usdc", "Daily tx count ≤ daily_transaction_count_limit", "x402 header parsing and allowlist validation", "Approval routing for amounts > require_approval_above_usdc"], tier2extra: undefined, tier3: "Recipient whitelisting at smart contract level" },
  analytics: { tier1: ["No budget enforcement for read-only operations", "ERC-8004 registry records all observations", "pgvector stores historical data for trend analysis", "For auto-execute: validates against execution_limit_usdc", "execution_whitelist agent type check"], tier2extra: undefined, tier3: "Standard PolicyValidator flow; ERC-4337 guardrails on auto-execute only" },
  custom:    { tier1: ["Tool in allowed_tools whitelist", "Tool not in forbidden_tools blacklist", "Operations ≤ max_operations_per_hour", "Cumulative P&L circuit breaker (circuit_breaker_loss_percent)", "Counterparty in allowed_counterparties", "Contract calls ≤ max_calls_per_day"], tier2extra: undefined, tier3: "All executions go through standard PolicyValidator flow" },
};

/* ─── Claude Tool Schemas per agent type ─── */
const TOOL_SCHEMAS: Record<string, object[]> = {
  trading: [
    { name: "execute_trade", description: "Execute a spot or perpetual trade on Hyperliquid within policy bounds", input_schema: { type: "object", properties: { market: { type: "string", description: "Must be in allowed_markets" }, side: { type: "string", enum: ["long", "short"] }, size_usdc: { type: "number", description: "≤ max_position_size_usdc" }, order_type: { type: "string", enum: ["market", "limit", "stop_limit", "take_profit"] }, limit_price: { type: "number" }, leverage: { type: "integer", minimum: 1, description: "≤ max_position_leverage" } }, required: ["market", "side", "size_usdc", "order_type"] } },
    { name: "close_position", description: "Close an open position fully or partially", input_schema: { type: "object", properties: { market: { type: "string" }, close_pct: { type: "number", minimum: 1, maximum: 100 } }, required: ["market"] } },
    { name: "get_position_info", description: "Retrieve current open positions, P&L, and exposure", input_schema: { type: "object", properties: { market: { type: "string", description: "Optional market filter" } }, required: [] } },
  ],
  lending: [
    { name: "supply_collateral", description: "Supply an asset to a lending protocol", input_schema: { type: "object", properties: { protocol: { type: "string", enum: ["aave", "compound", "morpho", "custom_contract"] }, asset: { type: "string", description: "Must be in allowed_collateral_assets" }, amount_usdc: { type: "number", description: "≤ max_supply_usd" } }, required: ["protocol", "asset", "amount_usdc"] } },
    { name: "borrow_asset", description: "Borrow an asset against supplied collateral (LTV must remain ≤ max_ltv_percent)", input_schema: { type: "object", properties: { protocol: { type: "string" }, asset: { type: "string", description: "Must be in allowed_borrow_assets" }, amount_usdc: { type: "number" } }, required: ["protocol", "asset", "amount_usdc"] } },
    { name: "rebalance_ltv", description: "Repay or withdraw to reach target_ltv_percent", input_schema: { type: "object", properties: { protocol: { type: "string" }, target_ltv_pct: { type: "number", description: "Should equal target_ltv_percent" } }, required: ["protocol", "target_ltv_pct"] } },
    { name: "get_health_factor", description: "Get current health factor, LTV, and liquidation risk", input_schema: { type: "object", properties: { protocol: { type: "string" } }, required: ["protocol"] } },
  ],
  yield: [
    { name: "enter_yield_position", description: "Enter a yield-generating position within policy bounds", input_schema: { type: "object", properties: { protocol: { type: "string" }, strategy: { type: "string", enum: ["stable_farming", "lp_on_dex", "perpetual_funding", "curve_convex", "custom"] }, assets: { type: "array", items: { type: "string" } }, amount_usdc: { type: "number", description: "≤ max_position_size_usdc" } }, required: ["protocol", "strategy", "assets", "amount_usdc"] } },
    { name: "exit_yield_position", description: "Exit a yield position and return to USDC", input_schema: { type: "object", properties: { position_id: { type: "string" }, exit_pct: { type: "number", minimum: 1, maximum: 100 } }, required: ["position_id"] } },
    { name: "check_apy", description: "Check current APY for a given protocol and asset pair (must be ≥ min_apy_percent)", input_schema: { type: "object", properties: { protocol: { type: "string" }, asset_pair: { type: "string" } }, required: ["protocol"] } },
    { name: "compound_rewards", description: "Claim and reinvest yield rewards", input_schema: { type: "object", properties: { position_id: { type: "string" }, reinvest: { type: "boolean" } }, required: ["position_id"] } },
  ],
  payments: [
    { name: "send_payment", description: "Execute a USDC payment to an allowlisted recipient", input_schema: { type: "object", properties: { recipient: { type: "string", description: "Must be in allowlisted_recipients" }, amount_usdc: { type: "number", description: "≤ per_transaction_limit_usdc" }, memo: { type: "string" }, reference_id: { type: "string" } }, required: ["recipient", "amount_usdc"] } },
    { name: "batch_payroll", description: "Execute a batch of payments in a single transaction", input_schema: { type: "object", properties: { payments: { type: "array", items: { type: "object", properties: { recipient: { type: "string" }, amount_usdc: { type: "number" } } }, description: "Each recipient must be in allowlisted_recipients" } }, required: ["payments"] } },
    { name: "verify_x402_request", description: "Parse and verify an x402 payment request header", input_schema: { type: "object", properties: { x402_header: { type: "string" }, max_amount_usdc: { type: "number", description: "≤ x402_max_per_request_usdc" } }, required: ["x402_header"] } },
    { name: "schedule_recurring_payment", description: "Schedule a recurring payment to an allowlisted recipient", input_schema: { type: "object", properties: { recipient: { type: "string" }, amount_usdc: { type: "number" }, interval: { type: "string", enum: ["daily", "weekly", "monthly"] }, start_timestamp: { type: "number" } }, required: ["recipient", "amount_usdc", "interval"] } },
  ],
  analytics: [
    { name: "get_portfolio_snapshot", description: "Return current portfolio state across tracked agents", input_schema: { type: "object", properties: { agent_ids: { type: "array", items: { type: "string" }, description: "Subset of tracked_agents" }, include_recommendations: { type: "boolean" } }, required: [] } },
    { name: "detect_anomaly", description: "Run anomaly detection on recent agent activity", input_schema: { type: "object", properties: { agent_id: { type: "string" }, lookback_hours: { type: "integer", minimum: 1, maximum: 168 } }, required: ["agent_id"] } },
    { name: "generate_report", description: "Generate a performance report based on report_metrics config", input_schema: { type: "object", properties: { agent_ids: { type: "array", items: { type: "string" } }, metrics: { type: "array", items: { type: "string" } }, period_days: { type: "integer" } }, required: [] } },
    { name: "fire_alert", description: "Send a notification when alert rule threshold is breached", input_schema: { type: "object", properties: { rule_name: { type: "string" }, severity: { type: "string", enum: ["info", "warning", "critical"] }, message: { type: "string" }, notification_target: { type: "string" } }, required: ["severity", "message"] } },
  ],
  custom: [
    { name: "execute_custom_action", description: "Execute a user-defined action within allowed_tools boundaries", input_schema: { type: "object", properties: { action_type: { type: "string", description: "Must be in allowed_tools, not in forbidden_tools" }, parameters: { type: "object" }, spend_usdc: { type: "number", description: "≤ primary_limit_usdc" } }, required: ["action_type", "parameters"] } },
    { name: "call_external_api", description: "Call a whitelisted external API from external_data_sources", input_schema: { type: "object", properties: { endpoint: { type: "string", description: "Must be in external_data_sources" }, method: { type: "string", enum: ["GET", "POST"] }, payload: { type: "object" } }, required: ["endpoint", "method"] } },
    { name: "store_observation", description: "Store an observation in pgvector agent memory", input_schema: { type: "object", properties: { content: { type: "string" }, category: { type: "string" } }, required: ["content"] } },
  ],
};

/* ─── Policy hash (keccak256 of canonical JSON params) ─── */
function computePolicyHash(type: string, params: Record<string, unknown>): string {
  const canonical = { agent_type: type, ...Object.fromEntries(Object.entries(params).sort()) };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  return keccak256(bytes);
}

/* ─── Helper components ─── */
const formatUsd = (raw: string): string => {
  const clean = raw.replace(/[^0-9.]/g, "");
  if (!clean) return "";
  const [int, ...dec] = clean.split(".");
  return dec.length ? `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec.join("").slice(0, 2)}` : int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
const parseUsd = (v: string): number => parseFloat(v.replace(/,/g, "")) || 0;

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-[11px] uppercase tracking-wider">{children}</span>
);
const FieldHint = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'JetBrains_Mono',Helvetica] leading-relaxed">{children}</span>
);
const SectionHead = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest mt-1">{children}</p>
);

const Slider = ({ label, fieldName, value, min, max, unit, onChange, color = "#ff9500", hint }: {
  label: string; fieldName: string; value: string; min: number; max: number; unit?: string;
  onChange: (v: string) => void; color?: string; hint?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between items-center">
      <Label>{label}</Label>
      <span className="text-[11px] [font-family:'JetBrains_Mono',Helvetica]" style={{ color }}>{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="w-full accent-orange-500" />
    <div className="flex justify-between text-[10px] text-brain-v1baby-blue-30 [font-family:'JetBrains_Mono',Helvetica]">
      <span>{min}{unit}</span><span>{max}{unit}</span>
    </div>
    {hint && <FieldHint>{fieldName}: {hint}</FieldHint>}
  </div>
);

const Chips = ({ label, fieldName, options, selected, onToggle, hint }: {
  label: string; fieldName: string; options: string[]; selected: string[]; onToggle: (v: string) => void; hint?: string;
}) => (
  <div className="flex flex-col gap-2">
    <Label>{label}</Label>
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
    {hint && <FieldHint>{fieldName}: {hint}</FieldHint>}
  </div>
);

const Radio = ({ label, fieldName, options, value, onChange, cols = 2, hint }: {
  label: string; fieldName: string; options: string[]; value: string; onChange: (v: string) => void; cols?: number; hint?: string;
}) => (
  <div className="flex flex-col gap-2">
    <Label>{label}</Label>
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map((opt) => {
        const sel = value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt)}
            className={`flex items-center justify-between px-3 py-2.5 rounded-2xl border text-xs [font-family:'Gilroy-SemiBold',Helvetica] transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500] text-brain-v1light-orange" : "border-[#1d2131] bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:border-[#414965]"}`}>
            <span className="text-left">{opt}</span>
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${sel ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-brain-v1baby-blue-30"}`}>
              {sel && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </div>
          </button>
        );
      })}
    </div>
    {hint && <FieldHint>{fieldName}: {hint}</FieldHint>}
  </div>
);

const UsdInput = ({ label, fieldName, value, onChange, placeholder, hint }: {
  label: string; fieldName: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    <div className="flex items-center gap-2 px-4 h-11 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl focus-within:border-[#414965] transition-colors">
      <span className="text-brain-v1baby-blue-60 text-sm [font-family:'JetBrains_Mono',Helvetica]">$</span>
      <input value={value} onChange={(e) => onChange(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} placeholder={placeholder ?? "0"} className="flex-1 bg-transparent text-white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none" />
    </div>
    {hint && <FieldHint>{fieldName}: {hint}</FieldHint>}
  </div>
);

const NumInput = ({ label, fieldName, value, onChange, placeholder, hint, type = "number" }: {
  label: string; fieldName: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; type?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    <input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder ?? ""} className="px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-60 outline-none focus:border-[#414965] transition-colors w-full" />
    {hint && <FieldHint>{fieldName}: {hint}</FieldHint>}
  </div>
);

const TextArea = ({ label, fieldName, value, onChange, placeholder, rows = 3, hint }: {
  label: string; fieldName: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; hint?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-60 outline-none focus:border-[#414965] transition-colors w-full resize-none" />
    {hint && <FieldHint>{fieldName}: {hint}</FieldHint>}
  </div>
);

const Toggle = ({ label, sublabel, value, onChange }: { label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between p-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
    <div className="flex-1">
      <p className="text-sm [font-family:'Gilroy-SemiBold',Helvetica] text-white">{label}</p>
      {sublabel && <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{sublabel}</p>}
    </div>
    <button onClick={() => onChange(!value)} className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ml-3 ${value ? "bg-brain-v1dark-orange" : "bg-[#222737]"}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
    </button>
  </div>
);

function toExecModeLabel(v: string | undefined): string {
  switch ((v ?? "").toLowerCase().replace(/\s/g, "_")) {
    case "automatic": return "Automatic"; case "supervised": return "Supervised"; case "manual_approval": return "Manual Approval"; default: return "Automatic";
  }
}
function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function tog<T>(arr: T[], v: T): T[] { return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]; }

/* ═══════════════════════ MAIN COMPONENT ═══════════════════════ */
export const CreateAgentModal = ({ open, onClose, onViewMyAgents, initialStep = 0, prefill, agentId }: Props): JSX.Element | null => {
  const isEditMode = !!prefill && !!agentId;
  const [step, setStep] = useState(initialStep);

  /* ── Core inputs (all types) ── */
  const [selectedType, setSelectedType] = useState("");
  const [agentName, setAgentName]       = useState("");
  const [agentDesc, setAgentDesc]       = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [capital, setCapital]             = useState("");
  const [capitalAsset, setCapitalAsset]   = useState("USDC");

  /* ── Launch state ── */
  const [authSig, setAuthSig] = useState(false);
  const [terms, setTerms]     = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched]   = useState(false);

  /* ══ TRADING ── schema §1 ══ */
  const [t_strategy_type, setT_strategy_type]                 = useState("perpetual_long_short");
  const [t_max_position_size_usdc, setT_max_position_size_usdc] = useState("10,000");
  const [t_max_daily_loss_percent, setT_max_daily_loss_percent] = useState("5");
  const [t_allowed_markets, setT_allowed_markets]             = useState<string[]>(["BTC-USDC", "ETH-USDC"]);
  const [t_cooldown_window_seconds, setT_cooldown_window_seconds] = useState("3600");
  const [t_cumulative_exposure_limit, setT_cumulative_exposure_limit] = useState("50,000");
  const [t_order_types, setT_order_types]                     = useState<string[]>(["market", "limit"]);
  const [t_max_slippage_bps, setT_max_slippage_bps]           = useState("50");
  const [t_max_position_leverage, setT_max_position_leverage] = useState("3");
  const [t_rebalance_frequency_hours, setT_rebalance_frequency_hours] = useState("24");

  /* ══ LENDING ── schema §2 ══ */
  const [l_protocol, setL_protocol]                               = useState("aave");
  const [l_max_supply_usd, setL_max_supply_usd]                   = useState("50,000");
  const [l_allowed_collateral_assets, setL_allowed_collateral_assets] = useState<string[]>(["ETH", "WBTC", "stETH"]);
  const [l_allowed_borrow_assets, setL_allowed_borrow_assets]     = useState<string[]>(["USDC", "DAI"]);
  const [l_max_ltv_percent, setL_max_ltv_percent]                 = useState("70");
  const [l_target_ltv_percent, setL_target_ltv_percent]           = useState("55");
  const [l_rebalance_threshold_percent, setL_rebalance_threshold_percent] = useState("5");
  const [l_max_liquidation_risk_percent, setL_max_liquidation_risk_percent] = useState("10");
  const [l_max_protocol_exposure_percent, setL_max_protocol_exposure_percent] = useState("80");
  const [l_preferred_assets, setL_preferred_assets]               = useState<string[]>(["USDC", "DAI"]);
  const [l_min_apy_target_percent, setL_min_apy_target_percent]   = useState("4");

  /* ══ YIELD ── schema §3 ══ */
  const [y_strategy_type, setY_strategy_type]                     = useState("stable_farming");
  const [y_min_apy_percent, setY_min_apy_percent]                 = useState("4");
  const [y_target_apy_percent, setY_target_apy_percent]           = useState("8");
  const [y_exit_if_apy_below_percent, setY_exit_if_apy_below_percent] = useState("3");
  const [y_max_slippage_bps, setY_max_slippage_bps]               = useState("50");
  const [y_impermanent_loss_tolerance_percent, setY_impermanent_loss_tolerance_percent] = useState("5");
  const [y_max_stable_pair_concentration, setY_max_stable_pair_concentration] = useState("40");
  const [y_rebalance_frequency_hours, setY_rebalance_frequency_hours] = useState("24");
  const [y_max_position_size_usdc, setY_max_position_size_usdc]   = useState("25,000");

  /* ══ PAYMENTS ── schema §4 ══ */
  const [p_payment_type, setP_payment_type]                         = useState("recurring_bills");
  const [p_allowlisted_recipients, setP_allowlisted_recipients]     = useState("");
  const [p_deny_list, setP_deny_list]                               = useState("");
  const [p_per_transaction_limit_usdc, setP_per_transaction_limit_usdc] = useState("500");
  const [p_daily_spend_budget_usdc, setP_daily_spend_budget_usdc]   = useState("2,000");
  const [p_daily_transaction_count_limit, setP_daily_transaction_count_limit] = useState("10");
  const [p_require_approval_above_usdc, setP_require_approval_above_usdc] = useState("1,000");
  const [p_execution_window, setP_execution_window]                 = useState("24/7");
  const [p_accept_x402_payments, setP_accept_x402_payments]         = useState(false);
  const [p_x402_allowlist, setP_x402_allowlist]                     = useState("");
  const [p_x402_max_per_request_usdc, setP_x402_max_per_request_usdc] = useState("50");

  /* ══ ANALYTICS ── schema §5 ══ */
  const [a_tracked_agents, setA_tracked_agents]                 = useState("all");
  const [a_tracked_positions, setA_tracked_positions]           = useState<string[]>(["trading", "lending", "yield"]);
  const [a_rule_name, setA_rule_name]                           = useState("");
  const [a_condition, setA_condition]                           = useState("portfolio_loss_pct");
  const [a_threshold, setA_threshold]                           = useState("5");
  const [a_action, setA_action]                                 = useState("send_alert");
  const [a_notification_target, setA_notification_target]       = useState("");
  const [a_report_frequency, setA_report_frequency]             = useState("daily");
  const [a_report_metrics, setA_report_metrics]                 = useState<string[]>(["pnl", "drawdown", "apy"]);
  const [a_include_recommendations, setA_include_recommendations] = useState(true);
  const [a_allow_auto_execute, setA_allow_auto_execute]         = useState(false);
  const [a_execution_whitelist, setA_execution_whitelist]       = useState<string[]>([]);
  const [a_execution_limit_usdc, setA_execution_limit_usdc]     = useState("1,000");

  /* ══ CUSTOM ── schema §6 ══ */
  const [c_objective, setC_objective]                         = useState("");
  const [c_target_outcome, setC_target_outcome]               = useState("");
  const [c_complexity_level, setC_complexity_level]           = useState("moderate");
  const [c_allowed_tools, setC_allowed_tools]                 = useState<string[]>(["execute_custom_action", "call_external_api", "store_observation"]);
  const [c_forbidden_tools, setC_forbidden_tools]             = useState<string[]>([]);
  const [c_custom_contract_calls, setC_custom_contract_calls] = useState("");
  const [c_max_calls_per_day, setC_max_calls_per_day]         = useState("20");
  const [c_primary_limit_usdc, setC_primary_limit_usdc]       = useState("5,000");
  const [c_secondary_limit, setC_secondary_limit]             = useState("1,000");
  const [c_allowed_counterparties, setC_allowed_counterparties] = useState("");
  const [c_execution_window, setC_execution_window]           = useState("24/7");
  const [c_max_operations_per_hour, setC_max_operations_per_hour] = useState("10");
  const [c_circuit_breaker_loss_percent, setC_circuit_breaker_loss_percent] = useState("10");
  const [c_webhook_for_notifications, setC_webhook_for_notifications] = useState("");
  const [c_custom_auth_headers, setC_custom_auth_headers]     = useState("");
  const [c_external_data_sources, setC_external_data_sources] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  /* ── Derived policy params (exact schema field names) ── */
  const policyParams = useMemo<Record<string, unknown>>(() => {
    if (selectedType === "trading") return { strategy_type: t_strategy_type, max_position_size_usdc: parseUsd(t_max_position_size_usdc), max_daily_loss_percent: parseInt(t_max_daily_loss_percent), allowed_markets: t_allowed_markets, cooldown_window_seconds: parseInt(t_cooldown_window_seconds), cumulative_exposure_limit: parseUsd(t_cumulative_exposure_limit), order_types: t_order_types, max_slippage_bps: parseInt(t_max_slippage_bps), max_position_leverage: parseInt(t_max_position_leverage), rebalance_frequency_hours: parseInt(t_rebalance_frequency_hours) };
    if (selectedType === "lending") return { protocol: l_protocol, max_supply_usd: parseUsd(l_max_supply_usd), allowed_collateral_assets: l_allowed_collateral_assets, allowed_borrow_assets: l_allowed_borrow_assets, max_ltv_percent: parseInt(l_max_ltv_percent), target_ltv_percent: parseInt(l_target_ltv_percent), rebalance_threshold_percent: parseInt(l_rebalance_threshold_percent), max_liquidation_risk_percent: parseInt(l_max_liquidation_risk_percent), max_protocol_exposure_percent: parseInt(l_max_protocol_exposure_percent), preferred_assets: l_preferred_assets, min_apy_target_percent: parseInt(l_min_apy_target_percent) };
    if (selectedType === "yield")   return { strategy_type: y_strategy_type, min_apy_percent: parseInt(y_min_apy_percent), target_apy_percent: parseInt(y_target_apy_percent), exit_if_apy_below_percent: parseInt(y_exit_if_apy_below_percent), max_slippage_bps: parseInt(y_max_slippage_bps), impermanent_loss_tolerance_percent: parseInt(y_impermanent_loss_tolerance_percent), max_stable_pair_concentration: parseInt(y_max_stable_pair_concentration), rebalance_frequency_hours: parseInt(y_rebalance_frequency_hours), max_position_size_usdc: parseUsd(y_max_position_size_usdc) };
    if (selectedType === "payments") return { payment_type: p_payment_type, per_transaction_limit_usdc: parseUsd(p_per_transaction_limit_usdc), daily_spend_budget_usdc: parseUsd(p_daily_spend_budget_usdc), daily_transaction_count_limit: parseInt(p_daily_transaction_count_limit), require_approval_above_usdc: parseUsd(p_require_approval_above_usdc), execution_window: p_execution_window, accept_x402_payments: p_accept_x402_payments, x402_max_per_request_usdc: parseUsd(p_x402_max_per_request_usdc) };
    if (selectedType === "analytics") return { tracked_agents: a_tracked_agents, tracked_positions: a_tracked_positions, alert_rule_name: a_rule_name, alert_condition: a_condition, alert_threshold: parseFloat(a_threshold), alert_action: a_action, report_frequency: a_report_frequency, report_metrics: a_report_metrics, include_recommendations: a_include_recommendations, allow_auto_execute: a_allow_auto_execute, execution_limit_usdc: parseUsd(a_execution_limit_usdc) };
    if (selectedType === "custom")  return { objective: c_objective.slice(0, 256), target_outcome: c_target_outcome, complexity_level: c_complexity_level, allowed_tools: c_allowed_tools, forbidden_tools: c_forbidden_tools, max_calls_per_day: parseInt(c_max_calls_per_day), primary_limit_usdc: parseUsd(c_primary_limit_usdc), secondary_limit: parseUsd(c_secondary_limit), execution_window: c_execution_window, max_operations_per_hour: parseInt(c_max_operations_per_hour), circuit_breaker_loss_percent: parseInt(c_circuit_breaker_loss_percent) };
    return {};
  }, [selectedType, t_strategy_type, t_max_position_size_usdc, t_max_daily_loss_percent, t_allowed_markets, t_cooldown_window_seconds, t_cumulative_exposure_limit, t_order_types, t_max_slippage_bps, t_max_position_leverage, t_rebalance_frequency_hours, l_protocol, l_max_supply_usd, l_allowed_collateral_assets, l_allowed_borrow_assets, l_max_ltv_percent, l_target_ltv_percent, l_rebalance_threshold_percent, l_max_liquidation_risk_percent, l_max_protocol_exposure_percent, l_preferred_assets, l_min_apy_target_percent, y_strategy_type, y_min_apy_percent, y_target_apy_percent, y_exit_if_apy_below_percent, y_max_slippage_bps, y_impermanent_loss_tolerance_percent, y_max_stable_pair_concentration, y_rebalance_frequency_hours, y_max_position_size_usdc, p_payment_type, p_per_transaction_limit_usdc, p_daily_spend_budget_usdc, p_daily_transaction_count_limit, p_require_approval_above_usdc, p_execution_window, p_accept_x402_payments, p_x402_max_per_request_usdc, a_tracked_agents, a_tracked_positions, a_rule_name, a_condition, a_threshold, a_action, a_report_frequency, a_report_metrics, a_include_recommendations, a_allow_auto_execute, a_execution_limit_usdc, c_objective, c_target_outcome, c_complexity_level, c_allowed_tools, c_forbidden_tools, c_max_calls_per_day, c_primary_limit_usdc, c_secondary_limit, c_execution_window, c_max_operations_per_hour, c_circuit_breaker_loss_percent]);

  const policyHash = useMemo(() => selectedType ? computePolicyHash(selectedType, policyParams) : "", [selectedType, policyParams]);

  /* ── Reset on open ── */
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
    if (prefill.maxLTV)     setL_max_ltv_percent(prefill.maxLTV);
    if (prefill.targetAPY)  setY_target_apy_percent(prefill.targetAPY);
    if (prefill.minAPY)     setY_min_apy_percent(prefill.minAPY);
    if (prefill.maxSinglePayment) setP_per_transaction_limit_usdc(prefill.maxSinglePayment);
    if (prefill.monthlyBudgetCap) setP_daily_spend_budget_usdc(prefill.monthlyBudgetCap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capitalNum = parseUsd(capital);
  const balanceError = capitalNum > 0 && capitalNum > AVAILABLE_BALANCE;
  const autoTicker = agentName ? "$" + agentName.toUpperCase().replace(/\s/g, "").slice(0, 8) : "";

  /* ── Mutations ── */
  const buildPayload = () => ({
    name: agentName, type: selectedType, ticker: autoTicker, description: agentDesc,
    avatar: selectedAvatar || "/figmaAssets/avatars.svg",
    capitalAmount: capitalNum, capitalAsset,
    maxAllocationPct: 80, maxPositionPct: 25, maxTradesPerDay: 10,
    riskLevel: "moderate", maxDrawdown: 20, stopLoss: 10,
    executionMode: "automatic",
    allowedAssets: selectedType === "trading" ? t_allowed_markets : selectedType === "lending" ? l_allowed_collateral_assets : ["ETH", "USDC"],
    status: "active", createdByUser: true,
    policyHash, typeConfig: policyParams,
  });

  const createAgentMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/agents", buildPayload())).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agents"] }); setLaunching(false); setLaunched(true); },
    onError:   () => { setLaunching(false); setLaunched(true); },
  });
  const updateAgentMutation = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/agents/${agentId}`, { ...buildPayload(), status: undefined, createdByUser: undefined })).json(),
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
      setStep(0); setSelectedType(""); setAgentName(""); setAgentDesc(""); setSelectedAvatar(""); setCapital(""); setCapitalAsset("USDC");
      setAuthSig(false); setTerms(false); setLaunched(false); setLaunching(false);
    }, 300);
  };

  const handleLaunch = () => { setLaunching(true); isEditMode ? updateAgentMutation.mutate() : createAgentMutation.mutate(); };

  /* ── Configuration step content ── */
  const ConfigStep = () => {

    /* TRADING */
    if (selectedType === "trading") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Position controls, trading parameters, and market constraints for autonomous Hyperliquid execution.</p>

        <Radio label="Strategy Type" fieldName="strategy_type" options={["perpetual_long_short", "grid_trading", "yield_farming_arb", "index_tracking", "custom"]} value={t_strategy_type} onChange={setT_strategy_type} cols={2} />

        <SectionHead>Position Controls</SectionHead>
        <UsdInput label="Max Position Size" fieldName="max_position_size_usdc" value={t_max_position_size_usdc} onChange={setT_max_position_size_usdc} placeholder="10,000" hint="Hard ceiling per open position in USDC" />
        <UsdInput label="Cumulative Exposure Limit" fieldName="cumulative_exposure_limit" value={t_cumulative_exposure_limit} onChange={setT_cumulative_exposure_limit} placeholder="50,000" hint="Total notional across all open positions" />
        <Slider label="Max Daily Loss %" fieldName="max_daily_loss_percent" value={t_max_daily_loss_percent} min={1} max={50} unit="%" onChange={setT_max_daily_loss_percent} hint="Agent pauses if cumulative daily loss exceeds this" />
        <Chips label="Allowed Markets" fieldName="allowed_markets" options={["BTC-USDC", "ETH-USDC", "SOL-USDC", "ARB-USDC", "OP-USDC", "AVAX-USDC", "BNB-USDC", "MATIC-USDC"]} selected={t_allowed_markets} onToggle={(v) => setT_allowed_markets(tog(t_allowed_markets, v))} hint="Only these pairs may be traded — enforced on-chain" />
        <Radio label="Cooldown Window" fieldName="cooldown_window_seconds" options={["3600", "14400", "28800", "86400"]} value={t_cooldown_window_seconds} onChange={setT_cooldown_window_seconds} cols={4} hint="Seconds between consecutive trades (1h / 4h / 8h / 24h)" />

        <SectionHead>Trading Parameters</SectionHead>
        <Chips label="Order Types" fieldName="order_types" options={["market", "limit", "stop_limit", "take_profit"]} selected={t_order_types} onToggle={(v) => setT_order_types(tog(t_order_types, v))} hint="Only these order types can be submitted" />
        <Slider label="Max Slippage (bps)" fieldName="max_slippage_bps" value={t_max_slippage_bps} min={1} max={500} onChange={setT_max_slippage_bps} hint="1 bps = 0.01% · e.g. 50 bps = 0.5% max slippage" />
        <Slider label="Max Position Leverage" fieldName="max_position_leverage" value={t_max_position_leverage} min={1} max={20} onChange={setT_max_position_leverage} hint="Max leverage per position (1 = spot only, no leverage)" />
        <Radio label="Rebalance Frequency (hours)" fieldName="rebalance_frequency_hours" options={["1", "4", "12", "24", "48", "168"]} value={t_rebalance_frequency_hours} onChange={setT_rebalance_frequency_hours} cols={6} hint="How often the agent evaluates portfolio balance" />
      </div>
    );

    /* LENDING */
    if (selectedType === "lending") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Supply controls, LTV risk constraints, and yield preferences for lending protocol management.</p>

        <Radio label="Protocol" fieldName="protocol" options={["aave", "compound", "morpho", "custom_contract"]} value={l_protocol} onChange={setL_protocol} cols={2} />

        <SectionHead>Supply Controls</SectionHead>
        <UsdInput label="Max Supply (USD)" fieldName="max_supply_usd" value={l_max_supply_usd} onChange={setL_max_supply_usd} placeholder="50,000" hint="Maximum total capital supplied to this protocol" />
        <Chips label="Allowed Collateral Assets" fieldName="allowed_collateral_assets" options={["ETH", "WBTC", "stETH", "cbETH", "rETH", "USDC", "DAI", "USDT"]} selected={l_allowed_collateral_assets} onToggle={(v) => setL_allowed_collateral_assets(tog(l_allowed_collateral_assets, v))} hint="Only these assets can be posted as collateral" />
        <Chips label="Allowed Borrow Assets" fieldName="allowed_borrow_assets" options={["USDC", "DAI", "USDT", "ETH", "WBTC"]} selected={l_allowed_borrow_assets} onToggle={(v) => setL_allowed_borrow_assets(tog(l_allowed_borrow_assets, v))} hint="Only these assets can be borrowed" />

        <SectionHead>Risk Controls</SectionHead>
        <Slider label="Max LTV %" fieldName="max_ltv_percent" value={l_max_ltv_percent} min={10} max={85} unit="%" onChange={setL_max_ltv_percent} hint="Hard LTV ceiling — borrow is rejected above this" />
        <Slider label="Target LTV %" fieldName="target_ltv_percent" value={l_target_ltv_percent} min={10} max={80} unit="%" onChange={setL_target_ltv_percent} color="#42bf23" hint="Rebalance triggers when actual LTV deviates from this" />
        <Slider label="Rebalance Threshold %" fieldName="rebalance_threshold_percent" value={l_rebalance_threshold_percent} min={1} max={20} unit="%" onChange={setL_rebalance_threshold_percent} hint="LTV deviation from target that triggers a rebalance" />
        <Slider label="Max Liquidation Risk %" fieldName="max_liquidation_risk_percent" value={l_max_liquidation_risk_percent} min={1} max={30} unit="%" onChange={setL_max_liquidation_risk_percent} hint="Agent reduces exposure if liquidation risk exceeds this" />
        <Slider label="Max Protocol Exposure %" fieldName="max_protocol_exposure_percent" value={l_max_protocol_exposure_percent} min={10} max={100} unit="%" onChange={setL_max_protocol_exposure_percent} hint="Max % of total capital in a single protocol" />

        <SectionHead>Yield Preferences</SectionHead>
        <Chips label="Preferred Assets" fieldName="preferred_assets" options={["USDC", "DAI", "USDT", "ETH"]} selected={l_preferred_assets} onToggle={(v) => setL_preferred_assets(tog(l_preferred_assets, v))} hint="Preferred borrow/supply assets when multiple options are available" />
        <Slider label="Min APY Target %" fieldName="min_apy_target_percent" value={l_min_apy_target_percent} min={1} max={20} unit="%" onChange={setL_min_apy_target_percent} color="#42bf23" hint="Supply APY must exceed this to open a new position" />
      </div>
    );

    /* YIELD */
    if (selectedType === "yield") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Yield targets, slippage constraints, and impermanent loss tolerance for stablecoin optimization.</p>

        <Radio label="Strategy Type" fieldName="strategy_type" options={["stable_farming", "lp_on_dex", "perpetual_funding", "curve_convex", "custom"]} value={y_strategy_type} onChange={setY_strategy_type} cols={2} />

        <SectionHead>Yield Targets</SectionHead>
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Min APY %" fieldName="min_apy_percent" value={y_min_apy_percent} onChange={setY_min_apy_percent} placeholder="4" hint="Minimum acceptable APY to enter a position" />
          <NumInput label="Target APY %" fieldName="target_apy_percent" value={y_target_apy_percent} onChange={setY_target_apy_percent} placeholder="8" hint="Optimal APY the agent seeks" />
        </div>
        <Slider label="Exit if APY Below %" fieldName="exit_if_apy_below_percent" value={y_exit_if_apy_below_percent} min={1} max={20} unit="%" onChange={setY_exit_if_apy_below_percent} color="#42bf23" hint="Agent exits position if APY drops below this floor" />

        <SectionHead>Risk Controls</SectionHead>
        <Slider label="Max Slippage (bps)" fieldName="max_slippage_bps" value={y_max_slippage_bps} min={1} max={300} onChange={setY_max_slippage_bps} hint="Maximum acceptable entry/exit slippage" />
        <Slider label="IL Tolerance %" fieldName="impermanent_loss_tolerance_percent" value={y_impermanent_loss_tolerance_percent} min={0} max={30} unit="%" onChange={setY_impermanent_loss_tolerance_percent} hint="Max acceptable impermanent loss before exiting LP" />
        <Slider label="Max Stable Pair Concentration %" fieldName="max_stable_pair_concentration" value={y_max_stable_pair_concentration} min={5} max={100} unit="%" onChange={setY_max_stable_pair_concentration} hint="Cap on allocation to a single stable pair to avoid concentration risk" />
        <UsdInput label="Max Position Size (USDC)" fieldName="max_position_size_usdc" value={y_max_position_size_usdc} onChange={setY_max_position_size_usdc} placeholder="25,000" hint="Max capital per individual yield position" />
        <Radio label="Rebalance Frequency (hours)" fieldName="rebalance_frequency_hours" options={["6", "12", "24", "48", "168"]} value={y_rebalance_frequency_hours} onChange={setY_rebalance_frequency_hours} cols={5} hint="How often the agent evaluates and rebalances yield positions" />
      </div>
    );

    /* PAYMENTS */
    if (selectedType === "payments") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Recipient allowlists, budget controls, and x402 configuration for automated payment execution.</p>

        <Radio label="Payment Type" fieldName="payment_type" options={["recurring_bills", "direct_transfers", "batch_payroll", "subscription_manager", "custom"]} value={p_payment_type} onChange={setP_payment_type} cols={2} />

        <SectionHead>Recipient Configuration</SectionHead>
        <TextArea label="Allowlisted Recipients" fieldName="allowlisted_recipients" value={p_allowlisted_recipients} onChange={setP_allowlisted_recipients} placeholder={"0xABC123...\n0xDEF456...\none address per line"} rows={3} hint="Only these addresses can receive payments — enforced on-chain" />
        <TextArea label="Deny List" fieldName="deny_list" value={p_deny_list} onChange={setP_deny_list} placeholder={"0xBLACKLIST...\none address per line"} rows={2} hint="Addresses explicitly blocked from receiving payments" />

        <SectionHead>Payment Controls</SectionHead>
        <div className="grid grid-cols-2 gap-3">
          <UsdInput label="Per-Tx Limit (USDC)" fieldName="per_transaction_limit_usdc" value={p_per_transaction_limit_usdc} onChange={setP_per_transaction_limit_usdc} placeholder="500" hint="Hard cap per single payment" />
          <UsdInput label="Daily Spend Budget (USDC)" fieldName="daily_spend_budget_usdc" value={p_daily_spend_budget_usdc} onChange={setP_daily_spend_budget_usdc} placeholder="2,000" hint="Max cumulative spend in 24h" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Daily Tx Count Limit" fieldName="daily_transaction_count_limit" value={p_daily_transaction_count_limit} onChange={setP_daily_transaction_count_limit} placeholder="10" hint="Max number of payments in 24h" />
          <UsdInput label="Require Approval Above (USDC)" fieldName="require_approval_above_usdc" value={p_require_approval_above_usdc} onChange={setP_require_approval_above_usdc} placeholder="1,000" hint="Payments above this need explicit approval" />
        </div>
        <Radio label="Execution Window" fieldName="execution_window" options={["24/7", "business_hours", "custom"]} value={p_execution_window} onChange={setP_execution_window} cols={3} hint="When the agent is permitted to execute payments" />

        <SectionHead>x402 Configuration</SectionHead>
        <Toggle label="Accept x402 Payments" sublabel="accept_x402_payments — Machine-to-machine payment requests via HTTP 402" value={p_accept_x402_payments} onChange={setP_accept_x402_payments} />
        {p_accept_x402_payments && (
          <>
            <TextArea label="x402 Allowlist" fieldName="x402_allowlist" value={p_x402_allowlist} onChange={setP_x402_allowlist} placeholder={"https://api.service.com\none URL per line"} rows={2} hint="Only x402 requests from these endpoints are accepted" />
            <UsdInput label="x402 Max Per Request (USDC)" fieldName="x402_max_per_request_usdc" value={p_x402_max_per_request_usdc} onChange={setP_x402_max_per_request_usdc} placeholder="50" hint="Max amount auto-paid per x402 request" />
          </>
        )}
      </div>
    );

    /* ANALYTICS */
    if (selectedType === "analytics") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Read-only by default. Configure monitoring scope, alert rules, reporting, and optional auto-execute.</p>

        <SectionHead>Monitoring Scope</SectionHead>
        <Radio label="Tracked Agents" fieldName="tracked_agents" options={["all", "selected"]} value={a_tracked_agents} onChange={setA_tracked_agents} cols={2} hint="'all' monitors every agent in your account" />
        <Chips label="Tracked Positions" fieldName="tracked_positions" options={["trading", "lending", "yield", "payments", "custom"]} selected={a_tracked_positions} onToggle={(v) => setA_tracked_positions(tog(a_tracked_positions, v))} hint="Position types included in monitoring scope" />

        <SectionHead>Alert Rule</SectionHead>
        <NumInput label="Rule Name" fieldName="rule_name" value={a_rule_name} onChange={setA_rule_name} placeholder="e.g. high_drawdown_alert" type="text" hint="Unique identifier for this alert rule" />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Condition</Label>
            <select value={a_condition} onChange={(e) => setA_condition(e.target.value)} className="px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-white text-sm [font-family:'Gilroy-Medium',Helvetica] outline-none focus:border-[#414965] cursor-pointer">
              {["portfolio_loss_pct", "agent_inactive", "position_liquidation_risk", "apy_drop", "anomalous_spend", "daily_loss_exceeded"].map((c) => <option key={c} value={c} className="bg-[#0d1017]">{c}</option>)}
            </select>
            <FieldHint>condition: evaluation trigger logic</FieldHint>
          </div>
          <NumInput label="Threshold" fieldName="threshold" value={a_threshold} onChange={setA_threshold} placeholder="5" hint="Numeric value that triggers the alert" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Action</Label>
            <select value={a_action} onChange={(e) => setA_action(e.target.value)} className="px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-white text-sm [font-family:'Gilroy-Medium',Helvetica] outline-none focus:border-[#414965] cursor-pointer">
              {["send_alert", "pause_agent", "rebalance", "reduce_exposure", "halt_all"].map((a) => <option key={a} value={a} className="bg-[#0d1017]">{a}</option>)}
            </select>
            <FieldHint>action: response when condition is met</FieldHint>
          </div>
          <NumInput label="Notification Target" fieldName="notification_target" value={a_notification_target} onChange={setA_notification_target} placeholder="0x... or webhook URL" type="text" hint="Address or endpoint to notify" />
        </div>

        <SectionHead>Reporting</SectionHead>
        <Radio label="Report Frequency" fieldName="report_frequency" options={["hourly", "daily", "weekly", "on_alert"]} value={a_report_frequency} onChange={setA_report_frequency} cols={4} hint="How often the agent generates portfolio reports" />
        <Chips label="Report Metrics" fieldName="report_metrics" options={["pnl", "drawdown", "apy", "tx_count", "gas_used", "anomaly_score", "ltv", "exposure"]} selected={a_report_metrics} onToggle={(v) => setA_report_metrics(tog(a_report_metrics, v))} hint="Metrics included in generated reports" />
        <Toggle label="Include Recommendations" sublabel="include_recommendations — AI-generated rebalancing suggestions in reports" value={a_include_recommendations} onChange={setA_include_recommendations} />

        <SectionHead>Execution Triggers</SectionHead>
        <Toggle label="Allow Auto-Execute" sublabel="allow_auto_execute — Enables agent to act on alerts (adds spend policy)" value={a_allow_auto_execute} onChange={setA_allow_auto_execute} />
        {a_allow_auto_execute && (
          <>
            <Chips label="Execution Whitelist" fieldName="execution_whitelist" options={["pause_agent", "rebalance", "reduce_exposure"]} selected={a_execution_whitelist} onToggle={(v) => setA_execution_whitelist(tog(a_execution_whitelist, v))} hint="Only these actions can be auto-executed" />
            <UsdInput label="Execution Limit (USDC)" fieldName="execution_limit_usdc" value={a_execution_limit_usdc} onChange={setA_execution_limit_usdc} placeholder="1,000" hint="Max spend per auto-executed action" />
          </>
        )}
      </div>
    );

    /* CUSTOM */
    if (selectedType === "custom") return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Flexible but bounded. Define your objective, tool whitelist, and execution controls.</p>

        <SectionHead>Objective</SectionHead>
        <TextArea label="Objective (free-form)" fieldName="objective" value={c_objective} onChange={setC_objective} placeholder="Describe exactly what your agent should do — its goals, constraints, and decision logic. Be specific about trigger conditions and success criteria." rows={4} hint={`${c_objective.length}/256 chars — becomes the Claude system prompt objective`} />
        <NumInput label="Target Outcome" fieldName="target_outcome" value={c_target_outcome} onChange={setC_target_outcome} placeholder="e.g. maximize_yield or automate_recurring_payments" type="text" hint="Measurable success criterion for the agent's mission" />
        <Radio label="Complexity Level" fieldName="complexity_level" options={["simple", "moderate", "complex", "experimental"]} value={c_complexity_level} onChange={setC_complexity_level} cols={4} hint="Affects ReAct loop depth and max tool invocations per run" />

        <SectionHead>Execution Framework</SectionHead>
        <Chips label="Allowed Tools" fieldName="allowed_tools" options={["execute_custom_action", "call_external_api", "store_observation", "send_payment", "get_portfolio_snapshot", "fire_alert"]} selected={c_allowed_tools} onToggle={(v) => setC_allowed_tools(tog(c_allowed_tools, v))} hint="Claude can only call tools in this whitelist" />
        <Chips label="Forbidden Tools" fieldName="forbidden_tools" options={["execute_trade", "supply_collateral", "borrow_asset", "batch_payroll"]} selected={c_forbidden_tools} onToggle={(v) => setC_forbidden_tools(tog(c_forbidden_tools, v))} hint="Blacklisted — agent cannot call these even if hallucinated" />
        <TextArea label="Custom Contract Calls (addresses)" fieldName="custom_contract_calls" value={c_custom_contract_calls} onChange={setC_custom_contract_calls} placeholder={"0xContractAddress\none per line"} rows={2} hint="Contracts the agent may call directly via callData" />
        <NumInput label="Max Calls Per Day" fieldName="max_calls_per_day" value={c_max_calls_per_day} onChange={setC_max_calls_per_day} placeholder="20" hint="Rate limit on custom contract calls" />

        <SectionHead>Control Parameters</SectionHead>
        <div className="grid grid-cols-2 gap-3">
          <UsdInput label="Primary Limit (USDC)" fieldName="primary_limit_usdc" value={c_primary_limit_usdc} onChange={setC_primary_limit_usdc} placeholder="5,000" hint="Main spend ceiling enforced by PolicyEngine" />
          <UsdInput label="Secondary Limit (USDC)" fieldName="secondary_limit" value={c_secondary_limit} onChange={setC_secondary_limit} placeholder="1,000" hint="Secondary guard for sub-category spend" />
        </div>
        <TextArea label="Allowed Counterparties" fieldName="allowed_counterparties" value={c_allowed_counterparties} onChange={setC_allowed_counterparties} placeholder={"0xCounterparty...\none address per line"} rows={2} hint="Contract/wallet addresses the agent may interact with" />
        <Radio label="Execution Window" fieldName="execution_window" options={["24/7", "business_hours", "custom"]} value={c_execution_window} onChange={setC_execution_window} cols={3} hint="When the agent is permitted to execute operations" />
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Max Operations / Hour" fieldName="max_operations_per_hour" value={c_max_operations_per_hour} onChange={setC_max_operations_per_hour} placeholder="10" hint="Rate limiting across all tool calls" />
          <div />
        </div>
        <Slider label="Circuit Breaker Loss %" fieldName="circuit_breaker_loss_percent" value={c_circuit_breaker_loss_percent} min={1} max={50} unit="%" onChange={setC_circuit_breaker_loss_percent} hint="Agent halts if cumulative P&L loss exceeds this" />

        <SectionHead>Integrations</SectionHead>
        <NumInput label="Webhook for Notifications" fieldName="webhook_for_notifications" value={c_webhook_for_notifications} onChange={setC_webhook_for_notifications} placeholder="https://api.example.com/agent-events" type="url" hint="Agent POSTs observations and action results here" />
        <TextArea label="Custom Auth Headers" fieldName="custom_auth_headers" value={c_custom_auth_headers} onChange={setC_custom_auth_headers} placeholder={"Authorization: Bearer token\nX-API-Key: key"} rows={2} hint="Headers injected into outbound webhook and API requests" />
        <TextArea label="External Data Sources" fieldName="external_data_sources" value={c_external_data_sources} onChange={setC_external_data_sources} placeholder={"https://api.coingecko.com\nhttps://api.dune.com"} rows={2} hint="Allowlisted URLs the agent may fetch from via call_external_api" />
      </div>
    );

    return null;
  };

  /* ── Enforcement Stack ── */
  const EnforcementStack = () => {
    const e = ENFORCEMENT[selectedType] ?? { tier1: [], tier3: "" };
    const tiers = [
      { num: "1", label: "PolicyEngine", sublabel: "Control Plane (off-chain)", color: "#ff9500", bg: "#2a1500", border: "#4a2500", checks: e.tier1, desc: "Off-chain validation before any UserOperation is submitted." },
      { num: "2", label: "PolicyValidator", sublabel: "On-Chain Solidity", color: "#a8b9f4", bg: "#0d1117", border: "#1d2131", checks: ["Cryptographic proof verification (keccak256 policy_hash)", "Replay prevention via nonce inclusion", "Proof expiry enforcement (10-minute window)", ...(e.tier2extra ? [e.tier2extra] : []), "ERC-8004 audit trail recording on every execution"], desc: "Solidity contract verifies every proof before execution." },
      { num: "3", label: "Crossmint Agent Wallet", sublabel: "Smart Contract (ERC-4337)", color: "#9d5cf5", bg: "#1a0d2e", border: "#2d1a4a", checks: [e.tier3, "Reentrancy guard on all operations", "Agent revocation via revokeAgent(agent_id) at any time"], desc: "Smart account guardrails — cannot be bypassed by any layer above." },
    ];
    return (
      <div className="flex flex-col gap-3">
        {tiers.map((tier) => (
          <div key={tier.num} className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: tier.bg, borderColor: tier.border }}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs [font-family:'JetBrains_Mono',Helvetica] font-bold" style={{ background: tier.color + "22", color: tier.color }}>{tier.num}</div>
              <div className="flex-1">
                <p className="text-sm [font-family:'Gilroy-SemiBold',Helvetica]" style={{ color: tier.color }}>{tier.label}</p>
                <p className="text-[11px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{tier.sublabel} · {tier.desc}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 pl-10">
              {tier.checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5" style={{ background: tier.color + "88" }} />
                  <span className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{c}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ── Policy Hash display ── */
  const PolicyHashSection = () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Policy Hash (keccak256)</Label>
        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">same inputs → same hash</span>
      </div>
      <div className="p-3 bg-[#06070a] rounded-2xl border border-[#1d2131] flex items-center gap-2">
        <svg className="flex-shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="2" stroke="#414965" strokeWidth="1.2" /><path d="M5 3V2a2 2 0 0 1 4 0v1" stroke="#414965" strokeWidth="1.2" strokeLinecap="round" /></svg>
        <code className="text-[10px] text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica] break-all flex-1 leading-relaxed">{policyHash || "—"}</code>
        <button onClick={() => navigator.clipboard.writeText(policyHash)} className="text-[10px] text-brain-v1baby-blue-60 hover:text-white px-2 py-1 rounded-lg border border-[#1d2131] hover:border-[#414965] flex-shrink-0 [font-family:'Gilroy-SemiBold',Helvetica] transition-colors">Copy</button>
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

  /* ── Tool schema display ── */
  const ToolSchemaSection = () => {
    const [sel, setSel] = useState(0);
    const tools = TOOL_SCHEMAS[selectedType] ?? [];
    const tool = tools[sel];
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 p-1 bg-[#06070a] rounded-xl overflow-x-auto">
          {tools.map((t: any, i) => (
            <button key={i} onClick={() => setSel(i)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] transition-colors whitespace-nowrap ${sel === i ? "bg-[#1d2131] text-white" : "text-brain-v1baby-blue-30 hover:text-white"}`}>
              {(t as any).name}
            </button>
          ))}
        </div>
        {tool && (
          <div className="relative">
            <div className="p-4 bg-[#06070a] rounded-2xl border border-[#1d2131] overflow-x-auto max-h-56">
              <pre className="text-[10px] [font-family:'JetBrains_Mono',Helvetica] text-[#a8b9f4] whitespace-pre-wrap leading-relaxed">{JSON.stringify(tool, null, 2)}</pre>
            </div>
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(tool, null, 2))}
              className="absolute top-3 right-3 text-[10px] text-brain-v1baby-blue-60 hover:text-white px-2 py-1 rounded-lg border border-[#1d2131] hover:border-[#414965] [font-family:'Gilroy-SemiBold',Helvetica] bg-[#0d1017] transition-colors">
              Copy
            </button>
          </div>
        )}
        <FieldHint>These tools are available to the Claude ReAct loop for {selectedType} agents. Only tools matching the policy whitelist can be called.</FieldHint>
      </div>
    );
  };

  /* ── Review rows per type ── */
  const reviewRows: { label: string; value: string }[] = (() => {
    if (selectedType === "trading") return [
      { label: "strategy_type",              value: t_strategy_type },
      { label: "max_position_size_usdc",     value: `$${t_max_position_size_usdc}` },
      { label: "max_daily_loss_percent",     value: `${t_max_daily_loss_percent}%` },
      { label: "allowed_markets",            value: t_allowed_markets.join(", ") || "—" },
      { label: "cooldown_window_seconds",    value: t_cooldown_window_seconds },
      { label: "cumulative_exposure_limit",  value: `$${t_cumulative_exposure_limit}` },
      { label: "order_types",                value: t_order_types.join(", ") || "—" },
      { label: "max_slippage_bps",           value: `${t_max_slippage_bps} bps` },
      { label: "max_position_leverage",      value: `${t_max_position_leverage}×` },
      { label: "rebalance_frequency_hours",  value: `${t_rebalance_frequency_hours}h` },
    ];
    if (selectedType === "lending") return [
      { label: "protocol",                      value: l_protocol },
      { label: "max_supply_usd",                value: `$${l_max_supply_usd}` },
      { label: "allowed_collateral_assets",     value: l_allowed_collateral_assets.join(", ") },
      { label: "allowed_borrow_assets",         value: l_allowed_borrow_assets.join(", ") },
      { label: "max_ltv_percent",               value: `${l_max_ltv_percent}%` },
      { label: "target_ltv_percent",            value: `${l_target_ltv_percent}%` },
      { label: "rebalance_threshold_percent",   value: `${l_rebalance_threshold_percent}%` },
      { label: "max_liquidation_risk_percent",  value: `${l_max_liquidation_risk_percent}%` },
      { label: "max_protocol_exposure_percent", value: `${l_max_protocol_exposure_percent}%` },
      { label: "preferred_assets",              value: l_preferred_assets.join(", ") },
      { label: "min_apy_target_percent",        value: `${l_min_apy_target_percent}%` },
    ];
    if (selectedType === "yield") return [
      { label: "strategy_type",                       value: y_strategy_type },
      { label: "min_apy_percent",                     value: `${y_min_apy_percent}%` },
      { label: "target_apy_percent",                  value: `${y_target_apy_percent}%` },
      { label: "exit_if_apy_below_percent",           value: `${y_exit_if_apy_below_percent}%` },
      { label: "max_slippage_bps",                    value: `${y_max_slippage_bps} bps` },
      { label: "impermanent_loss_tolerance_percent",  value: `${y_impermanent_loss_tolerance_percent}%` },
      { label: "max_stable_pair_concentration",       value: `${y_max_stable_pair_concentration}%` },
      { label: "rebalance_frequency_hours",           value: `${y_rebalance_frequency_hours}h` },
      { label: "max_position_size_usdc",              value: `$${y_max_position_size_usdc}` },
    ];
    if (selectedType === "payments") return [
      { label: "payment_type",                  value: p_payment_type },
      { label: "per_transaction_limit_usdc",    value: `$${p_per_transaction_limit_usdc}` },
      { label: "daily_spend_budget_usdc",       value: `$${p_daily_spend_budget_usdc}` },
      { label: "daily_transaction_count_limit", value: p_daily_transaction_count_limit },
      { label: "require_approval_above_usdc",   value: `$${p_require_approval_above_usdc}` },
      { label: "execution_window",              value: p_execution_window },
      { label: "accept_x402_payments",          value: p_accept_x402_payments ? `Yes (max $${p_x402_max_per_request_usdc})` : "No" },
    ];
    if (selectedType === "analytics") return [
      { label: "tracked_agents",        value: a_tracked_agents },
      { label: "tracked_positions",     value: a_tracked_positions.join(", ") },
      { label: "rule_name",             value: a_rule_name || "—" },
      { label: "condition",             value: a_condition },
      { label: "threshold",             value: a_threshold },
      { label: "action",                value: a_action },
      { label: "notification_target",   value: a_notification_target || "—" },
      { label: "report_frequency",      value: a_report_frequency },
      { label: "report_metrics",        value: a_report_metrics.join(", ") },
      { label: "include_recommendations", value: a_include_recommendations ? "true" : "false" },
      { label: "allow_auto_execute",    value: a_allow_auto_execute ? `true (limit $${a_execution_limit_usdc})` : "false" },
    ];
    if (selectedType === "custom") return [
      { label: "complexity_level",             value: c_complexity_level },
      { label: "target_outcome",               value: c_target_outcome || "—" },
      { label: "allowed_tools",                value: c_allowed_tools.join(", ") || "—" },
      { label: "forbidden_tools",              value: c_forbidden_tools.join(", ") || "None" },
      { label: "max_calls_per_day",            value: c_max_calls_per_day },
      { label: "primary_limit_usdc",           value: `$${c_primary_limit_usdc}` },
      { label: "secondary_limit",              value: `$${c_secondary_limit}` },
      { label: "execution_window",             value: c_execution_window },
      { label: "max_operations_per_hour",      value: c_max_operations_per_hour },
      { label: "circuit_breaker_loss_percent", value: `${c_circuit_breaker_loss_percent}%` },
    ];
    return [];
  })();

  const RowBlock = ({ rows }: { rows: { label: string; value: string }[] }) => (
    <div className="bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] overflow-hidden">
      {rows.map(({ label, value }, i) => (
        <div key={label} className={`flex justify-between items-center px-4 py-2.5 ${i < rows.length - 1 ? "border-b border-[#1d2131]" : ""}`}>
          <code className="text-[10px] [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60">{label}</code>
          <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-[11px] max-w-[55%] text-right truncate">{value}</span>
        </div>
      ))}
    </div>
  );

  /* ═════════════════════════ RENDER ═════════════════════════ */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-[560px] max-h-[90vh] flex flex-col bg-[#0d1017] border border-[#1d2131] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* SUCCESS */}
        {launched && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d1017] gap-5 px-8 overflow-y-auto py-8">
            <div className="w-20 h-20 rounded-full bg-brain-v1dark-orange/20 border border-brain-v1dark-orange/30 flex items-center justify-center flex-shrink-0">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18 6L22 14L31 15.5L24.5 22L26 31L18 27L10 31L11.5 22L5 15.5L14 14L18 6Z" fill="#ff9500" fillOpacity="0.15" stroke="#ff9500" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </div>
            <div className="text-center">
              <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-2xl">{isEditMode ? "Changes saved!" : `${agentName || "Agent"} is live!`}</h3>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">Deployed and policy committed on-chain.</p>
            </div>
            <div className="w-full flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
              {selectedAvatar ? <img src={selectedAvatar} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" /> : (
                <div className="w-10 h-10 rounded-xl bg-brain-v1dark-orange/20 flex items-center justify-center flex-shrink-0 text-lg">{agentTypes.find((t) => t.id === selectedType)?.icon ?? "🤖"}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm truncate">{agentName}</p>
                <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] capitalize">{selectedType} agent</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-brain-v1green animate-pulse" />
                <span className="text-xs text-brain-v1green [font-family:'Gilroy-SemiBold',Helvetica]">Active</span>
              </div>
            </div>
            <div className="w-full bg-[#06070a] rounded-2xl border border-[#1d2131] px-4 py-3 flex flex-col gap-1">
              <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest mb-1">policy_hash</p>
              <code className="text-[10px] text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica] break-all">{policyHash}</code>
            </div>
            <button onClick={() => { onViewMyAgents ? onViewMyAgents() : handleClose(); }}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity flex-shrink-0">
              View in My Agents →
            </button>
          </div>
        )}

        {/* HEADER */}
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

        {/* BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* STEP 0 — Agent Type */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Select the primary function. Each type has a distinct enforcement schema and policy hash composition.</p>
              <div className="grid grid-cols-2 gap-3">
                {agentTypes.map((t) => {
                  const sel = selectedType === t.id;
                  return (
                    <button key={t.id} onClick={() => setSelectedType(t.id)}
                      className={`flex flex-col gap-2 p-4 rounded-2xl border text-left transition-all ${sel ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{t.icon}</span>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sel ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-brain-v1baby-blue-30"}`}>
                          {sel && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                      </div>
                      <div>
                        <div className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm ${sel ? "text-brain-v1light-orange" : "text-white"}`}>{t.label}</div>
                        <div className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5 leading-relaxed">{t.desc}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-brain-v1baby-blue-30" />
                        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'JetBrains_Mono',Helvetica]">{t.use}</span>
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
                <Label>Agent Avatar</Label>
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
                <Label>agent_name *</Label>
                <input value={agentName} onChange={(e) => setAgentName(e.target.value.slice(0, 64))} placeholder={`e.g. My ${agentTypes.find(t => t.id === selectedType)?.label ?? ""} Agent`} className="px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-60 outline-none focus:border-[#414965] transition-colors w-full" />
                <FieldHint>agent_name: max 64 chars · auto-ticker: {agentName ? `$${agentName.toUpperCase().replace(/\s/g, "").slice(0, 8)}` : "—"}</FieldHint>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>agent_description</Label>
                <textarea value={agentDesc} onChange={(e) => setAgentDesc(e.target.value.slice(0, 256))} placeholder="Describe what your agent does and its objective..." rows={3} className="px-4 py-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-60 outline-none focus:border-[#414965] transition-colors w-full resize-none" />
                <FieldHint>agent_description: {agentDesc.length}/256 chars</FieldHint>
              </div>
            </div>
          )}

          {/* STEP 2 — Configuration */}
          {step === 2 && <ConfigStep />}

          {/* STEP 3 — Capital */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Set the initial capital allocation. This value is stored in USDC wei in the BrainAccount smart contract.</p>

              <div className="flex flex-col gap-1.5">
                <Label>capital_allocation *</Label>
                <div className="flex items-center gap-2">
                  <div className={`flex-1 flex items-center gap-2 px-4 h-14 rounded-2xl focus-within:ring-1 transition-all ${balanceError ? "bg-[#2a0a0a] ring-1 ring-[#d20344]" : "bg-[#222737] focus-within:ring-[#414965]"}`}>
                    <span className="text-brain-v1baby-blue-60 text-lg [font-family:'JetBrains_Mono',Helvetica]">$</span>
                    <input value={capital} onChange={(e) => setCapital(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0.00" inputMode="decimal"
                      className={`flex-1 bg-transparent text-xl [font-family:'JetBrains_Mono',Helvetica] outline-none placeholder:text-[#414965] min-w-0 ${balanceError ? "text-[#d20344]" : "text-white"}`} />
                  </div>
                  <select value={capitalAsset} onChange={(e) => setCapitalAsset(e.target.value)} className="px-4 py-3 h-14 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-white text-sm [font-family:'Gilroy-SemiBold',Helvetica] outline-none cursor-pointer">
                    {["USDC", "ETH", "BTC", "MATIC", "BNB"].map((a) => <option key={a} value={a} className="bg-[#0d1017]">{a}</option>)}
                  </select>
                </div>
                {balanceError && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#2a0a0a] border border-[#d20344]/30 rounded-xl">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0"><circle cx="7" cy="7" r="6" stroke="#d20344" strokeWidth="1.2"/><path d="M7 4v3.5M7 9.5v.5" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    <p className="text-xs text-[#d20344] [font-family:'Gilroy-Medium',Helvetica]">Exceeds available balance of ${AVAILABLE_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <FieldHint>capital_allocation: stored as USDC wei in BrainAccount (ERC-4337 smart account)</FieldHint>
              </div>

              <div className="flex gap-2">
                {["1,000", "5,000", "10,000", "50,000"].map((v) => (
                  <button key={v} onClick={() => setCapital(v)} className="flex-1 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 hover:text-white hover:border-[#414965] transition-colors">${v}</button>
                ))}
              </div>

              <div className={`flex items-center justify-between p-4 rounded-2xl border ${balanceError ? "bg-[#2a0a0a] border-[#d20344]/20" : "bg-brain-v1baby-blue-15 border-[#1d2131]"}`}>
                <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">Available balance</span>
                <span className={`text-sm [font-family:'JetBrains_Mono',Helvetica] ${balanceError ? "text-[#d20344]" : "text-brain-v1green"}`}>${AVAILABLE_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC</span>
              </div>

              <div className="bg-brain-v1dark-orange/10 border border-brain-v1dark-orange/20 rounded-2xl p-4">
                <p className="text-xs text-brain-v1light-orange [font-family:'Gilroy-Medium',Helvetica]">⚠️ Capital is allocated to the BrainAccount sub-account for this agent. Unused capital can be withdrawn by calling getAgentSubAccount() and initiating a withdrawal.</p>
              </div>
            </div>
          )}

          {/* STEP 4 — Policy Preview */}
          {step === 4 && (
            <div className="flex flex-col gap-7">
              <div>
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-sm mb-1">Policy Hash</p>
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mb-3">Deterministic keccak256 of your agent's policy parameters. Any change to a field changes the hash. This hash is committed on-chain via <code className="text-[#a8b9f4] [font-family:'JetBrains_Mono',Helvetica]">setPolicy(bytes32)</code>.</p>
                <PolicyHashSection />
              </div>

              <div className="border-t border-[#1d2131] pt-5">
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-sm mb-1">Enforcement Stack</p>
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mb-3">Three independent layers enforce your policy at every stage of the execution pipeline.</p>
                <EnforcementStack />
              </div>

              <div className="border-t border-[#1d2131] pt-5">
                <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-sm mb-1">Claude Tool Schema</p>
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mb-3">Tool definitions available to the ReAct loop for this agent type.</p>
                <ToolSchemaSection />
              </div>
            </div>
          )}

          {/* STEP 5 — Authorization */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Authorize the agent to operate within the defined policy. This commits the policy hash on-chain.</p>
              <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                  Authorizing will call <code className="text-[#a8b9f4] [font-family:'JetBrains_Mono',Helvetica]">authorizeAgent(agent_id, capital_allocation)</code> on your BrainAccount. Policy hash <code className="text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica]">{policyHash.slice(0, 14)}…</code> will be committed via <code className="text-[#a8b9f4] [font-family:'JetBrains_Mono',Helvetica]">setPolicy(bytes32)</code>. You can revoke at any time via <code className="text-[#a8b9f4] [font-family:'JetBrains_Mono',Helvetica]">revokeAgent(agent_id)</code>.
                </p>
              </div>
              {[
                { id: "auth", label: "I authorize this agent to act on my behalf", sublabel: "The agent will operate within the defined policy hash commitment.", val: authSig, set: setAuthSig },
                { id: "terms", label: "I agree to the Brain Finance Agent Terms", sublabel: "Including liability, risk disclosures, and platform policies.", val: terms, set: setTerms },
              ].map(({ id, label, sublabel, val, set }) => (
                <button key={id} onClick={() => set(!val)} className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all w-full ${val ? "border-brain-v1dark-orange bg-[#2a1500]" : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${val ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-[#414965]"}`}>
                    {val && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <div>
                    <p className={`text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${val ? "text-brain-v1light-orange" : "text-white"}`}>{label}</p>
                    <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5">{sublabel}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* STEP 6 — Review */}
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">Review all schema fields before launching.</p>

              {/* Identity card */}
              <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                {selectedAvatar ? <img src={selectedAvatar} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" /> : (
                  <div className="w-12 h-12 rounded-xl bg-brain-v1dark-orange flex items-center justify-center text-xl flex-shrink-0">{agentTypes.find((t) => t.id === selectedType)?.icon ?? "🤖"}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-base truncate">{agentName || "Unnamed Agent"}</p>
                  {agentDesc && <p className="text-[11px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] mt-0.5 line-clamp-1">{agentDesc}</p>}
                </div>
                <span className="px-3 py-1 bg-brain-v1dark-orange/20 rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] capitalize flex-shrink-0">{selectedType}</span>
              </div>

              <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest px-1">Core Inputs</p>
              <RowBlock rows={[
                { label: "agent_name",          value: agentName || "—" },
                { label: "agent_type",          value: selectedType },
                { label: "capital_allocation",  value: capital ? `$${capital} ${capitalAsset}` : "—" },
                { label: "status",              value: "deployed" },
                { label: "version",             value: "1" },
              ]} />

              {reviewRows.length > 0 && (
                <>
                  <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest px-1">{selectedType} Policy Params</p>
                  <RowBlock rows={reviewRows} />
                </>
              )}

              {selectedType === "custom" && c_objective && (
                <div className="p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131]">
                  <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'JetBrains_Mono',Helvetica] mb-2">objective</p>
                  <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed line-clamp-4">{c_objective}</p>
                </div>
              )}

              <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-widest px-1">Policy Commitment</p>
              <div className="p-4 bg-[#06070a] rounded-2xl border border-[#1d2131] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <code className="text-[10px] text-brain-v1baby-blue-30 [font-family:'JetBrains_Mono',Helvetica]">policy_hash (keccak256)</code>
                  <span className="text-[10px] text-[#42bf23] [font-family:'Gilroy-SemiBold',Helvetica]">verified ✓</span>
                </div>
                <code className="text-[10px] text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica] break-all leading-relaxed">{policyHash}</code>
                <FieldHint>Committed via setPolicy(bytes32) on your BrainAccount. Any config change invalidates this hash.</FieldHint>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
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
