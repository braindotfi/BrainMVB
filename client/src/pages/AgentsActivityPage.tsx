import { useState, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type AgentStatus = "active" | "inactive" | "paused";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar: string;
  status: AgentStatus;
  type: string;
  earnings: string;
  trades: number;
  successRate: string;
  lastActive: string;
  category: string;
}

const agents: Agent[] = [
  {
    id: "alphaflow",
    name: "AlphaFlow",
    description: "Executes automated trading strategies across crypto markets, optimizing for volatility, momentum, and liquidity signals.",
    avatar: "/figmaAssets/avatars-3.svg",
    status: "active",
    type: "Trading",
    earnings: "+$12,450",
    trades: 847,
    successRate: "73%",
    lastActive: "2 min ago",
    category: "DeFi",
  },
  {
    id: "yieldpilot",
    name: "Yield Pilot",
    description: "Manages capital allocation across DeFi protocols and yield strategies while maintaining risk-adjusted returns.",
    avatar: "/figmaAssets/avatars-9.svg",
    status: "active",
    type: "Yield",
    earnings: "+$8,201",
    trades: 312,
    successRate: "88%",
    lastActive: "5 min ago",
    category: "DeFi",
  },
  {
    id: "risksentinel",
    name: "Risk Sentinel",
    description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss.",
    avatar: "/figmaAssets/avatars.svg",
    status: "active",
    type: "Risk",
    earnings: "$0",
    trades: 2103,
    successRate: "99%",
    lastActive: "Just now",
    category: "Security",
  },
  {
    id: "signalseer",
    name: "Signal Seer",
    description: "Aggregates news, social signals, and on-chain data to surface actionable insights and trading signals.",
    avatar: "/figmaAssets/avatars-5.svg",
    status: "paused",
    type: "Analytics",
    earnings: "+$3,800",
    trades: 198,
    successRate: "61%",
    lastActive: "1 hour ago",
    category: "Analytics",
  },
  {
    id: "inboxzero",
    name: "InboxZero",
    description: "Manages email, filters priority messages, and drafts replies automatically using AI.",
    avatar: "/figmaAssets/avatars-2.svg",
    status: "inactive",
    type: "Productivity",
    earnings: "+$240",
    trades: 0,
    successRate: "N/A",
    lastActive: "3 days ago",
    category: "Productivity",
  },
  {
    id: "paystream",
    name: "Pay Stream",
    description: "Executes real-time payments for APIs and services using x402 protocols and smart contracts.",
    avatar: "/figmaAssets/avatars-1.svg",
    status: "inactive",
    type: "Payments",
    earnings: "+$950",
    trades: 67,
    successRate: "94%",
    lastActive: "5 days ago",
    category: "Finance",
  },
];

const statusConfig = {
  active: {
    label: "Active",
    dot: "bg-brain-v1green",
    badge: "bg-brain-v1dark-green text-brain-v1green",
  },
  paused: {
    label: "Paused",
    dot: "bg-yellow-400",
    badge: "bg-yellow-900/30 text-yellow-400",
  },
  inactive: {
    label: "Inactive",
    dot: "bg-brain-v1baby-blue-30",
    badge: "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30",
  },
};

const AgentCard = ({ agent }: { agent: Agent }) => {
  const [isActive, setIsActive] = useState(agent.status === "active");
  const config = statusConfig[agent.status];

  return (
    <div className="flex flex-col gap-4 p-4 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] hover:border-brain-v1stroke-2 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={agent.avatar} alt={agent.name} className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base whitespace-nowrap">
                {agent.name}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${config.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                {agent.type}
              </span>
              <span className="text-brain-v1baby-blue-15">·</span>
              <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                {agent.category}
              </span>
            </div>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setIsActive(!isActive)}
          className={`relative w-10 h-5 rounded-full flex-shrink-0 transition-colors ${
            isActive ? "bg-brain-v1dark-orange" : "bg-brain-v1baby-blue-30"
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              isActive ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed line-clamp-2">
        {agent.description}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Earnings</span>
          <span className={`text-sm [font-family:'JetBrains_Mono',Helvetica] font-medium ${agent.earnings.startsWith("+") ? "text-brain-v1green" : "text-brain-v1baby-blue-60"}`}>
            {agent.earnings}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Actions</span>
          <span className="text-sm [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1white">
            {agent.trades.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Success</span>
          <span className="text-sm [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1white">
            {agent.successRate}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#1d2131]">
        <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
          Last active: {agent.lastActive}
        </span>
        <button className="px-3 py-1 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-full text-xs [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-brain-v1stroke-2 transition-colors">
          View Details
        </button>
      </div>
    </div>
  );
};

export const AgentsActivityPage = (): JSX.Element => {
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = agents.filter((a) => {
    const matchesTab =
      activeTab === "active" ? a.status === "active" :
      activeTab === "inactive" ? a.status === "inactive" || a.status === "paused" :
      true;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.type.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const activeCount = agents.filter((a) => a.status === "active").length;
  const inactiveCount = agents.filter((a) => a.status !== "active").length;

  const handleSearchToggle = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery("");
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  };

  return (
    <div className="flex flex-col h-full bg-shared-colorsbaby-blue-5 rounded-3xl border border-solid border-[#1d2131] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1d2131]">
        <div>
          <h1 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xl">
            Agent Activity
          </h1>
          <p className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-60 text-sm mt-0.5">
            {activeCount} active · {inactiveCount} inactive
          </p>
        </div>
        <div className="flex items-center gap-2">
          {searchOpen && (
            <div className="flex items-center gap-2 px-3 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] focus-within:border-brain-v1baby-blue-30 rounded-xl transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-brain-v1baby-blue-30 flex-shrink-0">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                className="bg-transparent text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none w-40"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-brain-v1baby-blue-30 hover:text-brain-v1white transition-colors flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                </button>
              )}
            </div>
          )}
          <button
            onClick={handleSearchToggle}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${searchOpen ? "bg-brain-v1dark-orange text-brain-v1light-orange" : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 hover:text-brain-v1white hover:bg-brain-v1baby-blue-30"}`}
          >
            {searchOpen ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-[#1d2131]">
        {(["all", "active", "inactive"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors capitalize ${
              activeTab === tab
                ? "bg-brain-v1baby-blue-15 text-brain-v1white"
                : "text-brain-v1baby-blue-30 hover:text-brain-v1baby-blue-60"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Agent grid */}
      <ScrollArea className="flex-1">
        <div className="p-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
