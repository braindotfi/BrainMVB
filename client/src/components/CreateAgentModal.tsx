import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { keccak256 } from "viem";
import { apiRequest } from "@/lib/queryClient";
import { AgentPrefillData } from "@/lib/navContext";
import { ChevronLeft, X, Plus, ChevronDown, ChevronUp, Info, Image as ImageIcon, Wallet, Trash2 } from "lucide-react";

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
  { id: "trading",   label: "Trading",   desc: "An agent that executes trades, manages risk, and acts on your strategy automatically." },
  { id: "lending",   label: "Lending",   desc: "An agent that manages borrowing and lending strategies based on your goals." },
  { id: "yield",     label: "Yield",     desc: "An agent that moves capital across strategies to maximize yield automatically." },
  { id: "payments",  label: "Payments",  desc: "An agent that automates transfers, recurring payments, and treasury flows." },
  { id: "analytics", label: "Analytics", desc: "An agent that tracks performance, surfaces insights, and helps guide decisions." },
  { id: "custom",    label: "Custom",    desc: "An agent built around your own strategy, rules, and financial workflows." },
];

const avatarOptions = [
  "/figmaAssets/avatars.svg", "/figmaAssets/avatars-1.svg", "/figmaAssets/avatars-2.svg",
  "/figmaAssets/avatars-3.svg", "/figmaAssets/avatars-4.svg", "/figmaAssets/avatars-5.svg",
  "/figmaAssets/avatars-6.svg", "/figmaAssets/avatars-7.svg", "/figmaAssets/avatars-8.svg",
  "/figmaAssets/avatars-9.svg",
];

/* ─── Outer helper components (safe for HMR) ─── */

const RadioCard = ({
  label, desc, checked, onClick, small = false
}: { label: string; desc?: string; checked: boolean; onClick: () => void; small?: boolean }) => (
  <div
    onClick={onClick}
    className="bg-[#0a0c10] p-[16px] rounded-[16px] flex flex-col gap-[4px] cursor-pointer"
  >
    <div className="flex items-start justify-between">
      <p className={`font-['Gilroy-Medium',sans-serif] text-[#6c779d] whitespace-nowrap ${small ? "text-[14px]" : "text-[16px]"} leading-[20px]`}>
        {label}
      </p>
      <div className={`relative overflow-hidden size-[20px] rounded-full border flex-shrink-0 ${checked ? "bg-[#240757] border-[rgba(118,49,238,0.2)]" : "bg-[#06070a] border-[#222737]"}`}>
        {checked && <div className="absolute inset-[20%] rounded-full bg-[#7631ee]" />}
      </div>
    </div>
    {desc && <p className="font-['Gilroy-Medium',sans-serif] text-[#414965] text-[12px] leading-[12px]">{desc}</p>}
  </div>
);

const PolicyInfoCard = ({
  label, value, valueColor = "#a8b9f4", valueNode
}: { label: string; value: string; valueColor?: string; valueNode?: React.ReactNode }) => (
  <div className="bg-[#0a0c10] flex flex-col h-[58px] items-start p-[12px] rounded-[16px]">
    <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[12px] leading-[14px]">{label}</p>
    {valueNode
      ? <div className="mt-auto">{valueNode}</div>
      : <p className="font-['Gilroy-Medium',sans-serif] text-[14px] leading-[20px] mt-auto" style={{ color: valueColor }}>{value}</p>
    }
  </div>
);

const SectionDivider = ({ title }: { title: string }) => (
  <div className="flex gap-[8px] items-center w-full">
    <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[14px] leading-[14px] whitespace-nowrap">{title}</p>
    <div className="flex-1 h-px bg-[#1d2132]" />
  </div>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[14px] leading-[20px]">{children}</p>
);

