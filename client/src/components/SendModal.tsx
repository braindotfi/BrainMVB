import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useTransactions, generateTxHash } from "@/lib/transactionContext";
import { fmt, fmtUsd, fmtInputBlur, sanitiseNumInput, parseAmt, stripCommas } from "@/lib/formatters";

// ── Figma asset URLs ──────────────────────────────────────────────────────────

const RECEIPT_CHECK_ICON = "https://www.figma.com/api/mcp/asset/33cddef8-4407-4120-9640-19fd26cfca42";

const BACK_BG  = "https://www.figma.com/api/mcp/asset/28c1cb48-d755-43b3-a408-0303879150d0";
const BACK_VEC = "https://www.figma.com/api/mcp/asset/4356db82-74dc-481d-9b7b-397796b1864b";

const CHEVRON_BG  = "https://www.figma.com/api/mcp/asset/28c1cb48-d755-43b3-a408-0303879150d0";
const CHEVRON_VEC = "https://www.figma.com/api/mcp/asset/d0cdfad5-4308-445c-a111-b558f85127c9";

const POP_WALLET_BG  = "https://www.figma.com/api/mcp/asset/14bf435a-a003-4588-9029-5ce6973c3a94";
const POP_WALLET_VEC = "https://www.figma.com/api/mcp/asset/783e8c47-1571-4b96-9c63-cd875fc7a1e4";
const POP_BANK_BG    = "https://www.figma.com/api/mcp/asset/b3dc8e97-fef3-4cff-8f76-054a05e520bf";
const POP_BANK_VEC   = "https://www.figma.com/api/mcp/asset/2a4569bd-623f-43e8-90d3-a53e41c7e325";
const POP_AGENT_BG   = "https://www.figma.com/api/mcp/asset/9e6a186b-9934-4809-b3f0-64b27f9fec60";
const POP_AGENT_VEC  = "https://www.figma.com/api/mcp/asset/e857828a-6482-4b80-80af-4e56cecf3cf7";
const POP_SEARCH_VEC = "https://www.figma.com/api/mcp/asset/66211182-8dde-42ab-a29d-ce2c7a43948c";
const POP_CLOSE_BG   = "https://www.figma.com/api/mcp/asset/76c74d2e-e77a-4dd9-887d-333365e41eea";
const POP_CLOSE_VEC  = "https://www.figma.com/api/mcp/asset/f39dbbe8-075b-4e3f-aaf9-bdfac59b7309";

// ── Types ──────────────────────────────────────────────────────────────────────

type RecipientType = "bank" | "wallet" | "agent";
type Step = 1 | 2 | 3 | 4 | 5;

interface AssetItem {
  id: string;
  name: string;
  ticker: string;
  icon: string;
  balance: string;
}

interface SendState {
  step: Step;
  selectedAssetId: string | null;
  recipientType: RecipientType | null;
  recipientName: string;
  iban: string;
  walletAddress: string;
  selectedAgentId: string | null;
  amount: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sourceAccountType?: "wallet" | "bank";
  excludeTypes?: Array<"bank" | "wallet" | "agent">;
  onConfirmed?: (sourceAccountType: "wallet" | "bank") => void;
}

// ── Static data ────────────────────────────────────────────────────────────────

const CRYPTO_ASSETS: AssetItem[] = [
  { id: "usdc",  name: "USD Coin",   ticker: "USDC", icon: "/figmaAssets/crypto-icons-3.svg", balance: "2,040.30" },
  { id: "eth",   name: "Ethereum",   ticker: "ETH",  icon: "/figmaAssets/crypto-icons.svg",   balance: "1.245" },
  { id: "matic", name: "Polygon",    ticker: "MATIC", icon: "/figmaAssets/crypto-icons-1.svg", balance: "295.23" },
  { id: "bnb",   name: "BNB Chain",  ticker: "BNB",  icon: "/figmaAssets/crypto-icons-2.svg", balance: "1.245" },
];

const FIAT_ASSETS: AssetItem[] = [
  { id: "usd", name: "US Dollar",     ticker: "USD", icon: "🇺🇸", balance: "12,500.00" },
  { id: "eur", name: "Euro",          ticker: "EUR", icon: "🇪🇺", balance: "0.00" },
  { id: "gbp", name: "British Pound", ticker: "GBP", icon: "🇬🇧", balance: "0.00" },
  { id: "aed", name: "UAE Dirham",    ticker: "AED", icon: "🇦🇪", balance: "0.00" },
];

