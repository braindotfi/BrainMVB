import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";

type ReputationTier = "Legendary" | "Diamond" | "Gold" | "Silver" | "Bronze" | "New" | "Unranked" | "Caution";

/* Rank pill: purple gradient */
const RANK_BG = "linear-gradient(100deg, rgb(46,31,113) 0%, rgb(67,50,118) 100%)";
const RANK_TEXT_GRAD = "linear-gradient(106deg, rgb(176,150,255) 0%, rgb(127,113,255) 100%)";

/* Inline SVG icon for Diamond/rank pill */
const DiamondIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 1L3 5.5L8 15L13 5.5L8 1Z" fill="rgba(176,150,255,0.9)" stroke="rgba(176,150,255,0.5)" strokeWidth="0.5" />
    <path d="M3 5.5h10" stroke="rgba(127,113,255,0.6)" strokeWidth="0.5" />
  </svg>
);

/* Inline SVG icons for reputation tiers */
const TierIcon = ({ tier }: { tier: ReputationTier }) => {
  switch (tier) {
    case "Legendary":
    case "Diamond":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1L3 5.5L8 15L13 5.5L8 1Z" fill="rgba(176,150,255,0.9)" stroke="rgba(176,150,255,0.5)" strokeWidth="0.5" />
          <path d="M3 5.5h10" stroke="rgba(127,113,255,0.6)" strokeWidth="0.5" />
        </svg>
      );
    case "Gold":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2l1.5 4.5H14l-3.75 2.75L11.75 14 8 11.25 4.25 14l1.5-4.75L2 6.5h4.5L8 2Z" fill="rgba(255,221,134,0.9)" stroke="rgba(174,126,23,0.5)" strokeWidth="0.3" />
        </svg>
      );
    case "Silver":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2l1.5 4.5H14l-3.75 2.75L11.75 14 8 11.25 4.25 14l1.5-4.75L2 6.5h4.5L8 2Z" fill="rgba(220,229,232,0.8)" stroke="rgba(141,158,166,0.5)" strokeWidth="0.3" />
        </svg>
      );
    case "Bronze":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2l1.5 4.5H14l-3.75 2.75L11.75 14 8 11.25 4.25 14l1.5-4.75L2 6.5h4.5L8 2Z" fill="rgba(192,159,107,0.8)" stroke="rgba(104,78,38,0.5)" strokeWidth="0.3" />
        </svg>
      );
    case "New":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.5" fill="rgba(0,212,170,0.2)" stroke="rgba(0,212,170,0.8)" strokeWidth="1" />
          <path d="M8 5v6M5 8h6" stroke="rgba(137,255,232,0.9)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "Unranked":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.5" fill="rgba(108,119,157,0.2)" stroke="rgba(108,119,157,0.6)" strokeWidth="1" />
          <path d="M6 6.5c0-1.1.9-2 2-2s2 .9 2 2c0 1-1 1.5-2 2V10M8 12v.5" stroke="rgba(151,163,204,0.9)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "Caution":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L1.5 13h13L8 2Z" fill="rgba(210,3,68,0.2)" stroke="rgba(210,3,68,0.7)" strokeWidth="1" strokeLinejoin="round" />
          <path d="M8 6.5v3M8 11v.5" stroke="#d20344" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
};
const REP_BADGE_STYLE: Record<ReputationTier, { bg: string; textGrad?: string; textSolid?: string }> = {
  Legendary: { bg: "linear-gradient(107deg, rgb(80,30,180) 0%, rgb(110,55,195) 100%)",    textGrad: "linear-gradient(105deg, #d4b4ff 0%, #9d5cf5 100%)" },
  Diamond:   { bg: "linear-gradient(107deg, rgb(46,31,113) 0%, rgb(67,50,118) 100%)",      textGrad: "linear-gradient(105deg, rgb(176,150,255) 0%, rgb(127,113,255) 100%)" },
  Gold:      { bg: "linear-gradient(to right, #352502, #614b12)",                          textGrad: "linear-gradient(100deg, rgb(255,221,134) 0%, rgb(174,126,23) 100%)" },
  Silver:    { bg: "linear-gradient(to right, #2b363b, #3f4e55)",                          textGrad: "linear-gradient(101deg, rgb(220,229,232) 0%, rgb(141,158,166) 100%)" },
  Bronze:    { bg: "linear-gradient(to right, #2d220e, #42321a)",                          textGrad: "linear-gradient(101deg, rgb(192,159,107) 0%, rgb(104,78,38) 100%)" },
  New:       { bg: "linear-gradient(102deg, rgb(0,55,44) 0%, rgb(11,75,62) 100%)",         textGrad: "linear-gradient(98deg, rgb(137,255,232) 0%, rgb(0,212,170) 100%)" },
  Unranked:  { bg: "linear-gradient(to right, #21283b, #363d56)",                          textGrad: "linear-gradient(41deg, rgb(151,163,204) 23%, rgb(108,119,157) 76%)" },
  Caution:   { bg: "#350011",                                                               textSolid: "#d20344" },
};

