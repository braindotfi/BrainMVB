import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

type Period = "1D" | "7D" | "30D" | "90D";

/* ── Subscriptions ── */
const allSubscriptions = [
  { name: "Brain Premium",    cycle: "Monthly", amount: "$89.00",  status: "active"   as const },
  { name: "AlphaFlow Agent",  cycle: "Daily",   amount: "$144.00", status: "active"   as const },
  { name: "Yield Pilot",      cycle: "Daily",   amount: "$72.00",  status: "active"   as const },
  { name: "Netflix",          cycle: "Monthly", amount: "$22.99",  status: "active"   as const },
  { name: "Spotify",          cycle: "Monthly", amount: "$11.99",  status: "active"   as const },
  { name: "Amazon Prime",     cycle: "Monthly", amount: "$14.99",  status: "active"   as const },
  { name: "Risk Sentinel",    cycle: "Daily",   amount: "$48.00",  status: "active"   as const },
  { name: "Apple TV+",        cycle: "Monthly", amount: "$9.99",   status: "low"      as const },
  { name: "Disney+",          cycle: "Monthly", amount: "$13.99",  status: "inactive" as const },
  { name: "TaskForge Pro",    cycle: "Weekly",  amount: "$96.00",  status: "low"      as const },
  { name: "ChatGPT Plus",     cycle: "Monthly", amount: "$20.00",  status: "active"   as const },
  { name: "Adobe CC",         cycle: "Monthly", amount: "$54.99",  status: "active"   as const },
  { name: "Signal Seer",      cycle: "Monthly", amount: "$29.00",  status: "inactive" as const },
  { name: "YouTube Premium",  cycle: "Monthly", amount: "$13.99",  status: "active"   as const },
  { name: "Dropbox Plus",     cycle: "Monthly", amount: "$11.99",  status: "active"   as const },
  { name: "SwarmAlpha",       cycle: "Monthly", amount: "$49.00",  status: "active"   as const },
  { name: "Notion AI",        cycle: "Monthly", amount: "$16.00",  status: "active"   as const },
  { name: "Hulu",             cycle: "Monthly", amount: "$17.99",  status: "inactive" as const },
  { name: "Ops Commander",    cycle: "Monthly", amount: "$39.00",  status: "low"      as const },
  { name: "iCloud 2TB",       cycle: "Monthly", amount: "$9.99",   status: "active"   as const },
];
const monthlyTotal = allSubscriptions.reduce((s, x) => s + parseFloat(x.amount.replace(/[^0-9.]/g, "")), 0);

/* ── Active Agents ── */
type AgentRow = {
  ticker: string;
  name: string;
  color: string;
  earnings: Record<Period, string>;
  spark: Record<Period, number[]>;
};

