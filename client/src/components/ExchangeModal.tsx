import { useState, useMemo } from "react";
import { useAuth } from "@/lib/authContext";

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
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${
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
      <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#1d2131] bg-brain-v1baby-blue-15">
        <AssetIcon asset={asset} size={36} />
        <div className="flex-1 min-w-0">
          <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">{asset.name}</p>
          <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5">{asset.ticker} · {asset.balance}</p>
        </div>
        {(onEdit || readOnly) && (
          <button
            onClick={onEdit}
            className="px-3 py-1 bg-brain-v1dark-orange rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity flex-shrink-0"
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
      className="flex items-center justify-between w-full p-4 rounded-2xl border border-dashed border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965] transition-colors text-left"
      data-testid="btn-select-asset"
    >
      <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-60 text-sm">{placeholder}</span>
      <div className="w-7 h-7 rounded-full bg-brain-v1dark-orange flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2V10M2 6H10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
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
      <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-[#1d2131] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-2xl leading-tight">Select Asset</h2>
          <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-sm mt-0.5">Search or pick from your holdings</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0"
          data-testid="btn-search-close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex items-center gap-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl px-4 py-3 mb-5 focus-within:border-[#414965] transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="#6c779d" strokeWidth="1.3" />
            <path d="M10.5 10.5L13.5 13.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or ticker…"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            className="flex-1 bg-transparent outline-none text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder:text-brain-v1baby-blue-60"
            autoFocus
            data-testid="input-asset-search"
          />
        </div>
        <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs mb-3">All Assets</p>
        <div className="flex flex-col gap-2">
          {assets.map(asset => (
            <button
              key={asset.id}
              onClick={() => onSelect(asset)}
              className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                selected?.id === asset.id
                  ? "border-brain-v1dark-orange bg-[#2a1500]"
                  : "border-[#1d2131] bg-brain-v1baby-blue-15 hover:border-[#414965]"
              }`}
              data-testid={`btn-asset-${asset.id}`}
            >
              <AssetIcon asset={asset} size={36} />
              <div className="flex-1 min-w-0">
                <p className={`[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm transition-colors ${selected?.id === asset.id ? "text-brain-v1light-orange" : "text-brain-v1white"}`}>
                  {asset.name}
                </p>
                <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5">{asset.ticker} · {asset.balance}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                selected?.id === asset.id ? "border-brain-v1dark-orange bg-brain-v1dark-orange" : "border-brain-v1baby-blue-30"
              }`}>
                {selected?.id === asset.id && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
          ))}
          {assets.length === 0 && (
            <p className="text-brain-v1baby-blue-60 text-sm text-center py-6 [font-family:'Gilroy-Medium',Helvetica]">No assets found</p>
          )}
        </div>
      </div>
    </>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ExchangeModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<"from" | "to">("from");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromAsset, setFromAsset] = useState<Asset | null>(null);
  const [toAsset, setToAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { wirexAccounts } = useAuth();
  const walletAcc = wirexAccounts.find(a => a.type === "wallet");
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
      setConfirmed(false);
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
    setTimeout(() => { setConfirming(false); setConfirmed(true); }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-[500px] max-h-[90vh] flex flex-col bg-[#0d1017] border border-[#1d2131] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Success overlay */}
        {confirmed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d1017] gap-4 px-8">
            <div className="w-16 h-16 rounded-full bg-brain-v1dark-green flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M5 14L11 20L23 8" stroke="#42bf23" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-2xl">Exchange Submitted!</h3>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-1">
                {amount} {fromAsset?.ticker} → {toAsset?.ticker} is being processed.
              </p>
            </div>
            <div className="w-full bg-brain-v1baby-blue-15 rounded-2xl p-4 text-left space-y-2">
              <div className="flex justify-between items-center">
                <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">From</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs">{fromAsset?.name} ({fromAsset?.ticker})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">To</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs">{toAsset?.name} ({toAsset?.ticker})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">Amount</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs">{amount} {fromAsset?.ticker}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">Status</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1green text-xs">Confirmed</span>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-full py-3.5 bg-brain-v1dark-orange rounded-2xl text-brain-v1light-orange [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:opacity-80 transition-opacity"
            >
              Done
            </button>
          </div>
        )}

        {/* SEARCH SUB-PANEL */}
        {!confirmed && searchOpen ? (
          <SearchPanel
            query={searchQuery}
            onQueryChange={setSearchQuery}
            assets={filteredAssets}
            selected={currentSelected}
            onSelect={selectAsset}
            onClose={() => setSearchOpen(false)}
          />
        ) : !confirmed ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-[#1d2131] flex-shrink-0">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0"
                  data-testid="btn-modal-back"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8 2L4 6L8 10" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-2xl leading-tight">
                  {step === 4 ? "Review Details" : "Exchange Asset"}
                </h2>
                <p className="[font-family:'Gilroy-Medium',Helvetica] text-[#414965] text-sm mt-0.5">
                  {stepLabels[step - 1]}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={`w-6 h-1.5 rounded-full transition-colors ${n <= step ? "bg-brain-v1green" : "bg-[#1d2131]"}`}
                  />
                ))}
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0"
                data-testid="btn-exchange-close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1L9 9M9 1L1 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* STEP 1 — Select From Asset */}
              {step === 1 && (
                <div className="flex flex-col gap-3">
                  <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                    Choose which asset you'd like to exchange.
                  </p>
                  <AssetSelectCard
                    asset={fromAsset}
                    placeholder="Select an asset to exchange from"
                    onOpen={() => openSearch("from")}
                    onEdit={() => openSearch("from")}
                  />
                </div>
              )}

              {/* STEP 2 — Enter Amount */}
              {step === 2 && (
                <div className="flex flex-col gap-3">
                  <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                    Enter the amount you'd like to exchange.
                  </p>
                  <div>
                    <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#414965] text-base block mb-2">Amount</label>
                    <div className="flex items-center bg-[#222737] rounded-2xl px-4 h-14">
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-transparent outline-none text-white text-xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold placeholder:text-[#414965] min-w-0"
                        data-testid="input-exchange-amount"
                      />
                      <span className="text-[#414965] text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ml-2 flex-shrink-0">
                        {fromAsset?.ticker ?? ""}
                      </span>
                    </div>
                    {fromAsset && (
                      <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs mt-1.5">
                        Available: {fromAsset.balance}
                      </p>
                    )}
                    {amountExceedsBalance && (
                      <p className="[font-family:'Gilroy-Medium',Helvetica] text-red-400 text-xs mt-1">
                        Amount exceeds your available balance of {fromAsset?.balance}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3 — Select To Asset */}
              {step === 3 && (
                <div className="flex flex-col gap-3">
                  <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                    Choose which asset you'd like to receive.
                  </p>

                  <div>
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs mb-2">Current Asset</p>
                    <AssetSelectCard
                      asset={fromAsset}
                      placeholder=""
                      onEdit={() => { setStep(1); }}
                      readOnly
                    />
                  </div>

                  <div className="flex justify-center my-1">
                    <div className="w-10 h-10 rounded-full bg-brain-v1dark-orange flex items-center justify-center shadow-lg">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M5 3L5 17M5 17L2 14M5 17L8 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 17L15 3M15 3L12 6M15 3L18 6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  <div>
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs mb-2">Target Asset</p>
                    <AssetSelectCard
                      asset={toAsset}
                      placeholder="Select an asset to exchange into"
                      onOpen={() => openSearch("to")}
                      onEdit={() => openSearch("to")}
                    />
                  </div>

                  {toAsset && fromAsset && toAsset.id === fromAsset.id && (
                    <p className="[font-family:'Gilroy-Medium',Helvetica] text-red-400 text-xs">
                      Target asset must be different from source asset.
                    </p>
                  )}
                </div>
              )}

              {/* STEP 4 — Review */}
              {step === 4 && (
                <div className="flex flex-col gap-3">
                  <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm">
                    Confirm the details before submitting your exchange.
                  </p>

                  {/* From asset */}
                  <div>
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs mb-2">Exchanging From</p>
                    <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#1d2131] bg-brain-v1baby-blue-15">
                      {fromAsset && <AssetIcon asset={fromAsset} size={36} />}
                      <div className="flex-1 min-w-0">
                        <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">{fromAsset?.name}</p>
                        <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5">{fromAsset?.ticker} · {fromAsset?.balance}</p>
                      </div>
                      <button
                        onClick={() => setStep(1)}
                        className="px-3 py-1 bg-brain-v1dark-orange rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity flex-shrink-0"
                        data-testid="btn-edit-from"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* To asset */}
                  <div>
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs mb-2">Exchanging To</p>
                    <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#1d2131] bg-brain-v1baby-blue-15">
                      {toAsset && <AssetIcon asset={toAsset} size={36} />}
                      <div className="flex-1 min-w-0">
                        <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">{toAsset?.name}</p>
                        <p className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5">{toAsset?.ticker} · {toAsset?.balance}</p>
                      </div>
                      <button
                        onClick={() => setStep(3)}
                        className="px-3 py-1 bg-brain-v1dark-orange rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity flex-shrink-0"
                        data-testid="btn-edit-to"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs mb-2">Exchange Amount</p>
                    <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#1d2131] bg-brain-v1baby-blue-15">
                      <div className="flex-1 min-w-0">
                        <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">
                          {parseFloat(amount || "0").toLocaleString()} <span className="text-brain-v1baby-blue-60">{fromAsset?.ticker}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => setStep(2)}
                        className="px-3 py-1 bg-brain-v1dark-orange rounded-full text-brain-v1light-orange text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity flex-shrink-0"
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
            <div className="px-6 py-5 border-t border-[#1d2131] flex-shrink-0">
              {step < 4 ? (
                <button
                  onClick={() => setStep((s) => (s + 1) as Step)}
                  disabled={!canContinue}
                  className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-base transition-all ${
                    canContinue
                      ? "bg-brain-v1dark-orange text-brain-v1light-orange hover:opacity-80"
                      : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed opacity-50"
                  }`}
                  data-testid="btn-exchange-next"
                >
                  Continue
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex items-center justify-center gap-2 w-full py-4 bg-brain-v1dark-green rounded-2xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1green text-base hover:opacity-80 transition-opacity disabled:opacity-50"
                  data-testid="btn-exchange-confirm"
                >
                  {confirming ? (
                    <>
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                        <path d="M7 2A5 5 0 0112 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Confirming…
                    </>
                  ) : (
                    <>Confirm & Exchange</>
                  )}
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
