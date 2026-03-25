import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const assetsData = [
  { icon: "/figmaAssets/crypto-icons.svg", name: "Ethereum", ticker: "ETH", value: "$2,500", amount: "1.245", category: "crypto" },
  { icon: "/figmaAssets/crypto-icons-3.svg", name: "Dollar", ticker: "USD", value: "$10,000", amount: "10,000", category: "cash" },
  { icon: "/figmaAssets/crypto-icons-1.svg", name: "Polygon", ticker: "MATIC", value: "$16,832.85", amount: "295.23", category: "crypto" },
  { icon: "/figmaAssets/crypto-icons-2.svg", name: "Binance", ticker: "BNB", value: "$2,500", amount: "1.245", category: "crypto" },
];

const transactionsData = [
  { id: "1", type: "withdrawal", label: "Sent 240 USDC", time: "8:49pm", date: "20 Sat", amount: "-$240", positive: false },
  { id: "2", type: "deposit", label: "Deposited 1,000 USDT", time: "3:51pm", date: "18 Thur", amount: "+$1,000", positive: true },
  { id: "3", type: "withdrawal", label: "Withdrawal 514 USDT", time: "2:33pm", date: "18 Thur", amount: "-$514.45", positive: false },
  { id: "4", type: "trade", label: "Bought 0.45 ETH", time: "11:20am", date: "17 Wed", amount: "-$898.10", positive: false },
  { id: "5", type: "deposit", label: "Deposited 5,000 AED", time: "9:00am", date: "16 Tue", amount: "+$5,000", positive: true },
  { id: "6", type: "trade", label: "Sold 100 MATIC", time: "4:15pm", date: "15 Mon", amount: "+$57.80", positive: true },
  { id: "7", type: "withdrawal", label: "Sent 0.2 BNB", time: "1:02pm", date: "13 Sat", amount: "-$52.00", positive: false },
  { id: "8", type: "deposit", label: "Deposited 2,500 USDC", time: "10:30am", date: "10 Wed", amount: "+$2,500", positive: true },
];

const cardActions = [
  { icon: "/figmaAssets/icons-4.svg", label: "Add" },
  { icon: "/figmaAssets/icons-14.svg", label: "Send" },
  { icon: "/figmaAssets/icons-9.svg", label: "Exchange" },
];

const filterTabs = ["All", "Cash", "Crypto"];
const txFilterTabs = ["All", "Trades", "Deposits", "Withdrawals"];
const mainTabs = ["Assets", "Transactions"];

const agentAccounts = [
  { id: "1", name: "AlphaFlow", ticker: "$ALPHA", icon: "⚡", type: "Trading" },
  { id: "2", name: "SwarmAlpha", ticker: "$SWRM", icon: "🤖", type: "Analytics" },
  { id: "3", name: "Risk Sentinel", ticker: "$RSKX", icon: "🛡", type: "Risk" },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onCreateAgent: () => void;
  onSend?: () => void;
}

