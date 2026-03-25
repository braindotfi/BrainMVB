import { useState } from "react";
import { useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface LaunchpadAgent {
  id: string;
  ticker: string;
  name: string;
  description: string;
  avatar: string;
  avatarBg?: string;
  marketcap: string;
  marketcapRaw: number;
  price: string;
  priceRaw: number;
  change24h: number;
  volume24h: string;
  holders: number;
  category: string;
  status: "upcoming" | "trending" | "live";
  bondingCurve: number;
  createdBy: string;
  createdAt: string;
  replies: number;
}

export const launchpadAgents: LaunchpadAgent[] = [
  {
    id: "alphaflow",
    ticker: "$ALPHA",
    name: "AlphaFlow",
    description: "Executes automated trading strategies across crypto markets, optimizing for volatility, momentum, and liquidity signals in real time.",
    avatar: "/figmaAssets/avatars-3.svg",
    marketcap: "$842K",
    marketcapRaw: 842000,
    price: "$0.00842",
    priceRaw: 0.00842,
    change24h: 12.4,
    volume24h: "$128K",
    holders: 1247,
    category: "Trading",
    status: "trending",
    bondingCurve: 92,
    createdBy: "0xd3f...9a2c",
    createdAt: "2 days ago",
    replies: 84,
  },
  {
    id: "yieldpilot",
    ticker: "$YIELD",
    name: "Yield Pilot",
    description: "Manages capital allocation across DeFi protocols and yield strategies while maintaining risk-adjusted returns.",
    avatar: "/figmaAssets/avatars-9.svg",
    marketcap: "$1.2M",
    marketcapRaw: 1200000,
    price: "$0.0120",
    priceRaw: 0.012,
    change24h: 8.1,
    volume24h: "$245K",
    holders: 3018,
    category: "Yield",
    status: "trending",
    bondingCurve: 86,
    createdBy: "0xab1...34ef",
    createdAt: "5 days ago",
    replies: 156,
  },
  {
    id: "okaracmo",
    ticker: "$AICMO",
    name: "OKARACMO",
    description: "Automatically direct revenue to coin buybacks & burns performed by agents or humans.",
    avatar: "/figmaAssets/avatars.svg",
    marketcap: "$560K",
    marketcapRaw: 560000,
    price: "$0.0056",
    priceRaw: 0.0056,
    change24h: -3.2,
    volume24h: "$67K",
    holders: 892,
    category: "Finance",
    status: "live",
    bondingCurve: 71,
    createdBy: "0x77f...c890",
    createdAt: "1 week ago",
    replies: 42,
  },
  {
    id: "signalseer",
    ticker: "$SEER",
    name: "Signal Seer",
    description: "Aggregates news, social signals, and on-chain data to surface actionable insights before they move markets.",
    avatar: "/figmaAssets/avatars-5.svg",
    marketcap: "$320K",
    marketcapRaw: 320000,
    price: "$0.0032",
    priceRaw: 0.0032,
    change24h: 22.8,
    volume24h: "$98K",
    holders: 641,
    category: "Analytics",
    status: "trending",
    bondingCurve: 67,
    createdBy: "0xee2...11bc",
    createdAt: "3 days ago",
    replies: 67,
  },
  {
    id: "trendradar",
    ticker: "$RADR",
    name: "TrendRadar",
    description: "Detects emerging trends across markets, social platforms, and ecosystems before they become mainstream.",
    avatar: "/figmaAssets/avatars-5.svg",
    marketcap: "$180K",
    marketcapRaw: 180000,
    price: "$0.0018",
    priceRaw: 0.0018,
    change24h: 45.2,
    volume24h: "$54K",
    holders: 298,
    category: "Analytics",
    status: "upcoming",
    bondingCurve: 97,
    createdBy: "0x44a...f291",
    createdAt: "1 day ago",
    replies: 23,
  },
  {
    id: "taskforge",
    ticker: "$FORG",
    name: "TaskForge",
    description: "Automates repetitive workflows across tools, APIs, and services.",
    avatar: "/figmaAssets/avatars-6.svg",
    marketcap: "$95K",
    marketcapRaw: 95000,
    price: "$0.00095",
    priceRaw: 0.00095,
    change24h: -8.5,
    volume24h: "$12K",
    holders: 142,
    category: "Automation",
    status: "upcoming",
    bondingCurve: 96,
    createdBy: "0x19d...a72c",
    createdAt: "6 hours ago",
    replies: 8,
  },
  {
    id: "paystream",
    ticker: "$PAY",
    name: "Pay Stream",
    description: "Executes real-time payments for APIs and services using x402 protocols and verifiable on-chain receipts.",
    avatar: "/figmaAssets/avatars-1.svg",
    marketcap: "$2.1M",
    marketcapRaw: 2100000,
    price: "$0.021",
    priceRaw: 0.021,
    change24h: 3.7,
    volume24h: "$810K",
    holders: 5832,
    category: "Finance",
    status: "live",
    bondingCurve: 100,
    createdBy: "0xbc4...7f30",
    createdAt: "2 weeks ago",
    replies: 312,
  },
  {
    id: "dealcloser",
    ticker: "$DEAL",
    name: "Deal Closer",
    description: "Negotiates and executes transactions between agents using escrow and conditional multi-party payments.",
    avatar: "/figmaAssets/avatars-8.svg",
    marketcap: "$430K",
    marketcapRaw: 430000,
    price: "$0.0043",
    priceRaw: 0.0043,
    change24h: -1.4,
    volume24h: "$76K",
    holders: 733,
    category: "Finance",
    status: "live",
    bondingCurve: 53,
    createdBy: "0x92e...b401",
    createdAt: "1 week ago",
    replies: 57,
  },
  {
    id: "swarmalpha",
    ticker: "$SWARM",
    name: "SwarmAlpha",
    description: "Coordinates multiple agents to execute complex strategies in parallel with emergent intelligence.",
    avatar: "/figmaAssets/avatars-7.svg",
    marketcap: "$67K",
    marketcapRaw: 67000,
    price: "$0.00067",
    priceRaw: 0.00067,
    change24h: 89.3,
    volume24h: "$44K",
    holders: 98,
    category: "Multi-Agent",
    status: "upcoming",
    bondingCurve: 8,
    createdBy: "0x31c...e509",
    createdAt: "2 hours ago",
    replies: 15,
  },
  {
    id: "risksentinel",
    ticker: "$RISK",
    name: "Risk Sentinel",
    description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss.",
    avatar: "/figmaAssets/avatars.svg",
    marketcap: "$560K",
    marketcapRaw: 560000,
    price: "$0.0056",
    priceRaw: 0.0056,
    change24h: -3.2,
    volume24h: "$67K",
    holders: 892,
    category: "Security",
    status: "live",
    bondingCurve: 55,
    createdBy: "0x77f...c890",
    createdAt: "1 week ago",
    replies: 42,
  },
  {
    id: "inboxzero",
    ticker: "$INBOX",
    name: "InboxZero",
    description: "Manages email, filters priority messages, and drafts replies automatically using advanced language models.",
    avatar: "/figmaAssets/avatars-2.svg",
    marketcap: "$240K",
    marketcapRaw: 240000,
    price: "$0.0024",
    priceRaw: 0.0024,
    change24h: 5.9,
    volume24h: "$31K",
    holders: 421,
    category: "Productivity",
    status: "live",
    bondingCurve: 30,
    createdBy: "0xf8c...2d18",
    createdAt: "4 days ago",
    replies: 38,
  },
  {
    id: "invoicebot",
    ticker: "$BILL",
    name: "Invoice Bot",
    description: "Generates invoices, tracks payments, and automates billing workflows across multiple payment rails.",
    avatar: "/figmaAssets/avatars-4.svg",
    marketcap: "$88K",
    marketcapRaw: 88000,
    price: "$0.00088",
    priceRaw: 0.00088,
    change24h: -4.1,
    volume24h: "$9K",
    holders: 121,
    category: "Finance",
    status: "live",
    bondingCurve: 10,
    createdBy: "0x78a...c214",
    createdAt: "3 days ago",
    replies: 12,
  },
];

// ── Featured hero banner ──
const FeaturedBanner = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full h-[200px] relative rounded-2xl overflow-hidden border-2 text-left flex-shrink-0"
    style={{ borderColor: "rgba(118,49,238,0.7)", background: "#12032d" }}
  >
    {/* Glowing orbs — CSS-only approximation of Figma ellipses */}
    <div
      className="absolute pointer-events-none"
      style={{
        right: "-80px",
        top: "-120px",
        width: "480px",
        height: "480px",
        background: "radial-gradient(ellipse at center, rgba(118,49,238,0.35) 0%, rgba(118,49,238,0.10) 40%, transparent 70%)",
        transform: "rotate(-30deg)",
      }}
    />
    <div
      className="absolute pointer-events-none"
      style={{
        left: "-180px",
        top: "-80px",
        width: "400px",
        height: "300px",
        background: "radial-gradient(ellipse at center, rgba(90,30,180,0.25) 0%, transparent 65%)",
        transform: "rotate(-165deg)",
      }}
    />
    <div
      className="absolute pointer-events-none"
      style={{
        right: "60px",
        top: "80px",
        width: "300px",
        height: "160px",
        background: "radial-gradient(ellipse at center, rgba(160,80,255,0.20) 0%, transparent 70%)",
      }}
    />

    {/* Text content */}
    <div className="absolute left-[38px] top-1/2 -translate-y-1/2 flex flex-col items-start w-[336px]">
      <span
        className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#7631ee] text-[14px] leading-[16px] mb-1"
      >
        FEATURED
      </span>
      <div className="flex flex-col items-start">
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-[32px] leading-[40px]">
          Momentum Trader
        </span>
        <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#7631ee] text-[16px] leading-[20px]">
          A smart assistant designed to analyze market trends and execute trades on your behalf.
        </span>
      </div>
    </div>

    {/* Pagination dots */}
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1">
      <div className="w-[6px] h-[6px] rounded-full bg-[#7631ee] opacity-90" />
      <div className="w-[6px] h-[6px] rounded-full bg-[#7631ee] opacity-50" />
      <div className="w-[6px] h-[6px] rounded-full bg-[#3a2060] opacity-70" />
    </div>
  </button>
);

