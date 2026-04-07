import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AreaChart, Area, Tooltip, ResponsiveContainer } from "recharts";
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

/* ── Chart data per time tab ── */
const CHART_DATA: Record<string, { pts: { t: string; v: number }[]; xLabels: string[]; yLabels: string[] }> = {
  "1H": {
    pts: [
      { t: "03:00", v: 5680 }, { t: "04:00", v: 5760 }, { t: "05:00", v: 5920 },
      { t: "07:00", v: 6050 }, { t: "08:00", v: 6120 }, { t: "09:00", v: 6220 },
      { t: "11:00", v: 6370 }, { t: "14:00", v: 6630 }, { t: "16:00", v: 6860 },
      { t: "18:00", v: 6960 }, { t: "19:00", v: 6600 }, { t: "21:00", v: 6390 },
      { t: "22:00", v: 6300 }, { t: "23:00", v: 6270 }, { t: "03:00", v: 6240 },
    ],
    xLabels: ["03:00", "11:00", "19:00", "03:00"],
    yLabels: ["$7000", "$6600", "$6400", "$6200", "$6000", "$5800", "$5600"],
  },
  "1D": {
    pts: [
      { t: "Mon", v: 58200 }, { t: "Tue", v: 59800 }, { t: "Wed", v: 61200 },
      { t: "Thu", v: 60400 }, { t: "Fri", v: 63000 }, { t: "Sat", v: 64200 },
      { t: "Sun", v: 62400 },
    ],
    xLabels: ["Mon", "Tue", "Thu", "Sat", "Sun"],
    yLabels: ["$65k", "$64k", "$62k", "$61k", "$59k", "$58k"],
  },
  "1W": {
    pts: [
      { t: "Wk1", v: 52000 }, { t: "Wk2", v: 55000 }, { t: "Wk3", v: 57200 },
      { t: "Wk4", v: 59800 }, { t: "Wk5", v: 61400 }, { t: "Wk6", v: 63200 },
      { t: "Wk7", v: 62400 },
    ],
    xLabels: ["Wk1", "Wk2", "Wk4", "Wk6", "Wk7"],
    yLabels: ["$64k", "$62k", "$59k", "$57k", "$55k", "$52k"],
  },
  "1M": {
    pts: [
      { t: "Mar 4", v: 44000 }, { t: "Mar 8", v: 47200 }, { t: "Mar 12", v: 49600 },
      { t: "Mar 16", v: 51200 }, { t: "Mar 20", v: 53400 }, { t: "Mar 24", v: 55800 },
      { t: "Mar 28", v: 58400 }, { t: "Apr 1", v: 60200 }, { t: "Apr 4", v: 62400 },
    ],
    xLabels: ["Mar 4", "Mar 12", "Mar 24", "Apr 4"],
    yLabels: ["$63k", "$60k", "$56k", "$51k", "$47k", "$44k"],
  },
  "1Y": {
    pts: [
      { t: "Apr 25", v: 18000 }, { t: "Jun 25", v: 22400 }, { t: "Aug 25", v: 29800 },
      { t: "Oct 25", v: 36200 }, { t: "Dec 25", v: 44000 }, { t: "Feb 26", v: 54800 },
      { t: "Apr 26", v: 62400 },
    ],
    xLabels: ["Apr '25", "Aug '25", "Dec '25", "Apr '26"],
    yLabels: ["$63k", "$54k", "$44k", "$30k", "$22k", "$18k"],
  },
  "ALL": {
    pts: [
      { t: "2022", v: 8000 }, { t: "Q2 22", v: 11200 }, { t: "2023", v: 18400 },
      { t: "Q2 23", v: 26800 }, { t: "2024", v: 38200 }, { t: "Q2 24", v: 48600 },
      { t: "2025", v: 52400 }, { t: "Q2 25", v: 58800 }, { t: "2026", v: 62400 },
    ],
    xLabels: ["2022", "2023", "2024", "2025", "2026"],
    yLabels: ["$63k", "$52k", "$38k", "$18k", "$11k", "$8k"],
  },
};

