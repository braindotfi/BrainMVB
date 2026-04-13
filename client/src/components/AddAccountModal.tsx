import { useState } from "react";

// ── Figma asset URLs ──────────────────────────────────────────────────────────
// Step-1 icons (32px inverted)
const S1_WALLET_BG  = "https://www.figma.com/api/mcp/asset/7de069dd-2dab-456f-9d36-abd90fa7e977";
const S1_WALLET_VEC = "https://www.figma.com/api/mcp/asset/5e2c87e8-c022-4d1e-8b92-e31b7eb876e8";
const S1_BANK_BG    = "https://www.figma.com/api/mcp/asset/23e48f18-8079-4624-9b6d-fe22cd655db8";
const S1_BANK_VEC   = "https://www.figma.com/api/mcp/asset/35fb5b7d-00a0-43e7-850d-3befc84084be";
const S1_AGENT_BG   = "https://www.figma.com/api/mcp/asset/d9400d24-90ed-4b0d-a4b5-187a31856c06";
const S1_AGENT_VEC  = "https://www.figma.com/api/mcp/asset/4e75716d-1fac-41f9-9b22-ce57a98785ce";

// Step-2 icons (32px inverted)
const S2_WALLET_BG  = "https://www.figma.com/api/mcp/asset/3434da22-1109-42c9-8463-766fc7d430d5";
const S2_WALLET_VEC = "https://www.figma.com/api/mcp/asset/23badda0-cfc9-4344-b8bf-5243dc6265de";
const S2_BANK_BG    = "https://www.figma.com/api/mcp/asset/81b93e22-61f1-4e63-b266-c055214925fc";
const S2_BANK_VEC   = "https://www.figma.com/api/mcp/asset/38818791-1a61-47f7-89c2-0357f41dd7c9";
const S2_AGENT_BG   = "https://www.figma.com/api/mcp/asset/ab71d477-c62c-4702-8fad-3faad2caad14";
const S2_AGENT_VEC  = "https://www.figma.com/api/mcp/asset/189f71b9-5ec7-4912-a5be-94895b2142e7";

// Action buttons
const COPY_BG1 = "https://www.figma.com/api/mcp/asset/b90f1407-4208-4418-a89f-2f3ef33c821e";
const COPY_BG2 = "https://www.figma.com/api/mcp/asset/8002ccb5-6d93-42fe-823f-8ccd3b63c88f";
const COPY_VEC = "https://www.figma.com/api/mcp/asset/31f37edc-175a-48fb-b07e-d250be6cb044";
const QR_BG1   = "https://www.figma.com/api/mcp/asset/3b56051e-9208-4218-ab01-c9cf0e09973f";
const QR_VEC   = "https://www.figma.com/api/mcp/asset/0f01ada3-665e-4f2e-a75c-0d6117893f07";

// Back button
const BACK_BG  = "https://www.figma.com/api/mcp/asset/9808679d-bd1a-42b7-aa87-018d60bebe74";
const BACK_VEC = "https://www.figma.com/api/mcp/asset/5ae57232-c024-4602-9449-3d9032ee935e";

// QR popup
const QR_CODE_IMG  = "https://www.figma.com/api/mcp/asset/8da785f9-4275-4cb3-a846-3abe2bde503d";
const QR_COPY_VEC  = "https://www.figma.com/api/mcp/asset/ef78ebf4-d7f5-4aed-8828-2a4915e65363";

// Paste button backgrounds (same QR layer used for paste pill)
const PASTE_BG1 = "https://www.figma.com/api/mcp/asset/4080b4b7-65b1-44b9-9750-ba0e9a268f56";
const PASTE_BG2 = "https://www.figma.com/api/mcp/asset/d5c4bc35-742b-4bb4-be38-cf647cdd829a";

// ── Figma icon components ─────────────────────────────────────────────────────
function WalletIcon32({ s }: { s: 1 | 2 }) {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={s === 1 ? S1_WALLET_BG : S2_WALLET_BG} />
      <div className="absolute aspect-[24/24] left-[18.75%] right-[18.75%] top-[6px]">
        <div className="absolute inset-[12.5%]">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={s === 1 ? S1_WALLET_VEC : S2_WALLET_VEC} />
        </div>
      </div>
    </div>
  );
}

function BankIcon32({ s }: { s: 1 | 2 }) {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={s === 1 ? S1_BANK_BG : S2_BANK_BG} />
      <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[20px] top-1/2">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={s === 1 ? S1_BANK_VEC : S2_BANK_VEC} />
      </div>
    </div>
  );
}

