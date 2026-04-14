import { useState } from "react";
import { useAuth } from "@/lib/authContext";

// ── Figma asset URLs ──────────────────────────────────────────────────────────

// Header back button
const BACK_BG  = "https://www.figma.com/api/mcp/asset/28c1cb48-d755-43b3-a408-0303879150d0";
const BACK_VEC = "https://www.figma.com/api/mcp/asset/4356db82-74dc-481d-9b7b-397796b1864b";

// Step progress indicator images (steps 1 / 2 / 3)
const STEP1_IND = "https://www.figma.com/api/mcp/asset/d3625bf9-3c31-45d7-8df2-12919b08e899";
const STEP2_IND = "https://www.figma.com/api/mcp/asset/2a0585ad-8b28-4d9a-b93c-f24bd071fd22";
const STEP3_IND = "https://www.figma.com/api/mcp/asset/c626951f-19e6-483d-afd6-0e7ada278b3e";

// Chevron-down for dropdown rows
const CHEVRON_BG  = "https://www.figma.com/api/mcp/asset/28c1cb48-d755-43b3-a408-0303879150d0";
const CHEVRON_VEC = "https://www.figma.com/api/mcp/asset/d0cdfad5-4308-445c-a111-b558f85127c9";

// Popup: recipient-type icons (32 px inverted)
const POP_WALLET_BG  = "https://www.figma.com/api/mcp/asset/14bf435a-a003-4588-9029-5ce6973c3a94";
const POP_WALLET_VEC = "https://www.figma.com/api/mcp/asset/783e8c47-1571-4b96-9c63-cd875fc7a1e4";
const POP_BANK_BG    = "https://www.figma.com/api/mcp/asset/b3dc8e97-fef3-4cff-8f76-054a05e520bf";
const POP_BANK_VEC   = "https://www.figma.com/api/mcp/asset/2a4569bd-623f-43e8-90d3-a53e41c7e325";
const POP_AGENT_BG   = "https://www.figma.com/api/mcp/asset/9e6a186b-9934-4809-b3f0-64b27f9fec60";
const POP_AGENT_VEC  = "https://www.figma.com/api/mcp/asset/e857828a-6482-4b80-80af-4e56cecf3cf7";

// Popup: search + close
const POP_SEARCH_VEC = "https://www.figma.com/api/mcp/asset/66211182-8dde-42ab-a29d-ce2c7a43948c";
const POP_CLOSE_BG   = "https://www.figma.com/api/mcp/asset/76c74d2e-e77a-4dd9-887d-333365e41eea";
const POP_CLOSE_VEC  = "https://www.figma.com/api/mcp/asset/f39dbbe8-075b-4e3f-aaf9-bdfac59b7309";

// ── Types & data ──────────────────────────────────────────────────────────────

type RecipientType = "bank" | "wallet" | "agent";
type Step = 1 | 2 | 3 | 4;

interface SendState {
  step: Step;
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
}

const RECIPIENT_TYPES: { id: RecipientType; name: string }[] = [
  { id: "wallet", name: "Wallet Address" },
  { id: "bank",   name: "Bank Account" },
  { id: "agent",  name: "AI Agent Account" },
];

const AGENT_ACCOUNTS = [
  { id: "yield",    name: "Yield Agent",   address: "0xYld3F...4f2A" },
  { id: "trader",   name: "TraderPro",     address: "0xTrd9c...1B7E" },
  { id: "treasury", name: "Treasury AI",   address: "0xTrs2E...7D3F" },
];

const FEE = "0.50";

const INITIAL: SendState = {
  step: 1,
  recipientType: null,
  recipientName: "",
  iban: "",
  walletAddress: "",
  selectedAgentId: null,
  amount: "",
};

// ── Sub-components ────────────────────────────────────────────────────────────

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

