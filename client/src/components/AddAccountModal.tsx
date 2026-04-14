import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";

// ── Figma asset URLs ──────────────────────────────────────────────────────────

// Step-1 header back/close button
const S1_BACK_BG  = "https://www.figma.com/api/mcp/asset/cf4cade6-b37c-4aa0-bf79-634da107797d";
const S1_BACK_VEC = "https://www.figma.com/api/mcp/asset/14667b94-1f48-4199-9108-7b31792ff2a6";
// Dropdown chevron-down arrow button (step 1 & step 2 account row right button)
const S1_DROPDOWN_VEC = "https://www.figma.com/api/mcp/asset/ad4ace76-26d1-4c79-9f41-d6c3477b6b84";

// Account popup icons (32px inverted)
const POP_WALLET_BG  = "https://www.figma.com/api/mcp/asset/53dc43ca-99ce-483e-ab79-3fd381f2a0ad";
const POP_WALLET_VEC = "https://www.figma.com/api/mcp/asset/e7f668c8-24da-4d7c-ab44-b607b214e7e0";
const POP_BANK_BG    = "https://www.figma.com/api/mcp/asset/48b93f10-f582-4bc3-b364-9a792e588ae0";
const POP_BANK_VEC   = "https://www.figma.com/api/mcp/asset/337a1c99-57d9-41bc-8558-fa858fd5a57f";
const POP_AGENT_BG   = "https://www.figma.com/api/mcp/asset/3a2688b7-b3e6-4688-afbd-dfb73fb21306";
const POP_AGENT_VEC  = "https://www.figma.com/api/mcp/asset/4df2980c-57b9-4bdb-ab2d-c01cb02506ec";
// Account popup search icon
const POP_SEARCH_VEC = "https://www.figma.com/api/mcp/asset/ea07f1c0-1a0c-41e0-9537-132e06d08067";
// Account popup close button
const POP_CLOSE_BG   = "https://www.figma.com/api/mcp/asset/9c58cbce-ca1e-4719-a26a-f8db73c644fa";
const POP_CLOSE_VEC  = "https://www.figma.com/api/mcp/asset/dbccfd9a-3433-4851-b39e-b7bf246aa8c9";

// Step-2 wallet icons & back button
const S2W_WALLET_BG  = "https://www.figma.com/api/mcp/asset/39d8e016-c6a1-4616-8062-fbaf0bee1e99";
const S2W_WALLET_VEC = "https://www.figma.com/api/mcp/asset/7c3ba310-e565-435f-9aca-aed9e1ede31b";
const S2W_CHEVRON    = "https://www.figma.com/api/mcp/asset/a298e926-9620-407b-a06b-85bcd0cf1b4b";
const S2W_BACK_BG    = "https://www.figma.com/api/mcp/asset/5c6835c6-1d75-46ab-84ad-f98f06d6797c";
const S2W_BACK_VEC   = "https://www.figma.com/api/mcp/asset/4de9ea41-8d72-4eee-9384-82799afd82d5";
// Step-2 wallet action buttons: button1 = QR (opens popup), button2 = Copy
const S2W_BTN1_BG1   = "https://www.figma.com/api/mcp/asset/036bbbe5-4e9b-4553-bd26-1be56666dade";
const S2W_BTN_BG2    = "https://www.figma.com/api/mcp/asset/ac7a61fa-e537-4df9-97a4-d60034d21119";
const S2W_BTN1_VEC   = "https://www.figma.com/api/mcp/asset/226d9633-a136-4a49-bc54-c8724a4ab6de";
const S2W_BTN2_BG1   = "https://www.figma.com/api/mcp/asset/691609ce-8429-43c0-b903-56124d59d782";
const S2W_BTN2_VEC   = "https://www.figma.com/api/mcp/asset/29b769ca-506b-4714-9946-ffa9299d3c34";

// Step-2 bank icons & back button
const S2B_BANK_BG    = "https://www.figma.com/api/mcp/asset/6739ca24-54c6-486a-b70c-b2b95ce010bc";
const S2B_BANK_VEC   = "https://www.figma.com/api/mcp/asset/47d54e4f-88ae-47e6-9290-9606e0744726";
const S2B_CHEVRON    = "https://www.figma.com/api/mcp/asset/aa16e268-417a-4e63-b06c-3a4e8af8f987";
const S2B_BACK_BG    = "https://www.figma.com/api/mcp/asset/f0fbca18-3bcc-41a0-8973-b2f21a531f3b";
const S2B_BACK_VEC   = "https://www.figma.com/api/mcp/asset/00b78aca-79dc-4b13-8c97-ac4ca8b92192";
// Step-2 bank copy buttons (one per field)
const S2B_BTN_BG1    = "https://www.figma.com/api/mcp/asset/63c9f93a-9b5b-4d18-a79d-234adfd9703b";
const S2B_BTN_BG2    = "https://www.figma.com/api/mcp/asset/a084a6f2-49d3-4059-a8fc-a910f14efcf1";
const S2B_BTN_VEC    = "https://www.figma.com/api/mcp/asset/85bf6f49-945f-4c68-a868-06cadbf474e2";