const activeAgents: AgentRow[] = [
  {
    ticker: "ALPH", name: "AlphaFlow", color: "#42bf23",
    earnings: { "1D": "$148.20", "7D": "$412.00", "30D": "$2,145.70", "90D": "$6,435.10" },
    spark: {
      "1D":  [10, 14, 13, 18, 22, 26, 28, 31, 33, 36, 38, 41],
      "7D":  [20, 28, 35, 42, 52, 60, 68, 75, 82, 90, 98, 105],
      "30D": [100, 145, 180, 220, 270, 310, 380, 440, 510, 580, 650, 720],
      "90D": [200, 340, 520, 710, 890, 1080, 1280, 1510, 1760, 2020, 2290, 2580],
    },
  },
  {
    ticker: "YLDR", name: "Yield Pilot", color: "#7631ee",
    earnings: { "1D": "$72.00", "7D": "$220.00", "30D": "$1,120.40", "90D": "$3,361.20" },
    spark: {
      "1D":  [8, 10, 12, 14, 16, 17, 18, 20, 21, 22, 23, 24],
      "7D":  [15, 22, 30, 38, 48, 56, 63, 70, 78, 85, 92, 98],
      "30D": [80, 110, 150, 195, 240, 285, 335, 385, 440, 490, 540, 590],
      "90D": [150, 260, 395, 540, 695, 855, 1030, 1210, 1400, 1600, 1810, 2030],
    },
  },
  {
    ticker: "RISK", name: "Risk Sentinel", color: "#ff9500",
    earnings: { "1D": "$48.00", "7D": "$180.00", "30D": "$640.00", "90D": "$1,920.00" },
    spark: {
      "1D":  [20, 22, 19, 23, 21, 24, 22, 25, 24, 26, 25, 27],
      "7D":  [40, 42, 38, 45, 43, 48, 45, 50, 47, 52, 50, 55],
      "30D": [120, 135, 128, 145, 140, 155, 148, 162, 158, 168, 165, 172],
      "90D": [280, 310, 295, 340, 325, 368, 355, 395, 382, 418, 408, 428],
    },
  },
  {
    ticker: "SWRM", name: "SwarmAlpha", color: "#a8b9f4",
    earnings: { "1D": "$43.80", "7D": "$225.00", "30D": "$490.00", "90D": "$1,470.00" },
    spark: {
      "1D":  [18, 15, 20, 14, 22, 17, 24, 19, 26, 21, 28, 23],
      "7D":  [35, 28, 42, 30, 52, 38, 58, 44, 65, 50, 72, 55],
      "30D": [100, 78, 128, 88, 155, 110, 172, 125, 190, 140, 208, 155],
      "90D": [200, 155, 260, 175, 320, 215, 380, 250, 440, 290, 500, 330],
    },
  },
];

/* ── Transactions ── */
type TxRow = { name: string; date: string; category: string; amount: string; type: "debit" | "credit"; account: string };

type ChartPoint = { label: string; balance: number; spend: number; saved: number; yield: number };

const chartData: Record<Period, ChartPoint[]> = {
  "1D": [
    { label: "12 AM", balance: 47200, spend: 0,      saved: 0,    yield: 0 },
    { label: "3 AM",  balance: 47218, spend: 0,      saved: 0,    yield: 4.6 },
    { label: "6 AM",  balance: 47236, spend: 0,      saved: 0,    yield: 9.1 },
    { label: "9 AM",  balance: 47547, spend: 89,     saved: 80,   yield: 13.7 },
    { label: "12 PM", balance: 47695, spend: 237.2,  saved: 80,   yield: 16.3 },
    { label: "3 PM",  balance: 47743, spend: 285.4,  saved: 80,   yield: 17.4 },
    { label: "6 PM",  balance: 47798, spend: 305.2,  saved: 80,   yield: 17.9 },
    { label: "Now",   balance: 47832, spend: 312.4,  saved: 80,   yield: 18.22 },
  ],
  "7D": [
    { label: "Mon", balance: 45400, spend: 106,    saved: 60,   yield: 12.8 },
    { label: "Tue", balance: 45918, spend: 342,    saved: 120,  yield: 31.2 },
    { label: "Wed", balance: 46310, spend: 688,    saved: 200,  yield: 52.4 },
    { label: "Thu", balance: 46782, spend: 1004,   saved: 300,  yield: 73.1 },
    { label: "Fri", balance: 47090, spend: 1340,   saved: 380,  yield: 91.6 },
    { label: "Sat", balance: 47440, spend: 1760,   saved: 480,  yield: 112.3 },
    { label: "Sun", balance: 47832, spend: 2148.6, saved: 560,  yield: 127.54 },
  ],
  "30D": [
    { label: "Mar 1",  balance: 42300, spend: 306,    saved: 80,    yield: 18.3 },
    { label: "Mar 4",  balance: 43210, spend: 1102,   saved: 280,   yield: 66.2 },
    { label: "Mar 7",  balance: 43820, spend: 2148,   saved: 480,   yield: 127.5 },
    { label: "Mar 10", balance: 44560, spend: 3210,   saved: 700,   yield: 183.4 },
    { label: "Mar 13", balance: 45200, spend: 4418,   saved: 960,   yield: 241.6 },
    { label: "Mar 16", balance: 45840, spend: 5630,   saved: 1200,  yield: 298.2 },
    { label: "Mar 19", balance: 46340, spend: 6820,   saved: 1560,  yield: 346.1 },
    { label: "Mar 22", balance: 46790, spend: 7640,   saved: 1800,  yield: 390.8 },
    { label: "Mar 25", balance: 47210, spend: 8430,   saved: 2100,  yield: 456.4 },
    { label: "Mar 28", balance: 47832, spend: 9214.4, saved: 2400,  yield: 548.3 },
  ],
  "90D": [
    { label: "Jan 1",  balance: 38200, spend: 1248,    saved: 320,   yield: 72.1 },
    { label: "Jan 8",  balance: 39640, spend: 3812,    saved: 960,   yield: 214.3 },
    { label: "Jan 15", balance: 40180, spend: 5940,    saved: 1440,  yield: 328.4 },
    { label: "Jan 22", balance: 40920, spend: 8104,    saved: 1920,  yield: 438.2 },
    { label: "Jan 29", balance: 41780, spend: 10360,   saved: 2560,  yield: 548.6 },
    { label: "Feb 5",  balance: 42640, spend: 13020,   saved: 3200,  yield: 676.8 },
    { label: "Feb 12", balance: 43520, spend: 15680,   saved: 3840,  yield: 812.4 },
    { label: "Feb 19", balance: 44480, spend: 18340,   saved: 4480,  yield: 948.2 },
    { label: "Feb 26", balance: 45400, spend: 21000,   saved: 5120,  yield: 1080.6 },
    { label: "Mar 5",  balance: 46120, spend: 22960,   saved: 5760,  yield: 1248.8 },
    { label: "Mar 19", balance: 46900, spend: 25300,   saved: 6400,  yield: 1432.4 },
    { label: "Mar 28", balance: 47832, spend: 27643.2, saved: 7200,  yield: 1644.9 },
  ],
};

