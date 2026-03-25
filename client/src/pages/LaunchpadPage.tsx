import { useState } from "react";
import { useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface LaunchpadAgent {
  id: string;
  ticker: string;
  name: string;
  description: string;
  avatar: string;
  marketcap: string;
  marketcapRaw: number;
  price: string;
  priceRaw: number;
  change24h: number;
  volume24hRaw: number;
  volume24h: string;
  holders: number;
  category: string;
  bondingCurve: number;
  createdBy: string;
  createdAt: string;
  createdHoursAgo: number; // hours since creation, used for "New" tab filter
  replies: number;
}

export const launchpadAgents: LaunchpadAgent[] = [
  {
    id: "alphaflow",
    ticker: "$ALPHA",
    name: "AlphaFlow",
    description: "Executes automated trading strategies across crypto markets, optimizing for volatility, momentum, and liquidity signals in real time.",
    avatar: "/figmaAssets/avatars-3.svg",
    marketcap: "$842K",     marketcapRaw: 842000,
    price: "$0.00842",      priceRaw: 0.00842,
    change24h: 12.4,
    volume24hRaw: 128000,   volume24h: "$128K",
    holders: 1247,
    category: "Trading",
    bondingCurve: 92,
    createdBy: "0xd3f...9a2c",
    createdAt: "2 days ago", createdHoursAgo: 48,
    replies: 84,
  },
  {
    id: "yieldpilot",
    ticker: "$YIELD",
    name: "Yield Pilot",
    description: "Manages capital allocation across DeFi protocols and yield strategies while maintaining risk-adjusted returns.",
    avatar: "/figmaAssets/avatars-9.svg",
    marketcap: "$1.2M",     marketcapRaw: 1200000,
    price: "$0.0120",       priceRaw: 0.012,
    change24h: 8.1,
    volume24hRaw: 245000,   volume24h: "$245K",
    holders: 3018,
    category: "Yield",
    bondingCurve: 79,
    createdBy: "0xab1...34ef",
    createdAt: "5 days ago", createdHoursAgo: 120,
    replies: 156,
  },
  {
    id: "risksentinel",
    ticker: "$RISK",
    name: "Risk Sentinel",
    description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss in real time.",
    avatar: "/figmaAssets/avatars.svg",
    marketcap: "$560K",     marketcapRaw: 560000,
    price: "$0.0056",       priceRaw: 0.0056,
    change24h: -3.2,
    volume24hRaw: 67000,    volume24h: "$67K",
    holders: 892,
    category: "Security",
    bondingCurve: 100,
    createdBy: "0x77f...c890",
    createdAt: "1 week ago", createdHoursAgo: 168,
    replies: 42,
  },
  {
    id: "signalseer",
    ticker: "$SEER",
    name: "Signal Seer",
    description: "Aggregates news, social signals, and on-chain data to surface actionable insights before they move markets.",
    avatar: "/figmaAssets/avatars-5.svg",
    marketcap: "$320K",     marketcapRaw: 320000,
    price: "$0.0032",       priceRaw: 0.0032,
    change24h: 22.8,
    volume24hRaw: 98000,    volume24h: "$98K",
    holders: 641,
    category: "Analytics",
    bondingCurve: 67,
    createdBy: "0xee2...11bc",
    createdAt: "3 days ago", createdHoursAgo: 72,
    replies: 67,
  },
  {
    id: "trendradar",
    ticker: "$RADR",
    name: "TrendRadar",
    description: "Detects emerging trends across markets, social platforms, and ecosystems before they become mainstream.",
    avatar: "/figmaAssets/avatars-5.svg",
    marketcap: "$180K",     marketcapRaw: 180000,
    price: "$0.0018",       priceRaw: 0.0018,
    change24h: 45.2,
    volume24hRaw: 54000,    volume24h: "$54K",
    holders: 298,
    category: "Analytics",
    bondingCurve: 97,
    createdBy: "0x44a...f291",
    createdAt: "18 hours ago", createdHoursAgo: 18,
    replies: 23,
  },
  {
    id: "taskforge",
    ticker: "$FORG",
    name: "TaskForge",
    description: "Automates repetitive workflows across tools, APIs, and services with intelligent orchestration.",
    avatar: "/figmaAssets/avatars-6.svg",
    marketcap: "$95K",      marketcapRaw: 95000,
    price: "$0.00095",      priceRaw: 0.00095,
    change24h: -8.5,
    volume24hRaw: 12000,    volume24h: "$12K",
    holders: 142,
    category: "Automation",
    bondingCurve: 96,
    createdBy: "0x19d...a72c",
    createdAt: "6 hours ago", createdHoursAgo: 6,
    replies: 8,
  },
  {
    id: "paystream",
    ticker: "$PAY",
    name: "Pay Stream",
    description: "Executes real-time payments for APIs and services using x402 protocols and verifiable on-chain receipts.",
    avatar: "/figmaAssets/avatars-1.svg",
    marketcap: "$2.1M",     marketcapRaw: 2100000,
    price: "$0.021",        priceRaw: 0.021,
    change24h: 3.7,
    volume24hRaw: 810000,   volume24h: "$810K",
    holders: 5832,
    category: "Finance",
    bondingCurve: 100,
    createdBy: "0xbc4...7f30",
    createdAt: "2 weeks ago", createdHoursAgo: 336,
    replies: 312,
  },
  {
    id: "dealcloser",
    ticker: "$DEAL",
    name: "Deal Closer",
    description: "Negotiates and executes transactions between agents using escrow and conditional multi-party payments.",
    avatar: "/figmaAssets/avatars-8.svg",
    marketcap: "$430K",     marketcapRaw: 430000,
    price: "$0.0043",       priceRaw: 0.0043,
    change24h: -1.4,
    volume24hRaw: 76000,    volume24h: "$76K",
    holders: 733,
    category: "Finance",
    bondingCurve: 53,
    createdBy: "0x92e...b401",
    createdAt: "1 week ago", createdHoursAgo: 168,
    replies: 57,
  },
  {
    id: "swarmalpha",
    ticker: "$SWARM",
    name: "SwarmAlpha",
    description: "Coordinates multiple agents to execute complex strategies in parallel with emergent intelligence.",
    avatar: "/figmaAssets/avatars-7.svg",
    marketcap: "$67K",      marketcapRaw: 67000,
    price: "$0.00067",      priceRaw: 0.00067,
    change24h: 89.3,
    volume24hRaw: 44000,    volume24h: "$44K",
    holders: 98,
    category: "Multi-Agent",
    bondingCurve: 8,
    createdBy: "0x31c...e509",
    createdAt: "2 hours ago", createdHoursAgo: 2,
    replies: 15,
  },
  {
    id: "inboxzero",
    ticker: "$INBOX",
    name: "InboxZero",
    description: "Manages email, filters priority messages, and drafts replies automatically using advanced language models.",
    avatar: "/figmaAssets/avatars-2.svg",
    marketcap: "$240K",     marketcapRaw: 240000,
    price: "$0.0024",       priceRaw: 0.0024,
    change24h: 5.9,
    volume24hRaw: 31000,    volume24h: "$31K",
    holders: 421,
    category: "Productivity",
    bondingCurve: 30,
    createdBy: "0xf8c...2d18",
    createdAt: "4 days ago", createdHoursAgo: 96,
    replies: 38,
  },
  {
    id: "invoicebot",
    ticker: "$BILL",
    name: "Invoice Bot",
    description: "Generates invoices, tracks payments, and automates billing workflows across multiple payment rails.",
    avatar: "/figmaAssets/avatars-4.svg",
    marketcap: "$88K",      marketcapRaw: 88000,
    price: "$0.00088",      priceRaw: 0.00088,
    change24h: -4.1,
    volume24hRaw: 9000,     volume24h: "$9K",
    holders: 121,
    category: "Finance",
    bondingCurve: 10,
    createdBy: "0x78a...c214",
    createdAt: "3 days ago", createdHoursAgo: 72,
    replies: 12,
  },
  {
    id: "opscommander",
    ticker: "$OPS",
    name: "Ops Commander",
    description: "Coordinates multi-step workflows across systems and APIs with real-time monitoring and auto-recovery.",
    avatar: "/figmaAssets/avatars-8.svg",
    marketcap: "$155K",     marketcapRaw: 155000,
    price: "$0.00155",      priceRaw: 0.00155,
    change24h: 15.6,
    volume24hRaw: 22000,    volume24h: "$22K",
    holders: 218,
    category: "Automation",
    bondingCurve: 19,
    createdBy: "0x65b...d123",
    createdAt: "12 hours ago", createdHoursAgo: 12,
    replies: 19,
  },
];

// ── Derived stats ──
const totalMarketCap = launchpadAgents.reduce((s, a) => s + a.marketcapRaw, 0);
const total24hVolume  = launchpadAgents.reduce((s, a) => s + a.volume24hRaw, 0);
const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}K`;

// ── Tab filtering ──
type Tab = "all" | "trending" | "new";
const getFiltered = (tab: Tab): LaunchpadAgent[] => {
  if (tab === "all") return launchpadAgents;
  if (tab === "new")
    return launchpadAgents
      .filter((a) => a.createdHoursAgo <= 24)
      .sort((a, b) => a.createdHoursAgo - b.createdHoursAgo);
  // trending = top 9 by 24h volume
  return [...launchpadAgents]
    .sort((a, b) => b.volume24hRaw - a.volume24hRaw)
    .slice(0, 9);
};

// ── Featured hero banner ──
const FeaturedBanner = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    data-testid="featured-banner"
    className="w-full h-[200px] relative rounded-2xl overflow-hidden border-2 text-left flex-shrink-0"
    style={{
      borderColor: "rgba(118,49,238,0.7)",
      background: "#12032d",
      boxShadow:
        "0px_122px_34px_0px_rgba(0,0,0,0.01),0px_78px_31px_0px_rgba(0,0,0,0.04),0px_44px_26px_0px_rgba(0,0,0,0.15),0px_20px_20px_0px_rgba(0,0,0,0.26),0px_5px_11px_0px_rgba(0,0,0,0.29)".replaceAll("_", " "),
    }}
  >
    {/* Glow orb — top right */}
    <div
      className="absolute pointer-events-none"
      style={{
        left: "388px", top: "-229px",
        width: "708px", height: "604px",
        background:
          "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(118,49,238,0.45) 0%, rgba(118,49,238,0.18) 45%, transparent 70%)",
        transform: "rotate(-30deg)",
      }}
    />
    {/* Glow orb — bottom right */}
    <div
      className="absolute pointer-events-none"
      style={{
        left: "553px", top: "118px",
        width: "425px", height: "232px",
        background:
          "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(160,80,255,0.22) 0%, transparent 65%)",
      }}
    />
    {/* Glow orb — top left */}
    <div
      className="absolute pointer-events-none"
      style={{
        left: "-284px", top: "-181px",
        width: "519px", height: "368px",
        background:
          "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(90,30,180,0.28) 0%, transparent 65%)",
        transform: "rotate(-165deg)",
      }}
    />

    {/* Text content — vertically centered left */}
    <div className="absolute left-[38px] top-1/2 -translate-y-1/2 flex flex-col items-start w-[336px] gap-0">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#7631ee] text-[14px] leading-[16px]">
        FEATURED
      </span>
      <div className="flex flex-col items-start mt-0">
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-[32px] leading-[40px]">
          Momentum Trader
        </span>
        <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#7631ee] text-[16px] leading-[20px]">
          A smart assistant designed to analyze market trends and execute trades on your behalf.
        </span>
      </div>
    </div>

    {/* Pagination dots — centered bottom */}
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1">
      <div className="w-[6px] h-[6px] rounded-full" style={{ background: "rgba(118,49,238,0.9)" }} />
      <div className="w-[6px] h-[6px] rounded-full" style={{ background: "rgba(118,49,238,0.5)" }} />
      <div className="w-[6px] h-[6px] rounded-full" style={{ background: "rgba(58,32,96,0.7)" }} />
    </div>
  </button>
);

// ── Stats bar ──
const StatsBar = () => (
  <div className="w-full bg-[#06070a] rounded-xl flex items-center py-3 flex-shrink-0">
    <div className="flex-1 flex flex-col items-center gap-[3px]">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-[13px] leading-[14px]">
        Total Agents
      </span>
      <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-[#a8b9f4] text-[16px] leading-[20px]">
        {launchpadAgents.length}
      </span>
    </div>
    <div className="w-px self-stretch bg-[#1a1f2e] flex-shrink-0" />
    <div className="flex-1 flex flex-col items-center gap-[3px]">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-[13px] leading-[14px]">
        Total Market Cap
      </span>
      <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-[#a8b9f4] text-[16px] leading-[20px]">
        {fmt(totalMarketCap)}
      </span>
    </div>
    <div className="w-px self-stretch bg-[#1a1f2e] flex-shrink-0" />
    <div className="flex-1 flex flex-col items-center gap-[3px]">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-[13px] leading-[14px]">
        24h Volume
      </span>
      <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-[#a8b9f4] text-[16px] leading-[20px]">
        {fmt(total24hVolume)}
      </span>
    </div>
  </div>
);

// ── Single agent cell ──
const AgentCell = ({ agent, onClick }: { agent: LaunchpadAgent; onClick: () => void }) => {
  const isComplete = agent.bondingCurve >= 100;
  const barColor = isComplete ? "#42bf23" : "#ff9500";

  return (
    <button
      data-testid={`agent-cell-${agent.id}`}
      onClick={onClick}
      className="flex flex-1 gap-2 items-start min-w-0 text-left hover:bg-[#0d1018] transition-colors rounded-lg px-1 py-1 -mx-1 -my-1"
    >
      {/* 48×48 avatar */}
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#1a1f2e]">
        <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
      </div>

      {/* Info */}
      <div className="flex flex-col gap-2 flex-1 min-w-0 justify-center">
        {/* Name + ticker row */}
        <div className="flex items-center gap-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[14px] leading-[16px] whitespace-nowrap">
          <span className="text-white">{agent.name}</span>
          <span className="text-[#6c779d]">{agent.ticker}</span>
        </div>

        {/* Bonding curve */}
        <div className="flex flex-col gap-1 w-full">
          <div className="flex items-start justify-between [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[11px] leading-[12px] whitespace-nowrap">
            <span>Bonding Curve</span>
            <span>{agent.bondingCurve}%</span>
          </div>
          <div className="h-2 w-full relative">
            {/* Track */}
            <div className="absolute inset-0 bg-[#222737] rounded-[40px]" />
            {/* Fill */}
            <div
              className="absolute left-0 top-0 h-full rounded-[40px] transition-all"
              style={{ width: `${Math.min(agent.bondingCurve, 100)}%`, background: barColor }}
            />
          </div>
        </div>

        {/* Description */}
        <p className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#6c779d] text-[11px] leading-[14px] truncate w-full">
          {agent.description}
        </p>
      </div>
    </button>
  );
};

// ── Row of 3 agent cells with vertical dividers ──
const AgentRow = ({
  agents,
  onAgentClick,
}: {
  agents: LaunchpadAgent[];
  onAgentClick: (id: string) => void;
}) => (
  <div className="flex items-start w-full gap-0">
    {agents.map((agent, i) => (
      <div key={agent.id} className="flex items-stretch flex-1 min-w-0">
        {i > 0 && (
          <div className="w-px self-stretch bg-[#1a1f2e] mx-4 flex-shrink-0" />
        )}
        <AgentCell agent={agent} onClick={() => onAgentClick(agent.id)} />
      </div>
    ))}
    {/* Pad to always fill 3 columns */}
    {agents.length < 3 &&
      Array.from({ length: 3 - agents.length }).map((_, i) => (
        <div key={`pad-${i}`} className="flex items-stretch flex-1 min-w-0">
          <div className="w-px self-stretch bg-[#1a1f2e] mx-4 flex-shrink-0" />
          <div className="flex-1" />
        </div>
      ))}
  </div>
);

// ── Main page ──
export const LaunchpadPage = (): JSX.Element => {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("trending");

  const filtered = getFiltered(activeTab);
  // Split into rows of 3
  const rows: LaunchpadAgent[][] = [];
  for (let i = 0; i < filtered.length; i += 3) rows.push(filtered.slice(i, i + 3));

  const sectionLabel =
    activeTab === "trending"
      ? "Trending Agents"
      : activeTab === "new"
      ? "New Agents"
      : "All Agents";

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-3xl border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Header bar ── */}
      <div className="relative h-[64px] flex-shrink-0 bg-[#11141b]">
        <div className="absolute top-[16px] left-[16px] right-[16px] flex items-center">
          {/* Left: filter button */}
          <button
            data-testid="filter-btn"
            className="w-8 h-8 rounded-full bg-[#1a1f2e] flex items-center justify-center flex-shrink-0 hover:bg-[#222840] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4H14M4 8H12M6 12H10" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>

          {/* Center: tab pills */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-[2px] bg-[#06070a] rounded-[400px] p-[2px] w-[300px]">
            {(["all", "trending", "new"] as Tab[]).map((tab) => (
              <button
                key={tab}
                data-testid={`tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-[6px] rounded-full [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[14px] leading-[16px] capitalize transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-[#240757] text-[#7631ee]"
                    : "bg-transparent text-[#414965] hover:text-[#6c779d]"
                }`}
              >
                {tab === "all" ? "All" : tab === "trending" ? "Trending" : "New"}
              </button>
            ))}
          </div>

          {/* Right: grid/create button */}
          <button
            data-testid="create-btn"
            className="ml-auto w-8 h-8 rounded-full bg-[#1a1f2e] flex items-center justify-center flex-shrink-0 hover:bg-[#222840] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="#6c779d" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="#6c779d" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="#6c779d" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="#6c779d" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-8 px-4 pb-6">

          {/* 1. Featured hero */}
          <FeaturedBanner onClick={() => navigate("/agent/alphaflow")} />

          {/* 2. Thin separator */}
          <div className="w-full h-px bg-[#1a1f2e] -mt-4" />

          {/* 3. Stats bar */}
          <StatsBar />

          {/* 4. Agent list */}
          <div className="flex flex-col gap-4">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[20px] leading-[24px]">
                {sectionLabel}
              </span>
              <button
                data-testid="see-all-btn"
                onClick={() => setActiveTab("all")}
                className="flex items-center gap-1 bg-[#222737] px-[10px] py-1 rounded-full hover:bg-[#2a2f45] transition-colors"
              >
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-[12px] leading-[16px] whitespace-nowrap">
                  See All
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="#a8b9f4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Agent rows */}
            {rows.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-[#414965] [font-family:'Gilroy-Medium',Helvetica] text-sm">
                No agents found
              </div>
            ) : (
              <div className="flex flex-col">
                {rows.map((row, rowIdx) => (
                  <div key={rowIdx}>
                    {rowIdx > 0 && <div className="w-full h-px bg-[#1a1f2e] my-4" />}
                    <AgentRow
                      agents={row}
                      onAgentClick={(id) => navigate(`/agent/${id}`)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