// Step-2 agent icons & back button
const S2A_AGENT_BG   = "https://www.figma.com/api/mcp/asset/02d26233-106d-4721-9094-ef74efef5fe2";
const S2A_AGENT_VEC  = "https://www.figma.com/api/mcp/asset/5e5f0798-b990-4ac7-9b19-e09c26b9d44d";
const S2A_CHEVRON    = "https://www.figma.com/api/mcp/asset/01133503-ef3c-4900-b320-dccc6fbd689e";
const S2A_BACK_BG    = "https://www.figma.com/api/mcp/asset/b448b504-05d8-4d0f-af71-684229f2825a";
const S2A_BACK_VEC   = "https://www.figma.com/api/mcp/asset/d10d60c5-4156-4f4c-9de0-070a758aab68";
// Step-2 agent action buttons
const S2A_BTN1_BG1   = "https://www.figma.com/api/mcp/asset/d802ef72-2196-4968-8fcf-ba86b84557d5";
const S2A_BTN_BG2    = "https://www.figma.com/api/mcp/asset/f46db8e0-492f-4caf-9d76-f7fbbe05dc44";
const S2A_BTN1_VEC   = "https://www.figma.com/api/mcp/asset/d36d8c4f-4673-44e3-9722-46459b61a547";
const S2A_BTN2_BG1   = "https://www.figma.com/api/mcp/asset/6c0660f8-4cc0-46e8-9901-e016424256f7";
const S2A_BTN2_VEC   = "https://www.figma.com/api/mcp/asset/9937f657-b47c-4e50-8ba9-97104ee070c7";

// QR popup
const QR_CODE_IMG  = "https://www.figma.com/api/mcp/asset/8da785f9-4275-4cb3-a846-3abe2bde503d";
const QR_COPY_VEC  = "https://www.figma.com/api/mcp/asset/ef78ebf4-d7f5-4aed-8828-2a4915e65363";

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

// ── Figma icon components ─────────────────────────────────────────────────────
function WalletIconPopup() {
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

function BankIconPopup() {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_BANK_BG} />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[20px] top-1/2">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_BANK_VEC} />
      </div>
    </div>
  );
}

function AgentIconPopup() {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_AGENT_BG} />
      <div className="absolute inset-[20%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={POP_AGENT_VEC} />
      </div>
    </div>
  );
}

function WalletIconS2W() {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2W_WALLET_BG} />
      <div className="absolute aspect-[24/24] left-[18.75%] right-[18.75%] top-[6px]">
        <div className="absolute inset-[12.5%]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2W_WALLET_VEC} />
        </div>
      </div>
    </div>
  );
}

function BankIconS2B() {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2B_BANK_BG} />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[20px] top-1/2">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2B_BANK_VEC} />
      </div>
    </div>
  );
}

function AgentIconS2A() {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2A_AGENT_BG} />
      <div className="absolute inset-[20%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2A_AGENT_VEC} />
      </div>
    </div>
  );
}

function AccountIconInPopup({ type }: { type: AccountType }) {
  if (type === "wallet") return <WalletIconPopup />;
  if (type === "bank")   return <BankIconPopup />;
  return <AgentIconPopup />;
}

