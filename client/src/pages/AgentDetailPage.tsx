import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { agents, AgentData, AgentStatus } from "@/lib/agentsData";
import { AgentPerfChart } from "@/components/AgentPerfChart";
import { apiRequest } from "@/lib/queryClient";
import { useNav, AgentPrefillData } from "@/lib/navContext";

/* ─── Enforcement tiers (sourced from schema doc) ─── */
const ENFORCEMENT: Record<string, { tier1: string[]; tier2extra?: string; tier3: string }> = {
  trading:   { tier1: ["Position size check vs max_position_size_usdc", "Market in allowed_markets allowlist", "Velocity check (cooldown_window_seconds)", "Daily loss tracking vs max_daily_loss_percent", "Cumulative exposure vs cumulative_exposure_limit"], tier3: "Smart contract guardrails, spend limits, recipient restrictions" },
  lending:   { tier1: ["Supply amount check vs max_supply_usd", "Collateral in allowed_collateral_assets", "LTV simulation before every borrow (vs max_ltv_percent)", "Liquidation risk < max_liquidation_risk_percent", "Protocol exposure ≤ max_protocol_exposure_percent"], tier2extra: "Oracle-gated LTV verification", tier3: "Enforces cumulative spend limit, prevents non-whitelisted pool addresses" },
  yield:     { tier1: ["Entry slippage ≤ max_slippage_bps", "Position ≤ max_position_size_usdc", "APY ≥ min_apy_percent at entry", "IL simulation vs impermanent_loss_tolerance_percent", "Stable pair concentration ≤ max_stable_pair_concentration"], tier2extra: "Oracle-gated APY confirmation", tier3: "Enforces position limits and concentration caps" },
  payments:  { tier1: ["Recipient in allowlisted_recipients", "Amount ≤ per_transaction_limit_usdc", "Daily spend ≤ daily_spend_budget_usdc", "Daily tx count ≤ daily_transaction_count_limit", "x402 header parsing and allowlist validation", "Approval routing for amounts > require_approval_above_usdc"], tier3: "Recipient whitelisting at smart contract level" },
  analytics: { tier1: ["No budget enforcement for read-only operations", "ERC-8004 registry records all observations", "pgvector stores historical data for trend analysis", "For auto-execute: validates against execution_limit_usdc", "execution_whitelist agent type check"], tier3: "Standard PolicyValidator flow; ERC-4337 guardrails on auto-execute only" },
  custom:    { tier1: ["Tool in allowed_tools whitelist", "Tool not in forbidden_tools blacklist", "Operations ≤ max_operations_per_hour", "Cumulative P&L circuit breaker (circuit_breaker_loss_percent)", "Counterparty in allowed_counterparties", "Contract calls ≤ max_calls_per_day"], tier3: "All executions go through standard PolicyValidator flow" },
};