const RepPill = ({ tier, rankLabel, id }: { tier: ReputationTier; rankLabel?: string; id: string }) => {
  const style = REP_BADGE_STYLE[tier];
  const showRank = rankLabel && rankLabel !== "—" && rankLabel !== "Unranked";
  return (
    <span
      className="inline-flex items-center gap-[2px] px-[6px] py-[2px] rounded-[40px] flex-shrink-0"
      style={{ background: style.bg }}
      data-testid={`badge-reputation-${id}`}
    >
      <span className="w-[16px] h-[16px] flex-shrink-0 flex items-center justify-center">
        <TierIcon tier={tier} />
      </span>
      {showRank && (
        <span
          className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] whitespace-nowrap"
          style={style.textGrad
            ? { backgroundImage: style.textGrad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
            : { color: style.textSolid }}
        >
          {rankLabel}
        </span>
      )}
    </span>
  );
};

const RankPill = ({ rankLabel, id }: { rankLabel: string; id: string }) => (
  <span
    className="inline-flex items-center gap-[2px] px-[6px] py-[2px] rounded-[40px] flex-shrink-0"
    style={{ background: RANK_BG }}
    data-testid={`badge-rank-${id}`}
  >
    <span className="w-[16px] h-[16px] flex-shrink-0 flex items-center justify-center">
      <DiamondIcon />
    </span>
    <span
      className="[font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] whitespace-nowrap"
      style={{ backgroundImage: RANK_TEXT_GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
    >
      {rankLabel}
    </span>
  </span>
);

const trendingAgentsRow1 = [
  { id: "alphaflow", name: "AlphaFlow", description: "Executes automated trading strategies across crypto markets, optimizing for volatility, momentum, and liquidity signals in real time.", avatarSrc: "/figmaAssets/avatars-3.svg", avatarType: "img" },
  { id: "yieldpilot", name: "Yield Pilot", description: "Manages capital allocation across DeFi protocols and yield strategies while maintaining risk-adjusted returns.", avatarSrc: "/figmaAssets/avatars-9.svg", avatarType: "img" },
  { id: "risksentinel", name: "Risk Sentinel", description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss.", avatarSrc: "/figmaAssets/base.png", avatarType: "bg" },
];

const trendingAgentsRow2 = [
  { id: "signalseer", name: "Signal Seer", description: "Aggregates news, social signals, and on-chain data to surface actionable insights.", avatarSrc: "/figmaAssets/avatars.svg", avatarType: "img" },
  { id: "trendradar", name: "TrendRadar", description: "Detects emerging trends across markets, social platforms, and ecosystems before they become mainstream.", avatarSrc: "/figmaAssets/avatars-5.svg", avatarType: "img" },
  { id: "taskforgepro", name: "TaskForge Pro", description: "Automates repetitive workflows across tools, APIs, and services.", avatarSrc: "/figmaAssets/avatars-6.svg", avatarType: "img" },
];

const newNoteworthyRow1 = [
  { id: "inboxzero", name: "InboxZero", description: "Manages email, filters priority messages, and drafts replies automatically.", avatarSrc: "/figmaAssets/avatars-2.svg", avatarType: "img" },
  { id: "opscommander", name: "Ops Commander", description: "Coordinates multi-step workflows across systems and APIs with real-time monitoring.", avatarSrc: "/figmaAssets/avatars-8.svg", avatarType: "img" },
  { id: "paystream", name: "Pay Stream", description: "Executes real-time payments for APIs and services using x402 protocols.", avatarSrc: "/figmaAssets/avatars-1.svg", avatarType: "img" },
];

const newNoteworthyRow2 = [
  { id: "invoicebot", name: "Invoice Bot", description: "Generates invoices, tracks payments, and automates billing workflows.", avatarSrc: "/figmaAssets/avatars-4.svg", avatarType: "img" },
  { id: "dealcloser", name: "Deal Closer", description: "Negotiates and executes transactions between agents using escrow and conditional payments.", avatarSrc: "/figmaAssets/pexels-fauxels-3184418.png", avatarType: "bg" },
  { id: "swarmalpha", name: "SwarmAlpha", description: "Coordinates multiple agents to execute complex strategies in parallel.", avatarSrc: "/figmaAssets/avatars-7.svg", avatarType: "img" },
];

const allAgents = [
  ...trendingAgentsRow1, ...trendingAgentsRow2,
  ...newNoteworthyRow1, ...newNoteworthyRow2,
];

type Agent = typeof allAgents[0];

const AgentItem = ({ id, name, description, avatarSrc, avatarType, onAdd }: Agent & { onAdd: (id: string) => void }) => {
  const { data: rep } = useQuery<{ tier: ReputationTier; rankLabel: string }>({
    queryKey: ["/api/agents", id, "reputation"],
    queryFn: () => fetch(`/api/agents/${id}/reputation`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div
      className="flex items-center gap-[8px] flex-1 self-stretch rounded-lg min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => onAdd(id)}
      data-testid={`item-agent-${id}`}
    >
      {avatarType === "img" ? (
        <img className="w-[48px] h-[48px] flex-shrink-0 rounded-[8px]" alt={name} src={avatarSrc} />
      ) : (
        <div className="bg-cover bg-[50%_50%] w-[48px] h-[48px] flex-shrink-0 rounded-[8px]" style={{ backgroundImage: `url(${avatarSrc})` }} />
      )}
      <div className="flex flex-col items-start justify-center flex-1 min-w-0 gap-[4px]">
        <div className="flex items-center gap-[4px] flex-wrap">
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[14px] leading-[20px] whitespace-nowrap">
            {name}
          </span>
          {rep && (
            <RepPill tier={rep.tier} rankLabel={rep.rankLabel} id={id} />
          )}
        </div>
        <div className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[11px] leading-[14px] w-full line-clamp-2">
          {description}
        </div>
      </div>
      <div
        className="relative w-6 h-6 bg-brain-v1dark-orange rounded-[100px] flex-shrink-0"
        title={`View ${name}`}
      >
        <img className="absolute top-1 left-1 w-4 h-4" alt="Add" src="/figmaAssets/icons.svg" />
      </div>
    </div>
  );
};

const AgentRow = ({ agents, onAdd }: { agents: Agent[]; onAdd: (id: string) => void }) => (
  <div className="flex items-start gap-4 w-full">
    {agents.map((agent, index) => (
      <div key={agent.id} className="flex items-start gap-4 flex-1 self-stretch min-w-0">
        <AgentItem {...agent} avatarType={agent.avatarType as "img" | "bg"} onAdd={onAdd} />
        {index < agents.length - 1 && (
          <img className="self-stretch w-px flex-shrink-0" alt="Divider" src="/figmaAssets/vector-944.svg" />
        )}
      </div>
    ))}
  </div>
);

const AgentSection = ({ title, row1, row2, onAdd }: { title: string; row1: Agent[]; row2: Agent[]; onAdd: (id: string) => void }) => (
  <div className="flex flex-col items-start gap-4 w-full">
    <div className="flex items-start justify-between w-full">
      <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-xl tracking-[0] leading-6 whitespace-nowrap">
        {title}
      </span>
      <button className="inline-flex items-center justify-center gap-0.5 px-2.5 py-1 bg-brain-v1baby-blue-15 rounded-[100px] cursor-pointer">
        <span className="[font-family:'Gilroy',sans-serif] text-brain-v1baby-blue-100 text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">See All</span>
        <img className="w-4 h-4" alt="Arrow" src="/figmaAssets/icons-1.svg" />
      </button>
    </div>
    <div className="flex flex-col items-start gap-4 w-full">
      <AgentRow agents={row1} onAdd={onAdd} />
      <img className="w-full" alt="Divider" src="/figmaAssets/frame-2131330021.svg" />
      <AgentRow agents={row2} onAdd={onAdd} />
    </div>
  </div>
);

export const MainContentSection = (): JSX.Element => {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleAdd = (id: string) => navigate(`/agent/${id}`);

  const filtered = search.trim()
    ? allAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const handleSearchToggle = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearch("");
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#11141b] rounded-[16px] overflow-hidden border border-solid border-[#1d2132]">
      {/* Top bar: search expands from the right */}
      <div className="flex items-center px-4 pt-4 pb-0 gap-3">
        {/* Expandable search — grows to fill space when open */}
        {searchOpen && (
          <div className="flex-1 flex items-center gap-2 bg-[#0a0c10] border border-[#1d2131] rounded-full px-3 py-2 focus-within:border-[#414965] transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
              <circle cx="6" cy="6" r="4.5" stroke="#414965" strokeWidth="1.2" />
              <path d="M10 10L13 13" stroke="#414965" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'Gilroy',sans-serif] placeholder-brain-v1baby-blue-30 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-brain-v1baby-blue-30 hover:text-brain-v1white transition-colors flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Search toggle button — always on the right */}
        <button
          onClick={handleSearchToggle}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ml-auto ${
            searchOpen
              ? "bg-brain-v1dark-orange text-white"
              : "bg-[#0a0c10] text-[#6c779d] hover:text-brain-v1white"
          }`}
        >
          {searchOpen ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Main scrollable content */}
      <ScrollArea className="w-full flex-1">
        <div className="flex flex-col items-start gap-8 px-4 pt-4 pb-6">

          {/* Search results */}
          {filtered !== null ? (
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-xl">
                  Results <span className="text-brain-v1baby-blue-30 text-base">({filtered.length})</span>
                </span>
              </div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <span className="text-3xl">🔍</span>
                  <span className="text-sm text-brain-v1baby-blue-30 [font-family:'Gilroy',sans-serif]">
                    No agents found for "{search}"
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filtered.map((agent) => (
                    <div key={agent.id} className="flex items-center gap-3 p-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] hover:border-[#414965] transition-colors cursor-pointer">
                      <AgentItem {...agent} avatarType={agent.avatarType as "img" | "bg"} onAdd={handleAdd} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Featured Carousel */}
              <FeaturedCarousel />

              {/* Separator — 1px line, same style as Launchpad */}
              <div className="w-full flex-shrink-0" style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

              <AgentSection title="Trending Agents" row1={trendingAgentsRow1} row2={trendingAgentsRow2} onAdd={handleAdd} />
              <AgentSection title="New and Noteworthy" row1={newNoteworthyRow1} row2={newNoteworthyRow2} onAdd={handleAdd} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
