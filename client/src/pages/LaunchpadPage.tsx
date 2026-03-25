import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";

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
  createdHoursAgo: number;
  replies: number;
}

export const launchpadAgents: LaunchpadAgent[] = [
  {
    id: "alphaflow",       ticker: "$ALPHA",  name: "AlphaFlow",
    description: "Executes automated trading strategies across crypto markets, optimizing for volatility, momentum, and liquidity signals in real time.",
    avatar: "/figmaAssets/avatars-3.svg",
    marketcap: "$842K",   marketcapRaw: 842000,
    price: "$0.00842",    priceRaw: 0.00842,    change24h: 12.4,
    volume24hRaw: 128000, volume24h: "$128K",    holders: 1247,
    category: "Trading",  bondingCurve: 92,
    createdBy: "0xd3f…9a2c", createdAt: "2 days ago", createdHoursAgo: 48, replies: 84,
  },
  {
    id: "yieldpilot",     ticker: "$YIELD",  name: "Yield Pilot",
    description: "Manages capital allocation across DeFi protocols and yield strategies while maintaining risk-adjusted returns.",
    avatar: "/figmaAssets/avatars-9.svg",
    marketcap: "$1.2M",   marketcapRaw: 1200000,
    price: "$0.0120",     priceRaw: 0.012,      change24h: 8.1,
    volume24hRaw: 245000, volume24h: "$245K",    holders: 3018,
    category: "Yield",    bondingCurve: 86,
    createdBy: "0xab1…34ef", createdAt: "5 days ago", createdHoursAgo: 120, replies: 156,
  },
  {
    id: "risksentinel",   ticker: "$RISK",   name: "Risk Sentinel",
    description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss in real time.",
    avatar: "/figmaAssets/avatars.svg",
    marketcap: "$560K",   marketcapRaw: 560000,
    price: "$0.0056",     priceRaw: 0.0056,     change24h: -3.2,
    volume24hRaw: 67000,  volume24h: "$67K",     holders: 892,
    category: "Security", bondingCurve: 100,
    createdBy: "0x77f…c890", createdAt: "1 week ago",  createdHoursAgo: 168, replies: 42,
  },
  {
    id: "signalseer",     ticker: "$SEER",   name: "Signal Seer",
    description: "Aggregates news, social signals, and on-chain data to surface actionable insights before they move markets.",
    avatar: "/figmaAssets/avatars-5.svg",
    marketcap: "$320K",   marketcapRaw: 320000,
    price: "$0.0032",     priceRaw: 0.0032,     change24h: 22.8,
    volume24hRaw: 98000,  volume24h: "$98K",     holders: 641,
    category: "Analytics",bondingCurve: 67,
    createdBy: "0xee2…11bc", createdAt: "3 days ago", createdHoursAgo: 72, replies: 67,
  },
  {
    id: "trendradar",     ticker: "$RADR",   name: "TrendRadar",
    description: "Detects emerging trends across markets, social platforms, and ecosystems before they become mainstream.",
    avatar: "/figmaAssets/avatars-5.svg",
    marketcap: "$180K",   marketcapRaw: 180000,
    price: "$0.0018",     priceRaw: 0.0018,     change24h: 45.2,
    volume24hRaw: 54000,  volume24h: "$54K",     holders: 298,
    category: "Analytics",bondingCurve: 97,
    createdBy: "0x44a…f291", createdAt: "18 hours ago", createdHoursAgo: 18, replies: 23,
  },
  {
    id: "taskforge",      ticker: "$FORG",   name: "TaskForge",
    description: "Automates repetitive workflows across tools, APIs, and services with intelligent orchestration.",
    avatar: "/figmaAssets/avatars-6.svg",
    marketcap: "$95K",    marketcapRaw: 95000,
    price: "$0.00095",    priceRaw: 0.00095,    change24h: -8.5,
    volume24hRaw: 12000,  volume24h: "$12K",     holders: 142,
    category: "Automation",bondingCurve: 96,
    createdBy: "0x19d…a72c", createdAt: "6 hours ago", createdHoursAgo: 6, replies: 8,
  },
  {
    id: "paystream",      ticker: "$PAY",    name: "Pay Stream",
    description: "Executes real-time payments for APIs and services using x402 protocols and verifiable on-chain receipts.",
    avatar: "/figmaAssets/avatars-1.svg",
    marketcap: "$2.1M",   marketcapRaw: 2100000,
    price: "$0.021",      priceRaw: 0.021,      change24h: 3.7,
    volume24hRaw: 810000, volume24h: "$810K",    holders: 5832,
    category: "Finance",  bondingCurve: 100,
    createdBy: "0xbc4…7f30", createdAt: "2 weeks ago", createdHoursAgo: 336, replies: 312,
  },
  {
    id: "dealcloser",     ticker: "$DEAL",   name: "Deal Closer",
    description: "Negotiates and executes transactions between agents using escrow and conditional multi-party payments.",
    avatar: "/figmaAssets/avatars-8.svg",
    marketcap: "$430K",   marketcapRaw: 430000,
    price: "$0.0043",     priceRaw: 0.0043,     change24h: -1.4,
    volume24hRaw: 76000,  volume24h: "$76K",     holders: 733,
    category: "Finance",  bondingCurve: 53,
    createdBy: "0x92e…b401", createdAt: "1 week ago",  createdHoursAgo: 168, replies: 57,
  },
  {
    id: "swarmalpha",     ticker: "$SWARM",  name: "SwarmAlpha",
    description: "Coordinates multiple agents to execute complex strategies in parallel with emergent intelligence.",
    avatar: "/figmaAssets/avatars-7.svg",
    marketcap: "$67K",    marketcapRaw: 67000,
    price: "$0.00067",    priceRaw: 0.00067,    change24h: 89.3,
    volume24hRaw: 44000,  volume24h: "$44K",     holders: 98,
    category: "Multi-Agent",bondingCurve: 8,
    createdBy: "0x31c…e509", createdAt: "2 hours ago", createdHoursAgo: 2, replies: 15,
  },
  {
    id: "inboxzero",      ticker: "$INBOX",  name: "InboxZero",
    description: "Manages email, filters priority messages, and drafts replies automatically using advanced language models.",
    avatar: "/figmaAssets/avatars-2.svg",
    marketcap: "$240K",   marketcapRaw: 240000,
    price: "$0.0024",     priceRaw: 0.0024,     change24h: 5.9,
    volume24hRaw: 31000,  volume24h: "$31K",     holders: 421,
    category: "Productivity",bondingCurve: 30,
    createdBy: "0xf8c…2d18", createdAt: "4 days ago", createdHoursAgo: 96, replies: 38,
  },
  {
    id: "invoicebot",     ticker: "$BILL",   name: "Invoice Bot",
    description: "Generates invoices, tracks payments, and automates billing workflows across multiple payment rails.",
    avatar: "/figmaAssets/avatars-4.svg",
    marketcap: "$88K",    marketcapRaw: 88000,
    price: "$0.00088",    priceRaw: 0.00088,    change24h: -4.1,
    volume24hRaw: 9000,   volume24h: "$9K",      holders: 121,
    category: "Finance",  bondingCurve: 10,
    createdBy: "0x78a…c214", createdAt: "3 days ago", createdHoursAgo: 72, replies: 12,
  },
  {
    id: "opscommander",   ticker: "$OPS",    name: "Ops Commander",
    description: "Coordinates multi-step workflows across systems and APIs with real-time monitoring and auto-recovery.",
    avatar: "/figmaAssets/avatars-8.svg",
    marketcap: "$155K",   marketcapRaw: 155000,
    price: "$0.00155",    priceRaw: 0.00155,    change24h: 15.6,
    volume24hRaw: 22000,  volume24h: "$22K",     holders: 218,
    category: "Automation",bondingCurve: 19,
    createdBy: "0x65b…d123", createdAt: "12 hours ago", createdHoursAgo: 12, replies: 19,
  },
];