const periodData: Record<Period, {
  totalBalance: string;
  totalSpend: string;
  totalSaved: string;
  yield: string;
  yieldPct: string;
  spendDelta: string;
  savedDelta: string;
  spendCategories: { label: string; amount: string; pct: number; color: string }[];
  transactions: TxRow[];
}> = {
  "1D": {
    totalBalance: "$47,832.10", totalSpend: "$312.40", totalSaved: "$80.00",
    yield: "$18.22", yieldPct: "+0.04%", spendDelta: "-$312.40", savedDelta: "+$80.00",
    spendCategories: [
      { label: "AI Agents",     amount: "$148.20", pct: 47, color: "#7631ee" },
      { label: "Subscriptions", amount: "$89.00",  pct: 28, color: "#a8b9f4" },
      { label: "Transfers",     amount: "$50.00",  pct: 16, color: "#42bf23" },
      { label: "Other",         amount: "$25.20",  pct: 9,  color: "#414965" },
    ],
    transactions: [
      { name: "AlphaFlow — ETH Buy",  date: "Today, 11:42 AM", category: "AI Agent",     amount: "-$148.20", type: "debit",  account: "AI Wallet" },
      { name: "Brain Premium",         date: "Today, 10:15 AM", category: "Subscription", amount: "-$89.00",  type: "debit",  account: "Neobank"   },
      { name: "Yield Harvest",         date: "Today, 08:00 AM", category: "Yield",        amount: "+$18.22",  type: "credit", account: "AI Wallet" },
      { name: "Bank Transfer",         date: "Today, 07:30 AM", category: "Transfer",     amount: "+$80.00",  type: "credit", account: "Neobank"   },
    ],
  },
  "7D": {
    totalBalance: "$47,832.10", totalSpend: "$2,148.60", totalSaved: "$560.00",
    yield: "$127.54", yieldPct: "+0.27%", spendDelta: "-$2,148.60", savedDelta: "+$560.00",
    spendCategories: [
      { label: "AI Agents",     amount: "$1,037.00", pct: 48, color: "#7631ee" },
      { label: "Subscriptions", amount: "$623.00",   pct: 29, color: "#a8b9f4" },
      { label: "Transfers",     amount: "$350.00",   pct: 16, color: "#42bf23" },
      { label: "Other",         amount: "$138.60",   pct: 7,  color: "#414965" },
    ],
    transactions: [
      { name: "AlphaFlow — BTC Rebalance", date: "Today, 11:42 AM",     category: "AI Agent",     amount: "-$412.00",   type: "debit",  account: "AI Wallet" },
      { name: "Yield Pilot — USDC Farm",   date: "Yesterday, 09:10 AM", category: "AI Agent",     amount: "-$220.00",   type: "debit",  account: "AI Wallet" },
      { name: "Yield Harvest",             date: "Yesterday, 08:00 AM", category: "Yield",        amount: "+$127.54",   type: "credit", account: "AI Wallet" },
      { name: "Payroll Deposit",           date: "Mon, 09:00 AM",       category: "Income",       amount: "+$3,200.00", type: "credit", account: "Neobank"   },
      { name: "Brain Premium",             date: "Sun, 10:00 AM",       category: "Subscription", amount: "-$89.00",    type: "debit",  account: "Neobank"   },
      { name: "Bank → Wallet Transfer",    date: "Sat, 02:15 PM",       category: "Transfer",     amount: "-$500.00",   type: "debit",  account: "Neobank"   },
      { name: "Risk Sentinel — Hedge",     date: "Fri, 03:45 PM",       category: "AI Agent",     amount: "-$180.00",   type: "debit",  account: "AI Wallet" },
      { name: "SwarmAlpha — Deploy",       date: "Thu, 11:00 AM",       category: "AI Agent",     amount: "-$225.00",   type: "debit",  account: "AI Wallet" },
    ],
  },
  "30D": {
    totalBalance: "$47,832.10", totalSpend: "$9,214.40", totalSaved: "$2,400.00",
    yield: "$548.30", yieldPct: "+1.16%", spendDelta: "-$9,214.40", savedDelta: "+$2,400.00",
    spendCategories: [
      { label: "AI Agents",     amount: "$4,432.00", pct: 48, color: "#7631ee" },
      { label: "Subscriptions", amount: "$2,670.00", pct: 29, color: "#a8b9f4" },
      { label: "Transfers",     amount: "$1,500.00", pct: 16, color: "#42bf23" },
      { label: "Other",         amount: "$612.40",   pct: 7,  color: "#414965" },
    ],
    transactions: [
      { name: "AlphaFlow — ETH Accumulate", date: "Today, 11:42 AM",   category: "AI Agent",     amount: "-$1,200.00",  type: "debit",  account: "AI Wallet" },
      { name: "Monthly Yield Harvest",      date: "Mar 28, 08:00 AM",  category: "Yield",        amount: "+$548.30",    type: "credit", account: "AI Wallet" },
      { name: "Payroll Deposit",            date: "Mar 25, 09:00 AM",  category: "Income",       amount: "+$6,400.00",  type: "credit", account: "Neobank"   },
      { name: "Wallet Top-Up",              date: "Mar 20, 02:15 PM",  category: "Transfer",     amount: "-$1,500.00",  type: "debit",  account: "Neobank"   },
      { name: "Yield Pilot — Rebalance",    date: "Mar 15, 10:30 AM",  category: "AI Agent",     amount: "-$880.00",    type: "debit",  account: "AI Wallet" },
      { name: "Risk Sentinel — Hedge",      date: "Mar 10, 03:00 PM",  category: "AI Agent",     amount: "-$640.00",    type: "debit",  account: "AI Wallet" },
      { name: "Brain Premium",              date: "Mar 1, 10:00 AM",   category: "Subscription", amount: "-$89.00",     type: "debit",  account: "Neobank"   },
      { name: "SwarmAlpha — Strategy",      date: "Feb 28, 01:00 PM",  category: "AI Agent",     amount: "-$490.00",    type: "debit",  account: "AI Wallet" },
      { name: "Deal Closer — Commission",   date: "Feb 25, 04:30 PM",  category: "AI Agent",     amount: "-$320.00",    type: "debit",  account: "AI Wallet" },
      { name: "Invoice Bot — Batch",        date: "Feb 22, 09:15 AM",  category: "AI Agent",     amount: "-$58.00",     type: "debit",  account: "Neobank"   },
      { name: "Bank Transfer In",           date: "Feb 20, 08:00 AM",  category: "Transfer",     amount: "+$2,000.00",  type: "credit", account: "Neobank"   },
      { name: "TaskForge — Automation",     date: "Feb 18, 11:00 AM",  category: "AI Agent",     amount: "-$240.00",    type: "debit",  account: "AI Wallet" },
      { name: "Claude API — Batch",         date: "Feb 15, 03:00 PM",  category: "API",          amount: "-$62.00",     type: "debit",  account: "Neobank"   },
      { name: "Ops Commander",              date: "Feb 12, 10:45 AM",  category: "AI Agent",     amount: "-$195.00",    type: "debit",  account: "AI Wallet" },
      { name: "Mid-Month Yield",            date: "Feb 10, 08:00 AM",  category: "Yield",        amount: "+$210.40",    type: "credit", account: "AI Wallet" },
    ],
  },
  "90D": {
    totalBalance: "$47,832.10", totalSpend: "$27,643.20", totalSaved: "$7,200.00",
    yield: "$1,644.90", yieldPct: "+3.47%", spendDelta: "-$27,643.20", savedDelta: "+$7,200.00",
    spendCategories: [
      { label: "AI Agents",     amount: "$13,269.00", pct: 48, color: "#7631ee" },
      { label: "Subscriptions", amount: "$8,010.00",  pct: 29, color: "#a8b9f4" },
      { label: "Transfers",     amount: "$4,500.00",  pct: 16, color: "#42bf23" },
      { label: "Other",         amount: "$1,864.20",  pct: 7,  color: "#414965" },
    ],
    transactions: [
      { name: "AlphaFlow — Q1 Rebalance",  date: "Today, 11:42 AM", category: "AI Agent",     amount: "-$3,600.00",  type: "debit",  account: "AI Wallet" },
      { name: "Q1 Yield Harvest",          date: "Mar 28, 08:00 AM",category: "Yield",        amount: "+$1,644.90",  type: "credit", account: "AI Wallet" },
      { name: "Q1 Payroll Total",          date: "Mar 25",          category: "Income",       amount: "+$19,200.00", type: "credit", account: "Neobank"   },
      { name: "Wallet Funding",            date: "Mar 1",           category: "Transfer",     amount: "-$4,500.00",  type: "debit",  account: "Neobank"   },
      { name: "Yield Pilot — DeFi Deploy", date: "Feb 15",          category: "AI Agent",     amount: "-$2,640.00",  type: "debit",  account: "AI Wallet" },
      { name: "Risk Sentinel — Hedge",     date: "Jan 30",          category: "AI Agent",     amount: "-$1,920.00",  type: "debit",  account: "AI Wallet" },
      { name: "TaskForge Pro — API Calls", date: "Jan 15",          category: "AI Agent",     amount: "-$960.00",    type: "debit",  account: "AI Wallet" },
      { name: "Brain Premium × 3 Mo",     date: "Jan 1",           category: "Subscription", amount: "-$267.00",    type: "debit",  account: "Neobank"   },
      { name: "SwarmAlpha — Q1 Ops",      date: "Dec 28",          category: "AI Agent",     amount: "-$1,470.00",  type: "debit",  account: "AI Wallet" },
      { name: "Deal Closer — Q4 Wrap",    date: "Dec 20",          category: "AI Agent",     amount: "-$660.00",    type: "debit",  account: "AI Wallet" },
      { name: "Year-End Deposit",         date: "Dec 15",          category: "Income",       amount: "+$8,000.00",  type: "credit", account: "Neobank"   },
      { name: "Claude API — Q4",          date: "Dec 10",          category: "API",          amount: "-$180.00",    type: "debit",  account: "Neobank"   },
      { name: "Ops Commander — Q4",       date: "Dec 5",           category: "AI Agent",     amount: "-$585.00",    type: "debit",  account: "AI Wallet" },
      { name: "Q4 Yield Harvest",         date: "Dec 1",           category: "Yield",        amount: "+$820.00",    type: "credit", account: "AI Wallet" },
    ],
  },
};