// ── Stats bar ──
const StatsBar = () => (
  <div className="w-full bg-[#06070a] rounded-xl p-3 flex items-center flex-shrink-0">
    <div className="flex-1 flex flex-col items-center gap-[3px]">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-[13px] leading-[14px]">
        Total Agents
      </span>
      <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-[#a8b9f4] text-[16px] leading-[20px]">
        248
      </span>
    </div>
    {/* Divider */}
    <div className="w-px self-stretch bg-[#1a1f2e]" />
    <div className="flex-1 flex flex-col items-center gap-[3px]">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-[13px] leading-[14px]">
        Total Market Cap
      </span>
      <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-[#a8b9f4] text-[16px] leading-[20px]">
        $8.1 M
      </span>
    </div>
    {/* Divider */}
    <div className="w-px self-stretch bg-[#1a1f2e]" />
    <div className="flex-1 flex flex-col items-center gap-[3px]">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-[13px] leading-[14px]">
        24h Volume
      </span>
      <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-[#a8b9f4] text-[16px] leading-[20px]">
        $1.6 M
      </span>
    </div>
  </div>
);

// ── Single agent list item ──
const AgentRow = ({ agent, onClick }: { agent: LaunchpadAgent; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex flex-1 gap-2 items-start min-w-0 rounded-lg text-left hover:bg-[#0d1018] transition-colors px-1 py-1 -mx-1 -my-1"
  >
    {/* Avatar */}
    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#1a1f2e]">
      <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
    </div>

    {/* Info */}
    <div className="flex flex-col gap-2 flex-1 min-w-0 justify-center">
      {/* Name + ticker */}
      <div className="flex items-center gap-1 [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[14px] leading-[16px] whitespace-nowrap">
        <span className="text-white">{agent.name}</span>
        <span className="text-[#6c779d]">{agent.ticker}</span>
      </div>

      {/* Bonding curve */}
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-start justify-between [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[11px] leading-[12px]">
          <span>Bonding Curve</span>
          <span>{agent.bondingCurve}%</span>
        </div>
        <div className="h-2 w-full relative">
          <div className="absolute inset-0 bg-[#222737] rounded-[40px]" />
          <div
            className="absolute left-0 top-0 h-full bg-[#ff9500] rounded-[40px]"
            style={{ width: `${agent.bondingCurve}%` }}
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

// ── Row of 3 agents with vertical dividers ──
const AgentTrioRow = ({
  agents,
  onAgentClick,
}: {
  agents: LaunchpadAgent[];
  onAgentClick: (id: string) => void;
}) => (
  <div className="flex items-start gap-0 w-full">
    {agents.map((agent, i) => (
      <div key={agent.id} className="flex items-stretch flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <AgentRow agent={agent} onClick={() => onAgentClick(agent.id)} />
        </div>
        {i < agents.length - 1 && (
          <div className="w-px self-stretch bg-[#1a1f2e] mx-4 flex-shrink-0" />
        )}
      </div>
    ))}
    {/* Pad with empty slots if fewer than 3 */}
    {agents.length < 3 && Array.from({ length: 3 - agents.length }).map((_, i) => (
      <div key={`empty-${i}`} className="flex items-stretch flex-1 min-w-0">
        <div className="w-px self-stretch bg-[#1a1f2e] mx-4 flex-shrink-0" />
        <div className="flex-1" />
      </div>
    ))}
  </div>
);

export const LaunchpadPage = (): JSX.Element => {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"trending" | "upcoming" | "all">("trending");

  const filtered = launchpadAgents.filter(
    (a) => activeTab === "all" || a.status === activeTab
  );

  // Split into rows of 3
  const rows: LaunchpadAgent[][] = [];
  for (let i = 0; i < filtered.length; i += 3) {
    rows.push(filtered.slice(i, i + 3));
  }

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-3xl border border-solid border-[#1d2132] overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-8 px-4 pt-4 pb-6">

          {/* 1. Featured banner */}
          <FeaturedBanner onClick={() => navigate("/agent/alphaflow")} />

          {/* Thin separator */}
          <div className="w-full h-px bg-[#1a1f2e] -mt-4" />

          {/* 2. Stats bar */}
          <StatsBar />

          {/* 3. Trending agents */}
          <div className="flex flex-col gap-4">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[20px] leading-[24px]">
                Trending Agents
              </span>
              <div className="flex items-center gap-1">
                {(["trending", "upcoming", "all"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded-full text-[12px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold capitalize transition-colors ${
                      activeTab === tab
                        ? "bg-[#222737] text-[#a8b9f4]"
                        : "text-[#414965] hover:text-[#6c779d]"
                    }`}
                  >
                    {tab === "all" ? "See All" : tab === "trending" ? "Trending" : "Upcoming"}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent rows */}
            <div className="flex flex-col gap-0">
              {rows.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-[#414965] [font-family:'Gilroy-Medium',Helvetica] text-sm">
                  No agents found
                </div>
              ) : (
                rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex flex-col">
                    {rowIndex > 0 && (
                      <div className="w-full h-px bg-[#1a1f2e] my-4" />
                    )}
                    <AgentTrioRow
                      agents={row}
                      onAgentClick={(id) => navigate(`/agent/${id}`)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