const RECIPIENT_TYPES: { id: RecipientType; name: string }[] = [
  { id: "wallet", name: "Wallet Address" },
  { id: "bank",   name: "Bank Account" },
  { id: "agent",  name: "AI Agent Account" },
];

const AGENT_ACCOUNTS = [
  { id: "yield",    name: "Yield Agent",  address: "0xYld3F...4f2A" },
  { id: "trader",   name: "TraderPro",    address: "0xTrd9c...1B7E" },
  { id: "treasury", name: "Treasury AI",  address: "0xTrs2E...7D3F" },
];

const FEE = "0.50";

const INITIAL: SendState = {
  step: 1,
  selectedAssetId: null,
  recipientType: null,
  recipientName: "",
  iban: "",
  walletAddress: "",
  selectedAgentId: null,
  amount: "",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute left-[12px] top-[12px] rounded-[100px] size-[32px] hover:opacity-80 transition-opacity"
      data-testid="btn-send-back"
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={BACK_BG} />
      <div className="absolute left-[8px] size-[16px] top-[8px]">
        <div className="absolute bottom-1/4 flex items-center justify-center left-[37.5%] right-[40.09%] top-1/4" style={{ containerType: "size" }}>
          <div className="flex-none h-[100cqw] rotate-90 w-[100cqh]">
            <div className="relative size-full">
              <div className="absolute inset-[-20.92%_-9.38%]">
                <img alt="" className="block max-w-none size-full" src={BACK_VEC} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function ChevronBtn() {
  return (
    <div className="relative rounded-[100px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={CHEVRON_BG} />
      <div className="absolute left-[8px] size-[16px] top-[8px]">
        <div className="absolute inset-[16.65%_16.66%_16.68%_16.67%]">
          <div className="absolute inset-[-7.03%]">
            <img alt="" className="block max-w-none size-full" src={CHEVRON_VEC} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDots({ current, total = 5, start = 1 }: { current: number; total?: number; start?: number }) {
  const displayStep = current - start + 1;
  return (
    <div className="flex items-center gap-[8px] px-[12px] py-[6px] rounded-[100px]" style={{ background: "#12032D" }}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className="rounded-full shrink-0 transition-colors duration-300"
          style={{ width: 8, height: 8, background: n <= displayStep ? "#7631EE" : "#240757" }}
        />
      ))}
    </div>
  );
}

function PopupShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[320px] bg-[#0a0c10] border border-[#1d2132] rounded-[16px] flex flex-col shadow-[0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34),0px_4px_9px_0px_rgba(0,0,0,0.39)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[16px] py-[16px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[20px] leading-[24px]">{title}</p>
          <button onClick={onClose} className="relative rounded-[100px] shrink-0 size-[24px] overflow-hidden hover:opacity-80 transition-opacity">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_CLOSE_BG} />
            <div className="absolute left-[4px] size-[16px] top-[4px]">
              <div className="absolute inset-[20.85%_20.84%_20.82%_20.83%]">
                <div className="absolute inset-[-8.04%]">
                  <img alt="" className="block max-w-none size-full" src={POP_CLOSE_VEC} />
                </div>
              </div>
            </div>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="bg-[#222737] flex items-center gap-[8px] p-[8px] rounded-[8px] w-full">
      <div className="relative shrink-0 size-[24px]">
        <div className="absolute inset-[16.67%]">
          <div className="absolute inset-[-6.25%]">
            <img alt="" className="block max-w-none size-full" src={POP_SEARCH_VEC} />
          </div>
        </div>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search"
        className="bg-transparent flex-1 text-[#6c779d] text-[16px] [font-family:'Gilroy',sans-serif] outline-none placeholder:text-[#6c779d] min-w-0"
      />
    </div>
  );
}

function RecipientIcon({ type }: { type: RecipientType }) {
  if (type === "bank") {
    return (
      <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_BANK_BG} />
        <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[20px] top-1/2">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_BANK_VEC} />
        </div>
      </div>
    );
  }
  if (type === "agent") {
    return (
      <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_AGENT_BG} />
        <div className="absolute inset-[20%]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_AGENT_VEC} />
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_WALLET_BG} />
      <div className="absolute aspect-[24/24] left-[18.75%] right-[18.75%] top-[6px]">
        <div className="absolute inset-[12.5%]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_WALLET_VEC} />
        </div>
      </div>
    </div>
  );
}