/* ─── Claude Tool Schemas ─── */
const TOOL_SCHEMAS: Record<string, object[]> = {
  trading: [
    { name: "execute_trade", description: "Execute a spot or perpetual trade on Hyperliquid within policy bounds", input_schema: { type: "object", properties: { market: { type: "string", description: "Must be in allowed_markets" }, side: { type: "string", enum: ["long", "short"] }, size_usdc: { type: "number", description: "≤ max_position_size_usdc" }, order_type: { type: "string", enum: ["market", "limit", "stop_limit", "take_profit"] }, leverage: { type: "integer", minimum: 1, description: "≤ max_position_leverage" } }, required: ["market", "side", "size_usdc", "order_type"] } },
    { name: "close_position", description: "Close an open position fully or partially", input_schema: { type: "object", properties: { market: { type: "string" }, close_pct: { type: "number", minimum: 1, maximum: 100 } }, required: ["market"] } },
    { name: "get_position_info", description: "Retrieve current open positions, P&L, and exposure", input_schema: { type: "object", properties: { market: { type: "string" } }, required: [] } },
  ],
  lending: [
    { name: "supply_collateral", description: "Supply an asset to a lending protocol", input_schema: { type: "object", properties: { protocol: { type: "string", enum: ["aave", "compound", "morpho", "custom_contract"] }, asset: { type: "string", description: "Must be in allowed_collateral_assets" }, amount_usdc: { type: "number", description: "≤ max_supply_usd" } }, required: ["protocol", "asset", "amount_usdc"] } },
    { name: "borrow_asset", description: "Borrow an asset against supplied collateral (LTV must remain ≤ max_ltv_percent)", input_schema: { type: "object", properties: { protocol: { type: "string" }, asset: { type: "string", description: "Must be in allowed_borrow_assets" }, amount_usdc: { type: "number" } }, required: ["protocol", "asset", "amount_usdc"] } },
    { name: "rebalance_ltv", description: "Repay or withdraw to reach target_ltv_percent", input_schema: { type: "object", properties: { protocol: { type: "string" }, target_ltv_pct: { type: "number" } }, required: ["protocol", "target_ltv_pct"] } },
    { name: "get_health_factor", description: "Get current health factor, LTV, and liquidation risk", input_schema: { type: "object", properties: { protocol: { type: "string" } }, required: ["protocol"] } },
  ],
  yield: [
    { name: "enter_yield_position", description: "Enter a yield-generating position within policy bounds", input_schema: { type: "object", properties: { protocol: { type: "string" }, strategy: { type: "string", enum: ["stable_farming", "lp_on_dex", "perpetual_funding", "curve_convex", "custom"] }, assets: { type: "array", items: { type: "string" } }, amount_usdc: { type: "number", description: "≤ max_position_size_usdc" } }, required: ["protocol", "strategy", "assets", "amount_usdc"] } },
    { name: "exit_yield_position", description: "Exit a yield position and return to USDC", input_schema: { type: "object", properties: { position_id: { type: "string" }, exit_pct: { type: "number", minimum: 1, maximum: 100 } }, required: ["position_id"] } },
    { name: "check_apy", description: "Check current APY for a given protocol and asset pair", input_schema: { type: "object", properties: { protocol: { type: "string" }, asset_pair: { type: "string" } }, required: ["protocol"] } },
    { name: "compound_rewards", description: "Claim and reinvest yield rewards", input_schema: { type: "object", properties: { position_id: { type: "string" }, reinvest: { type: "boolean" } }, required: ["position_id"] } },
  ],
  payments: [
    { name: "send_payment", description: "Execute a USDC payment to an allowlisted recipient", input_schema: { type: "object", properties: { recipient: { type: "string", description: "Must be in allowlisted_recipients" }, amount_usdc: { type: "number", description: "≤ per_transaction_limit_usdc" }, memo: { type: "string" } }, required: ["recipient", "amount_usdc"] } },
    { name: "batch_payroll", description: "Execute a batch of payments in a single transaction", input_schema: { type: "object", properties: { payments: { type: "array", items: { type: "object", properties: { recipient: { type: "string" }, amount_usdc: { type: "number" } } } } }, required: ["payments"] } },
    { name: "verify_x402_request", description: "Parse and verify an x402 payment request header", input_schema: { type: "object", properties: { x402_header: { type: "string" }, max_amount_usdc: { type: "number", description: "≤ x402_max_per_request_usdc" } }, required: ["x402_header"] } },
    { name: "schedule_recurring_payment", description: "Schedule a recurring payment to an allowlisted recipient", input_schema: { type: "object", properties: { recipient: { type: "string" }, amount_usdc: { type: "number" }, interval: { type: "string", enum: ["daily", "weekly", "monthly"] } }, required: ["recipient", "amount_usdc", "interval"] } },
  ],
  analytics: [
    { name: "get_portfolio_snapshot", description: "Return current portfolio state across tracked agents", input_schema: { type: "object", properties: { agent_ids: { type: "array", items: { type: "string" } }, include_recommendations: { type: "boolean" } }, required: [] } },
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

/* ─── Helpers ─── */
const formatWallet = (addr: string): string => {
  if (!addr || addr === "N/A") return addr;
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return addr.slice(0, 6) + "......" + addr.slice(-6);
  if (addr.includes("...")) {
    const firstPart = addr.split("...")[0];
    const lastPart = addr.split("...").slice(-1)[0];
    return `${firstPart.slice(0, 6)}......${lastPart.slice(-4)}`;
  }
  if (addr.length > 12) return addr.slice(0, 6) + "......" + addr.slice(-6);
  return addr;
};

const fmtConfigValue = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
};

function buildPrefill(agent: AgentData, rawPolicy?: any): AgentPrefillData {
  const p = rawPolicy ?? {};
  const parseBudget = (b: string) => {
    const match = b.replace(/,/g, "").match(/[\d.]+/);
    return match ? match[0] : "";
  };
  return {
    type:           (p.uiType ?? agent.type ?? "trading").toLowerCase(),
    name:           p.uiName  ?? agent.name ?? "",
    description:    agent.description ?? "",
    avatar:         p.uiAvatar ?? agent.avatar ?? "",
    capital:        p.uiCapitalAmount != null ? String(p.uiCapitalAmount) : parseBudget(agent.budget ?? ""),
    capitalAsset:   p.uiCapitalAsset ?? "USDC",
    riskLevel:      p.uiRiskLevel    ?? "moderate",
    maxDrawdown:    String(p.maxDrawdown  ?? 20),
    stopLoss:       String(p.stopLoss     ?? 10),
    executionMode:  p.uiExecutionMode ?? "automatic",
    allowedAssets:  p.uiAllowedAssets ?? [],
    maxAlloc:       String(p.maxAllocationPct ?? 80),
    maxPosition:    String(p.maxPositionPct   ?? 25),
    maxTrades:      String(p.maxTradesPerDay  ?? 10),
    maxLTV:              String(p.maxLTV ?? 75),
    liquidationThreshold: String(p.liquidationThreshold ?? 85),
    targetAPY:      String(p.targetAPY ?? 8),
    minAPY:         String(p.minAPY    ?? 4),
    rebalanceFreq:  p.rebalanceFreq  ?? "Every 24h",
    yieldProtocols: p.yieldProtocols ?? [],
    maxSinglePayment:      String(p.maxSinglePayment      ?? 500),
    monthlyBudgetCap:      String(p.monthlyBudgetCap      ?? 2000),
    autoApprovalThreshold: String(p.autoApprovalThreshold ?? 50),
  };
}

function apiAgentToData(a: any): AgentData {
  const p = a.policy ?? {};
  const type = (p.uiType ?? a.category ?? "custom") as string;
  const capitalAmt: number = p.uiCapitalAmount ?? 0;
  const capitalAsset: string = p.uiCapitalAsset ?? "USDC";

  const fmtDate = (d: string | Date | undefined) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined;
  const fmtDateTime = (d: string | Date | undefined) =>
    d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : undefined;
  const deployedAt  = fmtDate(a.createdAt) ?? "Just now";
  const createdMs   = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const updatedMs   = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
  const wasEdited   = updatedMs - createdMs > 60_000;
  const lastUpdated = wasEdited ? fmtDateTime(a.lastActiveAt) : undefined;

  return {
    id: a.id,
    name: a.name,
    ticker: p.uiTicker ? `$${p.uiTicker.toUpperCase()}` : `$${a.name.replace(/\s+/g, "").slice(0, 6).toUpperCase()}`,
    description: a.description || `${type} AI agent`,
    avatar: p.uiAvatar ?? a.avatarUrl ?? "/figmaAssets/avatars.svg",
    status: (["active", "inactive", "paused"].includes(a.status) ? a.status : "active") as AgentStatus,
    type: type.charAt(0).toUpperCase() + type.slice(1),
    earnings: "$0",
    trades: a.totalPaymentsExecuted ?? 0,
    successRate: "–",
    lastActive: "Just now",
    category: type.charAt(0).toUpperCase() + type.slice(1),
    rules: [],
    budget: capitalAmt > 0 ? `$${capitalAmt.toLocaleString()} ${capitalAsset}` : "Not set",
    riskLevel: "medium",
    schedule: "Automatic",
    walletAddress: a.brainAccountAddress ?? "0x0000000000000000000000000000000000000000",
    deployedAt,
    lastUpdated,
    createdByUser: true,
    activityLog: [
      { time: "Just now", event: "Agent deployed", detail: `${a.name} activated and ready to execute.`, kind: "success" as const },
    ],
  };
}

/* ─── Sub-components ─── */
const HDivider = () => <div className="h-px w-full flex-shrink-0" style={{ background: "#1d2132" }} />;
const VDivider = () => <div className="flex-shrink-0 self-stretch" style={{ width: "1px", background: "#1d2132" }} />;

const StatCol = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div className="flex flex-col gap-[3px] items-center justify-center flex-1 min-w-0">
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[13px] leading-[14px] whitespace-nowrap">{label}</span>
    <span className="[font-family:'Gilroy-Bold',Helvetica] text-[16px] leading-[20px] whitespace-nowrap" style={{ color: accent ?? "#a8b9f4" }}>{value}</span>
  </div>
);

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z" stroke="#ff9500" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EditBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} data-testid="button-edit-agent"
    className="flex gap-[6px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-all hover:opacity-80"
    style={{ background: "#4a2300" }}>
    <PencilIcon />
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#ff9500] text-[12px] leading-[16px] whitespace-nowrap">Edit</span>
  </button>
);

