import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddAccountModal } from "@/components/AddAccountModal";

/* ─── Contextual data per card ─── */
const walletData = {
  assets: [
    { icon: "/figmaAssets/crypto-icons.svg",   name: "Ethereum", ticker: "ETH",  value: "$2,500.00",   amount: "1.245",   category: "crypto" },
    { icon: "/figmaAssets/crypto-icons-1.svg",  name: "Polygon",  ticker: "MATIC",value: "$16,832.85",  amount: "295.23",  category: "crypto" },
    { icon: "/figmaAssets/crypto-icons-2.svg",  name: "Binance",  ticker: "BNB",  value: "$2,500.00",   amount: "1.245",   category: "crypto" },
  ],
  transactions: [
    { id: "w1", type: "trade",      label: "Bought 0.45 ETH",       time: "11:20am", date: "17 Wed", amount: "-$898.10", positive: false },
    { id: "w2", type: "deposit",    label: "Received 1.2 ETH",      time: "9:05am",  date: "15 Mon", amount: "+$2,400",  positive: true  },
    { id: "w3", type: "trade",      label: "Sold 100 MATIC",        time: "4:15pm",  date: "13 Sat", amount: "+$57.80",  positive: true  },
    { id: "w4", type: "withdrawal", label: "Sent 0.2 BNB",          time: "1:02pm",  date: "11 Thu", amount: "-$52.00",  positive: false },
    { id: "w5", type: "deposit",    label: "Received 0.05 BTC",     time: "8:30am",  date: "9 Tue",  amount: "+$2,100",  positive: true  },
  ],
};

const debitData = {
  assets: [
    { icon: "/figmaAssets/crypto-icons-3.svg", name: "Dollar",  ticker: "USD", value: "$10,000.00",    amount: "10,000",  category: "cash"   },
    { icon: "/figmaAssets/crypto-icons-3.svg", name: "Dirham",  ticker: "AED", value: "AED 865,040.30",amount: "865,040", category: "cash"   },
  ],
  transactions: [
    { id: "d1", type: "withdrawal", label: "POS Purchase – Noon",    time: "3:20pm",  date: "20 Sat", amount: "-$149.00", positive: false },
    { id: "d2", type: "deposit",    label: "Salary Credit",          time: "9:00am",  date: "18 Thur",amount: "+$4,200",  positive: true  },
    { id: "d3", type: "withdrawal", label: "Grocery – Carrefour",    time: "6:45pm",  date: "17 Wed", amount: "-$86.30",  positive: false },
    { id: "d4", type: "withdrawal", label: "Uber Ride",              time: "2:12pm",  date: "15 Mon", amount: "-$12.50",  positive: false },
    { id: "d5", type: "deposit",    label: "ATM Top-Up",             time: "11:00am", date: "12 Fri", amount: "+$500.00", positive: true  },
  ],
};

const bankData = {
  assets: [
    { icon: "/figmaAssets/crypto-icons-3.svg", name: "Dollar",  ticker: "USD", value: "$2,040.30",     amount: "2,040.30",category: "cash" },
    { icon: "/figmaAssets/crypto-icons-3.svg", name: "Euro",    ticker: "EUR", value: "€1,850.00",     amount: "1,850",   category: "cash" },
  ],
  transactions: [
    { id: "b1", type: "deposit",    label: "Wire Transfer In",       time: "8:49pm",  date: "20 Sat", amount: "+$5,000",  positive: true  },
    { id: "b2", type: "withdrawal", label: "SEPA Transfer Out",      time: "3:51pm",  date: "18 Thur",amount: "-$1,200",  positive: false },
    { id: "b3", type: "deposit",    label: "Dividend Payment",       time: "10:00am", date: "16 Tue", amount: "+$320.00", positive: true  },
    { id: "b4", type: "withdrawal", label: "Rent Transfer",          time: "9:00am",  date: "14 Sun", amount: "-$2,400",  positive: false },
    { id: "b5", type: "deposit",    label: "Freelance Payment",      time: "4:30pm",  date: "10 Wed", amount: "+$800.00", positive: true  },
  ],
};