export const AccountOverviewSection = ({ collapsed, onToggle, onCreateAgent, onSend }: Props): JSX.Element => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [activeTab, setActiveTab] = useState("Assets");
  const [transactionFilter, setTransactionFilter] = useState("All");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  if (collapsed) {
    return (
      <div className="flex items-start gap-0 flex-shrink-0">
        {/* Separate expand button tab — sits outside the panel on the left */}
        <button
          onClick={onToggle}
          title="Expand account panel"
          className="self-center w-6 h-14 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-l-xl hover:bg-brain-v1baby-blue-30 transition-colors border border-r-0 border-[#1d2131]"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M7 1L3 5L7 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex flex-col items-center gap-3 w-[52px] rounded-3xl border border-solid border-[#1d2131] bg-shared-colorsbaby-blue-5 flex-shrink-0 py-3">
          <img className="w-7 h-7 opacity-50" alt="Wallet" src="/figmaAssets/wallet-icons-1.svg" />
          <div className="flex flex-col items-center gap-2 mt-auto">
            <div className="w-6 h-6 bg-brain-v1dark-orange rounded-full opacity-60" />
            <div className="w-6 h-6 bg-brain-v1dark-green rounded-full opacity-60" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-0 flex-shrink-0">
      {/* Separate collapse button tab — sits outside the panel on the left */}
      <button
        onClick={onToggle}
        title="Collapse account panel"
        className="self-center w-6 h-14 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-l-xl hover:bg-brain-v1baby-blue-30 transition-colors border border-r-0 border-[#1d2131]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3 1L7 5L3 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Main panel */}
      <div className="flex flex-col gap-4 rounded-3xl border border-solid border-[#1d2131] bg-shared-colorsbaby-blue-5 w-[386px]">
        {/* Header bar */}
        <div className="flex mx-2 mt-2 h-12 items-center gap-2 p-2 bg-brain-v1baby-blue-15 rounded-2xl">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img className="w-8 h-8 flex-shrink-0" alt="Wallet icons" src="/figmaAssets/wallet-icons-1.svg" />
            <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base tracking-[0] leading-5 whitespace-nowrap truncate">
              {activeAccount
                ? agentAccounts.find((a) => a.id === activeAccount)?.name ?? "Your Account"
                : "Your Account"}
            </span>
          </div>

          {/* Dropdown trigger */}
          <div className="relative flex-shrink-0" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              title="Account options"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-colors ${
                dropdownOpen
                  ? "bg-brain-v1baby-blue-30 border-[#414965]"
                  : "bg-brain-v1baby-blue-15 border-[#1d2131] hover:border-[#414965] hover:bg-brain-v1baby-blue-30"
              }`}
            >
              <img className="w-4 h-4" alt="Options" src="/figmaAssets/icons-15.svg" />
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                className={`transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
              >
                <path d="M2 3.5L5 6.5L8 3.5" stroke="#8899bb" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-[240px] z-50 bg-[#11141b] border border-[#1d2131] rounded-2xl shadow-2xl overflow-hidden">
                {/* Create New Agent option */}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onCreateAgent();
                  }}
                  className="flex items-center gap-3 px-4 py-3 w-full hover:bg-brain-v1baby-blue-15 transition-colors border-b border-[#1d2131]"
                >
                  <div className="w-8 h-8 bg-brain-v1dark-orange rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2V12M2 7H12" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">Create Agent</div>
                    <div className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-30 text-xs">Launch a new AI agent</div>
                  </div>
                </button>

                {/* Switch accounts section */}
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 uppercase tracking-wider">
                    Switch Account
                  </span>
                </div>

                {/* Personal account */}
                <button
                  onClick={() => {
                    setActiveAccount(null);
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 w-full transition-colors ${
                    activeAccount === null ? "bg-brain-v1baby-blue-15" : "hover:bg-brain-v1baby-blue-15"
                  }`}
                >
                  <img className="w-8 h-8 flex-shrink-0" alt="Wallet" src="/figmaAssets/wallet-icons-1.svg" />
                  <div className="text-left flex-1 min-w-0">
                    <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">Your Account</div>
                    <div className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-xs">Debit · 1652 ···· 6995</div>
                  </div>
                  {activeAccount === null && (
                    <div className="w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </button>

                {/* Agent accounts */}
                {agentAccounts.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setActiveAccount(agent.id);
                      setDropdownOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-2.5 w-full transition-colors ${
                      activeAccount === agent.id ? "bg-brain-v1baby-blue-15" : "hover:bg-brain-v1baby-blue-15"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-brain-v1headerfooterbg flex items-center justify-center text-base flex-shrink-0">
                      {agent.icon}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm truncate">{agent.name}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-xs">{agent.ticker}</span>
                        <span className="text-[9px] px-1 py-0.5 bg-brain-v1baby-blue-15 rounded text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{agent.type}</span>
                      </div>
                    </div>
                    {activeAccount === agent.id && (
                      <div className="w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Card + Actions section */}
        <div className="h-[290px] w-[370px] self-center relative flex-shrink-0">
          <div className="absolute top-[152px] left-0 w-[370px] h-[138px] flex bg-brain-v1headerfooterbg rounded-2xl">
            <div className="flex mt-16 w-[338px] h-[58px] ml-4 items-center gap-2">
              {cardActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.label === "Send" ? onSend : undefined}
                  className="flex flex-col items-center justify-center gap-1 flex-1 cursor-pointer group"
                >
                  <div className="relative w-10 h-10 bg-brain-v1dark-orange rounded-[100px] flex items-center justify-center group-hover:opacity-80 transition-opacity">
                    <img className="w-6 h-6" alt={action.label} src={action.icon} />
                  </div>
                  <span className="self-stretch [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 group-hover:text-brain-v1white text-xs text-center tracking-[0] leading-[14px] transition-colors">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-brain-v1dark-orange rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(255,149,0,0.42)_0%,rgba(255,149,0,0)_36%,rgba(255,149,0,0.06)_67%,rgba(255,149,0,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
            <div className="absolute top-[-110px] left-[68px] w-[451px] h-[246px] bg-brain-v1light-orange rounded-[225.41px/123.04px] rotate-[-52.17deg] blur-[37px] opacity-60" />
            <div className="flex w-[338px] items-center justify-center gap-4 absolute top-4 left-4">
              <img className="w-12 h-12" alt="Wallet icons" src="/figmaAssets/wallet-icons.svg" />
              <div className="flex items-center gap-2 flex-1">
                <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1white text-[32px] text-center tracking-[0] leading-8 whitespace-nowrap">
                  865,040.30
                </span>
                <div className="inline-flex items-start px-1.5 py-0.5 bg-brain-v1white-30 rounded-[100px]">
                  <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xs tracking-[0] leading-3 whitespace-nowrap">
                    AED
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs tracking-[0] leading-3 whitespace-nowrap">
                Debit Card
              </span>
              <div className="flex items-start gap-2 self-stretch w-full">
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl tracking-[0] leading-6 whitespace-nowrap">
                  1652 0400 3201 6995
                </span>
                <img className="w-6 h-6" alt="Icons" src="/figmaAssets/icons-8.svg" />
              </div>
            </div>
            <div className="absolute top-[136px] left-4 w-[338px] h-8 flex">
              <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap tracking-[0]">Name</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm tracking-[0] leading-4">Adam Jones</span>
              </div>
              <div className="inline-flex w-11 h-8 ml-[50px] flex-col items-start gap-1">
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs tracking-[0] leading-3 whitespace-nowrap">Expiry</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm tracking-[0] leading-4">12/24</span>
              </div>
              <div className="inline-flex w-[26px] h-8 ml-10 flex-col items-start gap-1">
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs tracking-[0] leading-3 whitespace-nowrap">CVC</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm tracking-[0] leading-4">592</span>
              </div>
              <div className="h-[26px] w-[42px] self-center relative ml-[52px]">
                <div className="absolute top-0 left-4 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
                <div className="absolute top-0 left-0 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
              </div>
            </div>
            <img className="absolute top-[182px] left-[172px] w-[26px] h-1.5" alt="Frame" src="/figmaAssets/frame-2131329948.svg" />
          </div>
        </div>

        {/* Assets / Transactions section */}
        <ScrollArea className="flex-1">
          <div className="flex mx-2 flex-col items-start gap-4 w-[370px] pb-4">
            <div className="flex flex-col items-start gap-2 self-stretch w-full">
              {/* Main tab switcher */}
              <div className="flex items-start gap-[17px] self-stretch w-full">
                {mainTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-2xl tracking-[0] leading-7 whitespace-nowrap bg-transparent border-none p-0 cursor-pointer ${
                      activeTab === tab ? "text-brain-v1baby-blue-100" : "text-brain-v1baby-blue-30"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Sub-filter tabs */}
              {activeTab === "Assets" ? (
                <div className="flex w-[370px] items-center gap-0.5 p-0.5 bg-brain-v1headerfooterbg rounded-[400px] overflow-hidden">
                  {filterTabs.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`flex items-center justify-center px-4 py-2 flex-1 rounded-[100px] border-none cursor-pointer transition-colors ${
                        activeFilter === filter ? "bg-brain-v1dark-green" : "bg-brain-v1headerfooterbg"
                      }`}
                    >
                      <span className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm whitespace-nowrap ${
                        activeFilter === filter ? "text-brain-v1green" : "text-brain-v1baby-blue-30"
                      }`}>
                        {filter}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex w-[370px] items-center gap-0.5 p-0.5 bg-brain-v1headerfooterbg rounded-[400px] overflow-hidden">
                  {txFilterTabs.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTransactionFilter(filter)}
                      className={`flex items-center justify-center px-3 py-2 flex-1 rounded-[100px] border-none cursor-pointer transition-colors ${
                        transactionFilter === filter ? "bg-[#123509]" : "bg-brain-v1headerfooterbg"
                      }`}
                    >
                      <span className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm whitespace-nowrap ${
                        transactionFilter === filter ? "text-brain-v1green" : "text-brain-v1baby-blue-30"
                      }`}>
                        {filter}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assets list */}
            {activeTab === "Assets" && (() => {
              const filtered = assetsData.filter(a =>
                activeFilter === "Cash" ? a.category === "cash" :
                activeFilter === "Crypto" ? a.category === "crypto" : true
              );
              return (
                <div className="flex flex-col items-start gap-4 self-stretch w-full">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 w-full gap-2 text-brain-v1baby-blue-30">
                      <span className="text-2xl">💼</span>
                      <span className="text-xs [font-family:'Gilroy-Medium',Helvetica]">No {activeFilter.toLowerCase()} assets</span>
                    </div>
                  ) : filtered.map((asset, index) => (
                    <div key={`${asset.ticker}-${index}`} className="flex flex-col self-stretch w-full gap-4">
                      <div className="flex items-center gap-2 self-stretch w-full">
                        <img className="w-10 h-10 flex-shrink-0" alt={`${asset.name} icon`} src={asset.icon} />
                        <div className="flex items-center justify-center gap-2 flex-1">
                          <div className="inline-flex flex-col items-start gap-1 flex-shrink-0">
                            <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base tracking-[0] leading-5 whitespace-nowrap">
                              {asset.name}
                            </span>
                            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4 whitespace-nowrap tracking-[0]">
                              {asset.ticker}
                            </span>
                          </div>
                          <div className="flex flex-col items-start justify-center gap-1 flex-1">
                            <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1green text-base text-right leading-5 tracking-[0]">
                              {asset.value}
                            </span>
                            <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1baby-blue-30 text-sm text-right tracking-[0] leading-4">
                              {asset.amount}
                            </span>
                          </div>
                        </div>
                      </div>
                      {index < filtered.length - 1 && (
                        <img className="self-stretch w-full h-px" alt="divider" src="/figmaAssets/vector-933.svg" />
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Transactions list */}
            {activeTab === "Transactions" && (() => {
              const filtered = transactionsData.filter(t =>
                transactionFilter === "Trades" ? t.type === "trade" :
                transactionFilter === "Deposits" ? t.type === "deposit" :
                transactionFilter === "Withdrawals" ? t.type === "withdrawal" : true
              );
              return (
                <div className="flex flex-col items-start self-stretch w-full">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 w-full gap-2 text-brain-v1baby-blue-30">
                      <span className="text-2xl">📋</span>
                      <span className="text-xs [font-family:'Gilroy-Medium',Helvetica]">No {transactionFilter.toLowerCase()} found</span>
                    </div>
                  ) : filtered.map((tx, index) => (
                    <div key={tx.id} className="flex flex-col self-stretch w-full">
                      <div className="flex items-center gap-2 self-stretch w-full py-4">
                        {/* Transaction icon */}
                        <div className="w-10 h-10 bg-[#0a0c10] rounded-full flex items-center justify-center flex-shrink-0">
                          {tx.type === "deposit" ? (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <path d="M15 5L5 15M5 15H13M5 15V7" stroke={tx.positive ? "#42bf23" : "#d20344"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : tx.type === "withdrawal" ? (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <path d="M5 15L15 5M15 5H7M15 5V13" stroke="#d20344" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <path d="M4 8H16M4 8L7 5M4 8L7 11M16 12H4M16 12L13 9M16 12L13 15" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        {/* Label + time */}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base leading-5 whitespace-nowrap">
                              {tx.label}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4">
                                {tx.time}
                              </span>
                              <div className="w-1 h-1 bg-brain-v1baby-blue-30 rounded-full flex-shrink-0" />
                              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4">
                                {tx.date}
                              </span>
                            </div>
                          </div>
                          {/* Amount */}
                          <span className={`flex-1 [font-family:'JetBrains_Mono',Helvetica] font-medium text-xl text-right leading-5 ${tx.positive ? "text-brain-v1green" : "text-brain-v1pink-red"}`}>
                            {tx.amount}
                          </span>
                        </div>
                      </div>
                      {index < filtered.length - 1 && (
                        <img className="self-stretch w-full h-px" alt="divider" src="/figmaAssets/vector-933.svg" />
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
