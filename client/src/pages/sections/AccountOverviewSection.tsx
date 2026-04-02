import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddAccountModal } from "@/components/AddAccountModal";
import { useAuth, type WirexAccount } from "@/lib/authContext";

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

/* Mock data for agent debit card */
const agentDebitData = {
  assets: [
    { icon: "/figmaAssets/crypto-icons-3.svg", name: "Dollar", ticker: "USD", value: "$2,040.30",     amount: "2,040.30", category: "cash" },
    { icon: "/figmaAssets/crypto-icons-3.svg", name: "Dirham", ticker: "AED", value: "AED 7,496.00",  amount: "7,496",    category: "cash" },
  ],
  transactions: [
    { id: "ad1", type: "deposit",    label: "Agent Revenue Credit",  time: "10:00am", date: "20 Sat", amount: "+$820.00",  positive: true  },
    { id: "ad2", type: "withdrawal", label: "Gas Fee Settlement",    time: "4:30pm",  date: "18 Thur",amount: "-$14.20",   positive: false },
    { id: "ad3", type: "deposit",    label: "Strategy Payout",       time: "9:15am",  date: "16 Tue", amount: "+$350.00",  positive: true  },
    { id: "ad4", type: "withdrawal", label: "Platform Fee",          time: "2:00pm",  date: "13 Sat", amount: "-$25.00",   positive: false },
    { id: "ad5", type: "deposit",    label: "Arbitrage Profit",      time: "7:45am",  date: "10 Wed", amount: "+$198.60",  positive: true  },
  ],
};

// filterTabs and txFilterTabs are derived per-card inside the component
const mainTabs     = ["Assets", "Transactions"];

const cardActions = [
  { icon: "/figmaAssets/icons-4.svg",  label: "Add"      },
  { icon: "/figmaAssets/icons-14.svg", label: "Send"     },
  { icon: "/figmaAssets/icons-9.svg",  label: "Exchange" },
];

