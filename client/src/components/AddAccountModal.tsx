import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { ADD_MONEY_ICONS as ICON } from "@/assets/add-money-icons";

// ── Data ──────────────────────────────────────────────────────────────────────
type AccountType = "wallet" | "bank" | "agent";
type Step = "select" | "wallet" | "bank" | "agent";

interface Account {
  id: string;
  type: AccountType;
  name: string;
  address: string | null;
}

const ALL_ACCOUNTS: Account[] = [
  { id: "bank",    type: "bank",   name: "Bank Account",       address: null },
  { id: "wallet",  type: "wallet", name: "Your Wallet",        address: "0x7cB57B5A97eAbe94205C07890BE4c1aD31E486A8" },
  { id: "yield",   type: "agent",  name: "Yield Agent",        address: "0xA1B2C3D4E5f12345678901234567890aAbBcCdD" },
  { id: "trader",  type: "agent",  name: "TraderPro",          address: "0xB2C3D4E5F67890123456789012345678901AbcD" },
  { id: "treasury",type: "agent",  name: "Treasury AI Agent",  address: "0xC3D4e5F678901234567890ABCDEF0123456789A" },
];

function truncAddr(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-5)}`;
}

function truncIban(iban: string): string {
  if (!iban || iban.length <= 12) return iban;
  return `${iban.slice(0, 6)}....${iban.slice(-6)}`;
}

// ── Account icon (32px circle with vector overlay) ────────────────────────────
function AccountIcon({ type }: { type: AccountType }) {
  if (type === "wallet") {
    return (
      <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICON.walletBg} />
        <div className="absolute aspect-[24/24] left-[18.75%] right-[18.75%] top-[6px]">
          <div className="absolute inset-[12.5%]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICON.walletVec} />
          </div>
        </div>
      </div>
    );
  }
  if (type === "bank") {
    return (
      <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICON.bankBg} />
        <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[20px] top-1/2">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICON.bankVec} />
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICON.agentBg} />
      <div className="absolute inset-[20%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICON.agentVec} />
      </div>
    </div>
  );
}

// ── Back button (matches SendModal style + Figma 3608:34364) ──────────────────
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute left-[12px] top-[12px] rounded-[100px] size-[32px] flex items-center justify-center hover:opacity-80 transition-opacity"
      style={{ background: "#1d2132" }}
      data-testid="btn-modal-back"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 3L5 8L10 13" stroke="#a8b9f4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ── Right-side button on the account-row ──
// Matches the "select asset" pill in ExchangeModal step 1: 32px circle bg #1d2132
// containing either a "+" (empty) or chevron-down (filled).
function RowEndIcon({ icon }: { icon: "plus" | "chevron-down" }) {
  // Rendered inside an outer button, so do NOT make this a button itself.
  return (
    <div className="size-[32px] rounded-[100px] bg-[#1d2132] flex items-center justify-center shrink-0">
      <img
        alt=""
        src={icon === "plus" ? ICON.plusIcon : ICON.chevronDown}
        className="block"
        style={icon === "plus" ? { width: 14, height: 14 } : { width: 14, height: 8 }}
      />
    </div>
  );
}

// ── Address action button (QR / Copy) — solid ellipse + centered icon ─────────
function ActionBtn({
  variant,
  icon,
  onClick,
  testId,
  title,
}: {
  variant: "purple" | "orange";
  icon: "qr" | "copy";
  onClick: () => void;
  testId?: string;
  title?: string;
}) {
  const bg = variant === "purple" ? ICON.btnPurpleBg : ICON.btnOrangeBg;
  const vec = icon === "qr" ? ICON.qrIcon : ICON.copyIcon;
  return (
    <button
      onClick={onClick}
      className="relative rounded-[100px] shrink-0 size-[32px] hover:opacity-80 transition-opacity"
      data-testid={testId}
      title={title}
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={bg} />
      <div className="absolute inset-0 flex items-center justify-center">
        <img alt="" src={vec} className="block" style={{ width: 16, height: 16 }} />
      </div>
    </button>
  );
}

// ── QR Popup (Figma 2979:42687) ───────────────────────────────────────────────
function QRPopup({
  address,
  onClose,
  onCopy,
  copied,
}: { address: string; onClose: () => void; onCopy: () => void; copied: boolean }) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0c10] border border-[#1d2132] rounded-[24px] flex flex-col gap-[16px] items-center p-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 size-[274px]">
          <img alt="QR Code" className="absolute block inset-0 max-w-none size-full" src={ICON.qrCode} />
        </div>
        <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-white text-[20px] leading-[24px] whitespace-nowrap">
          {truncAddr(address)}
        </p>
        <button
          onClick={onCopy}
          className="bg-[#4a2300] flex gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] w-full hover:opacity-80 transition-opacity"
          data-testid="btn-qr-copy"
        >
          <img alt="" src={ICON.copyIcon} className="block shrink-0" style={{ width: 24, height: 24 }} />
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[16px] leading-[20px] whitespace-nowrap">
            {copied ? "Copied!" : "Copy Address"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Account selector popup (Figma 3608:34242) ─────────────────────────────────
function AccountPopup({
  accounts,
  onSelect,
  onClose,
}: {
  accounts: Account[];
  onSelect: (acc: Account) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[320px] bg-[#0a0c10] border border-[#1d2132] rounded-[16px] flex flex-col shadow-[0px_68px_27px_0px_rgba(0,0,0,0.06),0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34),0px_4px_9px_0px_rgba(0,0,0,0.39)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Popup header */}
        <div className="flex items-center justify-between px-[16px] py-[16px] border-b border-[#1d2132] backdrop-blur-[10px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[20px] leading-[24px] whitespace-nowrap">
            Select Account
          </p>
          <button
            onClick={onClose}
            className="relative rounded-[100px] shrink-0 size-[24px] overflow-hidden hover:opacity-80 transition-opacity"
            data-testid="btn-popup-close"
          >
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICON.popupCloseBg} />
            <div className="absolute inset-0 flex items-center justify-center">
              <img alt="" src={ICON.popupCloseVec} className="block" style={{ width: 10, height: 10 }} />
            </div>
          </button>
        </div>

        {/* Search + list */}
        <div className="flex flex-col gap-[8px] p-[8px]">
          {/* Search field */}
          <div className="bg-[#222737] flex items-center gap-[8px] p-[8px] rounded-[8px] w-full">
            <img alt="" src={ICON.searchIcon} className="block shrink-0" style={{ width: 16, height: 16 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="bg-transparent flex-1 text-[#6c779d] text-[16px] [font-family:'Gilroy',sans-serif] outline-none placeholder:text-[#6c779d] min-w-0"
              data-testid="input-account-search"
            />
          </div>

          {/* List */}
          <div className="flex flex-col">
            <div className="flex items-center justify-center px-[8px] py-[4px]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[15px] leading-[24px] tracking-[-0.6px]">
                All Assets
              </p>
            </div>
            {filtered.map((acc, i) => (
              <button
                key={acc.id}
                onClick={() => onSelect(acc)}
                className={`flex items-center gap-[8px] p-[8px] rounded-[8px] w-full transition-colors hover:bg-[#1d2132] ${
                  i === 0 ? "bg-[#11141b]" : ""
                }`}
                data-testid={`btn-account-${acc.id}`}
              >
                <AccountIcon type={acc.type} />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[32px] whitespace-nowrap">
                  {acc.name}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-[8px] py-[8px] text-[#414965] text-[14px] [font-family:'Gilroy',sans-serif]">No accounts found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  excludeTypes?: AccountType[];
}

export const AddAccountModal = ({ open, onClose, excludeTypes = [] }: Props): JSX.Element | null => {
  const { wirexAccounts } = useAuth();
  const [step, setStep]               = useState<Step>("select");
  const [selected, setSelected]       = useState<Account | null>(null);
  const [popupOpen, setPopupOpen]     = useState(false);
  const [qrOpen, setQrOpen]           = useState(false);
  const [copied, setCopied]           = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [iban, setIban]               = useState("");

  // Auto-populate bank fields from the logged-in user's bank account
  useEffect(() => {
    if (step === "bank") {
      const bankAcc = wirexAccounts.find((a) => a.type === "bank");
      if (bankAcc) {
        setRecipientName(bankAcc.nameOnAccount ?? "");
        setIban(bankAcc.iban ?? "");
      }
    }
  }, [step, wirexAccounts]);

  if (!open) return null;

  const availableAccounts = ALL_ACCOUNTS.filter(
    (a) => !excludeTypes.includes(a.type)
  );

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep("select");
      setSelected(null);
      setPopupOpen(false);
      setQrOpen(false);
      setCopied(false);
      setCopiedField(null);
      setRecipientName("");
      setIban("");
    }, 300);
  };

  const handleBack = () => {
    setStep("select");
    setSelected(null);
    setQrOpen(false);
    setPopupOpen(false);
  };

  const handleAccountSelect = (acc: Account) => {
    setSelected(acc);
    setPopupOpen(false);
    setQrOpen(false);
  };

  const handleCopy = async (addr: string) => {
    try { await navigator.clipboard.writeText(addr); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyField = (field: "recipientName" | "iban") => {
    const value = field === "recipientName" ? recipientName : iban;
    if (!value) return;
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const activeAddr = selected?.address ?? "";

  // ── STEP 1 ─────────────────────────────────────────────────────────────────
  if (step === "select") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden">

          {/* Header */}
          <div className="bg-[#0a0c10] h-[56px] relative flex-shrink-0 border-b border-[#1d2132]">
            <BackBtn onClick={handleClose} />
          </div>

          {/* Content */}
          <div className="flex flex-col gap-[24px] px-[39px] pt-[23px] pb-[0px]">
            {/* Title */}
            <div className="flex flex-col">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">
                Add Money
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">
                What account should we fund?
              </p>
            </div>

            {/* Account selector */}
            <div className="relative">
              <button
                onClick={() => setPopupOpen((v) => !v)}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-select-account"
              >
                {selected ? (
                  <>
                    <AccountIcon type={selected.type} />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                      {selected.name}
                    </p>
                    <RowEndIcon icon="chevron-down" />
                  </>
                ) : (
                  <>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                      Select Account
                    </p>
                    <RowEndIcon icon="plus" />
                  </>
                )}
              </button>

              {popupOpen && (
                <AccountPopup
                  accounts={availableAccounts}
                  onSelect={handleAccountSelect}
                  onClose={() => setPopupOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Cancel + Next buttons */}
          <div className="flex gap-[16px] items-center px-[39px] pt-[24px] pb-[32px]">
            <button
              onClick={handleClose}
              className="bg-[#222737] flex-1 h-[48px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
              data-testid="btn-add-cancel"
            >
              Cancel
            </button>
            <button
              onClick={() => selected && setStep(selected.type)}
              disabled={!selected}
              className={`bg-[#4a2300] flex-1 h-[48px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] transition-opacity ${selected ? "opacity-100 hover:opacity-80 cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
              data-testid="btn-add-next"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: Your Wallet ────────────────────────────────────────────────────
  if (step === "wallet") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden">

          {/* QR overlay */}
          {qrOpen && (
            <QRPopup
              address={activeAddr}
              onClose={() => setQrOpen(false)}
              onCopy={() => handleCopy(activeAddr)}
              copied={copied}
            />
          )}

          {/* Header */}
          <div className="bg-[#0a0c10] h-[56px] relative flex-shrink-0 border-b border-[#1d2132]">
            <BackBtn onClick={handleBack} />
          </div>

          {/* Content */}
          <div className="flex flex-col gap-[24px] px-[39px] pt-[23px]">
            {/* Title */}
            <div className="flex flex-col">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">
                Add Money
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">
                What account should we fund?
              </p>
            </div>

            {/* Selected account row */}
            <div className="relative">
              <button
                onClick={() => { setPopupOpen((v) => !v); }}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-account-row"
              >
                <AccountIcon type="wallet" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                  Your Wallet
                </p>
                <RowEndIcon icon="chevron-down" />
              </button>
              {popupOpen && (
                <AccountPopup
                  accounts={availableAccounts}
                  onSelect={handleAccountSelect}
                  onClose={() => setPopupOpen(false)}
                />
              )}
            </div>

            {/* Wallet Address */}
            <div className="flex flex-col gap-[4px]">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">
                Wallet Address
              </p>
              <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 min-w-0 truncate whitespace-nowrap">
                  {truncAddr(activeAddr)}
                </p>
                <div className="flex gap-[8px] items-center shrink-0">
                  <ActionBtn variant="purple" icon="qr"   onClick={() => setQrOpen(true)}     testId="btn-wallet-qr"   title="Show QR code" />
                  <ActionBtn variant="orange" icon="copy" onClick={() => handleCopy(activeAddr)} testId="btn-wallet-copy" title="Copy address" />
                </div>
              </div>
              {copied && (
                <p className="[font-family:'Gilroy',sans-serif] text-[#42bf23] text-[12px] leading-[16px]">
                  Address copied!
                </p>
              )}
            </div>
          </div>

          {/* Close button */}
          <div className="px-[39px] pt-[24px] pb-[32px]">
            <button
              onClick={handleClose}
              className="bg-[#4a2300] h-[48px] w-full rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
              data-testid="btn-wallet-close"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: Bank Account ───────────────────────────────────────────────────
  if (step === "bank") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden">

          {/* Header */}
          <div className="bg-[#0a0c10] h-[56px] relative flex-shrink-0 border-b border-[#1d2132]">
            <BackBtn onClick={handleBack} />
          </div>

          {/* Content */}
          <div className="flex flex-col gap-[24px] px-[39px] pt-[23px]">
            {/* Title */}
            <div className="flex flex-col">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">
                Add Money
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">
                What account should we fund?
              </p>
            </div>

            {/* Selected account row */}
            <div className="relative">
              <button
                onClick={() => setPopupOpen((v) => !v)}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-account-row-bank"
              >
                <AccountIcon type="bank" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                  Bank Account
                </p>
                <RowEndIcon icon="chevron-down" />
              </button>
              {popupOpen && (
                <AccountPopup
                  accounts={availableAccounts}
                  onSelect={handleAccountSelect}
                  onClose={() => setPopupOpen(false)}
                />
              )}
            </div>

            {/* Bank fields */}
            <div className="flex flex-col gap-[24px]">
              {/* Recipient Name */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">
                  Recipient Name
                </p>
                <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                  <p className="flex-1 [font-family:'Gilroy',sans-serif] font-semibold text-white text-[20px] leading-[24px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" data-testid="text-recipient-name">
                    {recipientName || "—"}
                  </p>
                  <ActionBtn
                    variant="orange"
                    icon="copy"
                    onClick={() => handleCopyField("recipientName")}
                    testId="btn-copy-name"
                    title={copiedField === "recipientName" ? "Copied!" : "Copy"}
                  />
                </div>
              </div>

              {/* IBAN */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">
                  IBAN Bank Number
                </p>
                <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                  <p className="flex-1 [font-family:'JetBrains_Mono',sans-serif] font-semibold text-white text-[20px] leading-[24px] whitespace-nowrap" data-testid="text-iban">
                    {iban ? truncIban(iban) : "—"}
                  </p>
                  <ActionBtn
                    variant="orange"
                    icon="copy"
                    onClick={() => handleCopyField("iban")}
                    testId="btn-copy-iban"
                    title={copiedField === "iban" ? "Copied!" : "Copy"}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Close button */}
          <div className="px-[39px] pt-[24px] pb-[32px]">
            <button
              onClick={handleClose}
              className="bg-[#4a2300] h-[48px] w-full rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
              data-testid="btn-bank-close"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: AI Agent Account ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden">

        {/* QR overlay */}
        {qrOpen && (
          <QRPopup
            address={activeAddr}
            onClose={() => setQrOpen(false)}
            onCopy={() => handleCopy(activeAddr)}
            copied={copied}
          />
        )}

        {/* Header */}
        <div className="bg-[#0a0c10] h-[56px] relative flex-shrink-0 border-b border-[#1d2132]">
          <BackBtn onClick={handleBack} />
        </div>

        {/* Content */}
        <div className="flex flex-col gap-[24px] px-[39px] pt-[23px]">
          {/* Title */}
          <div className="flex flex-col">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">
              Add Money
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">
              What account should we fund?
            </p>
          </div>

          {/* Selected account row */}
          <div className="relative">
            <button
              onClick={() => setPopupOpen((v) => !v)}
              className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
              data-testid="btn-account-row-agent"
            >
              <AccountIcon type="agent" />
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                {selected?.name ?? "Yield Agent"}
              </p>
              <RowEndIcon icon="chevron-down" />
            </button>
            {popupOpen && (
              <AccountPopup
                accounts={availableAccounts}
                onSelect={handleAccountSelect}
                onClose={() => setPopupOpen(false)}
              />
            )}
          </div>

          {/* Wallet Address */}
          <div className="flex flex-col gap-[4px]">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">
              Wallet Address
            </p>
            <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
              <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 min-w-0 truncate whitespace-nowrap">
                {truncAddr(activeAddr)}
              </p>
              <div className="flex gap-[8px] items-center shrink-0">
                <ActionBtn variant="purple" icon="qr"   onClick={() => setQrOpen(true)}     testId="btn-agent-qr"   title="Show QR code" />
                <ActionBtn variant="orange" icon="copy" onClick={() => handleCopy(activeAddr)} testId="btn-agent-copy" title="Copy address" />
              </div>
            </div>
            {copied && (
              <p className="[font-family:'Gilroy',sans-serif] text-[#42bf23] text-[12px] leading-[16px]">
                Address copied!
              </p>
            )}
          </div>
        </div>

        {/* Close button */}
        <div className="px-[39px] pt-[24px] pb-[32px]">
          <button
            onClick={handleClose}
            className="bg-[#4a2300] h-[48px] w-full rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
            data-testid="btn-agent-close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
