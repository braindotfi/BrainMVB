import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddAccountModal } from "@/components/AddAccountModal";
import { useAuth, type WirexAccount } from "@/lib/authContext";
import { useTransactions } from "@/lib/transactionContext";

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
      /* Figma WalletIcons — green circle bg + dark-green robot at inset-[20%] */
      <div className="overflow-clip relative rounded-[24px] w-12 h-12 flex-shrink-0">
        <img alt="" className="absolute block max-w-none w-full h-full" src="/figmaAssets/wallet-icons-agent-bg.svg" />
        <div className="absolute inset-[20%]">
          <img alt="" className="absolute block max-w-none w-full h-full" src="/figmaAssets/icon-robot.svg" />
        </div>
      </div>
    ) : (
      <img className="w-12 h-12" alt="Wallet" src="/figmaAssets/wallet-icons.svg" />
    )}
    <div className="flex items-center gap-2 flex-1">
      <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-brain-v1white text-[32px] text-center leading-8 whitespace-nowrap">
        {balance}
      </span>
      <div className="inline-flex items-start px-1.5 py-0.5 bg-brain-v1white-30 rounded-[100px]">
        <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1white text-xs leading-3 whitespace-nowrap">
          {currency}
        </span>
      </div>
    </div>
  </div>
);

const CopyIcon = ({ value }: { value: string }) => (
  <img
    className="w-6 h-6 flex-shrink-0 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
    alt="Copy"
    src="/figmaAssets/icons-8.svg"
    onClick={() => navigator.clipboard.writeText(value)}
  />
);

/* ── Personal account cards (orange theme) ── */