// ── Back/close button (top-left header) ───────────────────────────────────────
function BackBtn({ bg, vec, onClick }: { bg: string; vec: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute left-[12px] top-[12px] rounded-[100px] size-[32px] overflow-hidden hover:opacity-80 transition-opacity"
      data-testid="btn-modal-back"
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={bg} />
      <div className="absolute left-[8px] size-[16px] top-[8px]">
        <div className="absolute bottom-1/4 flex items-center justify-center left-[37.5%] right-[40.09%] top-1/4" style={{ containerType: "size" }}>
          <div className="flex-none h-[100cqw] rotate-90 w-[100cqh]">
            <div className="relative size-full">
              <div className="absolute inset-[-20.92%_-9.38%]">
                <img alt="" className="block max-w-none size-full" src={vec} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Dropdown chevron button (right side of account row) ───────────────────────
function DropdownBtn({ chevronVec, onClick }: { chevronVec: string; onClick?: () => void }) {
  return (
    <div
      className="relative rounded-[100px] shrink-0 size-[32px] cursor-pointer hover:opacity-80 transition-opacity"
      onClick={onClick}
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={S1_BACK_BG} />
      <div className="absolute left-[8px] size-[16px] top-[8px]">
        <div className="absolute inset-[16.65%_16.66%_16.68%_16.67%]">
          <div className="absolute inset-[-7.03%]">
            <img alt="" className="block max-w-none size-full" src={chevronVec} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Address action buttons ────────────────────────────────────────────────────
function AddrBtn1({
  bg1, bg2, vec, onClick,
}: { bg1: string; bg2: string; vec: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative rounded-[100px] shrink-0 size-[32px] hover:opacity-80 transition-opacity"
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={bg1} />
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={bg2} />
      <div className="absolute left-[8px] size-[16px] top-[8px]">
        <div className="absolute inset-[16.65%_16.67%_16.68%_16.66%]">
          <div className="absolute inset-[-7.03%]">
            <img alt="" className="block max-w-none size-full" src={vec} />
          </div>
        </div>
      </div>
    </button>
  );
}

// ── QR Popup ──────────────────────────────────────────────────────────────────
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
          <img alt="QR Code" className="absolute block inset-0 max-w-none size-full" src={QR_CODE_IMG} />
        </div>
        <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-white text-[20px] leading-[24px] whitespace-nowrap">
          {truncAddr(address)}
        </p>
        <button
          onClick={onCopy}
          className="bg-[#4a2300] flex gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] w-full hover:opacity-80 transition-opacity"
          data-testid="btn-qr-copy"
        >
          <div className="relative shrink-0 size-[24px]">
            <div className="absolute inset-[16.67%]">
              <div className="absolute inset-[-6.25%]">
                <img alt="" className="block max-w-none size-full" src={QR_COPY_VEC} />
              </div>
            </div>
          </div>
          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[16px] leading-[20px] whitespace-nowrap">
            {copied ? "Copied!" : "Copy Address"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Account selector popup ────────────────────────────────────────────────────
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
      <div className="flex items-center justify-between px-[16px] py-[16px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[20px] leading-[24px] whitespace-nowrap">
          Select Account
        </p>
        <button
          onClick={onClose}
          className="relative rounded-[100px] shrink-0 size-[24px] overflow-hidden hover:opacity-80 transition-opacity"
          data-testid="btn-popup-close"
        >
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

      {/* Search + list */}
      <div className="flex flex-col gap-[8px] p-[8px]">
        {/* Search field */}
        <div className="bg-[#222737] flex items-center gap-[8px] p-[8px] rounded-[8px] w-full">
          <div className="relative shrink-0 size-[24px]">
            <div className="absolute inset-[16.67%_16.67%_16.67%_16.66%]">
              <div className="absolute inset-[-6.25%]">
                <img alt="" className="block max-w-none size-full" src={POP_SEARCH_VEC} />
              </div>
            </div>
          </div>
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
            <p className="flex-1 [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[15px] leading-[24px] tracking-[-0.6px]">
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
              <AccountIconInPopup type={acc.type} />
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
            <BackBtn bg={S1_BACK_BG} vec={S1_BACK_VEC} onClick={handleClose} />
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
                    <AccountIconInPopup type={selected.type} />
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                      {selected.name}
                    </p>
                  </>
                ) : (
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                    Select Account
                  </p>
                )}
                <DropdownBtn chevronVec={S1_DROPDOWN_VEC} />
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
              className="bg-[#222737] flex-1 h-[48px] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
              data-testid="btn-add-cancel"
            >
              Cancel
            </button>
            <button
              onClick={() => selected && setStep(selected.type)}
              disabled={!selected}
              className={`bg-[#4a2300] flex-1 h-[48px] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] transition-opacity ${selected ? "opacity-100 hover:opacity-80 cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
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
            <BackBtn bg={S2W_BACK_BG} vec={S2W_BACK_VEC} onClick={handleBack} />
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

            {/* Selected account row (clickable → reopen popup) */}
            <div className="relative">
              <button
                onClick={() => { setPopupOpen((v) => !v); }}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-account-row"
              >
                <WalletIconS2W />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                  Your Wallet
                </p>
                <div className="relative shrink-0 size-[24px]">
                  <div className="absolute bottom-[40.09%] left-1/4 right-1/4 top-[37.5%]">
                    <div className="absolute inset-[-18.59%_-8.33%]">
                      <img alt="" className="block max-w-none size-full" src={S2W_CHEVRON} />
                    </div>
                  </div>
                </div>
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
                  {/* Button 1: opens QR popup (icon = QR grid visual = S2W_BTN1_VEC) */}
                  <AddrBtn1
                    bg1={S2W_BTN1_BG1} bg2={S2W_BTN_BG2} vec={S2W_BTN1_VEC}
                    onClick={() => setQrOpen(true)}
                  />
                  {/* Button 2: copies address (icon = copy-sheets visual = S2W_BTN2_VEC) */}
                  <AddrBtn1
                    bg1={S2W_BTN2_BG1} bg2={S2W_BTN_BG2} vec={S2W_BTN2_VEC}
                    onClick={() => handleCopy(activeAddr)}
                  />
                </div>
              </div>
              {copied && (
                <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#42bf23] text-[12px] leading-[16px]">
                  Address copied!
                </p>
              )}
            </div>
          </div>

          {/* Close button */}
          <div className="px-[39px] pt-[24px] pb-[32px]">
            <button
              onClick={handleClose}
              className="bg-[#4a2300] h-[48px] w-full rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
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
            <BackBtn bg={S2B_BACK_BG} vec={S2B_BACK_VEC} onClick={handleBack} />
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
                <BankIconS2B />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                  Bank Account
                </p>
                <div className="relative shrink-0 size-[24px]">
                  <div className="absolute bottom-[40.09%] left-1/4 right-1/4 top-[37.5%]">
                    <div className="absolute inset-[-18.59%_-8.33%]">
                      <img alt="" className="block max-w-none size-full" src={S2B_CHEVRON} />
                    </div>
                  </div>
                </div>
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
                  <p className="flex-1 [font-family:'Mont',sans-serif] font-semibold text-white text-[20px] leading-[24px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" data-testid="text-recipient-name">
                    {recipientName || "—"}
                  </p>
                  <button
                    onClick={() => handleCopyField("recipientName")}
                    className="relative rounded-[100px] shrink-0 size-[32px] hover:opacity-80 transition-opacity"
                    data-testid="btn-copy-name"
                    title={copiedField === "recipientName" ? "Copied!" : "Copy"}
                  >
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2B_BTN_BG1} />
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2B_BTN_BG2} />
                    <div className="absolute left-[8px] size-[16px] top-[8px]">
                      <div className="absolute inset-[16.65%_16.66%_16.68%_16.67%]">
                        <div className="absolute inset-[-7.03%]">
                          <img alt="" className="block max-w-none size-full" src={S2B_BTN_VEC} />
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* IBAN */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">
                  IBAN Bank Number
                </p>
                <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] py-[10px] rounded-[16px] w-full">
                  <p className="flex-1 [font-family:'JetBrains_Mono',sans-serif] font-semibold text-white text-[20px] leading-[24px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap tracking-wider" data-testid="text-iban">
                    {iban || "—"}
                  </p>
                  <button
                    onClick={() => handleCopyField("iban")}
                    className="relative rounded-[100px] shrink-0 size-[32px] hover:opacity-80 transition-opacity"
                    data-testid="btn-copy-iban"
                    title={copiedField === "iban" ? "Copied!" : "Copy"}
                  >
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2B_BTN_BG1} />
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={S2B_BTN_BG2} />
                    <div className="absolute left-[8px] size-[16px] top-[8px]">
                      <div className="absolute inset-[16.65%_16.66%_16.68%_16.67%]">
                        <div className="absolute inset-[-7.03%]">
                          <img alt="" className="block max-w-none size-full" src={S2B_BTN_VEC} />
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Close button */}
          <div className="px-[39px] pt-[24px] pb-[32px]">
            <button
              onClick={handleClose}
              className="bg-[#4a2300] h-[48px] w-full rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
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
          <BackBtn bg={S2A_BACK_BG} vec={S2A_BACK_VEC} onClick={handleBack} />
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
              <AgentIconS2A />
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">
                {selected?.name ?? "Yield Agent"}
              </p>
              <div className="relative shrink-0 size-[24px]">
                <div className="absolute bottom-[40.09%] left-1/4 right-1/4 top-[37.5%]">
                  <div className="absolute inset-[-18.59%_-8.33%]">
                    <img alt="" className="block max-w-none size-full" src={S2A_CHEVRON} />
                  </div>
                </div>
              </div>
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
                {/* Button 1: opens QR popup */}
                <AddrBtn1
                  bg1={S2A_BTN1_BG1} bg2={S2A_BTN_BG2} vec={S2A_BTN1_VEC}
                  onClick={() => setQrOpen(true)}
                />
                {/* Button 2: copies address */}
                <AddrBtn1
                  bg1={S2A_BTN2_BG1} bg2={S2A_BTN_BG2} vec={S2A_BTN2_VEC}
                  onClick={() => handleCopy(activeAddr)}
                />
              </div>
            </div>
            {copied && (
              <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#42bf23] text-[12px] leading-[16px]">
                Address copied!
              </p>
            )}
          </div>
        </div>

        {/* Close button */}
        <div className="px-[39px] pt-[24px] pb-[32px]">
          <button
            onClick={handleClose}
            className="bg-[#4a2300] h-[48px] w-full rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
            data-testid="btn-agent-close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
