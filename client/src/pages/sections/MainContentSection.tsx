import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

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

const AgentItem = ({ name, description, avatarSrc, avatarType }: Agent) => (
  <div className="flex items-center gap-2 flex-1 self-stretch rounded-lg min-w-0">
    {avatarType === "img" ? (
      <img className="w-12 h-12 flex-shrink-0" alt={name} src={avatarSrc} />
    ) : (
      <div className="bg-cover bg-[50%_50%] w-12 h-12 flex-shrink-0 rounded-full" style={{ backgroundImage: `url(${avatarSrc})` }} />
    )}
    <div className="flex flex-col items-start justify-center flex-1 min-w-0">
      <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm tracking-[0] leading-5 whitespace-nowrap">
        {name}
      </div>
      <div className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-60 text-[11px] tracking-[0] leading-[14px] w-full line-clamp-2">
        {description}
      </div>
    </div>
    <div className="relative w-6 h-6 bg-brain-v1dark-orange rounded-[100px] flex-shrink-0">
      <img className="absolute top-1 left-1 w-4 h-4" alt="Add" src="/figmaAssets/icons.svg" />
    </div>
  </div>
);

const AgentRow = ({ agents }: { agents: Agent[] }) => (
  <div className="flex items-start gap-4 w-full">
    {agents.map((agent, index) => (
      <div key={agent.id} className="flex items-start gap-4 flex-1 self-stretch min-w-0">
        <AgentItem {...agent} avatarType={agent.avatarType as "img" | "bg"} />
        {index < agents.length - 1 && (
          <img className="self-stretch w-px flex-shrink-0" alt="Divider" src="/figmaAssets/vector-944.svg" />
        )}
      </div>
    ))}
  </div>
);

const AgentSection = ({ title, row1, row2 }: { title: string; row1: Agent[]; row2: Agent[] }) => (
  <div className="flex flex-col items-start gap-4 w-full">
    <div className="flex items-start justify-between w-full">
      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xl tracking-[0] leading-6 whitespace-nowrap">
        {title}
      </span>
      <button className="inline-flex items-center justify-center gap-0.5 px-2.5 py-1 bg-brain-v1baby-blue-15 rounded-[100px] cursor-pointer">
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-100 text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">See All</span>
        <img className="w-4 h-4" alt="Arrow" src="/figmaAssets/icons-1.svg" />
      </button>
    </div>
    <div className="flex flex-col items-start gap-4 w-full">
      <AgentRow agents={row1} />
      <img className="w-full" alt="Divider" src="/figmaAssets/frame-2131330021.svg" />
      <AgentRow agents={row2} />
    </div>
  </div>
);

export const MainContentSection = (): JSX.Element => {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? allAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  return (
    <div className="relative w-full bg-shared-colorsbaby-blue-5 rounded-3xl overflow-hidden border border-solid border-[#1d2131]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0 gap-3">
        <div className="flex-1 flex items-center gap-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl px-3 py-2 focus-within:border-[#414965] transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
            <circle cx="6" cy="6" r="4.5" stroke="#414965" strokeWidth="1.2" />
            <path d="M10 10L13 13" stroke="#414965" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-brain-v1baby-blue-30 hover:text-brain-v1white transition-colors">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <div className="w-8 h-8 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-[100px] flex-shrink-0">
          <img className="w-4 h-4" alt="Icons" src="/figmaAssets/icons-19.svg" />
        </div>
      </div>

      {/* Main scrollable content */}
      <ScrollArea className="w-full">
        <div className="flex flex-col items-start gap-8 px-4 pt-4 pb-6">

          {/* Search results */}
          {filtered !== null ? (
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xl">
                  Results <span className="text-brain-v1baby-blue-30 text-base">({filtered.length})</span>
                </span>
              </div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <span className="text-3xl">🔍</span>
                  <span className="text-sm text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                    No agents found for "{search}"
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filtered.map((agent) => (
                    <div key={agent.id} className="flex items-center gap-3 p-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] hover:border-[#414965] transition-colors cursor-pointer">
                      <AgentItem {...agent} avatarType={agent.avatarType as "img" | "bg"} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Featured Banner */}
              <div className="relative w-full h-[200px] bg-brain-v1dark-dark-purple rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-0.5 before:rounded-2xl before:[background:linear-gradient(119deg,rgba(118,49,238,0.42)_0%,rgba(118,49,238,0)_36%,rgba(118,49,238,0.06)_67%,rgba(118,49,238,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
                <div className="absolute top-[-94px] left-[433px] w-[621px] h-[339px] bg-brain-v1purple rounded-[310.64px/169.56px] rotate-[-30deg] blur-[50px] opacity-40" />
                <div className="absolute top-[120px] left-[555px] w-[425px] h-[232px] bg-brain-v1pink-red rounded-[212.74px/116.12px] blur-[97.95px] opacity-20" />
                <div className="absolute top-[-123px] left-[-257px] w-[469px] h-64 bg-brain-v1purple rounded-[234.29px/127.89px] rotate-[-165deg] blur-[105px] opacity-30" />
                <img className="absolute w-[15.43%] top-[calc(50.00%_-_77px)] left-[65.87%] h-[177px]" alt="Vector" src="/figmaAssets/vector.svg" />
                <div className="flex flex-col w-[336px] items-start absolute top-[calc(50.00%_-_48px)] left-10">
                  <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1purple text-sm tracking-[0] leading-4">FEATURED</div>
                  <div className="flex flex-col items-start w-full">
                    <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-[32px] tracking-[0] leading-10 w-full">Momentum Trader</div>
                    <div className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1purple text-base tracking-[0] leading-5 w-full">
                      A smart assistant designed to analyze market trends and execute trades on your behalf.
                    </div>
                  </div>
                </div>
                <img className="absolute top-[182px] left-[calc(50.00%_-_13px)] w-[26px] h-1.5" alt="Frame" src="/figmaAssets/frame-2131329948.svg" />
              </div>

              <img className="w-full h-px" alt="Divider" src="/figmaAssets/vector-933.svg" />

              <AgentSection title="Trending Agents" row1={trendingAgentsRow1} row2={trendingAgentsRow2} />
              <AgentSection title="New and Noteworthy" row1={newNoteworthyRow1} row2={newNoteworthyRow2} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
