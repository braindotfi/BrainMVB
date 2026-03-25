import { useState } from "react";

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

const sourceAccount = { name: "Stablecoin Account", color: "#7631ee" };

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

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all ${i < current ? "w-2 h-2 bg-[#7631ee]" : "w-2 h-2 bg-[#2a3050]"}`}
        />
      ))}
    </div>
  );
}

function ModalHeader({
  onBack,
  title,
  step,
  totalSteps,
  centered,
}: {
  onBack: () => void;
  title?: string;
  step?: number;
  totalSteps?: number;
  centered?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <button
        onClick={onBack}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a1e2e] hover:bg-[#222737] transition-colors flex-shrink-0"
        data-testid="btn-modal-back"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8L10 13" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {centered && title ? (
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-base flex-1 text-center">{title}</span>
      ) : (
        <div className="flex-1" />
      )}
      {step && totalSteps ? (
        <StepDots current={step} total={totalSteps} />
      ) : (
        <div className="w-8" />
      )}
    </div>
  );
}

function AssetDropdownRow({
  asset,
  placeholder,
  onOpen,
  onEdit,
  label,
  readOnly,
}: {
  asset: Asset | null;
  placeholder: string;
  onOpen?: () => void;
  onEdit?: () => void;
  label?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      {label && (
        <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs mb-2 uppercase tracking-wider">
          {label}
        </p>
      )}
      {asset ? (
        <div className="flex items-center gap-3 bg-[#0e1118] rounded-2xl px-3 py-2.5 border border-[#1d2132]">
          <AssetIcon asset={asset} size={32} />
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm flex-1">
            {asset.name} ({asset.ticker})
          </span>
          {(onEdit || readOnly) && (
            <button
              onClick={onEdit}
              className="px-2.5 py-1 bg-[#4a2300] rounded-full text-[#ff9500] text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity flex-shrink-0"
              data-testid="btn-edit-asset"
            >
              Edit
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={onOpen}
          className="flex items-center justify-between w-full bg-[#0e1118] rounded-2xl px-4 py-3 border border-[#1d2132] hover:border-[#414965] transition-colors"
          data-testid="btn-select-asset"
        >
          <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#6c779d] text-sm">
            {placeholder}
          </span>
          <div className="w-6 h-6 rounded-full bg-[#7631ee] flex items-center justify-center flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 2V8M2 5H8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </button>
      )}
    </div>
  );
}

function CancelNextButtons({
  onCancel,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextGreen = false,
}: {
  onCancel: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextGreen?: boolean;
}) {
  return (
    <div className="flex gap-3 mt-6">
      <button
        onClick={onCancel}
        className="flex-1 py-2.5 rounded-[100px] bg-[#1a1e2e] text-[#6c779d] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:bg-[#222737] transition-colors"
        data-testid="btn-exchange-cancel"
      >
        Cancel
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={`flex-1 py-2.5 rounded-[100px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm transition-all ${
          nextGreen
            ? "bg-[#1a3a1a] text-[#3ecf4d] hover:opacity-80"
            : nextDisabled
            ? "bg-[#1a1e2e] text-[#414965] cursor-not-allowed"
            : "bg-[#ff9500] text-[#11141b] hover:opacity-90"
        }`}
        data-testid="btn-exchange-next"
      >
        {nextLabel}
      </button>
    </div>
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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-base">Select Asset</span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-[#1a1e2e] hover:bg-[#222737] transition-colors"
          data-testid="btn-search-close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2L10 10M10 2L2 10" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Search input */}
      <div className="flex items-center gap-2 bg-[#0e1118] border border-[#1d2132] rounded-xl px-3 py-2 mb-4">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke="#6c779d" strokeWidth="1.3" />
          <path d="M10.5 10.5L13.5 13.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className="flex-1 bg-transparent outline-none text-white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder:text-[#6c779d]"
          autoFocus
          data-testid="input-asset-search"
        />
      </div>

      {/* Asset list */}
      <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-3">
        All Assets
      </p>
      <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
        {assets.map(asset => (
          <button
            key={asset.id}
            onClick={() => onSelect(asset)}
            className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#1a1e2e] transition-colors w-full"
            data-testid={`btn-asset-${asset.id}`}
          >
            <AssetIcon asset={asset} size={32} />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm flex-1 text-left">
              {asset.name} ({asset.ticker})
            </span>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              selected?.id === asset.id ? "border-[#7631ee] bg-[#7631ee]" : "border-[#414965]"
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
          <p className="text-[#6c779d] text-sm text-center py-4 [font-family:'Gilroy-Medium',Helvetica]">No assets found</p>
        )}
      </div>
    </div>
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

  if (!open) return null;

  const handleClose = () => {
    setStep(1);
    setFromAsset(null);
    setToAsset(null);
    setAmount("");
    setSearchOpen(false);
    onClose();
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

  const filteredAssets = allAssets.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.ticker.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBack = () => {
    if (searchOpen) { setSearchOpen(false); return; }
    if (step === 1) { handleClose(); return; }
    setStep((s) => (s - 1) as Step);
  };

  const currentSelected = searchTarget === "from" ? fromAsset : toAsset;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={handleClose}
      />
      <div className="relative z-10 bg-[#11141b] border border-[#1d2132] rounded-[24px] w-[300px] shadow-2xl p-6">

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
        ) : step === 1 ? (
          <>
            <ModalHeader onBack={handleClose} step={1} totalSteps={3} />
            <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-xl mb-1">
              Exchange Asset
            </h2>
            <p className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#6c779d] text-sm mb-5">
              What are we exchanging from?
            </p>
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-2">
              Current Assets
            </p>
            <AssetDropdownRow
              asset={fromAsset}
              placeholder="Select Asset"
              onOpen={() => openSearch("from")}
              onEdit={() => openSearch("from")}
            />
            <CancelNextButtons
              onCancel={handleClose}
              onNext={() => setStep(2)}
              nextDisabled={!fromAsset}
            />
          </>
        ) : step === 2 ? (
          <>
            <ModalHeader onBack={() => setStep(1)} step={2} totalSteps={3} />
            <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-xl mb-1">
              Exchange Amount
            </h2>
            <p className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#6c779d] text-sm mb-5">
              How much to exchange?
            </p>
            <div className="flex items-center bg-[#0e1118] border border-[#1d2132] rounded-2xl px-4 py-3 focus-within:border-[#414965] transition-colors">
              <span className="text-white text-lg [font-family:'Gilroy-SemiBold',Helvetica] font-semibold mr-1">$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent outline-none text-white text-lg [font-family:'Gilroy-SemiBold',Helvetica] font-semibold placeholder:text-[#414965] min-w-0"
                data-testid="input-exchange-amount"
              />
              <span className="text-[#6c779d] text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ml-2 flex-shrink-0">
                {fromAsset?.ticker ?? "USD"}
              </span>
            </div>
            {fromAsset && (
              <p className="text-[#6c779d] text-xs [font-family:'Gilroy-Medium',Helvetica] mt-1.5">
                Available: {fromAsset.balance}
              </p>
            )}
            <CancelNextButtons
              onCancel={handleClose}
              onNext={() => setStep(3)}
              nextDisabled={!amount || parseFloat(amount) <= 0}
            />
          </>
        ) : step === 3 ? (
          <>
            <ModalHeader onBack={() => setStep(2)} step={3} totalSteps={3} />
            <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-xl mb-1">
              Exchange Asset
            </h2>
            <p className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-[#6c779d] text-sm mb-5">
              What are we exchanging to?
            </p>

            {/* Current Asset (read-only, with Edit) */}
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-2">
              Current Asset
            </p>
            <AssetDropdownRow
              asset={fromAsset}
              placeholder="Select Asset"
              onEdit={() => { setStep(1); setSearchOpen(false); }}
              readOnly
            />

            {/* Swap icon */}
            <div className="flex justify-center my-4">
              <div className="w-10 h-10 rounded-full bg-[#ff9500] flex items-center justify-center shadow-lg">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 3L5 17M5 17L2 14M5 17L8 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 17L15 3M15 3L12 6M15 3L18 6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Target Asset */}
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-2">
              Target Asset
            </p>
            <AssetDropdownRow
              asset={toAsset}
              placeholder="Select asset"
              onOpen={() => openSearch("to")}
              onEdit={() => openSearch("to")}
            />

            <CancelNextButtons
              onCancel={handleClose}
              onNext={() => setStep(4)}
              nextDisabled={!toAsset || toAsset.id === fromAsset?.id}
            />
          </>
        ) : (
          /* Step 4 - Review Details */
          <>
            <ModalHeader onBack={() => setStep(3)} centered title="Review Details" />

            {/* Exchanging From */}
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-2">
              Exchanging From
            </p>
            <div className="flex items-center gap-3 bg-[#0e1118] rounded-2xl px-3 py-2.5 border border-[#1d2132] mb-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: sourceAccount.color }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 5.5H14M2 10.5H14M8 2V14" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm flex-1">
                {sourceAccount.name}
              </span>
              <button
                onClick={() => setStep(1)}
                className="px-2.5 py-1 bg-[#4a2300] rounded-full text-[#ff9500] text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity"
                data-testid="btn-edit-source"
              >
                Edit
              </button>
            </div>

            {/* Current Asset */}
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-2">
              Current Asset
            </p>
            <div className="flex items-center gap-3 bg-[#0e1118] rounded-2xl px-3 py-2.5 border border-[#1d2132] mb-4">
              {fromAsset && <AssetIcon asset={fromAsset} size={32} />}
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm flex-1">
                {fromAsset?.name} ({fromAsset?.ticker})
              </span>
              <button
                onClick={() => setStep(1)}
                className="px-2.5 py-1 bg-[#4a2300] rounded-full text-[#ff9500] text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity"
                data-testid="btn-edit-from"
              >
                Edit
              </button>
            </div>

            {/* Target Asset */}
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-2">
              Target Asset
            </p>
            <div className="flex items-center gap-3 bg-[#0e1118] rounded-2xl px-3 py-2.5 border border-[#1d2132] mb-4">
              {toAsset && <AssetIcon asset={toAsset} size={32} />}
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm flex-1">
                {toAsset?.name} ({toAsset?.ticker})
              </span>
              <button
                onClick={() => setStep(3)}
                className="px-2.5 py-1 bg-[#4a2300] rounded-full text-[#ff9500] text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity"
                data-testid="btn-edit-to"
              >
                Edit
              </button>
            </div>

            {/* Exchange Amount */}
            <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs uppercase tracking-wider mb-2">
              Exchange Amount
            </p>
            <div className="flex items-center gap-3 bg-[#0e1118] rounded-2xl px-4 py-2.5 border border-[#1d2132]">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-base flex-1">
                ${parseFloat(amount || "0").toLocaleString()} <span className="text-[#6c779d] text-sm">{fromAsset?.ticker}</span>
              </span>
              <button
                onClick={() => setStep(2)}
                className="px-2.5 py-1 bg-[#4a2300] rounded-full text-[#ff9500] text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold hover:opacity-80 transition-opacity"
                data-testid="btn-edit-amount"
              >
                Edit
              </button>
            </div>

            <CancelNextButtons
              onCancel={handleClose}
              onNext={handleClose}
              nextLabel="Send"
              nextGreen
            />
          </>
        )}
      </div>
    </div>
  );
}