const TextInput = ({
  value, onChange, placeholder, type = "text"
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    type={type}
    placeholder={placeholder}
    className="bg-[#222737] rounded-[8px] px-[8px] py-[10px] text-white text-[16px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none w-full"
  />
);

const LargeInput = ({
  value, onChange, placeholder
}: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="bg-[#222737] rounded-[16px] px-[16px] py-[14px] flex items-center">
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-transparent text-white text-[16px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none w-full"
    />
  </div>
);

const ChipGroup = ({
  options, selected, onToggle
}: { options: string[]; selected: string[]; onToggle: (v: string) => void }) => (
  <div className="flex flex-wrap gap-[8px]">
    {options.map((opt) => {
      const sel = selected.includes(opt);
      return (
        <button
          key={opt}
          onClick={() => onToggle(opt)}
          className={`px-[12px] py-[6px] rounded-[8px] text-[12px] font-['Gilroy-SemiBold',sans-serif] border transition-all ${sel ? "border-[#7631ee] bg-[#240757] text-[#a8b9f4]" : "border-[#222737] bg-[#0a0c10] text-[#6c779d] hover:border-[#414965]"}`}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

const TypeBadge = ({ type }: { type: string }) => (
  <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] flex items-center justify-center px-[8px] py-[3px] rounded-[22px]">
    <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[11px] leading-[14px] text-center capitalize whitespace-nowrap">{type}</p>
  </div>
);

const ConfigSlider = ({
  min, max, value, onChange, unit = "%"
}: { min: number; max: number; value: string; onChange: (v: string) => void; unit?: string }) => {
  const n = Math.min(max, Math.max(min, Number(value) || min));
  const pct = Math.round(((n - min) / (max - min)) * 100);
  return (
    <div className="w-full flex flex-col gap-0">
      <div className="relative h-[12px] w-full mb-[8px]">
        <span className="absolute left-0 font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[11px] leading-[12px]">{min}{unit}</span>
        <span className="absolute right-0 font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[11px] leading-[12px]">{max}{unit}</span>
        <span
          className="absolute -translate-x-1/2 font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[11px] leading-[12px]"
          style={{ left: `${pct}%` }}
        >{n}{unit}</span>
      </div>
      <div className="relative h-[32px] flex items-center w-full">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[#222737]" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[#FF9500]" style={{ width: `${pct}%` }} />
        <input
          type="range" min={min} max={max} value={n}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          style={{ height: "32px", margin: 0 }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-[24px] rounded-full bg-white border-[4px] border-[#11141b] pointer-events-none"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const SmallDropdown = ({
  label, value, options, open, onOpen, onChange
}: { label: string; value: string; options: { label: string; value: string }[]; open: boolean; onOpen: () => void; onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-[4px]">
    <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[14px] leading-[20px]">{label}</p>
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        data-testid={`dropdown-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className="bg-[#222737] flex gap-[8px] items-center p-[8px] rounded-[8px] w-full h-[40px] cursor-pointer"
      >
        <span className="flex-1 text-left font-['Gilroy-Medium',sans-serif] text-white text-[16px] leading-[20px]">
          {options.find(o => o.value === value)?.label ?? value}
        </span>
        <ChevronDown size={24} className="text-[#6c779d] shrink-0" />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-[#0a0c10] rounded-[12px] overflow-hidden py-[8px]" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="w-full text-left px-[8px] h-[36px] flex items-center font-['Gilroy-Medium',sans-serif] text-[16px] text-[#a8b9f4] hover:bg-[#1d2132] transition-colors"
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  </div>
);

const ALL_CUSTOM_TOOLS_LIST = ["Read Balance","Read Orderbook","Read Market Data","Place Limit Order","Cancel Order","Place Market Order","Open Perp","Transfer Internal","Withdraw External","Contract Call"];

/* ─── Helpers ─── */
const formatUsd = (raw: string): string => {
  const clean = raw.replace(/[^0-9.]/g, "");
  if (!clean) return "";
  const [int, ...dec] = clean.split(".");
  return dec.length ? `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec.join("").slice(0, 2)}` : int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
const parseUsd = (v: string): number => parseFloat(v.replace(/,/g, "")) || 0;
function tog<T>(arr: T[], v: T): T[] { return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]; }

function computePolicyHash(type: string, params: Record<string, unknown>): string {
  const canonical = { agent_type: type, ...Object.fromEntries(Object.entries(params).sort()) };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  return keccak256(bytes);
}

/* ═══════════════════════ MAIN COMPONENT ═══════════════════════ */
export const CreateAgentModal = ({ open, onClose, onViewMyAgents, initialStep = 0, prefill, agentId }: Props): JSX.Element | null => {
  const isEditMode = !!prefill && !!agentId;
  const [step, setStep] = useState(initialStep);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  /* ── Core inputs ── */
  const [selectedType, setSelectedType] = useState("");
  const [agentName, setAgentName]       = useState("");
  const [agentDesc, setAgentDesc]       = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [avatarFileName, setAvatarFileName] = useState("");
  const [capital, setCapital]             = useState("");
  const [capitalAsset, setCapitalAsset]   = useState("USDC");
  const [showAssetDrop, setShowAssetDrop] = useState(false);

  /* ── Launch state ── */
  const [authSig, setAuthSig] = useState(false);
  const [terms, setTerms]     = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched]   = useState(false);

  /* ══ TRADING ══ */
  const [t_strategy_type, setT_strategy_type]                   = useState("perpetual_long_short");
  const [t_max_position_size_usdc, setT_max_position_size_usdc] = useState("10,000");
  const [t_max_daily_loss_percent, setT_max_daily_loss_percent] = useState("20");
  const [t_allowed_markets, setT_allowed_markets]               = useState<string[]>(["BTC-USDC", "ETH-USDC"]);
  const [t_cooldown_window_seconds, setT_cooldown_window_seconds] = useState("3600");
  const [t_cumulative_exposure_limit, setT_cumulative_exposure_limit] = useState("50,000");
  const [t_daily_spend_cap, setT_daily_spend_cap]               = useState("10,000");
  const [t_order_types, setT_order_types]                       = useState<string[]>(["stop_limit"]);
  const [t_max_slippage_bps, setT_max_slippage_bps]             = useState("30");
  const [t_max_position_leverage, setT_max_position_leverage]   = useState("3");
  const [t_kill_switch_drawdown, setT_kill_switch_drawdown]     = useState("17");
  const [t_open_drop, setT_open_drop]                           = useState<null | string>(null);

  /* ══ LENDING ══ */
  const [l_protocol, setL_protocol]                               = useState("morpho");
  const [l_max_supply_usd, setL_max_supply_usd]                   = useState("50,000");
  const [l_allowed_collateral_assets, setL_allowed_collateral_assets] = useState<string[]>(["ETH", "WBTC", "stETH"]);
  const [l_allowed_borrow_assets, setL_allowed_borrow_assets]     = useState<string[]>(["USDC", "DAI"]);
  const [l_max_ltv_percent, setL_max_ltv_percent]                 = useState("70");
  const [l_target_ltv_percent, setL_target_ltv_percent]           = useState("55");
  const [l_rebalance_threshold_percent, setL_rebalance_threshold_percent] = useState("5");
  const [l_max_liquidation_risk_percent, setL_max_liquidation_risk_percent] = useState("10");
  const [l_max_protocol_exposure_percent, setL_max_protocol_exposure_percent] = useState("80");
  const [l_min_apy_target_percent, setL_min_apy_target_percent]   = useState("4");

  /* ══ YIELD ══ */
  const [y_strategy_type, setY_strategy_type]                     = useState("stable_farming");
  const [y_min_apy_percent, setY_min_apy_percent]                 = useState("4");
  const [y_target_apy_percent, setY_target_apy_percent]           = useState("8");
  const [y_exit_if_apy_below_percent, setY_exit_if_apy_below_percent] = useState("3");
  const [y_max_slippage_bps, setY_max_slippage_bps]               = useState("133");
  const [y_max_stable_pair_concentration, setY_max_stable_pair_concentration] = useState("40");
  const [y_max_position_size_usdc, setY_max_position_size_usdc]   = useState("25,000");
  const [y_protocols, setY_protocols] = useState<string[]>(["Morphy", "Aave v3"]);

  /* ══ PAYMENTS ══ */
  const [p_payment_type, setP_payment_type]                         = useState("recurring_bills");
  const [p_per_transaction_limit_usdc, setP_per_transaction_limit_usdc] = useState("10,000");
  const [p_daily_spend_budget_usdc, setP_daily_spend_budget_usdc]   = useState("25,000");
  const [p_require_approval_above_usdc, setP_require_approval_above_usdc] = useState("1,000");
  const [p_counterparty_velocity, setP_counterparty_velocity]       = useState("50,000");

  /* ══ ANALYTICS ══ */
  const [a_tracked_agents, setA_tracked_agents]   = useState("all");
  const [a_report_frequency, setA_report_frequency] = useState("daily");
  const [a_critical_routing, setA_critical_routing] = useState("Dash + Slack + SMS");
  const [a_max_alerts_per_day, setA_max_alerts_per_day] = useState("50");
  const [a_compute_cap, setA_compute_cap]         = useState("250");
  const [a_allowed_actions, setA_allowed_actions] = useState("pause_agent_only");

  /* ══ CUSTOM ══ */
  const [c_objective, setC_objective]             = useState("");
  const [c_complexity_level, setC_complexity_level] = useState("medium");
  const [c_source_type, setC_source_type]         = useState("github_repo");
  const [c_runtime, setC_runtime]                 = useState("Node 20");
  const [c_repo_url, setC_repo_url]               = useState("");
  const [c_allowed_tools, setC_allowed_tools]     = useState<string[]>(["Read Balance", "Read Orderbook", "Read Market Data", "Place Limit Order"]);
  const [c_primary_limit, setC_primary_limit]     = useState("5,000");
  const [c_secondary_limit, setC_secondary_limit] = useState("500");

  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  /* ── Policy params ── */
  const policyParams = useMemo<Record<string, unknown>>(() => {
    if (selectedType === "trading") return {
      strategy_type: t_strategy_type,
      max_position_size_usdc: parseUsd(t_max_position_size_usdc),
      max_daily_loss_percent: parseInt(t_max_daily_loss_percent),
      kill_switch_drawdown: parseInt(t_kill_switch_drawdown),
      allowed_markets: t_allowed_markets,
      cooldown_window_seconds: parseInt(t_cooldown_window_seconds),
      cumulative_exposure_limit: parseUsd(t_cumulative_exposure_limit),
      daily_spend_cap: parseUsd(t_daily_spend_cap),
      order_types: t_order_types,
      max_slippage_bps: parseInt(t_max_slippage_bps),
      max_position_leverage: parseInt(t_max_position_leverage),
    };
    if (selectedType === "lending") return {
      protocol: l_protocol,
      max_supply_usd: parseUsd(l_max_supply_usd),
      allowed_collateral_assets: l_allowed_collateral_assets,
      allowed_borrow_assets: l_allowed_borrow_assets,
      max_ltv_percent: parseInt(l_max_ltv_percent),
      target_ltv_percent: parseInt(l_target_ltv_percent),
      rebalance_threshold_percent: parseInt(l_rebalance_threshold_percent),
      max_liquidation_risk_percent: parseInt(l_max_liquidation_risk_percent),
      max_protocol_exposure_percent: parseInt(l_max_protocol_exposure_percent),
      min_apy_target_percent: parseInt(l_min_apy_target_percent),
    };
    if (selectedType === "yield") return {
      strategy_type: y_strategy_type,
      min_apy_percent: parseInt(y_min_apy_percent),
      target_apy_percent: parseInt(y_target_apy_percent),
      exit_if_apy_below_percent: parseInt(y_exit_if_apy_below_percent),
      max_slippage_bps: parseInt(y_max_slippage_bps),
      max_stable_pair_concentration: parseInt(y_max_stable_pair_concentration),
      max_position_size_usdc: parseUsd(y_max_position_size_usdc),
      protocol_allowlist: y_protocols,
    };
    if (selectedType === "payments") return {
      payment_type: p_payment_type,
      per_transaction_limit_usdc: parseUsd(p_per_transaction_limit_usdc),
      daily_spend_budget_usdc: parseUsd(p_daily_spend_budget_usdc),
      require_approval_above_usdc: parseUsd(p_require_approval_above_usdc),
      counterparty_velocity_usdc: parseUsd(p_counterparty_velocity),
    };
    if (selectedType === "analytics") return {
      tracked_agents: a_tracked_agents,
      report_frequency: a_report_frequency,
      critical_routing: a_critical_routing,
      max_alerts_per_day: parseInt(a_max_alerts_per_day),
      compute_cap_usdc: parseUsd(a_compute_cap),
      allowed_actions: a_allowed_actions,
      execution_whitelist: [a_allowed_actions],
    };
    if (selectedType === "custom") return {
      objective: c_objective,
      complexity_level: c_complexity_level,
      source_type: c_source_type,
      runtime: c_runtime,
      repo_url: c_repo_url,
      allowed_tools: c_allowed_tools,
      forbidden_tools: ALL_CUSTOM_TOOLS_LIST.filter(t => !c_allowed_tools.includes(t)),
      primary_limit_usdc: parseUsd(c_primary_limit),
      secondary_limit_usdc: parseUsd(c_secondary_limit),
    };
    return {};
  }, [selectedType, t_strategy_type, t_max_position_size_usdc, t_max_daily_loss_percent, t_kill_switch_drawdown, t_allowed_markets, t_cooldown_window_seconds, t_cumulative_exposure_limit, t_daily_spend_cap, t_order_types, t_max_slippage_bps, t_max_position_leverage, l_protocol, l_max_supply_usd, l_allowed_collateral_assets, l_allowed_borrow_assets, l_max_ltv_percent, l_target_ltv_percent, l_rebalance_threshold_percent, l_max_liquidation_risk_percent, l_max_protocol_exposure_percent, l_min_apy_target_percent, y_strategy_type, y_min_apy_percent, y_target_apy_percent, y_exit_if_apy_below_percent, y_max_slippage_bps, y_max_stable_pair_concentration, y_max_position_size_usdc, y_protocols, p_payment_type, p_per_transaction_limit_usdc, p_daily_spend_budget_usdc, p_require_approval_above_usdc, p_counterparty_velocity, a_tracked_agents, a_report_frequency, a_critical_routing, a_max_alerts_per_day, a_compute_cap, a_allowed_actions, c_objective, c_complexity_level, c_source_type, c_runtime, c_repo_url, c_allowed_tools, c_primary_limit, c_secondary_limit]);

  const policyHash = useMemo(() => selectedType ? computePolicyHash(selectedType, policyParams) : "", [selectedType, policyParams]);

  /* ── Reset on open ── */
  useEffect(() => {
    if (!open) return;
    setStep(initialStep ?? 0);
    setLaunched(false); setLaunching(false); setAuthSig(false); setTerms(false);
    setShowAvatarPicker(false);
    if (!prefill) return;
    setSelectedType(prefill.type || "");
    setAgentName(prefill.name || "");
    setAgentDesc(prefill.description || "");
    setSelectedAvatar(prefill.avatar || "");
    setCapital(prefill.capital || "");
    setCapitalAsset(prefill.capitalAsset || "USDC");
    if (prefill.maxLTV) setL_max_ltv_percent(prefill.maxLTV);
    if (prefill.targetAPY) setY_target_apy_percent(prefill.targetAPY);
    if (prefill.minAPY) setY_min_apy_percent(prefill.minAPY);
    if (prefill.maxSinglePayment) setP_per_transaction_limit_usdc(prefill.maxSinglePayment);
    if (prefill.monthlyBudgetCap) setP_daily_spend_budget_usdc(prefill.monthlyBudgetCap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capitalNum = parseUsd(capital);
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
    if (step === 2) return !!capital;
    if (step === 4) return isEditMode || (authSig && terms);
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

  /* ── Derived values for confirmation ── */
  const demoAgentId    = policyHash ? "0x" + policyHash.slice(2, 10).toLowerCase() : "0x7c8af41b";
  const demoSubAccount = policyHash ? "0x" + policyHash.slice(10, 14).toLowerCase() + "…" + policyHash.slice(-4).toLowerCase() : "0x4a2f…e8b1";
  const demoTxId       = policyHash ? "0x" + policyHash.slice(18, 22).toLowerCase() + "…" + policyHash.slice(-4).toLowerCase() : "0xf2e1…48c9";
  const demoPolicyShort = policyHash ? policyHash.slice(0, 6) + "…" + policyHash.slice(-4) : "0x9f3c…6a5f";

  /* ── Policy preview cards per type ── */
  const policyPreviewCards: { label: string; value: string; valueColor?: string; valueNode?: React.ReactNode }[] = (() => {
    if (selectedType === "trading") return [
      { label: "Max Daily Loss",        value: `-${t_max_daily_loss_percent}%` },
      { label: "Kill Switch",           value: `-${t_kill_switch_drawdown}%` },
      { label: "Approval Threshold",    value: `> 90%` },
      { label: "Markets",               value: t_allowed_markets.join(" · "), valueNode: (
          <div className="flex gap-[4px] items-center mt-auto">
            {t_allowed_markets.slice(0, 3).map((m, i) => (
              <span key={m} className="flex items-center gap-[4px]">
                {i > 0 && <span className="inline-block size-[4px] rounded-full bg-[#6c779d]" />}
                <span className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[14px] leading-[20px]">{m}</span>
              </span>
            ))}
          </div>
        )
      },
      { label: "Order Types",           value: t_order_types.map(o => o.replace(/_/g, " ")).join(" · "), valueNode: (
          <div className="flex gap-[4px] items-center mt-auto">
            {t_order_types.map((o, i) => (
              <span key={o} className="flex items-center gap-[4px]">
                {i > 0 && <span className="inline-block size-[4px] rounded-full bg-[#6c779d]" />}
                <span className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[14px] leading-[20px] capitalize">{o.replace(/_/g, " ")}</span>
              </span>
            ))}
          </div>
        )
      },
      { label: "Cooldown",              value: `${t_cooldown_window_seconds}s` },
      { label: "Max Position Size",     value: `$${Number(t_max_position_size_usdc).toLocaleString()}` },
      { label: "Cumulative Exposure",   value: `$${Number(t_cumulative_exposure_limit).toLocaleString()}` },
      { label: "Max Leverage",          value: `${t_max_position_leverage}×` },
      { label: "Strategy",              value: t_strategy_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) },
      { label: "Capital Allocated",     value: `$${Number(capital || 0).toLocaleString()} ${capitalAsset}` },
      { label: "Daily Spend Cap",       value: `$${Number(t_daily_spend_cap).toLocaleString()}` },
    ];
    if (selectedType === "lending") return [
      { label: "Borrow Assets",    value: l_allowed_borrow_assets.join(", ") },
      { label: "Min APY Target",   value: `${l_min_apy_target_percent}%` },
      { label: "Max LTV",          value: `${l_max_ltv_percent}%` },
      { label: "Target LTV",       value: `${l_target_ltv_percent}%` },
      { label: "Max Supply",       value: `$${l_max_supply_usd}` },
      { label: "Protocol",         value: l_protocol },
    ];
    if (selectedType === "yield") return [
      { label: "Strategy",       value: y_strategy_type.replace(/_/g, " ") },
      { label: "Target APY",     value: `${y_target_apy_percent}%` },
      { label: "Min APY",        value: `${y_min_apy_percent}%` },
      { label: "Max Slippage",   value: `${y_max_slippage_bps} bps` },
      { label: "Max Position",   value: `$${y_max_position_size_usdc}` },
      { label: "Stable Conc.",   value: `${y_max_stable_pair_concentration}%` },
    ];
    if (selectedType === "payments") return [
      { label: "Payment Type",    value: p_payment_type.replace(/_/g, " ") },
      { label: "Per-TX Limit",    value: `$${p_per_transaction_limit_usdc}` },
      { label: "Daily Budget",    value: `$${p_daily_spend_budget_usdc}` },
      { label: "Approve Above",   value: `$${p_require_approval_above_usdc}` },
      { label: "Velocity (24h)",  value: `$${p_counterparty_velocity}` },
      { label: "Sanctions",       value: "OFAC + Chainalysis" },
    ];
    if (selectedType === "analytics") return [
      { label: "Tracked Agents",    value: "All (5)" },
      { label: "Tracked Positions", value: "All open" },
      { label: "Reporting",         value: a_report_frequency },
      { label: "Alerts/Day Cap",    value: a_max_alerts_per_day },
      { label: "Compute Cap",       value: `$${a_compute_cap}/mo` },
      { label: "Allowed Actions",   value: "Pause only" },
    ];
    if (selectedType === "custom") return [
      { label: "Complexity",       value: c_complexity_level },
      { label: "Source Type",      value: c_source_type.replace(/_/g, " ") },
      { label: "Primary Limit",    value: `$${c_primary_limit}` },
      { label: "Secondary Limit",  value: `$${c_secondary_limit}` },
      { label: "Tools Enabled",    value: `${c_allowed_tools.length} tools` },
      { label: "Runtime",          value: c_runtime },
    ];
    return [];
  })();

  /* ═════════════════════ RENDER ═════════════════════ */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal shell */}
      <div className="relative z-10 w-[480px] max-h-[90vh] flex flex-col bg-[#11141b] border border-[#1d2132] rounded-[24px] overflow-hidden shadow-2xl">

        {/* ══ CONFIRMATION SCREEN (no header) ══ */}
        {launched && (
          <div className="flex flex-col gap-[24px] p-[24px] overflow-y-auto">
            {/* Centered avatar + title + badge */}
            <div className="flex flex-col gap-[24px] items-center w-full">
              <div className="flex flex-col gap-[16px] items-center w-full">
                <div className="rounded-[20px] size-[64px] overflow-hidden bg-[#1d2132]">
                  {selectedAvatar
                    ? <img src={selectedAvatar} alt="" className="size-full object-cover" />
                    : <div className="size-full flex items-center justify-center text-2xl">🤖</div>
                  }
                </div>
                <div className="flex flex-col gap-[4px] items-center w-full">
                  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[20px] leading-[28px] text-center w-full">
                    {agentName || "Agent"} is live!
                  </p>
                  <TypeBadge type={selectedType} />
                </div>
              </div>

              {/* Info grid 2×3 */}
              <div className="grid grid-cols-2 gap-[8px] w-full">
                <PolicyInfoCard label="Agent ID"          value={demoAgentId} />
                <PolicyInfoCard label="Sub-Account"       value={demoSubAccount} />
                <PolicyInfoCard label="Policy Hash"       value={demoPolicyShort} valueColor="#42bf23" />
                <PolicyInfoCard label="Allocated Capital" value={`$${capital || "0"} ${capitalAsset}`} />
                <PolicyInfoCard label="ERC-8004 Registry" value="Registered" valueColor="#42bf23" />
                <PolicyInfoCard label="Deployment TX ID"  value={demoTxId} />
              </div>
            </div>

            {/* Base network info row */}
            <div className="border border-[#1d2132] flex items-center gap-[8px] p-[8px] rounded-[12px] w-full">
              <img src="/figmaAssets/base.png" alt="Base" className="size-[16px] object-contain" />
              <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[13px] flex-1">Deployed on Base network</p>
              <p className="font-['Gilroy-Medium',sans-serif] text-[#42bf23] text-[12px]">✓ Confirmed</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-[8px] w-full">
              <button
                onClick={handleClose}
                data-testid="button-home"
                className="flex-1 border border-[#1d2132] font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[16px] leading-[20px] px-[20px] py-[10px] rounded-[100px] hover:border-[#414965] hover:text-white transition-all"
              >
                Home
              </button>
              <button
                onClick={() => { onViewMyAgents ? onViewMyAgents() : handleClose(); }}
                data-testid="button-view-agent"
                className="flex-1 bg-[#4a2300] font-['Gilroy-SemiBold',sans-serif] text-[#ff9500] text-[16px] leading-[20px] px-[20px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity"
              >
                View Agent →
              </button>
            </div>
          </div>
        )}

        {/* ══ HEADER BAR (steps 0-4) ══ */}
        {!launched && (
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] flex-shrink-0 h-[56px] relative flex items-center justify-center w-full">
            {/* Back button (step 1+) */}
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="absolute left-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
              >
                <ChevronLeft size={16} className="text-[#6c779d]" />
              </button>
            )}

            {/* Pagination dots — pill bg #12032D, active #7631EE, inactive #240757 */}
            <div className="flex items-center justify-center h-[24px] px-[12px] py-[8px] rounded-[100px]" style={{ background: "#12032D" }}>
              <div className="flex items-center gap-[8px]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="rounded-full shrink-0 transition-colors duration-300"
                    style={{
                      width: 8, height: 8,
                      background: i <= step ? "#7631EE" : "#240757",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute right-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
            >
              <X size={16} className="text-[#6c779d]" />
            </button>
          </div>
        )}

        {/* ══ BODY (steps 0-4) ══ */}
        {!launched && (
          <div className="flex flex-col gap-[24px] items-start p-[24px] overflow-y-auto flex-1">

            {/* ── STEP 0: Agent Type ── */}
            {step === 0 && (
              <div className="flex flex-col gap-[24px] items-start w-full">
                <div className="flex flex-col items-start w-full">
                  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[20px] leading-[28px] w-full">
                    Create an Agent
                  </p>
                  <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] w-full">
                    Select the primary function. Each type has a distinct enforcement schema and policy hash composition.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-[12px] items-start w-full">
                  {agentTypes.map((t) => (
                    <RadioCard
                      key={t.id}
                      label={t.label}
                      desc={t.desc}
                      checked={selectedType === t.id}
                      onClick={() => setSelectedType(t.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP 1: Agent Identity ── */}
            {step === 1 && (
              <div className="flex flex-col gap-[24px] items-start w-full">
                <div className="flex flex-col items-start w-full">
                  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[20px] leading-[28px] w-full">
                    Agents Identity
                  </p>
                  <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] w-full">
                    Give your agent a name and avatar so you can identify it on your dashboard.
                  </p>
                </div>

                <div className="flex flex-col gap-[16px] items-start w-full">
                  {/* Avatar picker row */}
                  {selectedAvatar ? (
                    /* ── Selected state: thumbnail + filename + red trash ── */
                    <div className="bg-[#0a0c10] flex items-center h-[64px] px-[16px] rounded-[16px] w-full">
                      {/* Avatar thumbnail — clickable to change */}
                      <div
                        className="relative overflow-hidden rounded-[20px] size-[40px] shrink-0 cursor-pointer"
                        onClick={() => setShowAvatarPicker((v) => !v)}
                      >
                        <img src={selectedAvatar} alt="" className="absolute inset-0 size-full object-cover" />
                      </div>
                      {/* Filename */}
                      <p className="flex-1 mx-[8px] font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[16px] leading-[20px] truncate min-w-0">
                        {avatarFileName || selectedAvatar.split("/").pop() || "avatar"}
                      </p>
                      {/* Red trash button */}
                      <button
                        type="button"
                        data-testid="button-remove-avatar"
                        className="size-[40px] rounded-[100px] bg-[#2d0808] flex items-center justify-center shrink-0 hover:bg-[#3d0c0c] transition-colors"
                        onClick={() => { setSelectedAvatar(""); setAvatarFileName(""); setShowAvatarPicker(false); }}
                      >
                        <Trash2 size={18} className="text-[#FF3B30]" />
                      </button>
                    </div>
                  ) : (
                    /* ── Empty state: clickable row to open picker ── */
                    <div
                      className="bg-[#0a0c10] flex gap-[8px] h-[64px] items-center px-[16px] rounded-[16px] w-full cursor-pointer"
                      onClick={() => setShowAvatarPicker((v) => !v)}
                    >
                      <div className="relative overflow-hidden rounded-[20px] size-[40px] shrink-0">
                        <div className="absolute inset-0 bg-[#1d2132]" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon size={20} className="text-[#6c779d]" />
                        </div>
                      </div>
                      <p className="flex-1 font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[20px] leading-[24px] min-w-0 truncate">
                        Add Avatar
                      </p>
                      <button
                        type="button"
                        className="rounded-[100px] bg-[#1d2132] flex items-center justify-center shrink-0 size-[32px] hover:bg-[#222737] transition-colors"
                        onClick={(e) => { e.stopPropagation(); setShowAvatarPicker((v) => !v); }}
                      >
                        <Plus size={16} className="text-[#6c779d]" />
                      </button>
                    </div>
                  )}

                  {/* Avatar grid picker */}
                  {showAvatarPicker && (
                    <div className="grid grid-cols-5 gap-[8px] w-full p-[12px] bg-[#0a0c10] rounded-[16px]">
                      {avatarOptions.map((av) => (
                        <button
                          key={av}
                          onClick={() => { setSelectedAvatar(av); setAvatarFileName(""); setShowAvatarPicker(false); }}
                          className={`rounded-[12px] overflow-hidden border-2 transition-all ${selectedAvatar === av ? "border-[#7631ee]" : "border-transparent hover:border-[#414965]"}`}
                        >
                          <img src={av} alt="" className="w-full aspect-square object-cover" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Name */}
                  <div className="flex flex-col gap-[4px] items-start w-full">
                    <FieldLabel>Name</FieldLabel>
                    <TextInput
                      value={agentName}
                      onChange={(v) => setAgentName(v.slice(0, 64))}
                      placeholder="e.g. Enterprise Agent"
                    />
                  </div>

                  {/* Description — h-[120px] fixed, pill counter at bottom-right */}
                  <div className="flex flex-col gap-[4px] items-start w-full">
                    <FieldLabel>Description</FieldLabel>
                    <div className="relative w-full h-[120px]">
                      <textarea
                        value={agentDesc}
                        onChange={(e) => setAgentDesc(e.target.value.slice(0, 1000))}
                        placeholder="Descibe what your agent does..."
                        className="bg-[#222737] rounded-[8px] px-[8px] py-[10px] text-white text-[16px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none w-full h-full resize-none"
                      />
                      {/* Pill-style character counter */}
                      <div className="absolute bottom-[8px] right-[8px] flex items-center justify-end px-[8px] py-[3px] rounded-[22px] bg-[#222737] border border-[rgba(108,119,157,0.2)]">
                        <span className="font-['JetBrains_Mono',sans-serif] font-semibold text-[#6c779d] text-[11px] leading-[14px]">
                          {agentDesc.length}/1000
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: Capital ── */}
            {step === 2 && (
              <div className="flex flex-col gap-[24px] items-start w-full">
                <div className="flex flex-col items-start w-full">
                  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[20px] leading-[28px] w-full">
                    Capital
                  </p>
                  <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] w-full">
                    Set the initial capital allocation.
                  </p>
                </div>

                <div className="flex flex-col gap-[16px] items-start w-full">
                  {/* Capital Allocation label + info + inputs */}
                  <div className="flex flex-col gap-[4px] items-start w-full">
                    {/* Label row */}
                    <div className="flex gap-[4px] items-center">
                      <FieldLabel>Capital Allocation</FieldLabel>
                      <Info size={20} className="text-[#414965] shrink-0" />
                    </div>

                    {/* Inputs + quick amounts wrapper — gap-[8px] between rows */}
                    <div className="flex flex-col gap-[8px] items-start w-full">
                      {/* Amount input + currency dropdown */}
                      <div className="flex gap-[8px] items-start w-full">
                        {/* Amount field — h-[48px] = py-[14px] + 20px line */}
                        <div className="bg-[#222737] flex flex-1 items-center gap-[8px] px-[16px] h-[48px] rounded-[16px] min-w-0">
                          <span className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] shrink-0">$</span>
                          <input
                            value={capital}
                            onChange={(e) => setCapital(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))}
                            placeholder="10,000"
                            data-testid="input-capital"
                            className="flex-1 bg-transparent text-white text-[16px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none min-w-0"
                          />
                        </div>
                        {/* Currency dropdown — w-[120px] h-[48px] */}
                        <div className="relative shrink-0 w-[120px]">
                          <button
                            onClick={() => setShowAssetDrop((v) => !v)}
                            data-testid="button-asset-dropdown"
                            className="bg-[#222737] flex items-center justify-between gap-[8px] px-[16px] h-[48px] rounded-[16px] w-full cursor-pointer"
                          >
                            <span className="font-['Gilroy-Medium',sans-serif] text-white text-[16px] leading-[20px]">
                              {capitalAsset}
                            </span>
                            <ChevronDown size={16} className="text-[#6c779d] shrink-0" />
                          </button>
                          {showAssetDrop && (
                            <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#222737] border border-[#414965] rounded-[12px] overflow-hidden z-10">
                              {["USDC", "USDT"].map((asset) => (
                                <button
                                  key={asset}
                                  onClick={() => { setCapitalAsset(asset); setShowAssetDrop(false); }}
                                  data-testid={`option-asset-${asset}`}
                                  className={`w-full px-[16px] py-[10px] text-left font-['Gilroy-Medium',sans-serif] text-[16px] leading-[20px] transition-colors ${capitalAsset === asset ? "text-white bg-[#2d3347]" : "text-[#6c779d] hover:bg-[#1d2132] hover:text-white"}`}
                                >
                                  {asset}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quick-add preset buttons — h-[32px] = py-[8px] + 16px line */}
                      <div className="flex gap-[8px] items-start w-full">
                        {["1,000", "5,000", "10,000", "20,000", "50,000"].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setCapital(amt)}
                            data-testid={`button-preset-${amt}`}
                            className="flex-1 bg-[#4a2300] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] min-w-0"
                          >
                            <span className="font-['JetBrains_Mono',sans-serif] font-semibold text-[#ff9500] text-[12px] leading-[16px] whitespace-nowrap">
                              +${amt}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Available balance row — h-[40px] = p-[8px] + 24px icon */}
                  <div className="border border-[#1d2132] flex gap-[8px] items-center p-[8px] rounded-[12px] w-full">
                    {/* Left: wallet icon + label */}
                    <div className="flex flex-1 gap-[4px] items-center min-w-0">
                      <Wallet size={24} className="text-[#6c779d] shrink-0" />
                      <span className="flex-1 font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[24px] min-w-0">
                        Available Balance
                      </span>
                    </div>
                    {/* Right: balance + asset tag */}
                    <div className="flex flex-1 gap-[4px] items-center justify-end min-w-0">
                      <span className="flex-1 font-['JetBrains_Mono',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[24px] text-right min-w-0">
                        $865,942.49
                      </span>
                      <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] flex items-center px-[4px] py-[1px] rounded-[20px] shrink-0">
                        <span className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[11px] leading-[14px]">
                          {capitalAsset}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Configuration ── */}
            {step === 3 && (
              <div className="flex flex-col gap-[24px] items-start w-full">
                <div className="flex flex-col items-start w-full">
                  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[20px] leading-[28px] w-full">
                    Configuration
                  </p>
                  <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] w-full">
                    {selectedType === "trading"   && "Position controls, trading parameters, and market constraints for autonomous trading execution."}
                    {selectedType === "lending"   && "Protocols, lending parameters, and LTV constraints for autonomous lending execution."}
                    {selectedType === "yield"     && "Yield targets, slippage constraints, and circuit breakers for capital optimization."}
                    {selectedType === "payments"  && "Budget controls, recipient management, and safety breakers for automated payment execution."}
                    {selectedType === "analytics" && "Monitoring scope, alert rules, reporting frequency, and action permissions."}
                    {selectedType === "custom"    && "Define your objective, tool permissions, and execution boundaries."}
                  </p>
                </div>

                {/* TRADING CONFIG */}
                {selectedType === "trading" && (
                  <div className="flex flex-col gap-[24px] w-full" onClick={() => t_open_drop && setT_open_drop(null)}>

                    {/* ── STRATEGY ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="STRATEGY" />
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Trading Type</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <div className="grid grid-cols-2 gap-[12px] w-full mt-[4px]">
                          {[
                            { id: "perpetual_long_short", label: "Perpetual Long/Short", desc: "A directional strategy that opens long and short positions based on market signals." },
                            { id: "grid_trading",         label: "Grid Trading",          desc: "A strategy that places layered buy and sell orders to profit from market volatility." },
                            { id: "yield_farming_arb",    label: "Yield Farming Arb",     desc: "A strategy that shifts capital between yield opportunities to capture rate inefficiencies." },
                            { id: "index_tracking",       label: "Index Tracking",        desc: "A strategy that follows a set basket of assets to mirror overall market performance." },
                            { id: "custom",               label: "Custom",                desc: "A strategy tailored to your own market view, rules, and execution logic." },
                          ].map((opt) => (
                            <RadioCard key={opt.id} label={opt.label} desc={opt.desc} small checked={t_strategy_type === opt.id} onClick={() => setT_strategy_type(opt.id)} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── CONTROLS ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CONTROLS" />

                      {/* Max Position Size */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Max Position Size</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <div className="bg-[#222737] flex items-center gap-[8px] px-[16px] h-[48px] rounded-[16px] w-full">
                          <span className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] shrink-0">$</span>
                          <input
                            value={t_max_position_size_usdc}
                            onChange={(e) => setT_max_position_size_usdc(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))}
                            data-testid="input-max-position-size"
                            className="bg-transparent text-white text-[16px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none flex-1 min-w-0 leading-[20px]"
                            placeholder="10,000"
                          />
                        </div>
                      </div>

                      {/* Cumulative Exposure Limit */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Cumulative Exposure Limit</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <div className="bg-[#222737] flex items-center gap-[8px] px-[16px] h-[48px] rounded-[16px] w-full">
                          <span className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] shrink-0">$</span>
                          <input
                            value={t_cumulative_exposure_limit}
                            onChange={(e) => setT_cumulative_exposure_limit(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))}
                            data-testid="input-cumulative-exposure"
                            className="bg-transparent text-white text-[16px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none flex-1 min-w-0 leading-[20px]"
                            placeholder="50,000"
                          />
                        </div>
                      </div>

                      {/* Daily Spend Cap */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Daily Spend Cap</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <div className="bg-[#222737] flex items-center gap-[8px] px-[16px] h-[48px] rounded-[16px] w-full">
                          <span className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] shrink-0">$</span>
                          <input
                            value={t_daily_spend_cap}
                            onChange={(e) => setT_daily_spend_cap(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))}
                            data-testid="input-daily-spend-cap"
                            className="bg-transparent text-white text-[16px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none flex-1 min-w-0 leading-[20px]"
                            placeholder="10,000"
                          />
                        </div>
                      </div>

                      {/* Order Types + Max Leverage */}
                      <div className="grid grid-cols-2 gap-[16px] w-full" onClick={(e) => e.stopPropagation()}>
                        <SmallDropdown
                          label="Order Types"
                          value={t_order_types[0] ?? "stop_limit"}
                          options={[
                            { value: "market",      label: "Market" },
                            { value: "limit",       label: "Limit" },
                            { value: "stop_market", label: "Stop Market" },
                            { value: "stop_limit",  label: "Stop Limit" },
                            { value: "take_market", label: "Take Market" },
                            { value: "take_limit",  label: "Take Limit" },
                            { value: "scale",       label: "Scale" },
                            { value: "twap",        label: "TWAP" },
                          ]}
                          open={t_open_drop === "orderTypes"}
                          onOpen={() => setT_open_drop(t_open_drop === "orderTypes" ? null : "orderTypes")}
                          onChange={(v) => { setT_order_types([v]); setT_open_drop(null); }}
                        />
                        <SmallDropdown
                          label="Max Leverage"
                          value={t_max_position_leverage}
                          options={[
                            { value: "1",   label: "1x" },
                            { value: "2",   label: "2x" },
                            { value: "3",   label: "3x" },
                            { value: "5",   label: "5x" },
                            { value: "10",  label: "10x" },
                            { value: "25",  label: "25x" },
                            { value: "50",  label: "50x" },
                            { value: "100", label: "100x" },
                          ]}
                          open={t_open_drop === "leverage"}
                          onOpen={() => setT_open_drop(t_open_drop === "leverage" ? null : "leverage")}
                          onChange={(v) => { setT_max_position_leverage(v); setT_open_drop(null); }}
                        />
                      </div>

                      {/* Allowed Markets */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Allowed Markets</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <div className="flex flex-wrap gap-[12px] w-full mt-[4px]">
                          {["BTC-USDC","ETH-USDC","SOL-USDC","ARB-USDC","OP-USDC","AVAX-USDC","BNB-USDC","MATIC-USDC"].map((mkt) => {
                            const sel = t_allowed_markets.includes(mkt);
                            return (
                              <button
                                key={mkt}
                                type="button"
                                onClick={() => setT_allowed_markets(tog(t_allowed_markets, mkt))}
                                data-testid={`chip-market-${mkt}`}
                                className="flex items-center gap-[8px] px-[12px] rounded-[12px] h-[40px] bg-[#0a0c10] transition-colors"
                              >
                                <span className={`font-['Gilroy-Medium',sans-serif] text-[16px] leading-[20px] whitespace-nowrap ${sel ? "text-[#a8b9f4]" : "text-[#6c779d]"}`}>{mkt}</span>
                                <div className={`size-[20px] rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${sel ? "bg-[#42bf23]" : "border border-[#222737] bg-[#06070a]"}`}>
                                  {sel && (
                                    <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                                      <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Max Slippage + Cooldown Window */}
                      <div className="grid grid-cols-2 gap-[16px] w-full" onClick={(e) => e.stopPropagation()}>
                        <SmallDropdown
                          label="Max Slippage"
                          value={t_max_slippage_bps}
                          options={[
                            { value: "10",  label: "10 bps" },
                            { value: "20",  label: "20 bps" },
                            { value: "30",  label: "30 bps" },
                            { value: "50",  label: "50 bps" },
                            { value: "100", label: "100 bps" },
                          ]}
                          open={t_open_drop === "slippage"}
                          onOpen={() => setT_open_drop(t_open_drop === "slippage" ? null : "slippage")}
                          onChange={(v) => { setT_max_slippage_bps(v); setT_open_drop(null); }}
                        />
                        <SmallDropdown
                          label="Cooldown Window"
                          value={t_cooldown_window_seconds}
                          options={[
                            { value: "10",  label: "10 sec" },
                            { value: "30",  label: "30 sec" },
                            { value: "60",  label: "60 sec" },
                            { value: "300", label: "5 min" },
                            { value: "900", label: "15 min" },
                          ]}
                          open={t_open_drop === "cooldown"}
                          onOpen={() => setT_open_drop(t_open_drop === "cooldown" ? null : "cooldown")}
                          onChange={(v) => { setT_cooldown_window_seconds(v); setT_open_drop(null); }}
                        />
                      </div>
                    </div>

                    {/* ── SAFETY ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="SAFETY" />

                      {/* Max Daily Loss % */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Max Daily Loss %</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider
                          min={1} max={50}
                          value={t_max_daily_loss_percent}
                          onChange={setT_max_daily_loss_percent}
                          unit="%"
                        />
                      </div>

                      {/* Kill Switch Drawdown */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Kill Switch Drawdown</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider
                          min={1} max={20}
                          value={t_kill_switch_drawdown}
                          onChange={setT_kill_switch_drawdown}
                          unit=""
                        />
                      </div>
                    </div>

                  </div>
                )}

                {/* LENDING CONFIG */}
                {selectedType === "lending" && (
                  <div className="flex flex-col gap-[24px] w-full">
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="PROTOCOLS" />
                      <div className="flex flex-col gap-[4px]">
                        <FieldLabel>Lending Vehicle</FieldLabel>
                        <div className="grid grid-cols-2 gap-[12px] mt-[4px]">
                          {[
                            { id: "morpho",          label: "Morpho",          desc: "Optimized peer-to-peer lending with off-chain matching and on-chain settlement." },
                            { id: "aave",            label: "Aave v3",         desc: "Industry-standard lending with robust liquidity pools and risk management." },
                            { id: "compound",        label: "Compound",        desc: "Algorithmic money market with cToken model for automated interest accrual." },
                            { id: "custom_contract", label: "Custom Contract", desc: "Use a custom ERC-4626 vault or bespoke lending contract." },
                          ].map((opt) => (
                            <RadioCard key={opt.id} label={opt.label} desc={opt.desc} small checked={l_protocol === opt.id} onClick={() => setL_protocol(opt.id)} />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="RISK CONTROLS" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Max LTV %</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={l_max_ltv_percent} onChange={(e) => setL_max_ltv_percent(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="70" />
                            <span className="text-[#6c779d] text-[14px]">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Target LTV %</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={l_target_ltv_percent} onChange={(e) => setL_target_ltv_percent(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="55" />
                            <span className="text-[#6c779d] text-[14px]">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Max Supply (USD)</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={l_max_supply_usd} onChange={(e) => setL_max_supply_usd(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="50,000" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Min APY Target %</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={l_min_apy_target_percent} onChange={(e) => setL_min_apy_target_percent(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="4" />
                            <span className="text-[#6c779d] text-[14px]">%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="COLLATERAL ASSETS" />
                      <ChipGroup options={["ETH","WBTC","stETH","cbETH","USDC","DAI"]} selected={l_allowed_collateral_assets} onToggle={(v) => setL_allowed_collateral_assets(tog(l_allowed_collateral_assets, v))} />
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="BORROW ASSETS" />
                      <ChipGroup options={["USDC","DAI","USDT","ETH"]} selected={l_allowed_borrow_assets} onToggle={(v) => setL_allowed_borrow_assets(tog(l_allowed_borrow_assets, v))} />
                    </div>
                  </div>
                )}

                {/* YIELD CONFIG */}
                {selectedType === "yield" && (
                  <div className="flex flex-col gap-[24px] w-full">
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CONTROLS" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Target APY %</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={y_target_apy_percent} onChange={(e) => setY_target_apy_percent(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="8" />
                            <span className="text-[#6c779d] text-[14px]">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Min APY Floor %</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={y_min_apy_percent} onChange={(e) => setY_min_apy_percent(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="4" />
                            <span className="text-[#6c779d] text-[14px]">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Exit if APY Below %</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={y_exit_if_apy_below_percent} onChange={(e) => setY_exit_if_apy_below_percent(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="3" />
                            <span className="text-[#6c779d] text-[14px]">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Max Exposure / Protocol</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={y_max_stable_pair_concentration} onChange={(e) => setY_max_stable_pair_concentration(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="40" />
                            <span className="text-[#6c779d] text-[14px]">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Max Position Size</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={y_max_position_size_usdc} onChange={(e) => setY_max_position_size_usdc(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="25,000" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Max Slippage (bps)</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <input value={y_max_slippage_bps} onChange={(e) => setY_max_slippage_bps(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="133" />
                            <span className="text-[#6c779d] text-[14px]">bps</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="PROTOCOL ALLOWLIST" />
                      <ChipGroup options={["Morphy","Aave v3","Pendle","Sky","Compound","Curve"]} selected={y_protocols} onToggle={(v) => setY_protocols(tog(y_protocols, v))} />
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="STRATEGY TYPE" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        {[
                          { id: "stable_farming",    label: "Stable Farming",    desc: "Low-risk stablecoin yield across lending protocols." },
                          { id: "lp_on_dex",         label: "LP on DEX",         desc: "Provide liquidity on Uniswap v3 or Aerodrome for fee income." },
                          { id: "perpetual_funding", label: "Perpetual Funding",  desc: "Capture funding rate arbitrage on perpetual markets." },
                          { id: "curve_convex",      label: "Curve/Convex",      desc: "Optimize Curve LP positions with Convex boost stacking." },
                        ].map((opt) => (
                          <RadioCard key={opt.id} label={opt.label} desc={opt.desc} small checked={y_strategy_type === opt.id} onClick={() => setY_strategy_type(opt.id)} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PAYMENTS CONFIG */}
                {selectedType === "payments" && (
                  <div className="flex flex-col gap-[24px] w-full">
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CONTROLS" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Per-TX Limit</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={p_per_transaction_limit_usdc} onChange={(e) => setP_per_transaction_limit_usdc(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="10,000" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Daily Budget</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={p_daily_spend_budget_usdc} onChange={(e) => setP_daily_spend_budget_usdc(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="25,000" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Approve Above</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={p_require_approval_above_usdc} onChange={(e) => setP_require_approval_above_usdc(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="1,000" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Payment Type</FieldLabel>
                          <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                            <select value={p_payment_type} onChange={(e) => setP_payment_type(e.target.value)} className="bg-transparent text-white text-[14px] outline-none w-full cursor-pointer appearance-none">
                              <option value="recurring_bills" className="bg-[#0a0c10]">Recurring + subscriptions</option>
                              <option value="direct_transfers" className="bg-[#0a0c10]">Direct Transfers</option>
                              <option value="batch_payroll" className="bg-[#0a0c10]">Batch Payroll</option>
                              <option value="x402" className="bg-[#0a0c10]">x402</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="SAFETY CIRCUIT BREAKERS" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Velocity (24h)</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={p_counterparty_velocity} onChange={(e) => setP_counterparty_velocity(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="50,000" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Sanctions</FieldLabel>
                          <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-white text-[14px]">OFAC + Chainalysis</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ANALYTICS CONFIG */}
                {selectedType === "analytics" && (
                  <div className="flex flex-col gap-[24px] w-full">
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="AGENTS" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        {[
                          { id: "all",      label: "All Agents",     desc: "Monitor all 5 active agents across your account." },
                          { id: "selected", label: "Selected Agents", desc: "Choose specific agents to track and monitor." },
                        ].map((opt) => (
                          <RadioCard key={opt.id} label={opt.label} desc={opt.desc} small checked={a_tracked_agents === opt.id} onClick={() => setA_tracked_agents(opt.id)} />
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="REPORTING" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Routine Reports</FieldLabel>
                          <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                            <select value={a_report_frequency} onChange={(e) => setA_report_frequency(e.target.value)} className="bg-transparent text-white text-[14px] outline-none w-full cursor-pointer appearance-none">
                              <option value="daily" className="bg-[#0a0c10]">Daily</option>
                              <option value="weekly" className="bg-[#0a0c10]">Weekly</option>
                              <option value="hourly" className="bg-[#0a0c10]">Hourly</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Compute Cap / Month</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={a_compute_cap} onChange={(e) => setA_compute_cap(e.target.value)} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="250" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Max Alerts / Day</FieldLabel>
                          <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                            <input value={a_max_alerts_per_day} onChange={(e) => setA_max_alerts_per_day(e.target.value)} className="bg-transparent text-white text-[14px] outline-none w-full" placeholder="50" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Critical Routing</FieldLabel>
                          <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                            <input value={a_critical_routing} onChange={(e) => setA_critical_routing(e.target.value)} className="bg-transparent text-white text-[14px] outline-none w-full" placeholder="Dash + Slack + SMS" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="ACTION PERMISSIONS" />
                      <div className="flex flex-col gap-[4px]">
                        <FieldLabel>Allowed Actions</FieldLabel>
                        <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                          <select value={a_allowed_actions} onChange={(e) => setA_allowed_actions(e.target.value)} className="bg-transparent text-white text-[14px] outline-none w-full cursor-pointer appearance-none">
                            <option value="pause_agent_only" className="bg-[#0a0c10]">Pause agent only</option>
                            <option value="rebalance" className="bg-[#0a0c10]">Rebalance</option>
                            <option value="halt_all" className="bg-[#0a0c10]">Halt all</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CUSTOM CONFIG */}
                {selectedType === "custom" && (
                  <div className="flex flex-col gap-[24px] w-full">
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="OBJECTIVE" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        <div className="flex flex-col gap-[4px] col-span-2">
                          <FieldLabel>Target Outcome</FieldLabel>
                          <TextInput value={c_objective} onChange={setC_objective} placeholder="e.g. maximize_yield" />
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Complexity Level</FieldLabel>
                          <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                            <select value={c_complexity_level} onChange={(e) => setC_complexity_level(e.target.value)} className="bg-transparent text-white text-[14px] outline-none w-full cursor-pointer appearance-none">
                              <option value="low" className="bg-[#0a0c10]">Low</option>
                              <option value="medium" className="bg-[#0a0c10]">Medium</option>
                              <option value="high" className="bg-[#0a0c10]">High</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CODE SOURCE" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        {[
                          { id: "github_repo", label: "GitHub Repo", desc: "Deploy from a public or private GitHub repository." },
                          { id: "inline_code", label: "Inline Code",  desc: "Write and deploy code directly in the editor." },
                        ].map((opt) => (
                          <RadioCard key={opt.id} label={opt.label} desc={opt.desc} small checked={c_source_type === opt.id} onClick={() => setC_source_type(opt.id)} />
                        ))}
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Runtime</FieldLabel>
                          <div className="bg-[#222737] flex items-center px-[12px] py-[10px] rounded-[12px]">
                            <select value={c_runtime} onChange={(e) => setC_runtime(e.target.value)} className="bg-transparent text-white text-[14px] outline-none w-full cursor-pointer appearance-none">
                              <option className="bg-[#0a0c10]">Node 20</option>
                              <option className="bg-[#0a0c10]">Python 3.12</option>
                              <option className="bg-[#0a0c10]">Deno</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Repository URL</FieldLabel>
                          <TextInput value={c_repo_url} onChange={setC_repo_url} placeholder="github.com/user/repo" />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="TOOLS PERMISSIONS" />
                      <ChipGroup
                        options={["Read Balance","Read Orderbook","Read Market Data","Place Limit Order","Cancel Order","Place Market Order","Open Perp","Transfer Internal","Withdraw External","Contract Call"]}
                        selected={c_allowed_tools}
                        onToggle={(v) => setC_allowed_tools(tog(c_allowed_tools, v))}
                      />
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CONTROLS" />
                      <div className="grid grid-cols-2 gap-[12px]">
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Primary Limit</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={c_primary_limit} onChange={(e) => setC_primary_limit(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="5,000" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Secondary Limit</FieldLabel>
                          <div className="bg-[#222737] flex items-center gap-[4px] px-[12px] py-[10px] rounded-[12px]">
                            <span className="text-[#6c779d] text-[14px]">$</span>
                            <input value={c_secondary_limit} onChange={(e) => setC_secondary_limit(formatUsd(e.target.value.replace(/[^0-9.]/g, "")))} className="bg-transparent text-white text-[14px] outline-none flex-1 min-w-0" placeholder="500" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 4: Confirm & Sign ── */}
            {step === 4 && (
              <div className="flex flex-col gap-[24px] items-start w-full">

                {/* Agent identity card */}
                <div className="bg-[#0a0c10] flex gap-[16px] items-start p-[16px] rounded-[16px] w-full">
                  <div className="rounded-[12px] size-[40px] overflow-hidden shrink-0 bg-[#1d2132]">
                    {selectedAvatar
                      ? <img src={selectedAvatar} alt="" className="size-full object-cover" />
                      : <div className="size-full" />
                    }
                  </div>
                  <div className="flex flex-1 flex-col gap-[4px] items-start min-w-0">
                    <div className="flex items-center justify-between w-full">
                      <p className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[20px] leading-[24px] truncate">{agentName || "Unnamed Agent"}</p>
                      <TypeBadge type={selectedType} />
                    </div>
                    <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] w-full line-clamp-4">
                      {agentDesc || `${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} AI agent for automated execution.`}
                    </p>
                  </div>
                </div>

                {/* Policies grid */}
                <div className="flex flex-col gap-[16px] w-full">
                  <SectionDivider title="POLICIES" />
                  <div className="grid grid-cols-2 gap-[8px] w-full">
                    {policyPreviewCards.map((card) => (
                      <PolicyInfoCard key={card.label} label={card.label} value={card.value} valueColor={card.valueColor} valueNode={card.valueNode} />
                    ))}
                  </div>
                </div>

                {/* Deployment Process */}
                <div className="flex flex-col gap-[16px] w-full">
                  <SectionDivider title="DEPLOYMENT PROCESS" />
                  <div className="flex flex-col gap-[8px] w-full">
                    {[
                      { n: 1, title: "Policy Compiles",   desc: "Inputs are validated and hashed deterministically into a 32-byte commitment" },
                      { n: 2, title: "Capital Transfers",  desc: "USDC moves from your treasury to the agent's sub-account" },
                      { n: 3, title: "Agent Registers",    desc: "ERC-8004 entry created with the policy hash and your owner address" },
                      { n: 4, title: "Agent Goes Live",    desc: "Starts executing within the policy envelope while every action is verified against the hash" },
                    ].map(({ n, title, desc }) => (
                      <div key={n} className="flex flex-col w-full">
                        <div className="flex gap-[16px] items-center w-full">
                          <div className="bg-[#0a0c10] flex items-center justify-center h-[32px] w-[48px] rounded-[100px] shrink-0">
                            <span className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[16px] leading-[16px]">{n}</span>
                          </div>
                          <p className="flex-1 font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[16px] leading-[32px] min-w-0">{title}</p>
                          <ChevronUp size={24} className="text-[#6c779d] shrink-0" />
                        </div>
                        <div className="pl-[64px] w-full">
                          <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[14px] leading-[16px]">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Authorization */}
                <div className="flex flex-col gap-[16px] w-full">
                  <SectionDivider title="AUTHORIZATION" />
                  <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[14px] leading-[20px] w-full">
                    Authorize the agent to operate within the defined policy. This commits the policy hash on-chain.
                  </p>
                  <div className="flex flex-col gap-[16px]">
                    <div className="flex gap-[16px] items-start">
                      <div
                        onClick={() => setAuthSig(!authSig)}
                        className={`size-[20px] rounded-[4px] border flex items-center justify-center flex-shrink-0 cursor-pointer transition-all mt-[2px] ${authSig ? "bg-[#240757] border-[rgba(118,49,238,0.2)]" : "bg-[#06070a] border-[#222737]"}`}
                      >
                        {authSig && (
                          <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                            <path d="M1 4L4.5 7.5L11 1" stroke="#7631ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] flex-1 cursor-pointer" onClick={() => setAuthSig(!authSig)}>
                        I authorize this agent to act on my behalf
                      </p>
                    </div>
                    <div className="flex gap-[16px] items-start">
                      <div
                        onClick={() => setTerms(!terms)}
                        className={`size-[20px] rounded-[4px] border flex items-center justify-center flex-shrink-0 cursor-pointer transition-all mt-[2px] ${terms ? "bg-[#240757] border-[rgba(118,49,238,0.2)]" : "bg-[#06070a] border-[#222737]"}`}
                      >
                        {terms && (
                          <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                            <path d="M1 4L4.5 7.5L11 1" stroke="#7631ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px] flex-1 cursor-pointer" onClick={() => setTerms(!terms)}>
                        I agree to the{" "}
                        <span className="text-[#a8b9f4] underline">Brain Finance Agent Terms</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══ FOOTER BUTTON (fixed outside scroll) ══ */}
        {!launched && (
          <div className="flex-shrink-0 px-[24px] pb-[24px] pt-0">
            {step < 4 ? (
              <button
                onClick={() => canProceed() && setStep((s) => s + 1)}
                disabled={!canProceed()}
                data-testid="button-continue"
                className={`w-full font-['Gilroy-SemiBold',sans-serif] text-[16px] leading-[20px] px-[20px] py-[10px] rounded-[100px] transition-all ${canProceed() ? "bg-[#4a2300] text-[#ff9500] hover:opacity-80" : "bg-[#1d2132] text-[#414965] cursor-not-allowed"}`}
              >
                Continue
              </button>
            ) : (
              <button
                onClick={() => canProceed() && handleLaunch()}
                disabled={!canProceed() || launching}
                data-testid="button-create-agent"
                className={`w-full font-['Gilroy-SemiBold',sans-serif] text-[16px] leading-[20px] px-[20px] py-[10px] rounded-[100px] transition-all ${canProceed() ? "bg-[#123509] text-[#42bf23] hover:opacity-80" : "bg-[#1d2132] text-[#414965] cursor-not-allowed"}`}
              >
                {launching ? "Creating Agent…" : "Create Agent"}
              </button>
            )}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            setSelectedAvatar(url);
            setAvatarFileName(file.name);
            setShowAvatarPicker(false);
          }
        }} />
      </div>
    </div>
  );
};

export default CreateAgentModal;