const OPEN_POSITIONS = [
  { market: "BTC-PERP", dir: "Long",  lev: "3.2x", value: "$8,949.00", pct: "+2.92%", pos: true  },
  { market: "ETH-PERP", dir: "Short", lev: "2.0x", value: "$7,084.00", pct: "-0.4%",  pos: false },
  { market: "SOL-PERP", dir: "Long",  lev: "2.5x", value: "$3,200.00", pct: "+1.1%",  pos: true  },
  { market: "BCH-PERP", dir: "Long",  lev: "3.2x", value: "$8,949.00", pct: "+3.11%", pos: true  },
  { market: "DAI-PERP", dir: "Short", lev: "1.4x", value: "$7,084.00", pct: "-0.4%",  pos: false },
];

const TX_LOG = [
  { action: "Open SOL-PERP Long",  ago: "2m ago",  hash: "0x3a59...2cf4", status: "Executed",        amount: "$312.64"    },
  { action: "Close ETH-PERP Long", ago: "32m ago", hash: "0x3a59...2cf4", status: "Executed",        amount: "$842.75"    },
  { action: "Open SOL-PERP Long",  ago: "57m ago", hash: "0x3a59...2cf4", status: "Executed",        amount: "$2,174.23"  },
  { action: "Open BTC-PERP Long",  ago: "2h ago",  hash: "0x3a59...2cf4", status: "Policy Escalate", amount: "$23,000.00" },
  { action: "Open SOL-PERP Long",  ago: "1d ago",  hash: "0x3a59...2cf4", status: "Executed",        amount: "$1,648.47"  },
];

const TIME_TABS = ["1H", "1D", "1W", "1M", "1Y", "ALL"];