function AgentIcon32({ s }: { s: 1 | 2 }) {
  return (
    <div className="overflow-clip relative rounded-[16px] shrink-0 size-[32px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={s === 1 ? S1_AGENT_BG : S2_AGENT_BG} />
      <div className="absolute inset-[20%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={s === 1 ? S1_AGENT_VEC : S2_AGENT_VEC} />
      </div>
    </div>
  );
}

function CopyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative rounded-[100px] shrink-0 size-[32px] hover:opacity-80 transition-opacity"
      data-testid="btn-copy-address"
      title="Copy address"
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={COPY_BG1} />
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={COPY_BG2} />
      <div className="absolute left-[8px] size-[16px] top-[8px]">
        <div className="absolute inset-[16.65%_16.67%_16.68%_16.66%]">
          <div className="absolute inset-[-7.03%]">
            <img alt="" className="block max-w-none size-full" src={COPY_VEC} />
          </div>
        </div>
      </div>
    </button>
  );
}

function QRBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative rounded-[100px] shrink-0 size-[32px] hover:opacity-80 transition-opacity"
      data-testid="btn-show-qr"
      title="Show QR code"
    >
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={QR_BG1} />
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={COPY_BG2} />
      <div className="absolute left-[8px] size-[16px] top-[8px]">
        <div className="absolute inset-[16.65%_16.66%_16.68%_16.67%]">
          <div className="absolute inset-[-7.03%]">
            <img alt="" className="block max-w-none size-full" src={QR_VEC} />
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncAddr(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-5)}`;
}

// ── Data ──────────────────────────────────────────────────────────────────────
type AccountType = "bank" | "wallet" | "agent" | null;
type Step = "select-type" | "bank" | "wallet" | "agent";

const WALLET_ADDRESS = "0x7cB57B5A97eAbe94205C07890BE4c1aD31E486A8";

const agentList = [
  { id: "1", name: "AlphaFlow",     address: "0xA1B2C3D4E5f12345678901234567890aAbBcCdD" },
  { id: "2", name: "SwarmAlpha",    address: "0xB2C3D4E5F67890123456789012345678901AbcD" },
  { id: "3", name: "Risk Sentinel", address: "0xC3D4e5F678901234567890ABCDEF0123456789A" },
  { id: "4", name: "YieldMax v2",   address: "0xD4E5F6789012345678901234567890ABCDEF012" },
];

// ── Chevron right SVG (for option rows) ───────────────────────────────────────
function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M6 3L11 8L6 13" stroke="#414965" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M6 9L12 15L18 9" stroke="#414965" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── QR Popup ──────────────────────────────────────────────────────────────────
function QRPopup({ address, onClose, onCopy, copied }: { address: string; onClose: () => void; onCopy: () => void; copied: boolean }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0a0c10] border border-[#1d2132] rounded-[24px] flex flex-col gap-[16px] items-center p-[24px]">
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
        <button
          onClick={onClose}
          className="text-[#414965] text-[14px] [font-family:'Plus Jakarta Sans',sans-serif] hover:text-[#6c779d] transition-colors"
          data-testid="btn-qr-close"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  excludeTypes?: Array<"bank" | "wallet" | "agent">;
}

export const AddAccountModal = ({ open, onClose, excludeTypes = [] }: Props): JSX.Element | null => {
  const [step, setStep] = useState<Step>("select-type");
  const [selectedAgent, setSelectedAgent] = useState<typeof agentList[0] | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [iban, setIban] = useState("");
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pastedField, setPastedField] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep("select-type");
      setSelectedAgent(null);
      setRecipientName("");
      setIban("");
      setSuccess(false);
      setCopied(false);
      setQrOpen(false);
    }, 300);
  };

  const handleTypeSelect = (type: AccountType) => {
    if (type === "agent") {
      setSelectedAgent(agentList[0]);
    }
    setStep(type as Step);
    setQrOpen(false);
  };

  const handleBack = () => {
    setStep("select-type");
    setSelectedAgent(null);
    setQrOpen(false);
  };

  const handleCopy = async (addr: string) => {
    try { await navigator.clipboard.writeText(addr); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePaste = async (field: "recipientName" | "iban") => {
    let text = "";
    try { text = await navigator.clipboard.readText(); }
    catch { text = field === "iban" ? "AE070331234567890123456" : "John Smith"; }
    if (field === "recipientName") setRecipientName(text);
    else setIban(text);
    setPastedField(field);
    setTimeout(() => setPastedField(null), 1500);
  };

  const handleConfirm = () => {
    setSuccess(true);
    setTimeout(() => handleClose(), 2000);
  };

  const activeAddress = step === "wallet" ? WALLET_ADDRESS : (selectedAgent?.address ?? "");

  const canConfirm = step === "wallet"
    ? true
    : step === "bank"
    ? recipientName.trim().length > 0 && iban.trim().length > 0
    : step === "agent"
    ? !!selectedAgent
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-[402px] flex flex-col bg-[#0a0c10] border border-[#1d2132] rounded-[24px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Success overlay */}
        {success && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0c10] gap-4">
            <div className="w-16 h-16 rounded-full bg-[#123509] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M5 14L11 20L23 8" stroke="#42bf23" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-white text-xl">Account Added!</span>
            <span className="[font-family:'Plus Jakarta Sans',Helvetica] text-[#6c779d] text-sm">Your account has been connected successfully.</span>
          </div>
        )}

        {/* QR overlay */}
        {qrOpen && (
          <QRPopup
            address={activeAddress}
            onClose={() => setQrOpen(false)}
            onCopy={() => handleCopy(activeAddress)}
            copied={copied}
          />
        )}

        {/* ── Header ── */}
        <div className="bg-[#0a0c10] flex-shrink-0 h-[56px] relative flex items-center justify-center w-full">
          {step !== "select-type" && (
            <button
              onClick={handleBack}
              className="absolute left-[12px] top-[12px] rounded-[100px] size-[32px] relative overflow-hidden hover:opacity-80 transition-opacity"
              data-testid="btn-modal-back"
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
          )}

          {/* Step dots */}
          <div className="flex items-center justify-center h-[24px] px-[12px] py-[8px] rounded-[100px]" style={{ background: "#12032D" }}>
            <div className="flex items-center gap-[8px]">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="rounded-full shrink-0 transition-colors duration-300"
                  style={{ width: 8, height: 8, background: (n === 1 || step !== "select-type") ? "#7631EE" : "#240757" }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleClose}
            className="absolute right-[12px] top-[12px] rounded-[100px] size-[32px] bg-[#1d2132] flex items-center justify-center hover:bg-[#222737] transition-colors"
            data-testid="btn-add-close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col gap-[24px] px-[39px] pt-[23px] pb-[32px]">

          {/* ── STEP 1: Select type ── */}
          {step === "select-type" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Add Money</p>
                <p className="[font-family:'Gilroy',sans-serif] text-[#414965] text-[22px] leading-[28px]">Which type of account?</p>
              </div>

              <div className="flex flex-col gap-[8px]">
                {!excludeTypes.includes("wallet") && (
                  <button
                    onClick={() => handleTypeSelect("wallet")}
                    className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                    data-testid="btn-select-wallet"
                  >
                    <WalletIcon32 s={1} />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left">Your Wallet</span>
                    <ChevronRight />
                  </button>
                )}
                {!excludeTypes.includes("bank") && (
                  <button
                    onClick={() => handleTypeSelect("bank")}
                    className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                    data-testid="btn-select-bank"
                  >
                    <BankIcon32 s={1} />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left">Bank Account</span>
                    <ChevronRight />
                  </button>
                )}
                {!excludeTypes.includes("agent") && (
                  <button
                    onClick={() => handleTypeSelect("agent")}
                    className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                    data-testid="btn-select-agent"
                  >
                    <AgentIcon32 s={1} />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left">AI Agent Account</span>
                    <ChevronRight />
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── STEP 2: Your Wallet ── */}
          {step === "wallet" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Add Money</p>
                <p className="[font-family:'Gilroy',sans-serif] text-[#414965] text-[22px] leading-[28px]">What account should we fund?</p>
              </div>

              {/* Account selector */}
              <button
                onClick={handleBack}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-account-selector"
              >
                <WalletIcon32 s={2} />
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left">Your Wallet</span>
                <ChevronDown />
              </button>

              {/* Wallet Address */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Wallet Address</p>
                <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full">
                  <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 min-w-0 truncate">
                    {truncAddr(WALLET_ADDRESS)}
                  </p>
                  <div className="flex gap-[8px] items-center shrink-0">
                    <CopyBtn onClick={() => handleCopy(WALLET_ADDRESS)} />
                    <QRBtn onClick={() => setQrOpen(true)} />
                  </div>
                </div>
                {copied && (
                  <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#42bf23] text-[12px]">Address copied!</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-[16px]">
                <button
                  onClick={handleClose}
                  className="flex-1 h-[48px] bg-[#222737] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
                  data-testid="btn-add-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 h-[48px] bg-[#4a2300] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
                  data-testid="btn-add-next"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: Bank Account ── */}
          {step === "bank" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Add Money</p>
                <p className="[font-family:'Gilroy',sans-serif] text-[#414965] text-[22px] leading-[28px]">What account should we fund?</p>
              </div>

              {/* Account selector */}
              <button
                onClick={handleBack}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-account-selector-bank"
              >
                <BankIcon32 s={2} />
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left">Bank Account</span>
                <ChevronDown />
              </button>

              {/* Recipient Name */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Account Name</p>
                <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full">
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="John Smith"
                    className="flex-1 bg-transparent text-white text-[20px] [font-family:'Gilroy',sans-serif] placeholder:text-[#414965] outline-none min-w-0"
                    data-testid="input-recipient-name"
                  />
                  <button
                    onClick={() => handlePaste("recipientName")}
                    className="bg-[#4a2300] px-[12px] py-[6px] rounded-[100px] shrink-0 hover:opacity-80 transition-opacity"
                    data-testid="btn-paste-name"
                  >
                    <span className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#ff9500] text-[12px] font-semibold whitespace-nowrap">
                      {pastedField === "recipientName" ? "Pasted!" : "Paste"}
                    </span>
                  </button>
                </div>
              </div>

              {/* IBAN */}
              <div className="flex flex-col gap-[4px]">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">IBAN Bank Number</p>
                <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full">
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="AE0703....123456"
                    className="flex-1 bg-transparent text-white text-[18px] [font-family:'JetBrains_Mono',sans-serif] placeholder:text-[#414965] outline-none tracking-wider min-w-0"
                    data-testid="input-iban"
                  />
                  <button
                    onClick={() => handlePaste("iban")}
                    className="bg-[#4a2300] px-[12px] py-[6px] rounded-[100px] shrink-0 hover:opacity-80 transition-opacity"
                    data-testid="btn-paste-iban"
                  >
                    <span className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#ff9500] text-[12px] font-semibold whitespace-nowrap">
                      {pastedField === "iban" ? "Pasted!" : "Paste"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-[16px]">
                <button
                  onClick={handleClose}
                  className="flex-1 h-[48px] bg-[#222737] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
                  data-testid="btn-add-cancel-bank"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="flex-1 h-[48px] bg-[#4a2300] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity disabled:opacity-40"
                  data-testid="btn-add-next-bank"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: AI Agent Account ── */}
          {step === "agent" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Add Money</p>
                <p className="[font-family:'Gilroy',sans-serif] text-[#414965] text-[22px] leading-[28px]">What account should we fund?</p>
              </div>

              {/* Agent selector */}
              <div className="flex flex-col gap-[4px]">
                <div className="relative">
                  <button
                    onClick={handleBack}
                    className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                    data-testid="btn-account-selector-agent"
                  >
                    <AgentIcon32 s={2} />
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left">
                      {selectedAgent?.name ?? "Select Agent"}
                    </span>
                    <ChevronDown />
                  </button>
                </div>

                {/* Agent list (dropdown) */}
                <div className="flex flex-col gap-[4px] mt-[4px]">
                  {agentList.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className={`flex items-center gap-[8px] px-[16px] py-[10px] rounded-[12px] transition-colors ${
                        selectedAgent?.id === agent.id ? "bg-[#123509] border border-[rgba(66,191,35,0.2)]" : "bg-[#11141b] hover:bg-[#1d2132]"
                      }`}
                      data-testid={`btn-agent-${agent.id}`}
                    >
                      <AgentIcon32 s={2} />
                      <span className="[font-family:'Plus Jakarta Sans',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[24px] flex-1 text-left">
                        {agent.name}
                      </span>
                      {selectedAgent?.id === agent.id && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8L6.5 11.5L13 4.5" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet Address */}
              {selectedAgent && (
                <div className="flex flex-col gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">Wallet Address</p>
                  <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full">
                    <p className="[font-family:'JetBrains_Mono',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 min-w-0 truncate">
                      {truncAddr(selectedAgent.address)}
                    </p>
                    <div className="flex gap-[8px] items-center shrink-0">
                      <CopyBtn onClick={() => handleCopy(selectedAgent.address)} />
                      <QRBtn onClick={() => setQrOpen(true)} />
                    </div>
                  </div>
                  {copied && (
                    <p className="[font-family:'Plus Jakarta Sans',sans-serif] text-[#42bf23] text-[12px]">Address copied!</p>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex gap-[16px]">
                <button
                  onClick={handleClose}
                  className="flex-1 h-[48px] bg-[#222737] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
                  data-testid="btn-add-cancel-agent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="flex-1 h-[48px] bg-[#4a2300] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity disabled:opacity-40"
                  data-testid="btn-add-next-agent"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