const StartStopBtn = ({ isActive, onToggle }: { isActive: boolean; onToggle: () => void }) => {
  if (isActive) return (
    <button data-testid="button-stop-agent" onClick={onToggle}
      className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-colors hover:opacity-80"
      style={{ background: "#350011" }}>
      <div className="w-[12px] h-[12px] rounded-[2px] flex-shrink-0" style={{ background: "#d20344" }} />
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Stop</span>
    </button>
  );
  return (
    <button data-testid="button-start-agent" onClick={onToggle}
      className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-colors hover:opacity-80"
      style={{ background: "#123509" }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2L10 6L3 10V2Z" fill="#42bf23" /></svg>
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#42bf23] text-[12px] leading-[16px] whitespace-nowrap">Start</span>
    </button>
  );
};

const ActivityDot = ({ kind }: { kind: "success" | "info" | "warn" }) => {
  const colors = { success: "#42bf23", info: "#a8b9f4", warn: "#d20344" } as const;
  return <div className="flex-shrink-0 flex items-start pt-[4px]"><div className="w-[8px] h-[8px] rounded-full" style={{ background: colors[kind] }} /></div>;
};

const eventColors = { success: "#42bf23", info: "#a8b9f4", warn: "#d20344" } as const;

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse rounded-[8px] ${className ?? ""}`} style={{ background: "#1d2132" }} />
);

const CardHeader = ({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-[16px] py-[14px]" style={{ borderBottom: "1px solid #1d2132" }}>
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">{title}</span>
    {action}
  </div>
);

/* Monospace table of field → value rows (policy params) */
const ParamBlock = ({ rows }: { rows: { label: string; value: string }[] }) => (
  <div className="rounded-[12px] overflow-hidden border" style={{ borderColor: "#1a1f2e" }}>
    {rows.map(({ label, value }, i) => (
      <div key={label} className="flex justify-between items-center px-[14px] py-[10px]"
        style={{ borderBottom: i < rows.length - 1 ? "1px solid #131824" : "none", background: i % 2 === 0 ? "#0a0c12" : "#080a0f" }}>
        <code className="[font-family:'JetBrains_Mono',Helvetica] text-[11px] text-[#414965]">{label}</code>
        <span className="[font-family:'JetBrains_Mono',Helvetica] text-[11px] text-[#6c779d] max-w-[55%] text-right truncate">{value}</span>
      </div>
    ))}
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[11px] uppercase tracking-widest">{children}</p>
);

/* ════════════════════════════════════════════════════════
   Trading Agent View (Figma 3380-32372)
════════════════════════════════════════════════════════ */

const EQUITY_CURVE_1H = [
  { t: "03:00", v: 5680 }, { t: "05:00", v: 5760 }, { t: "07:00", v: 5900 },
  { t: "09:00", v: 6040 }, { t: "11:00", v: 6100 }, { t: "13:00", v: 6200 },
  { t: "15:00", v: 6350 }, { t: "17:00", v: 6600 }, { t: "18:00", v: 6850 },
  { t: "19:00", v: 6950 }, { t: "20:00", v: 6600 }, { t: "21:00", v: 6400 },
  { t: "23:00", v: 6300 }, { t: "01:00", v: 6260 }, { t: "03:00", v: 6240 },
];

const OPEN_POSITIONS = [
  { market: "BTC-PERP", dir: "Long",  lev: "3.2x", value: "$8,949.00", pct: "+2.92%", pos: true  },
  { market: "ETH-PERP", dir: "Short", lev: "2.0x", value: "$7,084.00", pct: "-0.4%",  pos: false },
  { market: "SOL-PERP", dir: "Long",  lev: "2.5x", value: "$3,200.00", pct: "+1.1%",  pos: true  },
  { market: "BCH-PERP", dir: "Long",  lev: "3.2x", value: "$8,949.00", pct: "+3.11%", pos: true  },
  { market: "DAI-PERP", dir: "Short", lev: "1.4x", value: "$7,084.00", pct: "-0.6%",  pos: false },
];

const TX_LOG = [
  { action: "Open SOL-PERP Long",  ago: "2m ago",  hash: "0x3a59...2cf4", status: "Executed",        amount: "$312.64"    },
  { action: "Close ETH-PERP Long", ago: "32m ago", hash: "0x3a59...2cf4", status: "Executed",        amount: "$842.75"    },
  { action: "Open SOL-PERP Long",  ago: "57m ago", hash: "0x3a59...2cf4", status: "Executed",        amount: "$2,174.23"  },
  { action: "Open BTC-PERP Long",  ago: "2h ago",  hash: "0x3a59...2cf4", status: "Policy Escalate", amount: "$23,000.00" },
  { action: "Open SOL-PERP Long",  ago: "1d ago",  hash: "0x3a59...2cf4", status: "Executed",        amount: "$1,648.47"  },
];

const TIME_TABS = ["1H", "1D", "1W", "1M", "1Y", "ALL"];

const KillBtn = () => (
  <button data-testid="button-kill-agent"
    className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-colors hover:opacity-80"
    style={{ background: "#350011" }}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2L10 10M10 2L2 10" stroke="#d20344" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Kill</span>
  </button>
);

interface TradingAgentViewProps {
  agent: AgentData;
  apiAgent: any;
  rawPolicy: any;
  isActive: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onBack: () => void;
}

const TradingAgentView = ({ agent, apiAgent, rawPolicy, isActive, onToggle, onEdit, onBack }: TradingAgentViewProps) => {
  const [chartTab, setChartTab] = useState("1H");
  const p = rawPolicy ?? {};

  /* Policy Envelope field derivation */
  const spendLimitRaw = p.spendLimit ? (parseInt(p.spendLimit) / 1_000_000) : null;
  const dailySpendCap  = spendLimitRaw ? `$${spendLimitRaw.toLocaleString()}` : "$25,000";
  const maxPositionSize = p.typeConfig?.max_position_size_usdc
    ? `$${Number(p.typeConfig.max_position_size_usdc).toLocaleString()}`
    : "$20,000";
  const maxLeverage   = p.typeConfig?.max_leverage ? `${p.typeConfig.max_leverage}x` : "3x";
  const allowedMkts   = (p.uiAllowedAssets?.length ? p.uiAllowedAssets : ["BTC", "ETH", "SOL"]).join(" · ");
  const approvalThresh = p.approvalThreshold === "0" ? ">90% of Cap" : p.approvalThreshold ?? ">90% of Cap";
  const killSwitch     = p.maxDrawdown ? `-${p.maxDrawdown}% Equity` : "-15% Equity";

  const policyFields = [
    { left: { label: "Daily Spend Cap",      value: dailySpendCap  }, right: { label: "Max Position Size",  value: maxPositionSize } },
    { left: { label: "Max Leverage",         value: maxLeverage    }, right: { label: "Allowed Markets",    value: allowedMkts     } },
    { left: { label: "Approval Threshold",   value: approvalThresh }, right: { label: "Kill Switch Drawdown", value: killSwitch    } },
  ];

  const truncateWallet = (addr: string) =>
    addr?.length > 12 ? addr.slice(0, 6) + "..." + addr.slice(-4) : addr;

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Top nav bar ── */}
      <div className="flex items-center gap-[8px] px-[16px] flex-shrink-0"
        style={{ height: "64px", borderBottom: "1px solid #1d2132", background: "#11141b" }}>
        <button data-testid="button-back" onClick={onBack}
          className="w-[32px] h-[32px] rounded-[100px] flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[#1d2132]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1d2132" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7L9 11" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          {/* ── 1. Header card ── */}
          <div className="rounded-[16px] overflow-hidden flex flex-col gap-[16px] p-[16px]"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            {/* Agent identity row */}
            <div className="flex gap-[8px] items-center w-full">
              <div className="overflow-hidden relative flex-shrink-0 w-[64px] h-[64px] rounded-[12px]">
                <img src={agent.avatar} alt={agent.name} className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <div className="flex flex-1 min-w-0 gap-[16px] items-center">
                <div className="flex flex-col gap-[4px] flex-1 min-w-0">
                  <div className="flex items-center gap-[4px]">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[16px] leading-[20px] whitespace-nowrap">{agent.name}</span>
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[16px] leading-[20px] whitespace-nowrap">{agent.ticker}</span>
                  </div>
                  <div className="flex items-center gap-[8px]">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[20px]">
                      Deployed: {agent.deployedAt}
                    </span>
                    <div className="w-[4px] h-[4px] rounded-full flex-shrink-0" style={{ background: "#414965" }} />
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[20px] font-mono">
                      {truncateWallet(agent.walletAddress)}
                    </span>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-[8px] flex-shrink-0">
                  <EditBtn onClick={onEdit} />
                  <StartStopBtn isActive={isActive} onToggle={onToggle} />
                  <KillBtn />
                </div>
              </div>
            </div>
            {/* Description */}
            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">
              {agent.description}
            </p>
          </div>

          {/* ── 2. Stat Cards ── */}
          <div className="grid grid-cols-4 gap-[16px]">
            {[
              { label: "PnL (30d)",    value: "+$47,832", sup: ".10", color: "#42bf23" },
              { label: "Win Rate",     value: "62",       sup: "%",   color: "#a8b9f4" },
              { label: "Trades (30d)", value: "184",      sup: "",    color: "#a8b9f4" },
              { label: "Sharpe",       value: "1.8",      sup: "",    color: "#a8b9f4" },
            ].map(({ label, value, sup, color }) => (
              <div key={label} className="rounded-[16px] p-[16px] flex flex-col gap-[8px]"
                style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[13px] leading-[14px]">{label}</span>
                <div className="flex items-baseline gap-[1px]" style={{ color }}>
                  <span className="[font-family:'Gilroy-Medium',Helvetica] text-[20px] leading-[24px]">{value}</span>
                  {sup && <span className="[font-family:'Gilroy-Medium',Helvetica] text-[16px] leading-[24px]">{sup}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* ── 3. Chart + Open Positions ── */}
          <div className="grid grid-cols-2 gap-[16px]">

            {/* Equity Curve */}
            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
              {/* Chart header */}
              <div className="flex items-center justify-between px-[16px] py-[12px] flex-shrink-0"
                style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Equity Curve</span>
                <div className="flex gap-[2px]" style={{ background: "#06070a", borderRadius: "100px", padding: "3px" }}>
                  {TIME_TABS.map((tab) => (
                    <button key={tab} onClick={() => setChartTab(tab)}
                      className="px-[8px] py-[3px] text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] transition-all rounded-[100px]"
                      style={{
                        background: chartTab === tab ? "#4a2300" : "transparent",
                        color: chartTab === tab ? "#ff9500" : "#6c779d",
                      }}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recharts area chart */}
              <div className="flex-1 px-[4px] pt-[12px] pb-[4px]" style={{ minHeight: "280px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={EQUITY_CURVE_1H} margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#42bf23" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#42bf23" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "#6c779d", fontSize: 10, fontFamily: "'Gilroy-SemiBold', Helvetica" }}
                      tickLine={false}
                      axisLine={{ stroke: "#1d2132" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      orientation="right"
                      tick={{ fill: "#6c779d", fontSize: 10, fontFamily: "'Gilroy-SemiBold', Helvetica" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                      domain={[5400, 7200]}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0a0c10", border: "1px solid #1d2132", borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                      labelStyle={{ color: "#6c779d" }}
                      itemStyle={{ color: "#42bf23" }}
                      formatter={(v: number) => [`$${v.toLocaleString()}`, "Equity"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#42bf23"
                      strokeWidth={2}
                      fill="url(#greenGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#42bf23", stroke: "#0a0c10", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Open Positions */}
            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
              <div className="px-[16px] py-[12px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Open Positions</span>
              </div>
              <div className="flex flex-col flex-1 overflow-auto">
                {OPEN_POSITIONS.map((pos, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between px-[16px] py-[14px]">
                      <div className="flex flex-col gap-[2px]">
                        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[14px] leading-[18px]">{pos.market}</span>
                        <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[12px] leading-[16px]">
                          {pos.dir} · {pos.lev}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-[2px]">
                        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[14px] leading-[18px]">{pos.value}</span>
                        <span className="px-[6px] py-[1px] rounded-[100px] text-[11px] [font-family:'Gilroy-SemiBold',Helvetica]"
                          style={{ background: pos.pos ? "rgba(66,191,35,0.15)" : "rgba(210,3,68,0.15)", color: pos.pos ? "#42bf23" : "#d20344" }}>
                          {pos.pct}
                        </span>
                      </div>
                    </div>
                    {i < OPEN_POSITIONS.length - 1 && <div className="h-px mx-[16px]" style={{ background: "#1d2132" }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 4. Policy Envelope ── */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="px-[16px] py-[14px]" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Policy Envelope</span>
            </div>
            <div className="flex flex-col">
              {policyFields.map((row, i) => (
                <div key={i} className="grid grid-cols-2"
                  style={{ borderBottom: i < policyFields.length - 1 ? "1px solid #1d2132" : "none" }}>
                  {/* Left field */}
                  <div className="flex items-center justify-between px-[16px] py-[14px]"
                    style={{ borderRight: "1px solid #1d2132" }}>
                    <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[13px] leading-[20px]">{row.left.label}</span>
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[13px] leading-[20px]">{row.left.value}</span>
                  </div>
                  {/* Right field */}
                  <div className="flex items-center justify-between px-[16px] py-[14px]">
                    <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[13px] leading-[20px]">{row.right.label}</span>
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[13px] leading-[20px]">{row.right.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 5. Transaction Log ── */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="px-[16px] py-[14px]" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Transaction Log</span>
            </div>
            <div className="flex flex-col">
              {TX_LOG.map((tx, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between px-[16px] py-[14px] gap-[8px]">
                    <div className="flex items-center gap-[6px] flex-1 min-w-0">
                      <span className="[font-family:'Gilroy-Bold',Helvetica] text-white text-[13px] leading-[18px] font-bold whitespace-nowrap">{tx.action}</span>
                      <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-[12px] leading-[18px] whitespace-nowrap">· {tx.ago}</span>
                      <span className="[font-family:'JetBrains_Mono',Helvetica] text-[#414965] text-[11px] leading-[18px] whitespace-nowrap">· {tx.hash}</span>
                    </div>
                    <div className="flex items-center gap-[8px] flex-shrink-0">
                      <span className="px-[8px] py-[2px] rounded-[100px] text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] whitespace-nowrap"
                        style={tx.status === "Executed"
                          ? { background: "#123509", color: "#42bf23" }
                          : { background: "#4a2300", color: "#ff9500" }}>
                        {tx.status}
                      </span>
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[13px] leading-[18px] whitespace-nowrap">{tx.amount}</span>
                    </div>
                  </div>
                  {i < TX_LOG.length - 1 && <div className="h-px mx-[16px]" style={{ background: "#1d2132" }} />}
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   Main page
════════════════════════════════════════════════════════ */
export const AgentDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { openCreateAgentAtStep } = useNav();

  const staticAgent = agents.find((a) => a.id === params.id);

  const { data: apiAgent, isLoading } = useQuery<any>({
    queryKey: ["/api/agents", params.id],
    queryFn: () => apiRequest("GET", `/api/agents/${params.id}`).then((r) => r.json()),
    enabled: !staticAgent && !!params.id,
    retry: false,
  });

  const agent: AgentData | null = staticAgent ?? (apiAgent ? apiAgentToData(apiAgent) : null);
  const rawPolicy = apiAgent?.policy ?? null;

  /* Pull out the schema-aligned fields from the stored policy */
  const agentType   = ((rawPolicy?.uiType ?? apiAgent?.category ?? agent?.type ?? "").toLowerCase()) as string;
  const typeConfig  = (rawPolicy?.typeConfig ?? {}) as Record<string, unknown>;
  const policyHash  = (rawPolicy?.policyHash ?? "") as string;
  const capitalAmt  = rawPolicy?.uiCapitalAmount ?? 0;
  const capitalAsset = rawPolicy?.uiCapitalAsset ?? "USDC";

  const hasTypeConfig = Object.keys(typeConfig).length > 0;

  const qc = useQueryClient();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const effectiveStatus: AgentStatus = agentStatus ?? agent?.status ?? "inactive";
  const isActive = effectiveStatus === "active";

  const [hashCopied, setHashCopied] = useState(false);
  const [toolTab, setToolTab] = useState(0);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: AgentStatus) => {
      if (!apiAgent) return;
      const res = await apiRequest("PATCH", `/api/agents/${params.id}/status`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents", params.id] });
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
    },
  });

  const handleToggle = () => {
    const current = agentStatus ?? agent?.status ?? "inactive";
    const next: AgentStatus = current === "active" ? "inactive" : "active";
    setAgentStatus(next);
    statusMutation.mutate(next);
  };

  const getPrefill = useCallback((): AgentPrefillData | undefined => {
    if (!agent) return undefined;
    return buildPrefill(agent, rawPolicy);
  }, [agent, rawPolicy]);

  const editableId = agent?.createdByUser && apiAgent ? params.id : undefined;

  const openEdit = useCallback((step: number) => {
    const prefill = getPrefill();
    openCreateAgentAtStep(step, prefill, editableId);
  }, [getPrefill, openCreateAgentAtStep, editableId]);

  const copyHash = () => {
    if (!policyHash) return;
    navigator.clipboard.writeText(policyHash);
    setHashCopied(true);
    setTimeout(() => setHashCopied(false), 2000);
  };

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
        <div className="flex items-center gap-[8px] px-[16px] flex-shrink-0" style={{ height: "64px", borderBottom: "1px solid #1d2132" }}>
          <div className="w-[32px] h-[32px] rounded-[100px]" style={{ background: "#1d2132" }} />
        </div>
        <div className="flex flex-col gap-[16px] p-[16px]">
          <div className="rounded-[16px] p-[16px] flex flex-col gap-[16px]" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex gap-[8px] items-center">
              <Skeleton className="w-[64px] h-[64px] rounded-[12px]" />
              <div className="flex flex-col gap-[8px] flex-1">
                <Skeleton className="h-[20px] w-[140px]" />
                <Skeleton className="h-[16px] w-[100px]" />
              </div>
            </div>
            <Skeleton className="h-[16px] w-full" />
            <Skeleton className="h-[16px] w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#11141b] rounded-[16px] border border-[#1d2132]">
        <span className="text-4xl">🤖</span>
        <p className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[14px]">Agent not found</p>
        <button onClick={() => navigate("/agents")}
          className="px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
          style={{ background: "#4a2300", color: "#ff9500", fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif" }}>
          Back to Agents
        </button>
      </div>
    );
  }

  /* ── Trading agent → Figma 3380-32372 view ── */
  if (agentType === "trading") {
    return (
      <TradingAgentView
        agent={agent}
        apiAgent={apiAgent}
        rawPolicy={rawPolicy}
        isActive={isActive}
        onToggle={handleToggle}
        onEdit={() => openEdit(1)}
        onBack={() => window.history.back()}
      />
    );
  }

  /* ── Type-specific param rows (from typeConfig) ── */
  const typeConfigRows: { label: string; value: string }[] = Object.entries(typeConfig)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ({ label: k, value: fmtConfigValue(v) }));

  /* ── Tool schemas for this agent type ── */
  const tools = TOOL_SCHEMAS[agentType] ?? [];
  const currentTool: any = tools[toolTab] ?? null;

  /* ── Enforcement for this type ── */
  const enf = ENFORCEMENT[agentType] ?? { tier1: [], tier3: "Standard PolicyValidator flow." };

  const tiers = [
    { num: "1", label: "PolicyEngine", sublabel: "Control Plane (off-chain)", color: "#ff9500", bg: "#1a1000", border: "#2a1800", checks: enf.tier1, desc: "Off-chain validation before any UserOperation is submitted." },
    { num: "2", label: "PolicyValidator", sublabel: "On-Chain Solidity", color: "#a8b9f4", bg: "#0d1117", border: "#1d2131", checks: ["Cryptographic proof verification (keccak256 policy_hash)", "Replay prevention via nonce inclusion", "Proof expiry enforcement (10-minute window)", ...(enf.tier2extra ? [enf.tier2extra] : []), "ERC-8004 audit trail recording on every execution"], desc: "Solidity contract verifies every proof before execution." },
    { num: "3", label: "Crossmint Agent Wallet", sublabel: "Smart Contract (ERC-4337)", color: "#9d5cf5", bg: "#110d1e", border: "#1e1530", checks: [enf.tier3, "Reentrancy guard on all operations", "Agent revocation via revokeAgent(agent_id) at any time"], desc: "Smart account guardrails — cannot be bypassed by any layer above." },
  ];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* Top nav bar */}
      <div className="flex items-center gap-[8px] px-[16px] flex-shrink-0"
        style={{ height: "64px", borderBottom: "1px solid #1d2132", background: "#11141b" }}>
        <button data-testid="button-back" onClick={() => window.history.back()}
          className="w-[32px] h-[32px] rounded-[100px] flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[#1d2132]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1d2132" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7L9 11" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          {/* ── 1. Identity card ── */}
          <div className="rounded-[16px] overflow-hidden flex flex-col gap-[16px] p-[16px]"
            style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <div className="flex gap-[8px] items-center w-full">
              <div className="overflow-hidden relative flex-shrink-0 w-[64px] h-[64px] rounded-[12px]">
                <img src={agent.avatar} alt={agent.name} className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <div className="flex flex-1 min-w-0 gap-[16px] items-center">
                <div className="flex flex-col gap-[4px] flex-1 min-w-0">
                  <div className="flex items-center gap-[8px]">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[16px] leading-[20px] whitespace-nowrap truncate">{agent.name}</span>
                    <span className="px-[8px] py-[2px] rounded-full text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] capitalize flex-shrink-0"
                      style={{ background: "#1a1000", color: "#ff9500", border: "1px solid #2a1800" }}>
                      {agentType || agent.type}
                    </span>
                  </div>
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[13px] leading-[18px]">Deployed: {agent.deployedAt}{agent.lastUpdated ? ` · Updated: ${agent.lastUpdated}` : ""}</span>
                </div>
                <StartStopBtn isActive={isActive} onToggle={handleToggle} />
              </div>
            </div>

            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">{agent.description}</p>
            <HDivider />

            <div className="flex items-center gap-[6px]">
              <StatCol label="Total Actions" value={agent.trades.toLocaleString()} />
              <VDivider />
              <StatCol label="Total Earnings" value={agent.earnings}
                accent={agent.earnings.startsWith("+") ? "#42bf23" : "#a8b9f4"} />
              <VDivider />
              <StatCol label="Success Rate" value={agent.successRate} accent="#42bf23" />
            </div>
            <HDivider />
            <div className="flex items-center gap-[6px]">
              <StatCol label="Creator" value={formatWallet(agent.walletAddress)} />
              <VDivider />
              <StatCol label="Category" value={agent.category} />
              <VDivider />
              <StatCol label="Last Active" value={agent.lastActive} />
            </div>
          </div>

          {/* ── 2. Performance chart ── */}
          <AgentPerfChart agent={agent} />

          {/* ── 3. Policy card ── */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  Policy
                  {agentType && (
                    <span className="text-[11px] [font-family:'JetBrains_Mono',Helvetica] text-[#414965] font-normal">· {agentType}</span>
                  )}
                </span>
              }
              action={editableId ? <EditBtn onClick={() => openEdit(2)} /> : undefined}
            />

            <div className="flex flex-col gap-[20px] p-[16px]">

              {/* Core inputs */}
              <div className="flex flex-col gap-[10px]">
                <SectionLabel>Core Inputs</SectionLabel>
                <ParamBlock rows={[
                  { label: "agent_name",         value: agent.name },
                  { label: "agent_type",         value: agentType || agent.type.toLowerCase() },
                  { label: "capital_allocation", value: capitalAmt > 0 ? `$${capitalAmt.toLocaleString()} ${capitalAsset}` : "Not set" },
                  { label: "status",             value: effectiveStatus },
                  { label: "version",            value: "1" },
                ]} />
              </div>

              {/* Type-specific params */}
              {hasTypeConfig ? (
                <div className="flex flex-col gap-[10px]">
                  <SectionLabel>{agentType} Policy Params</SectionLabel>
                  <ParamBlock rows={typeConfigRows} />
                </div>
              ) : (
                <div className="flex flex-col gap-[10px]">
                  <SectionLabel>{agentType || agent.type.toLowerCase()} Policy Params</SectionLabel>
                  <div className="rounded-[12px] p-[16px] flex flex-col items-center gap-2" style={{ background: "#080a0f", border: "1px solid #131824" }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="10" rx="3" stroke="#1d2132" strokeWidth="1.5" /><path d="M7 10h6M7 7h3" stroke="#1d2132" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    <p className="text-[12px] text-[#414965] [font-family:'Gilroy-Medium',Helvetica]">Policy params not yet configured</p>
                    {editableId && (
                      <button onClick={() => openEdit(2)}
                        className="text-[11px] text-[#ff9500] [font-family:'Gilroy-SemiBold',Helvetica] hover:underline">
                        Edit agent to set policy params →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Policy hash */}
              <div className="flex flex-col gap-[10px]">
                <div className="flex items-center justify-between">
                  <SectionLabel>Policy Hash (keccak256)</SectionLabel>
                  {policyHash && (
                    <button onClick={copyHash}
                      className="text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] px-[10px] py-[4px] rounded-[8px] transition-colors flex-shrink-0"
                      style={{ background: "#1d2132", color: hashCopied ? "#42bf23" : "#6c779d" }}>
                      {hashCopied ? "Copied!" : "Copy"}
                    </button>
                  )}
                </div>
                <div className="rounded-[12px] p-[12px] flex items-start gap-2" style={{ background: "#04060a", border: "1px solid #0e1219" }}>
                  <svg className="flex-shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="2" stroke="#1d2132" strokeWidth="1.2" /><path d="M5 3V2a2 2 0 0 1 4 0v1" stroke="#1d2132" strokeWidth="1.2" strokeLinecap="round" /></svg>
                  {policyHash ? (
                    <code className="text-[10px] text-[#42bf23] [font-family:'JetBrains_Mono',Helvetica] break-all leading-relaxed">{policyHash}</code>
                  ) : (
                    <span className="text-[11px] text-[#414965] [font-family:'Gilroy-Medium',Helvetica] italic">No policy hash — create agent with new schema to generate one</span>
                  )}
                </div>
                {policyHash && (
                  <div className="grid grid-cols-2 gap-[8px]">
                    {[
                      { k: "Policy Nonce", v: "0" },
                      { k: "Proof Expiry", v: "10 min" },
                    ].map(({ k, v }) => (
                      <div key={k} className="rounded-[10px] p-[10px] flex flex-col gap-[4px]" style={{ background: "#0d1017", border: "1px solid #131824" }}>
                        <p className="text-[10px] text-[#414965] [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-wider">{k}</p>
                        <p className="text-[12px] [font-family:'JetBrains_Mono',Helvetica] text-[#6c779d]">{v}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 4. Enforcement Stack card ── */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <CardHeader title="Enforcement Stack" />

            <div className="flex flex-col gap-[12px] p-[16px]">
              <p className="text-[12px] text-[#414965] [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">
                Three independent layers enforce your policy at every stage of the execution pipeline. Each tier is independently verifiable.
              </p>
              {tiers.map((tier) => (
                <div key={tier.num} className="rounded-[14px] border p-[14px] flex flex-col gap-[10px]"
                  style={{ background: tier.bg, borderColor: tier.border }}>
                  <div className="flex items-start gap-[10px]">
                    <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center flex-shrink-0 text-[11px] [font-family:'JetBrains_Mono',Helvetica] font-bold"
                      style={{ background: tier.color + "20", color: tier.color }}>
                      {tier.num}
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] [font-family:'Gilroy-SemiBold',Helvetica]" style={{ color: tier.color }}>{tier.label}</p>
                      <p className="text-[11px] text-[#414965] [font-family:'Gilroy-Medium',Helvetica] mt-[2px]">{tier.sublabel} · {tier.desc}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[5px] pl-[36px]">
                    {tier.checks.map((c, i) => (
                      <div key={i} className="flex items-start gap-[6px]">
                        <div className="w-[4px] h-[4px] rounded-full flex-shrink-0 mt-[5px]" style={{ background: tier.color + "70" }} />
                        <span className="text-[11px] text-[#6c779d] [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 5. Claude Tool Schema card ── */}
          {tools.length > 0 && (
            <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
              <CardHeader title="Claude Tool Schema" />
              <div className="flex flex-col gap-[12px] p-[16px]">
                <p className="text-[12px] text-[#414965] [font-family:'Gilroy-Medium',Helvetica]">
                  Tool definitions available to the Claude ReAct loop. Only tools matching the policy whitelist can be invoked.
                </p>

                {/* Tab selector */}
                <div className="flex gap-[4px] p-[4px] rounded-[12px]" style={{ background: "#06070a" }}>
                  {tools.map((t: any, i) => (
                    <button key={i} onClick={() => setToolTab(i)}
                      className="flex-1 px-[10px] py-[7px] rounded-[9px] text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] transition-all whitespace-nowrap"
                      style={{
                        background: toolTab === i ? "#1d2132" : "transparent",
                        color: toolTab === i ? "#a8b9f4" : "#414965",
                      }}>
                      {t.name}
                    </button>
                  ))}
                </div>

                {/* Tool description */}
                {currentTool && (
                  <div className="flex flex-col gap-[10px]">
                    <p className="text-[12px] text-[#6c779d] [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">{currentTool.description}</p>
                    <div className="relative">
                      <div className="rounded-[12px] p-[14px] overflow-x-auto max-h-[260px]" style={{ background: "#04060a", border: "1px solid #0e1219" }}>
                        <pre className="text-[10px] [font-family:'JetBrains_Mono',Helvetica] text-[#a8b9f4] whitespace-pre-wrap leading-relaxed">
                          {JSON.stringify(currentTool, null, 2)}
                        </pre>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(currentTool, null, 2))}
                        className="absolute top-[10px] right-[10px] text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] px-[8px] py-[4px] rounded-[8px] transition-colors"
                        style={{ background: "#1d2132", color: "#6c779d" }}>
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 6. Recent Activity card ── */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <CardHeader title="Recent Activity" />
            <div className="flex flex-col gap-[16px] p-[16px]">
              {agent.activityLog.map((log, i) => (
                <div key={i}>
                  <div className="flex gap-[12px] items-start">
                    <ActivityDot kind={log.kind} />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex gap-[16px] items-start">
                        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[16px] leading-[24px] flex-shrink-0" style={{ color: eventColors[log.kind] }}>
                          {log.event}
                        </span>
                        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[13px] leading-[24px] flex-shrink-0">{log.time}</span>
                      </div>
                      <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[22px]">{log.detail}</p>
                    </div>
                  </div>
                  {i < agent.activityLog.length - 1 && <div className="mt-[16px]"><HDivider /></div>}
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
};