const totalMarketCapRaw = launchpadAgents.reduce((s, a) => s + a.marketcapRaw, 0);
const total24hVolumeRaw  = launchpadAgents.reduce((s, a) => s + a.volume24hRaw, 0);
const fmtStat = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)} M` : `$${(n / 1000).toFixed(1)} K`;

type Tab = "all" | "trending" | "new";

const getFiltered = (tab: Tab): LaunchpadAgent[] => {
  if (tab === "all") return launchpadAgents;
  if (tab === "new")
    return launchpadAgents
      .filter((a) => a.createdHoursAgo <= 24)
      .sort((a, b) => a.createdHoursAgo - b.createdHoursAgo);
  return [...launchpadAgents].sort((a, b) => b.volume24hRaw - a.volume24hRaw).slice(0, 9);
};


// ── Thin horizontal separator (Figma h-0 with 1px border image) ──
const HSep = () => (
  <div className="flex-shrink-0 w-full" style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />
);

// ── Thin vertical separator (Figma: w-0 relative self-stretch with absolute inset-[0_-0.5px] line) ──
const VSep = () => (
  <div className="relative flex-shrink-0" style={{ width: "0px", alignSelf: "stretch" }}>
    <div style={{ position: "absolute", inset: "0 -0.5px", background: "rgba(255,255,255,0.07)", width: "1px", left: "-0.5px" }} />
  </div>
);

// ── Stats bar (Figma node 3141:44015 — bg-[#06070a] rounded-[12px] p-[12px]) ──
const StatsBar = () => (
  <div
    className="flex-shrink-0 w-full flex flex-col items-start justify-center"
    style={{ background: "#06070a", borderRadius: "12px", padding: "12px" }}
  >
    <div className="flex gap-[6px] items-center w-full">
      {/* Total Agents */}
      <div className="flex flex-[1_0_0] flex-col gap-[3px] items-center justify-center min-w-0">
        <p style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontWeight: 600, fontSize: "13px", lineHeight: "14px", color: "#414965", whiteSpace: "nowrap" }}>
          Total Agents
        </p>
        <p style={{ fontFamily: "'Gilroy-Bold', Helvetica, sans-serif", fontWeight: 700, fontSize: "16px", lineHeight: "20px", color: "#a8b9f4", whiteSpace: "nowrap" }}>
          {launchpadAgents.length}
        </p>
      </div>
      {/* Vertical divider */}
      <div className="self-stretch flex-shrink-0" style={{ width: "1px", background: "rgba(255,255,255,0.06)" }} />
      {/* Total Market Cap */}
      <div className="flex flex-[1_0_0] flex-col gap-[3px] items-center justify-center min-w-0">
        <p style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontWeight: 600, fontSize: "13px", lineHeight: "14px", color: "#414965", whiteSpace: "nowrap" }}>
          Total Market Cap
        </p>
        <p style={{ fontFamily: "'Gilroy-Bold', Helvetica, sans-serif", fontWeight: 700, fontSize: "16px", lineHeight: "20px", color: "#a8b9f4", whiteSpace: "nowrap" }}>
          {fmtStat(totalMarketCapRaw)}
        </p>
      </div>
      {/* Vertical divider */}
      <div className="self-stretch flex-shrink-0" style={{ width: "1px", background: "rgba(255,255,255,0.06)" }} />
      {/* 24h Volume */}
      <div className="flex flex-[1_0_0] flex-col gap-[3px] items-center justify-center min-w-0">
        <p style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontWeight: 600, fontSize: "13px", lineHeight: "14px", color: "#414965", whiteSpace: "nowrap" }}>
          24h Volume
        </p>
        <p style={{ fontFamily: "'Gilroy-Bold', Helvetica, sans-serif", fontWeight: 700, fontSize: "16px", lineHeight: "20px", color: "#a8b9f4", whiteSpace: "nowrap" }}>
          {fmtStat(total24hVolumeRaw)}
        </p>
      </div>
    </div>
  </div>
);

// ── Single agent cell (matches Figma flex-[1_0_0] gap-[8px] items-start) ──
const AgentCell = ({ agent, onClick }: { agent: LaunchpadAgent; onClick: () => void }) => {
  const complete = agent.bondingCurve >= 100;
  const barColor = complete ? "#42bf23" : "#ff9500";
  return (
    <button
      data-testid={`agent-cell-${agent.id}`}
      onClick={onClick}
      className="flex flex-[1_0_0] gap-2 items-start min-h-px min-w-px text-left rounded-lg hover:bg-white/[0.03] transition-colors"
    >
      {/* 48×48 avatar */}
      <div className="overflow-hidden flex-shrink-0" style={{ width: "48px", height: "48px", borderRadius: "8px", background: "#1a1f2e" }}>
        <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
      </div>

      {/* Info column */}
      <div className="flex flex-[1_0_0] flex-col gap-2 items-start justify-center min-w-0">
        {/* Name + ticker */}
        <div
          className="flex gap-1 items-center whitespace-nowrap"
          style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "16px" }}
        >
          <span style={{ color: "#ffffff" }}>{agent.name}</span>
          <span style={{ color: "#6c779d" }}>{agent.ticker}</span>
        </div>

        {/* Bonding Curve */}
        <div className="flex flex-col gap-1 w-full" style={{ gap: "4px" }}>
          <div
            className="flex items-start justify-between whitespace-nowrap w-full"
            style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontWeight: 600, fontSize: "11px", lineHeight: "12px", color: "#6c779d" }}
          >
            <span>Bonding Curve</span>
            <span>{agent.bondingCurve}%</span>
          </div>
          <div className="relative w-full" style={{ height: "8px" }}>
            {/* Track */}
            <div className="absolute inset-0 rounded-[40px]" style={{ background: "#222737" }} />
            {/* Fill */}
            <div
              className="absolute left-0 top-0 h-full rounded-[40px]"
              style={{ width: `${Math.min(agent.bondingCurve, 100)}%`, background: barColor }}
            />
          </div>
        </div>

        {/* Description */}
        <p
          className="w-full overflow-hidden"
          style={{
            fontFamily: "'Gilroy-Medium', Helvetica, sans-serif",
            fontWeight: 500,
            fontSize: "11px",
            lineHeight: "14px",
            color: "#6c779d",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {agent.description}
        </p>
      </div>
    </button>
  );
};

// ── Row of 3 agents with vertical 1px dividers between them ──
// Matches Figma: flex gap-[16px] items-start w-full, with w-0 relative dividers as siblings
const AgentTrioRow = ({ agents, onAgentClick }: { agents: LaunchpadAgent[]; onAgentClick: (id: string) => void }) => (
  <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", width: "100%" }}>
    {agents.map((agent, i) => (
      <div key={agent.id} style={{ display: "contents" }}>
        {i > 0 && <VSep />}
        <div style={{ flex: "1 0 0", minWidth: 0 }}>
          <AgentCell agent={agent} onClick={() => onAgentClick(agent.id)} />
        </div>
      </div>
    ))}
    {/* Pad to always 3 columns */}
    {agents.length < 3 && Array.from({ length: 3 - agents.length }).map((_, idx) => (
      <div key={`pad-${idx}`} style={{ display: "contents" }}>
        <VSep />
        <div style={{ flex: "1 0 0" }} />
      </div>
    ))}
  </div>
);

// ── Main page ──
export const LaunchpadPage = (): JSX.Element => {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("trending");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const handleSearchToggle = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery("");
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  };

  const baseAgents = getFiltered(activeTab);
  const filtered = searchQuery.trim()
    ? baseAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : baseAgents;

  const rows: LaunchpadAgent[][] = [];
  for (let i = 0; i < filtered.length; i += 3) rows.push(filtered.slice(i, i + 3));

  const sectionLabel = searchQuery.trim()
    ? `Results (${filtered.length})`
    : activeTab === "trending" ? "Trending Agents" : activeTab === "new" ? "New Agents" : "All Agents";

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "#11141b", border: "1px solid #1d2132", borderRadius: "24px" }}
    >
      {/* ── Header bar (64px) ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4" style={{ height: "64px", background: "#11141b" }}>
        {/* Center: tabs OR search bar */}
        <div className="flex-1 flex items-center justify-center">
          {searchOpen ? (
            /* Search bar replaces tabs */
            <div className="flex items-center gap-2 px-3 py-2 bg-[#06070a] border border-[#1d2132] focus-within:border-[#414965] rounded-full transition-colors w-full max-w-[320px]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#414965] flex-shrink-0">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents, tickers..."
                data-testid="search-input"
                className="bg-transparent text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-[#414965] outline-none flex-1"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-[#414965] hover:text-white transition-colors flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            /* Tab pills */
            <div
              className="flex items-center"
              style={{ background: "#06070a", borderRadius: "400px", padding: "2px", gap: "2px" }}
            >
              {(["all", "trending", "new"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  data-testid={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className="flex items-center justify-center transition-colors"
                  style={{
                    padding: "6px 16px",
                    borderRadius: "100px",
                    background: activeTab === tab ? "#240757" : "transparent",
                    fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif",
                    fontWeight: 600,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: activeTab === tab ? "#7631ee" : "#414965",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  {tab === "all" ? "All" : tab === "trending" ? "Trending" : "New"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: search toggle button */}
        <button
          data-testid="search-toggle-btn"
          onClick={handleSearchToggle}
          className={`flex items-center justify-center flex-shrink-0 transition-colors ${
            searchOpen
              ? "bg-brain-v1dark-orange text-white"
              : "text-[#6c779d] hover:text-white"
          }`}
          style={{ width: "32px", height: "32px", borderRadius: "100px", background: searchOpen ? undefined : "#1d2132" }}
        >
          {searchOpen ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Scrollable content (left-[15px] equivalent padding, gap-[32px]) ── */}
      <ScrollArea className="flex-1">
        <div
          className="flex flex-col"
          style={{ gap: "32px", padding: "0 15px 24px 15px" }}
        >
          {/* 1. Featured carousel */}
          <FeaturedCarousel />

          {/* 2. Separator (Figma h-0 element = just a 1px line within the gap) */}
          <HSep />

          {/* 3. Stats bar */}
          <StatsBar />

          {/* 4. Trending agents section */}
          <div className="flex flex-col items-start w-full" style={{ gap: "16px" }}>
            {/* Section header */}
            <div className="flex items-start justify-between w-full">
              <p style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontWeight: 600, fontSize: "20px", lineHeight: "24px", color: "#6c779d", whiteSpace: "nowrap" }}>
                {sectionLabel}
              </p>
              <button
                data-testid="see-all-btn"
                onClick={() => setActiveTab("all")}
                className="flex items-center justify-center transition-colors hover:opacity-80"
                style={{ background: "#222737", borderRadius: "100px", padding: "4px 10px", gap: "2px" }}
              >
                <span style={{ fontFamily: "'Gilroy-SemiBold', Helvetica, sans-serif", fontWeight: 600, fontSize: "12px", lineHeight: "16px", color: "#a8b9f4", whiteSpace: "nowrap" }}>
                  See All
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6.5 4.5L9.5 8L6.5 11.5" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Agent rows with h-0 separators between them */}
            {rows.length === 0 ? (
              <div className="flex items-center justify-center w-full py-16" style={{ color: "#414965", fontFamily: "'Gilroy-Medium', Helvetica, sans-serif", fontSize: "14px" }}>
                No agents found
              </div>
            ) : (
              <div className="flex flex-col items-start w-full" style={{ gap: "16px" }}>
                {rows.map((row, rowIdx) => (
                  <div key={rowIdx} style={{ display: "contents" }}>
                    {rowIdx > 0 && <HSep />}
                    <AgentTrioRow agents={row} onAgentClick={(id) => navigate(`/agent/${id}`)} />
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