function AssetIcon({ asset }: { asset: AssetItem }) {
  const isEmoji = !asset.icon.startsWith("/");
  if (isEmoji) {
    return (
      <div className="shrink-0 size-[32px] rounded-[16px] bg-[#1d2132] flex items-center justify-center text-[18px]">
        {asset.icon}
      </div>
    );
  }
  return (
    <img src={asset.icon} alt={asset.ticker} className="shrink-0 size-[32px] rounded-[16px]" />
  );
}

function AssetPopup({
  assets,
  selectedId,
  onSelect,
  onClose,
}: {
  assets: AssetItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = assets.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.ticker.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <PopupShell title="Select Asset" onClose={onClose}>
      <div className="flex flex-col gap-[8px] p-[8px]">
        <SearchBar value={search} onChange={setSearch} />
        <div className="flex flex-col">
          <div className="flex items-center px-[8px] py-[4px]">
            <p className="flex-1 [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[15px] leading-[24px] tracking-[-0.6px]">Current Assets</p>
          </div>
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`flex items-center gap-[8px] p-[8px] rounded-[8px] w-full transition-colors text-left ${selectedId === a.id ? "bg-[#1d2132]" : "hover:bg-[#1d2132]"}`}
              data-testid={`btn-asset-${a.id}`}
            >
              <AssetIcon asset={a} />
              <div className="flex flex-col flex-1 min-w-0">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">{a.name}</p>
                <p className="[font-family:'JetBrains_Mono',sans-serif] text-[#414965] text-[12px] leading-[16px]">{a.balance} {a.ticker}</p>
              </div>
              {selectedId === a.id && (
                <div className="shrink-0 w-[16px] h-[16px] rounded-full bg-[#7631EE] flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-[8px] py-[8px] text-[#414965] text-[14px] [font-family:'Gilroy',sans-serif]">No assets found</p>
          )}
        </div>
      </div>
    </PopupShell>
  );
}

function RecipientPopup({
  excludeTypes = [],
  onSelect,
  onClose,
}: {
  excludeTypes?: Array<RecipientType>;
  onSelect: (t: RecipientType) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = RECIPIENT_TYPES.filter(
    (r) => !excludeTypes.includes(r.id) && r.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <PopupShell title="Select Account" onClose={onClose}>
      <div className="flex flex-col gap-[8px] p-[8px]">
        <SearchBar value={search} onChange={setSearch} />
        <div className="flex flex-col">
          <div className="flex items-center px-[8px] py-[4px]">
            <p className="flex-1 [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[15px] leading-[24px] tracking-[-0.6px]">All Accounts</p>
          </div>
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="flex items-center gap-[8px] p-[8px] rounded-[8px] w-full transition-colors hover:bg-[#1d2132]"
              data-testid={`btn-recipient-${r.id}`}
            >
              <RecipientIcon type={r.id} />
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[32px] whitespace-nowrap">{r.name}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-[8px] py-[8px] text-[#414965] text-[14px] [font-family:'Gilroy',sans-serif]">No results</p>
          )}
        </div>
      </div>
    </PopupShell>
  );
}

function AgentPopup({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <PopupShell title="Select Agent" onClose={onClose}>
      <div className="flex flex-col p-[8px] gap-[4px]">
        {AGENT_ACCOUNTS.map((a) => (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className="flex items-center gap-[8px] p-[8px] rounded-[8px] w-full hover:bg-[#1d2132] transition-colors text-left"
            data-testid={`btn-agent-${a.id}`}
          >
            <RecipientIcon type="agent" />
            <div className="flex flex-col min-w-0">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] whitespace-nowrap">{a.name}</p>
              <p className="[font-family:'JetBrains_Mono',sans-serif] text-[#414965] text-[12px] leading-[16px]">{a.address}</p>
            </div>
          </button>
        ))}
      </div>
    </PopupShell>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">{label}</p>
      {children}
    </div>
  );
}