/* ── Small components ── */
const HDivider = () => <div className="h-px w-full flex-shrink-0" style={{ background: "#1d2132" }} />;

const StatCard = ({ label, value, delta, deltaPositive }: { label: string; value: string; delta?: string; deltaPositive?: boolean }) => (
  <div className="flex flex-col gap-[8px] p-[16px] rounded-[16px] flex-1 min-w-0" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[11px] leading-[14px] uppercase tracking-widest whitespace-nowrap">{label}</span>
    <span className="[font-family:'Gilroy-Bold',Helvetica] text-white text-[20px] leading-[26px] whitespace-nowrap">{value}</span>
    {delta && <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[11px] leading-[14px]" style={{ color: deltaPositive ? "#42bf23" : "#d20344" }}>{delta}</span>}
  </div>
);

const PeriodBtn = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button onClick={onClick} data-testid={`button-period-${label}`}
    className="flex items-center justify-center px-[12px] py-[6px] rounded-[100px] transition-all flex-shrink-0"
    style={active ? { background: "#1d2132", border: "1px solid #414965" } : { background: "transparent", border: "1px solid transparent" }}>
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[13px] leading-[18px] whitespace-nowrap" style={{ color: active ? "#a8b9f4" : "#414965" }}>{label}</span>
  </button>
);