/* ── Crosshair cursor: dashed lines + orange pill at intersection ── */
const CrosshairCursor = ({ points, width, height, payload }: any) => {
  if (!points?.length) return null;
  const { x, y } = points[0];

  /* Format the value into a price string */
  const val = payload?.[0]?.value;
  const formatted = val != null
    ? `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "";

  /* Pill dimensions — approximate 6.2px per character at 10px Gilroy-SemiBold */
  const charW = 6.2;
  const padX = 8;
  const pillH = 18;
  const pillRx = 9;
  const textW = formatted.length * charW;
  const pillW = textW + padX * 2;

  /* Keep pill inside chart horizontally */
  let pillX = x + 6;
  if (pillX + pillW > width - 4) pillX = x - pillW - 6;

  /* Center pill vertically on the y value line */
  const pillY = y - pillH / 2;

  return (
    <g>
      {/* Vertical dashed line */}
      <line x1={x} y1={0} x2={x} y2={height}
        stroke="#ff9500" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.55} />
      {/* Horizontal dashed line */}
      <line x1={0} y1={y} x2={width} y2={y}
        stroke="#ff9500" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.55} />
      {/* Orange price pill at intersection */}
      {formatted && (
        <g>
          <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={pillRx} fill="#4a2300" />
          <text
            x={pillX + pillW / 2}
            y={pillY + pillH / 2 + 3.5}
            textAnchor="middle"
            fill="#ff9500"
            fontSize={10}
            fontFamily="'Gilroy-SemiBold', Helvetica"
            fontWeight="600"
          >
            {formatted}
          </text>
        </g>
      )}
    </g>
  );
};

/* ── Small 4px separator dot ── */
const Dot = () => (
  <div className="w-[4px] h-[4px] rounded-full flex-shrink-0" style={{ background: "#6c779d" }} />
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

const TradingAgentView = ({ agent, rawPolicy, isActive, onToggle, onEdit, onBack }: TradingAgentViewProps) => {
  const [chartTab, setChartTab] = useState("1H");
  const p = rawPolicy ?? {};

  /* Policy Envelope field derivation */
  const spendLimitRaw = p.spendLimit ? (parseInt(p.spendLimit) / 1_000_000) : null;
  const dailySpendCap   = spendLimitRaw ? `$${spendLimitRaw.toLocaleString()}` : "$25,000";
  const maxPositionSize = p.typeConfig?.max_position_size_usdc
    ? `$${Number(p.typeConfig.max_position_size_usdc).toLocaleString()}`
    : "$20,000";
  const maxLeverage    = p.typeConfig?.max_leverage ? `${p.typeConfig.max_leverage}x` : "3x";
  const allowedMkts    = (p.uiAllowedAssets?.length ? p.uiAllowedAssets : ["BTC", "ETH", "SOL"]);
  const approvalThresh = p.approvalThreshold === "0" ? ">90% of Cap" : p.approvalThreshold ?? ">90% of Cap";
  const killSwitch     = p.maxDrawdown ? `-${p.maxDrawdown}% Equity` : "-15% Equity";

  const policyRows = [
    [{ label: "Daily Spend Cap",    value: dailySpendCap }, { label: "Max Position Size",    value: maxPositionSize }],
    [{ label: "Max Leverage",       value: maxLeverage   }, { label: "Allowed Markets",      value: null, mkts: allowedMkts }],
    [{ label: "Approval Threshold", value: approvalThresh }, { label: "Kill Switch Drawdown", value: killSwitch }],
  ];

  const truncateWallet = (addr: string) =>
    addr?.length > 12 ? addr.slice(0, 6) + "..." + addr.slice(-4) : addr;

  const chartSet = CHART_DATA[chartTab] ?? CHART_DATA["1H"];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Top nav bar: back btn LEFT, action btns RIGHT, NO bottom border ── */}
      <div className="relative flex-shrink-0" style={{ height: "64px", background: "#11141b" }}>
        {/* Back button (left) */}
        <button data-testid="button-back" onClick={onBack}
          className="absolute left-[16px] top-[16px] w-[32px] h-[32px] rounded-[100px] flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: "#1d2132" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3.5L6 8L10 12.5" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* Action buttons (right) */}
        <div className="absolute right-[16px] top-[16px] flex items-center gap-[8px]">
          {/* Edit (grey) */}
          <button onClick={onEdit} data-testid="button-edit-agent"
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-all hover:opacity-80"
            style={{ background: "#222737" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11.333 2a1.886 1.886 0 0 1 2.667 2.667L5.167 13.5l-3.5.833.833-3.5L11.333 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap">Edit</span>
          </button>
          {/* Stop/Start (red) */}
          <button data-testid="button-stop-agent" onClick={onToggle}
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-colors hover:opacity-80"
            style={{ background: "#350011" }}>
            <div className="w-[12px] h-[12px] rounded-[2px] flex-shrink-0" style={{ background: "#d20344" }} />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">
              {isActive ? "Stop" : "Start"}
            </span>
          </button>
          {/* Kill (red) */}
          <button data-testid="button-kill-agent"
            className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] flex-shrink-0 transition-colors hover:opacity-80"
            style={{ background: "#350011" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="#d20344" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap">Kill</span>
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[16px] p-[16px] pb-8">

          {/* ── 1. Header card — avatar + name + "Trading" tag + deployed + description ── */}
          <div className="rounded-[16px] overflow-hidden flex flex-col gap-[8px] p-[16px]"
            style={{ background: "#0a0c10" }}>
            <div className="flex gap-[8px] items-center w-full">
              <div className="overflow-hidden relative flex-shrink-0 w-[64px] h-[64px] rounded-[12px]">
                <img src={agent.avatar} alt={agent.name} className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <div className="flex flex-1 min-w-0 flex-col gap-[4px]">
                {/* Name + Trading tag */}
                <div className="flex items-center gap-[4px]">
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[16px] leading-[20px] whitespace-nowrap">{agent.name}</span>
                  <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0"
                    style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)" }}>
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">Trading</span>
                  </div>
                </div>
                {/* Deployed · wallet */}
                <div className="flex items-center gap-[8px]">
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">
                    Deployed: {agent.deployedAt}
                  </span>
                  <div className="w-[4px] h-[4px] rounded-full flex-shrink-0" style={{ background: "#6c779d" }} />
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">
                    {truncateWallet(agent.walletAddress)}
                  </span>
                </div>
              </div>
            </div>
            {/* Description */}
            <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px]">
              {agent.description}
            </p>
          </div>

          {/* ── 2. Stat Cards — no border, left-aligned ── */}
          <div className="grid grid-cols-4 gap-[16px]">
            {[
              { label: "PnL (30d)",    v1: "+$47,832", v2: ".10", color: "#42bf23" },
              { label: "Win Rate",     v1: "62",       v2: "%",   color: "#a8b9f4" },
              { label: "Trades (30d)", v1: "184",      v2: "",    color: "#a8b9f4" },
              { label: "Sharpe",       v1: "1.8",      v2: "",    color: "#a8b9f4" },
            ].map(({ label, v1, v2, color }) => (
              <div key={label} className="rounded-[16px] p-[16px] flex flex-col gap-[8px]"
                style={{ background: "#0a0c10" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[13px] leading-[14px]">{label}</span>
                <p style={{ color, fontSize: 0, lineHeight: 0 }}>
                  <span className="[font-family:'Gilroy-Medium',Helvetica] text-[20px] leading-[24px]">{v1}</span>
                  {v2 && <span className="[font-family:'Gilroy-Medium',Helvetica] text-[16px] leading-[24px]">{v2}</span>}
                </p>
              </div>
            ))}
          </div>

          {/* ── 3. Equity Curve + Open Positions ── */}
          <div className="grid grid-cols-2 gap-[16px]">

            {/* Equity Curve — no border, full-width chart */}
            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-[16px] py-[12px] h-[48px] flex-shrink-0"
                style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Equity Curve</span>
                {/* Time tabs */}
                <div className="flex gap-[2px] p-[2px] rounded-[400px]" style={{ background: "#06070a" }}>
                  {TIME_TABS.map((tab) => (
                    <button key={tab} onClick={() => setChartTab(tab)}
                      className="px-[8px] py-[4px] text-[12px] [font-family:'Gilroy-SemiBold',Helvetica] transition-all rounded-[100px] leading-[16px]"
                      style={{
                        background: chartTab === tab ? "#4a2300" : "transparent",
                        color: chartTab === tab ? "#ff9500" : "#414965",
                      }}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart area — full width with overlaid Y labels */}
              <div className="relative flex-1" style={{ minHeight: "284px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartSet.pts} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#42bf23" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#42bf23" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      content={() => null}
                      cursor={<CrosshairCursor />}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#42bf23"
                      strokeWidth={1.5}
                      fill="url(#greenGrad)"
                      dot={false}
                      isAnimationActive={false}
                      activeDot={{ r: 3, fill: "#42bf23", stroke: "#0a0c10", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                {/* Y-axis labels overlaid on right */}
                <div className="absolute right-[8px] top-0 bottom-0 flex flex-col justify-between pointer-events-none"
                  style={{ paddingTop: "8px", paddingBottom: "4px" }}>
                  {chartSet.yLabels.map((lbl) => (
                    <span key={lbl} className="[font-family:'Gilroy-SemiBold',Helvetica] text-[10px] leading-[14px] text-right"
                      style={{ color: "#6c779d" }}>{lbl}</span>
                  ))}
                </div>
              </div>

              {/* X-axis labels */}
              <div className="flex items-center justify-between px-[8px] py-[4px]"
                style={{ borderTop: "1px solid #1d2132" }}>
                {chartSet.xLabels.map((lbl, i) => (
                  <span key={i} className="[font-family:'Gilroy-SemiBold',Helvetica] text-[10px] leading-[14px]"
                    style={{ color: "#6c779d" }}>{lbl}</span>
                ))}
              </div>
            </div>

            {/* Open Positions — no border */}
            <div className="rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0a0c10" }}>
              <div className="px-[16px] py-[12px] h-[48px] flex items-center flex-shrink-0"
                style={{ borderBottom: "1px solid #1d2132" }}>
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Open Positions</span>
              </div>
              <div className="flex flex-col gap-[12px] px-[16px] py-[12px]">
                {OPEN_POSITIONS.map((pos, i) => (
                  <div key={i}>
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-[4px]">
                        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px] whitespace-nowrap">{pos.market}</span>
                        <div className="flex items-center gap-[4px]">
                          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">{pos.dir}</span>
                          <div className="w-[4px] h-[4px] rounded-full flex-shrink-0" style={{ background: "#6c779d" }} />
                          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[13px] leading-[16px]">{pos.lev}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-center gap-[2px]">
                        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-[#a8b9f4] text-[14px] leading-[20px] text-right whitespace-nowrap">{pos.value}</span>
                        <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px]"
                          style={pos.pos
                            ? { background: "#123509", border: "1px solid rgba(66,191,35,0.2)" }
                            : { background: "#350011", border: "1px solid rgba(210,3,68,0.2)" }}>
                          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[11px] leading-[14px] text-center whitespace-nowrap"
                            style={{ color: pos.pos ? "#42bf23" : "#d20344" }}>{pos.pct}</span>
                        </div>
                      </div>
                    </div>
                    {i < OPEN_POSITIONS.length - 1 && (
                      <div className="h-px w-full mt-[12px]" style={{ background: "#1d2132" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 4. Policy Envelope — rectangular boxes ── */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <div className="px-[16px] py-[12px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Policy Envelope</span>
            </div>
            <div className="flex flex-col gap-[8px] p-[16px]">
              {policyRows.map((row, ri) => (
                <div key={ri} className="flex gap-[8px]">
                  {row.map((field, fi) => (
                    <div key={fi} className="flex flex-1 items-start justify-between rounded-[8px] p-[8px]"
                      style={{ background: "#11141b" }}>
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[14px] leading-[20px] whitespace-nowrap">{field.label}</span>
                      {field.mkts ? (
                        <div className="flex items-center gap-[4px]">
                          {field.mkts.map((m: string, mi: number) => (
                            <span key={mi} className="flex items-center gap-[4px]">
                              {mi > 0 && <div className="w-[4px] h-[4px] rounded-full" style={{ background: "#6c779d" }} />}
                              <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px]">{m}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">{field.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── 5. Transaction Log ── */}
          <div className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
            <div className="px-[16px] h-[48px] flex items-center" style={{ borderBottom: "1px solid #1d2132" }}>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[16px] leading-[24px]">Transaction Log</span>
            </div>
            <div className="flex flex-col px-[16px] py-[12px] gap-[12px]">
              {TX_LOG.map((tx, i) => (
                <div key={i}>
                  {/* Row: 3 columns: left (flex-1) · middle (w-[100px] centered) · right (w-[100px] end) */}
                  <div className="flex gap-[24px] items-center">
                    {/* Col 1: action · time · hash */}
                    <div className="flex flex-1 items-center gap-[8px] min-w-0">
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[14px] leading-[20px] whitespace-nowrap">{tx.action}</span>
                      <Dot />
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[13px] leading-[20px] whitespace-nowrap">{tx.ago}</span>
                      <Dot />
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[13px] leading-[20px] whitespace-nowrap">{tx.hash}</span>
                    </div>
                    {/* Col 2: status badge — centered, fixed 100px */}
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: "100px" }}>
                      <span className="px-[8px] py-[3px] rounded-[22px] text-[11px] [font-family:'Gilroy-SemiBold',Helvetica] leading-[14px] whitespace-nowrap text-center"
                        style={tx.status === "Executed"
                          ? { background: "#123509", color: "#42bf23", border: "1px solid rgba(66,191,35,0.2)" }
                          : { background: "#4a2300", color: "#ff9500", border: "1px solid rgba(255,149,0,0.2)" }}>
                        {tx.status}
                      </span>
                    </div>
                    {/* Col 3: amount — right-aligned, fixed 100px, JetBrains Mono */}
                    <div className="flex items-center justify-end flex-shrink-0" style={{ width: "100px" }}>
                      <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-[#a8b9f4] text-[14px] leading-[20px] text-right whitespace-nowrap">{tx.amount}</span>
                    </div>
                  </div>
                  {/* Separator between rows */}
                  {i < TX_LOG.length - 1 && (
                    <div className="h-px w-full mt-[12px]" style={{ background: "#1d2132" }} />
                  )}
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