const CARDS = [
  { id: "wallet", label: "Wallet",  data: walletData  },
  { id: "debit",  label: "Debit",   data: debitData   },
  { id: "bank",   label: "Bank",    data: bankData    },
];

// filterTabs and txFilterTabs are derived per-card inside the component
const mainTabs     = ["Assets", "Transactions"];

const cardActions = [
  { icon: "/figmaAssets/icons-4.svg",  label: "Add"      },
  { icon: "/figmaAssets/icons-14.svg", label: "Send"     },
  { icon: "/figmaAssets/icons-9.svg",  label: "Exchange" },
];

const agentAccounts = [
  { id: "1", name: "AlphaFlow",     ticker: "$ALPHA", icon: "⚡", type: "Trading"   },
  { id: "2", name: "SwarmAlpha",    ticker: "$SWRM",  icon: "🤖", type: "Analytics" },
  { id: "3", name: "Risk Sentinel", ticker: "$RSKX",  icon: "🛡",  type: "Risk"      },
];

/* ─── Card sub-components ─── */

/* Glow blobs */
const OrangeGlow = () => (
  <div className="absolute top-[-110px] left-[68px] w-[451px] h-[246px] bg-brain-v1light-orange rounded-[225.41px/123.04px] rotate-[-52.17deg] blur-[37px] opacity-60 pointer-events-none" />
);
const GreenGlow = () => (
  <div className="absolute top-[-110px] left-[68px] w-[451px] h-[246px] bg-brain-v1green rounded-[225.41px/123.04px] rotate-[-52.17deg] blur-[37px] opacity-40 pointer-events-none" />
);

/* Card header — swappable icon */
const CardHeader = ({
  balance, currency, icon,
}: { balance: string; currency: string; icon: "wallet" | "agent" }) => (
  <div className="flex w-[338px] items-center justify-center gap-4 absolute top-4 left-4">
    {icon === "agent" ? (
      /* Green rounded square with robot icon */
      <div className="w-12 h-12 rounded-2xl bg-brain-v1dark-green flex items-center justify-center flex-shrink-0">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="8" y="12" width="12" height="10" rx="2" stroke="#42bf23" strokeWidth="1.5"/>
          <circle cx="11" cy="16" r="1.5" fill="#42bf23"/>
          <circle cx="17" cy="16" r="1.5" fill="#42bf23"/>
          <path d="M14 8V12M12 8H16" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M8 18H6M22 18H20M11 22V24M17 22V24" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    ) : (
      <img className="w-12 h-12" alt="Wallet" src="/figmaAssets/wallet-icons.svg" />
    )}
    <div className="flex items-center gap-2 flex-1">
      <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1white text-[32px] text-center leading-8 whitespace-nowrap">
        {balance}
      </span>
      <div className="inline-flex items-start px-1.5 py-0.5 bg-brain-v1white-30 rounded-[100px]">
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xs leading-3 whitespace-nowrap">
          {currency}
        </span>
      </div>
    </div>
  </div>
);

const CopyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
    <rect x="7" y="7" width="10" height="10" rx="2" stroke="white" strokeWidth="1.4" />
    <path d="M4 13V4a1 1 0 011-1h9" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/* ── Personal account cards (orange theme) ── */

const WalletAddressCard = () => (
  <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#4a2300] rounded-2xl overflow-hidden border border-[rgba(255,149,0,0.7)] shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026]">
    <OrangeGlow />
    <CardHeader balance="$2,040.30" currency="USD" icon="wallet" />
    <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
      <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">Wallet Address</span>
      <div className="flex items-center gap-2 self-stretch">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl leading-6 whitespace-nowrap">0x7cB5.....486A8</span>
        <CopyIcon />
      </div>
    </div>
    <div className="absolute top-[136px] left-4 w-[338px] h-8 flex items-start">
      <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Name</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">Adam Jones</span>
      </div>
    </div>
  </div>
);