function InputBox({ children, highlighted }: { children: React.ReactNode; highlighted?: boolean }) {
  return (
    <div className={`bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full border ${highlighted ? "border-[#6c779d]" : "border-transparent"}`}>
      {children}
    </div>
  );
}

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-[8px]">
      <p className="[font-family:'Gilroy',sans-serif] text-[#414965] text-[16px] leading-[24px]">{label}</p>
      <p className={`[font-family:'JetBrains_Mono',sans-serif] font-semibold text-[16px] leading-[24px] ${highlight ? "text-[#ff9500]" : "text-white"}`}>{value}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export const SendModal = ({ open, onClose, sourceAccountType = "wallet", excludeTypes = [], onConfirmed }: Props): JSX.Element | null => {
  const { wirexAccounts } = useAuth();
  const { addTransaction } = useTransactions();

  const bankMode = sourceAccountType === "bank";
  const bankInitial: SendState = { ...INITIAL, step: 2, selectedAssetId: "usd" };

  const [state, setState]               = useState<SendState>(() => bankMode ? bankInitial : INITIAL);
  const [assetPopupOpen, setAssetPopupOpen] = useState(false);
  const [popupOpen, setPopupOpen]           = useState(false);
  const [agentPopupOpen, setAgentPopupOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null);
  const [amountDisplay, setAmountDisplay] = useState("");

  if (!open) return null;

  const set = (patch: Partial<SendState>) => setState((prev) => ({ ...prev, ...patch }));

  const bankAcc   = wirexAccounts.find((a) => a.type === "bank");
  const walletAcc = wirexAccounts.find((a) => a.type === "wallet");

  // Build contextual asset list with live balance for primary asset
  const availableAssets: AssetItem[] = sourceAccountType === "bank"
    ? FIAT_ASSETS.map((a) => a.id === "usd" ? { ...a, balance: bankAcc?.balance ?? a.balance } : a)
    : CRYPTO_ASSETS.map((a) => a.id === "usdc" ? { ...a, balance: walletAcc?.balance ?? a.balance } : a);

  const selectedAsset = availableAssets.find((a) => a.id === state.selectedAssetId) ?? null;
  const availableBalance = selectedAsset ? parseAmt(selectedAsset.balance) : 0;
  const enteredAmount    = parseAmt(state.amount);
  const amountError = state.amount && enteredAmount > 0 && enteredAmount > availableBalance
    ? `Exceeds available balance of ${fmt(availableBalance)} ${selectedAsset?.ticker}`
    : null;

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setState(bankMode ? bankInitial : INITIAL);
      setAssetPopupOpen(false);
      setPopupOpen(false);
      setAgentPopupOpen(false);
      setSent(false);
      setSending(false);
      setConfirmedTxHash(null);
      setAmountDisplay("");
    }, 300);
  };

  const minStep = bankMode ? 2 : 1;

  const handleBack = () => {
    if (state.step > minStep) {
      set({ step: (state.step - 1) as Step });
    } else {
      handleClose();
    }
    setAssetPopupOpen(false);
    setPopupOpen(false);
    setAgentPopupOpen(false);
  };

  const handleNext = () => {
    if (state.step < 5) set({ step: (state.step + 1) as Step });
  };

  const handleConfirm = () => {
    setSending(true);
    const newTxHash = generateTxHash();
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setConfirmedTxHash(newTxHash);
      const now = new Date();
      addTransaction({
        type: "withdrawal",
        label: `Sent ${state.amount} ${selectedAsset?.ticker ?? ""} to ${recipientLabel()}`,
        time: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        date: now.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        amount: `-${state.amount} ${selectedAsset?.ticker ?? ""}`,
        positive: false,
        txHash: newTxHash,
        accountId: sourceAccountType === "bank" ? "bank" : null,
      });
    }, 1800);
  };

  const canNext = (() => {
    if (state.step === 1) return state.selectedAssetId !== null;
    if (state.step === 2) return state.recipientType !== null;
    if (state.step === 3) {
      if (state.recipientType === "bank")   return state.recipientName.length > 0 && state.iban.length > 6;
      if (state.recipientType === "wallet") return state.walletAddress.length > 10;
      if (state.recipientType === "agent")  return state.selectedAgentId !== null;
    }
    if (state.step === 4) return enteredAmount > 0 && !amountError;
    return true;
  })();

  const selectedAgent = AGENT_ACCOUNTS.find((a) => a.id === state.selectedAgentId);
  const truncAddr = (addr: string) => addr.slice(0, 8) + "..." + addr.slice(-6);

  const recipientLabel = () => {
    if (state.recipientType === "bank")   return state.recipientName;
    if (state.recipientType === "wallet") return truncAddr(state.walletAddress);
    if (state.recipientType === "agent")  return selectedAgent?.name ?? "AI Agent";
    return "";
  };

  const total = fmt(enteredAmount + parseFloat(FEE), 2);

  // ── Success ────────────────────────────────────────────────────────────────
  if (sent) {
    const txHash = confirmedTxHash ?? "";
    const basescanTx = `https://basescan.org/tx/${txHash}`;
    const truncTx   = (h: string) => h.slice(0, 8) + "..." + h.slice(-4);
    const truncIban = (i: string) => i.slice(0, 6) + "..." + i.slice(-6);
    const truncAddr6 = (a: string) => a.slice(0, 6) + "..." + a.slice(-4);
    const recipientAddr = state.recipientType === "wallet"
      ? state.walletAddress
      : state.recipientType === "agent"
      ? selectedAgent?.address ?? ""
      : null;
    const basescanAddr = recipientAddr ? `https://basescan.org/address/${recipientAddr}` : null;

    const handleDone = () => {
      onConfirmed?.(sourceAccountType);
      handleClose();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleDone} />
        <div
          className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden"
          style={{ boxShadow: "0px 38px 23px 0px rgba(0,0,0,0.2),0px 17px 17px 0px rgba(0,0,0,0.34),0px 4px 9px 0px rgba(0,0,0,0.39),0px 0px 0px 0px rgba(0,0,0,0.40)" }}
        >
          <div className="flex flex-col gap-[24px] items-center px-[39px] py-[39px]">

            {/* Receipt icon */}
            <div className="bg-[#123509] flex items-center justify-center p-[24px] rounded-full shrink-0">
              <div className="relative size-[48px]">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={RECEIPT_CHECK_ICON} />
              </div>
            </div>

            {/* Title + subtitle */}
            <div className="flex flex-col items-start w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px] text-center w-full">
                Send Complete!
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[22px] leading-[28px] text-center w-full">
                Your transaction has successfully completed!
              </p>
            </div>

            {/* Details card */}
            <div className="bg-[#06070a] border border-[#1d2132] flex flex-col gap-[16px] items-start justify-center p-[16px] rounded-[16px] w-full">

              {/* ── Bank variant ── */}
              {state.recipientType === "bank" && (
                <>
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Recipient</p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">{state.recipientName || "—"}</p>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">IBAN</p>
                    <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">
                      {state.iban ? truncIban(state.iban) : "—"}
                    </p>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Amount</p>
                    <div className="flex gap-[4px] items-center">
                      <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#ff9500] text-[20px] leading-[24px] whitespace-nowrap">{fmt(enteredAmount)}</p>
                      {selectedAsset && (
                        <div className="bg-[#11141b] flex items-center px-[6px] py-[2px] rounded-[100px] shrink-0">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[12px] whitespace-nowrap">{selectedAsset.ticker}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── Wallet variant ── */}
              {state.recipientType === "wallet" && (
                <>
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Transaction ID</p>
                    <a href={basescanTx} target="_blank" rel="noopener noreferrer"
                      className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#7631EE] text-[20px] leading-[24px] whitespace-nowrap hover:text-[#9b6cf3] transition-colors"
                      data-testid="link-tx-hash">
                      {truncTx(txHash)}
                    </a>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Recipient</p>
                    <a href={basescanAddr!} target="_blank" rel="noopener noreferrer"
                      className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#7631EE] text-[20px] leading-[24px] whitespace-nowrap hover:text-[#9b6cf3] transition-colors"
                      data-testid="link-recipient-address">
                      {truncAddr6(state.walletAddress)}
                    </a>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Amount</p>
                    <div className="flex gap-[4px] items-center">
                      <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#ff9500] text-[20px] leading-[24px] whitespace-nowrap">{fmt(enteredAmount)}</p>
                      {selectedAsset && (
                        <div className="bg-[#11141b] flex items-center px-[6px] py-[2px] rounded-[100px] shrink-0">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[12px] whitespace-nowrap">{selectedAsset.ticker}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── Agent variant ── */}
              {state.recipientType === "agent" && (
                <>
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Transaction ID</p>
                    <a href={basescanTx} target="_blank" rel="noopener noreferrer"
                      className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#7631EE] text-[20px] leading-[24px] whitespace-nowrap hover:text-[#9b6cf3] transition-colors"
                      data-testid="link-tx-hash-agent">
                      {truncTx(txHash)}
                    </a>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Recipient</p>
                    <div className="flex gap-[8px] items-center">
                      <RecipientIcon type="agent" />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">
                        {selectedAgent?.name ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Amount</p>
                    <div className="flex gap-[4px] items-center">
                      <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#ff9500] text-[20px] leading-[24px] whitespace-nowrap">{fmt(enteredAmount)}</p>
                      {selectedAsset && (
                        <div className="bg-[#11141b] flex items-center px-[6px] py-[2px] rounded-[100px] shrink-0">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[12px] whitespace-nowrap">{selectedAsset.ticker}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

            </div>

            {/* Buttons */}
            <div className="flex gap-[16px] items-center w-full">
              <a
                href={basescanTx}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#11141b] flex-1 h-[48px] flex items-center justify-center rounded-[100px] hover:opacity-80 transition-opacity"
                data-testid="btn-view-basescan"
              >
                <p className="[font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[18px] leading-[24px] tracking-[-0.72px]">View</p>
              </a>
              <button
                onClick={handleDone}
                className="bg-[#4a2300] flex-1 h-[48px] flex items-center justify-center rounded-[100px] hover:opacity-80 transition-opacity"
                data-testid="btn-send-done"
              >
                <p className="[font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] leading-[24px] tracking-[-0.72px]">Done</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-[#0a0c10] h-[56px] relative flex items-center justify-center flex-shrink-0 border-b border-[#1d2132]">
          <BackBtn onClick={handleBack} />
          {state.step < 5
            ? <StepDots current={state.step} total={bankMode ? 4 : 5} start={bankMode ? 2 : 1} />
            : <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">Review Details</p>
          }
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-[24px] px-[39px] pt-[24px]">

          {/* ── STEP 1: Select Asset ──────────────────────────────────────── */}
          {state.step === 1 && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">What are we sending?</p>
              </div>

              <FieldRow label="Current Assets">
                <button
                  onClick={() => setAssetPopupOpen((v) => !v)}
                  className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                  data-testid="btn-send-select-asset"
                >
                  {selectedAsset ? (
                    <>
                      <AssetIcon asset={selectedAsset} />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                        {selectedAsset.name}
                      </p>
                      <div className="bg-[#11141b] px-[6px] py-[2px] rounded-[100px] shrink-0 mr-[4px]">
                        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] whitespace-nowrap">{selectedAsset.ticker}</p>
                      </div>
                    </>
                  ) : (
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                      Select Asset
                    </p>
                  )}
                  <ChevronBtn />
                </button>
              </FieldRow>

              {assetPopupOpen && (
                <AssetPopup
                  assets={availableAssets}
                  selectedId={state.selectedAssetId}
                  onSelect={(id) => { set({ selectedAssetId: id }); setAssetPopupOpen(false); }}
                  onClose={() => setAssetPopupOpen(false)}
                />
              )}
            </>
          )}

          {/* ── STEP 2: Select Recipient Type ────────────────────────────── */}
          {state.step === 2 && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Where are we sending to?</p>
              </div>

              <FieldRow label="Send To">
                <button
                  onClick={() => setPopupOpen((v) => !v)}
                  className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                  data-testid="btn-send-select-recipient"
                >
                  {state.recipientType ? (
                    <>
                      <RecipientIcon type={state.recipientType} />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                        {RECIPIENT_TYPES.find((r) => r.id === state.recipientType)?.name}
                      </p>
                    </>
                  ) : (
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                      Select Account
                    </p>
                  )}
                  <ChevronBtn />
                </button>
              </FieldRow>

              {popupOpen && (
                <RecipientPopup
                  excludeTypes={excludeTypes}
                  onSelect={(t) => { set({ recipientType: t }); setPopupOpen(false); }}
                  onClose={() => setPopupOpen(false)}
                />
              )}
            </>
          )}

          {/* ── STEP 3: Recipient Details – Bank ─────────────────────────── */}
          {state.step === 3 && state.recipientType === "bank" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Who are we sending to?</p>
              </div>
              <button onClick={handleBack} className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors">
                <RecipientIcon type="bank" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">Bank Account</p>
                <ChevronBtn />
              </button>
              <div className="flex flex-col gap-[24px]">
                <FieldRow label="Recipient Name">
                  <InputBox>
                    <input type="text" value={state.recipientName} onChange={(e) => set({ recipientName: e.target.value })} placeholder="John Smith"
                      className="flex-1 bg-transparent text-white text-[20px] [font-family:'Mont',sans-serif] font-semibold placeholder:text-[#414965] outline-none min-w-0"
                      data-testid="input-send-recipient-name" />
                  </InputBox>
                </FieldRow>
                <FieldRow label="IBAN Bank Number">
                  <InputBox>
                    <input type="text" value={state.iban} onChange={(e) => set({ iban: e.target.value })} placeholder="AE0703...123456"
                      className="flex-1 bg-transparent text-white text-[20px] [font-family:'JetBrains_Mono',sans-serif] font-semibold placeholder:text-[#414965] outline-none min-w-0 tracking-wider"
                      data-testid="input-send-iban" />
                  </InputBox>
                </FieldRow>
              </div>
            </>
          )}

          {/* ── STEP 3: Recipient Details – Wallet ───────────────────────── */}
          {state.step === 3 && state.recipientType === "wallet" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Who are we sending to?</p>
              </div>
              <button onClick={handleBack} className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors">
                <RecipientIcon type="wallet" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">Wallet Address</p>
                <ChevronBtn />
              </button>
              <FieldRow label="Wallet Address">
                <InputBox>
                  <input type="text" value={state.walletAddress} onChange={(e) => set({ walletAddress: e.target.value })} placeholder="0x..."
                    className="flex-1 bg-transparent text-white text-[18px] [font-family:'JetBrains_Mono',sans-serif] font-semibold placeholder:text-[#414965] outline-none min-w-0"
                    data-testid="input-send-wallet-addr" />
                  <button onClick={async () => { try { const t = await navigator.clipboard.readText(); set({ walletAddress: t }); } catch {} }}
                    className="bg-[#4a2300] px-[12px] py-[6px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px] shrink-0 hover:opacity-80 transition-opacity"
                    data-testid="btn-send-paste-addr">
                    Paste
                  </button>
                </InputBox>
                {state.walletAddress && state.walletAddress.length < 10 && (
                  <p className="[font-family:'Gilroy',sans-serif] text-red-400 text-[13px] mt-[4px]">Please enter a valid wallet address</p>
                )}
              </FieldRow>
            </>
          )}

          {/* ── STEP 3: Recipient Details – Agent ────────────────────────── */}
          {state.step === 3 && state.recipientType === "agent" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Who are we sending to?</p>
              </div>
              <button onClick={handleBack} className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors">
                <RecipientIcon type="agent" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">AI Agent Account</p>
                <ChevronBtn />
              </button>
              <FieldRow label="Select Agent">
                <button onClick={() => setAgentPopupOpen((v) => !v)}
                  className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                  data-testid="btn-send-select-agent">
                  {selectedAgent ? (
                    <>
                      <RecipientIcon type="agent" />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">{selectedAgent.name}</p>
                    </>
                  ) : (
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">Select Agent</p>
                  )}
                  <ChevronBtn />
                </button>
                {agentPopupOpen && (
                  <AgentPopup onSelect={(id) => { set({ selectedAgentId: id }); setAgentPopupOpen(false); }} onClose={() => setAgentPopupOpen(false)} />
                )}
              </FieldRow>
            </>
          )}

          {/* ── STEP 4: Amount ───────────────────────────────────────────── */}
          {state.step === 4 && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Amount</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">How much should we send?</p>
              </div>

              <div className="flex flex-col gap-[8px]">
                <InputBox highlighted>
                  <div className="flex flex-1 items-center gap-[2px] min-w-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amountDisplay}
                      onChange={(e) => {
                        const raw = sanitiseNumInput(e.target.value);
                        set({ amount: raw });
                        setAmountDisplay(e.target.value.replace(/[^0-9.,]/g, ""));
                      }}
                      onBlur={() => setAmountDisplay(fmtInputBlur(state.amount))}
                      onFocus={() => setAmountDisplay(stripCommas(amountDisplay))}
                      placeholder="0.00"
                      autoFocus
                      className="flex-1 bg-transparent text-white text-[20px] [font-family:'Mont',sans-serif] font-semibold placeholder:text-[#414965] outline-none min-w-0"
                      data-testid="input-send-amount"
                    />
                  </div>
                  <div className="bg-[#11141b] px-[6px] py-[2px] rounded-[100px] shrink-0">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] whitespace-nowrap">
                      {selectedAsset?.ticker ?? "—"}
                    </p>
                  </div>
                </InputBox>

                {/* Available balance */}
                <p className="[font-family:'Gilroy',sans-serif] text-[#414965] text-[14px] leading-[20px]">
                  Available:{" "}
                  <span className="text-[#6c779d]">
                    {selectedAsset ? `${fmt(parseAmt(selectedAsset.balance))} ${selectedAsset.ticker}` : "—"}
                  </span>
                </p>

                {/* Error */}
                {amountError && (
                  <p className="[font-family:'Gilroy',sans-serif] text-red-400 text-[13px] leading-[18px]">{amountError}</p>
                )}
              </div>
            </>
          )}

          {/* ── STEP 5: Review Details ───────────────────────────────────── */}
          {state.step === 5 && (
            <div className="flex flex-col gap-[12px]">

              {/* Sending From */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Sending From</p>
                <div className="bg-[#06070a] border border-[#1d2132] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                  <div className="flex flex-1 gap-[8px] items-center min-w-0">
                    <RecipientIcon type={sourceAccountType === "bank" ? "bank" : "wallet"} />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">
                      {sourceAccountType === "bank" ? "Bank Account" : "Wallet Account"}
                    </p>
                  </div>
                  {!bankMode && (
                    <button onClick={() => set({ step: 1 })} className="bg-[#4a2300] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px] leading-[16px]">Edit</p>
                    </button>
                  )}
                </div>
              </div>

              {/* Bank: Recipient Name */}
              {state.recipientType === "bank" && (
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Recipient Name</p>
                  <div className="bg-[#06070a] border border-[#1d2132] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 whitespace-nowrap">{state.recipientName || "—"}</p>
                    <button onClick={() => set({ step: 3 })} className="bg-[#4a2300] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px] leading-[16px]">Edit</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Bank: IBAN */}
              {state.recipientType === "bank" && (
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">IBAN Bank Number</p>
                  <div className="bg-[#06070a] border border-[#1d2132] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                    <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 whitespace-nowrap">
                      {state.iban ? state.iban.slice(0, 6) + "..." + state.iban.slice(-6) : "—"}
                    </p>
                    <button onClick={() => set({ step: 3 })} className="bg-[#4a2300] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px] leading-[16px]">Edit</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Wallet: Send Recipient */}
              {state.recipientType === "wallet" && (
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Send Recipient</p>
                  <div className="bg-[#06070a] border border-[#1d2132] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                    <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 whitespace-nowrap truncate">
                      {state.walletAddress ? truncAddr(state.walletAddress) : "—"}
                    </p>
                    <button onClick={() => set({ step: 3 })} className="bg-[#4a2300] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px] leading-[16px]">Edit</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Agent: Send Recipient */}
              {state.recipientType === "agent" && (
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Send Recipient</p>
                  <div className="bg-[#06070a] border border-[#1d2132] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                    <div className="flex flex-1 gap-[8px] items-center min-w-0">
                      <RecipientIcon type="agent" />
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">
                        {selectedAgent?.name ?? "—"}
                      </p>
                    </div>
                    <button onClick={() => set({ step: 3 })} className="bg-[#4a2300] flex items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px] leading-[16px]">Edit</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Send Details */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Send Details</p>
                <div className="bg-[#06070a] border border-[#1d2132] flex flex-col gap-[16px] items-start justify-center p-[16px] rounded-[16px] w-full">
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Asset</p>
                    <div className="flex gap-[4px] items-center">
                      <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">
                        {selectedAsset?.name ?? "—"}
                      </p>
                      {selectedAsset && (
                        <div className="bg-[#11141b] flex items-center px-[6px] py-[2px] rounded-[100px] shrink-0">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[12px] whitespace-nowrap">{selectedAsset.ticker}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Amount</p>
                    <div className="flex gap-[4px] items-center">
                      <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#ff9500] text-[20px] leading-[24px] whitespace-nowrap">
                        {fmt(enteredAmount)}
                      </p>
                      {selectedAsset && (
                        <div className="bg-[#11141b] flex items-center px-[6px] py-[2px] rounded-[100px] shrink-0">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[12px] whitespace-nowrap">{selectedAsset.ticker}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Network Fee</p>
                    <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">{fmtUsd(parseFloat(FEE))}</p>
                  </div>
                  <div className="h-px bg-[#1d2132] w-full" />
                  <div className="flex items-center justify-between w-full">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px] whitespace-nowrap">Total</p>
                    <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-[#ff9500] text-[20px] leading-[24px] whitespace-nowrap">{fmtUsd(enteredAmount + parseFloat(FEE))}</p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── Buttons ─────────────────────────────────────────────────────── */}
        <div className="flex gap-[16px] items-center px-[39px] pt-[24px] pb-[32px]">
          <button
            onClick={handleClose}
            className="bg-[#222737] flex-1 h-[48px] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
            data-testid="btn-send-cancel"
          >
            Cancel
          </button>
          {state.step < 5 ? (
            <button
              onClick={handleNext}
              disabled={!canNext}
              className={`bg-[#4a2300] flex-1 h-[48px] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] transition-opacity ${canNext ? "opacity-100 hover:opacity-80 cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
              data-testid="btn-send-next"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={sending}
              className="bg-[#4a2300] flex-1 h-[48px] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity disabled:opacity-50"
              data-testid="btn-send-confirm"
            >
              {sending ? "Confirming…" : "Confirm"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