const WalletAddressCard = ({ account }: { account?: WirexAccount }) => {
  const addr = account?.address || "—";
  const truncated = addr.length > 16 ? addr.slice(0, 6) + "....." + addr.slice(-5) : addr;
  const name = account?.nameOnAccount || "—";
  const balance = account?.balance ? `$${account.balance}` : "$0.00";
  const currency = account?.currency || "USD";
  return (
    <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-brain-v1dark-orange rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(255,149,0,0.42)_0%,rgba(255,149,0,0)_36%,rgba(255,149,0,0.06)_67%,rgba(255,149,0,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
      <OrangeGlow />
      <CardHeader balance={balance} currency={currency} icon="wallet" />
      <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">Crypto Wallet Address</span>
        <div className="flex items-center gap-2 self-stretch">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-xl leading-6 whitespace-nowrap">{truncated}</span>
          <CopyIcon value={addr} />
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
          <CopyIcon value={cardNum} />
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
    <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-brain-v1dark-orange rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(255,149,0,0.42)_0%,rgba(255,149,0,0)_36%,rgba(255,149,0,0.06)_67%,rgba(255,149,0,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
      <OrangeGlow />
      <CardHeader balance={balance} currency={currency} icon="wallet" />
      <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
        <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1light-orange text-xs leading-3 whitespace-nowrap">Bank Account Number</span>
        <div className="flex items-center gap-2 self-stretch">
          <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-white text-[20px] leading-[24px] whitespace-nowrap">{iban}</span>
          <CopyIcon value={iban} />
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
  <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#123509] rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(66,191,35,0.42)_0%,rgba(66,191,35,0)_36%,rgba(66,191,35,0.06)_67%,rgba(66,191,35,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
    <GreenGlow />
    <CardHeader balance="$2,040.30" currency="USD" icon="agent" />
    <div className="flex flex-col w-[338px] items-start gap-1 absolute top-20 left-4">
      <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-[#42bf23] text-xs leading-3 whitespace-nowrap">Crypto Wallet Address</span>
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
  <div className="absolute top-0 left-0 w-[370px] h-[200px] bg-[#123509] rounded-2xl overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026] before:content-[''] before:absolute before:inset-0 before:p-[1.4px] before:rounded-2xl before:[background:linear-gradient(119deg,rgba(66,191,35,0.42)_0%,rgba(66,191,35,0)_36%,rgba(66,191,35,0.06)_67%,rgba(66,191,35,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none">
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
  onExchange?: (cardType: "wallet" | "bank") => void;
  focusExchangesTrigger?: number;
  focusSendWithdrawalTrigger?: { seq: number; sourceAccountType: "wallet" | "bank" } | null;
}

export const AccountOverviewSection = ({ collapsed, onToggle, onCreateAgent, onSend, onExchange, focusExchangesTrigger, focusSendWithdrawalTrigger }: Props): JSX.Element => {
  const { wirexAccounts, user } = useAuth();

  const { data: agentsRaw = [] } = useQuery<any[]>({ queryKey: ["/api/agents"] });
  const agentAccounts = agentsRaw.map((a: any) => ({
    id: String(a.id),
    name: a.name ?? "Agent",
    ticker: a.policy?.uiTicker ? `$${a.policy.uiTicker}` : `$${(a.name ?? "AGT").slice(0, 4).toUpperCase()}`,
    type: a.type ?? "AI",
    avatar: a.avatarUrl ?? "/figmaAssets/avatars-3.svg",
  }));

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

  // Switch to Transactions/Exchanges tab when an exchange is confirmed
  useEffect(() => {
    if (!focusExchangesTrigger) return;
    setActiveAccount(null);
    setActiveCard(0);
    setActiveTab("Transactions");
    setTransactionFilter("Exchanges");
  }, [focusExchangesTrigger]);

  // Switch to Transactions/Withdrawals tab for the correct account when a send is confirmed
  useEffect(() => {
    if (!focusSendWithdrawalTrigger?.seq) return;
    const cardIdx = focusSendWithdrawalTrigger.sourceAccountType === "bank" ? 2 : 0;
    setActiveAccount(null);
    setActiveCard(cardIdx);
    setActiveTab("Transactions");
    setTransactionFilter("Withdrawals");
    setCollapsedCardIndex(cardIdx);
    setCollapsedTxFilter("Withdrawals");
    setCollapsedAccount(null);
  }, [focusSendWithdrawalTrigger]);
  // Collapsed icon strip hover state
  const [hoveredIcon, setHoveredIcon]           = useState<string | null>(null);
  const [bankPopupOpen, setBankPopupOpen]       = useState(false);
  const [collapsedAssetFilter, setCollapsedAssetFilter] = useState("All");
  const [collapsedTxFilter, setCollapsedTxFilter]       = useState("All");
  const [collapsedCardIndex, setCollapsedCardIndex]     = useState(0);
  const [collapsedAccount, setCollapsedAccount]         = useState<string | null>(null);
  const [collapsedDropdownOpen, setCollapsedDropdownOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const collapsedDropdownRef = useRef<HTMLDivElement>(null);
  const bankPopupRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (collapsedDropdownRef.current && !collapsedDropdownRef.current.contains(e.target as Node)) {
        setCollapsedDropdownOpen(false);
      }
    };
    if (collapsedDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [collapsedDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bankPopupRef.current && !bankPopupRef.current.contains(e.target as Node)) {
        setBankPopupOpen(false);
        setCollapsedDropdownOpen(false);
      }
    };
    if (bankPopupOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [bankPopupOpen]);

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

  // Debit (index 1) and IBAN/Bank (index 2) cards have no Exchanges in transaction filters
  const txFilterTabs = activeCard === 0
    ? ["All", "Exchanges", "Deposits", "Withdrawals"]
    : ["All", "Deposits", "Withdrawals"];

  // Reset activeFilter to "All" when switching to a card that doesn't support the current filter
  useEffect(() => {
    if (activeCard !== 0 && activeFilter === "Crypto") setActiveFilter("All");
  }, [activeCard, activeFilter]);

  // Reset transactionFilter if "Exchanges" is selected while on Debit (1) or IBAN/Bank (2) cards
  useEffect(() => {
    if (activeCard !== 0 && transactionFilter === "Exchanges") setTransactionFilter("All");
  }, [activeCard, transactionFilter]);

  // Merge live transactions (from context) into the appropriate card list
  const { transactions: ctxTransactions } = useTransactions();
  const walletCtxTxs = useMemo(
    () => ctxTransactions.filter(t => t.accountId === null || t.accountId === undefined),
    [ctxTransactions]
  );
  const bankCtxTxs = useMemo(
    () => ctxTransactions.filter(t => t.accountId === "bank"),
    [ctxTransactions]
  );

  // For agent accounts: wallet card (0) uses crypto data, debit card (1) uses cash data
  const agentCardData = !isYourAccount
    ? (activeCard === 1 ? agentDebitData : walletData)
    : null;
  const assetsData = isYourAccount ? (currentCardData?.assets ?? walletData.assets) : agentCardData!.assets;
  const baseWalletTxs = walletData.transactions as Array<{ id: string; type: string; label: string; time: string; date: string; amount: string; positive: boolean; txHash?: string }>;
  const baseBankTxs   = bankData.transactions  as Array<{ id: string; type: string; label: string; time: string; date: string; amount: string; positive: boolean; txHash?: string }>;
  const txData: Array<{ id: string; type: string; label: string; time: string; date: string; amount: string; positive: boolean; txHash?: string }> = isYourAccount
    ? (activeCard === 0
        ? [...walletCtxTxs, ...baseWalletTxs]
        : activeCard === 2
          ? [...bankCtxTxs, ...baseBankTxs]
          : (currentCardData?.transactions ?? walletData.transactions))
    : agentCardData!.transactions;

  /* ── collapsed state ── */
  if (collapsed) {
    const popupBase = "w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[16px] overflow-hidden shadow-[0px_68px_27px_0px_rgba(0,0,0,0.06),0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34),0px_4px_9px_0px_rgba(0,0,0,0.39)]";
    const popupHeader = (title: string) => (
      <div className="flex items-center justify-between p-[16px] border-b border-[#1d2132] flex-shrink-0" style={{ backdropFilter: "blur(10px)", background: "#0a0c10" }}>
        <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#6c779d] text-[20px] leading-[24px] whitespace-nowrap">{title}</span>
        <button
          onClick={() => setHoveredIcon(null)}
          className="w-[24px] h-[24px] rounded-[100px] flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
          style={{ background: "#1d2132" }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round"/></svg>
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
      const isYourCollapsedAccount = collapsedAccount === null;
      const selectedAgent = !isYourCollapsedAccount ? agentAccounts.find(a => a.id === collapsedAccount) : null;

      const cardNode = (() => {
        if (isYourCollapsedAccount) {
          if (collapsedCardIndex === 0) return <WalletAddressCard account={resolvedWalletAccount as any} />;
          if (collapsedCardIndex === 1) return <DebitCardView account={liveDebit} />;
          return <BankAccountCard account={liveBank} />;
        }
        return <AgentDebitCard agentName={selectedAgent?.name || "Agent"} />;
      })();

      return (
        <div className="w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[16px] overflow-visible shadow-[0px_68px_27px_0px_rgba(0,0,0,0.06),0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34),0px_4px_9px_0px_rgba(0,0,0,0.39)]">
          {/* Header — Figma 3272:29911 */}
          <div className="flex items-center justify-between p-[16px] border-b border-[#1d2132]" style={{ backdropFilter: "blur(10px)", background: "#0a0c10" }}>
            <span className="font-['Gilroy:SemiBold',sans-serif] not-italic text-[#6c779d] text-[20px] leading-[24px] whitespace-nowrap">
              Accounts
            </span>
            <button
              onClick={() => setBankPopupOpen(false)}
              className="w-[24px] h-[24px] rounded-[100px] flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
              style={{ background: "#1d2132" }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Content — Figma 3272:29914: gap-[8px] p-[8px] */}
          <div className="flex flex-col gap-[8px] p-[8px]">

            {/* Account selector dropdown — Figma 3272:29915 */}
            <div className="relative" ref={collapsedDropdownRef}>
              {/* Trigger */}
              <button
                data-testid="button-account-dropdown"
                onClick={() => setCollapsedDropdownOpen(prev => !prev)}
                className="w-full h-[48px] px-[8px] flex items-center gap-[8px] transition-colors rounded-[8px]"
                style={{ background: "#222737" }}
              >
                {/* Icon — grey WalletIcons for Your Account, avatar for agent */}
                {isYourCollapsedAccount ? (
                  <div className="overflow-clip relative rounded-[16px] flex-shrink-0 size-[32px]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/4d294e06-5ab8-43ac-adc5-8045c1749ead" />
                    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 top-1/2 size-[20px]">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/2a6f2ee3-c539-45fe-b90e-f40419ef1ae0" />
                    </div>
                  </div>
                ) : (
                  <img alt={selectedAgent?.name} src={selectedAgent?.avatar} className="w-[32px] h-[32px] rounded-[16px] object-cover flex-shrink-0" />
                )}
                {/* Label: "Your Account" or agent name */}
                <div className="flex items-center flex-1 min-w-0 overflow-hidden">
                  <span className="font-['Gilroy:Medium',sans-serif] not-italic text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap truncate">
                    {isYourCollapsedAccount ? "Your Account" : (selectedAgent?.name ?? "Account")}
                  </span>
                </div>
                {/* Green checkmark + chevron */}
                <div className="flex items-center gap-[8px] flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="10" fill="#42BF23" opacity="0.25"/>
                    <circle cx="10" cy="10" r="7" fill="#42BF23"/>
                    <path d="M6.5 10l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={`transition-transform duration-200 ${collapsedDropdownOpen ? "rotate-180" : ""}`}>
                    <path d="M6 9L12 15L18 9" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </button>

              {/* Dropdown panel */}
              {collapsedDropdownOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-[4px] z-20 flex flex-col p-[8px] rounded-[12px]"
                  style={{ background: "#0a0c10", border: "1px solid #1d2132", boxShadow: "0px 38px 23px 0px rgba(0,0,0,0.2), 0px 17px 17px 0px rgba(0,0,0,0.34), 0px 4px 9px 0px rgba(0,0,0,0.39)" }}
                >
                  {/* Add Agent Account — purple CTA */}
                  <button
                    data-testid="button-add-agent-account"
                    onClick={() => { setCollapsedDropdownOpen(false); onCreateAgent(); }}
                    className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] mb-[2px] transition-opacity hover:opacity-90"
                    style={{ background: "#7631ee" }}
                  >
                    <div className="relative rounded-[100px] flex-shrink-0 size-[32px]">
                      <div className="absolute left-0 size-[32px] top-0">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/eb2ca186-716d-4140-8512-e6310165a194" />
                      </div>
                      <div className="absolute left-0 size-[32px] top-0">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/5ce65549-d182-416b-b8db-00ab75c927f4" />
                      </div>
                      <div className="absolute left-[8px] size-[16px] top-[8px]">
                        <div className="absolute inset-[-7.03%]">
                          <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/3a118be6-88b9-432b-b959-ce744d391877" />
                        </div>
                      </div>
                    </div>
                    <span className="font-['Gilroy:Medium',sans-serif] not-italic text-[16px] leading-[20px] whitespace-nowrap" style={{ color: "#240757" }}>
                      Add Agent Account
                    </span>
                  </button>

                  {/* WireX account rows */}
                  {[
                    { cardIdx: 0, label: "Crypto Account", tag: resolvedWalletAccount?.address ? `${resolvedWalletAccount.address.slice(0,6)}....${resolvedWalletAccount.address.slice(-4)}` : "——" },
                    { cardIdx: 1, label: "Debit Card",     tag: liveDebit?.cardNumber ?? "——" },
                    { cardIdx: 2, label: "Bank Account",   tag: liveBank?.iban ? `${liveBank.iban.slice(0,6)}...${liveBank.iban.slice(-4)}` : "——" },
                  ].map(({ cardIdx, label, tag }) => {
                    const isSel = isYourCollapsedAccount && collapsedCardIndex === cardIdx;
                    return (
                      <button
                        key={cardIdx}
                        data-testid={`button-account-${label.toLowerCase().replace(/\s/g, "-")}`}
                        onClick={() => { setCollapsedAccount(null); setActiveAccount(null); setCollapsedCardIndex(cardIdx); setActiveCard(cardIdx); setCollapsedAssetFilter("All"); setCollapsedTxFilter("All"); setCollapsedDropdownOpen(false); }}
                        className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] transition-colors hover:bg-[#1d2132]"
                      >
                        <div className="overflow-clip relative rounded-[16px] flex-shrink-0 size-[32px]">
                          <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/0fc453d5-9ce9-4497-800c-22b77f8743b4" />
                          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[20px] top-1/2">
                            <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/c47ef456-eaf4-482b-8378-0a71ff0e6df2" />
                          </div>
                        </div>
                        <span className="font-['Gilroy:Medium',sans-serif] not-italic text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap flex-1 text-left">
                          {label}
                        </span>
                        <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0" style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)" }}>
                          <span className="font-['Gilroy:SemiBold',sans-serif] not-italic text-[#6c779d] text-[11px] leading-[14px] whitespace-nowrap">{tag}</span>
                        </div>
                        {isSel && (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                            <circle cx="10" cy="10" r="10" fill="#42BF23" opacity="0.25"/>
                            <circle cx="10" cy="10" r="7" fill="#42BF23"/>
                            <path d="M6.5 10l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}

                  {/* Agent account rows */}
                  {agentAccounts.map((agent) => {
                    const isSel = collapsedAccount === agent.id;
                    return (
                      <button
                        key={agent.id}
                        data-testid={`button-account-agent-${agent.id}`}
                        onClick={() => { setCollapsedAccount(agent.id); setActiveAccount(agent.id); setActiveCard(0); setCollapsedDropdownOpen(false); }}
                        className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] transition-colors hover:bg-[#1d2132]"
                      >
                        <img alt={agent.name} src={agent.avatar} className="w-[32px] h-[32px] rounded-[16px] object-cover flex-shrink-0" />
                        <span className="font-['Gilroy:Medium',sans-serif] not-italic text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap flex-1 text-left">
                          {agent.name}
                        </span>
                        <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0" style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)" }}>
                          <span className="font-['Gilroy:SemiBold',sans-serif] not-italic text-[#6c779d] text-[11px] leading-[14px] whitespace-nowrap">{agent.type}</span>
                        </div>
                        {isSel && (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                            <circle cx="10" cy="10" r="10" fill="#42BF23" opacity="0.25"/>
                            <circle cx="10" cy="10" r="7" fill="#42BF23"/>
                            <path d="M6.5 10l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card preview — full 200px height, no scaling — Figma 3272:29922 */}
            <div className="relative rounded-[8px] overflow-hidden h-[200px]">
              <div className="relative h-[200px]">{cardNode}</div>
              {/* Pagination dots overlaid at bottom-centre (Your Account only) */}
              {isYourCollapsedAccount && (
                <div className="absolute bottom-[10px] left-1/2 -translate-x-1/2 flex items-center gap-[4px] z-10">
                  {CARDS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setCollapsedCardIndex(i); setCollapsedAssetFilter("All"); setCollapsedTxFilter("All"); }}
                      className={`rounded-full transition-all duration-300 ${i === collapsedCardIndex ? "w-[16px] h-[6px] bg-[#ff9500]" : "w-[6px] h-[6px] bg-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.6)]"}`}
                    />
                  ))}
                </div>
              )}
            </div>

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
        <div className={popupBase} style={{ maxHeight: "480px", display: "flex", flexDirection: "column" }}>
          {popupHeader("Assets")}
          {/* Content: tab bar + rows, all in one padded scrollable area */}
          <div className="flex flex-col gap-[16px] p-[8px] overflow-y-auto flex-1">
            {/* Tab bar — Figma TabAssets */}
            <div className="flex gap-[2px] items-center p-[2px] rounded-[400px] flex-shrink-0" style={{ background: "#06070a" }}>
              {collapsedAssetTabs.map(tab => {
                const isActive = safeFilter === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setCollapsedAssetFilter(tab)}
                    className="flex-1 flex items-center justify-center px-[16px] py-[8px] rounded-[100px] [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[14px] leading-[16px] transition-colors whitespace-nowrap"
                    style={{ background: isActive ? "#123509" : "#06070a", color: isActive ? "#42bf23" : "#414965" }}
                  >{tab}</button>
                );
              })}
            </div>
            {/* Asset rows */}
            <div className="flex flex-col gap-[16px]">
              {filteredAssets.length === 0 ? (
                <p className="text-center text-[#414965] text-[12px] py-4 [font-family:'Plus Jakarta Sans',Helvetica]">No assets in this category</p>
              ) : filteredAssets.map((asset, idx) => (
                <div key={`${asset.ticker}-${idx}`} className="flex flex-col gap-[16px]">
                  <div className="flex gap-[8px] items-center w-full">
                    <img className="w-[40px] h-[40px] flex-shrink-0" alt={asset.name} src={asset.icon} />
                    <div className="flex flex-1 gap-[8px] items-center justify-center min-w-0">
                      <div className="flex flex-col gap-[4px] items-start flex-shrink-0">
                        <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">{asset.name}</span>
                        <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-[14px] leading-[16px] whitespace-nowrap">{asset.ticker}</span>
                      </div>
                      <div className="flex flex-1 flex-col gap-[4px] items-end justify-center min-w-0">
                        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-[#42bf23] text-[16px] leading-[20px] text-right w-full">{asset.value}</span>
                        <span className="[font-family:'JetBrains_Mono',Helvetica] font-medium text-[#414965] text-[14px] leading-[16px] text-right w-full">{asset.amount}</span>
                      </div>
                    </div>
                  </div>
                  {idx < filteredAssets.length - 1 && <div className="h-px w-full" style={{ background: "#1d2132" }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    };

    const TransactionsPopup = () => {
      const safeFilter = collapsedTxTabs.includes(collapsedTxFilter) ? collapsedTxFilter : "All";
      const collapsedBaseTxs = collapsedCardIndex === 0
        ? [...walletCtxTxs, ...activeCollapsedData.transactions]
        : collapsedCardIndex === 2
          ? [...bankCtxTxs, ...activeCollapsedData.transactions]
          : activeCollapsedData.transactions;
      const filteredTx = collapsedBaseTxs.filter(t =>
        safeFilter === "Trades"      ? (t.type === "trade" || t.type === "exchange") :
        safeFilter === "Deposits"    ? t.type === "deposit"    :
        safeFilter === "Withdrawals" ? t.type === "withdrawal" : true
      );
      return (
        <div className={popupBase} style={{ maxHeight: "500px", display: "flex", flexDirection: "column" }}>
          {popupHeader("Transactions")}
          {/* Content: tab bar + rows, all in one padded scrollable area */}
          <div className="flex flex-col gap-[16px] p-[8px] overflow-y-auto flex-1">
            {/* Tab bar — Figma TabTrade */}
            <div className="flex gap-[2px] items-center p-[2px] rounded-[400px] flex-shrink-0" style={{ background: "#06070a" }}>
              {collapsedTxTabs.map(tab => {
                const isActive = safeFilter === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setCollapsedTxFilter(tab)}
                    className="flex-1 flex items-center justify-center px-[16px] py-[8px] rounded-[100px] [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[14px] leading-[16px] transition-colors whitespace-nowrap"
                    style={{ background: isActive ? "#123509" : "#06070a", color: isActive ? "#42bf23" : "#414965" }}
                  >{tab}</button>
                );
              })}
            </div>
            {/* Transaction rows */}
            <div className="flex flex-col gap-[16px]">
              {filteredTx.length === 0 ? (
                <p className="text-center text-[#414965] text-[12px] py-4 [font-family:'Plus Jakarta Sans',Helvetica]">No transactions in this category</p>
              ) : filteredTx.map((tx, idx) => (
                <div key={tx.id} className="flex flex-col gap-[16px]">
                  <div className="flex gap-[8px] items-center">
                    {/* 40×40 icon circle — Figma rounded-[160px] */}
                    <div
                      className="overflow-hidden relative rounded-[160px] flex-shrink-0 size-[40px] flex items-center justify-center"
                      style={{ background: tx.type === "deposit" ? "#123509" : tx.type === "withdrawal" ? "#350011" : "#1d2132" }}
                    >
                      {tx.type === "deposit" ? (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M15 5L5 15M5 15H13M5 15V7" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : tx.type === "withdrawal" ? (
                        <div style={{ transform: "scale(1,-1)" }}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M15 5L5 15M5 15H13M5 15V7" stroke="#d20344" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M4 8H16M4 8L7 5M4 8L7 11M16 12H4M16 12L13 9M16 12L13 15" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex flex-1 gap-[8px] items-center justify-center min-w-0">
                      <div className="flex flex-col gap-[4px] items-start flex-shrink-0">
                        <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">{tx.label}</span>
                        <div className="flex gap-[4px] items-center">
                          <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-[14px] leading-[16px] whitespace-nowrap">{tx.time}</span>
                          <div className="w-[3px] h-[3px] rounded-full flex-shrink-0" style={{ background: "#414965" }} />
                          <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#414965] text-[14px] leading-[16px] whitespace-nowrap">{tx.date}</span>
                        </div>
                      </div>
                      <span
                        className="flex-1 [font-family:'JetBrains_Mono',Helvetica] font-medium text-[20px] leading-[20px] text-right min-w-0"
                        style={{ color: tx.positive ? "#42bf23" : "#d20344" }}
                      >{tx.amount}</span>
                    </div>
                  </div>
                  {idx < filteredTx.length - 1 && <div className="h-px w-full" style={{ background: "#1d2132" }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex-shrink-0 self-stretch" style={{ overflow: "visible" }}>
        <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} excludeTypes={[]} />

        {/* Backdrop shade — appears behind popup, on top of main content */}
        {(hoveredIcon || bankPopupOpen) && (
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
              <path d="M9 6L6 9L9 12M7 9H14M17 17H3C1.89543 17 1 16.1046 1 15V3C1 1.89543 1.89543 1 3 1H17C18.1046 1 19 1.89543 19 3V15C19 16.1046 18.1046 17 17 17Z" stroke="#6C779D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* ── Horizontal divider ── */}
          <div className="w-[40px] h-px bg-[#1d2132] flex-shrink-0" />

          {/* ── "Wallet" label ── */}
          <span className="text-[#414965] text-[9px] [font-family:'Plus Jakarta Sans',Helvetica] uppercase tracking-[0.06em] select-none leading-[16px]">Wallet</span>

          {/* ── Bank icon: click-to-toggle popup ── */}
          <div className="relative flex-shrink-0" ref={bankPopupRef}>
            <button
              data-testid="button-collapsed-bank"
              onClick={() => { setBankPopupOpen(prev => !prev); setCollapsedDropdownOpen(false); }}
              className="w-[40px] h-[40px] rounded-[20px] overflow-clip relative transition-opacity"
            >
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={bankPopupOpen ? "https://www.figma.com/api/mcp/asset/e6bd9a4b-4a60-48b6-b928-10df6b0c8fd4" : "https://www.figma.com/api/mcp/asset/1734631d-84a1-45bd-98f1-2f2d8c1b152f"} />
              <div className="absolute left-[8px] size-[24px] top-[8px]">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={bankPopupOpen ? "https://www.figma.com/api/mcp/asset/a043cb65-5d92-4b12-b652-990f6365f14b" : "https://www.figma.com/api/mcp/asset/5b1a6f26-a8c2-47ab-b4fc-e85aa0796935"} />
              </div>
            </button>
            {bankPopupOpen && (
              <div
                className="absolute z-50"
                style={{ right: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" }}
              >
                <BankPopup />
              </div>
            )}
          </div>

          {/* ── Add icon: full circle ── */}
          <button
            data-testid="button-collapsed-add"
            onClick={() => setAddOpen(true)}
            className="w-[40px] h-[40px] flex-shrink-0 rounded-[100px] relative overflow-hidden transition-opacity opacity-80 hover:opacity-100"
          >
            <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/4851320b-a0c5-40fd-8118-2c173dfd25f1" />
            <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
              <div className="absolute inset-[16.67%]">
                <div className="absolute inset-[-6.25%]">
                  <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/c903837d-5e64-41ed-8a00-101d641016ee" />
                </div>
              </div>
            </div>
          </button>

          {/* ── Send icon: full circle ── */}
          <button
            data-testid="button-collapsed-send"
            onClick={() => onSend?.("wallet")}
            className="w-[40px] h-[40px] flex-shrink-0 rounded-[100px] relative overflow-hidden transition-opacity opacity-80 hover:opacity-100"
          >
            <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/bde98f2c-378d-4f45-ac22-10f078756f73" />
            <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
              <div className="absolute bottom-[26.04%] left-[26.04%] right-1/4 top-1/4">
                <div className="absolute inset-[-8.51%]">
                  <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/1e70a882-3832-44fc-8a11-dbfe44d2f995" />
                </div>
              </div>
            </div>
          </button>

          {/* ── Exchange icon: full circle ── */}
          <button
            data-testid="button-collapsed-exchange"
            onClick={() => onExchange?.(collapsedCardIndex === 2 ? "bank" : "wallet")}
            className="w-[40px] h-[40px] flex-shrink-0 rounded-[100px] relative overflow-hidden transition-opacity opacity-80 hover:opacity-100"
          >
            <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/edf0684e-1ba3-4bf5-811f-a38442ad4e9a" />
            <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
              <div className="absolute inset-[17.94%_16.48%_17.96%_16.47%]">
                <div className="absolute inset-[-6.5%_-6.21%]">
                  <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/96ab50bb-4215-4885-9dd4-3200d3eb521f" />
                </div>
              </div>
            </div>
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
              className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center transition-colors bg-[#11141b] overflow-clip relative"
            >
              {hoveredIcon === "transactions" ? (
                <div className="overflow-clip relative size-[24px]">
                  <div className="absolute inset-[12.08%_3.35%_12.09%_3.4%]">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/9f4b3667-896e-4f8e-84f3-ff3db0f1bbdf" />
                  </div>
                </div>
              ) : (
                <div className="overflow-clip relative size-[24px]">
                  <div className="absolute inset-[29.17%_41.67%]">
                    <div className="absolute inset-[-10%_-25%]">
                      <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/bbbbe5df-e21b-4e9f-8507-7555e90f6a33" />
                    </div>
                  </div>
                  <div className="absolute inset-[16.25%_7.52%_16.25%_7.56%]">
                    <div className="absolute inset-[-6.17%_-4.91%]">
                      <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/a81167fa-846b-456b-a37f-c387ca6add52" />
                    </div>
                  </div>
                </div>
              )}
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
        excludeTypes={[]}
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
              className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center rounded-[100px]"
              style={{ background: "#222737" }}
            >
              <svg width="18" height="16" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6L9 9L6 12M8 9H1M17 17H15C13.8954 17 13 16.1046 13 15V3C13 1.89543 13.8954 1 15 1H17C18.1046 1 19 1.89543 19 3V15C19 16.1046 18.1046 17 17 17Z" stroke="#6C779D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
              <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-brain-v1baby-blue-100 text-base tracking-[0] leading-5 whitespace-nowrap truncate">
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
                <div
                  className="absolute right-0 top-[calc(100%+6px)] w-[280px] z-[51] flex flex-col p-[8px] rounded-[12px]"
                  style={{ background: "#0a0c10", border: "1px solid #1d2132", boxShadow: "0px 38px 23px 0px rgba(0,0,0,0.2), 0px 17px 17px 0px rgba(0,0,0,0.34), 0px 4px 9px 0px rgba(0,0,0,0.39)" }}
                >
                  {/* Add Agent Account — purple CTA */}
                  <button
                    onClick={() => { setDropdownOpen(false); onCreateAgent(); }}
                    className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] mb-[2px] transition-opacity hover:opacity-90"
                    style={{ background: "#7631ee" }}
                  >
                    <div className="relative rounded-[100px] flex-shrink-0 size-[32px]">
                      <div className="absolute left-0 size-[32px] top-0">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/eb2ca186-716d-4140-8512-e6310165a194" />
                      </div>
                      <div className="absolute left-0 size-[32px] top-0">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/5ce65549-d182-416b-b8db-00ab75c927f4" />
                      </div>
                      <div className="absolute left-[8px] size-[16px] top-[8px]">
                        <div className="absolute inset-[-7.03%]">
                          <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/3a118be6-88b9-432b-b959-ce744d391877" />
                        </div>
                      </div>
                    </div>
                    <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[16px] leading-[20px] whitespace-nowrap" style={{ color: "#240757" }}>
                      Add Agent Account
                    </span>
                  </button>

                  {/* WireX account rows */}
                  {[
                    { id: null as null, cardIdx: 0, label: "Crypto Account", tag: resolvedWalletAccount?.address ? `${resolvedWalletAccount.address.slice(0,6)}....${resolvedWalletAccount.address.slice(-4)}` : "——" },
                    { id: null as null, cardIdx: 1, label: "Debit Card",         tag: liveDebit?.cardNumber ?? "——" },
                    { id: null as null, cardIdx: 2, label: "Bank Account",       tag: liveBank?.iban ? `${liveBank.iban.slice(0,6)}...${liveBank.iban.slice(-4)}` : "——" },
                  ].map(({ cardIdx, label, tag }) => {
                    const isSel = activeAccount === null && activeCard === cardIdx;
                    return (
                      <button
                        key={cardIdx}
                        onClick={() => { handleSwitchAccount(null); setActiveCard(cardIdx); setCollapsedAccount(null); setCollapsedCardIndex(cardIdx); setDropdownOpen(false); }}
                        className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] transition-colors hover:bg-[#1d2132]"
                      >
                        <div className="overflow-clip relative rounded-[16px] flex-shrink-0 size-[32px]">
                          <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/0fc453d5-9ce9-4497-800c-22b77f8743b4" />
                          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[20px] top-1/2">
                            <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/c47ef456-eaf4-482b-8378-0a71ff0e6df2" />
                          </div>
                        </div>
                        <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap flex-1 text-left">
                          {label}
                        </span>
                        <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0" style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)" }}>
                          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px] whitespace-nowrap">{tag}</span>
                        </div>
                        {isSel && (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                            <circle cx="10" cy="10" r="10" fill="#42BF23" opacity="0.25"/>
                            <circle cx="10" cy="10" r="7" fill="#42BF23"/>
                            <path d="M6.5 10l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}

                  {/* Agent account rows */}
                  {agentAccounts.map((agent) => {
                    const isSel = activeAccount === agent.id;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => { handleSwitchAccount(agent.id); setCollapsedAccount(agent.id); }}
                        className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] transition-colors hover:bg-[#1d2132]"
                      >
                        <img className="w-[32px] h-[32px] rounded-[16px] object-cover flex-shrink-0" alt={agent.name} src={agent.avatar} />
                        <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap flex-1 text-left">
                          {agent.name}
                        </span>
                        <div className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] flex-shrink-0" style={{ background: "#222737", border: "1px solid rgba(108,119,157,0.2)" }}>
                          <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-[11px] leading-[14px] whitespace-nowrap">{agent.type}</span>
                        </div>
                        {isSel && (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                            <circle cx="10" cy="10" r="10" fill="#42BF23" opacity="0.25"/>
                            <circle cx="10" cy="10" r="7" fill="#42BF23"/>
                            <path d="M6.5 10l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
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
                          action.label === "Exchange" ? () => onExchange?.(cardType) :
                          undefined
                        }
                        className="flex flex-col items-center justify-center gap-1 flex-1 cursor-pointer group"
                      >
                        <div className="relative w-10 h-10 bg-brain-v1dark-orange rounded-[100px] flex items-center justify-center group-hover:opacity-80 transition-opacity">
                          <img className="w-6 h-6" alt={action.label} src={action.icon} />
                        </div>
                        <span className="self-stretch [font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1baby-blue-60 group-hover:text-brain-v1white text-xs text-center leading-[14px] transition-colors">
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
                <div className="flex items-center gap-[16px] self-stretch w-full">
                  <button
                    onClick={() => setActiveTab("Assets")}
                    className="flex items-center gap-[6px] bg-transparent border-none p-0 cursor-pointer"
                  >
                    <svg width="24" height="22" viewBox="0 0 22 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14.3 4.44444C18.5526 4.44444 22 7.92667 22 12.2222C22 16.5178 18.5526 20 14.3 20C10.0474 20 6.6 16.5178 6.6 12.2222C6.6 7.92667 10.0474 4.44444 14.3 4.44444Z" fill={activeTab === "Assets" ? "#9d5cf5" : "#6c779d"}/>
                      <path d="M7.7 0C9.83147 0 11.7607 0.874835 13.1549 2.28841C8.2267 2.86175 4.4 7.09058 4.4 12.2222C4.4 13.1777 4.53253 14.1021 4.78027 14.9772C1.97542 13.8153 0 11.0295 0 7.77778C0 3.48223 3.44741 0 7.7 0Z" fill={activeTab === "Assets" ? "#9d5cf5" : "#6c779d"}/>
                    </svg>
                    <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[14px] leading-[16px] whitespace-nowrap transition-colors ${activeTab === "Assets" ? "text-brain-v1baby-blue-100" : "text-brain-v1baby-blue-30"}`}>
                      Assets
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("Transactions")}
                    className="flex items-center gap-[6px] bg-transparent border-none p-0 cursor-pointer"
                  >
                    {activeTab === "Transactions" ? (
                      <div className="overflow-clip relative size-[24px] flex-shrink-0">
                        <div className="absolute inset-[12.08%_3.35%_12.09%_3.4%]">
                          <img alt="" className="absolute block inset-0 max-w-none size-full" src="https://www.figma.com/api/mcp/asset/9f4b3667-896e-4f8e-84f3-ff3db0f1bbdf" />
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-clip relative size-[24px] flex-shrink-0">
                        <div className="absolute inset-[29.17%_41.67%]">
                          <div className="absolute inset-[-10%_-25%]">
                            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/bbbbe5df-e21b-4e9f-8507-7555e90f6a33" />
                          </div>
                        </div>
                        <div className="absolute inset-[16.25%_7.52%_16.25%_7.56%]">
                          <div className="absolute inset-[-6.17%_-4.91%]">
                            <img alt="" className="block max-w-none size-full" src="https://www.figma.com/api/mcp/asset/a81167fa-846b-456b-a37f-c387ca6add52" />
                          </div>
                        </div>
                      </div>
                    )}
                    <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[14px] leading-[16px] whitespace-nowrap transition-colors ${activeTab === "Transactions" ? "text-brain-v1baby-blue-100" : "text-brain-v1baby-blue-30"}`}>
                      Transactions
                    </span>
                  </button>
                </div>

                {/* Sub-filter pills — shown per tab */}
                {activeTab === "Assets" ? (
                  <div className="flex w-[370px] items-center gap-[2px] p-[2px] bg-[#06070a] rounded-[400px] overflow-hidden">
                    {filterTabs.map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`flex items-center justify-center px-[16px] py-[8px] flex-1 rounded-[100px] border-none cursor-pointer transition-colors ${activeFilter === filter ? "bg-[#123509]" : "bg-[#06070a]"}`}
                      >
                        <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[14px] leading-[16px] whitespace-nowrap ${activeFilter === filter ? "text-[#42bf23]" : "text-[#414965]"}`}>
                          {filter}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex w-[370px] items-center gap-[2px] p-[2px] bg-[#06070a] rounded-[400px] overflow-hidden">
                    {txFilterTabs.map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setTransactionFilter(filter)}
                        className={`flex items-center justify-center px-[16px] py-[8px] flex-1 rounded-[100px] border-none cursor-pointer transition-colors ${transactionFilter === filter ? "bg-[#123509]" : "bg-[#06070a]"}`}
                      >
                        <span className={`[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[14px] leading-[16px] whitespace-nowrap ${transactionFilter === filter ? "text-[#42bf23]" : "text-[#414965]"}`}>
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
                        <span className="text-xs [font-family:'Plus Jakarta Sans',Helvetica]">No {activeFilter.toLowerCase()} assets</span>
                      </div>
                    ) : filtered.map((asset, index) => (
                      <div key={`${asset.ticker}-${index}`} className="flex flex-col self-stretch w-full gap-4">
                        <div className="flex items-center gap-2 self-stretch w-full">
                          <img className="w-10 h-10 flex-shrink-0" alt={`${asset.name} icon`} src={asset.icon} />
                          <div className="flex items-center justify-center gap-2 flex-1">
                            <div className="inline-flex flex-col items-start gap-1 flex-shrink-0">
                              <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-brain-v1baby-blue-100 text-base leading-5 whitespace-nowrap">{asset.name}</span>
                              <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4 whitespace-nowrap">{asset.ticker}</span>
                            </div>
                            <div className="flex flex-col items-start justify-center gap-1 flex-1">
                              <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1green text-base text-right leading-5">{asset.value}</span>
                              <span className="self-stretch [font-family:'JetBrains_Mono',Helvetica] font-medium text-brain-v1baby-blue-30 text-sm text-right leading-4">{asset.amount}</span>
                            </div>
                          </div>
                        </div>
                        {index < filtered.length - 1 && (
                          <div className="self-stretch w-full h-px bg-[#1d2132] flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Transactions list */}
              {activeTab === "Transactions" && (() => {
                const filtered = txData.filter((t) =>
                  transactionFilter === "Exchanges"    ? (t.type === "trade" || t.type === "exchange") :
                  transactionFilter === "Deposits"     ? t.type === "deposit"    :
                  transactionFilter === "Withdrawals"  ? t.type === "withdrawal" : true
                );
                return (
                  <div className="flex flex-col items-start self-stretch w-full">
                    {filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 w-full gap-2 text-brain-v1baby-blue-30">
                        <span className="text-2xl">📋</span>
                        <span className="text-xs [font-family:'Plus Jakarta Sans',Helvetica]">No {transactionFilter.toLowerCase()} found</span>
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
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                              <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-brain-v1baby-blue-100 text-base leading-5 truncate">{tx.label}</span>
                              <div className="flex items-center gap-1">
                                <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4">{tx.time}</span>
                                <div className="w-1 h-1 bg-brain-v1baby-blue-30 rounded-full flex-shrink-0" />
                                <span className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-brain-v1baby-blue-30 text-sm leading-4">{tx.date}</span>
                              </div>
                              {tx.txHash && (
                                <a
                                  href={`https://basescan.org/tx/${tx.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="[font-family:'JetBrains_Mono',Helvetica] text-[10px] text-[#6c779d] hover:text-[#a8b9f4] transition-colors truncate"
                                  data-testid={`link-txhash-${tx.id}`}
                                >
                                  {tx.txHash.slice(0, 10)}…{tx.txHash.slice(-6)}
                                </a>
                              )}
                            </div>
                            <span className={`flex-shrink-0 [font-family:'JetBrains_Mono',Helvetica] font-medium text-base text-right leading-5 ${tx.positive ? "text-brain-v1green" : "text-brain-v1pink-red"}`}>
                              {tx.amount}
                            </span>
                          </div>
                        </div>
                        {index < filtered.length - 1 && (
                          <div className="self-stretch w-full h-px bg-[#1d2132] flex-shrink-0" />
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