const agentAccounts = [
  { id: "1", name: "AlphaFlow",     ticker: "$ALPHA", icon: "⚡", type: "Trading",   avatar: "/figmaAssets/avatars-3.svg" },
  { id: "2", name: "SwarmAlpha",    ticker: "$SWRM",  icon: "🤖", type: "Analytics", avatar: "/figmaAssets/avatars-7.svg" },
  { id: "3", name: "Risk Sentinel", ticker: "$RSKX",  icon: "🛡",  type: "Risk",      avatar: "/figmaAssets/avatars-5.svg" },
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

const WalletAddressCard = ({ account }: { account?: WirexAccount }) => {
  const addr = account?.address || "—";
  const truncated = addr.length > 16 ? addr.slice(0, 6) + "....." + addr.slice(-5) : addr;
  const name = account?.nameOnAccount || "—";
  const balance = account?.balance ? `$${account.balance}` : "$0.00";
  const currency = account?.currency || "USD";
  return (
    <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#4a2300] rounded-2xl overflow-hidden border border-[rgba(255,149,0,0.7)] shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026]">
      <OrangeGlow />
      <CardHeader balance={balance} currency={currency} icon="wallet" />
      <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">Wallet Address</span>
        <div className="flex items-center gap-2 self-stretch">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl leading-6 whitespace-nowrap">{truncated}</span>
          <CopyIcon />
        </div>
      </div>
      <div className="absolute top-[136px] left-4 w-[338px] h-8 flex items-start">
        <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Name</span>
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">{name}</span>
        </div>
      </div>
    </div>
  );
};

const DebitCardView = ({ account }: { account?: WirexAccount }) => {
  const cardNum = account?.cardNumber || "•••• •••• •••• ••••";
  const expiry = account?.cardExpiry || "—";
  const cvv = account?.cardCvv || "—";
  const name = account?.nameOnAccount || "—";
  const balance = account?.balance ? `$${account.balance}` : "$0.00";
  const currency = account?.currency || "USD";
  return (
    <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-brain-v1dark-orange rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(255,149,0,0.42)_0%,rgba(255,149,0,0)_36%,rgba(255,149,0,0.06)_67%,rgba(255,149,0,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
      <OrangeGlow />
      <CardHeader balance={balance} currency={currency} icon="wallet" />
      <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">Debit Card</span>
        <div className="flex items-start gap-2 self-stretch">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl leading-6 whitespace-nowrap">{cardNum}</span>
          <img className="w-6 h-6" alt="Icons" src="/figmaAssets/icons-8.svg" />
        </div>
      </div>
      <div className="absolute top-[136px] left-4 w-[338px] h-8 flex">
        <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Name</span>
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">{name}</span>
        </div>
        <div className="inline-flex w-11 h-8 ml-[50px] flex-col items-start gap-1">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Expiry</span>
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">{expiry}</span>
        </div>
        <div className="inline-flex w-[26px] h-8 ml-10 flex-col items-start gap-1">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">CVC</span>
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">{cvv}</span>
        </div>
        <div className="h-[26px] w-[42px] self-center relative ml-[52px]">
          <div className="absolute top-0 left-4 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
          <div className="absolute top-0 left-0 w-[26px] h-[26px] bg-brain-v1light-orange rounded-[13px] opacity-40" />
        </div>
      </div>
    </div>
  );
};

const BankAccountCard = ({ account }: { account?: WirexAccount }) => {
  const iban = account?.iban || "—";
  const name = account?.nameOnAccount || "—";
  const balance = account?.balance ? `$${account.balance}` : "$0.00";
  const currency = account?.currency || "USD";
  return (
    <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#4a2300] rounded-2xl overflow-hidden border border-[rgba(255,149,0,0.7)] shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026]">
      <OrangeGlow />
      <CardHeader balance={balance} currency={currency} icon="wallet" />
      <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">IBAN Account Number</span>
        <div className="flex items-center gap-2 self-stretch">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-[15px] leading-6 whitespace-nowrap tracking-tight">{iban}</span>
          <CopyIcon />
        </div>
      </div>
      <div className="absolute top-[136px] left-4 w-[338px] h-8 flex items-start">
        <div className="inline-flex w-[84px] h-8 flex-col items-start gap-1">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3">Name</span>
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-sm leading-4">{name}</span>
        </div>
      </div>
    </div>
  );
};

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
  onSend?: (cardType: "wallet" | "bank") => void;
  onExchange?: () => void;
}

export const AccountOverviewSection = ({ collapsed, onToggle, onCreateAgent, onSend, onExchange }: Props): JSX.Element => {
  const { wirexAccounts, user } = useAuth();
  // Find live WireX accounts by type
  const liveWallet = wirexAccounts.find(a => a.type === "wallet");
  const liveDebit  = wirexAccounts.find(a => a.type === "debit");
  const liveBank   = wirexAccounts.find(a => a.type === "bank");

  // Prefer Crossmint embedded wallet address; fall back to WireX wallet address
  const resolvedWalletAccount = liveWallet
    ? { ...liveWallet, address: user?.walletAddress || liveWallet.address }
    : (user?.walletAddress
        ? { id: "crossmint", type: "wallet" as const, address: user.walletAddress, nameOnAccount: user.email?.split("@")[0] }
        : undefined);

  const [activeFilter, setActiveFilter]         = useState("All");
  const [activeTab, setActiveTab]               = useState("Assets");
  const [transactionFilter, setTransactionFilter] = useState("All");
  const [addOpen, setAddOpen]                   = useState(false);
  const [dropdownOpen, setDropdownOpen]         = useState(false);
  const [activeAccount, setActiveAccount]       = useState<string | null>(null);
  // Card carousel — 0=wallet, 1=debit, 2=bank; only for "Your Account"
  const [activeCard, setActiveCard]             = useState(0);
  // Collapsed icon strip hover state
  const [hoveredIcon, setHoveredIcon]           = useState<string | null>(null);
  const [collapsedAssetFilter, setCollapsedAssetFilter] = useState("All");
  const [collapsedTxFilter, setCollapsedTxFilter]       = useState("All");
  const [collapsedCardIndex, setCollapsedCardIndex]     = useState(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const openHover = useCallback((icon: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoveredIcon(icon);
  }, []);

  const closeHover = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHoveredIcon(null), 120);
  }, []);

  const cancelClose = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

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

  // For agent accounts: wallet card (0) uses crypto data, debit card (1) uses cash data
  const agentCardData = !isYourAccount
    ? (activeCard === 1 ? agentDebitData : walletData)
    : null;
  const assetsData = isYourAccount ? (currentCardData?.assets ?? walletData.assets) : agentCardData!.assets;
  const txData     = isYourAccount ? (currentCardData?.transactions ?? walletData.transactions) : agentCardData!.transactions;

  /* ── collapsed state ── */
  if (collapsed) {
    const popupBase = "w-[300px] bg-[#11141b] border border-[#1e2235] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden";
    const popupHeader = (title: string) => (
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2235]">
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-base">{title}</span>
        <button
          onClick={() => setHoveredIcon(null)}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1a1f30] text-[#6c779d] hover:text-white transition-colors"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </button>
      </div>
    );

    /* Helpers shared across popups */
    const activeCollapsedData = CARDS[collapsedCardIndex].data;
    const activeCollapsedLabel = CARDS[collapsedCardIndex].label;
    const collapsedHasCrypto = collapsedCardIndex === 0;
    const collapsedHasTrades = collapsedCardIndex === 0;

    const collapsedAssetTabs = collapsedHasCrypto ? ["All", "Cash", "Crypto"] : ["All", "Cash"];
    const collapsedTxTabs    = collapsedHasTrades  ? ["All", "Trades", "Deposits", "Withdrawals"] : ["All", "Deposits", "Withdrawals"];

    const goCard = (dir: 1 | -1) => {
      setCollapsedCardIndex(prev => (prev + dir + CARDS.length) % CARDS.length);
      setCollapsedAssetFilter("All");
      setCollapsedTxFilter("All");
    };

    const BankPopup = () => {
      const cardNode = (() => {
        if (collapsedCardIndex === 0) return <WalletAddressCard account={resolvedWalletAccount as any} />;
        if (collapsedCardIndex === 1) return <DebitCardView account={liveDebit} />;
        return <BankAccountCard account={liveBank} />;
      })();
      return (
        <div className={popupBase}>
          {popupHeader("Accounts")}
          {/* Account label row */}
          <div className="flex items-center gap-2 mx-3 mt-3 mb-2 px-3 py-2 bg-[#1a1f2e] rounded-xl">
            <img className="w-6 h-6 flex-shrink-0" alt="Wallet" src="/figmaAssets/wallet-icons-1.svg" />
            <span className="flex-1 [font-family:'Gilroy-Medium',Helvetica] font-medium text-white text-sm">
              Your Account · <span className="text-[#ff9500]">{activeCollapsedLabel}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" fill="#22c55e"/><path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          {/* Card preview */}
          <div className="mx-3 mb-1" style={{ height: "158px", overflow: "hidden" }}>
            <div style={{ transform: "scale(0.78)", transformOrigin: "top left", width: "370px" }}>
              <div className="relative h-[200px]">{cardNode}</div>
            </div>
          </div>
          {/* Pagination — dots + arrows */}
          <div className="flex items-center justify-center gap-2 pb-3 px-3">
            <button
              onClick={() => goCard(-1)}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1a1f30] hover:bg-[#252b42] transition-colors flex-shrink-0"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 2L3.5 5L6.5 8" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </button>
            <div className="flex items-center gap-1.5 flex-1 justify-center">
              {CARDS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCollapsedCardIndex(i); setCollapsedAssetFilter("All"); setCollapsedTxFilter("All"); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === collapsedCardIndex ? "w-5 bg-[#ff9500]" : "w-1.5 bg-[#414965] hover:bg-[#6c779d]"}`}
                />
              ))}
            </div>
            <button
              onClick={() => goCard(1)}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1a1f30] hover:bg-[#252b42] transition-colors flex-shrink-0"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L6.5 5L3.5 8" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </button>
          </div>
          {/* Card type labels */}
          <div className="flex justify-center gap-4 pb-3 px-3">
            {CARDS.map((card, i) => (
              <button
                key={card.id}
                onClick={() => { setCollapsedCardIndex(i); setCollapsedAssetFilter("All"); setCollapsedTxFilter("All"); }}
                className={`text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] transition-colors ${i === collapsedCardIndex ? "text-[#ff9500]" : "text-[#414965] hover:text-[#6c779d]"}`}
              >
                {card.label}
              </button>
            ))}
          </div>
        </div>
      );
    };

    const AssetsPopup = () => {
      const safeFilter = collapsedAssetTabs.includes(collapsedAssetFilter) ? collapsedAssetFilter : "All";
      const filteredAssets = activeCollapsedData.assets.filter(a =>
        safeFilter === "Cash"   ? a.category === "cash" :
        safeFilter === "Crypto" ? a.category === "crypto" : true
      );
      return (
        <div className={popupBase} style={{ maxHeight: "420px", display: "flex", flexDirection: "column" }}>
          {popupHeader(`Assets · ${activeCollapsedLabel}`)}
          {/* Card switcher mini-dots */}
          <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid #1e2235" }}>
            <div className="flex items-center gap-1.5">
              {CARDS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCollapsedCardIndex(i); setCollapsedAssetFilter("All"); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === collapsedCardIndex ? "w-4 bg-[#ff9500]" : "w-1.5 bg-[#414965] hover:bg-[#6c779d]"}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => goCard(-1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-[#1a1f30] hover:bg-[#252b42] transition-colors">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M5 1.5L2.5 4L5 6.5" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
              <button onClick={() => goCard(1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-[#1a1f30] hover:bg-[#252b42] transition-colors">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M3 1.5L5.5 4L3 6.5" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          <div className="flex mx-3 my-2 p-0.5 bg-[#0d1017] rounded-full flex-shrink-0">
            {collapsedAssetTabs.map(tab => (
              <button
                key={tab}
                onClick={() => setCollapsedAssetFilter(tab)}
                className={`flex-1 py-1.5 rounded-full text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${safeFilter === tab ? "bg-[#123509] text-brain-v1green" : "text-[#6c779d] hover:text-white"}`}
              >{tab}</button>
            ))}
          </div>
          <div className="flex flex-col gap-3 px-3 pb-3 overflow-y-auto">
            {filteredAssets.length === 0 ? (
              <p className="text-center text-[#414965] text-xs py-4 [font-family:'Gilroy-Medium',Helvetica]">No assets in this category</p>
            ) : filteredAssets.map((asset, idx) => (
              <div key={`${asset.ticker}-${idx}`} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 w-full">
                  <img className="w-8 h-8 flex-shrink-0" alt={asset.name} src={asset.icon} />
                  <div className="flex items-center justify-center gap-2 flex-1">
                    <div className="flex flex-col items-start gap-0.5 flex-shrink-0">
                      <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#a8b9f4] text-sm leading-4">{asset.name}</span>
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs">{asset.ticker}</span>
                    </div>
                    <div className="flex flex-col items-end flex-1">
                      <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-[#42bf23] text-sm text-right">{asset.value}</span>
                      <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-[#6c779d] text-xs text-right">{asset.amount}</span>
                    </div>
                  </div>
                </div>
                {idx < filteredAssets.length - 1 && <div className="h-px bg-[#1e2235] w-full" />}
              </div>
            ))}
          </div>
        </div>
      );
    };

    const TransactionsPopup = () => {
      const safeFilter = collapsedTxTabs.includes(collapsedTxFilter) ? collapsedTxFilter : "All";
      const filteredTx = activeCollapsedData.transactions.filter(t =>
        safeFilter === "Trades"      ? t.type === "trade"      :
        safeFilter === "Deposits"    ? t.type === "deposit"    :
        safeFilter === "Withdrawals" ? t.type === "withdrawal" : true
      );
      return (
        <div className={popupBase} style={{ maxHeight: "440px", display: "flex", flexDirection: "column" }}>
          {popupHeader(`Transactions · ${activeCollapsedLabel}`)}
          {/* Card switcher mini-dots */}
          <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid #1e2235" }}>
            <div className="flex items-center gap-1.5">
              {CARDS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCollapsedCardIndex(i); setCollapsedTxFilter("All"); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === collapsedCardIndex ? "w-4 bg-[#ff9500]" : "w-1.5 bg-[#414965] hover:bg-[#6c779d]"}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => goCard(-1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-[#1a1f30] hover:bg-[#252b42] transition-colors">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M5 1.5L2.5 4L5 6.5" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
              <button onClick={() => goCard(1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-[#1a1f30] hover:bg-[#252b42] transition-colors">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M3 1.5L5.5 4L3 6.5" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>
          <div className="flex mx-3 my-2 p-0.5 bg-[#0d1017] rounded-full flex-shrink-0">
            {collapsedTxTabs.map(tab => (
              <button
                key={tab}
                onClick={() => setCollapsedTxFilter(tab)}
                className={`flex-1 py-1.5 rounded-full text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${safeFilter === tab ? "bg-[#123509] text-brain-v1green" : "text-[#6c779d] hover:text-white"}`}
              >{tab}</button>
            ))}
          </div>
          <div className="flex flex-col overflow-y-auto px-3 pb-3">
            {filteredTx.length === 0 ? (
              <p className="text-center text-[#414965] text-xs py-4 [font-family:'Gilroy-Medium',Helvetica]">No transactions in this category</p>
            ) : filteredTx.map((tx, idx) => (
              <div key={tx.id} className="flex flex-col">
                <div className="flex items-center gap-2 py-3">
                  <div className="w-8 h-8 bg-[#0a0c10] rounded-full flex items-center justify-center flex-shrink-0">
                    {tx.type === "deposit" ? (
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 15H13M5 15V7" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : tx.type === "withdrawal" ? (
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 15L15 5M15 5H7M15 5V13" stroke="#d20344" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 8H16M4 8L7 5M4 8L7 11M16 12H4M16 12L13 9M16 12L13 15" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="flex flex-col gap-0.5 flex-shrink-0 min-w-0">
                      <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#a8b9f4] text-sm leading-4 whitespace-nowrap truncate max-w-[140px]">{tx.label}</span>
                      <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs">{tx.time} · {tx.date}</span>
                    </div>
                    <span className={`flex-1 [font-family:'JetBrains_Mono',Helvetica] font-medium text-sm text-right ${tx.positive ? "text-[#42bf23]" : "text-[#d20344]"}`}>
                      {tx.amount}
                    </span>
                  </div>
                </div>
                {idx < filteredTx.length - 1 && <div className="h-px bg-[#1e2235] w-full" />}
              </div>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="flex-shrink-0 self-stretch" style={{ overflow: "visible" }}>
        <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} excludeTypes={[]} />

        {/* Backdrop shade — appears behind popup, on top of main content */}
        {hoveredIcon && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Strip: 56px wide, 8px side padding → 40px inner elements */}
        <div className="flex flex-col items-center w-[56px] h-full rounded-[16px] border border-[#1d2132] bg-[#11141b] py-2 gap-[8px]">

          {/* ── Toggle expand button: full-pill, #222737 background ── */}
          <button
            onClick={onToggle}
            title="Expand account panel"
            data-testid="button-expand-account"
            className="w-[40px] h-[40px] flex-shrink-0 rounded-[100px] flex items-center justify-center transition-colors"
            style={{ background: "#222737" }}
          >
            <svg width="18" height="16" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 6L6 9L9 12M7 9H14M17 17H3C1.89543 17 1 16.1046 1 15V3C1 1.89543 1.89543 1 3 1H17C18.1046 1 19 1.89543 19 3V15C19 16.1046 18.1046 17 17 17Z" stroke="#A8B9F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* ── Horizontal divider ── */}
          <div className="w-[40px] h-px bg-[#1d2132] flex-shrink-0" />

          {/* ── "Wallet" label ── */}
          <span className="text-[#414965] text-[9px] [font-family:'Gilroy-SemiBold',Helvetica] uppercase tracking-[0.06em] select-none leading-[16px]">Wallet</span>

          {/* ── Bank icon: WalletIcons style — squircle rounded-[20px] ── */}
          <div
            className="relative flex-shrink-0"
            onMouseEnter={() => openHover("bank")}
            onMouseLeave={closeHover}
          >
            <button
              data-testid="button-collapsed-bank"
              className="w-[40px] h-[40px] rounded-[20px] overflow-hidden flex items-center justify-center transition-opacity"
              style={{ background: "rgba(255,149,0,0.18)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 11h18M5 11v8M19 11v8M5 19h14M9 14v4M12 14v4M15 14v4M12 5L20 11M12 5L4 11" stroke="#ff9500" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {hoveredIcon === "bank" && (
              <div
                className="absolute z-50"
                style={{ right: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" }}
                onMouseEnter={cancelClose}
                onMouseLeave={closeHover}
              >
                <BankPopup />
              </div>
            )}
          </div>

          {/* ── Add icon: full circle ── */}
          <button
            data-testid="button-collapsed-add"
            onClick={() => setAddOpen(true)}
            className="w-[40px] h-[40px] flex-shrink-0 rounded-[100px] flex items-center justify-center transition-opacity opacity-80 hover:opacity-100"
            style={{ background: "rgba(255,149,0,0.18)" }}
          >
            <img className="w-6 h-6" alt="Add" src="/figmaAssets/icons-4.svg" />
          </button>

          {/* ── Send icon: full circle ── */}
          <button
            data-testid="button-collapsed-send"
            onClick={() => onSend?.("wallet")}
            className="w-[40px] h-[40px] flex-shrink-0 rounded-[100px] flex items-center justify-center transition-opacity opacity-80 hover:opacity-100"
            style={{ background: "rgba(255,149,0,0.18)" }}
          >
            <img className="w-6 h-6" alt="Send" src="/figmaAssets/icons-14.svg" />
          </button>

          {/* ── Exchange icon: full circle ── */}
          <button
            data-testid="button-collapsed-exchange"
            onClick={onExchange}
            className="w-[40px] h-[40px] flex-shrink-0 rounded-[100px] flex items-center justify-center transition-opacity opacity-80 hover:opacity-100"
            style={{ background: "rgba(255,149,0,0.18)" }}
          >
            <img className="w-6 h-6" alt="Exchange" src="/figmaAssets/icons-9.svg" />
          </button>

          {/* ── Horizontal divider ── */}
          <div className="w-[40px] h-px bg-[#1d2132] flex-shrink-0" />

          {/* ── Assets: Rounded-full circle button — matching Figma 3265:26778 ── */}
          <div
            className="relative flex-shrink-0"
            onMouseEnter={() => openHover("assets")}
            onMouseLeave={closeHover}
          >
            <button
              data-testid="button-collapsed-assets"
              className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center p-[8px] transition-colors bg-[#11141b]"
            >
              <svg width="22" height="20" viewBox="0 0 22 20" fill="none">
                <path d="M14.3 4.44444C18.5526 4.44444 22 7.92667 22 12.2222C22 16.5178 18.5526 20 14.3 20C10.0474 20 6.6 16.5178 6.6 12.2222C6.6 7.92667 10.0474 4.44444 14.3 4.44444Z" fill={hoveredIcon === "assets" ? "#9d5cf5" : "#6c779d"}/>
                <path d="M7.7 0C9.83147 0 11.7607 0.874835 13.1549 2.28841C8.2267 2.86175 4.4 7.09058 4.4 12.2222C4.4 13.1777 4.53253 14.1021 4.78027 14.9772C1.97542 13.8153 0 11.0295 0 7.77778C0 3.48223 3.44741 0 7.7 0Z" fill={hoveredIcon === "assets" ? "#9d5cf5" : "#6c779d"}/>
              </svg>
            </button>
            {hoveredIcon === "assets" && (
              <div
                className="absolute z-50"
                style={{ right: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" }}
                onMouseEnter={cancelClose}
                onMouseLeave={closeHover}
              >
                <AssetsPopup />
              </div>
            )}
          </div>

          {/* ── Transactions: Rounded-full circle button — matching Figma 3265:26778 ── */}
          <div
            className="relative flex-shrink-0"
            onMouseEnter={() => openHover("transactions")}
            onMouseLeave={closeHover}
          >
            <button
              data-testid="button-collapsed-transactions"
              className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center p-[8px] transition-colors bg-[#11141b]"
            >
              <svg width="22" height="18" viewBox="0 0 22.3812 18.1988" fill="none">
                <path d="M1.00017 5.62925L2.64504 8.47826C2.85468 8.84136 3.31899 8.96577 3.6821 8.75613L6.31195 7.23779M21.381 12.5635L19.7362 9.71454C19.5265 9.35144 19.0623 9.22698 18.6991 9.43666L15.8501 11.0815M4.17248 13.1483C6.40865 17.0215 11.3612 18.3485 15.2344 16.1123C17.5453 14.7781 18.9987 12.4486 19.2915 9.98041M18.1984 5.05045C15.9622 1.17731 11.0097 -0.149741 7.1365 2.08643C4.82554 3.42067 3.37219 5.75015 3.07943 8.2184" stroke={hoveredIcon === "transactions" ? "#a8b9f4" : "#6c779d"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {hoveredIcon === "transactions" && (
              <div
                className="absolute z-50"
                style={{ right: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" }}
                onMouseEnter={cancelClose}
                onMouseLeave={closeHover}
              >
                <TransactionsPopup />
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  return (
    <>
      <AddAccountModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        excludeTypes={activeCard === 0 ? ["bank"] : activeCard === 2 ? ["wallet"] : []}
      />
      <div className="flex-shrink-0 self-stretch">

        {/* Main panel */}
        <div className="flex flex-col rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] w-[390px] h-full overflow-hidden">

          {/* ── Header bar ── */}
          <div className="flex items-center gap-2 mx-2 mt-2 mb-3">
            {/* Collapse toggle — outside and to the left of the input field */}
            <button
              onClick={onToggle}
              title="Collapse account panel"
              data-testid="button-collapse-account"
              className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px] hover:bg-[#1a1f2e] transition-colors"
            >
              <svg width="18" height="16" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6L9 9L6 12M8 9H1M17 17H15C13.8954 17 13 16.1046 13 15V3C13 1.89543 13.8954 1 15 1H17C18.1046 1 19 1.89543 19 3V15C19 16.1046 18.1046 17 17 17Z" stroke="#A8B9F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Header pill input field */}
            <div className="flex-1 flex items-center gap-2 h-[40px] px-2 bg-brain-v1baby-blue-15 rounded-[8px]">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {activeAccount ? (
                <img
                  className="w-8 h-8 flex-shrink-0 rounded-xl object-cover"
                  alt="Agent"
                  src={agentAccounts.find((a) => a.id === activeAccount)?.avatar ?? "/figmaAssets/wallet-icons-1.svg"}
                />
              ) : (
                <img className="w-8 h-8 flex-shrink-0" alt="Wallet icons" src="/figmaAssets/wallet-icons-1.svg" />
              )}
              <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-100 text-base tracking-[0] leading-5 whitespace-nowrap truncate">
                {activeAccount
                  ? agentAccounts.find((a) => a.id === activeAccount)?.name ?? "Your Account"
                  : "Your Account"}
              </span>
            </div>

            {/* Dropdown trigger */}
            <div className="relative flex-shrink-0" ref={dropdownRef}>
              {dropdownOpen && (
                <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300" onClick={() => setDropdownOpen(false)} />
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
                      <img className="w-8 h-8 rounded-xl object-cover flex-shrink-0" alt={agent.name} src={agent.avatar} />
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
          </div>

          {/* ── Card + Actions section ── */}
          <div className="h-[300px] w-[370px] self-center relative flex-shrink-0">
            {/* Actions panel — sits behind / below the card */}
            <div className="absolute top-[152px] left-0 w-[370px] h-[148px] flex bg-brain-v1headerfooterbg rounded-2xl">
              {activeCard !== 1 && (
                <div className="flex mt-16 w-[338px] h-[58px] ml-4 items-center gap-2">
                  {cardActions.map((action) => {
                    const cardType = activeCard === 2 ? "bank" : "wallet";
                    return (
                      <button
                        key={action.label}
                        onClick={
                          action.label === "Send"     ? () => onSend?.(cardType) :
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
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Card carousel ── */}
            {isYourAccount ? (
              <>
                {/* Personal account: 3 cards, orange pagination */}
                {activeCard === 0 && <WalletAddressCard account={resolvedWalletAccount} />}
                {activeCard === 1 && <DebitCardView account={liveDebit} />}
                {activeCard === 2 && <BankAccountCard account={liveBank} />}
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

                {/* Sub-filter pills — only shown in Transactions tab */}
                {activeTab === "Assets" ? null : (
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