const statusBadge = (status: "active" | "low" | "inactive") => {
  if (status === "active")   return <span className="text-[8px] px-[5px] py-[1px] rounded-[3px]" style={{ background: "rgba(66,191,35,0.12)",   color: "#42bf23", fontFamily: "'Gilroy-SemiBold',Helvetica" }}>Active</span>;
  if (status === "low")      return <span className="text-[8px] px-[5px] py-[1px] rounded-[3px]" style={{ background: "rgba(255,149,0,0.12)",   color: "#ff9500", fontFamily: "'Gilroy-SemiBold',Helvetica" }}>Low</span>;
  return                            <span className="text-[8px] px-[5px] py-[1px] rounded-[3px]" style={{ background: "rgba(108,119,157,0.12)", color: "#6c779d", fontFamily: "'Gilroy-SemiBold',Helvetica" }}>Paused</span>;
};

/* ── Overview chart tooltip ── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
  return (
    <div className="flex flex-col gap-[6px] px-[12px] py-[10px] rounded-[10px]" style={{ background: "#0d101a", border: "1px solid #1d2132", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
      <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "11px", color: "#6c779d" }}>{label}</span>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-[8px]">
          <div className="w-[8px] h-[8px] rounded-full flex-shrink-0" style={{ background: p.stroke }} />
          <span style={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: "12px", color: "#a8b9f4", minWidth: "80px" }}>{p.name}</span>
          <span style={{ fontFamily: "'Gilroy-SemiBold',Helvetica", fontSize: "12px", color: "#ffffff" }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const SERIES = [
  { key: "balance", name: "Total Balance", color: "#a8b9f4" },
  { key: "spend",   name: "Total Spend",   color: "#d20344" },
  { key: "saved",   name: "Total Saved",   color: "#42bf23" },
  { key: "yield",   name: "Yield Earned",  color: "#ff9500" },
] as const;

/* ── Sparkline for Active Agents ── */
const AgentSparkline = ({ data, color }: { data: number[]; color: string }) => {
  const points = data.map((v, i) => ({ i, v }));
  const gradId = `spark-${color.replace("#", "")}`;
  return (
    <AreaChart width={88} height={36} data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
    </AreaChart>
  );
};

