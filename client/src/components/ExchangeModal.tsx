import { useState, useMemo } from "react";
import { useAuth } from "@/lib/authContext";
import { useTransactions, generateTxHash } from "@/lib/transactionContext";

type Step = 1 | 2 | 3 | 4;

interface Asset {
  id: string;
  name: string;
  ticker: string;
  color: string;
  letter: string;
  balance: string;
  icon?: string;
}

const allAssets: Asset[] = [
  { id: "btc",  name: "Bitcoin",       ticker: "BTC",  color: "#f7931a", letter: "₿",  balance: "0.842 BTC",    icon: undefined },
  { id: "eth",  name: "Ethereum",      ticker: "ETH",  color: "#627eea", letter: "Ξ",  balance: "1.245 ETH",    icon: "/figmaAssets/crypto-icons.svg" },
  { id: "bnb",  name: "Binance Coin",  ticker: "BNB",  color: "#f3ba2f", letter: "B",  balance: "1.245 BNB",    icon: "/figmaAssets/crypto-icons-2.svg" },
  { id: "dai",  name: "Dai",           ticker: "DAI",  color: "#f5ac37", letter: "◈",  balance: "500 DAI",      icon: undefined },
  { id: "bch",  name: "Bitcoin Cash",  ticker: "BCH",  color: "#8dc351", letter: "₿",  balance: "2.5 BCH",      icon: undefined },
  { id: "eos",  name: "EOS",           ticker: "EOS",  color: "#2a2a2a", letter: "E",  balance: "100 EOS",      icon: undefined },
  { id: "dash", name: "Dash",          ticker: "DASH", color: "#008de4", letter: "D",  balance: "15 DASH",      icon: undefined },
  { id: "usd",  name: "Dollar",        ticker: "USD",  color: "#2c9f6b", letter: "$",  balance: "10,000 USD",   icon: "/figmaAssets/crypto-icons-3.svg" },
  { id: "matic",name: "Polygon",       ticker: "MATIC",color: "#8247e5", letter: "◆",  balance: "295.23 MATIC", icon: "/figmaAssets/crypto-icons-1.svg" },
];

function AssetIcon({ asset, size = 32 }: { asset: Asset; size?: number }) {
  const s = `${size}px`;
  if (asset.icon) {
    return <img src={asset.icon} alt={asset.ticker} style={{ width: s, height: s }} className="rounded-full flex-shrink-0" />;
  }
  return (
    <div
      style={{ width: s, height: s, background: asset.color }}
      className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold"
      data-testid={`asset-icon-${asset.id}`}
    >
      <span style={{ fontSize: `${size * 0.45}px` }}>{asset.letter}</span>
    </div>
  );
}

const stepLabels = ["From Asset", "Amount", "To Asset", "Review"];

