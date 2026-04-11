import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { keccak256 } from "viem";
import { apiRequest } from "@/lib/queryClient";
import { AgentPrefillData } from "@/lib/navContext";
import { ChevronLeft, X, Plus, ChevronDown, ChevronUp, Info, Image as ImageIcon, Wallet, Trash2, Search } from "lucide-react";

/* ── Collateral asset list ── */
const COLLATERAL_ASSETS: { ticker: string; name: string; color: string }[] = [
  { ticker: "ETH",    name: "Ethereum",          color: "#627EEA" },
  { ticker: "WBTC",   name: "Wrapped Bitcoin",    color: "#F7931A" },
  { ticker: "stETH",  name: "Lido Staked ETH",    color: "#00A3FF" },
  { ticker: "cbETH",  name: "Coinbase ETH",        color: "#0052FF" },
  { ticker: "rETH",   name: "Rocket Pool ETH",     color: "#FF6B35" },
  { ticker: "wstETH", name: "Wrapped stETH",       color: "#00A3FF" },
  { ticker: "cbBTC",  name: "Coinbase BTC",        color: "#F7931A" },
  { ticker: "USDC",   name: "USD Coin",             color: "#2775CA" },
  { ticker: "USDT",   name: "Tether",               color: "#26A17B" },
  { ticker: "DAI",    name: "Dai",                  color: "#F5AC37" },
  { ticker: "FRAX",   name: "Frax",                 color: "#8B8B8B" },
  { ticker: "LINK",   name: "Chainlink",            color: "#2A5ADA" },
  { ticker: "UNI",    name: "Uniswap",              color: "#FF007A" },
  { ticker: "AAVE",   name: "Aave",                 color: "#B6509E" },
  { ticker: "CRV",    name: "Curve",                color: "#FF3F3F" },
  { ticker: "MKR",    name: "Maker",                color: "#1AAB9B" },
  { ticker: "ARB",    name: "Arbitrum",             color: "#12AAFF" },
  { ticker: "OP",     name: "Optimism",             color: "#FF0420" },
  { ticker: "MATIC",  name: "Polygon",              color: "#8247E5" },
  { ticker: "SNX",    name: "Synthetix",            color: "#00D1FF" },
  { ticker: "COMP",   name: "Compound",             color: "#00D395" },
  { ticker: "GHO",    name: "GHO Token",            color: "#9B85F5" },
  { ticker: "sDAI",   name: "Savings DAI",          color: "#F5AC37" },
];