/* ── Main page ── */
export const DashboardPage = (): JSX.Element => {
  const [period, setPeriod] = useState<Period>("30D");
  const d = periodData[period];
  const points = chartData[period];

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-[12px] px-[16px] flex-shrink-0" style={{ height: "56px", borderBottom: "1px solid #1d2132" }}>
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[18px] leading-[24px] flex-1">Dashboard</span>
        <div className="flex items-center gap-[2px] p-[3px] rounded-[100px]" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
          {(["1D", "7D", "30D", "90D"] as Period[]).map((p) => (
            <PeriodBtn key={p} label={p} active={period === p} onClick={() => setPeriod(p)} />
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex gap-[12px] px-[16px] pt-[16px] flex-shrink-0">
        <StatCard label="Total Balance" value={d.totalBalance} />
        <StatCard label="Total Spend"   value={d.totalSpend}   delta={d.spendDelta} deltaPositive={false} />
        <StatCard label="Total Saved"   value={d.totalSaved}   delta={d.savedDelta} deltaPositive={true}  />
        <StatCard label="Yield Earned"  value={d.yield}        delta={d.yieldPct}   deltaPositive={true}  />
      </div>

      {/* Financial Overview line chart */}
      <div className="mx-[16px] mt-[12px] flex-shrink-0 rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132", height: "178px" }}>
        <div className="flex items-center justify-between px-[16px] py-[10px]" style={{ borderBottom: "1px solid #1d2132" }}>
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[13px] leading-[18px]">Financial Overview</span>
          <div className="flex items-center gap-[14px]">
            {SERIES.map(s => (
              <div key={s.key} className="flex items-center gap-[5px]">
                <div className="w-[8px] h-[2px] rounded-full" style={{ background: s.color }} />
                <span style={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: "10px", color: "#414965" }}>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: "130px", padding: "8px 8px 4px 0" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#1d2132" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: 10, fill: "#414965" }} tickLine={false} axisLine={false} dy={4} />
              <YAxis tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} tick={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: 10, fill: "#414965" }} tickLine={false} axisLine={false} width={42} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#1d2132", strokeWidth: 1 }} />
              {SERIES.map(s => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} dot={false} activeDot={{ r: 3, fill: s.color, strokeWidth: 0 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 2×2 widget grid ── */}
      <div
        className="flex-1 min-h-0 grid px-[16px] pb-[16px] pt-[12px] gap-[12px]"
        style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}
      >

        {/* TOP-LEFT: Spending by Category */}
        <div className="flex flex-col rounded-[16px] overflow-hidden min-h-0" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
          <div className="flex items-center justify-between px-[14px] py-[10px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[13px] leading-[18px]">Spending by Category</span>
          </div>
          <div className="flex flex-col gap-[10px] p-[14px] flex-1">
            {d.spendCategories.map((cat) => (
              <div key={cat.label} className="flex flex-col gap-[4px]">
                <div className="flex items-center justify-between">
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">{cat.label}</span>
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[11px] leading-[14px]">{cat.amount}</span>
                </div>
                <div className="flex items-center gap-[6px]">
                  <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ background: "#1d2132" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${cat.pct}%`, background: cat.color }} />
                  </div>
                  <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-[10px] leading-[12px] flex-shrink-0 w-[26px] text-right">{cat.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TOP-RIGHT: Active Agents */}
        <div className="flex flex-col rounded-[16px] overflow-hidden min-h-0" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
          <div className="flex items-center justify-between px-[14px] py-[10px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#42bf23] text-[13px] leading-[18px]">Active Agents</span>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[11px] leading-[14px]">{activeAgents.length} running</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeAgents.map((agent, i) => (
              <div key={agent.ticker}>
                <div className="flex items-center gap-[10px] px-[14px] py-[10px] hover:bg-[#111822] transition-colors cursor-pointer">
                  {/* Ticker + name */}
                  <div className="flex flex-col min-w-0" style={{ width: "72px", flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Gilroy-Bold',Helvetica", fontSize: "15px", lineHeight: "20px", color: "#ffffff", letterSpacing: "0.02em" }}>{agent.ticker}</span>
                    <span style={{ fontFamily: "'Gilroy-Medium',Helvetica", fontSize: "10px", lineHeight: "13px", color: "#6c779d" }}>{agent.name}</span>
                  </div>
                  {/* Sparkline */}
                  <div className="flex-1 flex items-center justify-center">
                    <AgentSparkline data={agent.spark[period]} color={agent.color} />
                  </div>
                  {/* Earnings */}
                  <span style={{ fontFamily: "'Gilroy-Bold',Helvetica", fontSize: "15px", lineHeight: "20px", color: agent.color, flexShrink: 0, minWidth: "72px", textAlign: "right" }}>
                    {agent.earnings[period]}
                  </span>
                </div>
                {i < activeAgents.length - 1 && <HDivider />}
              </div>
            ))}
          </div>
        </div>

        {/* BOTTOM-LEFT: Subscriptions */}
        <div className="flex flex-col min-h-0 rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
          <div className="flex items-center justify-between px-[14px] py-[10px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[13px] leading-[18px]">Subscriptions</span>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[11px] leading-[14px]">Monthly</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {allSubscriptions.map((sub, i) => (
              <div key={sub.name}>
                <div className="flex items-center gap-[8px] px-[14px] py-[7px] hover:bg-[#111822] transition-colors cursor-pointer">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[12px] leading-[16px] truncate">{sub.name}</span>
                    <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[10px] leading-[13px]">{sub.cycle}</span>
                  </div>
                  <div className="flex flex-col items-end gap-[2px] flex-shrink-0">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[11px] leading-[14px]">{sub.amount}</span>
                    {statusBadge(sub.status)}
                  </div>
                </div>
                {i < allSubscriptions.length - 1 && <HDivider />}
              </div>
            ))}
          </div>
          <div className="flex-shrink-0" style={{ borderTop: "1px solid #1d2132" }}>
            <div className="flex items-center justify-between px-[14px] py-[9px]">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#6c779d] text-[11px] leading-[14px]">Monthly Total</span>
              <span className="[font-family:'Gilroy-Bold',Helvetica] text-[#a8b9f4] text-[12px] leading-[16px]">${monthlyTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* BOTTOM-RIGHT: Recent Transactions (no emojis, compact) */}
        <div className="flex flex-col min-h-0 rounded-[16px] overflow-hidden" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
          <div className="flex items-center justify-between px-[14px] py-[10px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#a8b9f4] text-[13px] leading-[18px]">Recent Transactions</span>
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[11px] leading-[14px]">{d.transactions.length} total</span>
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-[10px] px-[14px] py-[6px] flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
            <span className="flex-1 [font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[9px] leading-[12px] uppercase tracking-widest">Transaction</span>
            <span className="w-[60px] text-right [font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[9px] leading-[12px] uppercase tracking-widest flex-shrink-0">Account</span>
            <span className="w-[64px] text-right [font-family:'Gilroy-SemiBold',Helvetica] text-[#414965] text-[9px] leading-[12px] uppercase tracking-widest flex-shrink-0">Amount</span>
          </div>
          {/* Scrollable rows */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {d.transactions.map((tx, i) => (
              <div key={i}>
                <div className="flex items-center gap-[10px] px-[14px] py-[8px] hover:bg-[#111822] transition-colors cursor-pointer">
                  {/* Colored type dot */}
                  <div className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: tx.type === "credit" ? "#42bf23" : "#d20344" }} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-[5px] min-w-0">
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-[11px] leading-[15px] truncate">{tx.name}</span>
                      <span className="flex-shrink-0 text-[8px] px-[4px] py-[1px] rounded-[3px]" style={{ background: "#1d2132", color: "#6c779d", fontFamily: "'Gilroy-SemiBold',Helvetica" }}>{tx.category}</span>
                    </div>
                    <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-[10px] leading-[13px]">{tx.date}</span>
                  </div>
                  <span className="w-[60px] text-right [font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[10px] leading-[13px] flex-shrink-0">{tx.account}</span>
                  <span className="w-[64px] text-right [font-family:'Gilroy-SemiBold',Helvetica] text-[11px] leading-[15px] flex-shrink-0" style={{ color: tx.type === "credit" ? "#42bf23" : "#d20344" }}>{tx.amount}</span>
                </div>
                {i < d.transactions.length - 1 && <HDivider />}
              </div>
            ))}
          </div>
        </div>

      </div>{/* end 2×2 grid */}

    </div>
  );
};