function RecipientPopup({
  onSelect,
  onClose,
  excludeTypes = [],
}: {
  onSelect: (t: RecipientType) => void;
  onClose: () => void;
  excludeTypes?: Array<RecipientType>;
}) {
  const [search, setSearch] = useState("");
  const filtered = RECIPIENT_TYPES.filter(
    (r) => !excludeTypes.includes(r.id) && r.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[320px] bg-[#0a0c10] border border-[#1d2132] rounded-[16px] flex flex-col shadow-[0px_68px_27px_0px_rgba(0,0,0,0.06),0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34),0px_4px_9px_0px_rgba(0,0,0,0.39)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[16px] py-[16px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[20px] leading-[24px]">Select Account</p>
          <button
            onClick={onClose}
            className="relative rounded-[100px] shrink-0 size-[24px] overflow-hidden hover:opacity-80 transition-opacity"
            data-testid="btn-send-popup-close"
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

        <div className="flex flex-col gap-[8px] p-[8px]">
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="bg-transparent flex-1 text-[#6c779d] text-[16px] [font-family:'Gilroy',sans-serif] outline-none placeholder:text-[#6c779d] min-w-0"
              data-testid="input-send-search"
            />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-center px-[8px] py-[4px]">
              <p className="flex-1 [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[15px] leading-[24px] tracking-[-0.6px]">All Assets</p>
            </div>
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className="flex items-center gap-[8px] p-[8px] rounded-[8px] w-full transition-colors hover:bg-[#1d2132]"
                data-testid={`btn-recipient-${r.id}`}
              >
                <RecipientIcon type={r.id} />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[32px] whitespace-nowrap">
                  {r.name}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-[8px] py-[8px] text-[#414965] text-[14px] [font-family:'Gilroy',sans-serif]">No results</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentPopup({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[320px] bg-[#0a0c10] border border-[#1d2132] rounded-[16px] flex flex-col shadow-[0px_68px_27px_0px_rgba(0,0,0,0.06),0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[16px] py-[16px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[20px] leading-[24px]">Select Agent</p>
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
      </div>
    </div>
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

function InputBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full">
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

export const SendModal = ({ open, onClose, sourceAccountType = "wallet", excludeTypes = [] }: Props): JSX.Element | null => {
  const { wirexAccounts } = useAuth();
  const [state, setState] = useState<SendState>(INITIAL);
  const [popupOpen, setPopupOpen]       = useState(false);
  const [agentPopupOpen, setAgentPopupOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  if (!open) return null;

  const set = (patch: Partial<SendState>) => setState((prev) => ({ ...prev, ...patch }));

  const bankAcc   = wirexAccounts.find((a) => a.type === "bank");
  const walletAcc = wirexAccounts.find((a) => a.type === "wallet");
  const sourceAcc = sourceAccountType === "bank" ? bankAcc : walletAcc;

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setState(INITIAL);
      setPopupOpen(false);
      setAgentPopupOpen(false);
      setSent(false);
      setSending(false);
    }, 300);
  };

  const handleBack = () => {
    if (state.step > 1) set({ step: (state.step - 1) as Step });
    setPopupOpen(false);
    setAgentPopupOpen(false);
  };

  const handleNext = () => {
    if (state.step < 4) set({ step: (state.step + 1) as Step });
  };

  const handleConfirm = () => {
    setSending(true);
    setTimeout(() => { setSending(false); setSent(true); }, 1800);
  };

  const canNext = (() => {
    if (state.step === 1) return state.recipientType !== null;
    if (state.step === 2) {
      if (state.recipientType === "bank")   return state.recipientName.length > 0 && state.iban.length > 6;
      if (state.recipientType === "wallet") return state.walletAddress.length > 10;
      if (state.recipientType === "agent")  return state.selectedAgentId !== null;
    }
    if (state.step === 3) return parseFloat(state.amount || "0") > 0;
    return true;
  })();

  const selectedAgent = AGENT_ACCOUNTS.find((a) => a.id === state.selectedAgentId);
  const truncAddr = (addr: string) => addr.slice(0, 8) + "..." + addr.slice(-6);

  const recipientLabel = () => {
    if (state.recipientType === "bank")   return `${state.recipientName}`;
    if (state.recipientType === "wallet") return truncAddr(state.walletAddress);
    if (state.recipientType === "agent")  return selectedAgent?.name ?? "AI Agent";
    return "";
  };

  const stepInd = [STEP1_IND, STEP2_IND, STEP3_IND][(state.step as number) - 1] ?? STEP3_IND;

  // ── Success state ──────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden">
          <div className="bg-[#0a0c10] h-[56px] flex items-center justify-center">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px]">Transfer Complete</p>
          </div>
          <div className="flex flex-col items-center gap-[24px] px-[39px] pt-[24px] pb-[32px] text-center">
            <div className="w-[72px] h-[72px] rounded-full bg-[#0c2a09] flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M6 16L13 23L26 9" stroke="#42bf23" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex flex-col gap-[4px]">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[28px] leading-[36px]">
                {state.amount ? `$${parseFloat(state.amount).toFixed(2)} Sent!` : "Sent!"}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] text-[#6c779d] text-[16px] leading-[24px]">
                Transfer to {recipientLabel()} was successful.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="bg-[#4a2300] h-[48px] w-full rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#ff9500] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-[402px] bg-[#0a0c10] border border-[#1d2132] rounded-[24px] overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-[#0a0c10] h-[56px] relative flex items-center justify-center">
          <BackBtn onClick={state.step === 1 ? handleClose : handleBack} />
          {state.step < 4 ? (
            <div className="h-[24px] w-[64px]">
              <img alt="" className="block max-w-none size-full" src={stepInd} />
            </div>
          ) : (
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap">
              Review Details
            </p>
          )}
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-[24px] px-[39px] pt-[24px]">

          {/* ── STEP 1: Select recipient type ────────────────────────────── */}
          {state.step === 1 && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Where are we sending to?</p>
              </div>

              <button
                onClick={() => setPopupOpen((v) => !v)}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-send-select"
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

              {popupOpen && (
                <RecipientPopup
                  excludeTypes={excludeTypes}
                  onSelect={(t) => { set({ recipientType: t }); setPopupOpen(false); }}
                  onClose={() => setPopupOpen(false)}
                />
              )}
            </>
          )}

          {/* ── STEP 2: Bank ─────────────────────────────────────────────── */}
          {state.step === 2 && state.recipientType === "bank" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Who are we sending to?</p>
              </div>

              <button
                onClick={handleBack}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-send-type-bank"
              >
                <RecipientIcon type="bank" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">Bank Account</p>
                <ChevronBtn />
              </button>

              <div className="flex flex-col gap-[24px]">
                <FieldRow label="Recipient Name">
                  <InputBox>
                    <input
                      type="text"
                      value={state.recipientName}
                      onChange={(e) => set({ recipientName: e.target.value })}
                      placeholder="John Smith"
                      className="flex-1 bg-transparent text-white text-[20px] [font-family:'Mont',sans-serif] font-semibold placeholder:text-[#414965] outline-none min-w-0"
                      data-testid="input-send-recipient-name"
                    />
                  </InputBox>
                </FieldRow>
                <FieldRow label="IBAN Bank Number">
                  <InputBox>
                    <input
                      type="text"
                      value={state.iban}
                      onChange={(e) => set({ iban: e.target.value })}
                      placeholder="AE0703...123456"
                      className="flex-1 bg-transparent text-white text-[20px] [font-family:'JetBrains_Mono',sans-serif] font-semibold placeholder:text-[#414965] outline-none min-w-0 tracking-wider"
                      data-testid="input-send-iban"
                    />
                  </InputBox>
                </FieldRow>
              </div>
            </>
          )}

          {/* ── STEP 2: Wallet ───────────────────────────────────────────── */}
          {state.step === 2 && state.recipientType === "wallet" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Who are we sending to?</p>
              </div>

              <button
                onClick={handleBack}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-send-type-wallet"
              >
                <RecipientIcon type="wallet" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">Wallet Address</p>
                <ChevronBtn />
              </button>

              <FieldRow label="Wallet Address">
                <InputBox>
                  <input
                    type="text"
                    value={state.walletAddress}
                    onChange={(e) => set({ walletAddress: e.target.value })}
                    placeholder="0x..."
                    className="flex-1 bg-transparent text-white text-[18px] [font-family:'JetBrains_Mono',sans-serif] font-semibold placeholder:text-[#414965] outline-none min-w-0"
                    data-testid="input-send-wallet-addr"
                  />
                  <button
                    onClick={async () => { try { const t = await navigator.clipboard.readText(); set({ walletAddress: t }); } catch {} }}
                    className="bg-[#4a2300] px-[12px] py-[6px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[12px] shrink-0 hover:opacity-80 transition-opacity"
                    data-testid="btn-send-paste-addr"
                  >
                    Paste
                  </button>
                </InputBox>
                {state.walletAddress && state.walletAddress.length < 10 && (
                  <p className="[font-family:'Gilroy',sans-serif] text-red-400 text-[13px] mt-[4px]">Please enter a valid wallet address</p>
                )}
              </FieldRow>
            </>
          )}

          {/* ── STEP 2: Agent ─────────────────────────────────────────────── */}
          {state.step === 2 && state.recipientType === "agent" && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Money</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">Who are we sending to?</p>
              </div>

              <button
                onClick={handleBack}
                className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                data-testid="btn-send-type-agent"
              >
                <RecipientIcon type="agent" />
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[24px] flex-1 text-left whitespace-nowrap">AI Agent Account</p>
                <ChevronBtn />
              </button>

              <FieldRow label="Select Agent">
                <button
                  onClick={() => setAgentPopupOpen((v) => !v)}
                  className="bg-[#222737] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full hover:bg-[#2a3050] transition-colors"
                  data-testid="btn-send-select-agent"
                >
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
                  <AgentPopup
                    onSelect={(id) => { set({ selectedAgentId: id }); setAgentPopupOpen(false); }}
                    onClose={() => setAgentPopupOpen(false)}
                  />
                )}
              </FieldRow>
            </>
          )}

          {/* ── STEP 3: Amount ───────────────────────────────────────────── */}
          {state.step === 3 && (
            <>
              <div className="flex flex-col">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[32px] leading-[40px]">Send Amount</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[22px] leading-[28px]">How much are we sending?</p>
              </div>

              <FieldRow label="Amount">
                <InputBox>
                  <span className="[font-family:'JetBrains_Mono',sans-serif] font-bold text-[#414965] text-[20px] shrink-0">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.amount}
                    onChange={(e) => set({ amount: e.target.value })}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-white text-[20px] [font-family:'JetBrains_Mono',sans-serif] font-bold placeholder:text-[#414965] outline-none min-w-0"
                    data-testid="input-send-amount"
                  />
                </InputBox>
              </FieldRow>

              <div className="flex gap-[8px]">
                {["100", "500", "1000", "5000"].map((v) => (
                  <button
                    key={v}
                    onClick={() => set({ amount: v })}
                    className="flex-1 py-[8px] bg-[#222737] border border-[#1d2132] rounded-[12px] [font-family:'Gilroy',sans-serif] text-[#6c779d] text-[14px] hover:text-white hover:border-[#414965] transition-colors"
                    data-testid={`btn-send-quick-${v}`}
                  >
                    ${parseInt(v).toLocaleString()}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── STEP 4: Review ───────────────────────────────────────────── */}
          {state.step === 4 && (
            <>
              <FieldRow label="Sending From">
                <div className="bg-[#06070a] border border-[#1d2132] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full">
                  <RecipientIcon type={sourceAccountType === "bank" ? "bank" : "wallet"} />
                  <div className="flex-1 min-w-0">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[20px] leading-[24px] truncate">
                      {sourceAccountType === "bank"
                        ? bankAcc?.nameOnAccount ?? "Bank Account"
                        : walletAcc?.address
                          ? truncAddr(walletAcc.address)
                          : "Your Wallet"}
                    </p>
                  </div>
                </div>
              </FieldRow>

              <FieldRow label="Sending To">
                <div className="bg-[#06070a] border border-[#1d2132] flex gap-[8px] h-[56px] items-center px-[16px] rounded-[16px] w-full">
                  <RecipientIcon type={state.recipientType!} />
                  <div className="flex-1 min-w-0">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[20px] leading-[24px] truncate">
                      {recipientLabel()}
                    </p>
                  </div>
                </div>
              </FieldRow>

              <div className="flex flex-col gap-[12px] bg-[#06070a] border border-[#1d2132] rounded-[16px] px-[16px] py-[16px]">
                <ReviewRow label="Amount" value={`$${parseFloat(state.amount || "0").toFixed(2)}`} />
                <div className="h-px bg-[#1d2132]" />
                <ReviewRow label="Network Fee" value={`$${FEE}`} />
                <div className="h-px bg-[#1d2132]" />
                <ReviewRow label="Total" value={`$${(parseFloat(state.amount || "0") + parseFloat(FEE)).toFixed(2)}`} highlight />
              </div>
            </>
          )}
        </div>

        {/* ── Buttons ────────────────────────────────────────────────────── */}
        <div className="flex gap-[16px] items-center px-[39px] pt-[24px] pb-[32px]">
          <button
            onClick={handleClose}
            className="bg-[#222737] flex-1 h-[48px] rounded-[100px] [font-family:'Mont',sans-serif] font-semibold text-[#6c779d] text-[18px] tracking-[-0.72px] hover:opacity-80 transition-opacity"
            data-testid="btn-send-cancel"
          >
            Cancel
          </button>
          {state.step < 4 ? (
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