/* ── Asset Search Popup (module-level component) ── */
const AssetSearchPopup = ({ selected, onToggle, onClose }: {
  selected: string[];
  onToggle: (ticker: string) => void;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  const filtered = COLLATERAL_ASSETS.filter(a =>
    !query ||
    a.ticker.toLowerCase().includes(query.toLowerCase()) ||
    a.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div className="absolute inset-0 bg-[#11141b] rounded-[24px] z-50 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 h-[56px] relative flex items-center justify-center border-b border-[#1d2132]">
        <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[16px] leading-[24px]">Select Asset</p>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
        >
          <X size={16} className="text-[#6c779d]" />
        </button>
      </div>
      <div className="flex flex-col flex-1 overflow-hidden px-[8px] pt-[8px] gap-[8px]">
        <div className="flex items-center gap-[8px] bg-[#222737] rounded-[12px] h-[40px] px-[12px] flex-shrink-0">
          <Search size={16} className="text-[#6c779d] shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search assets..."
            className="flex-1 bg-transparent text-[#a8b9f4] text-[14px] font-['Gilroy-Medium',sans-serif] placeholder:text-[#6c779d] outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="flex items-center">
              <X size={14} className="text-[#6c779d]" />
            </button>
          )}
        </div>
        <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[12px] leading-[24px] px-[8px] flex-shrink-0">
          Search Results Assets
        </p>
        <div className="overflow-y-auto flex-1 flex flex-col pb-[8px]">
          {filtered.map(asset => {
            const isSel = selected.includes(asset.ticker);
            return (
              <button
                key={asset.ticker}
                type="button"
                onClick={() => onToggle(asset.ticker)}
                className="flex items-center gap-[8px] w-full h-[48px] px-[8px] hover:bg-[#1d2132] rounded-[8px] transition-colors flex-shrink-0"
              >
                <div
                  className="size-[32px] rounded-full flex items-center justify-center shrink-0 text-white font-['Gilroy-SemiBold',sans-serif] text-[10px] leading-none"
                  style={{ background: asset.color }}
                >
                  {asset.ticker.slice(0, 3)}
                </div>
                <p className="flex-1 text-left font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[14px] leading-[32px] min-w-0 truncate">
                  {asset.name} ({asset.ticker})
                </p>
                <div className={`size-[20px] rounded-full flex items-center justify-center shrink-0 transition-colors ${isSel ? "bg-[#42bf23]" : "border border-[#222737] bg-[#06070a]"}`}>
                  {isSel && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[14px] py-[24px]">No assets found</p>
          )}
        </div>
      </div>
    </div>
  );
};

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
  <div className="bg-[#0a0c10] flex flex-col min-h-[62px] items-start p-[12px] rounded-[16px]">
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

/* ─── Payments dropdown w/ label + info icon ─── */
const PD = ({ label, value, options, ddId, openDd, setOpenDd, onChange }: {
  label: string; value: string; options: string[]; ddId: string;
  openDd: string | null; setOpenDd: (v: string | null) => void; onChange: (v: string) => void;
}) => {
  const isOpen = openDd === ddId;
  return (
    <div className="flex flex-col gap-[4px]">
      {label && (
        <div className="flex gap-[4px] items-start">
          <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">{label}</p>
          <Info size={20} className="text-[#414965] shrink-0" />
        </div>
      )}
      <div className="relative">
        <button type="button" onClick={() => setOpenDd(isOpen ? null : ddId)}
          className="bg-[#222737] flex gap-[8px] items-center p-[8px] rounded-[8px] w-full h-[40px] cursor-pointer">
          <span className="flex-1 text-left font-['Gilroy-Medium',sans-serif] text-white text-[16px] leading-[20px]">{value}</span>
          <ChevronDown size={24} className="text-[#6c779d] shrink-0" />
        </button>
        {isOpen && (
          <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[8px]"
            style={{ boxShadow: "0px 17px 17px 0px rgba(0,0,0,0.34),0px 4px 9px 0px rgba(0,0,0,0.39)" }}>
            {options.map((opt) => (
              <button key={opt} type="button"
                onClick={() => { onChange(opt); setOpenDd(null); }}
                className={`w-full text-left px-[8px] py-[8px] rounded-[8px] font-['Gilroy-Medium',sans-serif] text-[16px] leading-[20px] hover:bg-[#1d2132] transition-colors ${value === opt ? "text-white" : "text-[#a8b9f4]"}`}>
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── x402 toggle switch ─── */
const PaySwitch = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <button type="button" onClick={onToggle}
    className={`h-[24px] w-[40px] rounded-[100px] relative flex-shrink-0 transition-colors ${on ? "bg-[#123509]" : "bg-[#222737]"}`}>
    <div className={`absolute top-[4px] size-[16px] rounded-full transition-all duration-200 ${on ? "left-[20px] bg-[#42bf23]" : "left-[4px] bg-[#6c779d]"}`} />
  </button>
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
  const [t_cooldown_window_seconds, setT_cooldown_window_seconds] = useState("300");
  const [t_cumulative_exposure_limit, setT_cumulative_exposure_limit] = useState("50,000");
  const [t_daily_spend_cap, setT_daily_spend_cap]               = useState("10,000");
  const [t_order_types, setT_order_types]                       = useState<string[]>(["stop_limit"]);
  const [t_max_slippage_bps, setT_max_slippage_bps]             = useState("30");
  const [t_max_position_leverage, setT_max_position_leverage]   = useState("3");
  const [t_kill_switch_drawdown, setT_kill_switch_drawdown]     = useState("17");
  const [t_open_drop, setT_open_drop]                           = useState<null | string>(null);

  /* ══ LENDING ══ */
  const [l_protocol, setL_protocol]                               = useState("morpho_blue");
  const [l_max_supply_usd, setL_max_supply_usd]                   = useState("50,000");
  const [l_allowed_collateral_assets, setL_allowed_collateral_assets] = useState<string[]>(["ETH", "stETH", "cbBTC"]);
  const [l_allowed_borrow_assets, setL_allowed_borrow_assets]     = useState<string[]>(["USDC", "DAI"]);
  const [l_max_ltv_percent, setL_max_ltv_percent]                 = useState("30");
  const [l_target_ltv_percent, setL_target_ltv_percent]           = useState("40");
  const [l_rebalance_threshold_percent, setL_rebalance_threshold_percent] = useState("5");
  const [l_max_liquidation_risk_percent, setL_max_liquidation_risk_percent] = useState("10");
  const [l_max_protocol_exposure_percent, setL_max_protocol_exposure_percent] = useState("17");
  const [l_min_apy_target_percent, setL_min_apy_target_percent]   = useState("4");
  const [l_liquidation_risk_ceiling, setL_liquidation_risk_ceiling] = useState("20");
  const [l_halt_ltv_exceeds, setL_halt_ltv_exceeds]               = useState("80");
  const [l_show_asset_picker, setL_show_asset_picker]             = useState(false);

  /* ══ YIELD ══ */
  const [y_strategy_type, setY_strategy_type]                     = useState("stable_farming");
  const [y_min_apy_percent, setY_min_apy_percent]                 = useState("4");
  const [y_target_apy_percent, setY_target_apy_percent]           = useState("8");
  const [y_exit_if_apy_below_percent, setY_exit_if_apy_below_percent] = useState("3");
  const [y_max_slippage_bps, setY_max_slippage_bps]               = useState("25");
  const [y_max_position_size_usdc, setY_max_position_size_usdc]   = useState("100,000");
  const [y_max_exposure_percent, setY_max_exposure_percent]       = useState("30");
  const [y_il_tolerance, setY_il_tolerance]                       = useState("0% (No LP)");
  const [y_protocol_downgrade, setY_protocol_downgrade]           = useState("1 tier");
  const [y_stable_peg_breaker, setY_stable_peg_breaker]           = useState("< .998");
  const [y_tvl_drain_breaker, setY_tvl_drain_breaker]             = useState("-20% / 24h");
  const [y_rebalance_cooldown, setY_rebalance_cooldown]           = useState("4h");
  const [y_dd, setY_dd]                                           = useState("");
  const [y_protocols, setY_protocols] = useState<string[]>(["Morphy", "Aave v3"]);

  /* ══ PAYMENTS ══ */
  const [p_payment_type, setP_payment_type]     = useState("recurring_bills");
  const [p_per_tx_limit, setP_per_tx_limit]     = useState("$10,000");
  const [p_daily_budget, setP_daily_budget]     = useState("$25,000");
  const [p_approve_above, setP_approve_above]   = useState("$10,000");
  const [p_velocity_24h, setP_velocity_24h]     = useState("$50,000");
  const [p_vol_spike, setP_vol_spike]           = useState("5x Baseline");
  const [p_sanctions_screen, setP_sanctions_screen] = useState("OFAC + Chainalysis");
  const [p_dup_window, setP_dup_window]         = useState("60 min");
  const [p_x402_on, setP_x402_on]               = useState(true);
  const [p_x402_max_slider, setP_x402_max_slider] = useState("3");
  const [p_recipient_list, setP_recipient_list] = useState<{name: string; address: string; tag: string; amount: string; freq: string}[]>([
    { name: "Linear",           address: "0x8c2a...3f10",     tag: "USDC",  amount: "$200",   freq: "Monthly"  },
    { name: "Anthropic API",    address: "x402 Host",         tag: "x402",  amount: "$50",    freq: "Per Call" },
    { name: "DMCC Office Rent", address: "WireX Beneficiary", tag: "WireX", amount: "$3,000", freq: "Monthly"  },
  ]);
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [p_open_dd, setP_open_dd]               = useState<string | null>(null);
  /* Add Recipient popup */
  const [pr_rail, setPr_rail]                   = useState("usdc");
  const [pr_name, setPr_name]                   = useState("");
  const [pr_address, setPr_address]             = useState("");
  const [pr_per_payment, setPr_per_payment]     = useState("");
  const [pr_monthly_cap, setPr_monthly_cap]     = useState("");
  const [pr_recurrence, setPr_recurrence]       = useState("scheduled");
  const [pr_frequency, setPr_frequency]         = useState("Monthly");
  const [pr_dd, setPr_dd]                       = useState("");
  const [pr_mm, setPr_mm]                       = useState("");
  const [pr_yyyy, setPr_yyyy]                   = useState("");
  const [pr_first_approval, setPr_first_approval] = useState(true);

  /* ══ ANALYTICS ══ */
  const [a_tracked_agents, setA_tracked_agents]       = useState("all");
  const [a_tracked_positions, setA_tracked_positions] = useState("all_open");
  const [a_report_frequency, setA_report_frequency]   = useState("daily");
  const [a_recommendations, setA_recommendations]     = useState("included");
  const [a_critical_routing, setA_critical_routing]   = useState("Dash + Slack + SMS");
  const [a_max_alerts_per_day, setA_max_alerts_per_day] = useState("10");
  const [a_compute_cap, setA_compute_cap]             = useState("250");
  const [a_auto_execute, setA_auto_execute]           = useState(true);
  const [a_auto_execute_scope, setA_auto_execute_scope] = useState("whitelist");
  const [a_execution_cap_usdc, setA_execution_cap_usdc] = useState("5,000");
  const [a_allowed_actions, setA_allowed_actions]     = useState("pause_agent_only");
  const [a_daily_action_cap, setA_daily_action_cap]   = useState("3");
  const [a_sanctions_hit_actions, setA_sanctions_hit_actions] = useState<string[]>(["Move funds", "Trade"]);

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
      max_exposure_percent: parseInt(y_max_exposure_percent),
      il_tolerance: y_il_tolerance,
      max_position_size_usdc: parseUsd(y_max_position_size_usdc),
      protocol_allowlist: y_protocols,
      protocol_downgrade: y_protocol_downgrade,
      stable_peg_breaker: y_stable_peg_breaker,
      tvl_drain_breaker: y_tvl_drain_breaker,
      rebalance_cooldown: y_rebalance_cooldown,
    };
    if (selectedType === "payments") return {
      payment_type: p_payment_type,
      per_tx_limit: p_per_tx_limit,
      daily_budget: p_daily_budget,
      approve_above: p_approve_above,
      velocity_24h: p_velocity_24h,
      volume_spike: p_vol_spike,
      sanctions: p_sanctions_screen,
      duplicate_window: p_dup_window,
      x402_enabled: p_x402_on,
      x402_max_per_request: Number(p_x402_max_slider),
      recipient_count: p_recipient_list.length,
      recipients: p_recipient_list.map(r => r.name),
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
  }, [selectedType, t_strategy_type, t_max_position_size_usdc, t_max_daily_loss_percent, t_kill_switch_drawdown, t_allowed_markets, t_cooldown_window_seconds, t_cumulative_exposure_limit, t_daily_spend_cap, t_order_types, t_max_slippage_bps, t_max_position_leverage, l_protocol, l_max_supply_usd, l_allowed_collateral_assets, l_allowed_borrow_assets, l_max_ltv_percent, l_target_ltv_percent, l_rebalance_threshold_percent, l_max_liquidation_risk_percent, l_max_protocol_exposure_percent, l_min_apy_target_percent, y_strategy_type, y_min_apy_percent, y_target_apy_percent, y_exit_if_apy_below_percent, y_max_slippage_bps, y_max_exposure_percent, y_il_tolerance, y_max_position_size_usdc, y_protocols, y_protocol_downgrade, y_stable_peg_breaker, y_tvl_drain_breaker, y_rebalance_cooldown, p_payment_type, p_per_tx_limit, p_daily_budget, p_approve_above, p_velocity_24h, p_vol_spike, p_sanctions_screen, p_dup_window, p_x402_on, p_x402_max_slider, p_recipient_list, a_tracked_agents, a_report_frequency, a_critical_routing, a_max_alerts_per_day, a_compute_cap, a_allowed_actions, c_objective, c_complexity_level, c_source_type, c_runtime, c_repo_url, c_allowed_tools, c_primary_limit, c_secondary_limit]);

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
  const cooldownLabel = (s: string): string => {
    const map: Record<string, string> = { "10": "10 sec", "30": "30 sec", "60": "60 sec", "300": "5 min", "900": "15 min" };
    return map[s] ?? `${s}s`;
  };

  const policyPreviewCards: { label: string; value: string; valueColor?: string; valueNode?: React.ReactNode }[] = (() => {
    if (selectedType === "trading") return [
      { label: "Max Daily Loss",        value: `-${t_max_daily_loss_percent}%` },
      { label: "Kill Switch",           value: `-${t_kill_switch_drawdown}%` },
      { label: "Approval Threshold",    value: `> 90%` },
      { label: "Markets",               value: t_allowed_markets.join(" · "), valueNode: (
          <div className="flex flex-wrap gap-[4px] items-center mt-auto">
            {t_allowed_markets.slice(0, 3).map((m, i) => (
              <span key={m} className="flex items-center gap-[4px]">
                {i > 0 && <span className="inline-block size-[4px] rounded-full bg-[#6c779d]" />}
                <span className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[14px] leading-[20px]">{m}</span>
              </span>
            ))}
            {t_allowed_markets.length > 3 && (
              <span className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[12px]">+{t_allowed_markets.length - 3}</span>
            )}
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
      { label: "Cooldown",              value: cooldownLabel(t_cooldown_window_seconds) },
      { label: "Max Position Size",     value: `$${parseUsd(t_max_position_size_usdc).toLocaleString()}` },
      { label: "Cumulative Exposure",   value: `$${parseUsd(t_cumulative_exposure_limit).toLocaleString()}` },
      { label: "Max Leverage",          value: `${t_max_position_leverage}×` },
      { label: "Strategy",              value: t_strategy_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) },
      { label: "Capital Allocated",     value: `$${parseUsd(capital).toLocaleString()} ${capitalAsset}` },
      { label: "Daily Spend Cap",       value: `$${parseUsd(t_daily_spend_cap).toLocaleString()}` },
    ];
    if (selectedType === "lending") {
      const fmtProtocol = (p: string) => (({
        morpho_blue: "Morpho Blue", aave_v3: "Aave v3", compound_v3: "Compound v3", spark: "Spark",
      } as Record<string, string>)[p] || p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
      const dotList = (items: string[]) => (
        <div className="flex flex-wrap gap-[4px] items-center mt-auto">
          {items.map((item, i) => (
            <span key={item} className="flex items-center gap-[4px]">
              {i > 0 && <span className="inline-block size-[4px] rounded-full bg-[#6c779d] shrink-0" />}
              <span className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[14px] leading-[20px]">{item}</span>
            </span>
          ))}
        </div>
      );
      return [
        { label: "Lending Vehicle",          value: fmtProtocol(l_protocol), valueNode: dotList([fmtProtocol(l_protocol)]) },
        { label: "Collateral Assets",        value: l_allowed_collateral_assets.join(", "), valueNode: dotList(l_allowed_collateral_assets.length ? l_allowed_collateral_assets : ["—"]) },
        { label: "Max Protocol Exposure",    value: `${l_max_protocol_exposure_percent}%` },
        { label: "Target LTV",               value: `${l_target_ltv_percent}%` },
        { label: "Max LTV at Origination",   value: `${l_max_ltv_percent}%` },
        { label: "Rebalance Threshold",      value: `${l_rebalance_threshold_percent}% from target` },
        { label: "Liquidation Risk Ceiling", value: `${l_liquidation_risk_ceiling}% LTV` },
        { label: "Book LTV Breaker",         value: `> ${l_halt_ltv_exceeds}% halt` },
      ];
    }
    if (selectedType === "yield") return [
      { label: "Strategy",          value: y_strategy_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) },
      { label: "Target APY",        value: `${y_target_apy_percent}%` },
      { label: "Min APY",           value: `${y_min_apy_percent}%` },
      { label: "Exit If APY Below", value: `${y_exit_if_apy_below_percent}%` },
      { label: "Max Slippage",      value: `${y_max_slippage_bps} bps` },
      { label: "Max Exposure",      value: `${y_max_exposure_percent}%` },
      { label: "Max Position",      value: `$${parseUsd(y_max_position_size_usdc).toLocaleString()}` },
      { label: "IL Tolerance",      value: y_il_tolerance },
      { label: "Rebalance",         value: y_rebalance_cooldown },
      { label: "Capital Allocated", value: `$${parseUsd(capital).toLocaleString()} ${capitalAsset}` },
    ];
    if (selectedType === "payments") {
      const fmtPayType = (v: string) => (({ recurring_bills: "Recurring + Bills", direct_transfers: "Direct Transfers", batch_payroll: "Batch Payroll", x402: "x402 API" } as Record<string,string>)[v] || v.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()));
      const dotList = (items: string[]) => (
        <div className="flex flex-wrap gap-[4px] items-center mt-auto">
          {items.map((item, i) => (
            <span key={item} className="flex items-center gap-[4px]">
              {i > 0 && <span className="inline-block size-[4px] rounded-full bg-[#6c779d] shrink-0" />}
              <span className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[14px] leading-[20px]">{item}</span>
            </span>
          ))}
        </div>
      );
      return [
        { label: "Payment Type",    value: fmtPayType(p_payment_type) },
        { label: "Per-TX Limit",    value: p_per_tx_limit },
        { label: "Daily Budget",    value: p_daily_budget },
        { label: "Approve Above",   value: p_approve_above },
        { label: "Recipients",      value: `${p_recipient_list.length} recipient${p_recipient_list.length !== 1 ? "s" : ""}`, valueNode: dotList(p_recipient_list.map(r => r.name)) },
        { label: "x402 Enabled",    value: p_x402_on ? "On" : "Off" },
        { label: "x402 Max / Req",  value: `$${p_x402_max_slider}` },
        { label: "Velocity (24h)",  value: p_velocity_24h },
        { label: "Volume Spike",    value: p_vol_spike },
        { label: "Sanctions",       value: p_sanctions_screen },
        { label: "Dup. Window",     value: p_dup_window },
      ];
    }
    if (selectedType === "analytics") {
      const fmtReportFreq = (v: string) => (({ daily: "Daily 09:00 GST", weekly: "Weekly", hourly: "Hourly" } as Record<string,string>)[v] || v.replace(/\b\w/g,c=>c.toUpperCase()));
      const fmtActions = (v: string) => (({ pause_agent_only: "Pause agent only", rebalance: "Rebalance", halt_all: "Halt all" } as Record<string,string>)[v] || v.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()));
      const dotList = (items: string[]) => (
        <div className="flex flex-wrap gap-[4px] items-center mt-auto">
          {items.map((item, i) => (
            <span key={item} className="flex items-center gap-[4px]">
              {i > 0 && <span className="inline-block size-[4px] rounded-full bg-[#6c779d] shrink-0" />}
              <span className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[14px] leading-[20px]">{item}</span>
            </span>
          ))}
        </div>
      );
      return [
        { label: "Tracked Agents",     value: a_tracked_agents === "all" ? "All (5)" : "Selected" },
        { label: "Tracked Positions",  value: a_tracked_positions === "all_open" ? "All open" : a_tracked_positions },
        { label: "Report Frequency",   value: fmtReportFreq(a_report_frequency) },
        { label: "Recommendations",    value: a_recommendations === "included" ? "Included" : "Excluded" },
        { label: "Critical Routing",   value: a_critical_routing },
        { label: "Max Alerts / Day",   value: a_max_alerts_per_day },
        { label: "Compute Cap",        value: `$${parseUsd(a_compute_cap).toLocaleString()} / month` },
        { label: "Auto Execute",       value: a_auto_execute ? `Enabled · ${a_auto_execute_scope.charAt(0).toUpperCase() + a_auto_execute_scope.slice(1)}` : "Disabled", valueNode: a_auto_execute ? dotList(["Enabled", a_auto_execute_scope.charAt(0).toUpperCase() + a_auto_execute_scope.slice(1)]) : undefined },
        { label: "Execution Cap",      value: `$${parseUsd(a_execution_cap_usdc).toLocaleString()} / action` },
        { label: "Allowed Actions",    value: fmtActions(a_allowed_actions) },
        { label: "Daily Action Cap",   value: a_daily_action_cap },
        { label: "Sanctions Hit",      value: a_sanctions_hit_actions.join(" · "), valueNode: dotList(a_sanctions_hit_actions) },
      ];
    }
    if (selectedType === "custom") return [
      { label: "Objective",        value: c_objective.slice(0, 24) || "Custom" },
      { label: "Complexity",       value: c_complexity_level.replace(/\b\w/g, c => c.toUpperCase()) },
      { label: "Source Type",      value: c_source_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) },
      { label: "Runtime",          value: c_runtime },
      { label: "Primary Limit",    value: `$${parseUsd(c_primary_limit).toLocaleString()}` },
      { label: "Secondary Limit",  value: `$${parseUsd(c_secondary_limit).toLocaleString()}` },
      { label: "Tools Enabled",    value: `${c_allowed_tools.length} tool${c_allowed_tools.length !== 1 ? "s" : ""}` },
      { label: "Capital Allocated", value: `$${parseUsd(capital).toLocaleString()} ${capitalAsset}` },
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

        {/* ══ ASSET SEARCH POPUP (overlays full modal) ══ */}
        {l_show_asset_picker && (
          <AssetSearchPopup
            selected={l_allowed_collateral_assets}
            onToggle={(ticker) => setL_allowed_collateral_assets(prev =>
              prev.includes(ticker) ? prev.filter(a => a !== ticker) : [...prev, ticker]
            )}
            onClose={() => setL_show_asset_picker(false)}
          />
        )}

        {/* ══ ADD RECIPIENT POPUP (overlays full modal) ══ */}
        {showAddRecipient && selectedType === "payments" && (
          <div className="absolute inset-0 z-20 bg-[#11141b] flex flex-col rounded-[24px] overflow-hidden">
            {/* Title bar */}
            <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] h-[56px] flex items-center justify-center relative shrink-0">
              <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[20px] leading-[24px]">Add Recipient</p>
              <button
                type="button"
                data-testid="button-close-add-recipient"
                onClick={() => setShowAddRecipient(false)}
                className="absolute right-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
              >
                <X size={16} className="text-[#6c779d]" />
              </button>
            </div>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-[24px] flex flex-col gap-[24px]">
              <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px]">
                Add a recipient this agent can pay. Each recipient has it's own cap and recurrence.
              </p>
              <div className="flex flex-col gap-[24px]">
                {/* RAIL */}
                <div className="flex flex-col gap-[16px]">
                  <SectionDivider title="RAIL" />
                  <div className="grid grid-cols-2 gap-[12px]">
                    {[
                      { id: "usdc",  label: "USDC",  desc: "On-chain direct transfer" },
                      { id: "x402",  label: "x402",   desc: "Machine payments per call" },
                      { id: "wirex", label: "WireX",  desc: "Fiat beneficiary · AED, USD, EUR" },
                    ].map((opt) => (
                      <RadioCard key={opt.id} label={opt.label} desc={opt.desc} checked={pr_rail === opt.id} onClick={() => setPr_rail(opt.id)} />
                    ))}
                  </div>
                </div>
                {/* Recipient Name */}
                <div className="flex flex-col gap-[4px]">
                  <div className="flex gap-[4px] items-start">
                    <FieldLabel>Recipient Name</FieldLabel>
                    <Info size={20} className="text-[#414965] shrink-0" />
                  </div>
                  <div className={`flex items-center px-[8px] py-[10px] rounded-[8px] bg-[#222737] ${pr_name ? "border border-[#414965]" : ""}`}>
                    <input
                      value={pr_name}
                      onChange={(e) => setPr_name(e.target.value)}
                      placeholder="Maya R. Contractor"
                      data-testid="input-recipient-name"
                      className="flex-1 bg-transparent font-['Gilroy-Medium',sans-serif] text-white text-[16px] leading-[20px] outline-none placeholder:text-[#414965]"
                    />
                  </div>
                </div>
                {/* Wallet Address */}
                <div className="flex flex-col gap-[4px]">
                  <div className="flex gap-[4px] items-start">
                    <FieldLabel>Wallet Address</FieldLabel>
                    <Info size={20} className="text-[#414965] shrink-0" />
                  </div>
                  <div className="bg-[#222737] flex items-center px-[8px] py-[10px] rounded-[8px]">
                    <input
                      value={pr_address}
                      onChange={(e) => setPr_address(e.target.value)}
                      placeholder="0x91de4f2a8b1c33d2e9a7c5e3d2b1a9f8e7c63a40"
                      data-testid="input-recipient-address"
                      className="flex-1 bg-transparent font-['Gilroy-Medium',sans-serif] text-white text-[16px] leading-[20px] outline-none placeholder:text-[#414965]"
                    />
                  </div>
                </div>
                <p className="font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[14px] leading-[20px]">
                  Authorize the agent to operate within the defined policy. This commits the policy hash on-chain.
                </p>
                {/* PAYMENT CAPS */}
                <div className="flex flex-col gap-[16px]">
                  <SectionDivider title="PAYMENT CAPS" />
                  <div className="flex gap-[16px] items-start">
                    <div className="flex flex-1 flex-col gap-[4px] min-w-0">
                      <div className="flex gap-[4px] items-start">
                        <FieldLabel>Per-Payment Cap</FieldLabel>
                        <Info size={20} className="text-[#414965] shrink-0" />
                      </div>
                      <div className="bg-[#222737] flex items-center px-[8px] py-[10px] rounded-[8px]">
                        <input
                          value={pr_per_payment}
                          onChange={(e) => setPr_per_payment(e.target.value)}
                          placeholder="$500"
                          data-testid="input-per-payment-cap"
                          className="flex-1 bg-transparent font-['Gilroy-Medium',sans-serif] text-white text-[16px] leading-[20px] outline-none placeholder:text-[#414965]"
                        />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-[4px] min-w-0">
                      <div className="flex gap-[4px] items-start">
                        <FieldLabel>Monthly Cap</FieldLabel>
                        <Info size={20} className="text-[#414965] shrink-0" />
                      </div>
                      <div className="bg-[#222737] flex items-center px-[8px] py-[10px] rounded-[8px]">
                        <input
                          value={pr_monthly_cap}
                          onChange={(e) => setPr_monthly_cap(e.target.value)}
                          placeholder="$5,000"
                          data-testid="input-monthly-cap"
                          className="flex-1 bg-transparent font-['Gilroy-Medium',sans-serif] text-white text-[16px] leading-[20px] outline-none placeholder:text-[#414965]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                {/* RECURRENCE */}
                <div className="flex flex-col gap-[16px]">
                  <SectionDivider title="RECURRENCE" />
                  <div className="grid grid-cols-2 gap-[12px]">
                    {[
                      { id: "on_demand", label: "On Demand",  desc: "Agent pays when triggered" },
                      { id: "scheduled", label: "Scheduled",  desc: "Repeat on a fixed cadence" },
                    ].map((opt) => (
                      <RadioCard key={opt.id} label={opt.label} desc={opt.desc} checked={pr_recurrence === opt.id} onClick={() => setPr_recurrence(opt.id)} />
                    ))}
                  </div>
                  <div className="flex gap-[16px] items-start">
                    <div className="flex flex-1 flex-col gap-[4px] min-w-0">
                      <div className="flex gap-[4px] items-start">
                        <FieldLabel>Frequency</FieldLabel>
                        <Info size={20} className="text-[#414965] shrink-0" />
                      </div>
                      <div className="relative">
                        <button type="button" onClick={() => setP_open_dd(p_open_dd === "pr_freq" ? null : "pr_freq")}
                          className="bg-[#222737] flex gap-[8px] items-center p-[8px] rounded-[8px] w-full h-[40px]">
                          <span className="flex-1 text-left font-['Gilroy-Medium',sans-serif] text-white text-[16px]">{pr_frequency}</span>
                          <ChevronDown size={24} className="text-[#6c779d]" />
                        </button>
                        {p_open_dd === "pr_freq" && (
                          <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-[#0a0c10] border border-[#1d2132] rounded-[12px] p-[8px]"
                            style={{ boxShadow: "0px 17px 17px 0px rgba(0,0,0,0.34),0px 4px 9px 0px rgba(0,0,0,0.39)" }}>
                            {["Daily","Weekly","Monthly","Per Call"].map((opt) => (
                              <button key={opt} type="button"
                                onClick={() => { setPr_frequency(opt); setP_open_dd(null); }}
                                className={`w-full text-left px-[8px] py-[8px] rounded-[8px] font-['Gilroy-Medium',sans-serif] text-[16px] hover:bg-[#1d2132] transition-colors ${pr_frequency === opt ? "text-white" : "text-[#a8b9f4]"}`}>
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-[4px] min-w-0">
                      <div className="flex gap-[4px] items-start">
                        <FieldLabel>First Payment</FieldLabel>
                        <Info size={20} className="text-[#414965] shrink-0" />
                      </div>
                      <div className="flex gap-[4px]">
                        <input value={pr_dd} onChange={(e) => setPr_dd(e.target.value)} placeholder="DD"
                          className="flex-1 bg-[#222737] font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] px-[8px] py-[10px] rounded-[8px] outline-none min-w-0 placeholder:text-[#414965]" />
                        <input value={pr_mm} onChange={(e) => setPr_mm(e.target.value)} placeholder="MM"
                          className="flex-1 bg-[#222737] font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] px-[8px] py-[10px] rounded-[8px] outline-none min-w-0 placeholder:text-[#414965]" />
                        <input value={pr_yyyy} onChange={(e) => setPr_yyyy(e.target.value)} placeholder="YYYY"
                          className="flex-1 bg-[#222737] font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] px-[8px] py-[10px] rounded-[8px] outline-none min-w-0 placeholder:text-[#414965]" />
                      </div>
                    </div>
                  </div>
                </div>
                {/* FIRST PAYMENT APPROVAL */}
                <div className="flex flex-col gap-[16px]">
                  <SectionDivider title="FIRST PAYMENT APPROVAL" />
                  <div className="flex gap-[16px] items-start">
                    <button
                      type="button"
                      onClick={() => setPr_first_approval(!pr_first_approval)}
                      className={`overflow-hidden relative shrink-0 size-[20px] rounded-[4px] border border-solid transition-colors ${pr_first_approval ? "bg-[#240757] border-[rgba(118,49,238,0.2)]" : "bg-[#06070a] border-[#222737]"}`}
                    >
                      {pr_first_approval && (
                        <svg className="absolute inset-[3px]" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#7631EE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <p className="flex-1 font-['Gilroy-Medium',sans-serif] text-[#6c779d] text-[16px] leading-[20px]">
                      Because this is a new counterparty, require my explicit approval before the first payment. Subsequent payments up to the cap will execute automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Bottom buttons */}
            <div className="border-t border-[#1d2132] p-[24px] flex gap-[16px] items-center shrink-0">
              <button type="button" className="flex-1 bg-[#222737] font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[16px] leading-[20px] px-[20px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity">
                Import CSV
              </button>
              <button
                type="button"
                data-testid="button-save-recipient"
                onClick={() => {
                  const tagMap: Record<string, string> = { usdc: "USDC", x402: "x402", wirex: "WireX" };
                  setP_recipient_list([...p_recipient_list, {
                    name: pr_name.trim() || "New Recipient",
                    address: pr_address.trim() || "0x...",
                    tag: tagMap[pr_rail] || "USDC",
                    amount: pr_per_payment.trim() || "$0",
                    freq: pr_frequency,
                  }]);
                  setShowAddRecipient(false);
                  setPr_name(""); setPr_address(""); setPr_per_payment(""); setPr_monthly_cap("");
                  setPr_dd(""); setPr_mm(""); setPr_yyyy(""); setPr_rail("usdc");
                  setPr_recurrence("scheduled"); setPr_frequency("Monthly"); setPr_first_approval(true);
                }}
                className="flex-1 bg-[#123509] font-['Gilroy-SemiBold',sans-serif] text-[#42bf23] text-[16px] leading-[20px] px-[20px] py-[10px] rounded-[100px] hover:opacity-80 transition-opacity"
              >
                Save Recipient
              </button>
            </div>
          </div>
        )}

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
                    {selectedType === "payments"  && "Payment controls, recipients, and parameters for autonomous payment execution."}
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

                    {/* ── PROTOCOLS ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="PROTOCOLS" />
                      <div className="flex flex-col gap-[4px]">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Lending Vehicle</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <div className="grid grid-cols-2 gap-[12px] mt-[4px]">
                          {[
                            { id: "morpho_blue", label: "Morpho Blue",  desc: "Base · A rated" },
                            { id: "aave_v3",     label: "Aave v3",      desc: "Base · A rated" },
                            { id: "compound_v3", label: "Compound v3",  desc: "Base · A rated" },
                            { id: "spark",       label: "Spark",        desc: "Base · A rated" },
                          ].map((opt) => (
                            <RadioCard key={opt.id} label={opt.label} desc={opt.desc} small checked={l_protocol === opt.id} onClick={() => setL_protocol(opt.id)} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── CONTROLS ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CONTROLS" />

                      {/* Accepted Collateral — tag chips + add button */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Accepted Collateral</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <div className="flex flex-wrap gap-[8px] items-center w-full mt-[4px]">
                          {l_allowed_collateral_assets.map(ticker => (
                            <div key={ticker} className="h-[40px] flex items-center gap-[8px] px-[12px] bg-[#0a0c10] rounded-[100px]">
                              <span className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[16px] leading-[20px]">{ticker}</span>
                              <button
                                type="button"
                                onClick={() => setL_allowed_collateral_assets(l_allowed_collateral_assets.filter(a => a !== ticker))}
                                className="flex items-center justify-center"
                              >
                                <X size={14} className="text-[#6c779d] hover:text-[#a8b9f4] transition-colors" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            data-testid="button-add-collateral"
                            onClick={() => setL_show_asset_picker(true)}
                            className="size-[40px] rounded-[100px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
                          >
                            <Plus size={16} className="text-[#6c779d]" />
                          </button>
                        </div>
                      </div>

                      {/* Max Exposure Per Protocol */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Max Exposure Per Protocol</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider min={1} max={20} value={l_max_protocol_exposure_percent} onChange={setL_max_protocol_exposure_percent} unit="" />
                      </div>

                      {/* Target LTV */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Target LTV</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider min={1} max={100} value={l_target_ltv_percent} onChange={setL_target_ltv_percent} unit="%" />
                      </div>

                      {/* Max LTV at Origination */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Max LTV at Origination</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider min={1} max={100} value={l_max_ltv_percent} onChange={setL_max_ltv_percent} unit="%" />
                      </div>

                      {/* Rebalance Threshold */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Rebalance Threshold</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider min={1} max={20} value={l_rebalance_threshold_percent} onChange={setL_rebalance_threshold_percent} unit="%" />
                      </div>
                    </div>

                    {/* ── SAFETY ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="SAFETY" />

                      {/* Liquidation Risk Ceiling */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Liquidation Risk Ceiling</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider min={1} max={100} value={l_liquidation_risk_ceiling} onChange={setL_liquidation_risk_ceiling} unit="%" />
                      </div>

                      {/* Halt New Loans if Book LTV Exceeds */}
                      <div className="flex flex-col gap-[4px] items-start w-full">
                        <div className="flex gap-[4px] items-center">
                          <FieldLabel>Halt New Loans if Book LTV Exceeds</FieldLabel>
                          <Info size={20} className="text-[#414965]" />
                        </div>
                        <ConfigSlider min={1} max={100} value={l_halt_ltv_exceeds} onChange={setL_halt_ltv_exceeds} unit="%" />
                      </div>
                    </div>

                  </div>
                )}

                {/* YIELD CONFIG */}
                {selectedType === "yield" && (
                  <div className="flex flex-col gap-[24px] w-full" onClick={() => y_dd && setY_dd("")}>
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CONTROLS" />
                      {/* APY Sliders */}
                      <div className="flex flex-col gap-[12px] w-full">
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Target APY</FieldLabel>
                          <ConfigSlider min={1} max={20} value={y_target_apy_percent} onChange={setY_target_apy_percent} unit="%" />
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Min APY Floor</FieldLabel>
                          <ConfigSlider min={1} max={20} value={y_min_apy_percent} onChange={setY_min_apy_percent} unit="%" />
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Exit if APY Drops Below</FieldLabel>
                          <ConfigSlider min={1} max={20} value={y_exit_if_apy_below_percent} onChange={setY_exit_if_apy_below_percent} unit="%" />
                        </div>
                      </div>
                      {/* Dropdowns 2-col grid */}
                      <div className="grid grid-cols-2 gap-[16px] w-full">
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="Max Exposure / Protocol"
                            value={y_max_exposure_percent}
                            options={[
                              { label: "25%", value: "25" },
                              { label: "30%", value: "30" },
                              { label: "40%", value: "40" },
                              { label: "50%", value: "50" },
                            ]}
                            open={y_dd === "max_exposure"}
                            onOpen={() => setY_dd(y_dd === "max_exposure" ? "" : "max_exposure")}
                            onChange={(v) => { setY_max_exposure_percent(v); setY_dd(""); }}
                          />
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="Max Position Size"
                            value={y_max_position_size_usdc}
                            options={[
                              { label: "$50,000",     value: "50,000" },
                              { label: "$100,000",    value: "100,000" },
                              { label: "$250,000",    value: "250,000" },
                              { label: "$500,000",    value: "500,000" },
                              { label: "$750,000",    value: "750,000" },
                              { label: "$1,000,000",  value: "1,000,000" },
                            ]}
                            open={y_dd === "max_position"}
                            onOpen={() => setY_dd(y_dd === "max_position" ? "" : "max_position")}
                            onChange={(v) => { setY_max_position_size_usdc(v); setY_dd(""); }}
                          />
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="Max Slippage"
                            value={y_max_slippage_bps}
                            options={[
                              { label: "10 bps", value: "10" },
                              { label: "25 bps", value: "25" },
                              { label: "50 bps", value: "50" },
                              { label: "75 bps", value: "75" },
                            ]}
                            open={y_dd === "max_slippage"}
                            onOpen={() => setY_dd(y_dd === "max_slippage" ? "" : "max_slippage")}
                            onChange={(v) => { setY_max_slippage_bps(v); setY_dd(""); }}
                          />
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="IL Tolerance"
                            value={y_il_tolerance}
                            options={[
                              { label: "0% (No LP)", value: "0% (No LP)" },
                              { label: "1%",         value: "1%" },
                              { label: "2%",         value: "2%" },
                              { label: "5%",         value: "5%" },
                            ]}
                            open={y_dd === "il_tolerance"}
                            onOpen={() => setY_dd(y_dd === "il_tolerance" ? "" : "il_tolerance")}
                            onChange={(v) => { setY_il_tolerance(v); setY_dd(""); }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="PROTOCOL ALLOWLIST" />
                      <div className="flex flex-wrap gap-[12px]">
                        {["Morphy","Aave v3","Pendle","Sky","Compound","Curve"].map((protocol) => {
                          const sel = y_protocols.includes(protocol);
                          return (
                            <button
                              key={protocol}
                              type="button"
                              onClick={() => setY_protocols(tog(y_protocols, protocol))}
                              className="bg-[#0a0c10] flex gap-[8px] items-center px-[12px] py-[10px] rounded-[12px] transition-colors hover:bg-[#111520]"
                            >
                              <span className={`font-['Gilroy-Medium',sans-serif] text-[14px] leading-[20px] ${sel ? "text-[#a8b9f4]" : "text-[#6c779d]"}`}>{protocol}</span>
                              <div className={`size-[20px] rounded-full shrink-0 flex items-center justify-center transition-colors ${sel ? "bg-[#123509] border border-[rgba(66,191,35,0.2)]" : "bg-[#06070a] border border-[#222737]"}`}>
                                {sel && (
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                    <path d="M1 4L3.5 6.5L9 1" stroke="#42BF23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="SAFETY" />
                      <div className="grid grid-cols-2 gap-[16px] w-full">
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="Protocol Downgrade"
                            value={y_protocol_downgrade}
                            options={[
                              { label: "1 tier",  value: "1 tier" },
                              { label: "2 tiers", value: "2 tiers" },
                              { label: "Pause",   value: "Pause" },
                              { label: "Exit",    value: "Exit" },
                              { label: "Any",     value: "Any" },
                            ]}
                            open={y_dd === "protocol_downgrade"}
                            onOpen={() => setY_dd(y_dd === "protocol_downgrade" ? "" : "protocol_downgrade")}
                            onChange={(v) => { setY_protocol_downgrade(v); setY_dd(""); }}
                          />
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="TVL Drain Breaker"
                            value={y_tvl_drain_breaker}
                            options={[
                              { label: "-20% / 24h", value: "-20% / 24h" },
                              { label: "-30% / 24h", value: "-30% / 24h" },
                              { label: "-40% / 24h", value: "-40% / 24h" },
                            ]}
                            open={y_dd === "tvl_drain"}
                            onOpen={() => setY_dd(y_dd === "tvl_drain" ? "" : "tvl_drain")}
                            onChange={(v) => { setY_tvl_drain_breaker(v); setY_dd(""); }}
                          />
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="Stable Peg Breaker"
                            value={y_stable_peg_breaker}
                            options={[
                              { label: "< .998", value: "< .998" },
                              { label: "< .995", value: "< .995" },
                              { label: "< .99",  value: "< .99" },
                            ]}
                            open={y_dd === "stable_peg"}
                            onOpen={() => setY_dd(y_dd === "stable_peg" ? "" : "stable_peg")}
                            onChange={(v) => { setY_stable_peg_breaker(v); setY_dd(""); }}
                          />
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <SmallDropdown
                            label="Rebalance Cooldown"
                            value={y_rebalance_cooldown}
                            options={[
                              { label: "4h",  value: "4h" },
                              { label: "12h", value: "12h" },
                              { label: "24h", value: "24h" },
                              { label: "72h", value: "72h" },
                            ]}
                            open={y_dd === "rebalance_cooldown"}
                            onOpen={() => setY_dd(y_dd === "rebalance_cooldown" ? "" : "rebalance_cooldown")}
                            onChange={(v) => { setY_rebalance_cooldown(v); setY_dd(""); }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAYMENTS CONFIG */}
                {selectedType === "payments" && (
                  <div className="flex flex-col gap-[24px] w-full" onClick={() => p_open_dd && setP_open_dd(null)}>

                    {/* ── PAYMENTS ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="PAYMENTS" />
                      <div className="flex flex-col gap-[4px]">
                        <div className="flex gap-[4px] items-start">
                          <FieldLabel>Payment Type</FieldLabel>
                          <Info size={20} className="text-[#414965] shrink-0" />
                        </div>
                        <div className="grid grid-cols-2 gap-[12px] mt-[4px]">
                          {[
                            { id: "recurring_bills",  label: "Recurring + Bills",  desc: "Automates recurring bill payments on a fixed schedule." },
                            { id: "direct_transfers", label: "Direct Transfers",    desc: "Initiates one-time transfers to whitelisted recipient addresses." },
                            { id: "batch_payroll",    label: "Batch Payroll",       desc: "Executes scheduled multi-recipient payroll distributions." },
                            { id: "x402",             label: "x402 API",            desc: "Handles machine-to-machine payments via the x402 protocol." },
                          ].map((opt) => (
                            <RadioCard key={opt.id} label={opt.label} desc={opt.desc} small checked={p_payment_type === opt.id} onClick={() => { setP_payment_type(opt.id); setP_open_dd(null); }} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── CONTROLS ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="CONTROLS" />

                      {/* 2×2 dropdown grid (3 fields) */}
                      <div className="grid grid-cols-2 gap-[16px]" onClick={(e) => e.stopPropagation()}>
                        <PD label="Per-TX Limit" value={p_per_tx_limit}
                          options={["$1,000","$5,000","$10,000","$50,000"]}
                          ddId="per_tx" openDd={p_open_dd} setOpenDd={setP_open_dd}
                          onChange={setP_per_tx_limit} />
                        <PD label="Daily Budget" value={p_daily_budget}
                          options={["$5,000","$15,000","$25,000","$100,000"]}
                          ddId="daily" openDd={p_open_dd} setOpenDd={setP_open_dd}
                          onChange={setP_daily_budget} />
                        <PD label="Approve Above" value={p_approve_above}
                          options={["$1,000","$5,000","$10,000","Always"]}
                          ddId="approve" openDd={p_open_dd} setOpenDd={setP_open_dd}
                          onChange={setP_approve_above} />
                      </div>

                      {/* Payment Recipients */}
                      <div className="flex flex-col gap-[16px]">
                        <div className="flex flex-col gap-[4px]">
                          <div className="flex gap-[4px] items-start">
                            <FieldLabel>Payment Recipients</FieldLabel>
                            <Info size={20} className="text-[#414965] shrink-0" />
                          </div>
                          <div className="border border-[#1d2132] flex gap-[16px] items-center p-[16px] rounded-[12px]">
                            <p className="flex-1 font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[16px] leading-[20px] min-w-0">
                              Add recipients individually or import a CSV. Each gets its own per-payment cap.
                            </p>
                            <button
                              type="button"
                              data-testid="button-open-add-recipient"
                              onClick={(e) => { e.stopPropagation(); setShowAddRecipient(true); }}
                              className="bg-[#222737] flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0"
                            >
                              <Plus size={16} className="text-[#6c779d] shrink-0" />
                              <span className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[12px] leading-[16px]">Add</span>
                            </button>
                          </div>
                        </div>
                        {/* Recipient rows */}
                        <div className="flex flex-col gap-[8px]">
                          {p_recipient_list.map((r, idx) => (
                            <div key={idx} className="bg-[#0a0c10] flex gap-[16px] items-center p-[16px] rounded-[12px]">
                              <div className="flex flex-1 items-center justify-between min-w-0">
                                <div className="flex flex-col gap-[4px] items-start justify-center">
                                  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">{r.name}</p>
                                  <div className="flex gap-[4px] items-center">
                                    <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">{r.address}</p>
                                    <div className="size-[4px] rounded-full bg-[#6c779d] shrink-0" />
                                    <div className="bg-[#222737] border border-[rgba(108,119,157,0.2)] flex items-center px-[8px] py-[3px] rounded-[22px] shrink-0">
                                      <span className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[11px] leading-[14px]">{r.tag}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-[4px] items-end justify-center ml-[8px]">
                                  <p className="font-['JetBrains_Mono',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] text-right whitespace-nowrap">{r.amount}</p>
                                  <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">{r.freq}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                data-testid={`button-delete-recipient-${idx}`}
                                onClick={(e) => { e.stopPropagation(); setP_recipient_list(p_recipient_list.filter((_, i) => i !== idx)); }}
                                className="relative rounded-[100px] size-[24px] bg-[#1d2132] flex items-center justify-center shrink-0 hover:bg-[#222737] transition-colors"
                              >
                                <X size={12} className="text-[#6c779d]" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* x402 Toggle */}
                      <div className="border border-[#1d2132] flex gap-[16px] items-center p-[16px] rounded-[12px]">
                        <div className="flex flex-1 flex-col gap-[4px] items-start min-w-0">
                          <p className="font-['Gilroy-Medium',sans-serif] text-[#a8b9f4] text-[16px] leading-[20px] w-full">Accept x402 Micropayments</p>
                          <p className="font-['Gilroy-SemiBold',sans-serif] text-[#6c779d] text-[14px] leading-[20px] w-full">Pay-per-call API access for AI workloads</p>
                        </div>
                        <PaySwitch on={p_x402_on} onToggle={() => setP_x402_on(!p_x402_on)} />
                      </div>

                      {/* Max x402 slider */}
                      {p_x402_on && (
                        <div className="flex flex-col gap-[4px]">
                          <FieldLabel>Max x402 Payment Per Request</FieldLabel>
                          <ConfigSlider min={1} max={5} value={p_x402_max_slider} onChange={setP_x402_max_slider} unit="" />
                        </div>
                      )}
                    </div>

                    {/* ── SAFETY ── */}
                    <div className="flex flex-col gap-[16px] w-full">
                      <SectionDivider title="SAFETY" />
                      <div className="grid grid-cols-2 gap-[16px]" onClick={(e) => e.stopPropagation()}>
                        <PD label="CounterParty Velocity (24h)" value={p_velocity_24h}
                          options={["$10,000","$25,000","$50,000","$100,000"]}
                          ddId="velocity" openDd={p_open_dd} setOpenDd={setP_open_dd}
                          onChange={setP_velocity_24h} />
                        <PD label="Volume Spike Breaker" value={p_vol_spike}
                          options={["3x Baseline","5x Baseline","10x Baseline"]}
                          ddId="spike" openDd={p_open_dd} setOpenDd={setP_open_dd}
                          onChange={setP_vol_spike} />
                        <PD label="Sanctions Screening" value={p_sanctions_screen}
                          options={["OFAC + Chainalysis","OFAC only"]}
                          ddId="sanctions" openDd={p_open_dd} setOpenDd={setP_open_dd}
                          onChange={setP_sanctions_screen} />
                        <PD label="Duplicate Detection Window" value={p_dup_window}
                          options={["15 mins","30 mins","60 mins"]}
                          ddId="dupwindow" openDd={p_open_dd} setOpenDd={setP_open_dd}
                          onChange={setP_dup_window} />
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