const StepDot = ({ n, current }: { n: number; current: number }) => (
  <div className="flex items-center">
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs [font-family:'Plus Jakarta Sans',Helvetica] font-semibold transition-colors ${
        n < current
          ? "bg-brain-v1green text-white"
          : n === current
          ? "bg-brain-v1dark-orange text-brain-v1light-orange"
          : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30"
      }`}
    >
      {n < current ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : n}
    </div>
    {n < 4 && (
      <div className={`w-8 h-px mx-1 transition-colors ${n < current ? "bg-brain-v1green" : "bg-brain-v1baby-blue-15"}`} />
    )}
  </div>
);

function AssetSelectCard({
  asset,
  placeholder,
  onOpen,
  onEdit,
  readOnly,
}: {
  asset: Asset | null;
  placeholder: string;
  onOpen?: () => void;
  onEdit?: () => void;
  readOnly?: boolean;
}) {
  if (asset) {
    return (
      <div className="flex items-center gap-[8px] bg-[#06070a] border border-[#1d2132] h-[56px] rounded-[16px] px-[16px] py-[10px] w-full shrink-0">
        <div className="flex flex-1 gap-[8px] items-center min-w-0">
          <AssetIcon asset={asset} size={32} />
          <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#a8b9f4] text-[16px] leading-[24px] truncate">
            {asset.name} <span className="text-[#6c779d]">({asset.ticker})</span>
          </p>
        </div>
        {(onEdit || readOnly) && (
          <button
            onClick={onEdit}
            className="bg-[#4a2300] px-[12px] py-[8px] rounded-[100px] text-[#ff9500] text-[12px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold shrink-0 hover:opacity-80 transition-opacity"
            data-testid="btn-edit-asset"
          >
            Edit
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-[8px] bg-[#222737] h-[56px] rounded-[16px] px-[16px] py-[10px] w-full text-left hover:bg-[#2a2f45] transition-colors"
      data-testid="btn-select-asset"
    >
      <span className="flex-1 [font-family:'Plus Jakarta Sans',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px]">{placeholder}</span>
      <div className="size-[32px] rounded-[100px] bg-[#1d2132] flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2V12M2 7H12" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </button>
  );
}

function SearchPanel({
  query,
  onQueryChange,
  assets,
  selected,
  onSelect,
  onClose,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  assets: Asset[];
  selected: Asset | null;
  onSelect: (a: Asset) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="backdrop-blur-[10px] flex items-center justify-between p-[16px] flex-shrink-0 w-full">
        <p className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#6c779d] text-[20px] leading-[24px]">
          Select Asset
        </p>
        <button
          onClick={onClose}
          className="size-[24px] rounded-[100px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors flex-shrink-0"
          data-testid="btn-search-close"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 1L7 7M7 1L1 7" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[8px] p-[8px]">
          {/* Search field */}
          <div className="bg-[#222737] border border-[#414965] rounded-[8px] p-[8px] flex gap-[8px] items-center w-full">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <circle cx="6.5" cy="6.5" r="4" stroke="#6c779d" strokeWidth="1.3" />
              <path d="M10 10L13.5 13.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or ticker…"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              className="flex-1 bg-transparent outline-none text-white text-[16px] [font-family:'Plus Jakarta Sans',Helvetica] placeholder:text-[#6c779d] min-w-0"
              autoFocus
              data-testid="input-asset-search"
            />
            {query && (
              <button
                onClick={() => onQueryChange("")}
                className="size-[16px] rounded-[30px] bg-[#414965] flex items-center justify-center flex-shrink-0 hover:bg-[#6c779d] transition-colors"
                data-testid="btn-search-clear"
              >
                <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                  <path d="M1 1L6 6M6 1L1 6" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Section label + asset list */}
          <div className="flex flex-col items-start w-full">
            <div className="flex items-center px-[8px] w-full">
              <p className="[font-family:'Plus Jakarta Sans',Helvetica] font-semibold text-[#6c779d] text-[15px] tracking-[-0.6px] leading-[24px]">
                {query ? "Search Results" : "All Assets"}
              </p>
            </div>
            <div className="flex flex-col w-full">
              {assets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => onSelect(asset)}
                  className={`flex items-center justify-between p-[8px] rounded-[8px] w-full text-left transition-colors ${
                    selected?.id === asset.id ? "bg-[#11141b]" : "hover:bg-[#0d1017]"
                  }`}
                  data-testid={`btn-asset-${asset.id}`}
                >
                  <div className="flex gap-[8px] items-center flex-shrink-0">
                    <AssetIcon asset={asset} size={32} />
                    <div className="flex flex-col gap-0.5">
                      <p className="[font-family:'Plus Jakarta Sans',Helvetica] font-medium text-[#a8b9f4] text-[16px] leading-[24px] whitespace-nowrap">
                        {asset.name} ({asset.ticker})
                      </p>
                      <p className="[font-family:'JetBrains_Mono',Helvetica] text-[#6c779d] text-xs">
                        {asset.balance}
                      </p>
                    </div>
                  </div>
                  {/* Radio */}
                  <div
                    className="overflow-clip flex-shrink-0 size-[20px] rounded-full relative"
                    style={
                      selected?.id === asset.id
                        ? { background: "#123509", border: "1px solid rgba(66,191,35,0.2)" }
                        : { background: "#06070a", border: "1px solid #222737" }
                    }
                  >
                    {selected?.id === asset.id && (
                      <svg
                        className="absolute inset-[20%]"
                        viewBox="0 0 10 10" fill="none"
                      >
                        <path d="M1.5 5L4 7.5L8.5 2" stroke="#42bf23" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
              {assets.length === 0 && (
                <p className="text-[#6c779d] text-sm text-center py-6 [font-family:'Plus Jakarta Sans',Helvetica]">No assets found</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirmed?: () => void;
}

export function ExchangeModal({ open, onClose, onConfirmed }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<"from" | "to">("from");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromAsset, setFromAsset] = useState<Asset | null>(null);
  const [toAsset, setToAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { wirexAccounts } = useAuth();
  const walletAcc = wirexAccounts.find(a => a.type === "wallet");
  const { addTransaction } = useTransactions();
  const liveAllAssets = useMemo(() =>
    allAssets.map(a => a.id === "usd" ? { ...a, balance: walletAcc?.balance ? `${walletAcc.balance} USD` : a.balance } : a),
    [walletAcc?.balance]
  );

  if (!open) return null;

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(1);
      setFromAsset(null);
      setToAsset(null);
      setAmount("");
      setSearchOpen(false);
      setConfirming(false);
    }, 300);
  };

  const openSearch = (target: "from" | "to") => {
    setSearchTarget(target);
    setSearchQuery("");
    setSearchOpen(true);
  };

  const selectAsset = (asset: Asset) => {
    if (searchTarget === "from") setFromAsset(asset);
    else setToAsset(asset);
    setSearchOpen(false);
  };

  const filteredAssets = liveAllAssets.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.ticker.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentSelected = searchTarget === "from" ? fromAsset : toAsset;

  const fromBalanceNum = fromAsset ? parseFloat(fromAsset.balance.split(" ")[0].replace(/,/g, "")) : 0;
  const amountNum = parseFloat(amount || "0");
  const amountExceedsBalance = fromAsset !== null && amountNum > 0 && amountNum > fromBalanceNum;

  const canContinue = (() => {
    if (step === 1) return fromAsset !== null;
    if (step === 2) return amountNum > 0 && !amountExceedsBalance;
    if (step === 3) return toAsset !== null && toAsset.id !== fromAsset?.id;
    return true;
  })();

  const handleConfirm = () => {
    setConfirming(true);
    const snapFrom  = fromAsset;
    const snapTo    = toAsset;
    const snapAmt   = amount;
    setTimeout(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
      const dateStr = `${now.getDate()} ${now.toLocaleString("en-US", { weekday: "short" })}`;
      const amtNum = parseFloat(snapAmt || "0");
      addTransaction({
        type: "exchange",
        label: `Exchanged ${amtNum} ${snapFrom?.ticker ?? ""} → ${snapTo?.ticker ?? ""}`,
        time: timeStr,
        date: dateStr,
        amount: `-${amtNum} ${snapFrom?.ticker ?? ""}`,
        positive: false,
        txHash: generateTxHash(),
        accountId: null,
      });
      // Auto-close and signal parent to show the Exchanges tab
      onClose();
      onConfirmed?.();
      // Reset internal state after close animation
      setTimeout(() => {
        setStep(1);
        setFromAsset(null);
        setToAsset(null);
        setAmount("");
        setSearchOpen(false);
        setConfirming(false);
      }, 300);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-[420px] max-h-[90vh] flex flex-col bg-[#0a0c10] border border-[#1d2132] rounded-[24px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* SEARCH SUB-PANEL */}
        {searchOpen ? (
          <SearchPanel
            query={searchQuery}
            onQueryChange={setSearchQuery}
            assets={filteredAssets}
            selected={currentSelected}
            onSelect={selectAsset}
            onClose={() => setSearchOpen(false)}
          />
        ) : (
          <>
            {/* Header */}
            <div className="backdrop-blur-[10px] bg-[rgba(10,12,16,0.8)] border-b border-[#1d2132] flex-shrink-0 h-[56px] relative flex items-center justify-center w-full">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  className="absolute left-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
                  data-testid="btn-modal-back"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8 2L4 6L8 10" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              <div className="flex items-center justify-center h-[24px] px-[12px] py-[8px] rounded-[100px]" style={{ background: "#12032D" }}>
                <div className="flex items-center gap-[8px]">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="rounded-full shrink-0 transition-colors duration-300"
                      style={{ width: 8, height: 8, background: n <= step ? "#7631EE" : "#240757" }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={handleClose}
                className="absolute right-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
                data-testid="btn-exchange-close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1L9 9M9 1L1 9" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* STEP 1 — Select From Asset */}
              {step === 1 && (
                <div className="flex flex-col gap-[24px]">
                  <div className="flex flex-col">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Exchange Asset</p>
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#414965] text-[22px] leading-[28px]">What are we exchanging from?</p>
                  </div>
                  <div className="flex flex-col gap-[4px]">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Current Asset</p>
                    <AssetSelectCard
                      asset={fromAsset}
                      placeholder="Select asset"
                      onOpen={() => openSearch("from")}
                      onEdit={() => openSearch("from")}
                    />
                  </div>
                </div>
              )}

              {/* STEP 2 — Enter Amount */}
              {step === 2 && (
                <div className="flex flex-col gap-[24px]">
                  <div className="flex flex-col">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Exchange Amount</p>
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#414965] text-[22px] leading-[28px]">How much to exchange?</p>
                  </div>
                  <div className="flex flex-col gap-[8px]">
                    <div className="flex items-center gap-[2px] bg-[#222737] border border-[#6c779d] h-[56px] rounded-[16px] px-[16px] py-[10px]">
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-transparent outline-none text-white text-[20px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold placeholder:text-[#414965] min-w-0"
                        data-testid="input-exchange-amount"
                        autoFocus
                      />
                      <div className="bg-[#11141b] px-[6px] py-[2px] rounded-[100px] shrink-0 ml-2">
                        <span className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[12px]">
                          {fromAsset?.ticker ?? "USD"}
                        </span>
                      </div>
                    </div>
                    {fromAsset && (
                      <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#6c779d] text-[12px]">
                        Available: {fromAsset.balance}
                      </p>
                    )}
                    {amountExceedsBalance && (
                      <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-red-400 text-[12px]">
                        Amount exceeds your available balance of {fromAsset?.balance}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3 — Select To Asset */}
              {step === 3 && (
                <div className="flex flex-col gap-[24px]">
                  <div className="flex flex-col">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Exchange Asset</p>
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#414965] text-[22px] leading-[28px]">What are we exchanging to?</p>
                  </div>

                  <div className="flex flex-col gap-[24px] items-center">
                    <div className="flex flex-col gap-[4px] w-full">
                      <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Current Asset</p>
                      <AssetSelectCard
                        asset={fromAsset}
                        placeholder=""
                        onEdit={() => setStep(1)}
                        readOnly
                      />
                    </div>

                    <div className="size-[40px] rounded-[100px] bg-[#1d2132] flex items-center justify-center shrink-0">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M5 3L5 17M5 17L2 14M5 17L8 14" stroke="#6c779d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 17L15 3M15 3L12 6M15 3L18 6" stroke="#6c779d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    <div className="flex flex-col gap-[4px] w-full">
                      <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Target Asset</p>
                      <AssetSelectCard
                        asset={toAsset}
                        placeholder="Select asset"
                        onOpen={() => openSearch("to")}
                        onEdit={() => openSearch("to")}
                      />
                    </div>
                  </div>

                  {toAsset && fromAsset && toAsset.id === fromAsset.id && (
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-red-400 text-[12px]">
                      Target asset must be different from source asset.
                    </p>
                  )}
                </div>
              )}

              {/* STEP 4 — Review */}
              {step === 4 && (
                <div className="flex flex-col gap-[12px]">
                  {/* From account (wallet/bank) */}
                  <div className="flex flex-col gap-[4px]">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Exchanging From</p>
                    <div className="flex items-center gap-[8px] bg-[#06070a] border border-[#1d2132] h-[56px] rounded-[16px] px-[16px] py-[10px]">
                      <div className="size-[32px] rounded-[16px] bg-[#1d2132] flex items-center justify-center shrink-0 overflow-hidden">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="1" y="5" width="14" height="9" rx="1.5" stroke="#a8b9f4" strokeWidth="1.2"/>
                          <path d="M1 8h14" stroke="#a8b9f4" strokeWidth="1.2"/>
                          <circle cx="11.5" cy="10.5" r="1" fill="#a8b9f4"/>
                          <path d="M4.5 5V4a3 3 0 0 1 7 0v1" stroke="#a8b9f4" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 truncate">
                        {walletAcc ? "Stablecoin Account" : "Your Wallet"}
                      </p>
                    </div>
                  </div>

                  {/* From asset */}
                  <div className="flex flex-col gap-[4px]">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Current Asset</p>
                    <div className="flex items-center gap-[8px] bg-[#06070a] border border-[#1d2132] h-[56px] rounded-[16px] px-[16px] py-[10px]">
                      <div className="flex flex-1 gap-[8px] items-center min-w-0">
                        {fromAsset && <AssetIcon asset={fromAsset} size={32} />}
                        <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[32px] truncate">
                          {fromAsset?.name} ({fromAsset?.ticker})
                        </p>
                      </div>
                      <button
                        onClick={() => openSearch("from")}
                        className="bg-[#4a2300] px-[12px] py-[8px] rounded-[100px] text-[#ff9500] text-[12px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold shrink-0 hover:opacity-80 transition-opacity"
                        data-testid="btn-edit-from"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* To asset */}
                  <div className="flex flex-col gap-[4px]">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Target Asset</p>
                    <div className="flex items-center gap-[8px] bg-[#06070a] border border-[#1d2132] h-[56px] rounded-[16px] px-[16px] py-[10px]">
                      <div className="flex flex-1 gap-[8px] items-center min-w-0">
                        {toAsset && <AssetIcon asset={toAsset} size={32} />}
                        <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[32px] truncate">
                          {toAsset?.name} ({toAsset?.ticker})
                        </p>
                      </div>
                      <button
                        onClick={() => openSearch("to")}
                        className="bg-[#4a2300] px-[12px] py-[8px] rounded-[100px] text-[#ff9500] text-[12px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold shrink-0 hover:opacity-80 transition-opacity"
                        data-testid="btn-edit-to"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="flex flex-col gap-[4px]">
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Exchange Amount</p>
                    <div className="flex items-center gap-[8px] bg-[#06070a] border border-[#1d2132] h-[56px] rounded-[16px] px-[16px] py-[10px]">
                      <div className="flex flex-1 gap-[8px] items-center min-w-0">
                        <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px]">
                          {parseFloat(amount || "0").toLocaleString()}
                        </p>
                        <div className="bg-[#11141b] px-[6px] py-[2px] rounded-[100px]">
                          <p className="[font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[12px]">
                            {fromAsset?.ticker}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setStep(2)}
                        className="bg-[#4a2300] px-[12px] py-[8px] rounded-[100px] text-[#ff9500] text-[12px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold shrink-0 hover:opacity-80 transition-opacity"
                        data-testid="btn-edit-amount"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="px-6 py-5 border-t border-[#1d2132] flex-shrink-0">
              {step < 4 ? (
                <div className="flex gap-[16px]">
                  <button
                    onClick={handleClose}
                    className="flex-1 h-[48px] bg-[#11141b] rounded-[100px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
                    data-testid="btn-exchange-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setStep((s) => (s + 1) as Step)}
                    disabled={!canContinue}
                    className="flex-1 h-[48px] bg-[#4a2300] rounded-[100px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity disabled:opacity-40"
                    data-testid="btn-exchange-next"
                  >
                    Next
                  </button>
                </div>
              ) : (
                <div className="flex gap-[16px]">
                  <button
                    onClick={handleClose}
                    className="flex-1 h-[48px] bg-[#11141b] rounded-[100px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
                    data-testid="btn-exchange-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="flex-1 h-[48px] bg-[#123509] rounded-[100px] [font-family:'Plus Jakarta Sans',sans-serif] font-semibold text-[#42bf23] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity disabled:opacity-50"
                    data-testid="btn-exchange-confirm"
                  >
                    {confirming ? "Confirming…" : "Confirm"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
