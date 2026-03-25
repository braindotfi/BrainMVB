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
    description: "Executes automated trading strategies across crypto markets using momentum, volatility, and liquidity signals in real time.",
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
    bondingCurve: 78,
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
    bondingCurve: 92,
    createdBy: "0xab1...34ef",
    createdAt: "5 days ago",
    replies: 156,
  },
  {
    id: "risksentinel",
    ticker: "$RISK",
    name: "Risk Sentinel",
    description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss in real time.",
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
    bondingCurve: 41,
    createdBy: "0xee2...11bc",
    createdAt: "3 days ago",
    replies: 67,
  },
  {
    id: "trendradar",
    ticker: "$RADAR",
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
    bondingCurve: 22,
    createdBy: "0x44a...f291",
    createdAt: "1 day ago",
    replies: 23,
  },
  {
    id: "taskforge",
    ticker: "$FORGE",
    name: "TaskForge Pro",
    description: "Automates repetitive workflows across tools, APIs, and services with intelligent orchestration and error recovery.",
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
    bondingCurve: 11,
    createdBy: "0x19d...a72c",
    createdAt: "6 hours ago",
    replies: 8,
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
    id: "opscommander",
    ticker: "$OPS",
    name: "Ops Commander",
    description: "Coordinates multi-step workflows across systems and APIs with real-time monitoring and auto-recovery.",
    avatar: "/figmaAssets/avatars-8.svg",
    marketcap: "$155K",
    marketcapRaw: 155000,
    price: "$0.00155",
    priceRaw: 0.00155,
    change24h: 15.6,
    volume24h: "$22K",
    holders: 218,
    category: "Automation",
    status: "upcoming",
    bondingCurve: 19,
    createdBy: "0x65b...d123",
    createdAt: "12 hours ago",
    replies: 19,
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

const categoryColors: Record<string, string> = {
  Trading: "bg-purple-900/40 text-purple-400",
  Yield: "bg-green-900/40 text-green-400",
  Security: "bg-blue-900/40 text-blue-400",
  Analytics: "bg-yellow-900/40 text-yellow-400",
  Automation: "bg-orange-900/40 text-orange-400",
  Productivity: "bg-pink-900/40 text-pink-400",
  Finance: "bg-emerald-900/40 text-emerald-400",
  "Multi-Agent": "bg-red-900/40 text-red-400",
};

const AgentCard = ({ agent, onClick }: { agent: LaunchpadAgent; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex flex-col gap-3 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] hover:border-brain-v1stroke-2 hover:bg-[#151c2e] transition-all text-left group"
  >
    {/* Top row */}
    <div className="flex items-start gap-3">
      <img src={agent.avatar} alt={agent.name} className="w-12 h-12 rounded-xl flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">
            {agent.name}
          </span>
          <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-xs">
            {agent.ticker}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${categoryColors[agent.category] || "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60"}`}>
            {agent.category}
          </span>
          <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
            by {agent.createdBy}
          </span>
        </div>
      </div>
      <div className={`text-xs [font-family:'JetBrains_Mono',Helvetica] font-medium ${agent.change24h >= 0 ? "text-brain-v1green" : "text-brain-v1pink-red"}`}>
        {agent.change24h >= 0 ? "+" : ""}{agent.change24h}%
      </div>
    </div>

    {/* Description */}
    <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed line-clamp-2">
      {agent.description}
    </p>

    {/* Bonding curve progress */}
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
          Bonding curve
        </span>
        <span className="text-[10px] text-brain-v1baby-blue-60 [font-family:'JetBrains_Mono',Helvetica]">
          {agent.bondingCurve}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-brain-v1baby-blue-15 rounded-full overflow-hidden">
        <div
          className="h-full bg-brain-v1dark-orange rounded-full transition-all"
          style={{ width: `${agent.bondingCurve}%` }}
        />
      </div>
    </div>

    {/* Stats row */}
    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1d2131]">
      <div>
        <div className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Market Cap</div>
        <div className="text-xs text-brain-v1white [font-family:'JetBrains_Mono',Helvetica] font-medium">{agent.marketcap}</div>
      </div>
      <div>
        <div className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Volume 24h</div>
        <div className="text-xs text-brain-v1white [font-family:'JetBrains_Mono',Helvetica] font-medium">{agent.volume24h}</div>
      </div>
      <div>
        <div className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Holders</div>
        <div className="text-xs text-brain-v1white [font-family:'JetBrains_Mono',Helvetica] font-medium">{agent.holders.toLocaleString()}</div>
      </div>
    </div>
  </button>
);

export const LaunchpadPage = (): JSX.Element => {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"trending" | "upcoming" | "all">("trending");
  const [search, setSearch] = useState("");

  const filtered = launchpadAgents
    .filter((a) => activeTab === "all" || a.status === activeTab)
    .filter(
      (a) =>
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.ticker.toLowerCase().includes(search.toLowerCase()) ||
        a.category.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="flex flex-col h-full bg-shared-colorsbaby-blue-5 rounded-3xl border border-solid border-[#1d2131] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1d2131]">
        <div>
          <h1 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xl">
            🚀 Launchpad
          </h1>
          <p className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-60 text-sm mt-0.5">
            Discover and invest in tokenized AI agents
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-brain-v1dark-orange rounded-full [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1light-orange text-sm hover:opacity-80 transition-opacity">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Launch Agent Token
        </button>
      </div>

      {/* Search + tabs */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#1d2131]">
        <div className="flex items-center gap-2 flex-1 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4" stroke="#4a5578" strokeWidth="1.5" />
            <path d="M10 10L13 13" stroke="#4a5578" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents, tickers, categories..."
            className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-brain-v1baby-blue-15 rounded-xl">
          {(["trending", "upcoming", "all"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? "bg-brain-v1headerfooterbg text-brain-v1white"
                  : "text-brain-v1baby-blue-30 hover:text-brain-v1baby-blue-60"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Live stats bar */}
      <div className="flex items-center gap-6 px-6 py-2 bg-brain-v1baby-blue-15 border-b border-[#1d2131]">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-brain-v1green rounded-full animate-pulse" />
          <span className="text-[10px] text-brain-v1green [font-family:'Gilroy-SemiBold',Helvetica]">LIVE</span>
        </div>
        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
          Total agents: <span className="text-brain-v1white">{launchpadAgents.length}</span>
        </span>
        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
          Total market cap: <span className="text-brain-v1white">$8.1M</span>
        </span>
        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
          24h volume: <span className="text-brain-v1white">$1.6M</span>
        </span>
      </div>

      {/* Agent grid */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-brain-v1baby-blue-30">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mb-3 opacity-40">
              <circle cx="18" cy="18" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M26 26L35 35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="[font-family:'Gilroy-Medium',Helvetica] text-sm">No agents found</span>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => navigate(`/agent/${agent.id}`)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