const DebitCardView = () => (
  <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-brain-v1dark-orange rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(255,149,0,0.42)_0%,rgba(255,149,0,0)_36%,rgba(255,149,0,0.06)_67%,rgba(255,149,0,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
    <OrangeGlow />
    <CardHeader balance="865,040.30" currency="AED" icon="wallet" />
    <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
      <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">Debit Card</span>
      <div className="flex items-start gap-2 self-stretch">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl leading-6 whitespace-nowrap">1652 0400 3201 6995</span>
        <img className="w-6 h-6" alt="Icons" src="/figmaAssets/icons-8.svg" />
      </div>
    </div>
    <div className="absolute top-[136px] left-4 w-[338px] h-8 flex">
      <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Name</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">Adam Jones</span>
      </div>
      <div className="inline-flex w-11 h-8 ml-[50px] flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Expiry</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">12/24</span>
      </div>
      <div className="inline-flex w-[26px] h-8 ml-10 flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">CVC</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">592</span>
      </div>
      <div className="h-[26px] w-[42px] self-center relative ml-[52px]">
        <div className="absolute top-0 left-4 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
        <div className="absolute top-0 left-0 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
      </div>
    </div>
  </div>
);

const BankAccountCard = () => (
  <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#4a2300] rounded-2xl overflow-hidden border border-[rgba(255,149,0,0.7)] shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026]">
    <OrangeGlow />
    <CardHeader balance="$2,040.30" currency="USD" icon="wallet" />
    <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
      <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">IBAN Account Number</span>
      <div className="flex items-center gap-2 self-stretch">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-[15px] leading-6 whitespace-nowrap tracking-tight">AE070331234567890123456</span>
        <CopyIcon />
      </div>
    </div>
    <div className="absolute top-[136px] left-4 w-[338px] h-8 flex items-start">
      <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Name</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">Adam Jones</span>
      </div>
    </div>
  </div>
);

/* ── AI Agent cards (green theme) ── */

const AgentWalletCard = ({ agentName }: { agentName: string }) => (
  <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#123509] rounded-2xl overflow-hidden border border-[rgba(66,191,35,0.7)] shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026]">
    <GreenGlow />
    <CardHeader balance="$2,040.30" currency="USD" icon="agent" />
    <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
      <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-[#42bf23] text-xs leading-3 whitespace-nowrap">Wallet Address</span>
      <div className="flex items-center gap-2 self-stretch">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl leading-6 whitespace-nowrap">0x7cB5.....486A8</span>
        <CopyIcon />
      </div>
    </div>
    <div className="absolute top-[136px] left-4 w-[338px] h-8 flex items-start gap-[84px]">
      <div className="inline-flex flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-[#42bf23] text-xs leading-3">Name</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">{agentName}</span>
      </div>
      <div className="inline-flex flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-[#42bf23] text-xs leading-3">Status</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">Active</span>
      </div>
    </div>
  </div>
);

const AgentDebitCard = ({ agentName }: { agentName: string }) => (
  <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#123509] rounded-2xl overflow-hidden border border-[rgba(66,191,35,0.7)] shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026]">
    <GreenGlow />
    <CardHeader balance="$2,040.30" currency="USD" icon="agent" />
    <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
      <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-[#42bf23] text-xs leading-3 whitespace-nowrap">Debit Card</span>
      <div className="flex items-center gap-2 self-stretch">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl leading-6 whitespace-nowrap">1652 0400 3201 6995</span>
        <CopyIcon />
      </div>
    </div>
    <div className="absolute top-[136px] left-4 w-[338px] h-8 flex items-start gap-[84px]">
      <div className="inline-flex flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-[#42bf23] text-xs leading-3">Name</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">{agentName}</span>
      </div>
      <div className="inline-flex flex-col items-start gap-1">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-[#42bf23] text-xs leading-3">Status</span>
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">Active</span>
      </div>
    </div>
  </div>
);

/* ─── Main component ─── */
interface Props {
  collapsed: boolean;
  onToggle: () => void;
  onCreateAgent: () => void;
  onSend?: () => void;
  onExchange?: () => void;
}

export const AccountOverviewSection = ({ collapsed, onToggle, onCreateAgent, onSend, onExchange }: Props): JSX.Element => {
  const [activeFilter, setActiveFilter]         = useState("All");
  const [activeTab, setActiveTab]               = useState("Assets");
  const [transactionFilter, setTransactionFilter] = useState("All");
  const [addOpen, setAddOpen]                   = useState(false);
  const [dropdownOpen, setDropdownOpen]         = useState(false);
  const [activeAccount, setActiveAccount]       = useState<string | null>(null);
  // Card carousel — 0=wallet, 1=debit, 2=bank; only for "Your Account"
  const [activeCard, setActiveCard]             = useState(0);
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

  // Reset card to wallet whenever switching account (personal or any agent)
  const handleSwitchAccount = (id: string | null) => {
    setActiveAccount(id);
    setActiveCard(0);
    setDropdownOpen(false);
  };

  /* Contextual data: if "Your Account" use card-specific data, else fixed agent data */
  const isYourAccount = activeAccount === null;
  const currentCardData = isYourAccount ? CARDS[activeCard].data : null;

  // Both personal and agent wallet (card index 0) support the Crypto filter tab
  const filterTabs = activeCard === 0
    ? ["All", "Cash", "Crypto"]
    : ["All", "Cash"];

  // Debit (index 1) and IBAN/Bank (index 2) cards have no Trades in transaction filters
  const txFilterTabs = activeCard === 0
    ? ["All", "Trades", "Deposits", "Withdrawals"]
    : ["All", "Deposits", "Withdrawals"];

  // Reset activeFilter to "All" when switching to a card that doesn't support the current filter
  useEffect(() => {
    if (activeCard !== 0 && activeFilter === "Crypto") setActiveFilter("All");
  }, [activeCard, activeFilter]);

  // Reset transactionFilter if "Trades" is selected while on Debit (1) or IBAN/Bank (2) cards
  useEffect(() => {
    if (activeCard !== 0 && transactionFilter === "Trades") setTransactionFilter("All");
  }, [activeCard, transactionFilter]);

  const assetsData   = currentCardData?.assets   ?? walletData.assets;
  const txData       = currentCardData?.transactions ?? walletData.transactions;

  /* ── collapsed state ── */
  if (collapsed) {
    return (
      <div className="flex self-stretch items-stretch gap-0 flex-shrink-0">
        <button onClick={onToggle} title="Expand account panel" className="self-center w-6 h-14 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-l-xl hover:bg-brain-v1baby-blue-30 transition-colors border border-r-0 border-[#1d2131]">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7 1L3 5L7 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
    <>
      <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} />
      <div className="flex self-stretch items-stretch gap-0 flex-shrink-0">
        {/* Collapse button */}
        <button onClick={onToggle} title="Collapse account panel" className="self-center w-6 h-14 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-l-xl hover:bg-brain-v1baby-blue-30 transition-colors border border-r-0 border-[#1d2131]">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 1L7 5L3 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>

        {/* Main panel */}
        <div className="flex flex-col rounded-3xl border border-solid border-[#1d2131] bg-shared-colorsbaby-blue-5 w-[386px] overflow-hidden">

          {/* ── Header bar ── */}
          <div className="flex mx-2 mt-2 mb-3 h-12 items-center gap-2 p-2 bg-brain-v1baby-blue-15 rounded-2xl">
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
              {dropdownOpen && (
                <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setDropdownOpen(false)} />
              )}
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
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="#8899bb" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] w-[240px] z-[51] bg-[#11141b] border border-[#1d2131] rounded-2xl shadow-2xl overflow-hidden">
                  <button
                    onClick={() => { setDropdownOpen(false); onCreateAgent(); }}
                    className="flex items-center gap-3 px-4 py-3 w-full hover:bg-brain-v1baby-blue-15 transition-colors border-b border-[#1d2131]"
                  >
                    <div className="w-8 h-8 bg-brain-v1dark-orange rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </div>
                    <div className="text-left">
                      <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">Create Agent</div>
                      <div className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-30 text-xs">Launch a new AI agent</div>
                    </div>
                  </button>

                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 uppercase tracking-wider">Switch Account</span>
                  </div>

                  <button
                    onClick={() => handleSwitchAccount(null)}
                    className={`flex items-center gap-3 px-4 py-2.5 w-full transition-colors ${activeAccount === null ? "bg-brain-v1baby-blue-15" : "hover:bg-brain-v1baby-blue-15"}`}
                  >
                    <img className="w-8 h-8 flex-shrink-0" alt="Wallet" src="/figmaAssets/wallet-icons-1.svg" />
                    <div className="text-left flex-1 min-w-0">
                      <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">Your Account</div>
                      <div className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-xs">Debit · 1652 ···· 6995</div>
                    </div>
                    {activeAccount === null && (
                      <div className="w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    )}
                  </button>

                  {agentAccounts.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleSwitchAccount(agent.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 w-full transition-colors ${activeAccount === agent.id ? "bg-brain-v1baby-blue-15" : "hover:bg-brain-v1baby-blue-15"}`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-brain-v1headerfooterbg flex items-center justify-center text-base flex-shrink-0">{agent.icon}</div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm truncate">{agent.name}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-xs">{agent.ticker}</span>
                          <span className="text-[9px] px-1 py-0.5 bg-brain-v1baby-blue-15 rounded text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{agent.type}</span>
                        </div>
                      </div>
                      {activeAccount === agent.id && (
                        <div className="w-4 h-4 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Card + Actions section ── */}
          <div className="h-[300px] w-[370px] self-center relative flex-shrink-0">
            {/* Actions panel — sits behind / below the card */}
            <div className="absolute top-[152px] left-0 w-[370px] h-[148px] flex bg-brain-v1headerfooterbg rounded-2xl">
              <div className="flex mt-16 w-[338px] h-[58px] ml-4 items-center gap-2">
                {cardActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={
                      action.label === "Send"     ? onSend :
                      action.label === "Add"      ? () => setAddOpen(true) :
                      action.label === "Exchange" ? onExchange :
                      undefined
                    }
                    className="flex flex-col items-center justify-center gap-1 flex-1 cursor-pointer group"
                  >
                    <div className="relative w-10 h-10 bg-brain-v1dark-orange rounded-[100px] flex items-center justify-center group-hover:opacity-80 transition-opacity">
                      <img className="w-6 h-6" alt={action.label} src={action.icon} />
                    </div>
                    <span className="self-stretch [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 group-hover:text-brain-v1white text-xs text-center leading-[14px] transition-colors">
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Card carousel ── */}
            {isYourAccount ? (
              <>
                {/* Personal account: 3 cards, orange pagination */}
                {activeCard === 0 && <WalletAddressCard />}
                {activeCard === 1 && <DebitCardView />}
                {activeCard === 2 && <BankAccountCard />}
                <div className="absolute top-[182px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-1">
                  {CARDS.map((_, i) => (
                    <button
                      key={i}
                      data-testid={`card-dot-${i}`}
                      onClick={() => setActiveCard(i)}
                      className="transition-all"
                      style={{
                        width:        i === activeCard ? "18px" : "6px",
                        height:       "6px",
                        borderRadius: "40px",
                        background:   i === activeCard ? "rgba(255,149,0,0.9)" : "rgba(255,149,0,0.35)",
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Agent account: 2 cards (Wallet + Debit), green pagination */}
                {activeCard === 0 && (
                  <AgentWalletCard agentName={agentAccounts.find((a) => a.id === activeAccount)?.name ?? "Agent"} />
                )}
                {activeCard === 1 && (
                  <AgentDebitCard agentName={agentAccounts.find((a) => a.id === activeAccount)?.name ?? "Agent"} />
                )}
                <div className="absolute top-[182px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-1">
                  {[0, 1].map((i) => (
                    <button
                      key={i}
                      data-testid={`agent-card-dot-${i}`}
                      onClick={() => setActiveCard(i)}
                      className="transition-all"
                      style={{
                        width:        i === activeCard ? "18px" : "6px",
                        height:       "6px",
                        borderRadius: "40px",
                        background:   i === activeCard ? "rgba(66,191,35,0.9)" : "rgba(66,191,35,0.35)",
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Assets / Transactions ── */}
          <ScrollArea className="flex-1 mt-4">
            <div className="flex mx-2 flex-col items-start gap-4 w-[370px] pb-4">
              <div className="flex flex-col items-start gap-2 self-stretch w-full">

                {/* Main tabs */}
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

                {/* Sub-filter pills */}
                {activeTab === "Assets" ? (
                  <div className="flex w-[370px] items-center gap-0.5 p-0.5 bg-brain-v1headerfooterbg rounded-[400px] overflow-hidden">
                    {filterTabs.map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`flex items-center justify-center px-4 py-2 flex-1 rounded-[100px] border-none cursor-pointer transition-colors ${activeFilter === filter ? "bg-brain-v1dark-green" : "bg-brain-v1headerfooterbg"}`}
                      >
                        <span className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm whitespace-nowrap ${activeFilter === filter ? "text-brain-v1green" : "text-brain-v1baby-blue-30"}`}>
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
                        className={`flex items-center justify-center px-3 py-2 flex-1 rounded-[100px] border-none cursor-pointer transition-colors ${transactionFilter === filter ? "bg-[#123509]" : "bg-brain-v1headerfooterbg"}`}
                      >
                        <span className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm whitespace-nowrap ${transactionFilter === filter ? "text-brain-v1green" : "text-brain-v1baby-blue-30"}`}>
                          {filter}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Assets list */}
              {activeTab === "Assets" && (() => {
                const filtered = assetsData.filter((a) =>
                  activeFilter === "Cash"   ? a.category === "cash"   :
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
                              <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base leading-5 whitespace-nowrap">{asset.name}</span>
                              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4 whitespace-nowrap">{asset.ticker}</span>
                            </div>
                            <div className="flex flex-col items-start justify-center gap-1 flex-1">
                              <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1green text-base text-right leading-5">{asset.value}</span>
                              <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1baby-blue-30 text-sm text-right leading-4">{asset.amount}</span>
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
                const filtered = txData.filter((t) =>
                  transactionFilter === "Trades"       ? t.type === "trade"      :
                  transactionFilter === "Deposits"     ? t.type === "deposit"    :
                  transactionFilter === "Withdrawals"  ? t.type === "withdrawal" : true
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
                          <div className="w-10 h-10 bg-[#0a0c10] rounded-full flex items-center justify-center flex-shrink-0">
                            {tx.type === "deposit" ? (
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M15 5L5 15M5 15H13M5 15V7" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base leading-5 whitespace-nowrap">{tx.label}</span>
                              <div className="flex items-center gap-1">
                                <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4">{tx.time}</span>
                                <div className="w-1 h-1 bg-brain-v1baby-blue-30 rounded-full flex-shrink-0" />
                                <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4">{tx.date}</span>
                              </div>
                            </div>
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
    </>
  );
};
